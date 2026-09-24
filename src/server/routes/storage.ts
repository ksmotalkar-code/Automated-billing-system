import express from "express";
import { CloudStorageService } from "../services/storage.ts";

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

  // Generic Image upload (persists in cloud database/storage)
  router.post("/upload-image", async (req, res) => {
    try {
      const { image, type, ownerId } = req.body;
      if (!image) {
        return res.status(400).json({ error: "No image provided" });
      }

      const db = getDb();
      const result = await CloudStorageService.saveBinary(
        db,
        ownerId || "system",
        image,
        `${type || "image"}_${Date.now()}.png`
      );

      return res.json({
        success: true,
        url: image, // Returns data URL or storage endpoint
        storageId: result.id,
        fileUrl: result.url,
      });
    } catch (err: any) {
      console.error("[StorageRouter] upload-image error:", err);
      return res.status(500).json({ error: err.message || "Failed to upload image" });
    }
  });

  // Delete Image Endpoint
  router.post("/delete-image", async (req, res) => {
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
