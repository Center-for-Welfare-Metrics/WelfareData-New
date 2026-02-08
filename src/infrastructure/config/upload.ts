import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';

/**
 * Multer configuration for SVG file uploads
 * Uses MemoryStorage to provide buffer for Puppeteer processing
 */

// File size limit: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed MIME types for SVG files
const ALLOWED_MIME_TYPES = ['image/svg+xml'];

/**
 * File filter to accept only SVG files
 */
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback
): void => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    callback(null, true);
  } else {
    callback(new Error(`Invalid file type. Only SVG files are allowed. Received: ${file.mimetype}`));
  }
};

/**
 * Multer instance configured for SVG uploads
 * - MemoryStorage: Stores file in buffer (required for Puppeteer processing)
 * - Single file upload with field name 'file'
 * - Max size: 10MB
 */
export const uploadSvg = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter,
});

/**
 * Middleware for single SVG file upload
 * Use: router.post('/', uploadSvgMiddleware, controller.create)
 */
export const uploadSvgMiddleware = uploadSvg.single('file');

/**
 * Error messages for upload failures
 */
export const UPLOAD_ERRORS = {
  FILE_TOO_LARGE: 'File too large. Maximum size is 10MB.',
  INVALID_TYPE: 'Invalid file type. Only SVG files are allowed.',
  NO_FILE: 'No file uploaded. Please provide an SVG file.',
};
