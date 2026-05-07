// ============================================================================
// STORE · shared application state with a tiny pub/sub.
// ============================================================================

const state = {
  entities: [],            // full list
  filteredKinds: new Set(), // active filter chips
  searchTerm: "",
  selectedEntity: null,
  graph: { nodes: [], edges: [], kind: "describe" },
  history: [],             // {query, time}
  backend: "mock",
  vindex: "",
};

const listeners = new Map();

export const store = {
  get(key) { return key === undefined ? { ...state } : state[key]; },
  set(patch) {
    Object.assign(state, patch);
    for (const [keys, fn] of listeners) {
      if (keys === "*" || keys.some((k) => k in patch)) fn(state);
    }
  },
  subscribe(keys, fn) {
    listeners.set(Array.isArray(keys) ? keys : [keys], fn);
    fn(state);
    return () => {
      for (const k of listeners.keys()) {
        if (k === keys || (Array.isArray(k) && Array.isArray(keys) && k.length === keys.length && k.every((x, i) => x === keys[i]))) {
          listeners.delete(k);
        }
      }
    };
  },
  pushHistory(query) {
    state.history = [{ query, time: Date.now() }, ...state.history].slice(0, 30);
  },
};
