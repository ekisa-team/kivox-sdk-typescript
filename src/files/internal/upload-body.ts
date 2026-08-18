import type { FileData } from '../types';

export interface ResolvedUploadBody {
    /** Body safe to pass to Azure `uploadData`. */
    body: Blob | ArrayBuffer | ArrayBufferView;
    /** Resolved byte length. */
    size: number;
}

/**
 * Normalizes upload input for Azure and derives size when possible.
 * Materializes Blobs (including BunFile) so Node/Azure never see a lazy handle.
 */
export async function resolveUploadBody(data: FileData, sizeBytes?: number): Promise<ResolvedUploadBody> {
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
        // BunFile and similar lazy Blobs: size may be invalid until read
        const buffer = await data.arrayBuffer();
        const size = sizeBytes ?? buffer.byteLength;
        assertValidSize(size);
        return { body: buffer, size };
    }

    if (data instanceof ArrayBuffer) {
        const size = sizeBytes ?? data.byteLength;
        assertValidSize(size);
        return { body: data, size };
    }

    // Uint8Array, Buffer, DataView
    if (ArrayBuffer.isView(data)) {
        const size = sizeBytes ?? data.byteLength;
        assertValidSize(size);
        return { body: data, size };
    }

    throw new TypeError('Unsupported file data type. Expected Blob, ArrayBuffer, or ArrayBufferView.');
}

function assertValidSize(size: number): void {
    if (!Number.isFinite(size) || size < 0 || !Number.isInteger(size)) {
        throw new TypeError('Could not determine a valid file size. Pass sizeBytes explicitly.');
    }
}
