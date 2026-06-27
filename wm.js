/* ============================================================
   ÆTHER OS — window manager. Depends on core.js (AE global).
   Provides AE.open / focus / minimize / restore / close /
   toggleMax / toggleZoom / getWin / getRunning. Apps are
   registered in apps.js via AE.register(app).

   FIX (devlog 7): drag listeners used to be added per-window
   and never removed — after N open/close cycles, 2N stale
   document listeners piled up on every mousemove. Drag is
   now driven by a single shared active-drag object with one
   pair of document listeners installed exactly once.
   ============================================================ */
(function () {
  "use strict";
  const AE = window.AE;
  const $ = (s, r = document) => r.querySelector(s);
  const tag = (n, cls, html) => { const e = document.createElement(n); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  let zTop = 200, winSeq = 0;

  /* shared drag state — only one window is ever dragged at a time */
  const drag = { active: false, w: null, startX: 0, startY: 0, origX: 0, origY: 0, moved: 0 };
  let dragInstalled = false;
  function installDragOnce() {
    if (dragInstalled) return;
    dragInstalled = true;
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragUp);
  }
  function onDragMove(e) {
    if (!drag.active || !drag.w) return;
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    drag.w.x = drag.origX + dx;
    drag.w.y = Math.max(0, drag.origY + dy);
    commitPos(drag.w);
  }
  function onDragUp() {
    if (!drag.active || !drag.w) return;
    const w = drag.w;
    drag.active = false; drag.w = null;
    maybeSnap(w);
  }

  AE.apps = {};
  AE.register = function (app) { AE.apps[app.id] = app; };
  AE.getApp = (id) => AE.apps[id];

  function winId() { return "w" + (++winSeq); }

  function createWin(opts) {
    const id = winId();
    const app = AE.apps[opts.app];
    const w = {
      id, app: opts.app, title: opts.title || app.name,
      x: opts.x ?? 80 + (winSeq % 8) * 24, y: opts.y ?? 60 + (winSeq % 8) * 24,
      width: opts.width || app.width || 720, height: opts.height || app.height || 480,
      prev: null, minimized: false, maximized: false, zoomed: false,
      closing: false, opts: opts,
    };
    AE.windows.push(w);
    const el = tag("div", "window opening");
    el.id = id;
    el.style.left = w.x + "px"; el.style.top = w.y + "px";
    el.style.width = w.width + "px"; el.style.height = w.height + "px";
    el.innerHTML = `
      <div class="wt">
        <span class="wapp-icon">${app.icon}</span>
        <div class="dots"><span class="dot close" data-act="close"></span><span class="dot min" data-act="min"></span><span class="dot max" data-act="max"></span></div>
        <span class="wtitle">${w.title}</span>
      </div>
      <div class="wbody"></div>
      <div class="rsz r"></div><div class="rsz b"></div><div class="rsz br"></div>
      <div class="rsz l"></div><div class="rsz t"></div><div class="rsz bl"></div>
      <div class="rsz tr"></div><div class="rsz tl"></div>
    `;
    $("#windows").appendChild(el);
    w.el = el; w.body = $(".wbody", el);
    el.style.zIndex = ++zTop;
    if (document.body.classList.contains("fps-mode")) {
      // ensure windows render above the FPS HUD overlay
      el.style.zIndex = Math.max(el.style.zIndex, 100010);
      zTop = Math.max(zTop, 100010);
    }
    el.dataset.winId = id;
    app.mount(w.body, w);
    bindChrome(w);
    bindResize(w);
    bindDrag(w);
    AE.focus(id);
    AE.running[opts.app] = AE.running[opts.app] || [];
    AE.running[opts.app].push(w.id);
    setDot(opts.app, true);
    setTimeout(() => el.classList.remove("opening"), 340);
    document.getElementById("active-app-name").textContent = app.name;
    return w;
  }

  /* ---------- chrome ---------- */
  function bindChrome(w) {
    const el = w.el;
    // dots
    el.querySelectorAll(".dot").forEach(d => {
      d.onclick = (ev) => {
        ev.stopPropagation();
        const act = d.dataset.act;
        if (act === "close") return AE.close(w.id);
        if (act === "min") return AE.minimize(w.id);
        if (act === "max") return AE.toggleMax(w.id);
      };
    });
    // titlebar drag handled centrally; focus
    el.addEventListener("mousedown", () => AE.focus(w.id));
    // double-click titlebar: maximize
    const wt = $(".wt", el);
    wt.addEventListener("dblclick", () => AE.toggleMax(w.id));
    // triple-click titlebar: zoom cycle (devlog 4)
    wt.addEventListener("click", (e) => {
      // ignore clicks on dots themselves
      if (e.target.closest(".dot")) return;
      const key = w.id, now = Date.now();
      const st = AE._titlebarClicks;
      const arr = (st[key] = (st[key] || []).filter(t => now - t < 400));
      arr.push(now);
      if (arr.length >= 3) { arr.length = 0; AE.toggleZoom(w.id); }
    });
  }

  /* ---------- drag (titlebar) — uses shared drag state ---------- */
  function bindDrag(w) {
    const wt = $(".wt", w.el);
    wt.addEventListener("mousedown", (e) => {
      if (e.target.closest(".dot") || e.button !== 0) return;
      if (w.maximized) return;
      installDragOnce();
      drag.active = true; drag.w = w;
      drag.startX = e.clientX; drag.startY = e.clientY;
      drag.origX = w.x; drag.origY = w.y; drag.moved = 0;
      e.preventDefault();
    });
  }

  /* ---------- resize ---------- */
  function bindResize(w) {
    const dirs = { r: "e", l: "e", t: "n", b: "n", br: "se", bl: "sw", tr: "ne", tl: "nw" };
    Object.keys(dirs).forEach(d => {
      const handle = w.el.querySelector(".rsz." + d);
      if (!handle) return;
      let sx, sy, ox, oy, ow, oh, dir;
      handle.addEventListener("mousedown", (e) => {
        if (w.maximized) return;
        e.preventDefault(); e.stopPropagation();
        dir = d; sx = e.clientX; sy = e.clientY; ox = w.x; oy = w.y; ow = w.width; oh = w.height;
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp, { once: true });
      });
      function onMove(e) {
        const dx = e.clientX - sx, dy = e.clientY - sy;
        let nx = ox, ny = oy, nw = ow, nh = oh;
        if (dir.includes("r")) nw = Math.max(280, ow + dx);
        if (dir.includes("b")) nh = Math.max(180, oh + dy);
        if (dir.includes("l")) { nw = Math.max(280, ow - dx); nx = ox + ow - nw; }
        if (dir.includes("t")) { nh = Math.max(180, oh - dy); ny = oy + oh - nh; }
        w.x = nx; w.y = ny; w.width = nw; w.height = nh;
        commitPos(w); commitSize(w);
      }
      function onUp() { document.removeEventListener("mousemove", onMove); maybeSnap(w); }
    });
  }

  function commitPos(w) { w.el.style.left = w.x + "px"; w.el.style.top = w.y + "px"; }
  function commitSize(w) { w.el.style.width = w.width + "px"; w.el.style.height = w.height + "px"; }

  /* ---------- snap (edges + corners) ---------- */
  function maybeSnap(w) {
    const pad = 12, vw = window.innerWidth, vh = window.innerHeight;
    const snap = (val, target) => Math.abs(val - target) < 18;
    // halves
    if (snap(w.x, pad)) { w.x = pad; w.y = 30; w.width = vw / 2 - pad * 1.5; w.height = vh - 38; w.maximized = false; w.el.classList.remove("maximized"); commitPos(w); commitSize(w); }
    else if (snap(w.x + w.width, vw - pad)) { w.x = vw / 2 + pad * 0.5; w.y = 30; w.width = vw / 2 - pad * 1.5; w.height = vh - 38; w.maximized = false; commitPos(w); commitSize(w); }
    // corners (top-left etc.)
    else if (snap(w.y, 30) && w.height >= vh - 40) {
      if (snap(w.x, pad)) { setQuad(w, pad, 30, vw / 2 - pad * 1.5, (vh - 38) / 2); }
      else if (snap(w.x + w.width, vw - pad)) { setQuad(w, vw / 2 + pad * 0.5, 30, vw / 2 - pad * 1.5, (vh - 38) / 2); }
    }
  }
  function setQuad(w, x, y, width, height) { w.x = x; w.y = y; w.width = width; w.height = height; w.maximized = false; w.el.classList.remove("maximized"); commitPos(w); commitSize(w); }

  /* ---------- focus / z-order ---------- */
  AE.focus = function (id) {
    const w = AE.windows.find(x => x.id === id);
    if (!w || w.closing) return;
    // reorder: bring to top
    w.el.style.zIndex = ++zTop;
    if (document.body.classList.contains("fps-mode")) {
      w.el.style.zIndex = Math.max(w.el.style.zIndex, 100010);
      zTop = Math.max(zTop, 100010);
    }
    $$(".window.focused").forEach(x => x.classList.remove("focused"));
    w.el.classList.add("focused");
    AE.focused = w;
    const app = AE.apps[w.app];
    document.getElementById("active-app-name").textContent = app ? app.name : "ÆTHER OS";
  };

  /* ---------- minimize / restore ---------- */
  AE.minimize = function (id) {
    const w = AE.windows.find(x => x.id === id); if (!w) return;
    w.minimized = true;
    w.el.style.transition = "transform 0.3s cubic-bezier(0.4,0,1,1), opacity 0.3s";
    const dock = $(`.dock-icon[data-id="${w.app}"]`);
    let tx = window.innerWidth / 2, ty = window.innerHeight;
    if (dock) { const r = dock.getBoundingClientRect(); tx = r.left + r.width / 2 - w.width / 2; ty = r.top; }
    const sx = tx - w.x, sy = ty - w.y;
    w.el.style.transform = `translate(${sx}px, ${sy}px) scale(0.1)`;
    w.el.style.opacity = "0.2";
    setTimeout(() => { w.el.classList.add("hidden"); w.el.style.transform = ""; w.el.style.opacity = ""; w.el.style.transition = ""; }, 300);
    // focus next topmost visible
    const top = AE.windows.filter(x => !x.minimized && !x.closing).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0];
    if (top) AE.focus(top.id); else AE.focused = null;
  };
  AE.restore = function (id) {
    const w = AE.windows.find(x => x.id === id); if (!w) return;
    w.el.classList.remove("hidden");
    w.el.style.transition = "transform 0.28s cubic-bezier(0.18,0.89,0.32,1.28), opacity 0.28s";
    w.el.style.transform = "scale(1)"; w.el.style.opacity = "1";
    w.minimized = false;
    AE.focus(id);
    setTimeout(() => w.el.style.transition = "", 300);
  };

  AE.toggleMax = function (id) {
    const w = AE.windows.find(x => x.id === id); if (!w) return;
    const barH = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--bar-h")) || 30;
    if (!w.maximized) {
      w.prev = { x: w.x, y: w.y, width: w.width, height: w.height };
      w.x = 0; w.y = barH; w.width = window.innerWidth; w.height = window.innerHeight - barH;
      w.maximized = true; w.el.classList.add("maximized");
      commitPos(w); commitSize(w);
    } else {
      if (w.prev) { w.x = w.prev.x; w.y = w.prev.y; w.width = w.prev.width; w.height = w.prev.height; w.prev = null; }
      w.maximized = false; w.el.classList.remove("maximized");
      commitPos(w); commitSize(w);
    }
  };

  /* zoom: cycle between ~60%, 80%, 100% sizes, centered in viewport (devlog 4) */
  AE.toggleZoom = function (id) {
    const w = AE.windows.find(x => x.id === id); if (!w || w.maximized) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const mode = w.zoomed ? 0 : 1;
    w.zoomed = !w.zoomed;
    const fullW = AE.apps[w.app]?.width || 720, fullH = AE.apps[w.app]?.height || 480;
    const smallW = Math.min(Math.round(fullW * 0.62), vw - 80);
    const smallH = Math.round(fullH * 0.62);
    const target = mode ? smallW : fullW;
    const targetH = mode ? smallH : fullH;
    w.width = target; w.height = targetH;
    w.x = Math.round((vw - w.width) / 2);
    w.y = Math.round((vh - w.height) / 2);
    commitPos(w); commitSize(w);
  };

  AE.close = function (id) {
    const w = AE.windows.find(x => x.id === id); if (!w || w.closing) return;
    w.closing = true;
    w.el.classList.add("closing");
    AE.snd("close");
    if (w.body && typeof w.body._cleanup === "function") { try { w.body._cleanup(); } catch {} }
    setTimeout(() => {
      w.el.remove();
      AE.windows = AE.windows.filter(x => x.id !== id);
      if (AE.running[w.app]) AE.running[w.app] = AE.running[w.app].filter(x => x !== id);
      const stillOpen = AE.windows.some(x => x.app === w.app);
      setDot(w.app, stillOpen);
      if (AE.focused && AE.focused.id === id) {
        const top = AE.windows.filter(x => !x.minimized && !x.closing).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0];
        AE.focused = top || null;
        if (top) AE.focus(top.id);
        else document.getElementById("active-app-name").textContent = "Finder";
      }
    }, 220);
  };

  AE.getWin = (id) => AE.windows.find(x => x.id === id);
  AE.getRunning = (appId) => { const ids = AE.running[appId]; if (!ids || !ids.length) return null; return AE.windows.find(x => x.id === ids[ids.length - 1]); };

  /* ---------- open (public) ---------- */
  AE.open = function (appId, opts) {
    opts = opts || {};
    const app = AE.apps[appId];
    if (!app) { AE.notify("Unknown app", appId, "error"); return; }
    // single-instance apps: focus existing
    if (app.single) {
      const existing = AE.getRunning(appId);
      if (existing) {
        if (existing.minimized) AE.restore(existing.id);
        AE.focus(existing.id);
        return existing;
      }
    }
    AE.snd("open");
    return createWin(Object.assign({ app: appId }, opts));
  };

  /* ---------- starfield (parallax + twinkle) ---------- */
  function initStarfield() {
    const c = document.getElementById("starfield");
    const ctx = c.getContext("2d");
    let w, h, stars = [], mx = 0, my = 0, tmx = 0, tmy = 0;
    function resize() { w = c.width = window.innerWidth; h = c.height = window.innerHeight; seed(); }
    function seed() {
      stars = [];
      const n = Math.round((w * h) / 4500);
      for (let i = 0; i < n; i++) {
        const layer = Math.random() < 0.55 ? 0 : 1; // 0 = far, 1 = near
        stars.push({
          x: Math.random() * w, y: Math.random() * h,
          r: layer ? 0.6 + Math.random() * 1.4 : 0.3 + Math.random() * 0.9,
          layer,
          tw: Math.random() * Math.PI * 2,
          tws: 0.5 + Math.random() * 1.5,
          base: 0.4 + Math.random() * 0.6,
        });
      }
    }
    function frame() {
      // ease mouse
      tmx += (mx - tmx) * 0.06; tmy += (my - tmy) * 0.06;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const px = s.layer === 0 ? tmx * 6 : tmx * 18;
        const py = s.layer === 0 ? tmy * 6 : tmy * 18;
        const x = (s.x - px + w) % w;
        const y = (s.y - py + h) % h;
        const tw = (Math.sin(Date.now() * 0.001 * s.tws + s.tw) + 1) / 2;
        const a = s.base * (0.4 + 0.6 * tw);
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(228,228,240,${a})`;
        ctx.fill();
        if (s.layer === 1 && s.r > 1.4) {
          ctx.beginPath();
          ctx.arc(x, y, s.r * 2.4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0,212,255,${a * 0.12})`;
          ctx.fill();
        }
      }
      requestAnimationFrame(frame);
    }
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", (e) => { mx = (e.clientX - w / 2) / (w / 2); my = (e.clientY - h / 2) / (h / 2); });
    resize(); frame();
  }
  initStarfield();
})();
