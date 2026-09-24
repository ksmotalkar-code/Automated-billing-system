import { EventEmitter } from "events";

export type JobType = "PDF_GENERATION" | "BULK_BILLING" | "WHATSAPP_BROADCAST" | "DATA_IMPORT";

export interface QueueJob<T = any> {
  id: string;
  type: JobType;
  data: T;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  result?: any;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * In-process Non-blocking Background Worker Queue
 * Designed for single-instance container architectures (e.g. Render, Cloud Run)
 * Prevents synchronous CPU spikes by pacing heavy workloads with concurrency limits.
 */
class BackgroundJobQueue extends EventEmitter {
  private queue: QueueJob[] = [];
  private activeCount = 0;
  private maxConcurrency = 2;
  private jobsMap = new Map<string, QueueJob>();

  constructor(maxConcurrency = 2) {
    super();
    this.maxConcurrency = maxConcurrency;
  }

  public addJob<T>(type: JobType, data: T): QueueJob<T> {
    const job: QueueJob<T> = {
      id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      type,
      data,
      status: "pending",
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.jobsMap.set(job.id, job);
    this.queue.push(job);
    this.emit("job:added", job);

    // Trigger queue processing asynchronously
    setImmediate(() => this.processNext());

    // Prune jobs older than 1 hour to prevent memory bloat
    this.pruneOldJobs();

    return job;
  }

  public getJob(id: string): QueueJob | undefined {
    return this.jobsMap.get(id);
  }

  public updateProgress(jobId: string, progress: number, result?: any) {
    const job = this.jobsMap.get(jobId);
    if (job) {
      job.progress = Math.min(100, Math.max(0, progress));
      if (result !== undefined) job.result = result;
      job.updatedAt = Date.now();
      this.emit("job:progress", job);
    }
  }

  private async processNext() {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.activeCount++;
    job.status = "processing";
    job.updatedAt = Date.now();
    this.emit("job:started", job);

    try {
      // Yield to the Node.js event loop before execution
      await new Promise((resolve) => setTimeout(resolve, 10));

      const handler = this.handlers.get(job.type);
      if (!handler) {
        throw new Error(`No worker registered for job type: ${job.type}`);
      }

      const result = await handler(job, (progress) => {
        this.updateProgress(job.id, progress);
      });

      job.status = "completed";
      job.progress = 100;
      job.result = result;
      job.updatedAt = Date.now();
      this.emit("job:completed", job);
    } catch (err: any) {
      job.status = "failed";
      job.error = err?.message || String(err);
      job.updatedAt = Date.now();
      console.error(`[JobQueue] Job ${job.id} (${job.type}) failed:`, err);
      this.emit("job:failed", job);
    } finally {
      this.activeCount--;
      setImmediate(() => this.processNext());
    }
  }

  private handlers = new Map<
    JobType,
    (job: QueueJob, onProgress: (pct: number) => void) => Promise<any>
  >();

  public registerWorker<T>(
    type: JobType,
    handler: (job: QueueJob<T>, onProgress: (pct: number) => void) => Promise<any>
  ) {
    this.handlers.set(type, handler);
  }

  private pruneOldJobs() {
    const oneHourAgo = Date.now() - 3600000;
    for (const [id, job] of this.jobsMap.entries()) {
      if (job.updatedAt < oneHourAgo && (job.status === "completed" || job.status === "failed")) {
        this.jobsMap.delete(id);
      }
    }
  }
}

export const backgroundQueue = new BackgroundJobQueue(2);
