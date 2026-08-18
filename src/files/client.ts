import { Kivox, type ApiSchema } from '../index';
import { KivoxFilesError, toKivoxFilesError } from './errors';
import { blobClientFor, blockBlobClientFor } from './internal/blob-clients';
import { downloadResponseToArrayBuffer } from './internal/response-body';
import { resolveUploadBody } from './internal/upload-body';
import type {
    DeleteFileOptions,
    DownloadedFile,
    DownloadFileOptions,
    GetDownloadUrlOptions,
    GetFileOptions,
    KivoxFilesOptions,
    SignedDownloadUrl,
    UploadFileOptions,
    WaitUntilReadyOptions,
} from './types';

const DEFAULT_BLOCK_SIZE_BYTES = 8 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_POLL_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 750;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            return reject(signal.reason);
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(signal.reason);
        });
    });
}

/**
 * Upload, download, and delete files in a Kivox workspace.
 *
 * File contents move directly between the caller and Azure Blob Storage via
 * short-lived signed URLs. The Kivox API itself never sees file bytes.
 * Large uploads are staged as parallel blocks automatically; small ones go
 * up in a single request. Instantiate once per {@link Kivox} and reuse it.
 *
 * @example
 * ```ts
 * const files = new KivoxFiles(kivox);
 *
 * const file = await files.upload({
 *   workspaceId,
 *   filename: 'report.pdf',
 *   mimeType: 'application/pdf',
 *   data: pdfBytes,
 *   sizeBytes: pdfBytes.size,
 *   onProgress: ({ percent }) => console.log(`${percent?.toFixed(0)}%`),
 * });
 * ```
 */
export class KivoxFiles {
    private readonly options: Required<KivoxFilesOptions>;

    constructor(
        private readonly client: Kivox,
        options: KivoxFilesOptions = {},
    ) {
        this.options = {
            maxTriesPerRequest: options.maxTriesPerRequest ?? 1,
            blockSizeBytes: options.blockSizeBytes ?? DEFAULT_BLOCK_SIZE_BYTES,
            concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
        };
    }

    /**
     * Fetches a file's metadata record.
     *
     * @throws {KivoxFilesError} if the request fails.
     */
    async get(options: GetFileOptions): Promise<ApiSchema<'File'>> {
        const { data, error } = await this.client.GET('/v1/files/{file_id}', {
            params: {
                path: { file_id: options.fileId },
            },
            signal: options.signal,
        });

        if (error || !data) {
            throw toKivoxFilesError('get', options.fileId, error);
        }

        return data;
    }

    /**
     * Polls the file endpoint until the file reaches a terminal state (`status === 'ready'`).
     *
     * @throws {KivoxFilesError} if the file lands in a failed status (`'extraction'`),
     * times out (`'wait-until-ready'`), or the signal aborts.
     */
    async waitUntilReady(options: WaitUntilReadyOptions): Promise<ApiSchema<'File'>> {
        const {
            fileId,
            timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
            pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
            signal,
        } = options;
        const start = Date.now();

        while (Date.now() - start < timeoutMs) {
            if (signal?.aborted) {
                throw toKivoxFilesError('wait-until-ready', fileId, signal.reason);
            }

            const file = await this.get({ fileId, signal });

            if (file.status === 'ready') {
                return file;
            }

            if (file.status === 'upload_failed' || file.status === 'processing_failed') {
                throw new KivoxFilesError(
                    `File processing failed: ${file.failure_reason ?? 'unknown reason'}`,
                    'extraction',
                    fileId,
                );
            }

            // pending / uploading / uploaded / extracting -> keep polling
            await sleep(pollIntervalMs, signal);
        }

        throw new KivoxFilesError(`File text extraction timed out after ${timeoutMs}ms`, 'wait-until-ready', fileId);
    }

    /**
     * Uploads a file to a workspace.
     *
     * If `waitUntilReady: true` is passed, this method will block until background text extraction finishes.
     *
     * @throws {KivoxFilesError} if any step fails.
     */
    async upload(options: UploadFileOptions): Promise<ApiSchema<'File'>> {
        const {
            workspaceId,
            purpose,
            filename,
            mimeType,
            data,
            checksumSha256,
            onProgress,
            signal,
            waitUntilReady,
            waitOptions,
        } = options;

        const { body, size: sizeBytes } = await resolveUploadBody(data, options.sizeBytes);

        const { data: created, error: createError } = await this.client.POST(
            '/v1/workspaces/{workspace_id}/files/upload-url',
            {
                params: {
                    path: { workspace_id: workspaceId },
                },
                body: {
                    purpose,
                    filename,
                    mime_type: mimeType,
                    size_bytes: sizeBytes,
                    checksum_sha256: checksumSha256,
                },
                signal,
            },
        );

        if (createError || !created) {
            throw toKivoxFilesError('create-upload-url', undefined, createError);
        }

        try {
            const blobClient = blockBlobClientFor(created.signed_url, this.options);
            await blobClient.uploadData(body, {
                blobHTTPHeaders: { blobContentType: mimeType },
                blockSize: this.options.blockSizeBytes,
                concurrency: this.options.concurrency,
                abortSignal: signal,
                onProgress: (event) =>
                    onProgress?.({
                        loadedBytes: event.loadedBytes,
                        totalBytes: sizeBytes,
                        percent: sizeBytes > 0 ? Math.min(100, (event.loadedBytes / sizeBytes) * 100) : undefined,
                    }),
            });
        } catch (uploadError) {
            const wrapped = toKivoxFilesError('upload', created.id, uploadError);
            await this.reportStatus(created.id, 'failed', wrapped.message).catch((reportError) =>
                console.error(`Failed to report upload failure for file ${created.id}:`, reportError),
            );
            throw wrapped;
        }

        const file = await this.reportStatus(created.id, 'ready');

        if (waitUntilReady) {
            return this.waitUntilReady({
                fileId: file.id,
                signal,
                ...waitOptions,
            });
        }

        return file;
    }

    /**
     * Requests a short-lived signed URL for downloading a file directly.
     */
    async getDownloadUrl(options: GetDownloadUrlOptions): Promise<SignedDownloadUrl> {
        const { data, error } = await this.client.POST('/v1/files/{file_id}/download-url', {
            params: {
                path: { file_id: options.fileId },
            },
            signal: options.signal,
        });

        if (error || !data) {
            throw toKivoxFilesError('download', options.fileId, error);
        }

        const { signed_url, signed_url_expires_at, ...file } = data;

        return {
            ...file,
            signedUrl: signed_url,
            signedUrlExpiresAt: signed_url_expires_at,
        };
    }

    /**
     * Downloads a file's full contents into memory.
     */
    async download(options: DownloadFileOptions): Promise<DownloadedFile> {
        const { fileId, onProgress, signal } = options;
        const signedFile = await this.getDownloadUrl({ fileId, signal });

        try {
            const blobClient = blobClientFor(signedFile.signedUrl, this.options);
            const response = await blobClient.download(undefined, undefined, { abortSignal: signal });
            const totalBytes = response.contentLength ?? signedFile.size_bytes;

            const data = await downloadResponseToArrayBuffer(response, (loadedBytes) =>
                onProgress?.({
                    loadedBytes,
                    totalBytes,
                    percent: totalBytes > 0 ? Math.min(100, (loadedBytes / totalBytes) * 100) : undefined,
                }),
            );

            const { signedUrl: _signedUrl, signedUrlExpiresAt: _expiresAt, ...file } = signedFile;
            return { file, data };
        } catch (downloadError) {
            throw toKivoxFilesError('download', fileId, downloadError);
        }
    }

    /**
     * Deletes a file's metadata record and its underlying blob storage object.
     */
    async delete(options: DeleteFileOptions): Promise<void> {
        const { error } = await this.client.DELETE('/v1/files/{file_id}', {
            params: {
                path: { file_id: options.fileId },
            },
            signal: options.signal,
        });

        if (error) {
            throw toKivoxFilesError('delete', options.fileId, error);
        }
    }

    /**
     * Reports blob upload status (`upload_status`) back to the API.
     */
    private async reportStatus(
        fileId: string,
        status: 'ready' | 'failed',
        failureReason?: string,
    ): Promise<ApiSchema<'File'>> {
        const { data, error } = await this.client.PATCH('/v1/files/{file_id}', {
            params: {
                path: { file_id: fileId },
            },
            body: {
                upload_status: status,
                failure_reason: failureReason,
            },
        });

        if (error || !data) {
            throw toKivoxFilesError('status-report', fileId, error);
        }

        return data;
    }
}
