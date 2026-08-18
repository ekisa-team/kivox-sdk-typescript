import type { ApiSchema } from '../schemas';

/** Binary payload accepted for upload. */
export type FileData = Blob | ArrayBuffer | ArrayBufferView;

/** Progress reported during an upload or download. */
export interface FileTransferProgress {
    /** Bytes transferred so far. */
    loadedBytes: number;
    /** Total bytes expected. */
    totalBytes: number;
    /** 0–100, or `undefined` if `totalBytes` couldn't be determined ahead of time. */
    percent: number | undefined;
}

/** Callback that reports the current file transfer progress */
export type OnFileTransferProgress = (progress: FileTransferProgress) => void;

/** Options for getting a file by ID. */
export interface GetFileOptions {
    fileId: string;
    signal?: AbortSignal;
}

/** Options for waiting for a file to be ready. */
export interface WaitUntilReadyOptions {
    fileId: string;
    /** Maximum time to poll in milliseconds. Defaults to 30,000 (30 seconds). */
    timeoutMs?: number;
    /** Polling interval in milliseconds. Defaults to 750ms. */
    pollIntervalMs?: number;
    signal?: AbortSignal;
}

/** Options for uploading a file. */
export interface UploadFileOptions {
    workspaceId: string;
    purpose: ApiSchema<'File'>['purpose'];
    filename: string;
    mimeType: string;
    /** The bytes to upload. In browsers, typically a `File`. In Node/Bun, typically a `Buffer`/`ArrayBuffer`/`Blob`. */
    data: FileData;
    /**
     * Byte size of `data`. Optional when it can be derived from `data`
     * (`ArrayBuffer`, `ArrayBufferView`, or a `Blob` with a known `.size`).
     * Required for inputs where size cannot be determined (e.g. some streams).
     */
    sizeBytes?: number;
    /** Optional client-computed checksum, persisted for integrity verification. */
    checksumSha256?: string;
    /**
     * If `true`, `upload()` will block until text extraction is complete (`extraction_status === 'ready'`).
     * It's recommended when uploading documents (PDFs, DOCX) to attach to chat messages immediately.
     * Defaults to `false`.
     */
    waitUntilReady?: boolean;
    /** Options passed to polling if `waitUntilReady: true`. */
    waitOptions?: Omit<WaitUntilReadyOptions, 'fileId' | 'signal'>;
    onProgress?: OnFileTransferProgress;
    signal?: AbortSignal;
}

/** Options for downloading a file. */
export interface DownloadFileOptions {
    fileId: string;
    onProgress?: OnFileTransferProgress;
    signal?: AbortSignal;
}

/** Result of downloading a file. */
export interface DownloadedFile {
    file: ApiSchema<'File'>;
    data: ArrayBuffer;
}

/** Options for getting a download URL for a file. */
export interface GetDownloadUrlOptions {
    fileId: string;
    signal?: AbortSignal;
}

/** A file record plus a short-lived URL for downloading its contents directly. */
export interface SignedDownloadUrl extends ApiSchema<'File'> {
    signedUrl: string;
    signedUrlExpiresAt: string;
}

/** Options for deleting a file. */
export interface DeleteFileOptions {
    fileId: string;
    signal?: AbortSignal;
}

/** Configuration for a `KivoxFiles` instance. */
export interface KivoxFilesOptions {
    /** HTTP attempts per request to Azure Blob Storage before giving up. Defaults to `1` (no retries). */
    maxTriesPerRequest?: number;
    /** Size, in bytes, of each staged block for large uploads. Defaults to 8 MiB. */
    blockSizeBytes?: number;
    /** Number of blocks uploaded in parallel for large uploads. Defaults to `4`. */
    concurrency?: number;
}
