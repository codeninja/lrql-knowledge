// ============================================================================
// GRAPH · D3 force-directed knowledge graph with futuristic styling.
// ============================================================================

const KIND_COLORS = {
  country: "#5cf2ff",
  city: "#9affd1",
  continent: "#7cdfff",
  language: "#ffd166",
  currency: "#ffb86b",
  river: "#69e1ff",
  landmark: "#ff9ed4",
  person: "#c47bff",
  field: "#9ad7ff",
  theory: "#b290ff",
  award: "#ffd166",
  element: "#5cf2c8",
  architecture: "#ff6ad5",
  concept: "#a8b3ff",
  model: "#ff6ad5",
  company: "#5cf2ff",
  drug: "#ff7a8a",
  symptom: "#ffb18a",
  compound: "#9affd1",
  custom: "#9aa0c8",
};

export function colorForKind(kind) {
  return KIND_COLORS[kind] || "#9aa0c8";
}

export function listKinds() {
  return Object.entries(KIND_COLORS).map(([kind, color]) => ({ kind, color }));
}

export function createGraph(container) {
  const tooltip = document.createElement("div");
  tooltip.className = "graph-tooltip";
  container.appendChild(tooltip);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("preserveAspectRatio", "xMidYMid meet");

  const defs = svg.append("defs");

  // Trail gradient (cyan -> magenta) for WALK edges
  const trailGrad = defs
    .append("linearGradient")
    .attr("id", "trail-gradient")
    .attr("gradientUnits", "userSpaceOnUse")
    .attr("x1", 0).attr("y1", 0)
    .attr("x2", 1).attr("y2", 1);
  trailGrad.append("stop").attr("offset", "0%").attr("stop-color", "#5cf2ff");
  trailGrad.append("stop").attr("offset", "100%").attr("stop-color", "#ff6ad5");

  // Arrow marker
  defs
    .append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -4 8 8")
    .attr("refX", 6)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-4L8,0L0,4")
    .attr("fill", "rgba(154, 160, 200, 0.45)");

  defs
    .append("marker")
    .attr("id", "arrow-trail")
    .attr("viewBox", "0 -4 8 8")
    .attr("refX", 6)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-4L8,0L0,4")
    .attr("fill", "#ff6ad5");

  const root = svg.append("g").attr("class", "root");
  const linkLayer = root.append("g").attr("class", "links");
  const labelLayer = root.append("g").attr("class", "labels");
  const nodeLayer = root.append("g").attr("class", "nodes");

  let width = container.clientWidth || 800;
  let height = container.clientHeight || 600;
  svg.attr("viewBox", `0 0 ${width} ${height}`);

  // Pan & zoom
  const zoom = d3
    .zoom()
    .scaleExtent([0.25, 4])
    .on("zoom", (event) => {
      root.attr("transform", event.transform);
    })
    .on("start", () => svg.classed("is-panning", true))
    .on("end", () => svg.classed("is-panning", false));
  svg.call(zoom);

  const simulation = d3
    .forceSimulation()
    .force(
      "link",
      d3
        .forceLink()
        .id((d) => d.id)
        .distance((d) => 110 - 60 * (d.weight ?? 0.5))
        .strength(0.7),
    )
    .force("charge", d3.forceManyBody().strength(-380))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius(36));

  let layoutMode = "force";
  let currentData = { nodes: [], edges: [], kind: "describe" };
  let selectedId = null;
  const handlers = { onSelect: () => {}, onHover: () => {} };

  function setData(data, opts = {}) {
    currentData = normalize(data);
    const { nodes, edges } = currentData;

    if (layoutMode === "radial" && currentData.kind === "describe") {
      applyRadialLayout(nodes, currentData.entity);
    } else {
      // Seed positions near the centre so fit() works before the simulation
      // ticks, and so we never explode out of the viewBox on first render.
      seedPositions(nodes);
    }

    const link = linkLayer
      .selectAll("path.graph-link")
      .data(edges, (d) => `${d.source.id ?? d.source}->${d.target.id ?? d.target}:${d.relation}`);
    link.exit().remove();
    const linkEnter = link
      .enter()
      .append("path")
      .attr("class", linkClass)
      .attr("marker-end", (d) => (d.on_trail ? "url(#arrow-trail)" : "url(#arrow)"));
    const linkAll = linkEnter.merge(link).attr("class", linkClass);

    const relLabel = labelLayer
      .selectAll("text.graph-rel-label")
      .data(edges, (d) => `${d.source.id ?? d.source}->${d.target.id ?? d.target}:${d.relation}`);
    relLabel.exit().remove();
    const relLabelEnter = relLabel
      .enter()
      .append("text")
      .attr("class", relLabelClass)
      .text((d) => d.relation);
    const relLabelAll = relLabelEnter.merge(relLabel).text((d) => d.relation).attr("class", relLabelClass);

    const node = nodeLayer
      .selectAll("g.graph-node")
      .data(nodes, (d) => d.id);
    node.exit().remove();
    const nodeEnter = node
      .enter()
      .append("g")
      .attr("class", nodeClass)
      .style("color", (d) => colorForKind(d.kind))
      .call(drag(simulation))
      .on("click", (event, d) => {
        event.stopPropagation();
        select(d.id);
        handlers.onSelect(d, event);
      })
      .on("mouseenter", (event, d) => {
        d3.select(event.currentTarget).classed("graph-node--hover", true);
        showTooltip(d, event);
        handlers.onHover(d, event);
      })
      .on("mousemove", (event) => moveTooltip(event))
      .on("mouseleave", (event) => {
        d3.select(event.currentTarget).classed("graph-node--hover", false);
        hideTooltip();
      });
    nodeEnter.append("circle").attr("class", "graph-node__halo").attr("r", 22);
    nodeEnter.append("circle").attr("class", "graph-node__core").attr("r", 9);
    nodeEnter.append("text").attr("class", "graph-node__label").attr("dy", 18);

    const nodeAll = nodeEnter.merge(node).attr("class", nodeClass);
    nodeAll
      .select("text.graph-node__label")
      .text((d) => d.label)
      .each(function (d) {
        // dim for very large neighbourhoods
        d3.select(this).attr("font-size", d.depth === 0 ? 13 : 11.5);
      });
    nodeAll
      .select("circle.graph-node__core")
      .attr("r", (d) => (d.depth === 0 ? 12 : d.on_trail ? 9 : 7));

    simulation.nodes(nodes).on("tick", ticked);
    simulation.force("link").links(edges);
    simulation.alpha(opts.preserve ? 0.4 : 1).restart();

    function ticked() {
      linkAll.attr("d", linkPath);
      relLabelAll
        .attr("x", (d) => (d.source.x + d.target.x) / 2)
        .attr("y", (d) => (d.source.y + d.target.y) / 2 - 4);
      nodeAll.attr("transform", (d) => `translate(${d.x},${d.y})`);
    }

    if (selectedId && !nodes.find((n) => n.id === selectedId)) {
      selectedId = null;
    }
    applySelectionClasses();
  }

  function linkClass(d) {
    let c = "graph-link";
    if (d.on_trail) c += " graph-link--trail graph-link--flow";
    else if ((d.weight ?? 0.5) > 0.85) c += " graph-link--strong";
    return c;
  }
  function relLabelClass(d) {
    return d.on_trail ? "graph-rel-label graph-rel-label--trail" : "graph-rel-label";
  }
  function nodeClass(d) {
    let c = "graph-node";
    if (d.depth === 0) c += " graph-node--root";
    if (d.on_trail) c += " graph-node--trail";
    if (d.id === selectedId) c += " graph-node--selected";
    return c;
  }

  function linkPath(d) {
    const dx = d.target.x - d.source.x;
    const dy = d.target.y - d.source.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    // Slight curve for visual flow
    const curve = dist * 0.18;
    const mx = (d.source.x + d.target.x) / 2 - dy * (curve / dist);
    const my = (d.source.y + d.target.y) / 2 + dx * (curve / dist);
    return `M${d.source.x},${d.source.y} Q${mx},${my} ${d.target.x},${d.target.y}`;
  }

  function seedPositions(nodes) {
    if (!nodes.length) return;
    // Use live dimensions so seeding survives layout changes between
    // createGraph() and the first setData(); fall back to current width/height.
    const w = container.clientWidth || width;
    const h = container.clientHeight || height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.18;
    nodes.forEach((n, i) => {
      if (typeof n.x !== "number" || typeof n.y !== "number") {
        const a = (i / nodes.length) * Math.PI * 2;
        n.x = cx + Math.cos(a) * r;
        n.y = cy + Math.sin(a) * r;
      }
    });
  }

  function applyRadialLayout(nodes, rootId) {
    const center = nodes.find((n) => n.id === rootId);
    if (!center) return;
    const ring = nodes.filter((n) => n.id !== rootId);
    const R = Math.min(width, height) * 0.34;
    center.fx = width / 2;
    center.fy = height / 2;
    ring.forEach((n, i) => {
      const a = (i / Math.max(ring.length, 1)) * Math.PI * 2;
      n.x = width / 2 + Math.cos(a) * R;
      n.y = height / 2 + Math.sin(a) * R;
      n.fx = null;
      n.fy = null;
    });
  }

  function clearRadialPins() {
    currentData.nodes.forEach((n) => {
      n.fx = null;
      n.fy = null;
    });
  }

  function setLayout(mode) {
    layoutMode = mode;
    if (mode === "radial") {
      const rootId = currentData.entity || (currentData.nodes.find((n) => n.depth === 0) || {}).id;
      applyRadialLayout(currentData.nodes, rootId);
    } else {
      clearRadialPins();
    }
    simulation.alpha(1).restart();
  }

  function select(id) {
    selectedId = id;
    applySelectionClasses();
  }
  function applySelectionClasses() {
    nodeLayer.selectAll("g.graph-node").attr("class", nodeClass);
  }

  function showTooltip(d, event) {
    const out = (currentData.edges.filter((e) => (e.source.id ?? e.source) === d.id) || []).length;
    const inn = (currentData.edges.filter((e) => (e.target.id ?? e.target) === d.id) || []).length;
    tooltip.innerHTML = `<span class="label">${escape(d.label)}</span><span class="meta">${d.kind} · in ${inn} · out ${out}</span>`;
    tooltip.classList.add("is-visible");
    moveTooltip(event);
  }
  function moveTooltip(event) {
    const rect = container.getBoundingClientRect();
    tooltip.style.left = `${event.clientX - rect.left}px`;
    tooltip.style.top = `${event.clientY - rect.top}px`;
  }
  function hideTooltip() {
    tooltip.classList.remove("is-visible");
  }

  function zoomBy(factor) {
    svg.transition().duration(250).call(zoom.scaleBy, factor);
  }

  function fit() {
    if (!currentData.nodes.length) return;
    const xs = currentData.nodes.map((n) => n.x ?? width / 2);
    const ys = currentData.nodes.map((n) => n.y ?? height / 2);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = Math.max(x1 - x0, 200);
    const h = Math.max(y1 - y0, 200);
    const scale = Math.min(width / (w + 100), height / (h + 100), 2.5);
    const tx = width / 2 - scale * (x0 + w / 2);
    const ty = height / 2 - scale * (y0 + h / 2);
    svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  function exportSVG() {
    const clone = svg.node().cloneNode(true);
    const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleEl.textContent = collectStyles();
    clone.insertBefore(styleEl, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lrql-graph.svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  function highlightTrail(step) {
    const active = currentData.nodes.find((n) => n.depth === step) || currentData.nodes.find((n) => n.label === step);
    if (active) {
      select(active.id);
      svg.transition().duration(400).call(
        zoom.transform,
        d3.zoomIdentity.translate(width / 2 - active.x, height / 2 - active.y).scale(1.4),
      );
    }
  }

  function resize() {
    width = container.clientWidth || width;
    height = container.clientHeight || height;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    simulation.force("center", d3.forceCenter(width / 2, height / 2)).alpha(0.4).restart();
  }
  new ResizeObserver(resize).observe(container);

  svg.on("click", () => {
    selectedId = null;
    applySelectionClasses();
    handlers.onSelect(null);
  });

  return {
    setData,
    setLayout,
    zoomIn: () => zoomBy(1.3),
    zoomOut: () => zoomBy(1 / 1.3),
    fit,
    exportSVG,
    highlightTrail,
    select,
    onSelect: (fn) => { handlers.onSelect = fn; },
    onHover: (fn) => { handlers.onHover = fn; },
    getData: () => currentData,
  };
}

function normalize(data) {
  // Ensure nodes/edges shape, dedupe by id, preserve edge weights/flags.
  const nodes = (data.nodes || []).map((n) => ({ ...n }));
  const edgesIn = data.edges || data.trail_edges || [];
  const trailIds = new Set((data.trail_edges || []).map((e) => `${e.source}->${e.target}:${e.relation}`));
  const edges = edgesIn.map((e) => ({
    source: e.source.id ?? e.source,
    target: e.target.id ?? e.target,
    relation: e.relation,
    weight: e.weight ?? 0.5,
    on_trail: trailIds.has(`${e.source}->${e.target}:${e.relation}`),
  }));
  return {
    kind: data.kind || "describe",
    entity: data.entity || (nodes.find((n) => n.depth === 0) || {}).label,
    nodes,
    edges,
  };
}

function drag(simulation) {
  // `moved` lets us distinguish a real drag from a bare click — the d3
  // drag behaviour fires `start` and `end` on every mousedown/mouseup
  // pair, so reheating the simulation in `start` would shake the whole
  // graph every time the user clicks a node. We only reheat once the
  // first `drag` event arrives, and we leave the node pinned at its
  // dropped position so manual rearrangements stick.
  let moved = false;
  return d3
    .drag()
    .on("start", (event, d) => {
      moved = false;
      d.fx = d.x;
      d.fy = d.y;
    })
    .on("drag", (event, d) => {
      if (!moved) {
        moved = true;
        if (!event.active) simulation.alphaTarget(0.1).restart();
      }
      d.fx = event.x;
      d.fy = event.y;
    })
    .on("end", (event, d) => {
      if (moved) {
        if (!event.active) simulation.alphaTarget(0);
        // keep d.fx / d.fy where the user dropped the node so the
        // layout doesn't snap back when forces resume
      } else {
        // unmoved click — release the temporary pin set in `start`
        d.fx = null;
        d.fy = null;
      }
    });
}

function escape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function collectStyles() {
  const sheets = Array.from(document.styleSheets);
  const out = [];
  for (const sheet of sheets) {
    try {
      for (const rule of sheet.cssRules) out.push(rule.cssText);
    } catch (_) {
      // cross-origin - skip
    }
  }
  return out.join("\n");
}
