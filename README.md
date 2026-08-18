[![JSR](https://jsr.io/badges/@kivox/sdk)](https://jsr.io/@kivox/sdk)
[![JSR Score](https://jsr.io/badges/@kivox/sdk/score)](https://jsr.io/@kivox/sdk)

# Kivox TypeScript SDK

Official TypeScript SDK for interacting with the Kivox API.

Typed HTTP client generated from the OpenAPI contract, plus utilities for SSE streaming and file transfer.

## Installation

```bash
# npm / pnpm / yarn / bun / deno
npx jsr add @kivox/sdk

# or via npm compatibility
npm install @jsr/kivox__sdk
```

## Quick start

```ts
import { Kivox } from "@kivox/sdk";
import { readSSE } from "@kivox/sdk/sse";

const client = new Kivox({
    headers: {
        Authorization: `Bearer ${process.env.KIVOX_API_KEY}`,
    },
});

// Create a conversation
const { data: chat, error } = await client.POST("/v1/workspaces/{workspace_id}/chats", {
    params: {
        path: { workspace_id: process.env.KIVOX_WORKSPACE_ID! },
    },
    body: { agent_id: process.env.KIVOX_AGENT_ID! },
});

if (error) {
    throw error;
}

// Send a message and stream the response
const { response } = await client.POST("/v1/chats/{chat_id}/messages", {
    params: {
        path: { chat_id: chat.id },
        header: { "Idempotency-Key": crypto.randomUUID() },
    },
    body: {
        parts: [{ type: "text", text: "Hello" }],
    },
    parseAs: "stream",
});

for await (const event of readSSE(response.body)) {
    if (event.type === "text_delta") {
        process.stdout.write(event.data.chunk);
    }
}
```

## Types

```ts
import type { ApiSchema } from "@kivox/sdk";

const agent: ApiSchema<"Agent"> = { ... };

const knowledgeBase: ApiSchema<"KnowledgeBase"> = { ... };

...
```

## License

[Apache 2.0](LICENSE)
