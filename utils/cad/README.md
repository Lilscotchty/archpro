# utils/cad — WORK IN PROGRESS (not wired into the app)

A from-scratch solid-modelling kernel for a CAD-grade 3D page: walls with true boolean-cut openings, mitred/trimmed
joins, room slabs, gable/hip/mono-pitch roof shells, windows/doors fittings, columns, stairs and free extrusions.

- `npx tsx tests/cad-kernel.test.ts` — volume / winding / roof checks (all pass).
- Known issue: in the gable roof preview the wall tops show through the roof near the eaves/partition. Investigate
  the roof shell vs wall-top overlap before wiring the viewport.
- Still to do: three.js viewport (visual styles, view cube, selection), properties/layers UI, DXF + GLB export.
