# ArchPro (AutoFoundation AI / ConstructOS)

A browser-based construction toolkit built with React, Vite and TypeScript.

| Module | What it does |
| --- | --- |
| **Drawings & Simulation** | Trace a plan, draw grids/walls and generate a foundation plan sheet. |
| **Elevation Studio** *(new)* | Upload a plan (image or PDF) and generate **front, rear, left and right elevations** as black-and-white line drawings. |
| **Calculation & Measurement** | SMM7 bill-of-quantities take-off. |
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

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

Set `GEMINI_API_KEY` in `.env.local` if you use the Gemini features.
