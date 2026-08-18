import { describe, expect, test } from 'bun:test';
import type { SSEEvent } from './parser';
import { readSSE } from './reader';

/**
 * Builds a ReadableStream that yields each string in `chunks` as one
 * `read()` result, encoded as UTF-8. Lets tests control exactly where
 * chunk boundaries fall relative to SSE block boundaries.
 */
function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let i = 0;

    return new ReadableStream({
        pull(controller) {
            if (i < chunks.length) {
                controller.enqueue(encoder.encode(chunks[i]));
                i++;
            } else {
                controller.close();
            }
        },
    });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<SSEEvent[]> {
    const events: SSEEvent[] = [];

    for await (const event of readSSE(stream)) {
        events.push(event);
    }

    return events;
}

describe('readSSE', () => {
    test('parses a single block delivered in one chunk', async () => {
        const stream = streamFromChunks(['event: text_delta\ndata: {"generation_id":"gen-1","chunk":"a"}\n\n']);

        expect(await collect(stream)).toEqual([
            {
                type: 'text_delta',
                data: {
                    generation_id: 'gen-1',
                    chunk: 'a',
                },
            },
        ]);
    });

    test('parses multiple blocks delivered in one chunk', async () => {
        const stream = streamFromChunks([
            'event: text_delta\ndata: {"generation_id":"gen-1","chunk":"a"}\n\n' +
                'event: text_delta\ndata: {"generation_id":"gen-1","chunk":"b"}\n\n',
        ]);

        expect(await collect(stream)).toEqual([
            {
                type: 'text_delta',
                data: {
                    generation_id: 'gen-1',
                    chunk: 'a',
                },
            },
            {
                type: 'text_delta',
                data: {
                    generation_id: 'gen-1',
                    chunk: 'b',
                },
            },
        ]);
    });

    test('parses a block split across multiple chunks', async () => {
        const stream = streamFromChunks(['event: text_delta\ndata: {"generation_id":"gen-1","ch', 'unk":"a"}\n\n']);

        expect(await collect(stream)).toEqual([
            {
                type: 'text_delta',
                data: {
                    generation_id: 'gen-1',
                    chunk: 'a',
                },
            },
        ]);
    });

    test('parses a block whose delimiter is split across chunks', async () => {
        // The '\n\n' delimiter itself is split across the chunk boundary.
        const stream = streamFromChunks([
            'event: text_delta\ndata: {"generation_id":"gen-1","chunk":"a"}\n',
            '\nevent: text_delta\ndata: {"generation_id":"gen-1","chunk":"b"}\n\n',
        ]);

        expect(await collect(stream)).toEqual([
            {
                type: 'text_delta',
                data: {
                    generation_id: 'gen-1',
                    chunk: 'a',
                },
            },
            {
                type: 'text_delta',
                data: {
                    generation_id: 'gen-1',
                    chunk: 'b',
                },
            },
        ]);
    });

    test('parses a trailing block with no closing delimiter at stream end', async () => {
        const stream = streamFromChunks([
            'event: text_delta\ndata: {"generation_id":"gen-1","chunk":"a"}\n\n' +
                'event: error\ndata: {"generation_id":"gen-1","message":"done"}',
        ]);

        expect(await collect(stream)).toEqual([
            {
                type: 'text_delta',
                data: {
                    generation_id: 'gen-1',
                    chunk: 'a',
                },
            },
            {
                type: 'error',
                data: {
                    generation_id: 'gen-1',
                    message: 'done',
                },
            },
        ]);
    });

    test('drops comment-only heartbeat blocks', async () => {
        const stream = streamFromChunks([
            `: ping

event: text_delta
data: {"generation_id":"gen-1","chunk":"a"}

: ping

`,
        ]);

        expect(await collect(stream)).toEqual([
            {
                type: 'text_delta',
                data: {
                    generation_id: 'gen-1',
                    chunk: 'a',
                },
            },
        ]);
    });

    test('returns nothing for an empty stream', async () => {
        const stream = streamFromChunks([]);

        expect(await collect(stream)).toEqual([]);
    });

    test('handles a multi-byte UTF-8 character split across chunks', async () => {
        // '€' is 3 bytes in UTF-8 (0xE2 0x82 0xAC); split mid-character to
        // exercise TextDecoder's { stream: true } continuation buffering.
        const full = new TextEncoder().encode('event: text_delta\ndata: {"generation_id":"gen-1","chunk":"€"}\n\n');

        const first = full.slice(0, 20);
        const second = full.slice(20);

        const stream = new ReadableStream<Uint8Array>({
            pull(controller) {
                controller.enqueue(first);
                controller.enqueue(second);
                controller.close();
            },
        });

        expect(await collect(stream)).toEqual([
            {
                type: 'text_delta',
                data: {
                    generation_id: 'gen-1',
                    chunk: '€',
                },
            },
        ]);
    });

    test('parses reasoning_delta events', async () => {
        const stream = streamFromChunks([
            'event: reasoning_delta\ndata: {"generation_id":"gen-1","chunk":"thinking..."}\n\n',
        ]);

        expect(await collect(stream)).toEqual([
            {
                type: 'reasoning_delta',
                data: {
                    generation_id: 'gen-1',
                    chunk: 'thinking...',
                },
            },
        ]);
    });

    test('parses tool_call_started events', async () => {
        const stream = streamFromChunks([
            'event: tool_call_started\ndata: {"generation_id":"gen-1","tool_call_id":"call-1","tool_name":"search"}\n\n',
        ]);

        expect(await collect(stream)).toEqual([
            {
                type: 'tool_call_started',
                data: {
                    generation_id: 'gen-1',
                    tool_call_id: 'call-1',
                    tool_name: 'search',
                },
            },
        ]);
    });

    test('parses tool_call_delta events', async () => {
        const stream = streamFromChunks([
            'event: tool_call_delta\ndata: {"generation_id":"gen-1","tool_call_id":"call-1","input_chunk":"{\\"query\\":\\"foo\\"}"}\n\n',
        ]);

        expect(await collect(stream)).toEqual([
            {
                type: 'tool_call_delta',
                data: {
                    generation_id: 'gen-1',
                    tool_call_id: 'call-1',
                    input_chunk: '{"query":"foo"}',
                },
            },
        ]);
    });

    test('parses tool_result events', async () => {
        const stream = streamFromChunks([
            'event: tool_result\ndata: {"generation_id":"gen-1","tool_call_id":"call-1","tool_name":"search","output":{"result":"ok"}}\n\n',
        ]);

        expect(await collect(stream)).toEqual([
            {
                type: 'tool_result',
                data: {
                    generation_id: 'gen-1',
                    tool_call_id: 'call-1',
                    tool_name: 'search',
                    output: {
                        result: 'ok',
                    },
                },
            },
        ]);
    });

    test('parses error events', async () => {
        const stream = streamFromChunks([
            'event: error\ndata: {"generation_id":"gen-1","message":"something went wrong","code":"ERR_TEST"}\n\n',
        ]);

        expect(await collect(stream)).toEqual([
            {
                type: 'error',
                data: {
                    generation_id: 'gen-1',
                    message: 'something went wrong',
                    code: 'ERR_TEST',
                },
            },
        ]);
    });

    test('releases the reader lock after the stream completes', async () => {
        const stream = streamFromChunks(['event: text_delta\ndata: {"generation_id":"gen-1","chunk":"a"}\n\n']);

        await collect(stream);

        // If the lock wasn't released, getReader() would throw
        expect(() => stream.getReader()).not.toThrow();
    });

    test('releases the reader lock if the consumer breaks early', async () => {
        const stream = streamFromChunks([
            'event: text_delta\ndata: {"generation_id":"gen-1","chunk":"a"}\n\n' +
                'event: text_delta\ndata: {"generation_id":"gen-1","chunk":"b"}\n\n',
        ]);

        for await (const _ of readSSE(stream)) {
            break;
        }

        expect(() => stream.getReader()).not.toThrow();
    });
});
