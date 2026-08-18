import { describe, expect, test } from 'bun:test';
import { parseBlock } from './parser';

describe('parseBlock', () => {
    test('parses a basic event with a JSON payload', () => {
        const block = 'event: text_delta\ndata: {"generation_id":"g1","chunk":"hi"}';

        expect(parseBlock(block)).toEqual({
            type: 'text_delta',
            data: { generation_id: 'g1', chunk: 'hi' },
        });
    });

    test('returns null for a comment-only block (heartbeat)', () => {
        expect(parseBlock(': ping')).toBeNull();
    });

    test('returns null for a block with no fields at all', () => {
        expect(parseBlock('')).toBeNull();
    });

    test('joins multiple data: lines before parsing JSON', () => {
        const block = 'event: error\ndata: {\ndata: "generation_id":"g1","message":"line one"}';

        expect(parseBlock(block)).toEqual({
            type: 'error',
            data: {
                generation_id: 'g1',
                message: 'line one',
            },
        });
    });

    test('handles CRLF line endings', () => {
        const block = 'event: text_delta\r\ndata: {"generation_id":"g1","chunk":"a"}\r\n';

        expect(parseBlock(block)).toEqual({
            type: 'text_delta',
            data: { generation_id: 'g1', chunk: 'a' },
        });
    });

    test('handles LF line endings', () => {
        const block = 'event: text_delta\ndata: {"generation_id":"g1","chunk":"a"}\n';

        expect(parseBlock(block)).toEqual({
            type: 'text_delta',
            data: { generation_id: 'g1', chunk: 'a' },
        });
    });

    test('ignores comment lines interleaved with real fields', () => {
        const block = ': keep-alive\nevent: text_delta\n: another comment\ndata: {"generation_id":"g1","chunk":"a"}';

        expect(parseBlock(block)).toEqual({
            type: 'text_delta',
            data: { generation_id: 'g1', chunk: 'a' },
        });
    });

    test('ignores unrecognized fields like id: and retry:', () => {
        const block = 'id: 42\nretry: 3000\nevent: text_delta\ndata: {"generation_id":"g1","chunk":"a"}';

        expect(parseBlock(block)).toEqual({
            type: 'text_delta',
            data: { generation_id: 'g1', chunk: 'a' },
        });
    });

    test('handles a field with no space after the colon', () => {
        const block = 'event:text_delta\ndata:{"generation_id":"g1","chunk":"a"}';

        expect(parseBlock(block)).toEqual({
            type: 'text_delta',
            data: { generation_id: 'g1', chunk: 'a' },
        });
    });

    test('handles a block with no trailing newline', () => {
        const block = 'event: text_delta\ndata: {"generation_id":"g1","chunk":"a"}';

        expect(parseBlock(block)).toEqual({
            type: 'text_delta',
            data: { generation_id: 'g1', chunk: 'a' },
        });
    });
});
