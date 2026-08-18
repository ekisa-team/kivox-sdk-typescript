import { RestError } from '@azure/storage-blob';

/** Which step of a file operation failed. */
export type KivoxFilesErrorStage =
    | 'get'
    | 'create-upload-url'
    | 'upload'
    | 'download'
    | 'delete'
    | 'status-report'
    | 'extraction'
    | 'wait-until-ready';

/**
 * Raised by any {@link KivoxFiles} method that fails.
 */
export class KivoxFilesError extends Error {
    constructor(
        message: string,
        /** Which operation failed. */
        public readonly stage: KivoxFilesErrorStage,
        /** The file's id, if one exists yet at the point of failure. */
        public readonly fileId: string | undefined,
        public override readonly cause?: unknown,
    ) {
        super(message);
        this.name = 'KivoxFileError';
    }

    /** Azure's error code, if `cause` is an Azure Blob Storage `RestError`. */
    get azureErrorCode(): string | undefined {
        return this.cause instanceof RestError ? String(this.cause.statusCode ?? this.cause.code) : undefined;
    }
}

/** Normalizes any error into a {@link KivoxFilesError}. */
export function toKivoxFilesError(
    stage: KivoxFilesErrorStage,
    fileId: string | undefined,
    error: unknown,
): KivoxFilesError {
    if (error instanceof KivoxFilesError) {
        return error;
    }
    if (error instanceof RestError) {
        const code = String(error.statusCode ?? error.code ?? 'Unknown');
        return new KivoxFilesError(
            `Azure Blob Storage request failed (${code}): ${error.message}`,
            stage,
            fileId,
            error,
        );
    }
    if (error instanceof Error) {
        return new KivoxFilesError(error.message, stage, fileId, error);
    }
    return new KivoxFilesError(`Unknown error during ${stage}`, stage, fileId, error);
}
