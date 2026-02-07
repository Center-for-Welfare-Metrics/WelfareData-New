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
   * Delete a file from storage
   * @param path - Path of the file to delete
   */
  delete(path: string): Promise<void>;
}
