import { EventEmitter } from "events";
import fs from "fs";
import path from "path";

export type JobType = "PDF_GENERATION" | "BULK_BILLING" | "WHATSAPP_BROADCAST" | "DATA_IMPORT" | "TEST_TASK";

export interface QueueJob<T = any> {
  id: string;
  ownerId: string;
  type: JobType;
  data: T;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  result?: any;
  error?: string;
  retryCount: number;
  maxRetries: number;
  lockedBy?: string;
  lockedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AddJobOptions {
  ownerId?: string;
  maxRetries?: number;
}

/**
 * Production Persistent & Crash-Resilient Background Job Queue
 * - Features Dual Persistence (Firestore Collection + Durable Local Disk Snapshot)
 * - Automatic Zombie / Stale Lock Recovery for container restarts (Render / Cloud Run)
 * - Controlled concurrency to prevent Node event loop starvation
 */
export class BackgroundJobQueue extends EventEmitter {
  private queue: QueueJob[] = [];
  private activeCount = 0;
  private maxConcurrency = 2;
  private jobsMap = new Map<string, QueueJob>();
  private handlers = new Map<
    JobType,
    (job: QueueJob, onProgress: (pct: number) => Promise<void> | void) => Promise<any>
  >();

  private getDbFn: (() => any) | null = null;
  private workerInstanceId: string;
  private lockTimeoutMs = 180000; // 3 minutes timeout for active jobs before lock recovery
  private storageFilePath: string;
  private recoveryInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  constructor(maxConcurrency = 2) {
    super();
    this.maxConcurrency = maxConcurrency;
    this.workerInstanceId = `worker_${process.pid}_${Math.random().toString(36).substring(2, 7)}`;
    this.storageFilePath = path.resolve(process.cwd(), ".background_jobs_cache.json");
  }

  public setDbGetter(fn: () => any) {
    this.getDbFn = fn;
  }

  /**
   * Initializes queue on server boot: loads persistent cache, recovers stale/interrupted jobs
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // 1. Hydrate from disk snapshot
    this.loadFromDisk();

    // 2. Hydrate & recover from Firestore if available
    await this.loadFromFirestore();

    // 3. Scan and recover any abandoned jobs from previous process lifetime
    await this.recoverZombies();

    // 4. Start periodic recovery heartbeat (every 30 seconds)
    if (!this.recoveryInterval) {
      this.recoveryInterval = setInterval(() => {
        this.recoverZombies().catch((e) => console.warn("[JobQueue] Periodic recovery error:", e));
      }, 30000);
      if (this.recoveryInterval.unref) {
        this.recoveryInterval.unref();
      }
    }

    // 5. Trigger processing if any pending jobs exist
    setImmediate(() => this.processNext());
    console.log(`[JobQueue] Initialized resilient queue (Worker: ${this.workerInstanceId}, In-Memory Jobs: ${this.jobsMap.size})`);
  }

  /**
   * Enqueue a new background task
   */
  public async addJob<T>(type: JobType, data: T, options?: AddJobOptions): Promise<QueueJob<T>> {
    const ownerId = options?.ownerId || "system";
    const maxRetries = options?.maxRetries !== undefined ? options.maxRetries : 3;

    const job: QueueJob<T> = {
      id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      ownerId,
      type,
      data,
      status: "pending",
      progress: 0,
      retryCount: 0,
      maxRetries,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.jobsMap.set(job.id, job);
    this.queue.push(job);
    this.emit("job:added", job);

    // Persist synchronously to local disk and asynchronously to Firestore
    this.saveToDisk();
    await this.persistJobToFirestore(job);

    // Kick processing loop
    setImmediate(() => this.processNext());

    this.pruneOldJobs();
    return job;
  }

  /**
   * Retrieve a job by ID (checks memory first, falls back to disk and Firestore)
   */
  public async getJob(id: string): Promise<QueueJob | null> {
    if (!id) return null;

    // Fast memory hit
    const inMem = this.jobsMap.get(id);
    if (inMem) return inMem;

    // Fallback: check Firestore
    if (this.getDbFn) {
      try {
        const db = this.getDbFn();
        if (db) {
          const doc = await db.collection("background_jobs").doc(id).get();
          if (doc.exists) {
            const raw = doc.data();
            const job: QueueJob = {
              id: raw.id || id,
              ownerId: raw.ownerId || "system",
              type: raw.type,
              data: typeof raw.data === "string" ? JSON.parse(raw.data) : raw.data,
              status: raw.status,
              progress: raw.progress || 0,
              result: raw.result ? (typeof raw.result === "string" ? JSON.parse(raw.result) : raw.result) : undefined,
              error: raw.error,
              retryCount: raw.retryCount || 0,
              maxRetries: raw.maxRetries || 3,
              lockedBy: raw.lockedBy,
              lockedAt: raw.lockedAt,
              createdAt: raw.createdAt || Date.now(),
              updatedAt: raw.updatedAt || Date.now(),
            };
            this.jobsMap.set(job.id, job);
            return job;
          }
        }
      } catch (err) {
        console.warn(`[JobQueue] Firestore lookup failed for job ${id}:`, err);
      }
    }

    return null;
  }

  /**
   * List jobs for a tenant
   */
  public async listJobs(ownerId?: string, status?: string, limit = 50): Promise<QueueJob[]> {
    const results: QueueJob[] = [];
    for (const job of this.jobsMap.values()) {
      if (ownerId && ownerId !== "system" && job.ownerId !== ownerId) continue;
      if (status && job.status !== status) continue;
      results.push(job);
    }

    results.sort((a, b) => b.createdAt - a.createdAt);
    return results.slice(0, limit);
  }

  /**
   * Update progress of an active job
   */
  public async updateProgress(jobId: string, progress: number, result?: any): Promise<void> {
    const job = this.jobsMap.get(jobId);
    if (!job) return;

    job.progress = Math.min(100, Math.max(0, progress));
    if (result !== undefined) job.result = result;
    job.updatedAt = Date.now();

    this.emit("job:progress", job);
    this.saveToDisk();
    await this.persistJobToFirestore(job);
  }

  /**
   * Cancel a pending job
   */
  public async cancelJob(jobId: string, ownerId?: string): Promise<boolean> {
    const job = this.jobsMap.get(jobId);
    if (!job) return false;
    if (ownerId && ownerId !== "system" && job.ownerId !== ownerId) return false;

    if (job.status === "pending") {
      job.status = "failed";
      job.error = "Cancelled by user";
      job.updatedAt = Date.now();

      // Remove from queue
      const idx = this.queue.findIndex((q) => q.id === jobId);
      if (idx !== -1) this.queue.splice(idx, 1);

      this.saveToDisk();
      await this.persistJobToFirestore(job);
      this.emit("job:cancelled", job);
      return true;
    }

    return false;
  }

  /**
   * Manually retry a failed job
   */
  public async retryJob(jobId: string, ownerId?: string): Promise<boolean> {
    const job = await this.getJob(jobId);
    if (!job) return false;
    if (ownerId && ownerId !== "system" && job.ownerId !== ownerId) return false;

    if (job.status === "failed") {
      job.status = "pending";
      job.progress = 0;
      job.error = undefined;
      job.retryCount = 0;
      job.updatedAt = Date.now();

      this.jobsMap.set(job.id, job);
      this.queue.push(job);

      this.saveToDisk();
      await this.persistJobToFirestore(job);
      setImmediate(() => this.processNext());
      return true;
    }

    return false;
  }

  /**
   * Register a worker implementation for a job type
   */
  public registerWorker<T>(
    type: JobType,
    handler: (job: QueueJob<T>, onProgress: (pct: number) => Promise<void> | void) => Promise<any>
  ) {
    this.handlers.set(type, handler);
  }

  /**
   * Core execution cycle
   */
  private async processNext() {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.activeCount++;
    job.status = "processing";
    job.lockedBy = this.workerInstanceId;
    job.lockedAt = Date.now();
    job.updatedAt = Date.now();

    this.emit("job:started", job);
    this.saveToDisk();
    await this.persistJobToFirestore(job);

    try {
      await new Promise((resolve) => setTimeout(resolve, 10));

      const handler = this.handlers.get(job.type);
      if (!handler) {
        throw new Error(`No worker registered for job type: ${job.type}`);
      }

      const result = await handler(job, async (progress) => {
        await this.updateProgress(job.id, progress);
      });

      job.status = "completed";
      job.progress = 100;
      job.result = result;
      job.lockedBy = undefined;
      job.lockedAt = undefined;
      job.updatedAt = Date.now();

      this.emit("job:completed", job);
      this.saveToDisk();
      await this.persistJobToFirestore(job);
    } catch (err: any) {
      job.retryCount = (job.retryCount || 0) + 1;

      if (job.retryCount < job.maxRetries) {
        console.warn(`[JobQueue] Job ${job.id} failed attempt ${job.retryCount}/${job.maxRetries}. Re-queuing... Error:`, err?.message || err);
        job.status = "pending";
        job.lockedBy = undefined;
        job.lockedAt = undefined;
        job.error = `Attempt ${job.retryCount} failed: ${err?.message || err}`;
        job.updatedAt = Date.now();
        this.queue.push(job);
      } else {
        job.status = "failed";
        job.lockedBy = undefined;
        job.lockedAt = undefined;
        job.error = err?.message || String(err);
        job.updatedAt = Date.now();
        console.error(`[JobQueue] Job ${job.id} (${job.type}) failed permanently:`, err);
        this.emit("job:failed", job);
      }

      this.saveToDisk();
      await this.persistJobToFirestore(job);
    } finally {
      this.activeCount--;
      setImmediate(() => this.processNext());
    }
  }

  /**
   * Recovers jobs that were left in 'processing' state when the server previously stopped/crashed
   */
  public async recoverZombies(): Promise<void> {
    const now = Date.now();

    // Check in-memory/disk jobs
    for (const job of this.jobsMap.values()) {
      if (job.status === "processing") {
        const lockAge = now - (job.lockedAt || job.updatedAt);
        // If locked by another worker or lock timed out
        if (job.lockedBy !== this.workerInstanceId || lockAge > this.lockTimeoutMs) {
          if (job.retryCount < job.maxRetries) {
            console.log(`[JobQueue] Reclaiming stale zombie job ${job.id} (locked ${Math.round(lockAge / 1000)}s ago). Re-enqueuing...`);
            job.status = "pending";
            job.lockedBy = undefined;
            job.lockedAt = undefined;
            job.retryCount += 1;
            job.updatedAt = now;
            if (!this.queue.some((q) => q.id === job.id)) {
              this.queue.push(job);
            }
          } else {
            console.warn(`[JobQueue] Zombie job ${job.id} exceeded max retries. Marking failed.`);
            job.status = "failed";
            job.lockedBy = undefined;
            job.lockedAt = undefined;
            job.error = "Worker terminated unexpectedly and max retries were exceeded.";
            job.updatedAt = now;
          }
          this.saveToDisk();
          await this.persistJobToFirestore(job);
        }
      }
    }

    // Check Firestore for remote zombie jobs if available
    if (this.getDbFn) {
      try {
        const db = this.getDbFn();
        if (db) {
          const snap = await db
            .collection("background_jobs")
            .where("status", "==", "processing")
            .limit(20)
            .get();

          for (const doc of snap.docs) {
            const data = doc.data();
            const lockAge = now - (data.lockedAt || data.updatedAt || 0);
            if (lockAge > this.lockTimeoutMs && !this.jobsMap.has(doc.id)) {
              console.log(`[JobQueue] Restoring orphaned remote job ${doc.id} from Firestore into queue.`);
              const job: QueueJob = {
                id: doc.id,
                ownerId: data.ownerId || "system",
                type: data.type,
                data: typeof data.data === "string" ? JSON.parse(data.data) : data.data,
                status: "pending",
                progress: 0,
                retryCount: (data.retryCount || 0) + 1,
                maxRetries: data.maxRetries || 3,
                createdAt: data.createdAt || now,
                updatedAt: now,
              };
              this.jobsMap.set(job.id, job);
              this.queue.push(job);
              await this.persistJobToFirestore(job);
            }
          }
        }
      } catch (e) {
        // quiet ignore if query fails
      }
    }
  }

  private async persistJobToFirestore(job: QueueJob): Promise<void> {
    if (!this.getDbFn) return;
    try {
      const db = this.getDbFn();
      if (!db) return;

      const serialized = {
        id: job.id,
        ownerId: job.ownerId,
        type: job.type,
        status: job.status,
        progress: job.progress,
        data: typeof job.data === "object" ? JSON.stringify(job.data) : String(job.data),
        result: job.result ? (typeof job.result === "object" ? JSON.stringify(job.result) : String(job.result)) : null,
        error: job.error || null,
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
        lockedBy: job.lockedBy || null,
        lockedAt: job.lockedAt || null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      };

      await db.collection("background_jobs").doc(job.id).set(serialized, { merge: true });
    } catch (e: any) {
      console.warn(`[JobQueue] Failed to persist job ${job.id} to Firestore:`, e?.message || e);
    }
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, "utf8");
        const list: QueueJob[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const item of list) {
            this.jobsMap.set(item.id, item);
            if (item.status === "pending") {
              this.queue.push(item);
            }
          }
        }
      }
    } catch (e) {
      console.warn("[JobQueue] Failed to parse local jobs snapshot file:", e);
    }
  }

  private saveToDisk() {
    try {
      const list = Array.from(this.jobsMap.values()).slice(-200);
      fs.writeFileSync(this.storageFilePath, JSON.stringify(list, null, 2), "utf8");
    } catch (e) {
      console.warn("[JobQueue] Failed to write local jobs snapshot:", e);
    }
  }

  private async loadFromFirestore() {
    if (!this.getDbFn) return;
    try {
      const db = this.getDbFn();
      if (!db) return;

      const snap = await db
        .collection("background_jobs")
        .where("status", "in", ["pending", "processing"])
        .limit(100)
        .get();

      for (const doc of snap.docs) {
        const raw = doc.data();
        if (!this.jobsMap.has(doc.id)) {
          const job: QueueJob = {
            id: doc.id,
            ownerId: raw.ownerId || "system",
            type: raw.type,
            data: typeof raw.data === "string" ? JSON.parse(raw.data) : raw.data,
            status: raw.status,
            progress: raw.progress || 0,
            result: raw.result ? (typeof raw.result === "string" ? JSON.parse(raw.result) : raw.result) : undefined,
            error: raw.error,
            retryCount: raw.retryCount || 0,
            maxRetries: raw.maxRetries || 3,
            lockedBy: raw.lockedBy,
            lockedAt: raw.lockedAt,
            createdAt: raw.createdAt || Date.now(),
            updatedAt: raw.updatedAt || Date.now(),
          };
          this.jobsMap.set(job.id, job);
          if (job.status === "pending") {
            this.queue.push(job);
          }
        }
      }
    } catch (e) {
      // quiet fallback
    }
  }

  private pruneOldJobs() {
    const twoHoursAgo = Date.now() - 7200000;
    for (const [id, job] of this.jobsMap.entries()) {
      if (job.updatedAt < twoHoursAgo && (job.status === "completed" || job.status === "failed")) {
        this.jobsMap.delete(id);
      }
    }
  }
}

export const backgroundQueue = new BackgroundJobQueue(2);
