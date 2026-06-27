/* ============================================================
   ÆTHER OS — apps (12). Each app: {id, name, icon, width,
   height, single?, mount(body, win)}.
   ============================================================ */
(function () {
  "use strict";
  const AE = window.AE;
  const $ = (s, r = document) => r.querySelector(s);
  const tag = (n, cls, html) => { const e = document.createElement(n); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  /* ============ HELP (registered early, used by menubar) ============ */
  AE.register({
    id: "help", name: "Shortcuts", icon: "?", width: 520, height: 420, single: true,
    mount(body) {
      body.innerHTML = `
        <div class="about">
          <div class="about-logo">⌨️</div>
          <div class="about-name" style="font-size:20px">Keyboard Shortcuts</div>
          <div class="about-specs">
            <div><span class="k">Ctrl + Space</span><span>Spotlight / Quick-launch</span></div>
            <div><span class="k">Alt + Tab</span><span>Window switcher</span></div>
            <div><span class="k">Ctrl + W</span><span>Close window</span></div>
            <div><span class="k">Ctrl + M</span><span>Minimize window</span></div>
            <div><span class="k">Ctrl + Shift + M</span><span>Maximize</span></div>
            <div><span class="k">F11</span><span>Fullscreen</span></div>
            <div><span class="k">Alt + F4 / Esc</span><span>Close focus</span></div>
          </div>
          <div class="about-credits">Dock: hover to magnify · drag icons to reorder them · triple-click a titlebar to zoom-cycle.</div>
        </div>`;
    },
  });

  /* ============ TERMINAL ============ */
  AE.register({
    id: "terminal", name: "Stellar Terminal", icon: "⌨️", width: 680, height: 460,
    mount(body) {
      const term = tag("div", "term"); body.appendChild(term);
      let cwd = "/home/explorer", hist = [], histIdx = -1;
      const print = (html, cls) => { const l = tag("div", "line " + (cls || ""), html + ""); term.appendChild(l); term.scrollTop = term.scrollHeight; };
      const promptLine = () => {
        const row = tag("div", "input-line");
        row.innerHTML = `<span class="prompt">explorer@aether:${cwd == "/home/explorer" ? "~" : cwd}$ </span>`;
        const inp = tag("input"); inp.type = "text"; inp.autocomplete = "off"; inp.spellcheck = false;
        inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { const v = inp.value; hist.push(v); histIdx = hist.length; run(v.trim()); row.remove(); promptLine(); }
          else if (e.key === "ArrowUp") { histIdx = Math.max(0, histIdx - 1); inp.value = hist[histIdx] || ""; e.preventDefault(); }
          else if (e.key === "ArrowDown") { histIdx = Math.min(hist.length, histIdx + 1); inp.value = hist[histIdx] || ""; e.preventDefault(); }
          else if (e.key === "Tab") { e.preventDefault(); tabComplete(inp); }
        });
        row.appendChild(inp); term.appendChild(row); inp.focus();
        term._inp = inp;
      };
      function tabComplete(inp) {
        const v = inp.value;
        const tokens = v.split(/\s+/);
        const last = tokens.pop() || "";
        const base = tokens.join(" ") + (tokens.length ? " " : "");
        // resolve against cwd
        try {
          const parts = last.split("/");
          const prefix = parts.pop();
          const dir = resolveDir(cwd + "/" + parts.join("/"));
          const lst = AE.fs.ls(dir).filter(x => x.name.startsWith(prefix)).map(x => x.name + (x.folder ? "/" : ""));
          if (lst.length === 1) { inp.value = base + parts.concat(lst[0]).join("/"); }
          else if (lst.length > 1) { print(base + last); lst.forEach(l => print("  " + l)); }
        } catch {}
      }
      function resolveDir(d) { return d.replace(/\/+$/, "") || "/"; }
      function resolvePath(p) {
        if (!p) return resolveDir(cwd);
        if (p === "~") return "/home/explorer";
        if (p.startsWith("/")) return p;
        return resolveDir((cwd === "/" ? "/" : cwd) + "/" + p);
      }
      function run(line) {
        print(`<span class="prompt">explorer@aether:${cwd == "/home/explorer" ? "~" : cwd}$ </span>` + esc(line));
        if (!line) return;
        const args = line.match(/(?:[^\s"]+|"[^"]*")+/g).map(s => s.replace(/^"|"$/g, ""));
        const cmd = args.shift().toLowerCase();
        try {
          switch (cmd) {
            case "help": print(terminalHelp()); break;
            case "ls": cmdLs(args); break;
            case "cd": cmdCd(args); break;
            case "cat": cmdCat(args); break;
            case "echo": print(esc(args.join(" "))); break;
            case "mkdir": cmdWrite(args, true); break;
            case "touch": cmdWrite(args, false, true); break;
            case "mv": cmdMove(args); break;
            case "cp": cmdCopy(args); break;
            case "rm": cmdRm(args); break;
            case "clear": term.innerHTML = ""; break;
            case "pwd": print(cwd); break;
            case "whoami": print("explorer"); break;
            case "uname": print("AETHER " + AE.version + " Nebula_Kernel_v2.1.5 web x86_64 cosmic"); break;
            case "date": print(new Date().toString()); break;
            case "neofetch": neofetch(); break;
            case "cowsay": cowsay(args.join(" ")); break;
            case "warp": warp(); break;
            case "exit": break;
            case "open": openFile(args); break;
            default:
              // allow JS eval-ish experiments for fun
              if (cmd === "js") { try { print(esc(String(eval(args.join(" "))))); } catch (e) { print(e.toString(), "err"); } break; }
              print(`${cmd}: command not found — try help`, "err");
          }
        } catch (e) { print(`error: ${e.message || e}`, "err"); }
      }
      function terminalHelp() {
        return `Stellar Terminal — commands:
  ls [-l] [path]    cd [path]    cat [file]
  mkdir [dir]       touch [file] echo [text]
  mv [src] [dst]    cp [src] [dst] rm [path]
  clear             pwd           whoami
  date              uname         neofetch
  cowsay [text]     warp (speed test)
  open [file/folder]    js [code]
  help`;
      }
      function cmdLs(args) {
        let long = false, path = null;
        args.forEach(a => { if (a === "-l") long = true; else path = a; });
        const p = resolvePath(path);
        let entries;
        try { entries = AE.fs.ls(p); } catch { print(`ls: no such directory: ${p}`, "err"); return; }
        if (!entries.length) return;
        if (long) entries.forEach(e => print(`${e.folder ? "d" : "-"}rw-r--r--  explorer  ${e.folder ? "4096" : "1024"}  ${e.name}`));
        else print(entries.map(e => (e.folder ? e.name + "/" : e.name)).join("  "));
      }
      function cmdCd(args) {
        const p = resolvePath(args[0] || "~");
        if (!AE.fs.exists(p)) { print(`cd: no such directory: ${p}`, "err"); return; }
        if (!AE.fs.isFolder(p)) { print(`cd: not a directory: ${args[0]}`, "err"); return; }
        cwd = resolveDir(p);
      }
      function cmdCat(args) {
        if (!args[0]) { print("cat: missing operand", "err"); return; }
        const p = resolvePath(args[0]);
        const c = AE.fs.read(p);
        if (c == null) { print(`cat: ${args[0]}: no such file`, "err"); return; }
        print(esc(c).replace(/\n/g, "<br>"));
      }
      function cmdWrite(args, isDir, isTouch) {
        if (!args[0]) { print("missing name", "err"); return; }
        const p = resolvePath(args[0]);
        if (isDir) AE.fs.mkdir(p); else AE.fs.write(p, "", "text");
      }
      function cmdMove(args) {
        if (args.length < 2) { print(`mv: usage: mv src dst`, "err"); return; }
        const src = resolvePath(args[0]);
        let dst = resolvePath(args[1]);
        if (AE.fs.isFolder(dst)) dst = resolveDir(dst) + "/" + src.split("/").filter(Boolean).pop();
        if (AE.fs.exists(dst)) { print(`mv: target exists`, "err"); return; }
        const n = AE.fs.node(src);
        if (!n) { print(`mv: source not found`, "err"); return; }
        const segs = dst.split("/").filter(Boolean);
        const name = segs.pop();
        let cur = AE.fs.resolve("/" + segs.join("/"), true);
        cur[name] = JSON.parse(JSON.stringify(n));
        AE.fs.rm(src); AE.fs.persistFS();
      }
      function cmdCopy(args) {
        if (args.length < 2) { print(`cp: usage: cp src dst`, "err"); return; }
        const src = resolvePath(args[0]); let dst = resolvePath(args[1]);
        const n = AE.fs.node(src); if (!n) { print(`cp: source not found`, "err"); return; }
        if (AE.fs.isFolder(dst) || dst.endsWith("/")) dst = resolveDir(dst) + "/" + src.split("/").filter(Boolean).pop();
        const segs = dst.split("/").filter(Boolean); const name = segs.pop();
        let cur = AE.fs.resolve("/" + segs.join("/"), true);
        cur[name] = JSON.parse(JSON.stringify(n));
        AE.fs.persistFS();
      }
      function cmdRm(args) {
        if (!args[0]) { print("rm: missing operand", "err"); return; }
        const p = resolvePath(args[0]);
        if (!AE.fs.exists(p)) { print(`rm: not found: ${args[0]}`, "err"); return; }
        AE.fs.rm(p); AE.fs.persistFS();
      }
      function openFile(args) {
        if (!args[0]) { print("open: missing operand", "err"); return; }
        const p = resolvePath(args[0]);
        if (AE.fs.isFolder(p)) AE.open("explorer", { path: p });
        else if (AE.fs.isFile(p)) AE.open("editor", { path: p });
        else print(`open: not found`, "err");
      }
      function neofetch() {
        print(`<span class="art">
            ╱╲  ╱╲  ╱╲                explorer@aether
           ╱  ╲╱  ╲╱  ╲               ─────────────────
           ╲  ╱╲  ╱╲  ╱               OS: ÆTHER OS ${AE.version}
            ╲╱  ╲╱  ╲╱                Kernel: Nebula Kernel v2.1.5
                                       Uptime: ${(performance.now()/1000).toFixed(1)}s
          ▓▓▓ CPU: Quantum CPU          Shell: stellar-term 1.0
          ▓▓▓ RAM: ${(Math.round(Math.random()*20+40))}/128 PB             Resolution: ${window.innerWidth}×${window.innerHeight}
          ▓▓▓ GPU: Photon Accelerator    Theme: Cosmic Void
                                       Terminal: Stellar Terminal
                                       ■■■■■■■■■■  ■■■■        ■■■■■■    ■■      </span>`);
      }
      function cowsay(text) {
        text = text || "moo 🐄";
        const border = "─".repeat(text.length + 2);
        print(`<span class="art"> ┌${border}┐
 │ ${text} │
 └${border}┘
        \\   ^__^
         \\  (oo)\\_______
            (__)\\       )\\/\\
                ||----w |
                ||     ||</span>`);
      }
      // matrix, sl, fortune, yes, sudo easter eggs saved for WebOS 2
      function warp() {
        print("warp speed test — measuring local loopback…");
        let mbps = 0;
        const iv = setInterval(() => {
          mbps += Math.random() * 40 + 10;
          print(`  ↯ ${mbps.toFixed(1)} Tbps (theoretical, cosmic)`);
          if (mbps > 200) { clearInterval(iv); print("  ✓ warp drive nominal. ready to jump."); }
        }, 200);
      }
      // FORTUNES array + fortune/sl/yes/sudo functions saved for WebOS 2
      function esc(s) { return (s + "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
      print(`<span class="art">ÆTHER OS — Stellar Terminal v1.0
type 'help' for commands, 'neofetch' for system info.</span>`);
      promptLine();
      // keep focus on input when clicking terminal
      term.addEventListener("click", () => { if (term._inp) term._inp.focus(); });
    },
  });

  /* ============ FILE EXPLORER ============ */
  AE.register({
    id: "explorer", name: "Void Navigator", icon: "📁", width: 760, height: 480,
    mount(body, win) {
      const startPath = (win && win.opts && win.opts.path) || "/home/explorer";
      let cwd = startPath;
      body.innerHTML = `
        <div class="explorer">
          <div class="explorer-side" id="exp-side"></div>
          <div class="explorer-main">
            <div class="explorer-toolbar">
              <button id="exp-back" title="Back">←</button>
              <button id="exp-up" title="Up">↑</button>
              <button id="exp-new-folder">+ Folder</button>
              <button id="exp-new-file">+ File</button>
              <button id="exp-refresh">⟳</button>
              <span class="crumb" id="exp-crumb"></span>
            </div>
            <div class="explorer-grid" id="exp-grid"></div>
          </div>
        </div>`;
      const side = $("#exp-side", body), grid = $("#exp-grid", body), crumb = $("#exp-crumb", body);
      function renderSide() {
        side.innerHTML = "";
        ["/", "/home", "/home/explorer"].forEach(p => {
          const el = tag("div", "explorer-tree-item" + (cwd.startsWith(p) ? " active" : ""));
          el.innerHTML = `<span>${p === "/" ? "💻" : "📁"}</span><span>${p === "/" ? "root" : p.split("/").pop()}</span>`;
          el.onclick = () => { cwd = p; render(); };
          side.appendChild(el);
        });
      }
      function render() {
        renderSide();
        crumb.textContent = cwd;
        grid.innerHTML = "";
        let entries = [];
        try { entries = AE.fs.ls(cwd); } catch { grid.innerHTML = '<div style="padding:14px;color:#888">cannot read</div>'; return; }
        entries.forEach(e => {
          const path = (cwd === "/" ? "/" : cwd + "/") + e.name;
          const el = tag("div", "ficon");
          el.dataset.path = path;
          el.innerHTML = `<div class="ico">${e.folder ? "📁" : iconFor(e.name)}</div><div class="lbl">${e.name}</div>`;
          el.ondblclick = () => {
            if (e.folder) { cwd = path; render(); }
            else AE.open("editor", { path });
          };
          el.oncontextmenu = (ev) => { ev.preventDefault(); ev.stopPropagation(); fileCtx(ev, path, e); };
          el.draggable = true;
          el.addEventListener("dragstart", (ev) => { ev.dataTransfer.setData("text/aether-path", path); });
          el.addEventListener("dragover", (ev) => { if (e.folder) ev.preventDefault(); });
          el.addEventListener("drop", (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            const from = ev.dataTransfer.getData("text/aether-path");
            if (!from || from === path || !e.folder) return;
            moveInto(from, path);
          });
          grid.appendChild(el);
        });
        grid.ondblclick = () => {};
        grid.oncontextmenu = (ev) => { ev.preventDefault(); folderCtx(ev, cwd); };
      }
      function moveInto(from, toFolder) {
        const name = from.split("/").filter(Boolean).pop();
        const dest = (toFolder === "/" ? "/" : toFolder + "/") + name;
        const n = AE.fs.node(from);
        if (!n) return;
        const segs = dest.split("/").filter(Boolean); const nm = segs.pop();
        let cur = AE.fs.resolve("/" + segs.join("/"), true);
        cur[nm] = JSON.parse(JSON.stringify(n));
        AE.fs.rm(from); AE.fs.persistFS();
        AE.notify("Moved", name, "success");
        render();
      }
      function fileCtx(ev, path, e) {
        AE.showCtx([
          { label: "Open", action: () => { if (e.folder) { cwd = path; render(); } else AE.open("editor", { path }); } },
          { label: "Open With…", action: () => AE.open("editor", { path }) },
          { sep: true },
          { label: "Rename", action: () => renameGrid(path, e) },
          { label: "Delete", action: () => { if (confirm(`Delete "${e.name}"?`)) { AE.fs.rm(path); AE.fs.persistFS(); render(); } } },
          { sep: true },
          { label: "Get Info", action: () => AE.notify("Info", path, "info") },
        ], ev.clientX, ev.clientY);
      }
      function folderCtx(ev, path) {
        AE.showCtx([
          { label: "New Folder", action: () => newItem(path, true) },
          { label: "New File", action: () => newItem(path, false) },
          { sep: true },
          { label: "Refresh", action: () => render() },
          { label: "Open in Terminal", action: () => AE.open("terminal") },
        ], ev.clientX, ev.clientY);
      }
      function newItem(path, isDir) {
        const name = prompt(`New ${isDir ? "folder" : "file"} name:`);
        if (!name) return;
        const dest = (path === "/" ? "/" : path + "/") + name;
        if (AE.fs.exists(dest)) { AE.notify("Already exists", name, "warning"); return; }
        if (isDir) AE.fs.mkdir(dest); else AE.fs.write(dest, "", "text");
        AE.fs.persistFS(); render();
      }
      function renameGrid(path, e) {
        const el = $(`.ficon[data-path="${css(path)}"] .lbl`, body);
        if (!el) return;
        el.contentEditable = "true";
        const finish = (save) => {
          el.contentEditable = "false";
          el.removeEventListener("keydown", kd); el.removeEventListener("blur", bl);
          if (!save) { el.textContent = e.name; return; }
          const nv = (el.textContent || "").trim();
          if (!nv || nv === e.name) { el.textContent = e.name; return; }
          if (AE.fs.rename(path, nv)) { AE.notify("Renamed", nv, "success"); render(); }
          else { AE.notify("Rename failed", "", "error"); el.textContent = e.name; }
        };
        const kd = (ev) => { ev.stopPropagation(); if (ev.key === "Enter") { ev.preventDefault(); finish(true); } if (ev.key === "Escape") finish(false); };
        const bl = () => finish(true);
        el.addEventListener("keydown", kd); el.addEventListener("blur", bl);
        el.focus(); const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      }
      function iconFor(n) { return /\.(js|ts)$/i.test(n) ? "🟨" : /\.(css|scss)$/i.test(n) ? "🎨" : /\.html?$/i.test(n) ? "🌐" : /\.md$/i.test(n) ? "📝" : /\.(png|jpg|gif)/i.test(n) ? "🖼" : "📄"; }
      function css(s) { return s.replace(/"/g, '\\"'); }
      $("#exp-back", body).onclick = () => { const segs = cwd.split("/").filter(Boolean); segs.pop(); cwd = "/" + segs.join("/"); if (!cwd) cwd = "/"; render(); };
      $("#exp-up", body).onclick = () => { const segs = cwd.split("/").filter(Boolean); segs.pop(); cwd = "/" + segs.join("/") || "/"; render(); };
      $("#exp-new-folder", body).onclick = () => newItem(cwd, true);
      $("#exp-new-file", body).onclick = () => newItem(cwd, false);
      $("#exp-refresh", body).onclick = () => render();
      render();
    },
  });

  /* ============ CODE EDITOR ============ */
  AE.register({
    id: "editor", name: "Prism Editor", icon: "📝", width: 760, height: 500,
    mount(body, win) {
      const path = (win && win.opts && win.opts.path) || null;
      let tabs = [], activeIdx = 0, theme = "dark";
      function newTab(p, content, name) {
        tabs.push({ path: p, content: content == null ? "" : content, name: name || (p ? p.split("/").filter(Boolean).pop() : "untitled.txt") });
        activeIdx = tabs.length - 1; render();
      }
      body.innerHTML = `
        <div class="editor">
          <div class="editor-toolbar">
            <button id="ed-new">New</button>
            <button id="ed-save">Save</button>
            <button id="ed-find">Find</button>
            <button id="ed-theme">Theme</button>
            <button id="ed-wrap">Wrap</button>
            <span class="spacer"></span>
            <span id="ed-info"></span>
          </div>
          <div id="ed-tabs"></div>
          <div class="editor-main">
            <div class="editor-gutter" id="ed-gutter"></div>
            <div class="editor-area"><textarea id="ed-area" spellcheck="false"></textarea></div>
            <div class="editor-minimap"><canvas id="ed-mini"></canvas></div>
          </div>
          <div class="editor-find" id="ed-find">
            <input id="ed-find-input" placeholder="find" />
            <input id="ed-replace-input" placeholder="replace" />
            <button id="ed-find-go">Next</button>
            <button id="ed-replace">Replace</button>
            <button id="ed-replace-all">All</button>
            <button id="ed-find-close">✕</button>
          </div>
        </div>`;
      const area = $("#ed-area", body), gutter = $("#ed-gutter", body), mini = $("#ed-mini", body), info = $("#ed-info", body);
      function render() {
        const tb = $("#ed-tabs", body);
        tb.innerHTML = "";
        tabs.forEach((t, i) => {
          const el = tag("div", "tab" + (i === activeIdx ? " active" : ""));
          el.textContent = t.name + (t.dirty ? " ●" : "");
          el.onclick = () => { activeIdx = i; render(); };
          tb.appendChild(el);
        });
        if (tabs[activeIdx]) {
          area.value = tabs[activeIdx].content;
          info.textContent = `${tabs[activeIdx].path || "unsaved"} · ${tabs[activeIdx].content.split("\n").length} lines`;
        }
        drawGutter(); drawMini();
      }
      function drawGutter() {
        const n = (area.value.match(/\n/g) || []).length + 1;
        gutter.innerHTML = Array.from({ length: n }, (_, i) => i + 1).join("<br>");
      }
      function drawMini() {
        const ctx = mini.getContext("2d");
        mini.width = mini.clientWidth; mini.height = mini.clientHeight;
        ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(0, 0, mini.width, mini.height);
        const lines = area.value.split("\n");
        const lh = Math.max(2, Math.min(4, mini.height / Math.max(lines.length, 1)));
        lines.forEach((ln, i) => {
          const w = Math.min(mini.width - 2, (ln.length / 60) * mini.width);
          ctx.fillStyle = keyColor(ln);
          ctx.fillRect(1, i * lh, w, Math.max(1, lh - 1));
        });
      }
      function keyColor(line) {
        const kws = /\b(function|return|const|let|var|if|else|for|while|class|import|export|def|from|async|await|try|catch)\b/;
        if (kws.test(line)) return "rgba(123,47,247,0.85)";
        if (/\/\/|\/\*|#/.test(line)) return "rgba(67,233,123,0.7)";
        if (/["'`]/.test(line)) return "rgba(255,179,71,0.7)";
        return "rgba(228,228,240,0.4)";
      }
      function sync() { if (tabs[activeIdx]) { tabs[activeIdx].content = area.value; tabs[activeIdx].dirty = true; } }
      area.addEventListener("input", () => { sync(); drawGutter(); drawMini(); });
      area.addEventListener("scroll", () => { gutter.scrollTop = area.scrollTop; });
      area.addEventListener("keydown", (e) => {
        if (e.key === "Tab") { e.preventDefault(); const s = area.selectionStart; area.value = area.value.slice(0, s) + "  " + area.value.slice(area.selectionEnd); area.selectionStart = area.selectionEnd = s + 2; sync(); drawGutter(); drawMini(); }
        if (e.ctrlKey && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
        if (e.ctrlKey && e.key.toLowerCase() === "f") { e.preventDefault(); toggleFind(); }
      });
      function save() {
        const t = tabs[activeIdx]; if (!t) return;
        if (!t.path) {
          const name = prompt("Save as:", t.name);
          if (!name) return;
          t.path = "/home/explorer/" + name; t.name = name;
        }
        AE.fs.write(t.path, t.content, "text"); AE.fs.persistFS();
        t.dirty = false; render();
        AE.notify("Saved", t.name, "success");
      }
      function toggleFind() { $("#ed-find", body).classList.toggle("show"); if ($("#ed-find", body).classList.contains("show")) $("#ed-find-input", body).focus(); }
      $("#ed-find-go", body).onclick = () => doFind();
      $("#ed-replace", body).onclick = () => doReplace(false);
      $("#ed-replace-all", body).onclick = () => doReplace(true);
      $("#ed-find-close", body).onclick = () => $("#ed-find", body).classList.remove("show");
      function doFind() {
        const q = $("#ed-find-input", body).value; if (!q) return;
        const idx = area.value.indexOf(q, area.selectionEnd);
        if (idx >= 0) { area.focus(); area.setSelectionRange(idx, idx + q.length); }
      }
      function doReplace(all) {
        const q = $("#ed-find-input", body).value, r = $("#ed-replace-input", body).value;
        if (!q) return;
        if (all) { area.value = area.value.split(q).join(r); } else {
          const idx = area.value.indexOf(q, area.selectionEnd);
          if (idx >= 0) { area.setSelectionRange(idx, idx + q.length); area.setRangeText(r); }
        }
        sync(); drawGutter(); drawMini();
      }
      $("#ed-new", body).onclick = () => newTab(null, "", "untitled.txt");
      $("#ed-save", body).onclick = () => save();
      $("#ed-find", body).onclick = () => toggleFind();
      $("#ed-theme", body).onclick = () => { theme = theme === "dark" ? "light" : "dark"; area.style.background = theme === "dark" ? "transparent" : "#f4f4f8"; area.style.color = theme === "dark" ? "var(--star)" : "#111"; };
      $("#ed-wrap", body).onclick = () => { area.style.whiteSpace = area.style.whiteSpace === "pre-wrap" ? "pre" : "pre-wrap"; };
      if (path) {
        const c = AE.fs.read(path);
        if (c != null) newTab(path, c);
        else newTab(null, "", path.split("/").filter(Boolean).pop());
      } else {
        newTab(null, "// Prism Editor — Ctrl+S to save, Ctrl+F to find\nconsole.log('hello, ÆTHER');\n", "untitled.js");
      }
      render();
    },
  });

  /* ============ CALCULATOR ============ */
  AE.register({
    id: "calc", name: "Nebula Calc", icon: "🧮", width: 380, height: 520, single: true,
    mount(body) {
      let expr = "", result = "0", mode = "std", angle = "deg", history = [];
      body.innerHTML = `
        <div class="calc">
          <div class="calc-toggle">
            <button data-m="std" class="active">Standard</button>
            <button data-m="sci">Scientific</button>
            <button data-a="deg" class="active">DEG</button>
            <button data-a="rad">RAD</button>
          </div>
          <div class="calc-display"><div class="expr" id="c-expr"></div><div class="result" id="c-res">0</div></div>
          <div class="calc-grid" id="c-grid"></div>
          <div class="calc-history" id="c-hist"></div>
        </div>`;
      const grid = $("#c-grid", body), exprEl = $("#c-expr", body), resEl = $("#c-res", body), histEl = $("#c-hist", body);
      const stdBtns = [
        ["C", "⌫", "(", ")", "÷"],
        ["7", "8", "9", "×", "%"],
        ["4", "5", "6", "−", "x²"],
        ["1", "2", "3", "+", "xʸ"],
        ["±", "0", ".", "=", "√"],
      ];
      const sciExtras = ["sin", "cos", "tan", "log", "ln", "π", "e", "n!", "1/x", "abs"];
      function render() {
        grid.innerHTML = "";
        const btns = mode === "std" ? stdBtns : [
          ["sin", "cos", "tan", "log", "ln"],
          ["π", "e", "n!", "1/x", "abs"],
          ["C", "⌫", "(", ")", "÷"],
          ["7", "8", "9", "×", "%"],
          ["4", "5", "6", "−", "x²"],
          ["1", "2", "3", "+", "xʸ"],
          ["±", "0", ".", "=", "√"],
        ];
        btns.forEach(row => row.forEach(label => {
          const b = tag("button", btnClass(label));
          b.textContent = label;
          b.onclick = () => press(label);
          grid.appendChild(b);
        }));
      }
      function btnClass(l) {
        if (["÷", "×", "−", "+", "=", "xʸ", "√", "%", "1/x", "abs", "mod"].includes(l)) return "op";
        if (["sin", "cos", "tan", "log", "ln", "π", "e", "n!"].includes(l)) return "op";
        if (l === "=") return "eq";
        return "";
      }
      function press(l) {
        switch (l) {
          case "C": expr = ""; result = "0"; break;
          case "⌫": expr = expr.slice(0, -1); break;
          case "=": evaluate(); break;
          case "±": if (expr) { if (expr.startsWith("-")) expr = expr.slice(1); else expr = "-" + expr; } break;
          case "x²": expr += "²"; break;
          case "xʸ": expr += "^"; break;
          case "√": expr += "√("; break;
          case "π": expr += "π"; break;
          case "e": expr += "e"; break;
          case "n!": expr += "!"; break;
          case "sin": case "cos": case "tan": case "log": case "ln": case "abs": expr += l + "("; break;
          case "1/x": expr += "1/("; break;
          case "÷": expr += "/"; break;
          case "×": expr += "*"; break;
          case "−": expr += "-"; break;
          case "%": expr += "%"; break;
          default: expr += l;
        }
        exprEl.textContent = expr || " ";
        resEl.textContent = result;
      }
      function evaluate() {
        try {
          let e = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/π/g, "(Math.PI)").replace(/e(?![xp(])/g, "(Math.E)").replace(/²/g, "**2").replace(/\^/g, "**").replace(/√/g, "Math.sqrt").replace(/log/g, "Math.log10").replace(/ln/g, "Math.log").replace(/sin/g, angle === "deg" ? "__sd(" : "Math.sin(").replace(/cos/g, angle === "deg" ? "__cd(" : "Math.cos(").replace(/tan/g, angle === "deg" ? "__td(" : "Math.tan(").replace(/abs/g, "Math.abs").replace(/%/g, "/100");
          // factorial: replace N! with fact(N)
          e = e.replace(/(\d+)!/g, "__f($1)");
          const __sd = d => Math.sin(d * Math.PI / 180);
          const __cd = d => Math.cos(d * Math.PI / 180);
          const __td = d => Math.tan(d * Math.PI / 180);
          const __f = n => { n = Math.round(n); let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
          const v = Function("return (" + e + ")")();
          if (!isFinite(v) || isNaN(v)) throw new Error("math error");
          // easter egg: 0.1+0.2 → show joke then the real answer
          if (expr.replace(/\s/g, "") === "0.1+0.2") {
            result = "0.30000000000000004 ← blame floating point";
          } else {
            result = formatNum(v);
          }
          history.unshift(`${expr} = ${result}`);
          if (history.length > 30) history.pop();
          histEl.innerHTML = history.map(h => `<div>${esc(h)}</div>`).join("");
          expr = "";
        } catch { result = "error"; }
        exprEl.textContent = expr || " ";
        resEl.textContent = result;
      }
      function formatNum(n) { if (Number.isInteger(n)) return n.toString(); return parseFloat(n.toFixed(10)).toString(); }
      function esc(s) { return (s + "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
      $$(".calc-toggle button", body).forEach(b => b.onclick = () => {
        const m = b.dataset.m; if (m) { mode = m; $$(".calc-toggle button[data-m]", body).forEach(x => x.classList.toggle("active", x === b)); }
        const a = b.dataset.a; if (a) { angle = a; $$(".calc-toggle button[data-a]", body).forEach(x => x.classList.toggle("active", x === b)); }
        render();
      });
      render();
    },
  });

  /* ============ NOTES ============ */
  AE.register({
    id: "notes", name: "Starlog", icon: "📓", width: 720, height: 480, single: true,
    mount(body) {
      let notes = loadNotes(), active = 0, preview = false, saveTimer = null;
      function loadNotes() {
        try { const v = JSON.parse(localStorage.getItem("aether:notes") || "null"); if (Array.isArray(v)) return v; } catch {}
        return [{ id: nid(), title: "Welcome to Starlog", body: "# Welcome\n\nThis is **Starlog**, your markdown notes app.\n\n- create notes with + New\n- pin important ones\n- search with the bar\n- toggle preview with 👁\n\n> breathe the void ✨", pinned: true }];
      }
      function saveNotes() { localStorage.setItem("aether:notes", JSON.stringify(notes)); }
      function nid() { return "n" + Math.random().toString(36).slice(2, 8); }
      body.innerHTML = `
        <div class="notes">
          <div class="notes-side">
            <div class="hdr"><button id="n-new">+ New</button><button id="n-del">🗑</button></div>
            <input class="search" id="n-search" placeholder="search notes…" />
            <div class="notes-list" id="n-list"></div>
          </div>
          <div class="notes-main">
            <div class="notes-toolbar">
              <button id="n-pin">📌 Pin</button>
              <button id="n-preview">👁 Preview</button>
              <span class="spacer"></span>
              <span id="n-status"></span>
            </div>
            <input class="notes-title-input" id="n-title" placeholder="untitled" />
            <div class="notes-body">
              <textarea id="n-body" placeholder="write markdown…"></textarea>
              <div class="notes-preview hidden" id="n-preview-box"></div>
            </div>
          </div>
        </div>`;
      const list = $("#n-list", body), titleEl = $("#n-title", body), bodyEl = $("#n-body", body), previewBox = $("#n-preview-box", body), statusEl = $("#n-status", body);
      function renderList() {
        const q = ($("#n-search", body).value || "").toLowerCase();
        const filtered = notes.filter(n => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
        list.innerHTML = filtered.map(n => `
          <div class="n-item ${notes[active] && n.id === notes[active].id ? "active" : ""}" data-id="${n.id}">
            <div class="n-title">${n.pinned ? "📌 " : ""}${esc(n.title || "untitled")}</div>
            <div class="n-preview">${esc((n.body || "").slice(0, 60).replace(/[#*`>\-\n]/g, " "))}</div>
          </div>`).join("");
        $$(".n-item", body).forEach(el => el.onclick = () => { saveActive(); active = notes.findIndex(n => n.id === el.dataset.id); if (active < 0) active = 0; render(); });
      }
      function render() {
        renderList();
        const n = notes[active];
        if (!n) { titleEl.value = ""; bodyEl.value = ""; return; }
        titleEl.value = n.title; bodyEl.value = n.body;
        $("#n-pin", body).textContent = n.pinned ? "📌 Unpin" : "📌 Pin";
        previewBox.classList.toggle("hidden", !preview);
        bodyEl.classList.toggle("hidden", preview);
        if (preview) previewBox.innerHTML = renderMd(n.body);
        statusEl.textContent = `${n.body.length} chars · ${n.body.split(/\s+/).filter(Boolean).length} words`;
      }
      function saveActive() {
        const n = notes[active]; if (!n) return;
        n.title = titleEl.value; n.body = bodyEl.value; n.updated = Date.now();
      }
      function flushSave() { clearTimeout(saveTimer); saveActive(); saveNotes(); if (statusEl) statusEl.textContent = "saved"; }
      function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 400); }
      function renderMd(s) {
        // tiny markdown subset
        let h = (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        h = h.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
        h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
        h = h.replace(/^### (.+)$/gm, "<h3>$1</h3>");
        h = h.replace(/^## (.+)$/gm, "<h2>$1</h2>");
        h = h.replace(/^# (.+)$/gm, "<h1>$1</h1>");
        h = h.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");
        h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
        h = h.replace(/\*([^*]+)\*/g, "<i>$1</i>");
        h = h.replace(/^- (.+)$/gm, "<li>$1</li>");
        h = h.replace(/(<li>.*<\/li>\n?)+/g, m => "<ul>" + m + "</ul>");
        h = h.replace(/\n\n/g, "</p><p>");
        h = h.replace(/\n/g, "<br>");
        return "<p>" + h + "</p>";
      }
      function esc(s) { return (s + "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
      $("#n-new", body).onclick = () => { saveActive(); notes.unshift({ id: nid(), title: "untitled", body: "", pinned: false }); active = 0; saveNotes(); render(); };
      $("#n-del", body).onclick = () => { if (!notes[active]) return; if (!confirm("Delete note?")) return; notes.splice(active, 1); saveNotes(); active = Math.max(0, active - 1); render(); };
      $("#n-pin", body).onclick = () => { if (!notes[active]) return; notes[active].pinned = !notes[active].pinned; saveNotes(); render(); };
      $("#n-preview", body).onclick = () => { preview = !preview; render(); };
      $("#n-search", body).addEventListener("input", () => renderList());
      titleEl.addEventListener("input", () => { scheduleSave(); });
      bodyEl.addEventListener("input", () => { scheduleSave(); if (preview) previewBox.innerHTML = renderMd(bodyEl.value); });
      body._cleanup = () => { flushSave(); clearTimeout(saveTimer); };
      render();
    },
  });

  /* ============ ABOUT ============ */
  AE.register({
    id: "about", name: "Cosmos Info", icon: "✨", width: 460, height: 520, single: true,
    mount(body) {
      let clicks = 0, egg = false;
      body.innerHTML = `
        <div class="about">
          <div class="about-logo" id="ab-logo">✨</div>
          <div class="about-name">ÆTHER OS</div>
          <div class="about-tagline">"Breathe the void."</div>
          <div class="about-specs">
            <div><span class="k">Version</span><span>7.0.0 (Stardance 2026)</span></div>
            <div><span class="k">Kernel</span><span>Nebula Kernel v2.1.5</span></div>
            <div><span class="k">CPU</span><span>Quantum CPU 4.2 THz</span></div>
            <div><span class="k">RAM</span><span>Dark Matter RAM 128 PB</span></div>
            <div><span class="k">GPU</span><span>Photon Accelerator</span></div>
            <div><span class="k">Disk</span><span>Singularity SSD 1.4 YB</span></div>
            <div><span class="k">Uptime</span><span id="ab-uptime">0s</span></div>
          </div>
          <div class="about-credits">crafted for <b>Hack Club Stardance</b> · 2026 · by Subham</div>
          <div class="about-egg" id="ab-egg">pssst… triple-click me</div>
        </div>`;
      const start = Date.now();
      setInterval(() => { $("#ab-uptime", body).textContent = fmtUptime(Date.now() - start); }, 1000);
      function fmtUptime(ms) { const s = Math.floor(ms / 1000); const m = Math.floor(s / 60); const h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : m ? `${m}m ${s % 60}s` : `${s}s`; }
    },
  });

  /* ============ PULSE MONITOR ============ */
  AE.register({
    id: "monitor", name: "Pulse Monitor", icon: "📊", width: 620, height: 480, single: true,
    mount(body) {
      const PROCS = [
        { pid: 1, name: "init", cpu: 0.0, mem: 12 },
        { pid: 23, name: "stardust_compositor", cpu: 4.2, mem: 184 },
        { pid: 42, name: "dark_matter_daemon", cpu: 1.1, mem: 96 },
        { pid: 108, name: "quantum_resolver", cpu: 7.8, mem: 312 },
        { pid: 256, name: "nebula_kernel_thread", cpu: 0.4, mem: 48 },
        { pid: 512, name: "cosmic_bg_radiation", cpu: 0.0, mem: 8 },
        { pid: 1024, name: "warp_dns_cache", cpu: 0.2, mem: 24 },
      ];
      const CHARTS = [
        { id: "cpu", label: "CPU", color: "#7b2ff7" },
        { id: "mem", label: "Memory", color: "#00d4ff" },
        { id: "net", label: "Network", color: "#ff6b9d" },
        { id: "disk", label: "Disk", color: "#ffb347" },
        { id: "gpu", label: "GPU", color: "#43e97b" },
      ];
      body.innerHTML = `
        <div class="monitor">
          <div class="monitor-charts" id="m-charts"></div>
          <div class="monitor-procs">
            <div class="mp-hdr"><span>Processes</span><span>${PROCS.length} running</span></div>
            <div class="mp-row" style="color:#a0a0c8"><span>PID</span><span>NAME</span><span style="text-align:right">CPU</span><span style="text-align:right">MEM</span><span></span></div>
            <div id="m-procs"></div>
          </div>
        </div>`;
      const chartsEl = $("#m-charts", body);
      const procEl = $("#m-procs", body);
      const hist = CHARTS.map(() => []);
      function seedHist() { CHARTS.forEach((c, i) => { for (let k = 0; k < 30; k++) hist[i].push(20 + Math.random() * 30); }); }
      seedHist();
      function renderCharts() {
        chartsEl.innerHTML = "";
        CHARTS.forEach((c, i) => {
          const el = tag("div", "monitor-chart");
          el.innerHTML = `<div class="mc-title"><span>${c.label}</span><span id="mcv-${i}">${hist[i][hist[i].length - 1].toFixed(0)}%</span></div><canvas id="mcc-${i}"></canvas>`;
          chartsEl.appendChild(el);
          const cv = $(`#mcc-${i}`, body), ctx = cv.getContext("2d");
          cv.width = cv.clientWidth; cv.height = 80;
          ctx.clearRect(0, 0, cv.width, cv.height);
          ctx.beginPath();
          const h = hist[i];
          for (let k = 0; k < h.length; k++) {
            const x = (k / (h.length - 1)) * cv.width;
            const y = cv.height - (h[k] / 100) * cv.height;
            if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.lineTo(cv.width, cv.height); ctx.lineTo(0, cv.height); ctx.closePath();
          const g = ctx.createLinearGradient(0, 0, 0, cv.height);
          g.addColorStop(0, c.color + "88"); g.addColorStop(1, c.color + "00");
          ctx.fillStyle = g; ctx.fill();
          ctx.beginPath();
          for (let k = 0; k < h.length; k++) { const x = (k / (h.length - 1)) * cv.width; const y = cv.height - (h[k] / 100) * cv.height; if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
          ctx.strokeStyle = c.color; ctx.lineWidth = 2; ctx.stroke();
        });
      }
      function renderProcs() {
        procEl.innerHTML = "";
        PROCS.forEach(p => {
          const row = tag("div", "mp-row");
          row.innerHTML = `<span>${p.pid}</span><span>${p.name}</span><span style="text-align:right">${p.cpu.toFixed(1)}%</span><span style="text-align:right">${p.mem} MB</span>`;
          const btn = tag("button", "", "kill");
          btn.onclick = () => {
            if (p.pid === 1) { AE.notify("Permission denied", "cannot kill init", "error"); return; }
            AE.notify("Killed", `${p.name} (PID ${p.pid})`, "success");
            p.cpu = 0; p.mem = 0; p.killed = true;
            btn.disabled = true; btn.textContent = "✓"; btn.style.color = "#43e97b";
          };
          row.appendChild(btn);
          procEl.appendChild(row);
        });
      }
      renderCharts(); renderProcs();
      const iv = setInterval(() => {
        CHARTS.forEach((c, i) => {
          let v = (hist[i][hist[i].length - 1]) + (Math.random() - 0.5) * 12;
          if (Math.random() < 0.05) v = 60 + Math.random() * 35; // spike
          v = Math.max(2, Math.min(98, v));
          hist[i].push(v); hist[i].shift();
          const lbl = $(`#mcv-${i}`, body); if (lbl) lbl.textContent = v.toFixed(0) + "%";
        });
        renderCharts();
        PROCS.forEach(p => { if (p.pid === 1 || p.killed) return; p.cpu = Math.max(0, p.cpu + (Math.random() - 0.5) * 2); p.cpu = Math.min(p.cpu, 25); });
        renderProcs();
      }, 1500);
      body._cleanup = () => clearInterval(iv);
    },
  });

  /* ============ SYSTEM CORE (settings) ============ */
  AE.register({
    id: "settings", name: "System Core", icon: "⚙️", width: 640, height: 460, single: true,
    mount(body, win) {
      const TABS = [
        { id: "wallpaper", label: "Wallpaper" },
        { id: "accent", label: "Accent" },
        { id: "dock", label: "Dock" },
        { id: "sound", label: "Sound" },
        { id: "about", label: "About" },
      ];
      let tab = (win && win.opts && win.opts.initialTab) || "wallpaper";
      body.innerHTML = `
        <div class="settings">
          <div class="settings-side" id="s-side"></div>
          <div class="settings-main" id="s-main"></div>
        </div>`;
      const side = $("#s-side", body), main = $("#s-main", body);
      function renderSide() {
        side.innerHTML = "";
        TABS.forEach(t => {
          const el = tag("div", "s-item" + (t.id === tab ? " active" : ""));
          el.textContent = t.label;
          el.onclick = () => { tab = t.id; renderSide(); renderTab(); };
          side.appendChild(el);
        });
      }
      function renderTab() {
        main.innerHTML = "";
        if (tab === "wallpaper") renderWallpaper();
        else if (tab === "accent") renderAccent();
        else if (tab === "dock") renderDock();
        else if (tab === "sound") renderSound();
        else if (tab === "about") renderAbout();
      }
      let _wallThumbs = [];
      function renderWallpaper() {
        const wrap = tag("div");
        wrap.innerHTML = `<h3 style="margin-bottom:10px">Wallpaper</h3>`;
        const grid = tag("div", "");
        grid.style.display = "grid"; grid.style.gridTemplateColumns = "repeat(3,1fr)"; grid.style.gap = "10px";
        _wallThumbs = [];
        for (let i = 0; i < 6; i++) {
          const cv = tag("canvas"); cv.width = 200; cv.height = 112; cv.style.borderRadius = "8px"; cv.style.cursor = "pointer";
          cv.style.border = (AE.settings.wallIdx === i && !AE.settings.customWall) ? "2px solid var(--cyan)" : "2px solid transparent";
          cv.style.transition = "border-color 0.15s";
          // use distinct seed per slot so each thumb looks unique
          const slotSeed = ((AE.settings.wallSeed || 1) * 1000 + i * 317 + 13);
          _renderThumb(cv, i, slotSeed);
          cv.onclick = () => { AE.clearCustomWall && AE.clearCustomWall(); AE.applyWall && AE.applyWall(i); refreshWallThumbs(); };
          grid.appendChild(cv);
          _wallThumbs.push(cv);
        }
        // custom upload
        const custom = tag("div", "");
        custom.style.marginTop = "12px";
        const lbl = tag("label", "", "Upload your own: ");
        const inp = tag("input"); inp.type = "file"; inp.accept = "image/*"; inp.style.color = "#e4e4f0";
        inp.onchange = () => {
          const f = inp.files[0]; if (!f) return;
          const rd = new FileReader();
          rd.onload = () => {
            const img = new Image();
            img.onload = () => {
              const cv = document.createElement("canvas");
              const max = 1920;
              let w = img.width, h = img.height;
              if (w > max) { h = (h * max / w); w = max; }
              cv.width = w; cv.height = h;
              cv.getContext("2d").drawImage(img, 0, 0, w, h);
              AE.applyCustomWall && AE.applyCustomWall(cv.toDataURL("image/jpeg", 0.85));
              AE.notify("Wallpaper set", "custom image applied", "success");
            };
            img.src = rd.result;
          };
          rd.readAsDataURL(f);
        };
        custom.appendChild(lbl); custom.appendChild(inp);
        if (AE.settings.customWall) {
          const rb = tag("button", "", "Remove custom");
          rb.style.marginTop = "8px"; rb.style.padding = "6px 12px";
          rb.style.background = "var(--glass)"; rb.style.border = "1px solid var(--glass-border)"; rb.style.borderRadius = "6px";
          rb.onclick = () => { AE.clearCustomWall && AE.clearCustomWall(); AE.notify("Wallpaper reset", "back to procedural", "info"); };
          custom.appendChild(rb);
        }
        const rndRow = tag("div", ""); rndRow.style.marginTop = "10px";
        const rndBtn = tag("button", "", "🎲 Randomize seed");
        rndBtn.style.padding = "6px 14px"; rndBtn.style.background = "var(--glass)"; rndBtn.style.border = "1px solid var(--glass-border)"; rndBtn.style.borderRadius = "6px"; rndBtn.style.cursor = "pointer";
        rndBtn.onclick = () => { AE.settings.wallSeed = Math.floor(Math.random() * 999999); AE.saveSettings && AE.saveSettings(); refreshWallThumbs(); AE.applyWall && AE.applyWall(AE.settings.wallIdx); };
        rndRow.appendChild(rndBtn);
        wrap.appendChild(grid); wrap.appendChild(rndRow); wrap.appendChild(custom);
        main.appendChild(wrap);
      }
      function refreshWallThumbs() {
        _wallThumbs.forEach((cv, i) => {
          if (!cv) return;
          cv.style.border = (AE.settings.wallIdx === i && !AE.settings.customWall) ? "2px solid var(--cyan)" : "2px solid transparent";
          const slotSeed = ((AE.settings.wallSeed || 1) * 1000 + i * 317 + 13);
          _renderThumb(cv, i, slotSeed);
        });
      }
      function _renderThumb(cv, variant, seed) {
        if (AE.generateThumb) return AE.generateThumb(cv, variant, seed);
        const ctx = cv.getContext("2d");
        const grads = ["#7b2ff7", "#00d4ff", "#00f5d4", "#9d4edd", "#c084fc", "#ff006e"];
        const g = ctx.createLinearGradient(0, 0, 200, 112);
        g.addColorStop(0, grads[variant % 6]); g.addColorStop(1, "#0a0a1a");
        ctx.fillStyle = g; ctx.fillRect(0, 0, 200, 112);
      }
      let accentWrap = null;
      function renderAccent() {
        const wrap = tag("div");
        wrap.innerHTML = `<h3 style="margin-bottom:10px">Accent Color</h3>`;
        const row = tag("div", ""); row.style.display = "flex"; row.style.gap = "10px";
        const ACCENTS = { purple: "#7b2ff7", cyan: "#00d4ff", pink: "#ff6b9d", gold: "#ffb347", green: "#43e97b" };
        Object.keys(ACCENTS).forEach(k => {
          const sw = tag("div", "");
          sw.style.width = "40px"; sw.style.height = "40px"; sw.style.borderRadius = "50%";
          sw.style.background = ACCENTS[k]; sw.style.cursor = "pointer";
          sw.style.border = (AE.settings.accent === k) ? "3px solid #fff" : "3px solid transparent";
          sw.onclick = () => { AE.settings.accent = k; AE.saveSettings && AE.saveSettings(); AE.updateAccent && AE.updateAccent(); refreshAccentBorders(); };
          row.appendChild(sw);
        });
        wrap.appendChild(row);
        main.appendChild(wrap);
        accentWrap = row;
      }
      function refreshAccentBorders() {
        if (!accentWrap) return;
        const ACCENTS = { purple: "#7b2ff7", cyan: "#00d4ff", pink: "#ff6b9d", gold: "#ffb347", green: "#43e97b" };
        const keys = Object.keys(ACCENTS);
        [...accentWrap.children].forEach((sw, i) => {
          sw.style.border = (AE.settings.accent === keys[i]) ? "3px solid #fff" : "3px solid transparent";
        });
      }
      let dockPosRow = null, magValEl = null, magSl = null;
      function renderDock() {
        const wrap = tag("div");
        wrap.innerHTML = `<h3 style="margin-bottom:10px">Dock</h3>`;
        const pos = tag("div", ""); pos.style.marginBottom = "14px";
        pos.innerHTML = `<div style="color:#a0a0c8;margin-bottom:6px">Position</div>`;
        const posRow = tag("div", ""); posRow.style.display = "flex"; posRow.style.gap = "10px";
        ["bottom", "left", "right"].forEach(p => {
          const b = tag("button", "", p);
          b.style.padding = "8px 16px"; b.style.background = "var(--glass)"; b.style.border = "1px solid var(--glass-border)"; b.style.borderRadius = "6px";
          if (AE.settings.dockPos === p) b.style.borderColor = "var(--cyan)";
          b.onclick = () => { AE.settings.dockPos = p; AE.saveSettings && AE.saveSettings(); AE.updateDockPos && AE.updateDockPos(); refreshDockPos(); };
          posRow.appendChild(b);
        });
        pos.appendChild(posRow);
        const mag = tag("div", "");
        mag.innerHTML = `<div style="color:#a0a0c8;margin-bottom:6px">Magnification: <span id="magv">${AE.settings.magnification || 1.5}</span>×</div>`;
        const sl = tag("input"); sl.type = "range"; sl.min = "1"; sl.max = "2.5"; sl.step = "0.1"; sl.value = AE.settings.magnification || 1.5; sl.style.width = "100%";
        sl.oninput = () => { AE.settings.magnification = +sl.value; if (magValEl) magValEl.textContent = sl.value; AE.saveSettings && AE.saveSettings(); AE.updateDockPos && AE.updateDockPos(); };
        mag.appendChild(sl);
        wrap.appendChild(pos); wrap.appendChild(mag);
        main.appendChild(wrap);
        dockPosRow = posRow; magValEl = $("#magv", wrap); magSl = sl;
      }
      function refreshDockPos() {
        if (!dockPosRow) return;
        [...dockPosRow.children].forEach((b, i) => {
          const p = ["bottom", "left", "right"][i];
          b.style.borderColor = (AE.settings.dockPos === p) ? "var(--cyan)" : "var(--glass-border)";
        });
      }
      function renderSound() {
        const wrap = tag("div");
        wrap.innerHTML = `<h3 style="margin-bottom:10px">Sound</h3>`;
        const row = tag("div", ""); row.style.display = "flex"; row.style.alignItems = "center"; row.style.gap = "12px";
        const tog = tag("button", "", AE.settings.sound ? "Enabled" : "Disabled");
        tog.style.padding = "8px 18px"; tog.style.background = "var(--glass)"; tog.style.border = "1px solid var(--glass-border)"; tog.style.borderRadius = "6px";
        tog.onclick = () => { AE.settings.sound = !AE.settings.sound; AE.saveSettings && AE.saveSettings(); renderSound(); };
        row.appendChild(tog);
        wrap.appendChild(row);
        const rb = tag("button", "", "Reset to defaults");
        rb.style.marginTop = "18px"; rb.style.padding = "8px 16px"; rb.style.background = "var(--glass)"; rb.style.border = "1px solid var(--glass-border)"; rb.style.borderRadius = "6px";
        rb.onclick = () => {
          AE.settings = { accent: "purple", sound: true, dockPos: "bottom", magnification: 1.5, wallIdx: 0, opacity: 0.78 };
          AE.saveSettings && AE.saveSettings(); AE.updateAccent && AE.updateAccent(); AE.updateDockPos && AE.updateDockPos(); AE.applyWall && AE.applyWall(0);
          AE.notify("Reset", "defaults restored", "success"); renderTab(); renderSide();
        };
        wrap.appendChild(rb);
        main.appendChild(wrap);
      }
      function renderAbout() {
        const wrap = tag("div");
        wrap.innerHTML = `<h3 style="margin-bottom:10px">About</h3>
          <div style="line-height:1.8">
            <div><b>ÆTHER OS</b></div>
            <div style="color:#a0a0c8">Version 7.0.0 · Nebula Kernel v2.1.5 · Stardance 2026</div>
            <div style="color:#a0a0c8;margin-top:8px">Zero dependencies. Zero build step. ~5,500 lines of vanilla JS+CSS.</div>
            <div style="color:#a0a0c8;margin-top:8px">Lives in your browser. Deploys as a static site.</div>
          </div>`;
        main.appendChild(wrap);
      }
      renderSide(); renderTab();
    },
  });

  /* ============ HELPERS ============ */
  function _esc(s) { return (s + "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
})();