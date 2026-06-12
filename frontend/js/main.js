// ============================================================================
// MAIN · bootstraps the LRQL graph explorer and wires all panels together.
// ============================================================================

import { api } from "./api.js";
import { createEditor } from "./editor.js";
import { createGraph, colorForKind, listKinds } from "./graph.js";
import { store } from "./store.js";

const SAMPLE_QUERIES = [
  { verb: "DESCRIBE", body: '"France"' },
  { verb: "DESCRIBE", body: '"Albert Einstein"' },
  { verb: "WALK", body: '"The capital of France is" TOP 10' },
  { verb: "WALK", body: '"Aspirin treats" TOP 8' },
  { verb: "INFER", body: '"The capital of Germany is" TOP 5' },
  { verb: "DESCRIBE", body: '"transformer"' },
];

const els = {};
let graph;
let editor;
let walkState = null; // { trail: [...], step, timer }

document.addEventListener("DOMContentLoaded", boot);

async function boot() {
  cacheEls();
  graph = createGraph(els.canvas);
  editor = createEditor(els.lqlInput, { onRun: runQuery });

  // Initial editor content
  editor.setText('DESCRIBE "France";');

  graph.onSelect(onNodeSelect);

  buildLegend();
  bindUI();

  await loadSummary();
  await loadEntities();
  populateSuggestions();
  await runQuery('DESCRIBE "France";');
}

function cacheEls() {
  const id = (k) => document.getElementById(k);
  Object.assign(els, {
    canvas: id("canvas"),
    legend: id("legend"),
    entityList: id("entity-list"),
    entityCount: id("entity-count"),
    entitySearch: id("entity-search"),
    kindFilters: id("kind-filters"),
    suggestList: id("suggest-list"),
    lqlInput: id("lql-input"),
    historyList: id("history-list"),
    inspector: id("inspector"),
    inspectorEmpty: id("inspector-empty"),
    insLabel: id("ins-label"),
    insKind: id("ins-kind"),
    insKindText: id("ins-kind-text"),
    insDegree: id("ins-degree"),
    insOut: id("ins-out"),
    insIn: id("ins-in"),
    resultJson: id("result-json"),
    walkPlayer: id("walk-player"),
    walkPlay: id("walk-play"),
    walkTrail: id("walk-trail"),
    canvasTitle: id("canvas-title"),
    statusDot: id("status-dot"),
    statusText: id("status-text"),
    backendBadge: id("backend-badge"),
    latencyBadge: id("latency-badge"),
    vindexName: id("vindex-name"),
    vindexStats: id("vindex-stats"),
    helpModal: id("help-modal"),
    patchForm: id("patch-form"),
  });
}

// --- summary / entities ----------------------------------------------------

async function loadSummary() {
  try {
    const summary = await api.summary();
    store.set({ backend: summary.backend, vindex: summary.vindex });
    els.backendBadge.textContent = `backend: ${summary.backend}`;
    els.vindexName.textContent = summary.vindex;
    els.vindexStats.textContent = `${summary.entities} ents · ${summary.edges} edges`;
  } catch (err) {
    setStatus("err", `summary failed: ${err.message}`);
  }
}

async function loadEntities() {
  const { entities } = await api.entities(500);
  store.set({ entities });
  els.entityCount.textContent = entities.length;
  buildKindFilters(entities);
  renderEntities();
}

function buildKindFilters(entities) {
  const counts = entities.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] || 0) + 1;
    return acc;
  }, {});
  const kinds = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  els.kindFilters.innerHTML = "";
  for (const [kind, count] of kinds) {
    const btn = document.createElement("button");
    btn.className = "filter-chip";
    btn.dataset.kind = kind;
    btn.style.color = colorForKind(kind);
    btn.innerHTML = `<span class="swatch"></span>${kind} <span style="opacity:.55">${count}</span>`;
    btn.addEventListener("click", () => toggleKindFilter(kind, btn));
    els.kindFilters.appendChild(btn);
  }
}

function toggleKindFilter(kind, btn) {
  const filtered = new Set(store.get("filteredKinds"));
  if (filtered.has(kind)) filtered.delete(kind);
  else filtered.add(kind);
  btn.classList.toggle("filter-chip--active", filtered.has(kind));
  store.set({ filteredKinds: filtered });
  renderEntities();
}

function renderEntities() {
  const all = store.get("entities");
  const term = (store.get("searchTerm") || "").toLowerCase();
  const filteredKinds = store.get("filteredKinds");
  const filtered = all.filter((e) => {
    if (filteredKinds.size && !filteredKinds.has(e.kind)) return false;
    if (term && !e.label.toLowerCase().includes(term)) return false;
    return true;
  });
  els.entityCount.textContent = filtered.length;
  els.entityList.innerHTML = "";
  const tpl = document.getElementById("entity-row-tpl");
  for (const e of filtered.slice(0, 200)) {
    const row = tpl.content.firstElementChild.cloneNode(true);
    const chip = row.querySelector(".kind-chip");
    chip.textContent = e.kind;
    chip.style.background = colorForKind(e.kind);
    row.querySelector(".entity-row__label").textContent = e.label;
    row.querySelector(".entity-row__deg").textContent = `°${e.degree}`;
    row.dataset.id = e.id;
    row.addEventListener("click", () => {
      runQuery(`DESCRIBE "${e.label}";`);
      markActiveEntity(e.id);
    });
    els.entityList.appendChild(row);
  }
}

function markActiveEntity(id) {
  els.entityList
    .querySelectorAll(".entity-row--active")
    .forEach((el) => el.classList.remove("entity-row--active"));
  const row = els.entityList.querySelector(`[data-id="${cssEscape(id)}"]`);
  if (row) {
    row.classList.add("entity-row--active");
    row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

// --- legend ----------------------------------------------------------------

function buildLegend() {
  els.legend.innerHTML = "";
  const used = new Set(["country", "city", "person", "model", "drug", "concept"]);
  for (const { kind, color } of listKinds()) {
    if (!used.has(kind)) continue;
    const chip = document.createElement("div");
    chip.className = "legend__chip";
    chip.style.color = color;
    chip.innerHTML = `<span class="swatch"></span>${kind}`;
    els.legend.appendChild(chip);
  }
}

// --- suggestions -----------------------------------------------------------

function populateSuggestions() {
  els.suggestList.innerHTML = "";
  for (const s of SAMPLE_QUERIES) {
    const btn = document.createElement("button");
    btn.innerHTML = `<span class="verb">${s.verb}</span> ${s.body};`;
    btn.addEventListener("click", () => {
      const text = `${s.verb} ${s.body};`;
      editor.setText(text);
      runQuery(text);
    });
    els.suggestList.appendChild(btn);
  }
}

// --- bindings --------------------------------------------------------------

function bindUI() {
  // top bar buttons
  document.querySelector('[data-action="run"]').addEventListener("click", () => runQuery(editor.getText()));
  document.querySelector('[data-action="show-help"]').addEventListener("click", showHelp);
  document.querySelector('[data-action="close-help"]').addEventListener("click", hideHelp);
  els.helpModal.addEventListener("click", (e) => {
    if (e.target === els.helpModal) hideHelp();
  });

  // editor tabs
  document.querySelectorAll('.editor__tabs .tab').forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll('.editor__tabs .tab').forEach((t) => t.classList.remove("tab--active"));
      tab.classList.add("tab--active");
      document.querySelectorAll('.editor__panel').forEach((p) => p.classList.add("hidden"));
      document.querySelector(`.editor__panel[data-panel="${tab.dataset.tab}"]`).classList.remove("hidden");
      if (tab.dataset.tab === "history") renderHistory();
    });
  });

  // right-rail tabs
  document.querySelectorAll('.rail__tabs .tab').forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll('.rail__tabs .tab').forEach((t) => t.classList.remove("tab--active"));
      tab.classList.add("tab--active");
      document.querySelectorAll('.rail__pane').forEach((p) => p.classList.add("hidden"));
      document.querySelector(`.rail__pane[data-rpane="${tab.dataset.rtab}"]`).classList.remove("hidden");
    });
  });

  // canvas toolbar
  document.querySelector('[data-action="zoom-in"]').addEventListener("click", () => graph.zoomIn());
  document.querySelector('[data-action="zoom-out"]').addEventListener("click", () => graph.zoomOut());
  document.querySelector('[data-action="zoom-fit"]').addEventListener("click", () => graph.fit());
  document.querySelector('[data-action="export-svg"]').addEventListener("click", () => graph.exportSVG());
  document.querySelector('[data-action="layout-force"]').addEventListener("click", (e) => {
    activateToolbar(e.currentTarget);
    graph.setLayout("force");
  });
  document.querySelector('[data-action="layout-radial"]').addEventListener("click", (e) => {
    activateToolbar(e.currentTarget);
    graph.setLayout("radial");
  });

  // walk player
  document.querySelector('[data-action="walk-prev"]').addEventListener("click", () => stepWalk(-1));
  document.querySelector('[data-action="walk-next"]').addEventListener("click", () => stepWalk(+1));
  document.querySelector('[data-action="walk-play"]').addEventListener("click", () => toggleWalkPlay());

  // inspector actions
  document.querySelector('[data-action="describe-current"]').addEventListener("click", () => {
    const sel = store.get("selectedEntity");
    if (sel) runQuery(`DESCRIBE "${sel.label}";`);
  });
  document.querySelector('[data-action="walk-current"]').addEventListener("click", () => {
    const sel = store.get("selectedEntity");
    if (sel) runQuery(`WALK "${sel.label}" TOP 8;`);
  });

  // entity search
  els.entitySearch.addEventListener("input", (e) => {
    store.set({ searchTerm: e.target.value });
    renderEntities();
  });

  // patch form
  els.patchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(els.patchForm);
    const q = `INSERT INTO EDGES (entity, relation, target) VALUES ("${fd.get("entity")}", "${fd.get("relation")}", "${fd.get("target")}");`;
    editor.setText(q);
    await runQuery(q);
    await loadEntities();
    els.patchForm.reset();
  });

  // global keyboard
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery(editor.getText());
    }
    if (e.key === "/" && !isTyping(e.target)) {
      e.preventDefault();
      els.entitySearch.focus();
    }
    if (e.key === "Escape") hideHelp();
  });
}

function activateToolbar(target) {
  target.parentElement.querySelectorAll(".iconbtn--on").forEach((b) => b.classList.remove("iconbtn--on"));
  target.classList.add("iconbtn--on");
}

function isTyping(target) {
  const tag = target.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

// --- query execution -------------------------------------------------------

async function runQuery(text) {
  const q = text.trim();
  if (!q) return;
  setStatus("warn", `running: ${q}`);
  const t0 = performance.now();
  try {
    const { result, backend, ok } = await api.query(q);
    const latency = Math.round(performance.now() - t0);
    els.backendBadge.textContent = `backend: ${backend}`;
    els.latencyBadge.textContent = `${latency} ms`;
    els.resultJson.textContent = JSON.stringify(result, null, 2);
    store.pushHistory(q);
    renderHistory();

    if (!ok || result.kind === "error") {
      setStatus("err", result.message || "query failed");
      return;
    }

    setStatus("ok", `${result.kind} · ${result.stats?.nodes ?? "—"} nodes`);
    els.canvasTitle.textContent = canvasTitleFor(result);

    if (result.kind === "describe") {
      stopWalk();
      graph.setData(result);
      graph.fit();
    } else if (result.kind === "walk") {
      graph.setData(result);
      graph.fit();
      startWalk(result);
    } else if (result.kind === "infer") {
      // Render a tiny "predictions star" graph
      const pseudo = inferToGraph(result);
      stopWalk();
      graph.setData(pseudo);
      graph.fit();
    } else if (result.kind === "insert") {
      setStatus("ok", `inserted: ${result.edge.source} → ${result.edge.relation} → ${result.edge.target}`);
    } else if (result.kind === "use") {
      els.vindexName.textContent = result.vindex;
      setStatus("ok", `using ${result.vindex}`);
    }
  } catch (err) {
    setStatus("err", err.message);
  }
}

function canvasTitleFor(result) {
  if (result.kind === "describe") return `DESCRIBE · ${result.entity}`;
  if (result.kind === "walk") return `WALK · ${result.prompt}`;
  if (result.kind === "infer") return `INFER · ${result.prompt}`;
  return result.kind;
}

function inferToGraph(result) {
  const root = { id: "__prompt__", label: result.prompt, kind: "concept", depth: 0 };
  const nodes = [root];
  const edges = [];
  for (const p of result.predictions) {
    const id = `tok:${p.token}`;
    nodes.push({ id, label: p.token, kind: "concept", depth: 1 });
    edges.push({ source: root.id, target: id, relation: `${(p.probability * 100).toFixed(1)}%`, weight: p.probability });
  }
  return { kind: "infer", nodes, edges, entity: root.label };
}

// --- node selection & inspector -------------------------------------------

function onNodeSelect(node) {
  if (!node) {
    els.inspector.hidden = true;
    els.inspectorEmpty.style.display = "";
    store.set({ selectedEntity: null });
    return;
  }

  store.set({ selectedEntity: node });
  markActiveEntity(node.id);
  els.inspectorEmpty.style.display = "none";
  els.inspector.hidden = false;

  const data = graph.getData();
  const out = data.edges.filter((e) => (e.source.id ?? e.source) === node.id);
  const inn = data.edges.filter((e) => (e.target.id ?? e.target) === node.id);

  els.insLabel.textContent = node.label;
  els.insKind.textContent = node.kind;
  els.insKind.style.background = colorForKind(node.kind);
  els.insKindText.textContent = node.kind;
  els.insDegree.textContent = out.length + inn.length;

  renderEdgeList(els.insOut, out, "target");
  renderEdgeList(els.insIn, inn, "source");
}

function renderEdgeList(container, edges, direction) {
  container.innerHTML = "";
  if (!edges.length) {
    const li = document.createElement("li");
    li.className = "edge-row";
    li.style.opacity = 0.55;
    li.innerHTML = '<span class="edge-row__rel">—</span><span class="edge-row__target">none</span><span></span>';
    container.appendChild(li);
    return;
  }
  const tpl = document.getElementById("edge-row-tpl");
  for (const edge of edges.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))) {
    const row = tpl.content.firstElementChild.cloneNode(true);
    row.querySelector(".edge-row__rel").textContent = edge.relation;
    const otherId = direction === "target" ? edge.target.id ?? edge.target : edge.source.id ?? edge.source;
    row.querySelector(".edge-row__target").textContent = otherId;
    row.querySelector(".edge-row__weight").textContent = ((edge.weight ?? 0) * 100).toFixed(0) + "%";
    row.addEventListener("click", () => runQuery(`DESCRIBE "${otherId}";`));
    container.appendChild(row);
  }
}

// --- walk player -----------------------------------------------------------

function startWalk(result) {
  walkState = { trail: result.trail || [], step: 0, playing: false, timer: null };
  els.walkPlayer.hidden = false;
  renderWalkTrail();
  highlightStep(0);
  toggleWalkPlay(true);
}

function stopWalk() {
  if (walkState?.timer) clearInterval(walkState.timer);
  walkState = null;
  els.walkPlayer.hidden = true;
}

function renderWalkTrail() {
  els.walkTrail.innerHTML = "";
  walkState.trail.forEach((t, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "walk-trail__sep";
      sep.textContent = "→";
      els.walkTrail.appendChild(sep);
    }
    const pill = document.createElement("span");
    pill.className = "walk-trail__token";
    pill.textContent = t.token;
    pill.dataset.step = String(i);
    pill.addEventListener("click", () => highlightStep(i));
    els.walkTrail.appendChild(pill);
  });
}

function highlightStep(step) {
  if (!walkState) return;
  walkState.step = step;
  const pills = els.walkTrail.querySelectorAll(".walk-trail__token");
  pills.forEach((p) => p.classList.toggle("walk-trail__token--active", Number(p.dataset.step) === step));
  const token = walkState.trail[step]?.token;
  if (token) graph.highlightTrail(step);
}

function stepWalk(delta) {
  if (!walkState) return;
  const next = (walkState.step + delta + walkState.trail.length) % walkState.trail.length;
  highlightStep(next);
}

function toggleWalkPlay(force) {
  if (!walkState) return;
  const nowPlaying = force ?? !walkState.playing;
  walkState.playing = nowPlaying;
  els.walkPlay.textContent = nowPlaying ? "❚❚" : "▶";
  if (walkState.timer) {
    clearInterval(walkState.timer);
    walkState.timer = null;
  }
  if (nowPlaying) {
    walkState.timer = setInterval(() => {
      if (!walkState) return;
      const next = (walkState.step + 1) % walkState.trail.length;
      highlightStep(next);
      if (next === walkState.trail.length - 1) {
        // pause at the end
        toggleWalkPlay(false);
      }
    }, 1100);
  }
}

// --- history ---------------------------------------------------------------

function renderHistory() {
  els.historyList.innerHTML = "";
  const hist = store.get("history");
  if (!hist.length) {
    const li = document.createElement("li");
    li.className = "history-row";
    li.style.opacity = 0.6;
    li.textContent = "no queries yet";
    els.historyList.appendChild(li);
    return;
  }
  for (const h of hist) {
    const li = document.createElement("li");
    li.className = "history-row";
    const time = new Date(h.time);
    li.innerHTML = `<span>${escapeHTML(h.query)}</span><span class="history-row__time">${time.toLocaleTimeString()}</span>`;
    li.addEventListener("click", () => {
      editor.setText(h.query);
      runQuery(h.query);
    });
    els.historyList.appendChild(li);
  }
}

// --- helpers ---------------------------------------------------------------

function showHelp() { els.helpModal.hidden = false; }
function hideHelp() { els.helpModal.hidden = true; }

function setStatus(level, text) {
  els.statusDot.className = `status-dot status-dot--${level}`;
  els.statusText.textContent = text;
}

function escapeHTML(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cssEscape(s) {
  return String(s).replace(/(["\\])/g, "\\$1");
}
