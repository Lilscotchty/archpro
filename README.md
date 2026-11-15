# ArchPro (AutoFoundation AI / ConstructOS)

A browser-based construction toolkit built with React, Vite and TypeScript.

| Module | What it does |
| --- | --- |
| **Drawings & Simulation** | Trace a plan, draw grids/walls and generate a foundation plan sheet. |
| **Elevation Studio** *(new)* | Upload a plan (image or PDF) and generate **front, rear, left and right elevations** as black-and-white line drawings. |
| **Calculation & Measurement** | SMM7 take-off, priced bill of quantities and summary, AI drawing reader (Groq), stored drawings. |
| **Method Study** | Construction programme with critical path (Gantt) and a site risk register, both exportable to CSV. |
| **Building Physics** | U-value and heat loss, one-way slab / beam load take-down, and an editable embodied-carbon estimate. |

## Drawings & Simulation: 2D plan → 3D model

The Drafting Studio now has a **2D plan / 3D model** switch (top bar). The 3D view is a small PlayCanvas-based editor that builds a simple model from what you draw and updates live as you edit the plan.

- **What gets built:** walls (with real openings cut for doors and windows), plinth, window frames and glass, doors, floor slabs for every enclosed room (L-shapes and partitions work), columns, and a gable, hip, mono-pitch or flat roof. Rectangles become four walls.
- **Editing in 3D:** click any part to select it (it highlights in the 2D plan too). Doors and windows have editable width, height and sill. Set floors, floor height, plinth, wall and slab thickness, roof type, pitch and overhang, colours, and the sun direction and height.
- **Navigation:** left-drag orbit, right-drag look, middle-drag pan, wheel zoom; turn on Fly mode for WASD movement. Show or hide the roof and each floor level; wireframe, shadows and grid toggles.
- **Scale:** blank sheets are 1 unit = 1 mm. When tracing over an uploaded image, enter the real length of the longest side under *Scale* (or set *mm per drawing unit* in the 2D panel).
- **Export:** download a `.glb` (metres, +Y up) that opens in PlayCanvas, Blender, three.js and most viewers.
- **Doors and windows in 2D** now snap onto the nearest wall, centred on the click and aligned with it.

Limits: pitched roofs are built over the plan's bounding box; openings are generic (no door/window style variants yet); the 3D engine (~0.6 MB gzipped) loads only when the 3D tab is opened.

## Elevation Studio

1. **Plan & scale** – upload a PNG/JPG or a PDF (pick the page). Click the two ends of a dimension you know and enter its real length to calibrate.
2. **External walls** – trace the outer face of the building (click corners, or drag a rectangle). Snaps to corners and keeps walls orthogonal; undo with `Ctrl/⌘+Z`.
3. **Windows & doors** – click a wall to drop in a window or door, choose the style (casement, sliding, louvre, panelled, roller shutter …), then set width, height, sill height, floor and position, or drag it along the wall.
4. **Elevations** – set floors, floor height, plinth, roof (gable / hip / mono-pitch / flat), which plan side is the front, and scale. The A3 sheet updates live. Export **PNG** (300 dpi), **SVG** (vector) or **Print / PDF**.

Output is strictly black line-work on white: no colour and no grey fills. Windows and doors use drafting conventions (dashed swing lines meeting at the hinge side, arrows for sliding leaves, slats for louvres and shutters). Sheets include level markers, dimension chains, opening tags (W1, D1 …), an openings key and a title block.

### Known limits
- Roofs are derived from the building's bounding box, so L/U-shaped plans get a simplified roof.
- One plan = one set of openings; use "Appears on" to repeat openings on several floors.
- Elevations show walls, openings and roof only (no chimneys, steps, balconies or cladding patterns).


## Measurement (SMM7)

Plan data (or an AI-read drawing) -> take-off -> priced bill -> summary. Tabs: **Setup**, **Schedule**, **Drawings**, **AI drawing reader**, **Bill**, **Summary**, **Rates**.

- **Take-off** covers excavation and filling (D20), concrete, formwork and reinforcement (E10/E20/E30), blockwork and DPC (F10/F30), roof carcass and covering (G20, H31/H60), DPM (J40), doors, windows and stairs (L10/L20/L30), ceilings (K10/K13), screeds, render, tiling and paint (M10/M20/M40/M60), skirtings and fascia (P20), rainwater (R10) and provisional sums for services and external works.
- Quantities are **net** (no waste or laps). Every line shows its workings; click a description. Quantities and rates can be overridden per line (kept when the plan changes), items can be omitted, and your own items can be added.
- **Walls, openings and columns** come from the Drafting Studio (mm coordinates). Outer walls are detected from the plan; tick *Ext.* on the Schedule tab for any it missed (L/U shaped plans). Footprint area uses the wall loop when it closes, otherwise the bounding box.
- **Rates are placeholders.** Replace them on the Rates tab (or scale them all at once) before using any total. Preliminaries, overheads, contingency and tax are percentages on the Summary tab.
- **Items marked approx** (reinforcement per m3, roof carcass, skirting, anti-termite, stairs) rest on stated assumptions. Replace them with measured quantities from the structural and detail drawings.
- Section codes are SMM7 work sections. Check descriptions and measurement rules against the SMM7 classification tables before issuing tender documents. This tool is a take-off aid; a quantity surveyor should review the output.
- Export: CSV, print/PDF, and a JSON estimate file (Save / Open). The estimate also autosaves in the browser.

### AI drawing reader (Groq)

Enter a Groq API key on the AI tab (stored in this browser only if you tick *Remember*). Choose a stored drawing or upload an image/PDF (up to 4 pages at a time) and press **Read drawing**. A vision model **reads** printed dimensions, door and window schedules, room labels and notes. It does not measure by scale. The result is sanity-checked, shown for review, and enters the schedule only when you apply it. Use **Check key and list models** to pick a vision-capable model your account offers (default: Llama 4 Scout).
The key is used directly from the browser, so treat it as exposed to anyone who can open dev tools on your machine. For a shared deployment, route the call through your own backend.

## Drawing storage (Supabase)

Every drawing is stored under a designated id (`<set code>-FLOOR-PLAN`, `-FOUNDATION-PLAN`, `-ELEVATIONS`, `-SOURCE-PLAN`, `-UPLOAD-01` ...) together with the data from the page that produced it (plan elements and settings, elevation model, assumptions, wall and opening references). Saving again updates the same drawing and bumps its version.

- The **Drafting Studio** saves its foundation plan sheet, an SVG floor plan and the plan underlay when you press *Foundation plan*.
- The **Elevation Studio** saves its elevation sheet, model and plan underlay shortly after each change.
- The **Measurement** module generates the floor plan, foundation plan and elevations it needs in the background (toggle on the Drawings tab) and lists everything for viewing and download (SVG/PNG/PDF, plus the stored data as JSON).

Setup: create a Supabase project, run `supabase/schema.sql` in the SQL editor, enable **Authentication -> Sign in -> Allow anonymous sign-ins**, then copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the public anon key only; never put a service-role key in the app). Row-level security keeps each sign-in's drawings private. Without these, drawings are kept in this browser (IndexedDB) and the Drawings tab says so; *Copy local to Supabase* uploads them later.

## Checks

```bash
npx tsx scripts/boq-selftest.ts        # take-off against hand calculations, AI parsing/merge
npx tsx scripts/drawings-selftest.ts   # generated drawings
npm i --no-save fake-indexeddb && npx tsx scripts/store-selftest.ts   # local drawing store
```

## Drafting studio

Model space is **real millimetres**, so quantities, 3D and drawings downstream are always true to scale.

- **Blank sheet** or **trace over a drawing** (PNG, JPG or a PDF page). A traced drawing is an underlay with its own scale.
- **Setting the scale:** pick two points on a known dimension, or give the printed scale (1:N) for a PDF page (exact, from its page size) or an image on a named paper size / known dpi. Use **Measure** to verify. **Straighten** levels a skewed scan.
- **Drawing:** walls with real thickness and clean joints, room outlines (four joined walls), doors and windows that cut through the wall they sit on, structural grid lines. Typed entry: `4500`, `4500<90`, `3000,2000` (mm, or add `m`).
- **Precision:** endpoint, midpoint, intersection and on-wall snaps, polar and alignment tracking, ortho, adaptive grid, rulers and a scale bar.
- **Editing:** box select, move (joined walls stretch, doors travel with their wall), drag grips, edit lengths and coordinates numerically, undo / redo.
- **Reliability:** autosave to IndexedDB, plan files (`.json`, Ctrl+S), resume last session.
- **Foundation plan sheet** is drawn at a standard scale (1:50, 1:100...) with scale bar, dimensions and title block.

Shortcuts: V select, H pan, W wall, R room outline, D door, N window, G grid line, M measure, S set scale, A straighten, F fit, F3 snap, F8 ortho, F9 grid, F10 tracking, Ctrl+Z / Ctrl+Y undo / redo.

**2D + 3D split view:** the 3D model sits beside the plan and rebuilds as you draw. Selecting in either view selects in the other; roof type and pitch change in place. Hip roofs follow the plan outline (any simple closed shape, with hips, ridges and valleys from the equal-pitch 45-degree bisector rule).

Tests: `npm run test:drafting`, `npm run test:sim`.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

Set `GEMINI_API_KEY` in `.env.local` if you use the Gemini features.
