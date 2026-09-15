/* =========================================================
   方域大陆 Leon's 地铁换乘系统
   —— 直接从 SVG 标注（data-*）解析路网，实现换乘查询与地图高亮
   ========================================================= */
(function () {
  "use strict";

  // 外部 SVG 文件名：通过 http(s) 打开时会优先加载它（保持单一数据源）；
  // 通过 file:// 直接双击打开时，则使用 index.html 内联的副本。
  const SVG_FILE = "方域大陆Leon's运营图svg重绘.svg";
  const SVG_NS = "http://www.w3.org/2000/svg";

  // ── 线路“时长量”配置 ─────────────────────────────────
  // 时长量 = 每单位画布距离所需的分钟数（数值越大 = 越慢 = 同样距离花更多时间）。
  // 乘车段耗时 = 线段在图上的长度 × 该线路时长量 + rideBase（每段停站开销）。
  // 未登记的线路（含以后新增的）一律用 DEFAULT_LINE_RATE 兜底。
  const DEFAULT_LINE_RATE = 0.010;   // ≈ 每分钟 8 个画布单位（等价于原来的全局速度）

  const LINE_RATES = {
    // 想调某条线的快慢，直接改它后面的数字即可（数值越大 = 越慢）
    "碉堡1号线": 0.010,
    "碉堡2号线": 0.010,
    "碉堡3号线": 0.010,
    "碉堡3号线支线": 0.010,
    "碉堡4号线": 0.010,
    "碉堡5号线": 0.010,
    "便捷云巴": 0.010,
    "远洋南大陆西线": 0.010,
    "碉堡耀青城际": 0.010,
    "耀青市域轻轨西线": 0.010,
    "耀青市域轻轨东线": 0.010,
    "耀青环中心城区线": 0.010,
    "耀青公交1线": 0.010
  };
  // 查表：有专属时长量就用它，没有则用默认兜底
  function lineRate(lineName) {
    return Object.prototype.hasOwnProperty.call(LINE_RATES, lineName) ? LINE_RATES[lineName] : DEFAULT_LINE_RATE;
  }

  // ── 出站换乘“时长量”配置 ─────────────────────────
  // 出站换乘（走虚拟换乘线段）耗时 = 线段长度 × WALK_RATE + outBase（进出站固定开销）。
  // WALK_RATE 是所有出站换乘共用的统一常量（换乘不属于某条线路，故不分线路），数值越大 = 步行越慢。
  const WALK_RATE = 0.04;   // 每单位画布距离的步行分钟数（初值取乘车时长量的 2 倍，步行更慢；可自由调整）

  // 权重方案：不同出行偏好使用不同的代价模型（乘车快慢由 LINE_RATES 决定，出站换乘快慢由 WALK_RATE 决定）
  const PROFILES = {
    recommend: { mode: "distance", rideBase: 0.4, inXfer: 2.5, outBase: 3.0 },
    transfer:  { mode: "distance", rideBase: 0.4, inXfer: 9,   outBase: 13 },
    stops:     { mode: "count",    rideCost: 1,   inXfer: 2,   outBase: 3 }
  };

  // 用于展示“预计耗时 / 步行时间”的固定估算模型（与所选路线偏好无关）
  const EST = PROFILES.recommend;

  // 全局状态
  const state = {
    net: null,          // 解析出的路网
    graph: null,        // 当前偏好下的图
    profile: "recommend",
    origin: null,       // 站点 id
    dest: null,
    lastLegs: null
  };

  /* ---------- 小工具 ---------- */
  function svgEl(tag) { return document.createElementNS(SVG_NS, tag); }
  function cleanName(name) { return (name || "").replace(/_/g, "").trim(); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function nodeKey(id, line) { return id + "\u0000" + line; }

  function measure(els) {
    let total = 0;
    els.forEach(function (e) {
      if (e.tagName === "path") { try { total += e.getTotalLength(); } catch (x) {} }
      else if (e.tagName === "line") {
        const x1 = +e.getAttribute("x1"), y1 = +e.getAttribute("y1");
        const x2 = +e.getAttribute("x2"), y2 = +e.getAttribute("y2");
        total += Math.hypot(x2 - x1, y2 - y1);
      }
    });
    return total;
  }

  /* ---------- 1. 解析 SVG 数据 ---------- */
  function extractData(root) {
    const stations = {};
    const segments = [];
    const transfers = [];

    // 站点
    root.querySelectorAll("[data-station-id]").forEach(function (el) {
      const id = (el.getAttribute("data-station-id") || "").trim();
      if (!id) return;
      let x, y;
      if (el.tagName === "circle") {
        x = +el.getAttribute("cx"); y = +el.getAttribute("cy");
      } else {
        try { const b = el.getBBox(); x = b.x + b.width / 2; y = b.y + b.height / 2; }
        catch (e) { x = 0; y = 0; }
      }
      if (!stations[id]) {
        stations[id] = {
          id: id,
          name: cleanName(el.getAttribute("data-station-name") || id),
          rawName: el.getAttribute("data-station-name") || id,
          x: x, y: y, els: [],
          lines: new Set(), transfers: new Set()
        };
      }
      stations[id].els.push(el);
    });

    // 线段
    root.querySelectorAll("[data-line-type]").forEach(function (el) {
      const type = el.getAttribute("data-line-type");
      const tag = el.tagName;
      if (type === "metro") {
        const line = el.getAttribute("data-line") || "未命名线路";
        const conn = el.getAttribute("data-connet") || el.getAttribute("data-connect") || "";
        const parts = conn.split(",").map(function (s) { return s.trim(); });
        const a = parts[0], b = parts[1];
        if (!a || !b || !stations[a] || !stations[b]) return;
        // 收集真正被绘制的线条子元素（排除白色虚线刻度）
        const els = [];
        if (tag === "line" || tag === "path") els.push(el);
        else {
          el.querySelectorAll(":scope > line, :scope > path").forEach(function (c) {
            const st = getComputedStyle(c);
            if (st.fill === "none" && parseFloat(st.strokeWidth) >= 3) els.push(c);
          });
          if (!els.length) { const f = el.querySelector("line, path"); if (f) els.push(f); }
        }
        let color = null;
        const probe = (tag === "line" || tag === "path") ? el : els[0];
        if (probe) { const st = getComputedStyle(probe); if (st.stroke && st.stroke !== "none") color = st.stroke; }
        segments.push({ a: a, b: b, line: line, els: els, color: color, length: measure(els) });
      } else if (type === "transfer") {
        const conn = el.getAttribute("data-line-change") || "";
        const parts = conn.split(",").map(function (s) { return s.trim(); });
        const a = parts[0], b = parts[1];
        if (!a || !b || !stations[a] || !stations[b]) return;
        const els = (tag === "path" || tag === "line") ? [el] : Array.prototype.slice.call(el.querySelectorAll("path,line"));
        transfers.push({ a: a, b: b, els: els, length: measure(els) });
      }
    });

    // 由线段推导每条线路所经过的站点（比 data-station-line 更准确、可容错）
    segments.forEach(function (s) {
      stations[s.a].lines.add(s.line);
      stations[s.b].lines.add(s.line);
    });
    transfers.forEach(function (t) {
      stations[t.a].transfers.add(t.b);
      stations[t.b].transfers.add(t.a);
    });

    // 线路信息（颜色 + 站点顺序）
    const lines = {};
    segments.forEach(function (s) {
      if (!lines[s.line]) lines[s.line] = { name: s.line, color: s.color || "#8a94a6", segs: [] };
      if (s.color && lines[s.line].color === "#8a94a6") lines[s.line].color = s.color;
      lines[s.line].segs.push(s);
    });
    Object.keys(lines).forEach(function (ln) { lines[ln].order = orderLine(lines[ln].segs); });

    return { stations: stations, segments: segments, transfers: transfers, lines: lines };
  }

  // 沿一条线路走出站点顺序（用于判断乘车方向 / 终点站）
  function orderLine(segs) {
    const adj = {};
    segs.forEach(function (s) {
      (adj[s.a] = adj[s.a] || []).push(s.b);
      (adj[s.b] = adj[s.b] || []).push(s.a);
    });
    const nodes = Object.keys(adj);
    if (!nodes.length) return [];
    let start = nodes.find(function (n) { return adj[n].length === 1; }) || nodes[0];
    const seq = [], seen = new Set();
    let cur = start, prev = null;
    while (cur && !seen.has(cur)) {
      seen.add(cur); seq.push(cur);
      const nxt = adj[cur].find(function (n) { return n !== prev && !seen.has(n); });
      prev = cur; cur = nxt;
    }
    nodes.forEach(function (n) { if (!seen.has(n)) seq.push(n); });
    return seq;
  }

  /* ---------- 2. 构建带权图 ---------- */
  function buildGraph(net, profile) {
    const P = PROFILES[profile] || PROFILES.recommend;
    const adj = new Map();
    function add(k1, k2, w, meta) {
      if (!adj.has(k1)) adj.set(k1, []);
      // 注意：必须让 { to, w } 覆盖 meta，避免 meta 里的同名字段（如 to）污染边的目标节点
      adj.get(k1).push(Object.assign({}, meta, { to: k2, w: w }));
    }
    function rideW(seg) {
      return P.mode === "count" ? P.rideCost : seg.length * lineRate(seg.line) + P.rideBase;
    }

    // 乘车边
    net.segments.forEach(function (s) {
      const w = rideW(s);
      const k1 = nodeKey(s.a, s.line), k2 = nodeKey(s.b, s.line);
      add(k1, k2, w, { kind: "ride", line: s.line, seg: s });
      add(k2, k1, w, { kind: "ride", line: s.line, seg: s });
    });
    // 站内换乘边（同一站不同线路之间）
    Object.keys(net.stations).forEach(function (id) {
      const ls = Array.from(net.stations[id].lines);
      for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) {
        const k1 = nodeKey(id, ls[i]), k2 = nodeKey(id, ls[j]);
        add(k1, k2, P.inXfer, { kind: "xfer-in", station: id });
        add(k2, k1, P.inXfer, { kind: "xfer-in", station: id });
      }
    });
    // 出站（步行）换乘边
    net.transfers.forEach(function (t) {
      const walkMin = t.length * WALK_RATE + P.outBase;
      const la = Array.from(net.stations[t.a].lines);
      const lb = Array.from(net.stations[t.b].lines);
      la.forEach(function (l1) {
        lb.forEach(function (l2) {
          const k1 = nodeKey(t.a, l1), k2 = nodeKey(t.b, l2);
          add(k1, k2, walkMin, { kind: "xfer-out", seg: t });
          add(k2, k1, walkMin, { kind: "xfer-out", seg: t });
        });
      });
    });
    return { adj: adj, profile: P };
  }

  /* ---------- 3. Dijkstra ---------- */
  function MinHeap() { this.a = []; }
  MinHeap.prototype.push = function (key, priority) {
    this.a.push({ key: key, priority: priority });
    let i = this.a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (this.a[p].priority <= this.a[i].priority) break; const t = this.a[p]; this.a[p] = this.a[i]; this.a[i] = t; i = p; }
  };
  MinHeap.prototype.pop = function () {
    const top = this.a[0], last = this.a.pop();
    if (this.a.length) {
      this.a[0] = last;
      let i = 0, n = this.a.length;
      for (;;) { let l = 2 * i + 1, r = l + 1, s = i;
        if (l < n && this.a[l].priority < this.a[s].priority) s = l;
        if (r < n && this.a[r].priority < this.a[s].priority) s = r;
        if (s === i) break; const t = this.a[s]; this.a[s] = this.a[i]; this.a[i] = t; i = s; }
    }
    return top;
  };

  function route(net, graph, startId, endId) {
    const st = net.stations[startId], en = net.stations[endId];
    if (!st || !en) return null;
    const startLines = Array.from(st.lines), endSet = new Set(Array.from(en.lines));
    if (!startLines.length || !endSet.size) return null;

    const dist = new Map(), prev = new Map(), visited = new Set();
    const pq = new MinHeap();
    startLines.forEach(function (l) { const k = nodeKey(startId, l); dist.set(k, 0); pq.push(k, 0); });

    let endNode = null;
    while (pq.a.length) {
      const cur = pq.pop(); const u = cur.key; const du = cur.priority;
      if (visited.has(u)) continue;
      visited.add(u);
      const uStation = u.split("\u0000")[0];
      if (uStation === endId && endSet.has(u.split("\u0000")[1])) { endNode = u; break; }
      const edges = graph.adj.get(u) || [];
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        if (visited.has(e.to)) continue;
        const nd = du + e.w;
        if (nd < (dist.has(e.to) ? dist.get(e.to) : Infinity)) {
          dist.set(e.to, nd); prev.set(e.to, { from: u, edge: e }); pq.push(e.to, nd);
        }
      }
    }
    if (!endNode) return null;

    const path = []; let c = endNode;
    while (c) { const p = prev.get(c); path.unshift({ node: c, edge: p ? p.edge : null }); c = p ? p.from : null; }
    return { path: path, cost: dist.get(endNode) };
  }

  /* ---------- 4. 路径 -> 行程段 ---------- */
  function pathToLegs(result) {
    const legs = [];
    for (let i = 1; i < result.path.length; i++) {
      const cur = result.path[i], e = cur.edge;
      if (!e) continue;
      const cs = cur.node.split("\u0000");
      const curStation = cs[0], curLine = cs[1];
      const prevStation = result.path[i - 1].node.split("\u0000")[0];
      if (e.kind === "ride") {
        const last = legs[legs.length - 1];
        if (last && last.type === "ride" && last.line === curLine && last.stations[last.stations.length - 1] === prevStation) {
          last.stations.push(curStation); last.segs.push(e.seg);
        } else {
          legs.push({ type: "ride", line: curLine, stations: [prevStation, curStation], segs: [e.seg] });
        }
      } else if (e.kind === "xfer-in") {
        legs.push({ type: "xfer-in", station: curStation });
      } else if (e.kind === "xfer-out") {
        legs.push({ type: "xfer-out", from: prevStation, to: curStation, seg: e.seg });
      }
    }
    return legs;
  }

  function directionName(net, lineName, from, to) {
    const seq = net.lines[lineName] && net.lines[lineName].order;
    if (!seq || seq.length < 2) return null;
    const i = seq.indexOf(from), j = seq.indexOf(to);
    if (i < 0 || j < 0 || i === j) return null;
    const terminus = (j > i) ? seq[seq.length - 1] : seq[0];
    return net.stations[terminus] ? net.stations[terminus].name : null;
  }

  /* ---------- 5. 渲染结果 ---------- */
  function lineColor(net, name) { return (net.lines[name] && net.lines[name].color) || "#8a94a6"; }

  function badge(net, name, cls) {
    const span = document.createElement("span");
    span.className = "badge " + (cls || "");
    span.style.background = lineColor(net, name);
    span.textContent = name;
    return span;
  }

  function computeStats(net, legs) {
    let stops = 0, rides = 0, transfers = 0, walkMin = 0, minutes = 0;
    legs.forEach(function (leg) {
      if (leg.type === "ride") {
        rides++; stops += leg.stations.length - 1;
        leg.segs.forEach(function (s) { minutes += s.length * lineRate(s.line) + EST.rideBase; });
      } else if (leg.type === "xfer-in") { transfers++; minutes += EST.inXfer; }
      else if (leg.type === "xfer-out") {
        transfers++;
        const wk = leg.seg.length * WALK_RATE;
        minutes += wk + EST.outBase; walkMin += wk;
      }
    });
    return { stops: stops, rides: rides, transfers: transfers, walkMin: walkMin, minutes: minutes };
  }

  function renderResult() {
    const box = document.getElementById("result");
    box.innerHTML = "";
    const net = state.net;
    if (!state.origin || !state.dest) {
      clearHighlight();   // 只选了起点（或都未选）时，清除上一次查询残留的路线高亮
      box.appendChild(emptyState("选择<b>起点</b>与<b>终点</b>站点<br>即可查询换乘方案<br><br>也可以在右侧地图上<br>直接<b>点击站点</b>进行选择"));
      return;
    }
    if (state.origin === state.dest) {
      box.appendChild(emptyState("起点与终点相同 🙃<br>请选择两个不同的站点"));
      clearHighlight();
      return;
    }

    const graph = buildGraph(net, state.profile);
    const result = route(net, graph, state.origin, state.dest);
    if (!result) {
      const d = document.createElement("div");
      d.className = "error-card";
      d.textContent = "抱歉，未能找到连通这两个站点的换乘方案。";
      box.appendChild(d);
      clearHighlight();
      return;
    }

    const legs = pathToLegs(result);
    state.lastLegs = legs;
    const stats = computeStats(net, legs);
    const o = net.stations[state.origin], e = net.stations[state.dest];

    // 概览
    const sum = document.createElement("div");
    sum.className = "summary";
    sum.innerHTML =
      '<div class="cell hl"><div class="v">' + Math.round(stats.minutes) + '<small>分钟</small></div><div class="k">预计全程</div></div>' +
      '<div class="cell"><div class="v">' + stats.stops + '<small>站</small></div><div class="k">途经站数</div></div>' +
      '<div class="cell"><div class="v">' + stats.transfers + '<small>次</small></div><div class="k">换乘次数</div></div>' +
      '<div class="cell"><div class="v">' + (stats.walkMin > 0 ? Math.max(1, Math.round(stats.walkMin)) : 0) + '<small>分钟</small></div><div class="k">步行</div></div>';
    box.appendChild(sum);

    // 起终点
    const od = document.createElement("div");
    od.className = "route-od";
    od.innerHTML = '<b>' + o.name + '</b><span class="arrow">➜</span><b>' + e.name + '</b>' +
      '<span style="margin-left:auto;font-size:12px;color:var(--ink-faint)">' + profileLabel() + '</span>';
    box.appendChild(od);

    // 线路预览条
    box.appendChild(buildLineStrip(net, legs));

    // 步骤
    const steps = document.createElement("div");
    steps.className = "steps";
    buildSteps(net, legs, steps);
    box.appendChild(steps);

    highlightRoute(legs);
  }

  function profileLabel() {
    return { recommend: "推荐路线", transfer: "最少换乘", stops: "最少站点" }[state.profile] || "";
  }

  function emptyState(html) {
    const d = document.createElement("div");
    d.className = "empty-state";
    d.innerHTML = '<div class="emoji">🚇</div><p>' + html + "</p>";
    return d;
  }

  function buildLineStrip(net, legs) {
    const strip = document.createElement("div");
    strip.className = "line-strip";
    legs.forEach(function (leg, idx) {
      if (leg.type === "ride") {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.style.background = lineColor(net, leg.line);
        chip.textContent = leg.line;
        strip.appendChild(chip);
      } else if (leg.type === "xfer-out") {
        const chip = document.createElement("span");
        chip.className = "chip walk-chip";
        chip.textContent = "🚶 出站换乘";
        strip.appendChild(chip);
      } else if (leg.type === "xfer-in") {
        const chip = document.createElement("span");
        chip.className = "chip walk-chip";
        chip.style.background = "#f5a623";
        chip.textContent = "⇄ 站内换乘";
        strip.appendChild(chip);
      }
      if (idx < legs.length - 1) {
        const sep = document.createElement("span"); sep.className = "sep"; sep.textContent = "›";
        strip.appendChild(sep);
      }
    });
    return strip;
  }

  function buildSteps(net, legs, container) {
    // 起点行
    const firstColor = (legs.length && legs[0].type === "ride") ? lineColor(net, legs[0].line) : "#dfe4ec";
    container.appendChild(endpointRow(net, state.origin, "start", firstColor));

    legs.forEach(function (leg, idx) {
      if (leg.type === "ride") {
        const from = leg.stations[0], to = leg.stations[leg.stations.length - 1];
        const dir = directionName(net, leg.line, from, to);
        const via = leg.stations.slice(1, -1);
        const n = leg.stations.length - 1;
        const color = lineColor(net, leg.line);
        const el = document.createElement("div");
        el.className = "step ride";
        el.innerHTML =
          '<div class="step-node"><div class="track" style="background:' + color + '"></div></div>' +
          '<div class="step-body">' +
            '<div class="step-head"><span class="badge-holder"></span>' +
              '<span class="ride-n">乘坐 ' + n + ' 站</span></div>' +
            '<div class="step-desc">' + (dir ? '往 <span class="toward">' + dir + '</span> 方向' : '沿本线行进') +
              (via.length ? viaToggleHTML(net, via) : '') + '</div>' +
          '</div>';
        el.querySelector(".badge-holder").replaceWith(badge(net, leg.line));
        container.appendChild(el);
        wireViaToggle(el, net, via);
      } else {
        const nextRide = legs[idx + 1];
        const el = document.createElement("div");
        el.className = "step transfer";
        if (leg.type === "xfer-in") {
          const trackColor = (nextRide && nextRide.type === "ride") ? lineColor(net, nextRide.line) : "#dfe4ec";
          const s = net.stations[leg.station];
          el.innerHTML =
            '<div class="step-node"><div class="marker"></div><div class="track" style="background:' + trackColor + '"></div></div>' +
            '<div class="step-body"><div class="step-head">' + s.name +
              '<span class="xfer-tag in">站内换乘</span><span class="sid">' + leg.station + '</span></div>' +
              '<div class="step-desc">在此站换乘 ' + ((nextRide && nextRide.type === "ride") ? '<b>' + nextRide.line + '</b>' : '其他线路') + '</div></div>';
        } else {
          const wk = Math.max(1, Math.round(leg.seg.length * WALK_RATE));
          const a = net.stations[leg.from], b = net.stations[leg.to];
          el.innerHTML =
            '<div class="step-node"><div class="marker"></div><div class="track walk-track"></div></div>' +
            '<div class="step-body"><div class="step-head">🚶 出站换乘' +
              '<span class="sid">' + leg.from + ' → ' + leg.to + '</span></div>' +
              '<div class="step-desc"><span class="walk">从 <b>' + a.name + '</b> 出站，步行约 <b>' + wk + '</b> 分钟至 <b>' + b.name + '</b></span></div></div>';
        }
        container.appendChild(el);
      }
    });

    // 终点行
    container.appendChild(endpointRow(net, state.dest, "end", null));
  }

  function endpointRow(net, id, cls, trackColor) {
    const s = net.stations[id];
    const isStart = cls === "start";
    const el = document.createElement("div");
    el.className = "step " + cls;
    const lineBadges = Array.from(s.lines).map(function (l) {
      return '<span class="badge" style="background:' + lineColor(net, l) + ';font-size:11px;height:19px;padding:0 7px">' + l + "</span>";
    }).join(" ");
    const track = (cls === "end") ? "" : '<div class="track" style="background:' + (trackColor || "#dfe4ec") + '"></div>';
    el.innerHTML =
      '<div class="step-node"><div class="marker"></div>' + track + "</div>" +
      '<div class="step-body"><div class="step-head">' +
        '<span class="ep-label" style="color:' + (isStart ? "var(--ok)" : "var(--accent)") + '">' + (isStart ? "出发" : "到达") + '</span>' +
        s.name + '<span class="sid">' + id + "</span></div>" +
        '<div class="step-desc" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;align-items:center">' + lineBadges +
        (s.transfers.size ? '<span style="font-size:11.5px;color:var(--ink-faint)">· 邻近可出站换乘</span>' : "") +
        "</div></div>";
    return el;
  }

  function viaToggleHTML(net, via) {
    return '<button class="via-toggle" type="button"><span class="caret">▶</span>途经 ' + via.length + " 站</button>" +
      '<div class="via-list" hidden>' + via.map(function (id) {
        return '<div class="via-item" data-id="' + id + '">' + net.stations[id].name + "</div>";
      }).join("") + "</div>";
  }

  function wireViaToggle(rootEl, net, via) {
    const btn = rootEl.querySelector(".via-toggle");
    if (!btn) return;
    const list = rootEl.querySelector(".via-list");
    btn.addEventListener("click", function () {
      const open = list.hasAttribute("hidden");
      if (open) { list.removeAttribute("hidden"); btn.classList.add("open"); }
      else { list.setAttribute("hidden", ""); btn.classList.remove("open"); }
    });
    list.querySelectorAll(".via-item").forEach(function (it) {
      it.addEventListener("click", function () { focusStation(it.getAttribute("data-id")); });
    });
  }

  /* ---------- 6. 地图高亮 ---------- */
  function getSvg() { return document.getElementById("metro-map"); }

  function ensureLayers(svg) {
    ["halo-layer", "glow-layer", "stroke-layer", "marker-layer"].forEach(function (id) {
      if (svg.querySelector("#" + id)) return;
      const g = svgEl("g"); g.id = id; g.setAttribute("pointer-events", "none");
      const ref = svg.querySelector("#字例") || svg.querySelector("#图例");
      if (ref) svg.insertBefore(g, ref); else svg.appendChild(g);
    });
  }

  function clearHighlight() {
    const svg = getSvg(); if (!svg) return;
    svg.classList.remove("has-route");
    svg.querySelectorAll(".on-route").forEach(function (e) { e.classList.remove("on-route"); });
    ["glow-layer", "stroke-layer", "marker-layer"].forEach(function (id) {
      const l = svg.querySelector("#" + id); if (l) l.innerHTML = "";
    });
  }

  function overlayFrom(srcEl, layer, cls, color, width) {
    let node = null;
    if (srcEl.tagName === "path") { node = svgEl("path"); node.setAttribute("d", srcEl.getAttribute("d")); }
    else if (srcEl.tagName === "line") {
      node = svgEl("line");
      ["x1", "y1", "x2", "y2"].forEach(function (a) { node.setAttribute(a, srcEl.getAttribute(a)); });
    }
    if (!node) return;
    node.setAttribute("class", cls);
    if (color) node.setAttribute("stroke", color);
    if (width) node.setAttribute("stroke-width", width);
    layer.appendChild(node);
  }

  function highlightRoute(legs) {
    const svg = getSvg(); if (!svg) return;
    clearHighlight();
    ensureLayers(svg);
    const net = state.net;
    const glow = svg.querySelector("#glow-layer");
    const stroke = svg.querySelector("#stroke-layer");
    const marker = svg.querySelector("#marker-layer");
    const onRoute = new Set();

    legs.forEach(function (leg) {
      if (leg.type === "ride") {
        const color = lineColor(net, leg.line);
        leg.stations.forEach(function (s) { onRoute.add(s); });
        leg.segs.forEach(function (seg) {
          seg.els.forEach(function (el) {
            el.classList.add("on-route");
            if (el.parentElement && el.parentElement.hasAttribute("data-line-type")) el.parentElement.classList.add("on-route");
            overlayFrom(el, glow, "route-glow", null, 24);
            overlayFrom(el, stroke, "route-stroke", color, 12);
          });
        });
      } else if (leg.type === "xfer-out") {
        onRoute.add(leg.from); onRoute.add(leg.to);
        leg.seg.els.forEach(function (el) {
          el.classList.add("on-route");
          if (el.parentElement && el.parentElement.hasAttribute("data-line-type")) el.parentElement.classList.add("on-route");
          overlayFrom(el, stroke, "route-stroke walk", "#ff5c8a", 10);
        });
      } else if (leg.type === "xfer-in") {
        onRoute.add(leg.station);
      }
    });

    onRoute.forEach(function (id) {
      const s = net.stations[id]; if (s) s.els.forEach(function (el) { el.classList.add("on-route"); });
    });

    // 端点标记
    [state.origin, state.dest].forEach(function (id, i) {
      const s = net.stations[id]; if (!s) return;
      const c = svgEl("circle");
      c.setAttribute("cx", s.x); c.setAttribute("cy", s.y); c.setAttribute("r", 21);
      c.setAttribute("class", "endpoint-ring " + (i === 0 ? "origin" : "dest"));
      marker.appendChild(c);
    });

    svg.classList.add("has-route");
  }

  /* ---------- 7. 地图交互：平移 / 缩放 / 悬浮 / 点击 ---------- */
  let vb = { x: 0, y: 0, w: 2600, h: 1964 };
  let vbHome = null;

  // 平移越界余量：允许视口略微超出原图边界（占原图宽/高的比例），
  // 既不会把地图拖丢，又能看清边缘站点。
  const PAN_MARGIN = 0.15;

  // 缩放范围：基于原图尺寸计算，避免硬编码数值与地图脱节。
  //   minW = 原图宽 × 0.06 → 最大可放大到约 16 倍；
  //   maxW = 原图宽 × 2.6  → 最大可缩小到看到约 2.6 张原图。
  function zoomBounds() {
    return { min: vbHome.w * 0.5, max: vbHome.w * 2 };
  }

  // 约束视口位置：把 viewBox 限制在「原图 + 余量」范围内，防止无限拖拽。
  function clampPan() {
    if (!vbHome) return;
    const mx = vbHome.w * PAN_MARGIN, my = vbHome.h * PAN_MARGIN;
    const loX = vbHome.x - mx, hiX = vbHome.x + vbHome.w + mx - vb.w;
    const loY = vbHome.y - my, hiY = vbHome.y + vbHome.h + my - vb.h;
    // 当视口比允许范围还大（缩得很小）时，loX > hiX，此时居中显示。
    vb.x = (loX > hiX) ? (loX + hiX) / 2 : clamp(vb.x, loX, hiX);
    vb.y = (loY > hiY) ? (loY + hiY) / 2 : clamp(vb.y, loY, hiY);
  }

  function applyViewBox() {
    const svg = getSvg(); if (!svg) return;
    clampPan();
    svg.setAttribute("viewBox", vb.x + " " + vb.y + " " + vb.w + " " + vb.h);
  }
  function readViewBox(svg) {
    const attr = svg.getAttribute("viewBox");
    if (attr) { const p = attr.split(/[\s,]+/).map(Number); if (p.length === 4 && p.every(function (n) { return !isNaN(n); })) { vb = { x: p[0], y: p[1], w: p[2], h: p[3] }; } }
    vbHome = { x: vb.x, y: vb.y, w: vb.w, h: vb.h };
  }
  function clientToSvg(svg, cx, cy) {
    const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
    const m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 };
    return pt.matrixTransform(m.inverse());
  }

  // 命中站点：优先用按下时命中的元素；否则在阈值内寻找最近站点（更宽容的点击）
  function pickStation(hitEl, clientPt) {
    if (hitEl) return hitEl.getAttribute("data-station-id");
    if (!clientPt || !state.net) return null;
    const svg = getSvg(); if (!svg) return null;
    const p = clientToSvg(svg, clientPt.x, clientPt.y);
    const m = svg.getScreenCTM();
    const threshold = m ? (22 / m.a) : 40;   // 约 22 屏幕像素换算为用户单位
    let best = null, bestD = Infinity;
    Object.keys(state.net.stations).forEach(function (id) {
      const s = state.net.stations[id];
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestD) { bestD = d; best = id; }
    });
    return (best !== null && bestD <= threshold) ? best : null;
  }

  function setupMap() {
    const svg = getSvg();
    const wrap = document.getElementById("map-container");
    readViewBox(svg);
    ensureLayers(svg);

    // 让站名文字层与图例层不拦截鼠标事件，保证站点圆点可被直接点击 / 悬浮
    ["字例", "图例"].forEach(function (gid) {
      const g = document.getElementById(gid);
      if (g) g.style.pointerEvents = "none";
    });

    // 缩放
    wrap.addEventListener("wheel", function (e) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 0.86 : 1.16;
      const p = clientToSvg(svg, e.clientX, e.clientY);
      const zb = zoomBounds();
      const newW = clamp(vb.w * factor, zb.min, zb.max);
      const ratio = newW / vb.w;
      vb.x = p.x - (p.x - vb.x) * ratio;
      vb.y = p.y - (p.y - vb.y) * ratio;
      vb.w = newW; vb.h = vb.h * ratio;
      applyViewBox();
    }, { passive: false });

    // 平移 + 点击选站
    let dragging = false, moved = false, last = null, downTarget = null, downPt = null;
    svg.addEventListener("pointerdown", function (e) {
      e.preventDefault();   // 阻止拖动时浏览器选中站名文字（配合 CSS user-select）
      dragging = true; moved = false;
      last = { x: e.clientX, y: e.clientY };
      downPt = { x: e.clientX, y: e.clientY };
      // 在按下瞬间记录命中的站点：setPointerCapture 会把后续 click 重定向到 <svg>，
      // 所以不能依赖 click 事件的 e.target，必须在这里取。
      downTarget = (e.target.closest && e.target.closest("[data-station-id]")) || null;
      try { svg.setPointerCapture(e.pointerId); } catch (x) {}
      svg.classList.add("dragging");
    });
    svg.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
      const m = svg.getScreenCTM(); if (!m) return;
      vb.x -= dx / m.a; vb.y -= dy / m.d;
      last = { x: e.clientX, y: e.clientY };
      applyViewBox();
    });
    function finishDrag(cancelled) {
      svg.classList.remove("dragging");
      if (dragging && !moved && !cancelled) {
        const id = pickStation(downTarget, downPt);
        if (id) onStationClick(id);
      }
      dragging = false; downTarget = null; downPt = null;
    }
    svg.addEventListener("pointerup", function () { finishDrag(false); });
    svg.addEventListener("pointercancel", function () { finishDrag(true); });

    // 悬浮提示
    const tip = document.getElementById("map-tooltip");
    svg.addEventListener("mouseover", function (e) {
      const el = e.target.closest && e.target.closest("[data-station-id]");
      if (!el) return;
      const s = state.net.stations[el.getAttribute("data-station-id")];
      if (!s) return;
      showHalo(s);
      tip.innerHTML = '<div class="tt-name">' + s.name + ' <span style="opacity:.5;font-size:11px">' + s.id + "</span></div>" +
        '<div class="tt-lines">' + Array.from(s.lines).join(" · ") + "</div>" +
        '<div class="tt-hint">点击设为起点 / 终点</div>';
      const r = wrap.getBoundingClientRect();
      tip.style.left = (e.clientX - r.left) + "px";
      tip.style.top = (e.clientY - r.top) + "px";
      tip.classList.add("show");
    });
    svg.addEventListener("mousemove", function (e) {
      if (!tip.classList.contains("show")) return;
      const r = wrap.getBoundingClientRect();
      tip.style.left = (e.clientX - r.left) + "px";
      tip.style.top = (e.clientY - r.top) + "px";
    });
    svg.addEventListener("mouseout", function (e) {
      const el = e.target.closest && e.target.closest("[data-station-id]");
      if (!el) return;
      hideHalo(); tip.classList.remove("show");
    });

    // 工具按钮
    document.getElementById("zoom-in").addEventListener("click", function () { zoomBy(0.8); });
    document.getElementById("zoom-out").addEventListener("click", function () { zoomBy(1.25); });
    document.getElementById("zoom-reset").addEventListener("click", function () { vb = Object.assign({}, vbHome); applyViewBox(); });
    document.getElementById("clear-route").addEventListener("click", function () {
      state.origin = null; state.dest = null;
      syncFields(); clearHighlight(); renderResult();
    });
  }

  function zoomBy(factor) {
    const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
    const zb = zoomBounds();
    const newW = clamp(vb.w * factor, zb.min, zb.max);
    const ratio = newW / vb.w;
    vb.w = newW; vb.h = vb.h * ratio;
    vb.x = cx - vb.w / 2; vb.y = cy - vb.h / 2;
    applyViewBox();
  }

  function showHalo(s) {
    const svg = getSvg(); const layer = svg.querySelector("#halo-layer");
    if (!layer) return;
    layer.innerHTML = "";
    const c = svgEl("circle");
    c.setAttribute("cx", s.x); c.setAttribute("cy", s.y); c.setAttribute("r", 26);
    c.setAttribute("class", "station-halo show");
    layer.appendChild(c);
  }
  function hideHalo() {
    const svg = getSvg(); const layer = svg && svg.querySelector("#halo-layer");
    if (layer) layer.innerHTML = "";
  }

  function focusStation(id) {
    const s = state.net.stations[id]; if (!s) return;
    const targetW = clamp(vbHome.w * 0.32, 300, vbHome.w);
    const ratio = targetW / vbHome.w;
    vb.w = targetW; vb.h = vbHome.h * ratio;
    vb.x = s.x - vb.w / 2; vb.y = s.y - vb.h / 2;
    applyViewBox();
    showHalo(s); setTimeout(hideHalo, 900);
  }

  function onStationClick(id) {
    if (!state.origin || state.origin === state.dest) { state.origin = id; if (state.origin === state.dest) state.dest = null; }
    else if (!state.dest) { state.dest = id; }
    else { state.origin = id; state.dest = null; }
    if (state.origin === state.dest) state.dest = null;
    syncFields(); renderResult();
  }

  /* ---------- 8. 站点输入框 + 自动补全 ---------- */
  function StationField(inputEl, role) {
    this.input = inputEl;
    this.role = role; // 'origin' | 'dest'
    this.field = inputEl.closest(".station-field");
    this.list = this.field.querySelector(".ac-list");
    this.items = [];
    this.active = -1;
    this.open = false;
    this._wire();
  }
  StationField.prototype._wire = function () {
    const self = this;
    this.input.addEventListener("focus", function () { self._render(self.input.value); self._showList(); });
    this.input.addEventListener("input", function () {
      self.field.classList.toggle("filled", !!self.input.value);
      self._render(self.input.value); self._showList();
    });
    this.input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); self._move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); self._move(-1); }
      else if (e.key === "Enter") { e.preventDefault(); if (self.open) self._choose(self.active >= 0 ? self.active : 0); else self._render(self.input.value), self._showList(); }
      else if (e.key === "Escape") { self._hideList(); self.input.blur(); }
    });
    const clear = this.field.querySelector(".clear");
    if (clear) clear.addEventListener("click", function (e) {
      e.stopPropagation();
      self.input.value = ""; self.field.classList.remove("filled");
      state[self.role] = null; self._render(""); self._showList(); self.input.focus(); renderResult();
    });
    document.addEventListener("click", function (e) {
      if (!self.field.contains(e.target)) self._hideList();
    });
  };
  StationField.prototype._matches = function (q) {
    q = (q || "").trim().toLowerCase();
    const arr = Object.keys(state.net.stations).map(function (id) { return state.net.stations[id]; });
    arr.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    if (!q) return arr;
    return arr.filter(function (s) {
      return s.name.toLowerCase().indexOf(q) >= 0 || s.rawName.toLowerCase().indexOf(q) >= 0 || s.id.toLowerCase().indexOf(q) >= 0;
    });
  };
  StationField.prototype._render = function (q) {
    const self = this;
    const res = this._matches(q);
    this.list.innerHTML = "";
    this.items = res;
    this.active = res.length ? 0 : -1;
    if (!res.length) {
      const d = document.createElement("div"); d.className = "ac-empty"; d.textContent = "未找到匹配站点";
      this.list.appendChild(d); return;
    }
    res.slice(0, 60).forEach(function (s, i) {
      const item = document.createElement("div");
      item.className = "ac-item" + (i === 0 ? " active" : "");
      const linesHTML = Array.from(s.lines).slice(0, 3).map(function (l) {
        return '<span class="badge" style="background:' + lineColor(state.net, l) + ';font-size:10px;height:17px;padding:0 6px;border-radius:5px">' + l + "</span>";
      }).join("");
      item.innerHTML = '<div style="min-width:0"><div class="ac-name">' + s.name + ' <span class="ac-id">' + s.id + "</span></div></div>" +
        '<div class="ac-lines">' + linesHTML + "</div>";
      item.addEventListener("mousedown", function (e) { e.preventDefault(); self._choose(i); });
      item.addEventListener("mouseenter", function () { self._setActive(i); });
      self.list.appendChild(item);
    });
  };
  StationField.prototype._setActive = function (i) {
    this.active = i;
    this.list.querySelectorAll(".ac-item").forEach(function (el, idx) { el.classList.toggle("active", idx === i); });
  };
  StationField.prototype._move = function (d) {
    if (!this.items.length) return;
    let n = this.active + d;
    n = clamp(n, 0, Math.min(this.items.length, 60) - 1);
    this._setActive(n);
    const el = this.list.querySelectorAll(".ac-item")[n];
    if (el) el.scrollIntoView({ block: "nearest" });
  };
  StationField.prototype._choose = function (i) {
    const s = this.items[i]; if (!s) return;
    this.input.value = s.name;
    this.input.dataset.id = s.id;
    this.field.classList.add("filled");
    state[this.role] = s.id;
    // 若与另一端相同则清空另一端
    const other = this.role === "origin" ? "dest" : "origin";
    if (state[other] === s.id) { state[other] = null; const of = window.__fields[other]; if (of) { of.input.value = ""; of.input.dataset.id = ""; of.field.classList.remove("filled"); } }
    this._hideList();
    renderResult();
  };
  StationField.prototype._showList = function () { this.list.removeAttribute("hidden"); this.open = true; };
  StationField.prototype._hideList = function () { this.list.setAttribute("hidden", ""); this.open = false; };

  function syncFields() {
    ["origin", "dest"].forEach(function (role) {
      const f = window.__fields[role]; if (!f) return;
      const id = state[role];
      if (id && state.net.stations[id]) {
        f.input.value = state.net.stations[id].name; f.input.dataset.id = id; f.field.classList.add("filled");
      } else { f.input.value = ""; f.input.dataset.id = ""; f.field.classList.remove("filled"); }
    });
  }

  /* ---------- 9. 初始化 ---------- */
  function bindControls() {
    window.__fields = {
      origin: new StationField(document.getElementById("origin-input"), "origin"),
      dest: new StationField(document.getElementById("dest-input"), "dest")
    };
    document.getElementById("swap-btn").addEventListener("click", function () {
      const t = state.origin; state.origin = state.dest; state.dest = t;
      syncFields(); renderResult();
    });
    document.querySelectorAll(".seg button[data-pref]").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(".seg button[data-pref]").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        state.profile = b.getAttribute("data-pref");
        renderResult();
      });
    });
  }

  function getMapSvg() { return document.querySelector("#map-container svg"); }

  async function init() {
    const container = document.getElementById("map-container");
    const mask = document.getElementById("loading-mask");

    // 通过 http(s) 打开时，优先加载外部最新 SVG（保持单一数据源）
    if (location.protocol === "http:" || location.protocol === "https:") {
      try {
        const res = await fetch(encodeURI(SVG_FILE), { cache: "no-store" });
        if (res.ok) {
          const text = await res.text();
          const k = text.indexOf("<svg");
          if (k >= 0) container.innerHTML = text.slice(k); // 去掉 XML 声明头，仅保留 <svg>
        }
      } catch (e) { /* 保留内联副本 */ }
    }

    const svg = getMapSvg();
    if (!svg) {
      mask.innerHTML = '<div style="text-align:center"><div style="font-size:40px">⚠️</div><p>未能加载地铁图 SVG。</p></div>';
      return;
    }
    svg.id = "metro-map";
    svg.removeAttribute("width"); svg.removeAttribute("height");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    try {
      state.net = extractData(svg);
    } catch (e) {
      mask.innerHTML = '<div style="text-align:center"><div style="font-size:40px">⚠️</div><p>解析 SVG 数据失败：' + e.message + "</p></div>";
      return;
    }

    const count = Object.keys(state.net.stations).length;
    if (!count) {
      mask.innerHTML = '<div style="text-align:center"><div style="font-size:40px">⚠️</div><p>未在 SVG 中找到任何 data-station-id 标注。</p></div>';
      return;
    }

    setupMap();
    bindControls();
    renderResult();
    mask.setAttribute("hidden", "");

    // 调试信息
    console.log("[Metro] 已解析：站点 " + count + " 个，线段 " + state.net.segments.length +
      " 段，出站换乘 " + state.net.transfers.length + " 条，线路 " + Object.keys(state.net.lines).length + " 条。");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
