// 3D-сцены урока: город Антальи (hero), перекрёсток (направления), монета $30.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const glOK = (() => {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch (e) { return false; }
})();

const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .82, metalness: 0, ...o });
const gold = () => new THREE.MeshStandardMaterial({ color: 0xf0bf4a, metalness: .9, roughness: .26 });
const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const shadow = m => { m.castShadow = m.receiveShadow = true; return m; };

/* ---------- stage: renderer + camera orbit + visibility-gated loop ---------- */
function Stage(el, o = {}) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = o.exposure || 1;
  if (o.shadows !== false) { r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; }
  el.prepend(r.domElement);

  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture;
  scene.environmentIntensity = o.envI ?? .5;
  scene.add(new THREE.HemisphereLight(0xf2f5ff, 0xf3e7d2, o.hemi ?? 1.05));
  if (o.shadows !== false) {
    const sun = new THREE.DirectionalLight(0xfff4e2, o.sunI ?? 1.9);
    sun.position.set(7, 14, 6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    const e = o.shadowExt || 10, sc = sun.shadow.camera;
    sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.near = 1; sc.far = 45;
    sun.shadow.bias = -.0006; sun.shadow.normalBias = .02; sun.shadow.radius = 5;
    scene.add(sun);
  }
  const cam = new THREE.PerspectiveCamera(o.fov || 30, 1, .1, 300);
  const st = { az: o.az ?? .6, baseAz: o.az ?? .6, el: o.el ?? .9, dist: o.dist || 22, t: new THREE.Vector3(...(o.target || [0, 0, 0])), vaz: 0, drag: false, user: -1e9 };
  let fit = 1;
  const upd = [];
  let vis = false, last = performance.now();

  function size() {
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
    r.setSize(w, h, false); r.domElement.style.width = '100%'; r.domElement.style.height = '100%';
    cam.aspect = w / h; cam.updateProjectionMatrix();
    fit = cam.aspect < 1.05 ? 1.05 / Math.max(.72, cam.aspect) : 1;
  }
  new ResizeObserver(size).observe(el); size();

  if (o.drag !== false) {
    let px = 0, py = 0;
    el.style.touchAction = 'pan-y';
    el.addEventListener('pointerdown', e => { st.drag = true; px = e.clientX; py = e.clientY; el.setPointerCapture(e.pointerId); el.classList.add('grab'); });
    el.addEventListener('pointermove', e => {
      if (!st.drag) return;
      const dx = e.clientX - px, dy = e.clientY - py; px = e.clientX; py = e.clientY;
      st.vaz = -dx * .007; st.az += st.vaz; st.el = Math.min(1.35, Math.max(.42, st.el + dy * .004)); st.user = performance.now();
    });
    const up = () => { st.drag = false; el.classList.remove('grab'); st.user = performance.now(); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  // лёгкий параллакс от курсора
  let mx = 0, my = 0;
  if (matchMedia('(hover:hover)').matches) el.addEventListener('pointermove', e => { const b = el.getBoundingClientRect(); mx = (e.clientX - b.left) / b.width - .5; my = (e.clientY - b.top) / b.height - .5; });

  function place() {
    const d = st.dist * fit, c = Math.cos(st.el), az = st.az + mx * .12, elv = st.el - my * .06;
    cam.position.set(st.t.x + d * Math.cos(elv) * Math.sin(az), st.t.y + d * Math.sin(elv), st.t.z + d * Math.cos(elv) * Math.cos(az));
    cam.lookAt(st.t);
  }
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!vis) return;
    if (!st.drag) {
      st.vaz *= .93; st.az += st.vaz;
      if (!RM && now - st.user > 2500) {
        if (o.auto) st.az += o.auto * dt;
        if (o.sway) { const tg = st.baseAz + Math.sin(now / 1000 * .3) * o.sway; st.az += (tg - st.az) * .015; }
      }
    }
    upd.forEach(f => f(dt, now / 1000));
    place(); r.render(scene, cam);
  }
  new IntersectionObserver(e => { vis = e[0].isIntersecting; last = performance.now(); }, { rootMargin: '120px' }).observe(el);
  requestAnimationFrame(loop);
  return { r, scene, cam, st, upd };
}

/* ---------- canvas label sprite ---------- */
function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function label(text, { bg = 'rgba(255,255,255,.97)', fg = '#373c45', px = 44, sc = .0078 } = {}) {
  const c = document.createElement('canvas'), x = c.getContext('2d');
  const f = `600 ${px}px Montserrat, system-ui, sans-serif`; x.font = f;
  const w = Math.ceil(x.measureText(text).width + px * 1.3), h = Math.ceil(px * 1.9), pad = 16;
  c.width = w + pad * 2; c.height = h + pad * 2 + Math.ceil(px * .45);
  x.shadowColor = 'rgba(38,56,110,.28)'; x.shadowBlur = 14; x.shadowOffsetY = 4; x.fillStyle = bg;
  rr(x, pad, pad, w, h, h / 2); x.fill();
  x.beginPath(); x.moveTo(pad + w / 2 - px * .3, pad + h - 2); x.lineTo(pad + w / 2, pad + h + px * .42); x.lineTo(pad + w / 2 + px * .3, pad + h - 2); x.fill();
  x.shadowColor = 'transparent'; x.fillStyle = fg; x.font = f; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, pad + w / 2, pad + h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
  s.scale.set(c.width * sc, c.height * sc, 1); s.center.set(.5, .12); s.renderOrder = 20;
  return s;
}

/* ---------- building blocks ---------- */
function bld(g, x, z, w, d, h, color, { roof = true, win = true } = {}) {
  const m = shadow(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, .06), mat(color)));
  m.position.set(x, h / 2, z); g.add(m);
  if (roof) { const rf = shadow(new THREE.Mesh(new RoundedBoxGeometry(w * .5, .16, d * .5, 2, .04), mat(0xffffff))); rf.position.set(x, h + .08, z); g.add(rf); }
  if (win && h > .9) {
    const wm = mat(0xc6d4ee, { roughness: .15, metalness: .3 });
    for (let y = .5; y < h - .25; y += .55) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(w * .7, .15, .02), wm); a.position.set(x, y, z + d / 2 + .006); g.add(a);
      const b = new THREE.Mesh(new THREE.BoxGeometry(.02, .15, d * .7), wm); b.position.set(x + w / 2 + .006, y, z); g.add(b);
      const c = a.clone(); c.position.z = z - d / 2 - .006; g.add(c);
      const e = b.clone(); e.position.x = x - w / 2 - .006; g.add(e);
    }
  }
  return m;
}
function house(g, x, z, s, h) {
  const b = shadow(new THREE.Mesh(new RoundedBoxGeometry(s, h, s, 2, .04), mat(0xfbf1df))); b.position.set(x, h / 2, z); g.add(b);
  const rf = shadow(new THREE.Mesh(new THREE.ConeGeometry(s * .78, s * .5, 4), mat(0xe39a72))); rf.rotation.y = Math.PI / 4; rf.position.set(x, h + s * .25, z); g.add(rf);
  const dr = new THREE.Mesh(new THREE.BoxGeometry(s * .22, h * .45, .02), mat(0x9a6b4a)); dr.position.set(x, h * .23, z + s / 2 + .01); g.add(dr);
}
function tree(g, x, z, s = 1) {
  const t = shadow(new THREE.Mesh(new THREE.CylinderGeometry(.05 * s, .07 * s, .5 * s, 8), mat(0xb7936d))); t.position.set(x, .25 * s, z); g.add(t);
  const c = shadow(new THREE.Mesh(new THREE.IcosahedronGeometry(.34 * s, 1), mat(0xa9dab2, { flatShading: true }))); c.position.set(x, .7 * s, z); g.add(c);
  return c;
}
function palm(g, x, z, R) {
  const h = 1.3 + R() * .5, grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.z = (R() - .5) * .25;
  const t = shadow(new THREE.Mesh(new THREE.CylinderGeometry(.05, .08, h, 8), mat(0xc6a27a))); t.position.y = h / 2; grp.add(t);
  const lm = mat(0x8ccf98, { side: THREE.DoubleSide, flatShading: true });
  for (let i = 0; i < 6; i++) {
    const lg = new THREE.Group(); lg.position.y = h; lg.rotation.y = i * Math.PI / 3 + R() * .3;
    const l = shadow(new THREE.Mesh(new THREE.ConeGeometry(.11, .85, 4), lm));
    l.rotation.z = -Math.PI / 2 - .45; l.position.set(.38, -.13, 0); lg.add(l); grp.add(lg);
  }
  g.add(grp); return grp;
}
function makePin() {
  const g = new THREE.Group(), gm = gold();
  const head = shadow(new THREE.Mesh(new THREE.SphereGeometry(.42, 32, 24), gm)); head.position.y = 1.35;
  const cone = shadow(new THREE.Mesh(new THREE.ConeGeometry(.35, .95, 32), gm)); cone.rotation.x = Math.PI; cone.position.y = .5;
  const wm = mat(0xffffff);
  const d1 = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .86, 24), wm); d1.rotation.x = Math.PI / 2; d1.position.y = 1.35;
  const ring = new THREE.Mesh(new THREE.RingGeometry(.28, .42, 40), new THREE.MeshBasicMaterial({ color: 0xf2c24c, transparent: true, opacity: .6, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .03;
  g.add(head, cone, d1, ring); g.userData.ring = ring;
  return g;
}
function makeWalker() {
  const g = new THREE.Group();
  const body = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(.15, .3, 6, 14), mat(0x373c45, { roughness: .5 }))); body.position.y = .38;
  const head = shadow(new THREE.Mesh(new THREE.SphereGeometry(.13, 20, 16), mat(0xf0cfae))); head.position.y = .78;
  const bag = shadow(new THREE.Mesh(new RoundedBoxGeometry(.2, .22, .1, 2, .03), mat(0xf2c24c))); bag.position.set(0, .45, -.16);
  const base = new THREE.Mesh(new THREE.CircleGeometry(.3, 32), new THREE.MeshBasicMaterial({ color: 0x373c45, transparent: true, opacity: .12 }));
  base.rotation.x = -Math.PI / 2; base.position.y = .02;
  g.add(body, head, bag, base); g.userData.body = [body, head, bag];
  return g;
}
function routeMesh(pts, y = .1) {
  const path = new THREE.CurvePath();
  for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(V(pts[i][0], pts[i][1], y), V(pts[i + 1][0], pts[i + 1][1], y)));
  const seg = 160, rad = 8;
  const geo = new THREE.TubeGeometry(path, seg, .085, rad, false);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf3c552, emissive: 0xe4a52a, emissiveIntensity: .45, roughness: .35, metalness: .3 }));
  geo.setDrawRange(0, 0);
  return { m, path, set(p) { geo.setDrawRange(0, Math.floor(seg * Math.min(1, Math.max(0, p))) * rad * 6); } };
}
function trafficLight(g, x, z) {
  const dm = mat(0x373c45, { roughness: .5 });
  const pole = shadow(new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, 1.5, 10), dm)); pole.position.set(x, .75, z);
  const box = shadow(new THREE.Mesh(new RoundedBoxGeometry(.22, .6, .2, 2, .05), dm)); box.position.set(x, 1.65, z);
  g.add(pole, box);
  const cols = [0xff6b5c, 0xf7c64b, 0x5fd07b], L = cols.map((c, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(.065, 16, 12), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .15 }));
    m.position.set(x, 1.83 - i * .18, z + .11); g.add(m);
    const m2 = m.clone(); m2.material = m.material; m2.position.z = z - .11; g.add(m2);
    return m;
  });
  return t => { const k = Math.floor(t / 2.2) % 3; L.forEach((l, i) => l.material.emissiveIntensity = i === (2 - k) ? 2.2 : .12); };
}
function clouds(g, R, n, span, y0) {
  const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: .85 });
  const arr = [];
  for (let i = 0; i < n; i++) {
    const c = new THREE.Group(), k = 4 + (R() * 3 | 0);
    for (let j = 0; j < k; j++) { const s = new THREE.Mesh(new THREE.SphereGeometry(.4 + R() * .45, 16, 12), cm); s.position.set(j * .5 - k * .25, R() * .3, R() * .5 - .25); s.castShadow = true; c.add(s); }
    c.position.set(-span + i * (2 * span / n), y0 + R() * 1.2, -5 + R() * 10); c.userData.v = .25 + R() * .3; g.add(c); arr.push(c);
  }
  return dt => arr.forEach(c => { c.position.x += c.userData.v * dt; if (c.position.x > span) c.position.x = -span; });
}

/* =====================================================================
   HERO: 3D Анталья — маршрут до Kaleiçi
   ===================================================================== */
function heroCity(el) {
  const S = Stage(el, { dist: 26, el: .8, az: .55, auto: .045, fov: 30, target: [0, 0, 1], shadowExt: 10 });
  const g = new THREE.Group(); S.scene.add(g);
  const R = rng(11);

  const ground = new THREE.Mesh(new RoundedBoxGeometry(13.6, .4, 13.6, 3, .2), mat(0xf6f7fa)); ground.position.y = -.2; ground.receiveShadow = true; g.add(ground);
  const sand = new THREE.Mesh(new RoundedBoxGeometry(13.6, .34, 1.9, 3, .15), mat(0xf6e6c4)); sand.position.set(0, -.23, 7.6); sand.receiveShadow = true; g.add(sand);
  const seaG = new THREE.PlaneGeometry(26, 8, 52, 16); seaG.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaG, new THREE.MeshStandardMaterial({ color: 0xa9d2f2, roughness: .12, metalness: .15, transparent: true, opacity: .93 }));
  sea.position.set(0, -.28, 12.4); sea.receiveShadow = true; g.add(sea);
  const sp = seaG.attributes.position, base = sp.array.slice();
  let wf = 0;
  S.upd.push((dt, t) => {
    if (RM || (wf++ & 1)) return;
    for (let i = 0; i < sp.count; i++) { const x = base[i * 3], z = base[i * 3 + 2]; sp.array[i * 3 + 1] = Math.sin(x * .7 + t * 1.4) * .08 + Math.cos(z * 1.2 + t) * .06; }
    sp.needsUpdate = true; seaG.computeVertexNormals();
  });

  const rm = mat(0xe0e4eb, { roughness: .95 }), wm = mat(0xffffff);
  for (const k of [-4, 0, 4]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(13.6, .05, 1.1), rm); a.position.set(0, .025, k); a.receiveShadow = true; g.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, .052, 13.6), rm); b.position.set(k, .026, 0); b.receiveShadow = true; g.add(b);
  }
  for (let i = -2; i <= 2; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(.13, .06, .5), wm); s.position.set(i * .21, .03, .95); g.add(s);
    const s2 = s.clone(); s2.rotation.y = Math.PI / 2; s2.position.set(-.95, .03, i * .21); g.add(s2);
  }
  const tl = trafficLight(g, .72, .72);

  const cs = [-5.55, -2, 2, 5.55], cw = [1.85, 2.9, 2.9, 1.85];
  const pal = [0xffffff, 0xf1f3f8, 0xecebf8, 0xe9f2ec, 0xf6f0e6];
  cs.forEach((cx, i) => cs.forEach((cz, j) => {
    const w = cw[i], d = cw[j], key = i + ',' + j;
    if (key === '2,1') { // Kaleiçi
      [[-.75, -.85], [.3, -.95], [.95, -.2], [-.85, .25], [.15, .2], [-.2, .95], [.85, .8]].forEach(([ox, oz]) => house(g, cx + ox, cz + oz, .62 + R() * .22, .5 + R() * .35));
    } else if (key === '1,1') { // Saat Kulesi
      const tw = shadow(new THREE.Mesh(new RoundedBoxGeometry(.85, 3.3, .85, 2, .05), mat(0xeed9b2))); tw.position.set(cx + .3, 1.65, cz - .3); g.add(tw);
      const top = shadow(new THREE.Mesh(new THREE.ConeGeometry(.74, 1, 4), mat(0xd98d5d))); top.rotation.y = Math.PI / 4; top.position.set(cx + .3, 3.8, cz - .3); g.add(top);
      const gm = gold();
      [[0, .44, 0], [.44, 0, 1], [0, -.44, 0], [-.44, 0, 1]].forEach(([dx, dz, side]) => {
        const f = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .04, 32), gm);
        if (side) f.rotation.z = Math.PI / 2; else f.rotation.x = Math.PI / 2;
        f.position.set(cx + .3 + dx, 2.85, cz - .3 + dz); g.add(f);
      });
      bld(g, cx - .75, cz + .7, 1, 1.1, .7, 0xf6f0e6, { win: false });
      tree(g, cx - .8, cz - .8); tree(g, cx + .9, cz + .9, .9);
    } else if (key === '2,2') { // Cami
      const bs = shadow(new THREE.Mesh(new RoundedBoxGeometry(2, .9, 2, 2, .06), mat(0xffffff))); bs.position.set(cx, .45, cz); g.add(bs);
      const dome = shadow(new THREE.Mesh(new THREE.SphereGeometry(.78, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xe9eef8, { roughness: .4 }))); dome.position.set(cx, .9, cz); g.add(dome);
      const fin = new THREE.Mesh(new THREE.ConeGeometry(.06, .35, 12), gold()); fin.position.set(cx, 1.85, cz); g.add(fin);
      [[-1.15, -1.15], [1.15, -1.15]].forEach(([ox, oz]) => {
        const mn = shadow(new THREE.Mesh(new THREE.CylinderGeometry(.09, .11, 3, 12), mat(0xffffff))); mn.position.set(cx + ox, 1.5, cz + oz); g.add(mn);
        const bal = new THREE.Mesh(new THREE.TorusGeometry(.14, .035, 8, 20), mat(0xe9eef8)); bal.rotation.x = Math.PI / 2; bal.position.set(cx + ox, 2.35, cz + oz); g.add(bal);
        const cp = shadow(new THREE.Mesh(new THREE.ConeGeometry(.11, .45, 12), mat(0x9fb2d6))); cp.position.set(cx + ox, 3.22, cz + oz); g.add(cp);
      });
    } else if (key === '1,2') { // Eczane
      bld(g, cx, cz, 2, 1.8, 1.5, 0xffffff);
      const cr = mat(0x3fbf6a, { emissive: 0x2fa85a, emissiveIntensity: .6 });
      const a = new THREE.Mesh(new THREE.BoxGeometry(.4, .12, .04), cr), b = new THREE.Mesh(new THREE.BoxGeometry(.12, .4, .04), cr);
      a.position.set(cx, 1.15, cz + .93); b.position.copy(a.position); g.add(a, b);
      tree(g, cx + 1.1, cz + 1.1, .9);
    } else if (key === '3,0') { // Otogar
      bld(g, cx, cz, 1.5, 1.4, .7, 0xf1f3f8, { win: false });
      const bus = shadow(new THREE.Mesh(new RoundedBoxGeometry(1.1, .42, .45, 2, .08), mat(0xf2c24c))); bus.position.set(cx, .22, cz + .95); g.add(bus);
    } else if (j === 3) { // набережная: пальмы и низкие дома
      bld(g, cx, cz - .3, w * .7, d * .45, .6 + R() * .8, pal[(R() * 5) | 0], { win: false });
    } else if (w > 2 && d > 2 && R() > .3) {
      bld(g, cx - w * .22, cz - d * .2, w * .46, d * .5, .9 + R() * 2.3, pal[(R() * 5) | 0]);
      bld(g, cx + w * .22, cz + d * .18, w * .44, d * .54, .8 + R() * 1.7, pal[(R() * 5) | 0]);
      tree(g, cx - w * .25, cz + d * .3, .8);
    } else {
      bld(g, cx, cz, w * .8, d * .8, .7 + R() * 2.1, pal[(R() * 5) | 0]);
    }
  }));
  const palms = [];
  for (let x = -6; x <= 6.1; x += 1.7) palms.push(palm(g, x + (R() - .5) * .4, 7.2 + (R() - .5) * .3, R));

  // labels
  const L = (t, x, y, z) => { const s = label(t); s.position.set(x, y, z); g.add(s); return s; };
  L('Saat Kulesi', -1.7, 4.45, -2.3); L('Cami', 2, 3.6, 2); L('Eczane', -2, 1.95, 2); L('Otogar', 5.55, 1.05, -5.55);
  const kal = label('Kaleiçi', { bg: 'rgba(243,197,82,.97)', fg: '#43361c' }); kal.position.set(2, 1.6, -2.1); g.add(kal);

  // route
  const pts = [[0, 6.3], [0, 0], [-4, 0], [-4, -4], [2, -4]];
  const route = routeMesh(pts, .1); g.add(route.m);
  const walker = makeWalker(); g.add(walker);
  const pin = makePin(); pin.position.set(2, .05, -4); pin.scale.setScalar(.001); g.add(pin);
  const start = new THREE.Mesh(new THREE.RingGeometry(.2, .32, 32), new THREE.MeshBasicMaterial({ color: 0x373c45 })); start.rotation.x = -Math.PI / 2; start.position.set(0, .06, 6.3); g.add(start);

  // caption sync
  const steps = [
    [0, 'Düz gidin', 'Идите прямо'],
    [.27, 'Işıklardan sola dönün', 'На светофоре налево'],
    [.48, 'Sağa dönün', 'Поверните направо'],
    [.68, 'Tekrar sağa dönün', 'Снова направо'],
    [.97, 'Kaleiçi sağda', 'Калеичи справа. Вы дошли']
  ];
  const cap = document.getElementById('cap3d'), cTr = document.getElementById('capTr'), cRu = document.getElementById('capRu'), cN = document.getElementById('capN'), cSay = document.getElementById('capSay');
  let curStep = -1;
  function setStep(i) {
    if (i === curStep || !cap) return; curStep = i;
    cap.classList.add('sw');
    setTimeout(() => { cTr.textContent = steps[i][1]; cRu.textContent = steps[i][2]; cN.textContent = (i + 1) + '/5'; cSay.dataset.say = steps[i][1]; cap.classList.remove('sw'); }, 220);
  }

  const WALK = 9, HOLD = 3, CYCLE = WALK + HOLD + .8;
  let t0 = performance.now() / 1000, tmp = new THREE.Vector3();
  S.upd.push((dt, t) => {
    tl(t);
    let k = RM ? WALK + .5 : (t - t0) % CYCLE;
    let p = Math.min(1, k / WALK), shrink = k > WALK + HOLD ? (k - WALK - HOLD) / .8 : 0;
    const pe = p; // линейная скорость пешехода
    route.set(shrink ? 1 - shrink : pe);
    const pos = route.path.getPointAt(Math.min(.9999, pe)); const tan = route.path.getTangentAt(Math.min(.9999, pe));
    walker.position.set(pos.x, 0, pos.z);
    walker.rotation.y = Math.atan2(tan.x, tan.z);
    const walking = p < 1;
    walker.userData.body.forEach((b, i) => b.position.y = [.38, .78, .45][i] + (walking && !RM ? Math.abs(Math.sin(t * 9)) * .07 : 0));
    walker.visible = shrink < .5;
    // pin
    const pk = p >= .97 ? Math.min(1, (k - WALK * .97) / .6) : 0;
    const s = shrink ? Math.max(.001, 1 - shrink) : (pk ? 1 + Math.sin(pk * Math.PI) * .25 * (1 - pk) + (1 - Math.pow(1 - pk, 3)) - 1 : .001);
    pin.scale.setScalar(Math.max(.001, s));
    pin.position.y = .05 + (pk ? Math.sin(t * 2.2) * .12 + .12 : 0);
    pin.rotation.y = t * 1.2;
    pin.userData.ring.scale.setScalar(1 + (t * .8 % 1) * 1.5); pin.userData.ring.material.opacity = .6 * (1 - (t * .8 % 1));
    let si = 0; steps.forEach((st, i) => { if (p >= st[0]) si = i; }); setStep(si);
    palms.forEach((pl, i) => pl.rotation.x = Math.sin(t * .9 + i) * .03);
  });
  S.upd.push(clouds(g, R, 3, 11, 6.2));
  return S;
}

/* =====================================================================
   DIRECTIONS: перекрёсток, 6 вариантов ответа
   ===================================================================== */
function dirScene(el) {
  const S = Stage(el, { dist: 19.5, el: .95, az: .42, sway: .35, fov: 30, target: [0, 0, .2], shadowExt: 7.5 });
  const g = new THREE.Group(); S.scene.add(g);
  const R = rng(5);
  const ground = new THREE.Mesh(new RoundedBoxGeometry(10.6, .4, 10.6, 3, .2), mat(0xf5f6f9)); ground.position.y = -.2; ground.receiveShadow = true; g.add(ground);
  const rm = mat(0xe0e4eb, { roughness: .95 }), wm = mat(0xffffff);
  const main = new THREE.Mesh(new THREE.BoxGeometry(.9, .05, 10.6), rm); main.position.y = .025; main.receiveShadow = true; g.add(main);
  for (const z of [1.67, -1.67]) { const c = new THREE.Mesh(new THREE.BoxGeometry(10.6, .052, .78), rm); c.position.set(0, .026, z); c.receiveShadow = true; g.add(c); }
  for (let z = -5; z < 5.2; z += .7) { if (Math.abs(z - 1.67) < .6 || Math.abs(z + 1.67) < .6) continue; const d = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .32), wm); d.position.set(0, .03, z); g.add(d); }
  const tl = trafficLight(g, .62, 2.2);

  const blocks = {
    lb: { x: -2.67, z: 3.5, w: 3.3, d: 1.8, h: 1.2, c: 0xeef1f7 },
    rb: { x: 2.67, z: 3.5, w: 3.3, d: 1.8, h: 2.3, c: 0xecebf8 },
    lm: { x: -2.67, z: 0, w: 3.3, d: 1.7, h: .9, c: 0xe9f2ec },
    rm: { x: 2.67, z: 0, w: 3.3, d: 1.7, h: 1.7, c: 0xf1f3f8 },
    lt: { x: -2.67, z: -3.55, w: 3.3, d: 1.9, h: 1.5, c: 0xecebf8 },
    rt: { x: 2.67, z: -3.55, w: 3.3, d: 1.9, h: .8, c: 0xe9f2ec }
  };
  const goldC = new THREE.Color(0xf2c24c);
  Object.values(blocks).forEach(b => {
    b.mat = mat(b.c); b.base = new THREE.Color(b.c);
    b.mesh = shadow(new THREE.Mesh(new RoundedBoxGeometry(b.w, b.h, b.d, 2, .08), b.mat));
    b.mesh.geometry.translate(0, b.h / 2, 0); b.mesh.position.set(b.x, 0, b.z); g.add(b.mesh);
    b.k = 0; b.target = 0;
  });
  // Cami — купол и минарет поверх lm
  const lm = blocks.lm;
  const dome = shadow(new THREE.Mesh(new THREE.SphereGeometry(.55, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffffff))); dome.position.set(lm.x, lm.h, lm.z); g.add(dome);
  const mn = shadow(new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, 2.2, 10), mat(0xffffff))); mn.position.set(lm.x - 1.3, 1.1, lm.z - .5); g.add(mn);
  const mc = new THREE.Mesh(new THREE.ConeGeometry(.09, .35, 10), mat(0x9fb2d6)); mc.position.set(lm.x - 1.3, 2.35, lm.z - .5); g.add(mc);
  // Otogar — автобус у rt
  const bus = shadow(new THREE.Mesh(new RoundedBoxGeometry(1.2, .45, .45, 2, .08), mat(0xf2c24c))); bus.position.set(2.4, .23, -2.35); g.add(bus);
  [[-4.3, 5], [4.4, 5], [-4.5, -1.1], [4.5, 1], [-.9, -4.8]].forEach(([x, z]) => tree(g, x, z, .9));

  const T = [
    { p: [[0, 4.6], [0, -4.8]], b: 'rt', l: 'Otogar düz' },
    { p: [[0, 4.6], [0, 1.67], [4.9, 1.67]], b: 'rb', l: 'Market sağda' },
    { p: [[0, 4.6], [0, 1.67], [-4.9, 1.67]], b: 'lb', l: 'Eczane solda' },
    { p: [[0, 4.6], [0, -1.67], [-4.9, -1.67]], b: 'lm', l: 'Cami solda' },
    { p: [[0, 4.6], [0, 2.35]], b: 'rm', l: 'Banka karşıda' },
    { p: [[-.22, 4.6], [-.22, .2], [.22, .2], [.22, 4.6]], b: 'rb', l: 'Otel geride' }
  ];
  const labels = T.map(t => { const s = label(t.l, { bg: 'rgba(243,197,82,.97)', fg: '#43361c', sc: .0085 }); const b = blocks[t.b]; s.position.set(b.x, b.h + .35, b.z); s.material.opacity = 0; g.add(s); return s; });

  const walker = makeWalker(); g.add(walker);
  let route = null, cur = -1, tStart = 0;
  function go(i) {
    if (i === cur) return; cur = i;
    if (route) { g.remove(route.m); route.m.geometry.dispose(); }
    route = routeMesh(T[i].p, .09); g.add(route.m);
    Object.entries(blocks).forEach(([k, b]) => b.target = k === T[i].b ? 1 : 0);
    tStart = performance.now() / 1000;
  }
  S.upd.push((dt, t) => {
    tl(t);
    if (!route) return;
    const k = RM ? 1 : Math.min(1, (t - tStart) / 1.7), e = ease(k);
    route.set(e);
    const pos = route.path.getPointAt(Math.min(.9999, e)), tan = route.path.getTangentAt(Math.min(.9999, e));
    walker.position.set(pos.x, 0, pos.z); walker.rotation.y = Math.atan2(tan.x, tan.z);
    walker.userData.body.forEach((b, i) => b.position.y = [.38, .78, .45][i] + (k < 1 && !RM ? Math.abs(Math.sin(t * 10)) * .07 : 0));
    Object.values(blocks).forEach(b => {
      const tg = b.target && k > .7 ? 1 : 0; b.k += (tg - b.k) * Math.min(1, dt * 6);
      b.mat.color.copy(b.base).lerp(goldC, b.k); b.mat.metalness = b.k * .55; b.mat.roughness = .82 - b.k * .5;
      b.mesh.scale.y = 1 + b.k * .22 + (b.k > .5 ? Math.sin(t * 3) * .02 : 0);
    });
    labels.forEach((s, i) => {
      const on = i === cur && k > .75 ? 1 : 0; s.material.opacity += (on - s.material.opacity) * Math.min(1, dt * 7);
      const b = blocks[T[i].b]; s.position.y = b.h * b.mesh.scale.y + .3 + Math.sin(t * 2) * .06;
    });
  });
  return { go };
}

/* =====================================================================
   COIN $30
   ===================================================================== */
async function coin(el) {
  try { await document.fonts.load('600 180px "Playfair Display"'); } catch (e) { }
  const S = Stage(el, { dist: 6.2, el: .12, az: 0, fov: 30, shadows: false, drag: false, envI: 1.1, exposure: 1.05 });
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  const gr = x.createRadialGradient(200, 170, 40, 256, 256, 280); gr.addColorStop(0, '#ffeaa0'); gr.addColorStop(.55, '#f2c24c'); gr.addColorStop(1, '#c98f25');
  x.fillStyle = gr; x.fillRect(0, 0, 512, 512);
  x.strokeStyle = 'rgba(122,82,12,.55)'; x.lineWidth = 10; x.beginPath(); x.arc(256, 256, 222, 0, Math.PI * 2); x.stroke();
  x.setLineDash([4, 10]); x.lineWidth = 4; x.beginPath(); x.arc(256, 256, 200, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '600 170px "Playfair Display", Georgia, serif'; x.fillStyle = 'rgba(255,248,220,.9)'; x.fillText('$30', 258, 250);
  x.fillStyle = '#7a520c'; x.fillText('$30', 256, 246);
  x.font = '700 30px Montserrat, sans-serif'; x.fillText('A0 → C1', 256, 356);
  x.font = '600 24px Montserrat, sans-serif'; x.fillText('ALTERNA', 256, 150);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const face = new THREE.MeshStandardMaterial({ map: tex, metalness: .65, roughness: .32 });
  const side = new THREE.MeshStandardMaterial({ color: 0xe0a936, metalness: .95, roughness: .3 });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, .2, 80), [side, face, face]);
  m.rotation.x = Math.PI / 2;
  const grp = new THREE.Group(); grp.add(m); S.scene.add(grp);
  const key = new THREE.PointLight(0xffffff, 12, 20); key.position.set(2.5, 2.5, 4); S.scene.add(key);
  let boost = 0, lastY = scrollY;
  addEventListener('scroll', () => { boost = Math.min(8, boost + Math.abs(scrollY - lastY) * .02); lastY = scrollY; }, { passive: true });
  S.upd.push((dt, t) => {
    boost *= .94;
    grp.rotation.y += dt * (RM ? 0 : 1.1 + boost);
    grp.position.y = RM ? 0 : Math.sin(t * 1.6) * .1;
    grp.rotation.z = Math.sin(t * .8) * .08;
  });
}

/* ---------- boot ---------- */
if (glOK) {
  try { await document.fonts.ready; } catch (e) { }
  try {
    const h = document.getElementById('hero3d');
    if (h) { heroCity(h); h.closest('.hero-vis').classList.add('on3d'); }
  } catch (e) { console.warn('hero3d', e); }
  try {
    const d = document.getElementById('dir3d');
    if (d) {
      const api = dirScene(d);
      d.closest('.dir-g').classList.add('on3d');
      addEventListener('dirtab', e => api.go(e.detail));
      if (window.__dirIdx != null) api.go(window.__dirIdx);
    }
  } catch (e) { console.warn('dir3d', e); }
  try { const c = document.getElementById('coin3d'); if (c) coin(c); } catch (e) { console.warn('coin', e); }
}
