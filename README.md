# ArchPro (AutoFoundation AI / ConstructOS)

A browser-based construction toolkit built with React, Vite and TypeScript.

| Module | What it does |
| --- | --- |
| **Drawings & Simulation** | Trace a plan, draw grids/walls and generate a foundation plan sheet. |
| **Elevation Studio** *(new)* | Upload a plan (image or PDF) and generate **front, rear, left and right elevations** as black-and-white line drawings. |
| **Calculation & Measurement** | SMM7 workbook: foundation take-off from drafting, dimension-sheet take-off, editable priced bill of quantities, and optional Gemini assistance. |
| **Method Study** | Construction programme with critical path (Gantt) and a site risk register, both exportable to CSV. |
| **Building Physics** | U-value and heat loss, one-way slab / beam load take-down, and an editable embodied-carbon estimate. |

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

## SMM7 workbook

1. **Generate** – from a trench length (typed, or taken from the Drafting studio) produce excavation, earthwork support, compaction and foundation concrete, plus optional blockwork to DPC, DPC, filling and disposal.
2. **Take-off sheets** – dimension sheets (Nr × L × B × H, with deductions). Push a sheet's total into the BoQ; pushing again updates the same line.
3. **Bill of quantities** – edit refs, descriptions, quantities, units and rates; lines group by SMM7 work section; preliminaries, contingency and OH&P roll up to a total. Export CSV.
4. **AI assistant (Gemini)** – draft items from a plain-English description, review the BoQ for errors and omissions, suggest indicative rates, and tidy wording. AI output is only ever a proposal: you tick what to add. AI-added lines are tagged `ai`.

Your workbook is saved in the browser (`localStorage`). AI actions send BoQ text and quantities to the Gemini API. Item references follow this tool's convention; check them against your copy of SMM7, and treat AI rates as rough budget figures.

The Gemini key comes from `GEMINI_API_KEY` in `.env.local`, or can be pasted into the AI panel for one session. Note that Vite inlines `GEMINI_API_KEY` into the built JavaScript, so do not deploy a public build with a key in `.env.local`; use the in-panel key or put the API behind a server.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

Set `GEMINI_API_KEY` in `.env.local` if you use the Gemini features.
