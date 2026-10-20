import express from "express";
import { CloudStorageService } from "../services/storage.ts";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.ts";

export function createStorageRouter(getDb: () => any) {
  const router = express.Router();

  // Upload receipt endpoint (persists in cloud database/storage)
  router.post("/upload-receipt", async (req, res) => {
    try {
      const { image, ownerId, customerId } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Missing image data" });
      }

      const db = getDb();
      const result = await CloudStorageService.saveBinary(
        db,
        ownerId || "system",
        image,
        `receipt_${customerId || "unknown"}_${Date.now()}.png`
      );

      return res.json({
        success: true,
        imageUrl: image, // Returns base64 or storage url
        storageId: result.id,
        url: result.url,
      });
    } catch (err: any) {
      console.error("[StorageRouter] upload-receipt error:", err);
      return res.status(500).json({ error: err.message || "Failed to upload receipt" });
    }
  });

  // Generic Image upload (Protected by requireAuth)
  router.post("/upload-image", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { ownerId, base64Image, image, folder, fileName, type } = req.body;
      const imgData = base64Image || image;
      const targetOwner = ownerId || req.ownerId || "general";
      if (!imgData) {
        return res.status(400).json({ error: "No image provided" });
      }

      // If already a valid HTTPS URL, return immediately
      if (typeof imgData === 'string' && (imgData.startsWith('http://') || imgData.startsWith('https://'))) {
        return res.json({ success: true, imageUrl: imgData, fileUrl: imgData, url: imgData });
      }

      // Try uploading to Google Cloud Storage bucket via admin SDK
      try {
        const adminModule = await import("firebase-admin");
        const adminInstance = adminModule.default || adminModule;
        const bucket = adminInstance.storage().bucket();

        const targetFolder = folder || type || 'images';
        const fileId = fileName || `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        let contentType = "image/jpeg";
        let extension = "jpg";
        if (typeof imgData === 'string' && imgData.startsWith("data:")) {
          const mime = imgData.split(";")[0].split(":")[1];
          if (mime) {
            contentType = mime;
            if (mime.includes("png")) extension = "png";
            else if (mime.includes("webp")) extension = "webp";
            else if (mime.includes("pdf")) extension = "pdf";
          }
        }

        const filePath = `${targetFolder}/${targetOwner}/${fileId}.${extension}`;
        const file = bucket.file(filePath);

        const base64Data = imgData.split(";base64,").pop() || imgData;
        const buffer = Buffer.from(base64Data, "base64");

        await file.save(buffer, {
          metadata: {
            contentType,
            cacheControl: 'public, max-age=31536000, immutable'
          },
        });

        const signedUrls = await file.getSignedUrl({
          action: "read",
          expires: "01-01-2499",
        });

        return res.json({
          success: true,
          imageUrl: signedUrls[0],
          fileUrl: signedUrls[0],
          url: signedUrls[0],
          filePath
        });
      } catch (gcsErr) {
        console.warn("[StorageRouter] GCS bucket upload failed, using Firestore binary fallback:", gcsErr);
        const db = getDb();
        const result = await CloudStorageService.saveBinary(
          db,
          targetOwner,
          imgData,
          `${folder || type || "image"}_${Date.now()}.png`
        );
        return res.json({
          success: true,
          imageUrl: result.url,
          fileUrl: result.url,
          url: result.url,
          storageId: result.id,
        });
      }
    } catch (err: any) {
      console.error("[StorageRouter] upload-image error:", err);
      return res.status(500).json({ error: err.message || "Failed to upload image" });
    }
  });

  // Delete Image Endpoint (Protected by requireAuth)
  router.post("/delete-image", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { url, storageId } = req.body;
      const db = getDb();
      if (storageId && db?.collection) {
        await db.collection("stored_binaries").doc(storageId).delete();
      }
      return res.json({ success: true, message: "Asset cleaned up successfully" });
    } catch (err: any) {
      console.error("[StorageRouter] delete-image error:", err);
      return res.status(500).json({ error: err.message || "Failed to delete image" });
    }
  });

  // Serve stored binary
  router.get("/storage/file/:id", async (req, res) => {
    try {
      const db = getDb();
      const binary = await CloudStorageService.getBinary(db, req.params.id);
      if (!binary) {
        return res.status(404).send("File not found");
      }

      const { buffer, mimeType } = CloudStorageService.validateBase64(binary.dataUrl);
      if (!buffer) {
        return res.status(500).send("Corrupt file data");
      }

      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.send(buffer);
    } catch (err: any) {
      return res.status(500).send(err.message || "Server Error");
    }
  });

  return router;
}
