/* ============================================================
   ÆTHER OS — core: boot, lock, menubar, dock, notifications,
   sounds, shortcuts, starfield. Exposes window `AE`.
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  window.$ = $;
  window.$$ = $$;
  const tag = (n, cls, html) => { const e = document.createElement(n); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  const AE = {
    version: "7.0.0",
    settings: {},
    windows: [],
    running: {},
    notifCount: 0,
  };
  window.AE = AE;

  /* ---------- persistence ---------- */
  function loadSettings() {
    try { AE.settings = JSON.parse(localStorage.getItem("aether:settings") || "{}"); } catch { AE.settings = {}; }
    const d = {
      accent: "purple", sound: true, dockPos: "bottom", magnification: 1.0, wallIdx: 0, opacity: 0.78, wallSeed: 1,
    };
    for (const k in d) if (AE.settings[k] == null) AE.settings[k] = d[k];
  }
  function saveSettings() { localStorage.setItem("aether:settings", JSON.stringify(AE.settings)); }
  AE.saveSettings = saveSettings;
  const ACCENTS = {
    purple: "#7b2ff7", cyan: "#00d4ff", pink: "#ff6b9d", gold: "#ffb347", green: "#43e97b",
  };
  function updateAccent() {
    const c = ACCENTS[AE.settings.accent] || ACCENTS.purple;
    document.documentElement.style.setProperty("--accent", c);
  }
  AE.updateAccent = updateAccent;

  /* ---------- start ---------- */
  loadSettings();
  updateAccent();
  if (AE.settings.animateBg == null) AE.settings.animateBg = true;
  if (!AE.settings.animateBg) document.body.classList.add("no-motion");
  if (AE.settings.customWall) {
    document.body.style.backgroundImage = `url("${AE.settings.customWall}")`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundRepeat = "no-repeat";
  } else {
    applyWall(AE.settings.wallIdx || 0);
  }

  /* ---------- wallpapers ---------- */
  function wallStyle(idx) {
    const ws = [
      "linear-gradient(135deg,#0a0a1a,#111133 40%,#1a0a2e)",
      "radial-gradient(120% 120% at 30% 20%,#1a0a3e 0%,#050510 70%)",
      "linear-gradient(160deg,#050510 0%,#0a1a2e 50%,#1a0a3e 100%)",
      "radial-gradient(120% 120% at 70% 80%,#0a2a3e 0%,#050510 70%)",
      "linear-gradient(135deg,#1a0a2e 0%,#2a0a3e 50%,#0a1a2e 100%)",
      "radial-gradient(120% 120% at 50% 50%,#0a1a3e 0%,#050510 60%)",
    ];
    return ws[idx] || ws[0];
  }

  // Deterministic PRNG (mulberry32)
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Value-noise with smoothstep + fbm
  function makeNoise(seed) {
    const rand = rng(seed);
    const GRID = 256;
    const perm = new Uint8Array(GRID * 2);
    const vals = new Float32Array(GRID);
    for (let i = 0; i < GRID; i++) { vals[i] = rand(); perm[i] = i; }
    for (let i = GRID - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let i = 0; i < GRID; i++) perm[i + GRID] = perm[i];
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a, b, t) => a + (b - a) * t;
    function val(x, y) {
      const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
      const xf = x - Math.floor(x), yf = y - Math.floor(y);
      const u = fade(xf), v = fade(yf);
      const aa = vals[perm[xi] + yi], ab = vals[perm[xi] + yi + 1];
      const ba = vals[perm[xi + 1] + yi], bb = vals[perm[xi + 1] + yi + 1];
      return lerp(lerp(aa, ba, u), lerp(ab, bb, u), v);
    }
    function fbm(x, y, oct) {
      let sum = 0, amp = 0.5, freq = 1;
      for (let i = 0; i < oct; i++) { sum += val(x * freq, y * freq) * amp; amp *= 0.5; freq *= 2; }
      return sum;
    }
    return fbm;
  }

  const PALETTES = [
    // 0 nebula
    ["#0a0a2a", "#1a0a4a", "#3a0a5e", "#7b2ff7", "#ff6b9d"],
    // 1 starfield
    ["#02020a", "#05051a", "#0a1a3a", "#1a3a7a", "#ffffff"],
    // 2 aurora
    ["#01020a", "#021a2a", "#053a4a", "#00f5d4", "#7bffb5"],
    // 3 galaxy
    ["#050208", "#1a053a", "#3a0a6e", "#9d4edd", "#ffd166"],
    // 4 cosmic dust
    ["#0a0510", "#1a0a25", "#2a1535", "#c084fc", "#fef3c7"],
    // 5 plasma
    ["#080010", "#2a003a", "#5a007a", "#ff006e", "#ffbe0b"],
  ];

  function hexToRgb(h) {
    const v = parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
  function mixRgb(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function paintNebula(ctx, W, H, rand, noise) {
    const pal = PALETTES[0].map(hexToRgb);
    const base = ctx.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, rgba(pal[0], 1));
    base.addColorStop(0.5, rgba(pal[1], 1));
    base.addColorStop(1, rgba(pal[2], 1));
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    // Cloud blobs
    for (let i = 0; i < 60; i++) {
      const x = rand() * W, y = rand() * H;
      const r = 120 + rand() * 280;
      const c = pal[3 + ((rand() * 2) | 0)];
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(c, 0.18));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Noise tint layer
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        const n = noise(x / 220, y / 220, 5);
        const idx = (y * W + x) * 4;
        const tint = mixRgb(pal[0], pal[4], n * 0.6);
        d[idx] = (d[idx] * 0.6 + tint[0] * 0.4);
        d[idx + 1] = (d[idx + 1] * 0.6 + tint[1] * 0.4);
        d[idx + 2] = (d[idx + 2] * 0.6 + tint[2] * 0.4);
      }
    }
    ctx.putImageData(img, 0, 0);
    // Stars
    for (let i = 0; i < 400; i++) {
      const x = rand() * W, y = rand() * H, s = rand() * 1.4;
      ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.7})`;
      ctx.fillRect(x, y, s, s);
    }
  }

  function paintStarfield(ctx, W, H, rand, noise) {
    const pal = PALETTES[1].map(hexToRgb);
    ctx.fillStyle = "#02020a"; ctx.fillRect(0, 0, W, H);
    // Deep sky gradient
    const g = ctx.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, Math.max(W, H));
    g.addColorStop(0, rgba(pal[3], 0.4));
    g.addColorStop(1, rgba(pal[1], 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Milky-way band (diagonal)
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate(0.35);
    const band = ctx.createLinearGradient(-W, 0, W, 0);
    band.addColorStop(0, "rgba(26,58,122,0)");
    band.addColorStop(0.5, "rgba(26,58,122,0.35)");
    band.addColorStop(1, "rgba(26,58,122,0)");
    ctx.fillStyle = band; ctx.fillRect(-W, -H / 3, W * 2, H * 0.66);
    ctx.restore();
    // Stars with glow
    for (let i = 0; i < 1200; i++) {
      const x = rand() * W, y = rand() * H;
      const s = Math.pow(rand(), 4) * 3.5;
      const b = 0.5 + rand() * 0.5;
      if (s > 1.8) {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, s * 4);
        glow.addColorStop(0, `rgba(255,255,255,${b})`);
        glow.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = glow; ctx.fillRect(x - s * 4, y - s * 4, s * 8, s * 8);
      }
      ctx.fillStyle = `rgba(255,255,255,${b})`;
      ctx.fillRect(x, y, s, s);
    }
  }

  function paintAurora(ctx, W, H, rand, noise) {
    const pal = PALETTES[2].map(hexToRgb);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(pal[0], 1));
    g.addColorStop(1, rgba(pal[1], 1));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Curtain waves
    for (let band = 0; band < 5; band++) {
      const baseY = H * (0.15 + band * 0.12);
      const c = pal[3 + (band % 2)];
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      for (let x = 0; x <= W; x += 8) {
        const n = noise(x / 180, band * 7 + x / 600, 4);
        const y = baseY + n * 100 + Math.sin(x / 90 + band) * 30;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
      const grad = ctx.createLinearGradient(0, baseY - 60, 0, baseY + 240);
      grad.addColorStop(0, rgba(c, 0));
      grad.addColorStop(0.3, rgba(c, 0.22));
      grad.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = grad; ctx.fill();
    }
    // Stars above
    for (let i = 0; i < 250; i++) {
      const x = rand() * W, y = rand() * H * 0.6;
      ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.6})`;
      ctx.fillRect(x, y, rand() * 1.5, rand() * 1.5);
    }
  }

  function paintGalaxy(ctx, W, H, rand) {
    const pal = PALETTES[3].map(hexToRgb);
    ctx.fillStyle = "#050208"; ctx.fillRect(0, 0, W, H);
    // Spiral arms
    const cx = W / 2, cy = H / 2;
    const arms = 4, turns = 2.6;
    for (let i = 0; i < 18000; i++) {
      const arm = (i % arms);
      const t = Math.pow(rand(), 0.6);
      const r = t * Math.min(W, H) * 0.45;
      const angle = arm * (Math.PI * 2 / arms) + t * turns * Math.PI * 2 + (rand() - 0.5) * 0.4;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r * 0.6;
      const s = 0.4 + rand() * 1.6;
      const c = r < 30 ? pal[4] : pal[3];
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.5 + rand() * 0.5})`;
      ctx.fillRect(x, y, s, s);
    }
    // Core glow
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 220);
    core.addColorStop(0, rgba(pal[4], 0.9));
    core.addColorStop(0.4, rgba(pal[3], 0.4));
    core.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = core; ctx.fillRect(cx - 220, cy - 220, 440, 440);
    // Background stars
    for (let i = 0; i < 600; i++) {
      const x = rand() * W, y = rand() * H;
      ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.6})`;
      ctx.fillRect(x, y, rand() * 1.2, rand() * 1.2);
    }
  }

  function paintDust(ctx, W, H, rand, noise) {
    const pal = PALETTES[4].map(hexToRgb);
    ctx.fillStyle = "#0a0510"; ctx.fillRect(0, 0, W, H);
    // Drifting dust lanes
    for (let i = 0; i < 8; i++) {
      const y0 = rand() * H;
      const c = pal[3 + ((rand() * 2) | 0)];
      const g = ctx.createLinearGradient(0, y0 - 100, 0, y0 + 100);
      g.addColorStop(0, rgba(c, 0));
      g.addColorStop(0.5, rgba(c, 0.12));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.fillRect(0, y0 - 100, W, 200);
    }
    // Fine particle specks
    for (let i = 0; i < 3000; i++) {
      const x = rand() * W, y = rand() * H;
      const n = noise(x / 90, y / 90, 3);
      if (n < 0.45) continue;
      const c = pal[4];
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(n - 0.45) * 1.6})`;
      ctx.fillRect(x, y, 1, 1);
    }
    // Soft glow blobs
    for (let i = 0; i < 25; i++) {
      const x = rand() * W, y = rand() * H, r = 80 + rand() * 200;
      const c = pal[3 + ((rand() * 2) | 0)];
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(c, 0.18));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  function paintPlasma(ctx, W, H, rand, noise) {
    const pal = PALETTES[5].map(hexToRgb);
    ctx.fillStyle = "#080010"; ctx.fillRect(0, 0, W, H);
    // Plasma cells via warped noise
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    for (let y = 0; y < H; y += 3) {
      for (let x = 0; x < W; x += 3) {
        const n1 = noise(x / 140, y / 140, 4);
        const n2 = noise(x / 70 + 100, y / 70 + 100, 3);
        const v = (n1 + n2) * 0.5;
        const c = mixRgb(pal[2], pal[3], v);
        const c2 = mixRgb(c, pal[4], Math.max(0, v - 0.55) * 2);
        const idx = (y * W + x) * 4;
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
          const i = ((y + dy) * W + (x + dx)) * 4;
          d[i] = c2[0]; d[i + 1] = c2[1]; d[i + 2] = c2[2];
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    // Bright filaments
    for (let i = 0; i < 40; i++) {
      const x = rand() * W, y = rand() * H, r = 100 + rand() * 200;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(pal[4], 0.4));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  const PAINTERS = [paintNebula, paintStarfield, paintAurora, paintGalaxy, paintDust, paintPlasma];

  function _renderWallpaper(canvas, W, H, seed, variant) {
    const ctx = canvas.getContext("2d");
    const rand = rng(seed);
    const noise = makeNoise(seed + 1);
    const painter = PAINTERS[variant] || PAINTERS[0];
    painter(ctx, W, H, rand, noise);
    // Subtle vignette on every variant
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  function generateWallpaper(seed, variant, w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = w || 1920;
    canvas.height = h || 1080;
    _renderWallpaper(canvas, canvas.width, canvas.height, seed, variant);
    return canvas.toDataURL("image/jpeg", 0.85);
  }
  function generateWallpaperThumb(variant, seed) {
    const s = seed != null ? seed : (AE.settings.wallSeed || 1);
    return generateWallpaper(s, variant, 200, 112);
  }
  AE.generateWallpaper = generateWallpaper;
  AE.generateWallpaperThumb = generateWallpaperThumb;
  AE.generateThumb = function (cv, variant, seed) { _renderWallpaper(cv, cv.width, cv.height, seed, variant); };

  function applyWall(idx) {
    AE.settings.wallIdx = idx;
    if (idx === -1 && AE.settings.customWall) {
      document.body.style.backgroundImage = `url("${AE.settings.customWall}")`;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundPosition = "center";
      document.body.style.backgroundRepeat = "no-repeat";
    } else {
      document.body.style.backgroundImage = "";
      document.body.style.backgroundSize = "";
      document.body.style.backgroundPosition = "";
      document.body.style.backgroundRepeat = "";
      document.body.style.background = wallStyle(idx);
    }
    saveSettings();
  }
  AE.applyWall = applyWall;

  function applyCustomWall(dataUrl) {
    AE.settings.customWall = dataUrl;
    AE.settings.wallIdx = -1;
    saveSettings();
    applyWall(-1);
  }
  function clearCustomWall() {
    AE.settings.customWall = null;
    AE.settings.wallIdx = 0;
    saveSettings();
    applyWall(0);
  }
  AE.applyCustomWall = applyCustomWall;
  AE.clearCustomWall = clearCustomWall;

  /* ---------- boot ---------- */
  const BOOT_LOG = [
    "[  OK  ] Nebula Kernel v2.1.5 — cosmic medium ready",
    "[  OK  ] Ensuring vacuum pressure nominal… 0.0001 Pa",
    "[  OK  ] Spawning process init (PID 1)",
    "[  OK  ] Loading synaptic drivers: quantum ok, dark-matter ok",
    "[  OK  ] Mounting virtual filesystem at /home/explorer",
    "[  OK  ] Initializing Stardust compositor",
    "[  OK  ] Calibrating cosmic background radiation… 2.725 K",
    "[  OK  ] Starting AETHER display-manager",
    "[  OK  ] Sound engine online (Web Audio)",
    "[  OK  ] Dock, menubar, starfield online",
    "[  OK  ] System ready. Welcome, explorer.",
  ];
  const BOOT_LOGO = `
   ╱╲  ╱╲  ╱╲
  ╱  ╲╱  ╲╱  ╲   Æ T H E R   O S
  ╲  ╱╲  ╱╲  ╱   ━━━━━━━━━━━━━━━━━
   ╲╱  ╲╱  ╲╱    " B r e a t h e   t h e   v o i d . "
  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
`.replace(/\n$/, "");

  async function boot() {
    const log = $("#boot-log"), bar = $("#boot-bar"), status = $("#boot-status");
    $("#boot-logo").textContent = BOOT_LOGO;
    let p = 0;
    for (let i = 0; i < BOOT_LOG.length; i++) {
      const line = tag("div", null, BOOT_LOG[i]);
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
      await sleep(80 + Math.random() * 60);
      p = ((i + 1) / BOOT_LOG.length) * 100;
      bar.style.width = p + "%";
    }
    status.textContent = "WELCOME TO ÆTHER OS";
    await sleep(500);
    $("#boot").style.transition = "opacity 0.7s";
    $("#boot").style.opacity = "0";
    await sleep(700);
    $("#boot").classList.add("hidden");
    lock();
  }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ---------- lock ---------- */
  function lock() {
    $("#lock").classList.remove("hidden");
    updateLockClock();
    AE._lockTimer = setInterval(updateLockClock, 1000);
    $("#lock-pass").focus();
  }
  function updateLockClock() {
    const d = new Date();
    $("#lock-clock").textContent = fmtClock(d);
    $("#lock-date").textContent = d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    $("#menubar-clock").textContent = fmtClock(d);
  }
  function fmtClock(d) { return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

  function unlock() {
    $("#lock").classList.add("hidden");
    clearInterval(AE._lockTimer);
    $("#desktop").classList.remove("hidden");
    $("#menubar").classList.remove("hidden");
    $("#dock").classList.remove("hidden");
    AE.desktopEnabled = true;
    snd("boot");
    notify("Welcome", "ÆTHER OS ready. Breathe the void.", "success");
    // FPS space station is the default experience
    enterFpsMode();
    // clicking empty desktop resets the Finder label (devlog 8)
    $("#desktop").addEventListener("mousedown", (e) => {
      if (e.target.id === "desktop" || e.target.classList.contains("desktop-icons")) {
        document.getElementById("active-app-name").textContent = "Finder";
      }
    });
    AE._clockTimer = setInterval(() => {
      const d = new Date();
      $("#menubar-clock").textContent = fmtClock(d);
      $("#lock-date").textContent = d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    }, 1000);
  }

  // easter eggs (Konami, barrel roll) saved for WebOS 2
  $("#lock-unlock").onclick = () => { if (!$("#lock-pass").value) { $("#lock-pass").focus(); $("#lock-pass").animate([{ transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], { duration: 220 }); return; } unlock(); };
  $("#lock-pass").onkeydown = (e) => { if (e.key === "Enter") $("#lock-unlock").click(); };
  $("#lock").addEventListener("click", (e) => { if (e.target.id === "lock") { $("#lock-pass").focus(); } });

  /* ---------- menubar menus ---------- */
  const MENUS = {
    file: [
      { label: "New Window", kbd: "Ctrl+N", action: () => AE.open("terminal") },
      { label: "New Folder", kbd: "Ctrl+Shift+N", action: () => AE.desktopNewFolder && AE.desktopNewFolder() },
      { sep: true },
      { label: "Quit app", kbd: "", action: () => AE.focused && AE.close(AE.focused.id) },
    ],
    edit: [
      { label: "Undo", kbd: "Ctrl+Z" },
      { label: "Redo", kbd: "Ctrl+Y" },
      { sep: true },
      { label: "Cut", kbd: "Ctrl+X" },
      { label: "Copy", kbd: "Ctrl+C" },
      { label: "Paste", kbd: "Ctrl+V" },
    ],
    view: [
      { label: "Show Hidden Files", kbd: "Ctrl+." },
      { label: "Toggle Fullscreen", kbd: "F11", action: () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); else document.exitFullscreen && document.exitFullscreen(); } },
      { sep: true },
      { label: "🎯 FPS Space Station", kbd: "fpsmode", action: () => toggleFpsMode && toggleFpsMode() },
    ],
    window: [
      { label: "Minimize", kbd: "Ctrl+M", action: () => AE.focused && AE.minimize(AE.focused.id) },
      { label: "Maximize", kbd: "Ctrl+Shift+M", action: () => AE.focused && AE.toggleMax(AE.focused.id) },
      { label: "Close", kbd: "Ctrl+W", action: () => AE.focused && AE.close(AE.focused.id) },
    ],
    help: [
      { label: "About ÆTHER", action: () => AE.open("about") },
      { label: "Keyboard Shortcuts", action: () => AE.open("help") },
    ],
  };
  function showMenu(name, anchor) {
    const drop = $("#menu-dropdown");
    const items = MENUS[name];
    if (!items) return;
    drop.innerHTML = "";
    items.forEach((it) => {
      if (it.sep) { drop.appendChild(tag("div", "sep")); return; }
      const el = tag("div", "mi" + (it.action ? "" : " disabled"));
      el.innerHTML = `<span>${it.label}</span>${it.kbd ? `<span class="kbd">${it.kbd}</span>` : ""}`;
      if (it.action) el.onclick = () => { it.action(); drop.classList.add("hidden"); };
      drop.appendChild(el);
    });
    const r = anchor.getBoundingClientRect();
    drop.style.left = r.left + "px";
    drop.classList.remove("hidden");
  }
  $$(".menubar-menu").forEach(m => {
    m.onclick = (e) => {
      e.stopPropagation();
      const name = m.dataset.menu;
      if ($("#menu-dropdown").classList.contains("hidden") || $("#menu-dropdown").dataset.menu !== name) {
        $("#menu-dropdown").dataset.menu = name;
        showMenu(name, m);
      } else {
        $("#menu-dropdown").classList.add("hidden");
      }
    };
  });
  $("#active-app-btn").onclick = () => showMenu("file", $("#active-app-btn"));
  document.addEventListener("click", (e) => { if (!e.target.closest(".menu-dropdown") && !e.target.closest(".menubar-menu") && !e.target.closest("#active-app-btn")) $("#menu-dropdown").classList.add("hidden"); });

  $("#active-app-name").textContent = "Finder";

  /* ---------- volume + clock + bell ---------- */
  const volPop = $("#vol-pop"), bellPop = $("#notif-pop");
  $("#sys-vol").onclick = (e) => { e.stopPropagation(); volPop.classList.toggle("hidden"); bellPop.classList.add("hidden"); };
  $("#vol-slider").oninput = (e) => { AE.volume = +e.target.value / 100; };
  AE.volume = 0.7;
  const volStyle = document.createElement("style");
  volStyle.textContent = '#vol-slider { accent-color: var(--cyan); }';
  document.head.appendChild(volStyle);
  $("#sys-bell").onclick = (e) => { e.stopPropagation(); bellPop.classList.toggle("hidden"); volPop.classList.add("hidden"); renderNotifPop(); };
  function renderNotifPop() {
    const nots = AE._notifs || [];
    if (!nots.length) { bellPop.innerHTML = '<div class="n-empty">No notifications</div>'; return; }
    bellPop.innerHTML = nots.slice().reverse().map(n => `<div class="n-item ${n.type}"><b>${n.title}</b><br>${n.msg}</div>`).join("");
  }
  document.addEventListener("click", (e) => { if (!e.target.closest("#vol-pop") && !e.target.closest("#sys-vol")) volPop.classList.add("hidden"); if (!e.target.closest("#notif-pop") && !e.target.closest("#sys-bell")) bellPop.classList.add("hidden"); });

  /* ============ SOUNDS ============ */
  let actx = null;
  function audioCtx() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } return actx; }
  AE.sndEnabled = true;
  function snd(kind) {
    if (!AE.settings.sound) return;
    const ctx = audioCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const beep = (f, dur, type, vol, slide) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = type || "sine"; o.frequency.setValueAtTime(f, now);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), now + dur);
      const v = (vol || 0.15) * (AE.volume != null ? AE.volume : 0.7);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(v, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g); g.connect(ctx.destination); o.start(now); o.stop(now + dur + 0.02);
    };
    switch (kind) {
      case "open": beep(440, 0.12, "sine", 0.12, 660); break;
      case "close": beep(440, 0.12, "sine", 0.12, 220); break;
      case "click": beep(880, 0.04, "square", 0.05); break;
      case "notif": beep(660, 0.08, "sine", 0.1); setTimeout(() => beep(880, 0.1, "sine", 0.1), 90); break;
      case "error": beep(180, 0.18, "sawtooth", 0.1); break;
      case "boot": beep(220, 0.15, "sine", 0.12, 440); setTimeout(() => beep(440, 0.18, "sine", 0.12, 660), 160); break;
    }
  }
  AE.snd = snd;

  /* ============ NOTIFICATIONS ============ */
  function notify(title, msg, type) {
    type = type || "info";
    AE._notifs = AE._notifs || [];
    AE._notifs.push({ title, msg, type, t: Date.now() });
    if (AE._notifs.length > 20) AE._notifs.shift();
    const area = ensureNotifArea();
    const t = tag("div", "toast " + type);
    t.innerHTML = `<div class="t-title">${title}</div><div>${msg}</div>`;
    area.appendChild(t);
    snd("notif");
    setTimeout(() => {
      t.classList.add("leaving");
      setTimeout(() => t.remove(), 300);
    }, 4000);
  }
  AE.notify = notify;
  function ensureNotifArea() { let a = $(".notif-area"); if (!a) { a = tag("div", "notif-area"); document.body.appendChild(a); } return a; }

  /* ============ DOCK ============ */
  const DOCK_APPS = [
    { id: "explorer", icon: "📁", name: "Void Navigator" },
    { id: "terminal", icon: "⌨️", name: "Stellar Terminal" },
    { id: "editor", icon: "📝", name: "Prism Editor" },
    { id: "notes", icon: "📓", name: "Starlog" },
    { id: "calc", icon: "🧮", name: "Nebula Calc" },
    { id: "monitor", icon: "📊", name: "Pulse Monitor" },
    { id: "settings", icon: "⚙️", name: "System Core" },
    { id: "about", icon: "✨", name: "Cosmos Info" },
  ];

  function renderDock() {
    const inner = $("#dock-inner");
    inner.innerHTML = "";
    DOCK_APPS.forEach(a => {
      const el = tag("div", "dock-icon");
      el.dataset.id = a.id;
      el.innerHTML = `<span class="tooltip">${a.name}</span><span>${a.icon}</span><span class="dot-ind hidden"></span>`;
      el.onclick = () => { AE.open(a.id); bounceDockIcon(el); };
      el.oncontextmenu = (e) => { e.preventDefault(); dockContextMenu(e, a, el); };
      inner.appendChild(el);
    });
    updateDockPos();
  }
  function bounceDockIcon(el) {
    el.classList.remove("bouncing"); void el.offsetWidth; el.classList.add("bouncing");
  }
  function setDot(appId, on) {
    const el = $(`.dock-icon[data-id="${appId}"] .dot-ind`);
    if (el) el.classList.toggle("hidden", !on);
  }
  function updateDockPos() {
    const d = $("#dock");
    d.classList.remove("dock-left", "dock-right", "dock-bottom");
    document.body.classList.remove("dock-side-left", "dock-side-right");
    if (AE.settings.dockPos === "left") { d.classList.add("dock-left"); document.body.classList.add("dock-side-left"); }
    else if (AE.settings.dockPos === "right") { d.classList.add("dock-right"); document.body.classList.add("dock-side-right"); }
    else d.classList.add("dock-bottom");
    const m = AE.settings.magnification;
    d.style.setProperty("--mag", m);
    $$(".dock-icon").forEach(el => el.style.setProperty("--mag", m));
  }
  AE.updateDockPos = updateDockPos;
  function dockContextMenu(e, app, el, winId) {
    const items = [];
    const win = winId ? AE.getWin(winId) : AE.getRunning(app.id);
    items.push({ label: win ? "New Window" : "Open", action: () => { AE.open(app.id); bounceDockIcon(el); } });
    if (win) {
      items.push({ sep: true });
      items.push({ label: win.minimized ? "Show" : "Minimize", action: () => { if (win.minimized) AE.restore(win.id); else AE.minimize(win.id); } });
      items.push({ label: "Close", action: () => AE.close(win.id) });
    }
    AE.showCtx(items, e.clientX, e.clientY);
  }

  renderDock();

  /* ============ KEYBOARD SHORTCUTS ============ */
  let altHeld = false, lastAltTab = 0;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Alt") { altHeld = true; }
    if (altHeld && e.key === "Tab") {
      e.preventDefault();
      openSwitcher(e.shiftKey ? -1 : 1);
      lastAltTab = Date.now();
      return;
    }
    if (!altHeld && e.ctrlKey && e.code === "Space") { e.preventDefault(); AE.openSpotlight(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === "w") { if (AE.focused) { e.preventDefault(); AE.close(AE.focused.id); } return; }
    if (e.ctrlKey && e.key.toLowerCase() === "m") { if (AE.focused) { e.preventDefault(); AE.minimize(AE.focused.id); } return; }
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === "Alt") {
      altHeld = false;
      if ($("#switcher") && !$("#switcher").classList.contains("hidden")) commitSwitcher();
    }
  });

  /* ============ Alt+Tab switcher ============ */
  let swIdx = 0;
  function openSwitcher(dir) {
    const wins = AE.windows.filter(w => !w.closing);
    if (!wins.length) return;
    const sw = $("#switcher"); sw.classList.remove("hidden");
    swIdx = (swIdx + dir + wins.length) % wins.length;
    const inner = $("#switcher-inner");
    inner.innerHTML = "";
    wins.forEach((w, i) => {
      const el = tag("div", "sw-item" + (i === swIdx ? " sel" : ""));
      const app = AE.getApp(w.app);
      el.innerHTML = `<div class="sw-ico">${app?.icon || "❔"}</div><div class="sw-name">${w.title || app?.name || "App"}</div>`;
      el.onclick = () => { swIdx = i; commitSwitcher(); };
      inner.appendChild(el);
    });
  }
  function commitSwitcher() {
    const wins = AE.windows.filter(w => !w.closing);
    const w = wins[swIdx];
    $("#switcher").classList.add("hidden");
    if (w) AE.focus(w.id);
  }

  /* ============ SPOTLIGHT ============ */
  AE.openSpotlight = function () {
    const sp = $("#spotlight");
    sp.classList.remove("hidden");
    const input = $("#spot-input");
    input.value = "";
    input.focus();
    renderSpot([]);
  };
  function renderSpot(rows) {
    const r = $("#spot-results");
    r.innerHTML = rows.map((row, i) => `<div class="spot-row ${i === 0 ? "sel" : ""}" data-i="${i}"><span class="s-ico">${row.icon}</span><span>${row.label}</span></div>`).join("");
    r.querySelectorAll(".spot-row").forEach(el => el.onclick = () => {
      $("#spotlight").classList.add("hidden");
      rows[+el.dataset.i].action();
    });
  }
  $("#spot-input").addEventListener("input", (e) => {
    const raw = e.target.value.trim();
    const q = raw.toLowerCase();
    if (!q) { renderSpot([]); return; }
    // easter eggs
    if (q === "42" || q === "the answer" || q === "meaning of life") {
      renderSpot([{ icon: "🌌", label: "42 — the answer to life, the universe, and everything", action: () => {} }]);
      return;
    }
    // barrel roll easter egg saved for WebOS 2
    const rows = [];
    DOCK_APPS.forEach(a => { if (a.name.toLowerCase().includes(q) || a.id.includes(q)) rows.push({ icon: a.icon, label: a.name, action: () => AE.open(a.id) }); });
    (AE.fs.ls("/home/explorer") || []).forEach(f => {
      if (f.name.toLowerCase().includes(q)) rows.push({ icon: f.folder ? "📁" : "📄", label: "/home/explorer/" + f.name, action: () => { AE.open("explorer"); } });
    });
    renderSpot(rows.slice(0, 12));
  });
  $("#spot-input").addEventListener("keydown", (e) => {
    const rows = $$("#spot-results .spot-row");
    if (!rows.length) return;
    const cur = $("#spot-results .spot-row.sel");
    let idx = cur ? +cur.dataset.i : 0;
    if (e.key === "ArrowDown") { e.preventDefault(); idx = (idx + 1) % rows.length; syncSpotSel(rows, idx); }
    if (e.key === "ArrowUp") { e.preventDefault(); idx = (idx - 1 + rows.length) % rows.length; syncSpotSel(rows, idx); }
    if (e.key === "Enter") { e.preventDefault(); cur && cur.click(); }
    if (e.key === "Escape") { $("#spotlight").classList.add("hidden"); }
  });
  function syncSpotSel(rows, idx) { rows.forEach((r, i) => r.classList.toggle("sel", i === idx)); }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#spotlight").classList.contains("hidden")) $("#spotlight").classList.add("hidden"); });

  /* ============ CONTEXT MENU ============ */
  AE.showCtx = function (items, x, y) {
    const menu = $("#ctx-menu");
    menu.innerHTML = "";
    items.forEach(it => {
      if (it.sep) { menu.appendChild(tag("div", "sep")); return; }
      const el = tag("div", "ci" + (it.disabled ? " disabled" : ""));
      el.innerHTML = `<span>${it.label}</span>${it.kbd ? `<span class="kbd">${it.kbd}</span>` : ""}`;
      if (it.action && !it.disabled) el.onclick = () => { it.action(); menu.classList.add("hidden"); };
      menu.appendChild(el);
    });
    menu.classList.remove("hidden");
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    menu.style.left = Math.min(x, vw - rect.width - 8) + "px";
    menu.style.top = Math.min(y, vh - rect.height - 8) + "px";
  };
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".ctx-menu")) $("#ctx-menu").classList.add("hidden");
  });
  document.addEventListener("contextmenu", (e) => {
    if (!e.target.closest(".ctx-menu")) $("#ctx-menu").classList.add("hidden");
  });

  /* ============ PATCHES FROM DEVLOGS (documented in /devlogs) ============ */
  // Triple-click titlebar zoom-cycle (devlog 4)
  AE._titlebarClicks = {};

  /* ============ MOUSE BOOST TRAIL (Rocket League energy) ============ */
  function initBoostTrail() {
    const canvas = document.createElement("canvas");
    canvas.id = "boost-trail";
    canvas.style.cssText = "position:fixed;inset:0;z-index:9999;pointer-events:none;mix-blend-mode:screen;";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const particles = [];
    let lastX = 0, lastY = 0;

    document.addEventListener("mousemove", (e) => {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      const speed = Math.sqrt(dx * dx + dy * dy);
      if (speed > 3) {
        particles.push({
          x: e.clientX, y: e.clientY,
          vx: -dx * 0.15 + (Math.random() - 0.5) * 1.5,
          vy: -dy * 0.15 + (Math.random() - 0.5) * 1.5,
          life: 1,
          size: Math.min(speed * 0.15, 5) + 1,
          hue: 180 + Math.random() * 40,  // cyan-blue range
        });
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });

    function renderTrail() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.life -= 0.025;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${p.life * 0.6})`;
        ctx.fill();
      }
      requestAnimationFrame(renderTrail);
    }
    renderTrail();

    window.addEventListener("resize", () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });
  }

  /* ============ 3D DESKTOP PERSPECTIVE (Valorant training map in space) ============ */
  function init3DDesktop() {
    const desktop = $("#desktop");
    let rX = 0, rY = 0;
    let targetRX = 0, targetRY = 0;
    const maxTilt = 3;  // degrees — subtle, not disorienting

    document.addEventListener("mousemove", (e) => {
      const nx = (e.clientX / window.innerWidth) - 0.5;
      const ny = (e.clientY / window.innerHeight) - 0.5;
      targetRY = nx * maxTilt;
      targetRX = -ny * maxTilt;
    });

    function updatePerspective() {
      rX += (targetRX - rX) * 0.08;
      rY += (targetRY - rY) * 0.08;
      desktop.style.transform = `perspective(1200px) rotateX(${rX}deg) rotateY(${rY}deg)`;
      requestAnimationFrame(updatePerspective);
    }
    updatePerspective();

    // parallax the nebula opposite to mouse for depth illusion
    const nebula = $(".nebula");
    if (nebula) {
      document.addEventListener("mousemove", (e) => {
        const px = (e.clientX / window.innerWidth - 0.5) * -10;
        const py = (e.clientY / window.innerHeight - 0.5) * -10;
        nebula.style.transform = `translate(${px}px, ${py}px) scale(1.05)`;
      });
    }
  }

  /* ============ FORZA-STYLE APP LAUNCH ANIMATION ============ */
  const _origOpen = AE.open;
  AE.open = function (appId) {
    const app = AE._apps && AE._apps.find(a => a.id === appId);
    if (!app) return _origOpen(appId);
    // brief "rev" animation on dock icon before opening
    const icon = document.querySelector(`.dock-icon[data-id="${appId}"]`);
    if (icon) {
      icon.style.transition = "transform 0.15s cubic-bezier(0.16,1,0.3,1), filter 0.15s";
      icon.style.transform = "scale(1.3)";
      icon.style.filter = "drop-shadow(0 0 12px var(--accent))";
      setTimeout(() => {
        icon.style.transform = "";
        icon.style.filter = "";
        _origOpen(appId);
      }, 150);
    } else {
      _origOpen(appId);
    }
  };

  /* ============ EASTER EGGS ============ */
  // Konami code — already exists, but let's add a second one
  let konami2 = [];
  const KONAMI2 = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","b","a"];
  document.addEventListener("keydown", (e) => {
    konami2.push(e.key);
    if (konami2.length > 6) konami2.shift();
    if (konami2.join(",") === KONAMI2.join(",")) {
      document.body.classList.add("barrel-roll");
      AE.notify("🎮 EASTER EGG", "Barrel roll activated!", "success");
      setTimeout(() => document.body.classList.remove("barrel-roll"), 2000);
      konami2 = [];
    }
  });

  // Click the about logo 5 times rapidly → matrix rain
  let aboutClicks = 0;
  let aboutClickTimer = null;
  document.addEventListener("click", (e) => {
    if (e.target.closest(".about-logo")) {
      aboutClicks++;
      clearTimeout(aboutClickTimer);
      aboutClickTimer = setTimeout(() => aboutClicks = 0, 1500);
      if (aboutClicks >= 5) {
        aboutClicks = 0;
        triggerMatrixRain();
      }
    }
  });

  function triggerMatrixRain() {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed;inset:0;z-index:99998;pointer-events:none;opacity:0.7;";
    document.body.appendChild(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext("2d");
    const cols = Math.floor(canvas.width / 14);
    const drops = Array(cols).fill(0);
    const chars = "ÆTHEROS01アイウエオカキクケコ";
    let frames = 0;
    function draw() {
      ctx.fillStyle = "rgba(6,6,14,0.08)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#22d3ee";
      ctx.font = "12px monospace";
      for (let i = 0; i < drops.length; i++) {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(ch, i * 14, drops[i] * 14);
        if (drops[i] * 14 > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
      frames++;
      if (frames < 200) requestAnimationFrame(draw);
      else canvas.remove();
    }
    draw();
    AE.notify("💀 WAKE UP", "The Matrix has you...", "warning");
  }

  // Type "iddqd" anywhere → god mode notification (Doom reference)
  let doomCode = [];
  const DOOM = ["i","d","d","q","d"];
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    doomCode.push(e.key.toLowerCase());
    if (doomCode.length > 5) doomCode.shift();
    if (doomCode.join("") === DOOM.join("")) {
      AE.notify("😈 GOD MODE", "Degreelessness mode activated. You are immortal.", "success");
      document.documentElement.style.setProperty("--accent", "#ff0000");
      setTimeout(() => document.documentElement.style.setProperty("--accent", ""), 5000);
      doomCode = [];
    }
  });

  // Type "noclip" → windows become transparent
  let noclipCode = [];
  const NOCLIP = ["n","o","c","l","i","p"];
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    noclipCode.push(e.key.toLowerCase());
    if (noclipCode.length > 6) noclipCode.shift();
    if (noclipCode.join("") === NOCLIP.join("")) {
      const isNoclip = document.body.classList.toggle("noclip-mode");
      AE.notify("👻 NOCLIP", isNoclip ? "Windows are now intangible." : "Solid again.", "info");
      noclipCode = [];
    }
  });

  /* ============ FPS SPACE STATION MODE (Valorant HUD in space) ============
   * Toggle with "fpsmode" typed anywhere (not in input/textarea).
   * Transforms desktop into a first-person space station where app icons
   * are "enemies" you shoot to open. Each app gets a themed enemy design.
   * ====================================================================== */

  const APP_ENEMIES = {
    explorer:   { name: "VOID RAVEN",     emoji: "📁", color: "#22d3ee", shape: "bird",    desc: "File system infiltrator" },
    terminal:   { name: "CODE SPECTER",   emoji: "⌨️", color: "#10b981", shape: "ghost",   desc: "Terminal wraith" },
    editor:     { name: "PRISM GOLEM",    emoji: "📝", color: "#8b5cf6", shape: "golem",   desc: "Code construct" },
    notes:      { name: "STARLOG WRAITH", emoji: "📓", color: "#f59e0b", shape: "wraith",  desc: "Memory thief" },
    calc:       { name: "CALCULON UNIT",  emoji: "🧮", color: "#06b6d4", shape: "robot",   desc: "Math drone" },
    monitor:    { name: "PULSE TITAN",    emoji: "📊", color: "#f43f5e", shape: "titan",   desc: "System overseer" },
    settings:   { name: "CORE GUARDIAN",  emoji: "⚙️", color: "#a855f7", shape: "shield",  desc: "Config sentinel" },
    about:      { name: "COSMOS ORACLE",  emoji: "✨", color: "#ec4899", shape: "oracle",  desc: "Info seer" },
  };

  let fpsMode = false;
  let fpsEnemies = [];
  let fpsAmmo = 12;
  let fpsScore = 0;
  let fpsReloading = false;

  function toggleFpsMode() {
    fpsMode = !fpsMode;
    if (fpsMode) enterFpsMode();
    else exitFpsMode();
  }

  function enterFpsMode() {
    fpsMode = true;
    document.body.classList.add("fps-mode");
    AE.notify("🎯 FPS MODE", "Aim and shoot enemies to open apps. Type 'fpsmode' to exit.", "info");
    spawnFpsEnemies();
    createFpsHud();
  }

  function exitFpsMode() {
    fpsMode = false;
    document.body.classList.remove("fps-mode");
    const hud = $("#fps-hud");
    if (hud) hud.remove();
    fpsEnemies.forEach(e => { if (e.el) e.el.remove(); });
    fpsEnemies = [];
  }

  let fpsMouseX = window.innerWidth / 2, fpsMouseY = window.innerHeight / 2;

  function createFpsHud() {
    if ($("#fps-hud")) return;
    const hud = document.createElement("div");
    hud.id = "fps-hud";
    hud.innerHTML = `
      <canvas class="fps-crosshair" id="fps-crosshair-canvas" width="60" height="60"></canvas>
      <canvas class="fps-gun" id="fps-gun-canvas" width="320" height="240"></canvas>
      <div class="fps-hud-bottom">
        <div class="fps-stat"><span class="fps-label">AMMO</span><span id="fps-ammo">12</span></div>
        <div class="fps-stat"><span class="fps-label">SCORE</span><span id="fps-score">0</span></div>
        <div class="fps-stat"><span class="fps-label">WAVE</span><span id="fps-wave">1</span></div>
        <div class="fps-health"><div class="fps-health-bar" id="fps-health-bar"></div></div>
      </div>
      <div class="fps-hit-marker hidden" id="fps-hit-marker">✕</div>
      <div class="fps-damage-flash hidden" id="fps-damage-flash"></div>
    `;
    document.body.appendChild(hud);
    drawFpsCrosshair();
    drawFpsGun(0);
    // track mouse for crosshair + gun sway
    document.addEventListener("mousemove", (e) => {
      fpsMouseX = e.clientX; fpsMouseY = e.clientY;
      const cv = $("#fps-crosshair-canvas");
      if (cv) { cv.style.left = (e.clientX - 30) + "px"; cv.style.top = (e.clientY - 30) + "px"; }
    });
  }

  function drawFpsCrosshair() {
    const cv = $("#fps-crosshair-canvas");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, 60, 60);
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 8;
    // outer ring
    ctx.beginPath(); ctx.arc(30, 30, 16, 0, Math.PI * 2); ctx.stroke();
    // inner dot
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(30, 30, 2, 0, Math.PI * 2); ctx.fill();
    // ticks
    ctx.beginPath();
    ctx.moveTo(30, 6); ctx.lineTo(30, 14);
    ctx.moveTo(30, 46); ctx.lineTo(30, 54);
    ctx.moveTo(6, 30); ctx.lineTo(14, 30);
    ctx.moveTo(46, 30); ctx.lineTo(54, 30);
    ctx.stroke();
  }

  let fpsGunRecoil = 0;
  function drawFpsGun(recoil) {
    const cv = $("#fps-gun-canvas");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, 320, 240);
    const ox = 160, oy = 240 + recoil * 30;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // glow
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 12;
    // barrel
    ctx.fillStyle = "#1a1a2e";
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox - 18, oy);
    ctx.lineTo(ox - 22, oy - 100);
    ctx.lineTo(ox - 10, oy - 130);
    ctx.lineTo(ox + 10, oy - 130);
    ctx.lineTo(ox + 22, oy - 100);
    ctx.lineTo(ox + 18, oy);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // barrel tip glow
    ctx.fillStyle = "#22d3ee";
    ctx.shadowBlur = 16;
    ctx.fillRect(ox - 8, oy - 136, 16, 8);
    ctx.shadowBlur = 12;
    // body / grip
    ctx.fillStyle = "#12121f";
    ctx.beginPath();
    ctx.moveTo(ox - 30, oy);
    ctx.lineTo(ox - 36, oy - 40);
    ctx.lineTo(ox - 20, oy - 70);
    ctx.lineTo(ox + 20, oy - 70);
    ctx.lineTo(ox + 36, oy - 40);
    ctx.lineTo(ox + 30, oy);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // side rails
    ctx.strokeStyle = "#0e7490";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ox - 34, oy - 35); ctx.lineTo(ox - 28, oy - 65);
    ctx.moveTo(ox + 34, oy - 35); ctx.lineTo(ox + 28, oy - 65);
    ctx.stroke();
    // energy core
    ctx.shadowColor = "#8b5cf6";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#8b5cf6";
    ctx.beginPath(); ctx.arc(ox, oy - 55, 6, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // place enemies on a jittered grid so bubbles never overlap
  function spawnFpsEnemies() {
    const apps = DOCK_APPS;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cellW = W / 4;
    const cellH = H / 3;
    const slots = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) slots.push({ r, c });
    // shuffle slots
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    apps.forEach((app, i) => {
      const enemy = APP_ENEMIES[app.id];
      if (!enemy) return;
      const slot = slots[i];
      const x = slot.c * cellW + cellW * 0.2 + Math.random() * cellW * 0.6;
      const y = slot.r * cellH + cellH * 0.2 + Math.random() * cellH * 0.6;
      fpsEnemies.push(makeFpsEnemy(app, enemy, x, y));
    });
    animateFpsEnemies();
  }

  function makeFpsEnemy(app, enemy, x, y) {
    const el = document.createElement("div");
    el.className = "fps-enemy";
    el.dataset.appId = app.id;
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.innerHTML = `
      <div class="fps-enemy-body" style="--enemy-color:${enemy.color}">
        <div class="fps-enemy-emoji">${enemy.emoji}</div>
        <div class="fps-enemy-shape fps-shape-${enemy.shape}"></div>
      </div>
      <div class="fps-enemy-name">${enemy.name}</div>
      <div class="fps-enemy-hp"><div class="fps-enemy-hp-bar"></div></div>
    `;
    document.body.appendChild(el);
    return {
      el, app, enemy,
      hp: 2, maxHp: 2,
      x, y, baseX: x, baseY: y,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.4,
    };
  }

  function animateFpsEnemies() {
    if (!fpsMode) return;
    const t = Date.now() * 0.001;
    fpsEnemies.forEach(e => {
      if (!e.el) return;
      const nx = e.baseX + Math.sin(t * e.speed + e.phase) * 30;
      const ny = e.baseY + Math.cos(t * e.speed * 0.7 + e.phase) * 20;
      e.el.style.left = nx + "px";
      e.el.style.top = ny + "px";
      e.x = nx;
      e.y = ny;
    });
    requestAnimationFrame(animateFpsEnemies);
  }

  // shooting
  document.addEventListener("click", (e) => {
    if (!fpsMode) return;
    if (e.target.closest(".window") || e.target.closest(".ctx-menu") || e.target.closest(".dock") || e.target.closest(".menubar")) return;
    if (fpsReloading) return;

    fpsAmmo--;
    updateFpsHud();

    // gun recoil
    fpsGunRecoil = 1;
    drawFpsGun(1);
    setTimeout(() => { fpsGunRecoil = 0; drawFpsGun(0); }, 90);

    // check hit
    const mx = e.clientX, my = e.clientY;
    let hit = false;
    for (let i = fpsEnemies.length - 1; i >= 0; i--) {
      const en = fpsEnemies[i];
      if (!en.el) continue;
      const ex = en.x + 40, ey = en.y + 40;
      const dist = Math.sqrt((mx - ex) ** 2 + (my - ey) ** 2);
      if (dist < 55) {
        hit = true;
        en.hp--;
        // hit marker at mouse pos
        const marker = $("#fps-hit-marker");
        if (marker) {
          marker.style.left = mx + "px";
          marker.style.top = my + "px";
          marker.classList.remove("hidden");
          setTimeout(() => marker.classList.add("hidden"), 120);
        }
        // flash enemy
        en.el.classList.add("fps-enemy-hit");
        setTimeout(() => en.el.classList.remove("fps-enemy-hit"), 150);
        // update hp bar
        const hpBar = en.el.querySelector(".fps-enemy-hp-bar");
        if (hpBar) hpBar.style.width = (en.hp / en.maxHp * 100) + "%";

        if (en.hp <= 0) {
          // enemy destroyed → open app immediately
          const killedApp = en.app;
          const killedEnemy = en.enemy;
          fpsScore += 100;
          en.el.classList.add("fps-enemy-dying");
          const deadEl = en.el;
          setTimeout(() => { deadEl.remove(); }, 400);
          fpsEnemies.splice(i, 1);
          AE.open(killedApp.id);
          updateFpsHud();
          // respawn a fresh enemy bubble after a short delay
          setTimeout(() => { if (fpsMode) respawnEnemy(killedApp.id); }, 1500);
        }
        break;
      }
    }

    if (!hit) {
      // miss → spawn bullet impact
      spawnBulletImpact(mx, my);
    }

    if (fpsAmmo <= 0) reloadFps();
  });

  function spawnFpsBgBubble(app, enemy) {
    const W = window.innerWidth, H = window.innerHeight;
    const x = Math.random() * (W - 100);
    const y = H + 60; // start below screen, drift up
    const e = makeFpsEnemy(app, enemy, x, y);
    e.el.classList.add("fps-enemy-bg", "fps-enemy-spawn");
    e.baseY = 100 + Math.random() * (H - 200);
    e.baseX = Math.random() * (W - 100);
    e.x = e.baseX; e.y = e.baseY;
    e.el.style.left = e.baseX + "px";
    e.el.style.top = e.baseY + "px";
    fpsEnemies.push(e);
    // remove after a while so they don't pile up
    setTimeout(() => {
      if (e.el) { e.el.classList.add("fps-enemy-dying"); setTimeout(() => { if (e.el) e.el.remove(); }, 400); }
      const idx = fpsEnemies.indexOf(e);
      if (idx >= 0) fpsEnemies.splice(idx, 1);
    }, 8000);
  }

  function pickFpsSpot() {
    const W = window.innerWidth, H = window.innerHeight;
    const cellW = W / 4, cellH = H / 3;
    for (let attempt = 0; attempt < 30; attempt++) {
      const c = Math.floor(Math.random() * 4), r = Math.floor(Math.random() * 3);
      const x = c * cellW + cellW * 0.2 + Math.random() * cellW * 0.6;
      const y = r * cellH + cellH * 0.2 + Math.random() * cellH * 0.6;
      const tooClose = fpsEnemies.some(e => e.el && Math.abs(e.x - x) < 110 && Math.abs(e.y - y) < 110);
      if (!tooClose) return { x, y };
    }
    return { x: Math.random() * (W - 120), y: Math.random() * (H - 120) };
  }

  function respawnEnemy(appId) {
    const app = DOCK_APPS.find(a => a.id === appId);
    const enemy = APP_ENEMIES[appId];
    if (!app || !enemy) return;
    const { x, y } = pickFpsSpot();
    const e = makeFpsEnemy(app, enemy, x, y);
    e.el.classList.add("fps-enemy-spawn");
    setTimeout(() => e.el.classList.remove("fps-enemy-spawn"), 300);
    fpsEnemies.push(e);
  }

  function spawnBulletImpact(x, y) {
    const imp = document.createElement("div");
    imp.className = "fps-bullet-impact";
    imp.style.left = x + "px";
    imp.style.top = y + "px";
    document.body.appendChild(imp);
    setTimeout(() => imp.remove(), 300);
  }

  function reloadFps() {
    if (fpsReloading) return;
    fpsReloading = true;
    AE.notify("🔄 RELOADING", "Hold tight...", "warning");
    setTimeout(() => {
      fpsAmmo = 12;
      fpsReloading = false;
      updateFpsHud();
    }, 1200);
  }

  function updateFpsHud() {
    const ammo = $("#fps-ammo");
    const score = $("#fps-score");
    if (ammo) ammo.textContent = fpsAmmo;
    if (score) score.textContent = fpsScore;
  }

  // reload on R
  document.addEventListener("keydown", (e) => {
    if (fpsMode && e.key.toLowerCase() === "r" && !fpsReloading) {
      reloadFps();
    }
  });

  // toggle fps mode with typed command
  let fpsCode = [];
  const FPS_CMD = ["f","p","s","m","o","d","e"];
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    fpsCode.push(e.key.toLowerCase());
    if (fpsCode.length > 7) fpsCode.shift();
    if (fpsCode.join("") === FPS_CMD.join("")) {
      toggleFpsMode();
      fpsCode = [];
    }
  });

  /* ============ INIT INTERACTIVE FEATURES ============ */
  initBoostTrail();
  init3DDesktop();

  /* ============ STARTUP ============ */
  boot();
})();
