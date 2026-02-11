/**
 * Interface for Storage Service
 * 
 * Abstraction for cloud storage operations.
 * Implementations can be Google Cloud Storage, AWS S3, Azure Blob, etc.
 */
export interface IStorageService {
  /**
   * Upload a file to storage
   * @param file - Buffer containing file data
   * @param path - Destination path in the bucket (e.g., 'processograms/bovino/fattening/image.png')
   * @param mimeType - MIME type of the file (e.g., 'image/png', 'image/svg+xml')
   * @returns Public URL of the uploaded file
   */
  upload(file: Buffer, path: string, mimeType: string): Promise<string>;

  /**
   * Delete a file from storage by its relative path
   * @param path - Path of the file to delete
   */
  delete(path: string): Promise<void>;

  /**
   * Delete a file from storage by its public URL
   * Extracts the relative path from the URL before deleting.
   * Idempotent: does not throw if file doesn't exist.
   * @param fileUrl - Public URL of the file to delete
   */
  deleteByUrl(fileUrl: string): Promise<void>;

  /**
   * Download a file from storage as a UTF-8 string
   * @param fileUrl - Public URL of the file to download
   * @returns File content as string
   */
  downloadAsText(fileUrl: string): Promise<string>;
}
