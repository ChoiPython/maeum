import * as THREE from 'three';
import { settings } from '../../../shared/runtime.js';
import type { ForestBreathing } from './forest-breathing.js';

function paintedTexture(size: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  paint(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function softLight() {
  return paintedTexture(128, (ctx) => {
    const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 63);
    glow.addColorStop(0, '#fff'); glow.addColorStop(.15, '#ffffffe0');
    glow.addColorStop(.48, '#ffffff60'); glow.addColorStop(1, '#ffffff00');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, 128, 128);
  });
}

// A cupped, tapered blade. Local +Y runs from the base to the tip.
function petalGeometry(length: number, width: number, root: string, tip: string) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const baseColor = new THREE.Color(root), tipColor = new THREE.Color(tip);
  const color = new THREE.Color();
  for (let row = 0; row <= 16; row++) {
    const t = row / 16;
    const belly = Math.pow(Math.sin(Math.PI * t), .69);
    for (let column = 0; column <= 8; column++) {
      const s = column / 4 - 1;
      positions.push(s * width * (.014 + belly), length * t,
        length * (.19 * Math.sin(t * Math.PI) + .16 * t ** 3 - .14 * s * s * belly));
      color.copy(baseColor).lerp(tipColor, .85 * t + .14 * Math.abs(s));
      colors.push(color.r, color.g, color.b);
      if (row < 16 && column < 8) {
        const i = row * 9 + column;
        indices.push(i, i + 1, i + 9, i + 1, i + 10, i + 9);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices); geo.computeVertexNormals(); return geo;
}

function seedRandom() {
  let seed = 511;
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

export class ForestGlade {
  readonly root = new THREE.Group();
  readonly camera = new THREE.PerspectiveCamera(41, 1, .08, 150);
  private petals: { mesh: THREE.Mesh; layer: number }[] = [];
  private heart: THREE.Mesh;
  private horizon: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private sunlight = new THREE.Group();
  private lantern: THREE.PointLight;
  private halo: THREE.Sprite;
  private gift = new THREE.Group();
  private sunbeams: THREE.MeshBasicMaterial;
  private motes: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private moteOrigins: Float32Array;
  private meadow = new THREE.Group();
  private motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private random = seedRandom();
  private bloom = 0;
  private time = 0;
  private meadowScale = 0;
  private baseSky = new THREE.Color('#e8eddd');
  private gladeSky = new THREE.Color('#f4dfb7');
  private gladeMist = new THREE.Color('#d9ceac');

  constructor() {
    const center = settings.world.zones.find((zone) => zone.id === 'forest')!.center;
    this.root.position.set(center.x, 0, center.z);
    this.root.name = '햇살꽃 숲터';
    const glow = softLight();
    this.makeFloor(glow);
    this.horizon = this.makeHorizon(); this.root.add(this.horizon);
    const petals = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .68 });
    const stem = new THREE.CatmullRomCurve3([new THREE.Vector3(0, .05, 0),
      new THREE.Vector3(.1, .54, .04), new THREE.Vector3(-.06, 1, .01), new THREE.Vector3(0, 1.29, 0)]);
    this.root.add(new THREE.Mesh(new THREE.TubeGeometry(stem, 18, .052, 9, false),
      new THREE.MeshStandardMaterial({ color: '#53724a', roughness: .8 })));
    const leaf = petalGeometry(.87, .20, '#324f3c', '#91ac64');
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(leaf, petals);
      mesh.position.set(.05, .18 + i * .11, .02);
      mesh.rotation.order = 'YXZ'; mesh.rotation.set(.88 + (i % 3) * .18, i * 2.4, .12);
      this.root.add(mesh);
    }
    const silk = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .61,
      emissive: '#ef966e', emissiveIntensity: .27 });
    for (let layer = 0; layer < 3; layer++) {
      const count = 10 - layer * 2;
      const geo = petalGeometry(1.08 - layer * .21, .32 - layer * .045,
        ['#c25876', '#e57e75', '#ee9b4a'][layer], ['#ffded6', '#ffe8ce', '#ffe197'][layer]);
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(geo, silk);
        const angle = Math.PI * 2 * (i + layer * .42) / count;
        mesh.rotation.order = 'YXZ'; mesh.rotation.y = angle;
        mesh.position.set(.08 * Math.sin(angle), 1.27 + layer * .055, .08 * Math.cos(angle));
        this.root.add(mesh); this.petals.push({ mesh, layer });
      }
    }
    this.makeStamens();
    this.lantern = new THREE.PointLight('#ffdfa1', 6.5, 5);
    this.lantern.position.set(-.8, 2.8, 1.3); this.root.add(this.lantern);
    this.heart = new THREE.Mesh(new THREE.IcosahedronGeometry(.16, 2),
      new THREE.MeshBasicMaterial({ color: '#ffedaf', toneMapped: false }));
    this.heart.position.y = 1.64; this.root.add(this.heart);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffe9aa',
      transparent: true, opacity: .48, depthWrite: false, toneMapped: false }));
    this.halo.position.copy(this.heart.position); this.halo.renderOrder = 3; this.root.add(this.halo);
    const spark = new THREE.SpriteMaterial({ map: glow, color: '#fff2a5', transparent: true, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 12; i++) this.gift.add(new THREE.Sprite(spark));
    this.gift.visible = false; this.root.add(this.gift);
    this.makeFerns();
    this.sunbeams = this.makeSunbeams(glow);
    const locations = new Float32Array(64 * 3);
    for (let i = 0; i < locations.length; i += 3) {
      locations[i] = (this.random() - .5) * 12;
      locations[i + 1] = .3 + this.random() * 4.8;
      locations[i + 2] = (this.random() - .5) * 10;
    }
    this.moteOrigins = locations;
    const particles = new THREE.BufferGeometry();
    particles.setAttribute('position', new THREE.BufferAttribute(locations.slice(), 3).setUsage(THREE.DynamicDrawUsage));
    this.motes = new THREE.Points(particles, new THREE.PointsMaterial({ map: glow, color: '#ffe199',
      size: .087, transparent: true, opacity: .92, depthWrite: false, toneMapped: false }));
    this.root.add(this.motes, this.meadow);
    this.meadow.visible = false;
  }

  private makeStamens() {
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(.013,.018,1,5),
      new THREE.MeshStandardMaterial({color:'#efb464',emissive:'#a57336',emissiveIntensity:.27}), 24);
    const tips = new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),
      new THREE.MeshStandardMaterial({color:'#ffc858',emissive:'#f3a138',emissiveIntensity:.38}), stems.count);
    const piece = new THREE.Object3D();
    for (let i = 0; i < stems.count; i++) {
      const angle = i * 2.4, r = .12 + .15 * (i % 4) / 3, h = .33 + .12 * Math.sin(i);
      const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
      piece.position.set(x * .72, 1.51 + h / 2, z * .72); piece.scale.set(1,h,1); piece.updateMatrix();
      stems.setMatrixAt(i,piece.matrix);
      piece.position.y += h / 2; piece.scale.set(.034,.054,.034); piece.updateMatrix(); tips.setMatrixAt(i,piece.matrix);
    }
    this.root.add(stems, tips);
  }

  private makeFerns() {
    const vertices: number[] = [], colors: number[] = [];
    const shade = new THREE.Color('#335c47'), light = new THREE.Color('#96b977');
    for (let clump = 0; clump < 54; clump++) {
      const angle = this.random() * Math.PI * 2, radius = 2.1 + this.random() * 5.5;
      const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
      const size = .46 + this.random() * .50;
      for (let frond = 0; frond < 6; frond++) {
        const a = angle + frond * 1.05 + this.random() * .25;
        const dx = Math.cos(a), dz = Math.sin(a);
        for (let j = 0; j < 10; j++) {
          const t = (j + 1) / 11, reach = size * t;
          const px = x + dx * reach, pz = z + dz * reach;
          const py = .08 + size * (1.5 * t - 1.06 * t * t);
          const width = (.035 + .15 * Math.sin(Math.PI * t)) * size;
          for (const side of [-1, 1]) {
            vertices.push(px,py,pz, px + dx * .10 * size,py + .024,pz + dz * .10 * size,
              px + dx * .09 * size - side * dz * width,py + .07 * size,pz + dz * .09 * size + side * dx * width);
            colors.push(shade.r,shade.g,shade.b, shade.r,shade.g,shade.b, light.r,light.g,light.b);
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices,3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
    this.root.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide})));
  }

  private makeHorizon() {
    // A seamless band of distant wooded hills, beyond the walkable garden.
    const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 512;
    const ctx = canvas.getContext('2d')!, w = canvas.width, h = canvas.height;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#b7d2bd'); sky.addColorStop(.42, '#f9ddab'); sky.addColorStop(1, '#c7cc9f');
    ctx.fillStyle = sky; ctx.fillRect(0,0,w,h);
    for (let layer = 0; layer < 4; layer++) {
      const ridge = (x: number) => {
        const a = x / w * Math.PI * 2;
        return 190 + layer * 42 + 27 * Math.sin(3 * a + layer) + 18 * Math.cos(7 * a - layer * .8) + 10 * Math.cos(11 * a + layer);
      };
      ctx.fillStyle = ['#cacfae','#aabfa1','#91aa8b','#708f76'][layer];
      ctx.beginPath(); ctx.moveTo(0,h);
      for (let x = 0; x <= w; x += 4) ctx.lineTo(x,ridge(x));
      ctx.lineTo(w,h); ctx.fill();
      for (let x = 0; x < w; x += 3) {
        const height = 4 + this.random() * (6 + layer * 4);
        for (const offset of [-w, 0, w]) {
          const tx = x + offset, y = ridge(x) + 2;
          ctx.beginPath(); ctx.moveTo(tx, y-height); ctx.lineTo(tx+height*.25,y+1); ctx.lineTo(tx-height*.25,y+1); ctx.fill();
        }
      }
    }
    ctx.globalCompositeOperation = 'destination-in';
    const edge = ctx.createLinearGradient(0, 0, 0, h);
    edge.addColorStop(0,'transparent'); edge.addColorStop(.26,'#fff'); edge.addColorStop(1,'#fff');
    ctx.fillStyle = edge; ctx.fillRect(0,0,w,h);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    const backdrop = new THREE.Mesh(new THREE.CylinderGeometry(69,69,30,96,1,true),
      new THREE.MeshBasicMaterial({map,side:THREE.BackSide,transparent:true,depthWrite:false,fog:false,toneMapped:false}));
    backdrop.position.y = 5; backdrop.renderOrder = -10; return backdrop;
  }

  private makeFloor(glow: THREE.Texture) {
    const texture = paintedTexture(512, ctx => {
      const moss = ctx.createRadialGradient(256, 256, 0, 256, 256, 255);
      moss.addColorStop(0, '#7e985d'); moss.addColorStop(.58, '#728b54');
      moss.addColorStop(.83, '#7d9659d4'); moss.addColorStop(1, '#8a9c6500');
      ctx.fillStyle = moss; ctx.fillRect(0, 0, 512, 512);
      ctx.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 1300; i++) {
        ctx.fillStyle = i % 3 ? '#45624439' : '#d8cf8c41';
        ctx.beginPath();
        ctx.ellipse(this.random() * 512, this.random() * 512, 1 + this.random() * 6, 1 + this.random() * 2, this.random() * 3, 0, Math.PI * 2); ctx.fill();
      }
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(15, 15), new THREE.MeshStandardMaterial({
      map: texture, transparent: true, depthWrite: false, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = .065; floor.receiveShadow = true; this.root.add(floor);
    const poolMat = new THREE.MeshBasicMaterial({ map: glow, color: '#fff0a2', transparent: true, opacity: .30, depthWrite: false });
    const patches = new THREE.InstancedMesh(new THREE.PlaneGeometry(), poolMat, 55);
    const spot = new THREE.Object3D();
    for (let i = 0; i < patches.count; i++) {
      const angle = this.random() * Math.PI * 2, radius = this.random() * 6.3;
      spot.position.set(Math.cos(angle) * radius, .081, Math.sin(angle) * radius);
      spot.rotation.x = -Math.PI / 2;
      spot.scale.set(.4 + this.random() * 1.6, .3 + this.random() * .8, 1);
      spot.updateMatrix(); patches.setMatrixAt(i, spot.matrix);
    }
    patches.renderOrder = 1; this.root.add(patches);
    const blades: number[] = [], colors: number[] = [];
    const dark = new THREE.Color('#4c714e'), pale = new THREE.Color('#a6af68');
    for (let i = 0; i < 680; i++) {
      const a = this.random() * 6.28, r = .75 + this.random() * 5.7;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      for (let j = 0; j < 4; j++) {
        const bend = this.random() * 6.28, h = .11 + this.random() * .20;
        const dx = Math.cos(bend) * .03, dz = Math.sin(bend) * .03;
        blades.push(x - dx,.07,z - dz, x + dx,.07,z + dz, x + dz * 4,h + .06,z - dx * 4);
        colors.push(dark.r,dark.g,dark.b, dark.r,dark.g,dark.b, pale.r,pale.g,pale.b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(blades,3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
    this.root.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.DoubleSide })));
  }

  private makeSunbeams(glow: THREE.Texture) {
    const beamTexture = paintedTexture(128, ctx => {
      const across = ctx.createLinearGradient(0, 0, 128, 0);
      across.addColorStop(0, '#ffffff00'); across.addColorStop(.37, '#ffffffb8');
      across.addColorStop(.56, '#fff'); across.addColorStop(1, '#ffffff00');
      ctx.fillStyle = across; ctx.fillRect(0, 0, 128, 128);
      ctx.globalCompositeOperation = 'destination-in';
      const along = ctx.createLinearGradient(0, 0, 0, 128);
      along.addColorStop(0, '#ffffff00'); along.addColorStop(.2, '#fff');
      along.addColorStop(.72, '#ffffffca'); along.addColorStop(1, '#ffffff00');
      ctx.fillStyle = along; ctx.fillRect(0, 0, 128, 128);
    });
    const mat = new THREE.MeshBasicMaterial({ map: beamTexture, color: '#ffdf91', transparent: true,
      opacity: .22, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, forceSinglePass: true });
    const beam = new THREE.PlaneGeometry();
    for (let i = 0; i < 10; i++) {
      const shaft = new THREE.Mesh(beam, mat);
      shaft.position.set(-5 + (i % 5) * 1.45 + this.random() * .45, 3.5, -3.7 + Math.floor(i / 5) * 2.4 + this.random());
      shaft.scale.set(.62 + this.random() * 1.45, 10, 1);
      shaft.rotation.order = 'YXZ'; shaft.rotation.set(-.20, .40, .52);
      shaft.renderOrder = 2; this.root.add(shaft);
    }
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#fff1b2',
      transparent: true, opacity: .88, depthWrite: false, toneMapped: false }));
    sun.position.set(-37, 14.5, -53); sun.scale.setScalar(26);
    const disc = new THREE.Mesh(new THREE.SphereGeometry(2, 32, 16), new THREE.MeshBasicMaterial({ color:'#fff6c7', toneMapped:false, fog:false }));
    disc.position.copy(sun.position); this.sunlight.add(sun, disc); this.root.add(this.sunlight);
    return mat;
  }

  addFlowerPatch(model: THREE.Group) {
    for (let i = 0; i < 8; i++) {
      const flowers = model.clone(true);
      const angle = i * 2.4, radius = 1.35 + (i % 3) * .65;
      flowers.position.set(Math.sin(angle) * radius, .07, Math.cos(angle) * radius);
      flowers.rotation.y = angle; flowers.scale.setScalar(1.05 + i % 2 * .3);
      flowers.traverse(child => { child.castShadow = false; });
      this.meadow.add(flowers);
    }
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    const distance = aspect < 1 ? 1.35 : 1;
    this.camera.position.copy(this.root.position).add(new THREE.Vector3(2.15 * distance, 2.18, 4.4 * distance));
    this.camera.lookAt(this.root.position.x, aspect < 1 ? .70 : .94, this.root.position.z);
    this.camera.updateProjectionMatrix();
  }

  update(activity: ForestBreathing, delta: number, distance: number, focused: boolean, eyeLevel: boolean, sky: THREE.Color, fog: THREE.FogExp2) {
    const local = focused ? 1 : 1 - THREE.MathUtils.smoothstep(distance, 7, 16);
    this.horizon.visible = local > 0 && (focused || eyeLevel);
    this.horizon.material.opacity = local;
    this.sunlight.visible = this.horizon.visible;
    this.lantern.visible = distance < 20 || focused;
    const active = activity.status !== 'idle' && activity.status !== 'skipped';
    const progress = active ? activity.progress : 0;
    const reduced = this.motion.matches;
    const pulse = active && !reduced && activity.status !== 'completed' ? activity.light : .35;
    const journey = activity.lightJourney;
    const arrival = journey === null ? 0 : Math.sin(Math.PI * THREE.MathUtils.smoothstep(journey, .53, 1));
    this.gift.visible = journey !== null && !reduced;
    if (this.gift.visible && journey !== null) {
      for (let i = 0; i < this.gift.children.length; i++) {
        const spark = this.gift.children[i];
        const t = THREE.MathUtils.clamp((journey - i * .014) / .75, 0, 1);
        const arc = Math.sin(Math.PI * t);
        spark.position.set(-2.25 * (1 - t) + arc * .54, 1.76 + arc * .63 + (1 - progress) * t * .3,
          .7 * (1 - t) + arc * Math.cos(4 * t) * .48);
        spark.scale.setScalar((.27 - .014 * i) * Math.sin(Math.PI * t));
      }
    }
    const target = .18 + progress * .84 + pulse * .17 + (reduced ? 0 : arrival * .19);
    const blend = reduced ? 1 : 1 - Math.exp(-4 * delta);
    this.bloom = THREE.MathUtils.lerp(this.bloom, target, blend);
    this.petals.forEach(({mesh, layer}) => { mesh.rotation.x = this.bloom * (1.36 - layer * .30); });
    this.halo.scale.setScalar(1.15 + pulse * 1.15 + arrival * .45);
    this.heart.scale.setScalar(.52 + pulse * .45);
    this.heart.position.y = this.halo.position.y = 2.40 - progress * .65 + pulse * .16;
    this.lantern.intensity = 5.8 + pulse * 3 + arrival * 2;
    this.sunbeams.opacity = .35 + pulse * .17 + progress * .04;
    this.meadowScale = THREE.MathUtils.lerp(this.meadowScale, activity.status === 'completed' ? 1 : 0, blend);
    this.meadow.visible = this.meadowScale > .01;
    this.meadow.scale.setScalar(this.meadowScale);
    const { fogDensityStart, fogDensityEnd } = settings.activities;
    const density = active ? THREE.MathUtils.lerp(fogDensityStart, fogDensityEnd, progress) : .014;
    fog.density = THREE.MathUtils.lerp(.006, density, local);
    sky.copy(this.baseSky).lerp(this.gladeSky, local * (.56 + .30 * progress));
    fog.color.copy(this.baseSky).lerp(this.gladeMist, local);
    if (!reduced && local > 0) {
      this.time += delta;
      const attr = this.motes.geometry.getAttribute('position');
      for (let i = 0; i < attr.count; i++) {
        const k = i * 3, t = this.time * .32 + i;
        attr.setXYZ(i, this.moteOrigins[k] + .23 * Math.sin(t), this.moteOrigins[k+1] + .17 * Math.sin(t * .8), this.moteOrigins[k+2] + .19 * Math.cos(t));
      }
      attr.needsUpdate = true;
    }
    this.motes.visible = !reduced;
  }

  dispose() {
    // The scene's shared cleanup owns meshes, sprites and their textures.
    this.motes.geometry.dispose(); this.motes.material.dispose();
  }
}
