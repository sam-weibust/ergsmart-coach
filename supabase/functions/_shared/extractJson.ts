/**
 * Pull the first complete JSON object out of a model response.
 *
 * The long-standing pattern across these functions was:
 *   const start = text.indexOf("{");
 *   const end   = text.lastIndexOf("}");
 *   JSON.parse(text.slice(start, end + 1));
 *
 * That breaks whenever the model adds anything after the object — a closing
 * note, a second example, a markdown fence with prose — because lastIndexOf
 * reaches past the real end of the object and the slice becomes
 * "{...valid...} trailing text }". Observed live on analyze-seat-race:
 *   SyntaxError: Unexpected non-whitespace character after JSON at position 919
 *
 * Scanning for the balanced closing brace instead ignores anything that follows,
 * and string/escape awareness keeps braces inside string values from throwing
 * the depth count off.
 */
export function extractJson<T = unknown>(text: string): T {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in model response");

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1)) as T;
    }
  }

  // Unbalanced: the response was cut off mid-object (stop_reason "max_tokens").
  // Surface that plainly rather than as an opaque position-N parse error.
  throw new Error(
    "Model response ended before the JSON object was closed — likely truncated by max_tokens"
  );
}
