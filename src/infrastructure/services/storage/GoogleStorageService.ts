import { Storage, Bucket } from '@google-cloud/storage';
import { IStorageService } from '../../../application/interfaces/IStorageService';

/**
 * Google Cloud Storage Service
 * 
 * Implements storage operations for Google Cloud Storage.
 * Replicates the legacy src/storage/google-storage.ts logic adapted for Clean Architecture.
 */
export class GoogleStorageService implements IStorageService {
  private storage: Storage;
  private bucket: Bucket;
  private bucketName: string;

  constructor() {
    const bucketName = process.env.GCS_BUCKET_NAME;

    if (!bucketName) {
      throw new Error(
        'FATAL: Missing Google Cloud Storage configuration. ' +
        'Required env var: GCS_BUCKET_NAME'
      );
    }

    this.storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
    });

    this.bucketName = bucketName;
    this.bucket = this.storage.bucket(bucketName);
  }

  /**
   * Upload a file to Google Cloud Storage
   * @param file - Buffer containing file data
   * @param path - Destination path in the bucket
   * @param mimeType - MIME type of the file
   * @returns Public URL of the uploaded file
   */
  async upload(file: Buffer, path: string, mimeType: string): Promise<string> {
    const gcsFile = this.bucket.file(path);

    // Upload the file with specified content type
    // resumable: false is recommended for small files (< 10MB)
    await gcsFile.save(file, {
      contentType: mimeType,
      resumable: false,
      metadata: {
        cacheControl: 'public, max-age=31536000', // 1 year cache
      },
    });

    // Make the file publicly accessible
    // CRITICAL: Required for frontend to access the files directly
    // await gcsFile.makePublic();

    // Return the public URL
    const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${path}`;
    return publicUrl;
  }

  /**
   * Delete a file from Google Cloud Storage
   * @param path - Path of the file to delete
   */
  async delete(path: string): Promise<void> {
    try {
      const gcsFile = this.bucket.file(path);
      await gcsFile.delete();
    } catch (error: any) {
      // Silently ignore if file doesn't exist (404)
      // This prevents errors when cleaning up files that were never uploaded
      if (error.code !== 404) {
        throw error;
      }
    }
  }

  /**
   * Delete multiple files with a common prefix
   * Useful for cleaning up all files of a processogram
   * @param prefix - Path prefix to match (e.g., 'processograms/bovino/fattening/flow-1/')
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    try {
      await this.bucket.deleteFiles({
        prefix,
        force: true, // Don't throw if some files fail
      });
    } catch (error: any) {
      // Log but don't throw - cleanup failures shouldn't break the app
      console.error(`Warning: Failed to delete files with prefix ${prefix}:`, error.message);
    }
  }

  /**
   * Check if a file exists in the bucket
   * @param path - Path of the file to check
   * @returns true if file exists, false otherwise
   */
  async exists(path: string): Promise<boolean> {
    try {
      const [exists] = await this.bucket.file(path).exists();
      return exists;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let storageInstance: GoogleStorageService | null = null;

/**
 * Get the singleton instance of GoogleStorageService
 * Lazy initialization to avoid errors if env vars are not set
 */
export function getStorageService(): GoogleStorageService {
  if (!storageInstance) {
    storageInstance = new GoogleStorageService();
  }
  return storageInstance;
}

/**
 * Check if storage is configured
 * Use this to conditionally enable features that require storage
 */
export function isStorageConfigured(): boolean {
  return !!process.env.GCS_BUCKET_NAME;
}
