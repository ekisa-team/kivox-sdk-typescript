import { parseBlock, type SSEEvent } from './parser';

/* SSE blocks are delimited by a blank line: two consecutive newlines.
 * Only literal '\n\n' is matched. A stream delimiting purely with
 * '\r\n\r\n' would not split, since that substring never occurs. */
const BLOCK_DELIMITER = '\n\n';
const BLOCK_DELIMITER_LENGTH = BLOCK_DELIMITER.length;

/**
 * Splits every complete block out of `buffer`; returns the blocks and how
 * much of the buffer was consumed.
 *
 * Uses a cursor instead of reslicing `buffer` after each block. A single
 * `read()` chunk can contain many blocks, and reslicing a shrinking
 * string per block is O(n) each time, O(n^2) total for the chunk.
 * Cursor + single final slice keeps this O(n).
 */
function drainCompleteBlocks(buffer: string): { blocks: string[]; consumed: number } {
    const blocks: string[] = [];

    let cursor = 0;
    let separator: number;

    while ((separator = buffer.indexOf(BLOCK_DELIMITER, cursor)) !== -1) {
        const block = buffer.slice(cursor, separator);
        cursor = separator + BLOCK_DELIMITER_LENGTH;

        // Skip phantom empty block from consecutive delimiters.
        if (block.length !== 0) {
            blocks.push(block);
        }
    }

    return { blocks, consumed: cursor };
}

/**
 * Parses drained blocks into events, dropping comment-only blocks.
 */
function* parseBlocks(blocks: string[]): Generator<SSEEvent> {
    for (const block of blocks) {
        const parsed = parseBlock(block);
        if (parsed !== null) {
            yield parsed;
        }
    }
}

/**
 * Reads a Server-Sent Events stream.
 *
 * - decodes UTF-8 incrementally
 * - supports LF and CRLF line endings
 * - drops comment-only/heartbeat blocks instead of yielding empty events
 * - avoids `split()` and per-block quadratic slicing
 * - flushes the decoder at end-of-stream
 * - always releases the reader lock
 */
export async function* readSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            const { blocks, consumed } = drainCompleteBlocks(buffer);

            // Reslice only if something was consumed; an in-progress
            // block with no delimiter yet should pass through untouched.
            if (consumed > 0) {
                buffer = buffer.slice(consumed);
            }

            yield* parseBlocks(blocks);
        }

        // Flush bytes withheld pending a multi-byte UTF-8 sequence, then
        // parse any trailing block that never got a closing delimiter.
        buffer += decoder.decode();

        if (buffer.length !== 0) {
            const parsed = parseBlock(buffer);
            if (parsed !== null) {
                yield parsed;
            }
        }
    } finally {
        reader.releaseLock();
    }
}
