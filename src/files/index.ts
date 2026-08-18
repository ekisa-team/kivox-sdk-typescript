/**
 * @module
 * File management and uploading utilities for @kivox/sdk.
 * Contains clients and types for Blob Storage interactions.
 */

export { KivoxFiles } from './client';
export { KivoxFilesError as KivoxFileError, type KivoxFilesErrorStage as FileErrorStage } from './errors';
export * from './policy';
export type {
    DeleteFileOptions,
    DownloadFileOptions,
    DownloadedFile,
    FileData,
    FileTransferProgress,
    GetDownloadUrlOptions,
    OnFileTransferProgress,
    SignedDownloadUrl,
    UploadFileOptions,
} from './types';
