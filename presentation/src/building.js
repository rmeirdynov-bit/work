import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { G, FLOORS, roomStatus } from "./data.js";

const STAGE_W = 1920, STAGE_H = 1080;
const S = 1 / 50;                       // пиксели плана → единицы сцены
const CX = (G.x0 + G.x1) / 2, CZ = (G.yTop + G.yBot) / 2;
const px = x => (x - CX) * S, pz = y => (y - CZ) * S;
const ROOM_H = 1.05, SLAB = 0.18;

export const COLORS = {
  glass: new THREE.Color("#9d8d8f"),
  free:  new THREE.Color("#22c57e"),
  soon:  new THREE.Color("#f2a33a"),
  busy:  new THREE.Color("#746769"),
  mine:  new THREE.Color("#ff2a3d"),
  srv:   new THREE.Color("#2c2425"),
};

/* Камера и раскладка для каждой сцены.
   pos/target — в координатах сцены, offset — сдвиг кадра вправо (доля ширины), gap — шаг этажей. */
const SHOTS = {
  building: { pos:[48, 28, 54],  target:[0, 4.5, 0],  offset:-0.25, gap:1.45, spin:0.10, focus:null },
  explode:  { pos:[46, 34, 52],  target:[0, 8.5, 0],  offset:-0.21, gap:2.9,  spin:0.07, focus:null },
  floor:    { pos:[0, 57, 33],   target:[0, 0, 1.4],  offset:-0.2,  gap:2.9,  spin:0,    focus:2 },
  book:     { pos:[4, 50, 30],   target:[1.5, 0, 1.2], offset:-0.2,  gap:2.9,  spin:0,    focus:2 },
  filter:   { pos:[0, 57, 33],   target:[0, 0, 1.4],  offset:-0.2,  gap:2.9,  spin:0,    focus:2 },
  final:    { pos:[-44, 24, 48], target:[0, 4.5, 0],  offset:0.2,   gap:1.45, spin:0.12, focus:null },
};

export class Building {
  constructor(canvas){
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:"high-performance" });
    this.renderer.setClearColor(0x0c0809, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0c0809, 60, 130);
    this.camera = new THREE.PerspectiveCamera(34, STAGE_W / STAGE_H, 0.1, 400);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(STAGE_W, STAGE_H), 0.42, 0.45, 0.42);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.scene.add(new THREE.HemisphereLight(0xfff1ee, 0x1a0e10, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(20, 40, 25); this.scene.add(key);
    const rim = new THREE.PointLight(0xff2a3d, 260, 80); rim.position.set(-22, 6, -18); this.scene.add(rim);

    this.root = new THREE.Group(); this.scene.add(this.root);
    this.build();

    // текущее и целевое состояние камеры/раскладки
    this.state = { pos:new THREE.Vector3(60, 40, 70), target:new THREE.Vector3(0, 5, 0), offset:-0.2, gap:1.45 };
    this.shot = "building"; this.spinAngle = 0.6; this.spinSpeed = SHOTS.building.spin;
    this.clock = new THREE.Clock();
    this.active = false; this.pulse = null;
  }

  build(){
    const grid = new THREE.GridHelper(120, 60, 0x4a1f25, 0x24171a);
    grid.position.y = -0.6; grid.material.transparent = true; grid.material.opacity = 0.55;
    this.root.add(grid);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(30, 64),
      new THREE.MeshBasicMaterial({ color:0x2a0d12, transparent:true, opacity:0.55 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = -0.58; this.root.add(disc);

    const wN = (G.corr[0] - G.yTop) * S, wS = (G.yBot - G.corr[1]) * S;
    const edgeMat = new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0.22 });
    this.floors = [];
    this.rooms = [];

    FLOORS.forEach((f, fi) => {
      const grp = new THREE.Group(); grp.userData.n = f.n; this.root.add(grp);
      const mats = [];

      const slabMat = new THREE.MeshStandardMaterial({ color:0x1c1517, roughness:0.6, metalness:0.2, transparent:true });
      const slab = new THREE.Mesh(new THREE.BoxGeometry((G.x1 - G.x0) * S + 0.5, SLAB, (G.yBot - G.yTop) * S + 0.5), slabMat);
      slab.position.y = -SLAB / 2; grp.add(slab); mats.push(slabMat);
      const slabEdge = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry),
        new THREE.LineBasicMaterial({ color:0xff2a3d, transparent:true, opacity:0.45 }));
      slabEdge.position.copy(slab.position); grp.add(slabEdge); mats.push(slabEdge.material);

      // ядро: санузлы, лифты, шахта, лестницы
      const coreMat = new THREE.MeshStandardMaterial({ color:0x3b3234, roughness:0.8, transparent:true });
      mats.push(coreMat);
      const addCore = (x0, x1, y0, y1) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry((x1 - x0) * S - 0.1, ROOM_H * 0.9, (y1 - y0) * S - 0.1), coreMat);
        m.position.set(px((x0 + x1) / 2), ROOM_H * 0.45, pz((y0 + y1) / 2)); grp.add(m);
      };
      [G.wcW, G.wcM, G.lift, G.shaft].forEach(c => addCore(c[0], c[1], G.yTop, G.corr[0]));
      [G.stairA, G.stairB].forEach(c => addCore(c[0], c[1], G.corr[1], G.yBot));

      f.list.forEach(r => {
        const d = r.side === "n" ? wN : wS;
        const geo = new THREE.BoxGeometry(r.w * S - 0.14, ROOM_H, d - 0.14);
        const mat = new THREE.MeshStandardMaterial({
          color: COLORS.glass.clone(), emissive: COLORS.glass.clone(), emissiveIntensity: 0.08,
          roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.9
        });
        const mesh = new THREE.Mesh(geo, mat);
        const zc = r.side === "n" ? pz(G.yTop) + d / 2 : pz(G.corr[1]) + d / 2;
        mesh.position.set(px(r.x + r.w / 2), ROOM_H / 2, zc);
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat.clone());
        mesh.add(edge);
        grp.add(mesh);
        const room = { r, mesh, mat, edge, color: COLORS.glass.clone(), target: COLORS.glass.clone(),
          glow: 0.08, glowTarget: 0.08, op: 0.9, opTarget: 0.9, lift: 0, liftTarget: 0, label: null };
        if (f.n === 2 && !r.srv) room.label = this.makeLabel(r.id, mesh, d);
        this.rooms.push(room);
      });

      this.floors.push({ grp, n: f.n, index: fi, mats, fade: 1, fadeTarget: 1 });
    });
  }

  makeLabel(text, mesh, depth){
    const c = document.createElement("canvas"); c.width = 256; c.height = 128;
    const g = c.getContext("2d");
    g.font = "700 84px Unbounded, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    const draw = () => { g.clearRect(0, 0, 256, 128); g.font = "700 84px Unbounded, sans-serif";
      g.lineWidth = 14; g.strokeStyle = "rgba(12,8,9,.85)"; g.lineJoin = "round"; g.strokeText(text, 128, 68);
      g.fillStyle = "#ffffff"; g.fillText(text, 128, 68); };
    draw();
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0, toneMapped: false }));
    sp.rotation.x = -Math.PI / 2; sp.position.y = ROOM_H / 2 + 0.02;
    sp.renderOrder = 2;
    mesh.add(sp);
    // шрифт может подгрузиться позже — перерисуем
    document.fonts && document.fonts.ready.then(() => {
      draw(); tex.needsUpdate = true;
    });
    return sp;
  }

  resize(scale){
    const dpr = Math.min(2, (window.devicePixelRatio || 1) * scale);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(STAGE_W, STAGE_H, true);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(STAGE_W, STAGE_H);
  }

  /* ---------- управление сценой ---------- */
  setShot(name){
    this.shot = name;
    const s = SHOTS[name];
    this.spinSpeed = s.spin;
    this.floors.forEach(f => { f.fadeTarget = s.focus && f.n !== s.focus ? 0 : 1; });
    this.rooms.forEach(o => { o.liftTarget = 0; if (o.label) o.labelTarget = s.focus ? 1 : 0; });
  }

  paint(fn){
    this.rooms.forEach(o => {
      const [key, glow, op] = fn(o.r);
      o.target.copy(COLORS[key]);
      o.glowTarget = glow;
      o.opTarget = op;
    });
  }
  paintGlass(){ this.paint(r => [r.srv ? "srv" : "glass", r.srv ? 0 : 0.04, 0.95]); }
  paintStatus(slot, dimFn){
    this.paint(r => {
      const st = roomStatus(r, slot);
      const glow = st === "free" ? 0.32 : st === "soon" ? 0.28 : st === "mine" ? 0.45 : 0.02;
      const dim = dimFn && !r.srv && !dimFn(r);
      return [st, dim ? 0 : glow, dim ? 0.07 : 1];
    });
  }
  setRoom(id, key, glow = 0.5){
    const o = this.rooms.find(o => o.r.id === id); if (!o) return;
    o.target.copy(COLORS[key]); o.glowTarget = glow; o.opTarget = 1;
  }
  liftRoom(id, v){ const o = this.rooms.find(o => o.r.id === id); if (o) o.liftTarget = v; }

  start(){ if (!this.active){ this.active = true; this.clock.getDelta(); this.loop(); } }
  stop(){ this.active = false; }

  loop(){
    if (!this.active) return;
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    const k = 1 - Math.pow(0.0025, dt);          // плавное приближение к цели
    const s = SHOTS[this.shot];

    this.state.pos.lerp(new THREE.Vector3(...s.pos), k * 0.9);
    this.state.target.lerp(new THREE.Vector3(...s.target), k * 0.9);
    this.state.offset += (s.offset - this.state.offset) * k;
    this.state.gap += (s.gap - this.state.gap) * k;

    this.spinAngle += this.spinSpeed * dt;
    const want = s.spin ? this.spinAngle : Math.round(this.spinAngle / (Math.PI * 2)) * Math.PI * 2;
    if (!s.spin) this.spinAngle += (want - this.spinAngle) * k;
    this.root.rotation.y = this.spinAngle;

    // фокус-этаж опускаем к нулю, чтобы камера смотрела на него
    const focusIdx = s.focus ? s.focus - 1 : null;
    this.floors.forEach(f => {
      const y = (f.index - (focusIdx ?? 0)) * this.state.gap;
      f.grp.position.y += (y - f.grp.position.y) * k;
      f.fade += (f.fadeTarget - f.fade) * k;
      f.grp.visible = f.fade > 0.01;
      f.mats.forEach(m => { m.opacity = (m.userData.base ??= m.opacity) * f.fade; });
    });
    this.rooms.forEach(o => {
      const fl = this.floors[o.r.floor - 1];
      o.color.lerp(o.target, k);
      o.mat.color.copy(o.color); o.mat.emissive.copy(o.color);
      o.glow += (o.glowTarget - o.glow) * k;
      o.mat.emissiveIntensity = o.glow * fl.fade;
      o.op += (o.opTarget - o.op) * k;
      o.mat.opacity = o.op * fl.fade;
      o.edge.material.opacity = 0.22 * fl.fade * (o.op > 0.3 ? 1 : 0.4);
      o.lift += (o.liftTarget - o.lift) * k;
      o.mesh.position.y = ROOM_H / 2 + o.lift;
      if (o.label){
        const t = (o.labelTarget || 0) * fl.fade * (o.op > 0.3 ? 1 : 0.25);
        o.label.material.opacity += (t - o.label.material.opacity) * k;
      }
    });

    this.camera.position.copy(this.state.pos);
    this.camera.lookAt(this.state.target);
    this.camera.setViewOffset(STAGE_W, STAGE_H, this.state.offset * STAGE_W, 0, STAGE_W, STAGE_H);
    this.composer.render();
  }
}
