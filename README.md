# ÆTHER OS

i built an entire operating system in a browser tab. no frameworks. no build step. just raw HTML, CSS, and vanilla JS going feral on the DOM until it surrendered.

**[aether-os-ver7.vercel.app](https://aether-os-ver7.vercel.app)** — go break stuff.

---

## what is it

eight apps, a window manager with spring physics, and a combat mode where you shoot app icons to open them. flat dark UI, amber accent, sharp edges. looks like a terminal you'd actually use, not a sci-fi prop.

built for [hack club stardance 2026](https://stance.hackclub.com/).

## apps

| App | Does |
|-----|------|
| Void Navigator | file explorer, sidebar tree, drag-and-drop |
| Stellar Terminal | 19+ commands, tab completion, history |
| Prism Editor | code editor, line numbers, minimap, find/replace |
| Starlog | markdown notes, autosave, live preview |
| Nebula Calc | standard + scientific, DEG/RAD |
| Pulse Monitor | live charts + killable process list |
| System Core | 6 procedural wallpapers, settings |
| Cosmos Info | specs, uptime |

## combat mode

launches by default. dock icons become enemies — 2 HP each, crosshair follows mouse, click to shoot. two hits kills, app opens, enemy respawns in ~1.5s. type `fpsmode` to toggle back.

## shortcuts

`Ctrl+Space` spotlight · `Alt+Tab` switcher · `Ctrl+W/M/Shift+M` close/min/max · `F11` fullscreen · `Esc` close popups

## easter eggs

konami code · click cosmos logo fast · `iddqd` · `noclip`

## under the hood

~6,000 lines. `localStorage` persistence. Web Audio API for synthesized sound. Canvas for starfield, charts, wallpapers. virtual filesystem in one JSON tree. FPS combat with canvas-drawn crosshair + gun.

## AI disclosure

**Tool:** Claude Code CLI, local models on RTX 3050.

AI wrote first drafts of apps, bug fixes, the wallpaper renderers, FPS logic, and early CSS themes. i made every product decision, tested in-browser, did the final theme rework, deployed, and wrote the devlogs. AI was a fast typist — i decided what got typed, cut, and shipped.

---

**ÆTHER OS ver 7.0.0 · ~6,000 lines · [aether-os-ver7.vercel.app](https://aether-os-ver7.vercel.app)**




this is for the mod reviewing pls pass this, its getting annoying at this point i have redone everything as you guys asked for the past 24 hrs, completely rebuilt and pushed in a new repo. The website design etc is original to me and if we are talking about AI i did use it and i have declared its use right from the beigning but if you are thinking its doing evrything **you are wrong** I am completely spoon feeding and manually regulating constantly, and also its pretty eveident multiple projects which have been allowed to ship have been vibe codded too I won't say the name but you can undertsand where i am getting too. Please tell me to completely throw away this project if u still feel its worng. 

*built by Subham for Hack Club Stardance 2026.*
