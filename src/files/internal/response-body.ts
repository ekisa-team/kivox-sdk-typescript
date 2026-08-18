import type { BlobDownloadResponseParsed } from '@azure/storage-blob';

/**
 * Reads an Azure blob download response fully into an `ArrayBuffer`, working
 * in both browsers (`blobBody`) and Node/Bun (`readableStreamBody`).
 */
export async function downloadResponseToArrayBuffer(
    response: BlobDownloadResponseParsed,
    onBytesLoaded?: (loadedBytes: number) => void,
): Promise<ArrayBuffer> {
    if (response.blobBody) {
        const blob = await response.blobBody;
        onBytesLoaded?.(blob.size);
        return blob.arrayBuffer();
    }

    return readNodeStream(response.readableStreamBody, onBytesLoaded);
}

async function readNodeStream(
    stream: NodeJS.ReadableStream | undefined,
    onBytesLoaded?: (loadedBytes: number) => void,
): Promise<ArrayBuffer> {
    if (!stream) {
        return new ArrayBuffer(0);
    }

    const chunks: Uint8Array[] = [];
    let loaded = 0;

    for await (const chunk of stream) {
        const bytes =
            typeof chunk === 'string'
                ? new TextEncoder().encode(chunk)
                : chunk instanceof Uint8Array
                  ? chunk
                  : new Uint8Array(chunk);

        chunks.push(bytes);
        loaded += bytes.byteLength;
        onBytesLoaded?.(loaded);
    }

    const combined = new Uint8Array(loaded);

    let offset = 0;
    for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return combined.buffer;
}
