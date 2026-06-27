/* ============================================================
   ÆTHER OS — virtual filesystem + desktop + context menus.
   FS is a tree persisted to localStorage. Desktop renders
   top-level items of /home/explorer; icons drag to reorder,
   right-click → New Folder/File/Rename/Delete/Wallpaper/About,
   double-click opens folder in explorer or file in editor.
   ============================================================ */
(function () {
  "use strict";
  const AE = window.AE;
  const $ = (s, r = document) => r.querySelector(s);
  const tag = (n, cls, html) => { const e = document.createElement(n); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  const KEY = "aether:fs";
  const DEKTOP_KEY = "aether:desktop";

  /* ============ VIRTUAL FS ============ */
  let FS;
  function defaultFS() {
    return {
      "/": {
        home: {
          explorer: {
            "readme.txt": { t: "text", c: "welcome to ÆTHER OS — breathe the void. \nthis is the home folder. drag icons, right-click for options.\n\n🧾 double-clicks: folders open in Void Navigator, files open in Prism Editor.\n⚙️   try the Stellar Terminal: `help` then `neofetch`." },
            projects: { "hello.js": { t: "text", c: "console.log(\"hello, ÆTHER\");\n" }, "page.html": { t: "text", c: "<!doctype html>\n<h1>Hello from ÆTHER</h1>" } },
            notes: { "launch.md": { t: "text", c: "# Launch Notes\n\n- [x] boot seq\n- [x] starfield\n- [x] window manager\n- [ ] publish devlog 6" } },
          },
        },
      },
    };
  }

  function loadFS() {
    try { FS = JSON.parse(localStorage.getItem(KEY)); } catch { FS = null; }
    if (!FS) { FS = defaultFS(); persistFS(); }
  }
  function persistFS() { localStorage.setItem(KEY, JSON.stringify(FS)); }

  function splitPath(p) {
    if (!p) return [];
    return p.replace(/\/+$/, "").split("/").filter(Boolean);
  }
  function getParentAndName(p) {
    const segs = splitPath(p);
    const name = segs.pop();
    return ["/" + segs.join("/") || "/", name];
  }
  function resolve(p, create) {
    const segs = splitPath(p);
    let cur = FS;
    for (const s of segs) {
      if (!cur[s]) {
        if (create) cur[s] = {};
        else return null;
      }
      cur = cur[s];
    }
    return cur;
  }
  function isFile(node) { return node && typeof node === "object" && "t" in node && "c" in node; }
  function isFolder(node) { return node && typeof node === "object" && !isFile(node); }

  AE.fs = {
    node: (path) => resolve(path, false),
    ls(path) {
      const n = resolve(path, false);
      if (!isFolder(n)) return [];
      return Object.keys(n).map(k => ({ name: k, folder: isFolder(n[k]), file: isFile(n[k]) })).sort((a, b) => (a.folder === b.folder) ? a.name.localeCompare(b.name) : (a.folder ? -1 : 1));
    },
    read(path) {
      const n = resolve(path, false);
      if (!isFile(n)) return null;
      return n.c;
    },
    write(path, content, type) {
      const [parent, name] = getParentAndName(p);
      const pn = resolve(parent, true);
      pn[name] = { t: type || "text", c: content };
      persistFS();
      return true;
    },
    mkdir(path) {
      resolve(path, true);
      persistFS();
    },
    touch(path) {
      return AE.fs.write(path, "", "text");
    },
    rm(path) {
      // path like /home/explorer/foo[/bar]
      let segments;
      segments = path.split("/").filter(Boolean);
      const name = segments.pop();
      const parentPath = "/" + segments.join("/");
      const pn = resolve(parentPath, false);
      if (!pn || !(name in pn)) return false;
      delete pn[name];
      persistFS();
      return true;
    },
    rename(path, newName) {
      const segs = splitPath(path);
      const old = segs.pop();
      const parentPath = "/" + segs.join("/");
      const pn = resolve(parentPath, false);
      if (!pn || !(old in pn) || !newName || newName in pn) return false;
      pn[newName] = pn[old];
      delete pn[old];
      persistFS();
      return true;
    },
    exists(path) { return !!resolve(path, false); },
    isFolder: (path) => isFolder(resolve(path, false)),
    isFile: (path) => isFile(resolve(path, false)),
    defaultPath: () => "/home/explorer",
  };

  loadFS();

  /* ============ DESKTOP ICONS ============ */
  let desktopOrder = null;
  function loadDesktop() {
    try { desktopOrder = JSON.parse(localStorage.getItem(DEKTOP_KEY)); } catch { desktopOrder = null; }
    if (!Array.isArray(desktopOrder)) {
      desktopOrder = AE.fs.ls("/home/explorer").map(i => i.name);
      persistDesktop();
    }
  }
  function persistDesktop() { localStorage.setItem(DEKTOP_KEY, JSON.stringify(desktopOrder)); }

  function renderDesktop() {
    const grid = $(".desktop-icons");
    grid.innerHTML = "";
    const inOrder = desktopOrder.filter(n => {
      const p = "/home/explorer/" + n;
      try { return AE.fs.exists(p); } catch { return true; }
    });
    const actual = AE.fs.ls("/home/explorer").map(i => i.name);
    actual.forEach(n => { if (!inOrder.includes(n)) inOrder.push(n); });
    desktopOrder = inOrder;
    persistDesktop();

    inOrder.forEach(name => {
      const path = "/home/explorer/" + name;
      const isF = AE.fs.isFolder(path);
      const el = tag("div", "dicon");
      el.dataset.path = path;
      el.dataset.name = name;
      el.innerHTML = `<div class="ico">${isF ? "📁" : iconForFile(name)}</div><div class="lbl">${name}</div>`;
      el.ondblclick = () => {
        if (isF) { AE.open("explorer", { path }); }
        else { AE.open("editor", { path }); }
      };
      el.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); selectIcon(el); desktopIconCtx(e, path, name, isF); };
      el.onclick = (e) => { e.stopPropagation(); selectIcon(el); };
      // drag reorder
      el.draggable = true;
      el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/aether-path", path); el.style.opacity = "0.5"; });
      el.addEventListener("dragend", () => { el.style.opacity = ""; });
      el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("selected"); });
      el.addEventListener("dragleave", () => el.classList.remove("selected"));
      el.addEventListener("drop", (e) => {
        e.preventDefault(); e.stopPropagation();
        el.classList.remove("selected");
        const fromPath = e.dataTransfer.getData("text/aether-path");
        if (!fromPath || fromPath === path) return;
        handleDropOnDesktop(fromPath, path, isF);
      });
      grid.appendChild(el);
    });

    // empty area right-click
    grid.ondblclick = () => {};
  }
  function iconForFile(name) {
    if (/\.(js|ts)$/i.test(name)) return "🟨";
    if (/\.(css|scss)$/i.test(name)) return "🎨";
    if (/\.html?$/i.test(name)) return "🌐";
    if (/\.md$/i.test(name)) return "📝";
    if (/\.(png|jpg|gif)/i.test(name)) return "🖼";
    return "📄";
  }
  function handleDropOnDesktop(fromPath, toPath, isTargetFolder) {
    if (!isTargetFolder) return;
    // move fromPath into toFolder
    const fromName = fromPath.split("/").filter(Boolean).pop();
    const destBase = (toPath + "/" + fromName).replace("//", "/");
    const srcNode = AE.fs.node(fromPath);
    if (!srcNode) return;
    // copy then delete (we only have JSON)
    const deepCopy = JSON.parse(JSON.stringify(srcNode));
    // write to dest
    const segs = destBase.split("/").filter(Boolean);
    const destName = segs.pop();
    let cur = AE.fs.resolve("/" + segs.join("/"), true);
    cur[destName] = deepCopy;
    AE.fs.rm(fromPath);
    AE.fs.persistFS();
    AE.notify("Moved", `${fromName} → ${toPath.split("/").pop()}/`, "success");
    renderDesktop();
  }
  function selectIcon(el) {
    $$(".dicon.selected").forEach(x => x.classList.remove("selected"));
    if (el) el.classList.add("selected");
  }

  // empty-area background context menu
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".dicon") || e.target.closest(".ctx-menu") || e.target.closest(".window") || e.target.closest(".menubar") || e.target.closest(".dock")) return;
    e.preventDefault();
    openDesktopCtx(e.clientX, e.clientY);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dicon")) $$(".dicon.selected").forEach(x => x.classList.remove("selected"));
  });

  function openDesktopCtx(x, y) {
    AE.showCtx([
      { label: "New Folder", action: () => desktopNewFolder() },
      { label: "New Text File", action: () => desktopNewFile() },
      { sep: true },
      { label: "Change Wallpaper", action: () => AE.open("settings", { initialTab: "wallpaper" }) },
      { label: "Settings", action: () => AE.open("settings") },
      { sep: true },
      { label: "Open Terminal Here", action: () => AE.open("terminal") },
      { label: "Refresh", action: () => renderDesktop() },
      { sep: true },
      { label: "About ÆTHER", action: () => AE.open("about") },
    ], x, y);
  }
  function desktopIconCtx(e, path, name, isF) {
    const items = [];
    items.push({ label: "Open", action: () => { if (isF) AE.open("explorer", { path }); else AE.open("editor", { path }); } });
    if (isF) items.push({ label: "Open in New Window", action: () => AE.open("explorer", { path }) });
    items.push({ sep: true });
    items.push({ label: "Rename", action: () => startRename(path, name, isF) });
    items.push({ label: "Delete", action: () => desktopDelete(path, name, isF) });
    items.push({ sep: true });
    items.push({ label: "Get Info", action: () => AE.notify("Info", `${path} · ${isF ? "folder" : "file"}`, "info") });
    AE.showCtx(items, e.clientX, e.clientY);
  }

  function startRename(path, name, isF) {
    const el = $(`.dicon[data-path="${css(path)}"] .lbl`);
    if (!el) return;
    el.contentEditable = "true";
    el.dataset.rename = "1";
    const finish = (save) => {
      el.contentEditable = "false";
      delete el.dataset.rename;
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("blur", onBlur);
      if (!save) { el.textContent = name; return; }
      const nv = (el.textContent || "").trim();
      if (!nv || nv === name) { el.textContent = name; return; }
      if (AE.fs.rename(path, nv)) {
        AE.notify("Renamed", `${name} → ${nv}`, "success");
        renderDesktop();
      } else {
        AE.notify("Rename failed", "name already exists or invalid", "error");
        el.textContent = name;
      }
    };
    const onKey = (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); finish(true); } if (e.key === "Escape") finish(false); };
    const onBlur = () => finish(true);
    el.addEventListener("keydown", onKey);
    el.addEventListener("blur", onBlur);
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
  }
  function desktopDelete(path, name, isF) {
    if (confirm(`Delete "${name}"?`)) {
      if (AE.fs.rm(path)) { AE.notify("Deleted", name, "success"); renderDesktop(); }
      else AE.notify("Delete failed", name, "error");
    }
  }
  function desktopNewFolder() {
    let name = "New Folder", i = 1;
    while (AE.fs.exists("/home/explorer/" + name)) name = `New Folder ${++i}`;
    AE.fs.mkdir("/home/explorer/" + name);
    desktopOrder.push(name);
    persistDesktop();
    AE.notify("New folder", name, "success");
    renderDesktop();
  }
  function desktopNewFile() {
    let name = "untitled.txt", i = 1;
    while (AE.fs.exists("/home/explorer/" + name)) name = `untitled ${++i}.txt`;
    AE.fs.write("/home/explorer/" + name, "", "text");
    desktopOrder.push(name);
    persistDesktop();
    AE.notify("New file", name, "success");
    renderDesktop();
  }
  AE.desktopNewFolder = desktopNewFolder;
  AE.desktopNewFile = desktopNewFile;
  function css(s) { return s.replace(/"/g, '\\"'); }

  loadDesktop();
  renderDesktop();
  AE.renderDesktop = renderDesktop;

  /* ============ HELP app (simple about-shortcuts) ============ */
  // registered when apps.js loads (kept here to persist ordering)
  window.__fsReady = true;
})();
