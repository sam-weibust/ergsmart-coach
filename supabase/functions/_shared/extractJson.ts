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
  return scanBalanced<T>(text, "{", "}", "object");
}

/**
 * Array counterpart of extractJson, for prompts whose contract is a top-level
 * JSON array rather than an object (parse-workout-image returns a list of
 * workout days). Same greedy-lastIndexOf failure applies there — a trailing
 * "]" anywhere in the model's closing prose extends the slice past the real
 * end of the array — so it gets the same balanced scan.
 */
export function extractJsonArray<T = unknown>(text: string): T[] {
  return scanBalanced<T[]>(text, "[", "]", "array");
}

/**
 * Shared balanced-delimiter scan. Walks from the first opening delimiter to its
 * matching close, tracking depth. String- and escape-aware so delimiters inside
 * string values ("2x20' [hard]") don't throw the depth count off.
 */
function scanBalanced<T>(text: string, open: string, close: string, label: string): T {
  const start = text.indexOf(open);
  if (start === -1) throw new Error(`No JSON ${label} found in model response`);

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1)) as T;
    }
  }

  // Unbalanced: the response was cut off mid-structure (stop_reason "max_tokens").
  // Surface that plainly rather than as an opaque position-N parse error.
  throw new Error(
    `Model response ended before the JSON ${label} was closed — likely truncated by max_tokens`
  );
}
