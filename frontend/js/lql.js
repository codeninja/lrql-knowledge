// ============================================================================
// LQL · tokenization for syntax highlighting and autocomplete hints.
// ============================================================================

export const KEYWORDS = new Set([
  "USE",
  "DESCRIBE",
  "WALK",
  "INFER",
  "INSERT",
  "INTO",
  "EDGES",
  "VALUES",
  "TOP",
  "BEGIN",
  "PATCH",
  "SAVE",
  "FROM",
  "WHERE",
  "AS",
  "AND",
  "OR",
  "NOT",
]);

const TOKEN_RE = /(--[^\n]*|"[^"]*"|'[^']*'|\d+(?:\.\d+)?|[A-Za-z_][\w-]*|[(),;])/g;

export function tokenize(src) {
  const tokens = [];
  let last = 0;
  for (const match of src.matchAll(TOKEN_RE)) {
    const start = match.index;
    if (start > last) {
      tokens.push({ kind: "ws", value: src.slice(last, start) });
    }
    const value = match[0];
    let kind = "txt";
    if (value.startsWith("--")) kind = "com";
    else if (value.startsWith('"') || value.startsWith("'")) kind = "str";
    else if (/^\d/.test(value)) kind = "num";
    else if (KEYWORDS.has(value.toUpperCase())) kind = "kw";
    else if (/^[(),;]$/.test(value)) kind = "op";
    tokens.push({ kind, value });
    last = start + value.length;
  }
  if (last < src.length) {
    tokens.push({ kind: "ws", value: src.slice(last) });
  }
  return tokens;
}

export function highlight(src) {
  return tokenize(src)
    .map((t) =>
      t.kind === "ws" || t.kind === "txt"
        ? escape(t.value)
        : `<span class="tk-${t.kind}">${escape(t.value)}</span>`,
    )
    .join("");
}

function escape(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
