// components/sim/SimView.tsx — the PlayCanvas viewport for the 3D model.
// One owner for the Application: it is created on mount, parts are (re)built when the model changes, and
// everything (events, entities, resize observer) is torn down on unmount.

import React, { useEffect, useRef, useState } from 'react';
import {
  Application, BLEND_NORMAL, Color, Entity, FILLMODE_NONE, GraphicsDevice, Mesh, MeshInstance, RENDERSTYLE_SOLID, RENDERSTYLE_WIREFRAME,
  SHADOW_PCF3_32F, StandardMaterial, TONEMAP_NEUTRAL, Vec2, Vec3,
} from 'playcanvas';
import { CameraControls } from 'playcanvas/scripts/esm/camera-controls.mjs';
import { MatKey, SimModel, SimPart } from '../../utils/sim/types';
import { raycast } from '../../utils/sim/raycast';

export interface SimViewProps {
  model: SimModel;
  colors: Record<MatKey, string>;
  wireframe: boolean;
  shadows: boolean;
  grid: boolean;
  showRoof: boolean;
  hiddenLevels: number[];
  sunAz: number;
  sunEl: number;
  ambient: number;
  fly: boolean;
  selectedPartId: string | null;
  selectedSourceId: string | null;
  frameKey: number;
  onPick: (part: SimPart | null) => void;
  /** test seam: supply a ready-made graphics device (e.g. the engine's null device) instead of WebGL */
  graphicsDevice?: GraphicsDevice;
}

interface Node { entity: Entity; mesh: Mesh; mi: MeshInstance; part: SimPart }

const isSelected = (p: SimPart, id: string | null, src: string | null) => (id !== null && p.id === id) || (src !== null && p.sourceId === src);

export const SimView: React.FC<SimViewProps> = props => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<Application | null>(null);
  const camRef = useRef<Entity | null>(null);
  const sunRef = useRef<Entity | null>(null);
  const ctrlRef = useRef<CameraControls | null>(null);
  const nodes = useRef<Node[]>([]);
  const mats = useRef<{ base: Map<MatKey, StandardMaterial>; sel: Map<MatKey, StandardMaterial> }>({ base: new Map(), sel: new Map() });
  const latest = useRef(props); latest.current = props;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------- app lifecycle
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let app: Application;
    try {
      app = new Application(canvas, latest.current.graphicsDevice ? { graphicsDevice: latest.current.graphicsDevice } : { graphicsDeviceOptions: { antialias: true, alpha: false } });
    } catch (e: any) {
      setError('This browser could not start WebGL, so the 3D view is unavailable.');
      return;
    }
    appRef.current = app;
    app.setCanvasFillMode(FILLMODE_NONE);
    app.graphicsDevice.maxPixelRatio = 3;
    app.scene.ambientLight = new Color(0.4, 0.41, 0.45);

    const camera = new Entity('Camera');
    camera.addComponent('camera', { clearColor: new Color(0.075, 0.085, 0.1), fov: 45, nearClip: 0.1, farClip: 1500, toneMapping: TONEMAP_NEUTRAL });
    app.root.addChild(camera);
    camera.addComponent('script');
    const controls = camera.script!.create(CameraControls, {
      properties: { enableOrbit: true, enableFly: false, enablePan: true, moveSpeed: 6, moveFastSpeed: 14, moveSlowSpeed: 2, focusDamping: 0.98 },
    }) as unknown as CameraControls;
    controls.pitchRange = new Vec2(-89, 89);
    controls.zoomRange = new Vec2(0.5, 400);
    camRef.current = camera; ctrlRef.current = controls;

    const sun = new Entity('Sun');
    sun.addComponent('light', {
      type: 'directional', color: new Color(1, 0.96, 0.9), intensity: 1.15, castShadows: true,
      shadowType: SHADOW_PCF3_32F, shadowResolution: 4096, shadowDistance: 80, normalOffsetBias: 0.04, shadowBias: 0.15,
    });
    app.root.addChild(sun);
    sunRef.current = sun;

    // Render at 2x (or the screen's own ratio if higher, up to 3x) and let the browser scale down: supersampling removes the
    // soft, jagged look on standard-density screens, where PlayCanvas would otherwise render 1 pixel per CSS pixel.
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return;
      const w = Math.floor(r.width), h = Math.floor(r.height);
      app.resizeCanvas(w, h);
      const ratio = Math.min(3, Math.max(window.devicePixelRatio || 1, 2));
      const W = Math.floor(w * ratio), H = Math.floor(h * ratio), dev = app.graphicsDevice;
      if (dev.canvas.width !== W || dev.canvas.height !== H) dev.setResolution(W, H);
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    };
    const ro = new ResizeObserver(resize); ro.observe(wrap); resize();

    // simple 1 m ground grid drawn every frame
    const onUpdate = () => {
      const p = latest.current;
      if (!p.grid) return;
      const c = p.model.center, ext = Math.max(p.model.max[0] - p.model.min[0], p.model.max[2] - p.model.min[2], 6);
      const n = Math.min(40, Math.ceil(ext * 0.9)), cx = Math.round(c[0]), cz = Math.round(c[2]);
      const col = new Color(0.32, 0.35, 0.4), axis = new Color(0.55, 0.3, 0.3);
      for (let i = -n; i <= n; i++) {
        const a = new Vec3(cx + i, 0.002, cz - n), b = new Vec3(cx + i, 0.002, cz + n);
        const d = new Vec3(cx - n, 0.002, cz + i), e = new Vec3(cx + n, 0.002, cz + i);
        app.drawLine(a, b, cx + i === 0 ? axis : col); app.drawLine(d, e, cz + i === 0 ? axis : col);
      }
    };
    app.on('update', onUpdate);

    // click (not drag) picks a part
    let down: { x: number; y: number; t: number } | null = null;
    const onDown = (e: PointerEvent) => { if (e.button === 0) down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
    const onUp = (e: PointerEvent) => {
      if (!down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
      down = null;
      if (moved > 5 || dt > 500) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const cam = camera.camera!;
      const near = cam.screenToWorld(x, y, cam.nearClip), far = cam.screenToWorld(x, y, cam.farClip);
      const d = far.clone().sub(near).normalize();
      const p = latest.current;
      const vis = new Set(nodes.current.filter(n => n.entity.enabled).map(n => n.part.id));
      const hit = raycast(p.model.parts, [near.x, near.y, near.z], [d.x, d.y, d.z], part => part.kind === 'ground' || !vis.has(part.id));
      p.onPick(hit ? p.model.parts.find(q => q.id === hit.partId) ?? null : null);
    };
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointerup', onUp);

    app.start();
    setReady(true);

    return () => {
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp);
      ro.disconnect(); app.off('update', onUpdate);
      nodes.current.forEach(n => n.mesh.destroy()); nodes.current = [];
      mats.current.base.forEach(m => m.destroy()); mats.current.sel.forEach(m => m.destroy());
      mats.current = { base: new Map(), sel: new Map() };
      app.destroy();
      appRef.current = null; camRef.current = null; sunRef.current = null; ctrlRef.current = null;
      setReady(false);
    };
  }, []);

  // ---------------------------------------------------------------- materials
  const materialFor = (key: MatKey, selected: boolean): StandardMaterial => {
    const store = selected ? mats.current.sel : mats.current.base;
    let m = store.get(key);
    if (!m) {
      m = new StandardMaterial();
      m.useMetalness = true; m.metalness = 0; m.gloss = key === 'glass' ? 0.9 : 0.2;
      if (key === 'glass') { m.blendType = BLEND_NORMAL; m.opacity = 0.35; m.depthWrite = false; }
      store.set(key, m);
    }
    const c = new Color().fromString(latest.current.colors[key]);
    m.diffuse = c;
    if (selected) { m.emissive = new Color(0.06, 0.24, 0.5); m.emissiveIntensity = 1; }
    m.update();
    return m;
  };

  // ---------------------------------------------------------------- rebuild parts when the model changes
  useEffect(() => {
    const app = appRef.current; if (!ready || !app) return;
    nodes.current.forEach(n => { n.entity.destroy(); n.mesh.destroy(); });
    nodes.current = [];
    const { model } = props;
    for (const part of model.parts) {
      const mesh = new Mesh(app.graphicsDevice);
      mesh.setPositions(part.positions); mesh.setNormals(part.normals); mesh.setIndices(part.indices); mesh.update();
      const mi = new MeshInstance(mesh, materialFor(part.material, false));
      const entity = new Entity(part.name);
      entity.addComponent('render', { meshInstances: [mi], castShadows: part.material !== 'glass' && part.kind !== 'ground', receiveShadows: part.kind !== 'glass' });
      app.root.addChild(entity);
      nodes.current.push({ entity, mesh, mi, part });
    }
    // shadow frustum sized to the model
    const ext = Math.max(model.max[0] - model.min[0], model.max[2] - model.min[2], model.max[1] - model.min[1], 6);
    if (sunRef.current?.light) sunRef.current.light.shadowDistance = ext * 3;
    refreshState();
    frame();
  }, [ready, props.model]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- state that does not need a rebuild
  const refreshState = () => {
    const p = latest.current;
    for (const n of nodes.current) {
      const part = n.part;
      const levelOk = part.level < 0 || !p.hiddenLevels.includes(part.level);
      n.entity.enabled = part.kind === 'ground' ? true : part.kind === 'roof' || (part.kind === 'slab' && part.level < 0) ? p.showRoof : levelOk;
      n.mi.renderStyle = p.wireframe && part.kind !== 'ground' ? RENDERSTYLE_WIREFRAME : RENDERSTYLE_SOLID;
      n.mi.material = materialFor(part.material, isSelected(part, p.selectedPartId, p.selectedSourceId));
    }
  };
  useEffect(() => { if (ready) refreshState(); }, [ready, props.colors, props.wireframe, props.showRoof, props.hiddenLevels, props.selectedPartId, props.selectedSourceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sun = sunRef.current, app = appRef.current; if (!ready || !sun || !app) return;
    sun.setEulerAngles(90 - props.sunEl, props.sunAz, 0);        // light shines along local -Y: see apply-conventions
    sun.light!.castShadows = props.shadows;
    const a = props.ambient; app.scene.ambientLight = new Color(a, a * 1.02, a * 1.1);
  }, [ready, props.sunAz, props.sunEl, props.shadows, props.ambient]);

  useEffect(() => {
    const c = ctrlRef.current; if (!ready || !c) return;
    c.enableFly = props.fly;
  }, [ready, props.fly]);

  // ---------------------------------------------------------------- camera framing
  const frame = () => {
    const c = ctrlRef.current; if (!c) return;
    const { model } = latest.current;
    const ext = Math.max(model.max[0] - model.min[0], model.max[1] - model.min[1], model.max[2] - model.min[2], 4);
    const focus = new Vec3(model.center[0], model.center[1], model.center[2]);
    const pos = new Vec3(model.center[0] + ext * 1.05, model.center[1] + ext * 0.85, model.center[2] + ext * 1.25);
    c.reset(focus, pos);
  };
  useEffect(() => { if (ready) frame(); }, [props.frameKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden" style={{ background: '#131519' }}>
      <canvas ref={canvasRef} style={{ display: 'block', touchAction: 'none', outline: 'none' }} />
      {error && <div className="absolute inset-0 grid place-items-center text-sm" style={{ color: '#c9cfd6' }}>{error}</div>}
    </div>
  );
};
