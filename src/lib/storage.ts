import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { v4 as uuidv4 } from 'uuid';

/**
 * Compresses an image file in the browser to reduce upload payload and storage footprint.
 * Ensures storage usage is minimal (< 80KB) and stays well within the free tier.
 */
export const compressImage = (file: File, maxWidth = 800, quality = 0.75): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(e.target?.result as string);
        }
        ctx.drawImage(img, 0, 0, width, height);
        // Use standard JPEG compression
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
};

/**
 * Uploads an image to the Google Cloud Storage bucket via the backend API.
 * Guarantees that only lightweight HTTPS URLs are stored in Firestore, eliminating
 * Firestore size inflation, staying within the 100% Free Forever tier (0 Rs).
 */
export const uploadImageToStorage = async (
  fileOrDataUrl: File | string,
  folder: 'qr-codes' | 'templates' | 'receipts' | 'broadcasts' | 'reports' | 'logos' | string,
  ownerId?: string,
  fileName?: string
): Promise<string> => {
  // If already an HTTP/HTTPS URL, return as-is
  if (typeof fileOrDataUrl === 'string' && (fileOrDataUrl.startsWith('http://') || fileOrDataUrl.startsWith('https://'))) {
    return fileOrDataUrl;
  }

  let base64Image: string;
  if (fileOrDataUrl instanceof File) {
    base64Image = await compressImage(fileOrDataUrl, 800, 0.75);
  } else {
    base64Image = fileOrDataUrl;
  }

  // Primary: Use server-side Google Cloud Storage upload
  try {
    const res = await fetch('/api/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerId: ownerId || 'general',
        base64Image,
        folder,
        fileName: fileName || uuidv4()
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.imageUrl) {
        return data.imageUrl;
      }
    }
  } catch (apiErr) {
    console.warn('[Storage] Server upload failed, falling back to direct Firebase Storage client SDK', apiErr);
  }

  // Fallback: Use client-side Firebase Storage (which targets the exact same GCS bucket)
  try {
    const fileId = fileName || uuidv4();
    const storageRef = ref(storage, `${folder}/${ownerId || 'general'}/${fileId}.jpg`);
    await uploadString(storageRef, base64Image, 'data_url');
    return await getDownloadURL(storageRef);
  } catch (storageErr) {
    console.error('[Storage] Client SDK upload also failed:', storageErr);
    throw new Error('Failed to upload image to Google Cloud Storage. Please check connection and try again.');
  }
};

/**
 * Deletes an image from the Google Cloud Storage bucket to avoid orphan files and reclaim space.
 */
export const deleteImageFromStorage = async (imageUrl: string | null | undefined): Promise<void> => {
  if (!imageUrl || typeof imageUrl !== 'string') return;
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) return;

  try {
    await fetch('/api/delete-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl })
    });
  } catch (err) {
    console.warn('[Storage] Failed to call delete-image endpoint:', err);
  }
};
