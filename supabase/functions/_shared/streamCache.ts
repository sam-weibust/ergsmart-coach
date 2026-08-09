import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, hashKey, TTL } from "./cache.ts";

/**
 * Response caching + usage accounting for the STREAMING chat endpoints.
 *
 * The chat functions return Anthropic's raw SSE body straight to the browser,
 * so neither caching nor token accounting can be done with a simple
 * `await response.json()`. Two pieces solve that:
 *
 *  - `instrumentAnthropicStream` wraps the upstream body in a pass-through
 *    TransformStream. Bytes reach the client untouched and at full speed while
 *    a parser accumulates the assistant text and the token usage. The cache
 *    write and the usage log happen in `flush()`, which is part of the stream
 *    pipeline — so it is not a detached background promise that the edge
 *    runtime may kill after the response is returned.
 *
 *  - `replayAsSSE` re-emits a cached answer in Anthropic's own SSE wire format,
 *    so a cache hit is byte-compatible with the client parser already in place.
 *    No frontend change is required.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function chatCacheKey(fn: string, system: string, messages: unknown): string {
  return `${fn}:v1:${hashKey({ system, messages })}`;
}

/** Cached shape stored for a chat turn. */
interface CachedChat {
  text: string;
}

export async function getCachedChat(
  supabase: SupabaseClient,
  key: string,
): Promise<string | null> {
  const hit = (await getCached(supabase, key)) as CachedChat | null;
  if (hit && typeof hit.text === "string" && hit.text.length > 0) return hit.text;
  return null;
}

/**
 * Re-emit a cached assistant message as an Anthropic-format SSE stream.
 * Sent as one text delta — the client accumulates deltas either way.
 */
export function replayAsSSE(text: string, model: string): ReadableStream<Uint8Array> {
  const ev = (event: string, data: unknown) =>
    enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        ev("message_start", {
          type: "message_start",
          message: {
            id: "msg_cached",
            type: "message",
            role: "assistant",
            model,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: {
              input_tokens: 0,
              output_tokens: 0,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          },
        }),
      );
      controller.enqueue(
        ev("content_block_start", {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        }),
      );
      controller.enqueue(
        ev("content_block_delta", {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text },
        }),
      );
      controller.enqueue(
        ev("content_block_stop", { type: "content_block_stop", index: 0 }),
      );
      controller.enqueue(
        ev("message_delta", {
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 0 },
        }),
      );
      controller.enqueue(ev("message_stop", { type: "message_stop" }));
      controller.close();
    },
  });
}

/**
 * Pass the upstream SSE body through to the client while accumulating the
 * assistant text and token usage. On completion, writes the cache entry and
 * logs usage/cost.
 *
 * Nothing here can fail the user-visible stream: the parser is wrapped so a
 * malformed event is skipped, and the flush work is guarded.
 */
export function instrumentAnthropicStream(
  upstream: ReadableStream<Uint8Array>,
  opts: {
    supabase: SupabaseClient;
    cacheKey: string;
    functionName: string;
    model: string;
    userId: string | null;
    ttlSeconds?: number | null;
    onUsage?: (totalTokens: number) => Promise<void>;
  },
): ReadableStream<Uint8Array> {
  let buffer = "";
  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreation = 0;
  let cacheRead = 0;
  let sawError = false;

  const consume = (chunkStr: string) => {
    buffer += chunkStr;
    // SSE frames are separated by a blank line; keep any partial tail buffered.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let evt: Record<string, unknown>;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue; // partial/!JSON frame — ignore, never break the passthrough
        }

        const type = evt.type;
        if (type === "content_block_delta") {
          const delta = evt.delta as Record<string, unknown> | undefined;
          if (delta && delta.type === "text_delta" && typeof delta.text === "string") {
            text += delta.text;
          }
        } else if (type === "message_start") {
          const usage = (evt.message as Record<string, unknown> | undefined)
            ?.usage as Record<string, number> | undefined;
          if (usage) {
            inputTokens = usage.input_tokens ?? 0;
            cacheCreation = usage.cache_creation_input_tokens ?? 0;
            cacheRead = usage.cache_read_input_tokens ?? 0;
          }
        } else if (type === "message_delta") {
          const usage = evt.usage as Record<string, number> | undefined;
          if (usage && typeof usage.output_tokens === "number") {
            outputTokens = usage.output_tokens;
          }
        } else if (type === "error") {
          sawError = true;
        }
      }
    }
  };

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk); // client first — never delayed by bookkeeping
      try {
        consume(dec.decode(chunk, { stream: true }));
      } catch {
        /* accounting must never break the stream */
      }
    },

    async flush() {
      try {
        // Only cache a complete, error-free answer.
        if (!sawError && text.trim().length > 0) {
          await setCached(
            opts.supabase,
            opts.cacheKey,
            { text },
            opts.ttlSeconds ?? TTL.HOUR,
            opts.model,
            inputTokens,
            outputTokens,
          );
        }

        await logUsage(opts.supabase, {
          user_id: opts.userId,
          function_name: opts.functionName,
          model: opts.model,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_creation_input_tokens: cacheCreation,
          cache_read_input_tokens: cacheRead,
          cache_hit: false,
        });

        if (opts.onUsage) {
          await opts.onUsage(inputTokens + outputTokens + cacheCreation + cacheRead);
        }
      } catch (e) {
        console.error(`${opts.functionName}: stream finalisation failed:`, e);
      }
    },
  });

  return upstream.pipeThrough(transform);
}
