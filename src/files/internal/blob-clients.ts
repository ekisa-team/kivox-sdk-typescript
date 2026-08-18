import { BlobClient, BlockBlobClient, AnonymousCredential, type StoragePipelineOptions } from '@azure/storage-blob';
import type { KivoxFilesOptions } from '../types';

/** Shared Azure pipeline config every blob client in this module uses. */
function pipelineOptions(options: Required<KivoxFilesOptions>): StoragePipelineOptions {
    return { retryOptions: { maxTries: options.maxTriesPerRequest } };
}

/** Builds a {@link BlockBlobClient} for a signed upload URL. */
export function blockBlobClientFor(signedUrl: string, options: Required<KivoxFilesOptions>): BlockBlobClient {
    return new BlockBlobClient(signedUrl, new AnonymousCredential(), pipelineOptions(options));
}

/** Builds a {@link BlobClient} for a signed download URL. */
export function blobClientFor(signedUrl: string, options: Required<KivoxFilesOptions>): BlobClient {
    return new BlobClient(signedUrl, new AnonymousCredential(), pipelineOptions(options));
}
