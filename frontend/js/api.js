// ============================================================================
// API · thin wrapper around the FastAPI backend.
// ============================================================================

const BASE = "";

async function request(path, opts = {}) {
  const t0 = performance.now();
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const latency = Math.round(performance.now() - t0);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    const err = new Error(text || `HTTP ${res.status}`);
    err.status = res.status;
    err.latency = latency;
    throw err;
  }
  const body = await res.json();
  body.__latency = latency;
  return body;
}

export const api = {
  async query(query) {
    return request("/api/query", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
  },
  async entities(limit = 200) {
    return request(`/api/entities?limit=${limit}`);
  },
  async search(q, limit = 30) {
    const params = new URLSearchParams({ q, limit: String(limit) });
    return request(`/api/search?${params.toString()}`);
  },
  async summary() {
    return request(`/api/summary`);
  },
};
