import type { ApiSchema } from '../schemas';

/**
 * Represents a single event in an SSE stream.
 */
export type SSEEvent =
    | { type: 'text_delta'; data: ApiSchema<'OutboundTextDelta'> }
    | { type: 'reasoning_delta'; data: ApiSchema<'OutboundReasoningDelta'> }
    | { type: 'tool_call_started'; data: ApiSchema<'OutboundToolCallStarted'> }
    | { type: 'tool_call_delta'; data: ApiSchema<'OutboundToolCallDelta'> }
    | { type: 'tool_call'; data: ApiSchema<'OutboundToolCall'> }
    | { type: 'tool_result'; data: ApiSchema<'OutboundToolResult'> }
    | { type: 'turn_complete'; data: ApiSchema<'OutboundTurnComplete'> }
    | { type: 'error'; data: ApiSchema<'OutboundError'> };

/* '\r' charCode, for stripping CRLF line endings without a regex. */
const CR = 13;

const EVENT_PREFIX = 'event:';
const DATA_PREFIX = 'data:';

/**
 * Mutable scan state for a single SSE block. Reused across lines to avoid
 * per-line allocation.
 */
interface FieldAccumulator {
    event: string;
    rawData: string;
    /**
     * Set once an `event:` or `data:` field has been seen. Distinguishes
     * a real empty event from a comment-only/heartbeat block, which must
     * not produce a synthetic `message` event.
     */
    hasField: boolean;
}

function createAccumulator(): FieldAccumulator {
    // Spec default: a block with no explicit `event:` field is `message`.
    return { event: 'message', rawData: '', hasField: false };
}

/**
 * Finds the end of the line starting at `start`, trimming a trailing `\r`.
 */
function readLine(block: string, start: number): { contentEnd: number; nextStart: number } {
    let lineEnd = block.indexOf('\n', start);
    if (lineEnd === -1) {
        lineEnd = block.length;
    }

    let contentEnd = lineEnd;
    if (contentEnd > start && block.charCodeAt(contentEnd - 1) === CR) {
        contentEnd--;
    }

    return { contentEnd, nextStart: lineEnd + 1 };
}

/**
 * Parses one line into `acc`. Blank lines and comment lines (leading `:`)
 * are valid SSE no-ops; comments are how heartbeats are sent.
 */
function applyLine(block: string, start: number, end: number, acc: FieldAccumulator): void {
    if (start === end || block.charCodeAt(start) === 58 /* ':' */) {
        return;
    }

    // Prefix-match at an offset instead of slicing `line` out first.
    if (block.startsWith(EVENT_PREFIX, start)) {
        let valueStart = start + EVENT_PREFIX.length;
        if (block.charCodeAt(valueStart) === 32) {
            valueStart++;
        }

        acc.event = block.slice(valueStart, end);
        acc.hasField = true;
        return;
    }

    if (block.startsWith(DATA_PREFIX, start)) {
        let valueStart = start + DATA_PREFIX.length;
        if (block.charCodeAt(valueStart) === 32) {
            valueStart++;
        }

        // Multiple `data:` lines join with '\n', per spec.
        if (acc.rawData.length !== 0) acc.rawData += '\n';
        acc.rawData += block.slice(valueStart, end);
        acc.hasField = true;
        return;
    }

    // TODO: `id:`, `retry:`, or an unrecognized field: ignored. `id:` would be
    // needed for Last-Event-ID reconnect support, but not implemented.
}

/**
 * Builds the final event from accumulated state, or `null` if the block
 * had no real fields (comment-only block).
 */
function finalizeAccumulator(acc: FieldAccumulator): SSEEvent | null {
    if (!acc.hasField) {
        return null;
    }

    let data: unknown = {};

    if (acc.rawData.length !== 0) {
        try {
            data = JSON.parse(acc.rawData);
        } catch {
            data = acc.rawData;
        }
    }

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return { type: acc.event, data } as SSEEvent;
}

/**
 * Parses a single SSE block (text between two `\n\n` delimiters).
 *
 * Returns `null` for comment-only/heartbeat blocks; callers must skip
 * `null` rather than treat it as an event.
 *
 * Scans the block once without `split('\n')`, avoiding an intermediate
 * line array per block.
 */
export function parseBlock(block: string): SSEEvent | null {
    const acc = createAccumulator();
    const length = block.length;

    let pos = 0;
    while (pos <= length) {
        const { contentEnd, nextStart } = readLine(block, pos);
        applyLine(block, pos, contentEnd, acc);
        pos = nextStart;
    }

    return finalizeAccumulator(acc);
}
