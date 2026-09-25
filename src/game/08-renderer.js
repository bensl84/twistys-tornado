// =====================================================================================================
// RENDERER (three.js). Everything visual. Reads game state; never writes logic state.
// =====================================================================================================
// Procedural astronomy artwork: embedded/offline, deterministic, shared by all instances.
// These are artistic representations, not measured surface maps or a physical-scale simulation.
function createCosmicArt(THREE) {
  const cache = new Map();
  function texture(key, draw, size = 512) {
    if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 2; cache.set(key, t); return t;
  }
  const glow = (c, x, y, r, color, alpha = 1) => {
    c.save(); c.globalAlpha = alpha;
    const g = c.createRadialGradient(x,y,0,x,y,r); g.addColorStop(0,color); g.addColorStop(1,'transparent');
    c.fillStyle = g; c.fillRect(x-r,y-r,r*2,r*2); c.restore();
  };
  function planet(id) {
    return texture('planet:'+id, (c,n) => {
      const rnd = mulberry32([...id].reduce((s,v)=>s+v.charCodeAt(0),0));
      const colors = {earth:'#125dae',mercury:'#93867c',venus:'#d9b87c',mars:'#b45835',jupiter:'#cbae8a',saturn:'#d8c6a0',uranus:'#8bccd4',neptune:'#356dc0',sun:'#ffb52c',moon:'#999b9d',pluto:'#c8b2a0'};
      c.fillStyle = colors[id] || '#aeb2c0'; c.fillRect(0,0,n,n);
      for (let y=0;y<n;y++) {
        const bands = Math.sin(y*0.12+Math.sin(y*0.034)*2)*0.5+Math.sin(y*0.32)*0.22;
        c.globalAlpha = (['jupiter','saturn','venus','neptune'].includes(id)?0.21:0.025)*Math.abs(bands);
        c.fillStyle = bands>0?'#ffefd1':'#653825'; c.fillRect(0,y,n,1);
      }
      c.globalAlpha=1;
      if (id==='earth') {
        // Hand-drawn equirectangular continent silhouettes, longitude/latitude coordinates.
        const continents = [
          [[-168,70],[-140,69],[-126,53],[-124,42],[-114,29],[-96,18],[-82,9],[-77,25],[-66,45],[-82,59],[-110,72]],
          [[-81,12],[-60,8],[-35,-8],[-45,-23],[-54,-34],[-69,-55],[-77,-18]],
          [[-17,35],[10,37],[34,30],[51,11],[42,-14],[20,-35],[10,-18],[-1,5],[-17,14]],
          [[-10,36],[-10,58],[20,71],[57,73],[110,72],[179,65],[150,49],[142,35],[122,20],[105,5],[79,8],[67,25],[40,30],[26,40]],
          [[112,-12],[137,-10],[154,-25],[145,-39],[116,-33]],
          [[-54,60],[-28,70],[-23,82],[-55,84],[-72,74]],
          [[46,-13],[50,-17],[47,-26],[43,-23]],
        ];
        const xy = ([lon,lat]) => [(lon+180)/360*n,(90-lat)/180*n];
        for (const land of continents) {
          c.beginPath(); land.forEach((p,i)=>{const [x,y]=xy(p); i?c.lineTo(x,y):c.moveTo(x,y);}); c.closePath();
          c.fillStyle='#698c59'; c.fill(); c.save(); c.clip();
          for(let i=0;i<170;i++) glow(c,rnd()*n,rnd()*n,3+rnd()*18, i%2?'#b5a36c':'#3f754b',0.5);
          c.restore();
        }
        c.fillStyle='#e8f4f4'; c.fillRect(0,n*0.94,n,n*0.06);
        for(let i=0;i<140;i++) {c.save();c.translate(rnd()*n,rnd()*n);c.scale(3,0.4);glow(c,0,0,4+rnd()*8,'#ffffff',0.45);c.restore();}
      } else if (id==='jupiter') {
        c.save(); c.translate(n*0.68,n*0.61); c.scale(2.1,0.65); glow(c,0,0,n*0.055,'#b75736'); glow(c,0,0,n*0.028,'#d58857'); c.restore();
      } else if (['mercury','moon','pluto','mars'].includes(id)) {
        for(let i=0;i<360;i++){const x=rnd()*n,y=rnd()*n,r=1+rnd()*8;c.strokeStyle='rgba(35,26,22,0.24)';c.lineWidth=1.4;c.beginPath();c.arc(x,y,r,0,TAU);c.stroke();glow(c,x+1,y+1,r,'#4d3e34',0.2);}
        if(id==='mars'){glow(c,n*0.4,n*0.57,n*0.17,'#533b31',0.6);c.fillStyle='#eee3d5';c.fillRect(0,0,n,n*0.045);}
      }
      for(let i=0;i<9000;i++){c.globalAlpha=0.03+rnd()*0.08;c.fillStyle=i%2?'#ffffff':'#21150e';c.fillRect(rnd()*n,rnd()*n,1+rnd()*3,1);}
      c.globalAlpha=1;
    });
  }
  // Universe galaxies come in variants so no two neighbours look alike: arm count and winding, flattening and palette.
  // Variant 0 is the original look (the galaxy stage only uses it).
  const GALAXY_VARIANTS=5;
  const GALAXY_LOOKS=[
    {arms:2,pitch:2.25,flat:0.85,disk:'#bfc7df',star:'#f2f5ff',accent:'#ffe3ed',knot:'#e6edff',core:'#eacaa4',heart:'#fff6e1'},
    {arms:3,pitch:1.6, flat:0.7, disk:'#d8b77a',star:'#ffe7b8',accent:'#fff4dc',knot:'#ffd08a',core:'#f2b36b',heart:'#fff1cf'},
    {arms:2,pitch:3.1, flat:0.95,disk:'#b58ad8',star:'#f1d4ff',accent:'#ff9fdc',knot:'#d9a2ff',core:'#e7a7d8',heart:'#fff0fb'},
    {arms:4,pitch:1.9, flat:0.6, disk:'#6fb4c9',star:'#d4fbff',accent:'#9ff7e2',knot:'#8fe9ff',core:'#bfe9e0',heart:'#f2fffd'},
    {arms:2,pitch:2.6, flat:0.8, disk:'#d98464',star:'#ffd9c4',accent:'#ff8a6a',knot:'#ffb07a',core:'#ff9e5e',heart:'#fff0da'},
  ];
  function galaxy(kind='spiral',tone='blue',variant=0) {
    const look=GALAXY_LOOKS[variant%GALAXY_VARIANTS];
    return texture('galaxy:'+kind+':'+tone+(variant?':'+variant:''),(c,n)=>{
      const rnd=mulberry32(872+kind.length*59+variant*977); const mid=n/2;
      if(['group','cluster','web','quasar'].includes(kind)) {
        if(kind==='quasar') {
          c.drawImage(galaxy('spiral',tone,variant).image,0,0,n,n);
          c.save();c.translate(mid,mid);c.rotate(-0.65);c.scale(0.09,1);glow(c,0,0,n*0.47,'#87d8ff',0.95);c.restore();
          glow(c,mid,mid,n*0.09,'#ffffff',1);return;
        }
        const count=kind==='group'?5:kind==='cluster'?22:70;
        for(let i=0;i<count;i++) {
          const a=rnd()*TAU,r=Math.sqrt(rnd())*n*0.35;
          const x=kind==='web'?n*0.12+i/count*n*0.76:mid+Math.cos(a)*r;
          const y=kind==='web'?mid+Math.sin(i/count*8)*n*0.2+(rnd()-0.5)*n*0.12:mid+Math.sin(a)*r*0.8;
          const s=n*(kind==='group'?0.25:kind==='cluster'?0.12:0.05)*(0.6+rnd()*0.6);
          c.drawImage(galaxy(i%3?'spiral':'elliptical',tone,variant?(variant+i)%GALAXY_VARIANTS:0).image,x-s/2,y-s/2,s,s);
        }
        return;
      }
      if(kind==='nebula') {
        for(let i=0;i<95;i++){const a=rnd()*TAU,r=rnd()*n*0.30;glow(c,mid+Math.cos(a)*r,mid+Math.sin(a)*r,15+rnd()*70,['#4272ac','#ab547b','#685ab0'][i%3],0.07);}
      }
      const elliptic=kind==='elliptical'||kind==='lenticular';
      // A diffuse disk and broad, uneven star-forming arms, not four hard lines.
      const flat=elliptic?0.65:look.flat;
      c.save();c.translate(mid,mid);c.scale(1,flat);
      glow(c,0,0,n*0.45,elliptic?(variant?look.core:'#bfa889'):tone==='neutral'?look.disk:'#346eae',0.28);c.restore();
      for(let i=0;i<20000;i++) {
        const r=Math.pow(rnd(),0.65)*n*0.45;
        let a=rnd()*TAU, x,y;
        if(!elliptic && kind!=='irregular' && kind!=='nebula') {
          const arm=i%look.arms;
          a=arm*TAU/look.arms+Math.log(1+r/38)*look.pitch+(rnd()+rnd()+rnd()-1.5)*(0.22+r/n*0.36);
          // A few inter-arm stars soften the edge without filling the dark lanes.
          if(i%19===0)a=rnd()*TAU;
          if(kind==='ring') a=rnd()*TAU;
        }
        const rr=kind==='ring'?n*0.30+(rnd()-0.5)*n*0.06:r;
        x=mid+Math.cos(a)*rr; y=mid+Math.sin(a)*rr*flat;
        const alpha=(1-r/(n*0.49))*(elliptic?0.22:0.55);
        c.fillStyle=elliptic?(variant?look.star:'#ffe3b0'):tone==='neutral'?(i%13===0?look.accent:look.star):(i%13===0?'#ef8dbd':i%3?'#87cfff':'#edf6ff');
        c.globalAlpha=alpha; const s=0.5+rnd()*1.6;c.fillRect(x,y,s,s);
        if(i%18===0) glow(c,x,y,4+rnd()*9,elliptic?(variant?look.knot:'#ffe4be'):tone==='neutral'?look.knot:i%5?'#59c3ff':'#e988b5',0.16);
      }
      c.globalAlpha=1;
      if(kind==='barred') {c.save();c.translate(mid,mid);c.rotate(0.25);c.scale(2.8,0.55);glow(c,0,0,n*0.11,'#ffe9c4',0.9);c.restore();}
      if(kind!=='irregular' && kind!=='nebula'){glow(c,mid,mid,n*0.15,look.core,0.65);glow(c,mid,mid,n*0.055,look.heart,0.95);}
    },512);
  }
  function galaxyKind(id) {
    if(/everything|wall|attractor|supercluster/.test(id)) return 'web';
    if(/quasar/.test(id)) return 'quasar';
    if(/cluster/.test(id)) return 'cluster';
    if(/group|pair/.test(id)) return 'group';
    if(/ell|bulge|dwarf|speck/.test(id)) return 'elliptical';
    if(/irregular/.test(id)) return 'irregular';
    if(/ring/.test(id)) return 'ring';
    if(/barred/.test(id)) return 'barred';
    if(/lenticular/.test(id)) return 'lenticular';
    return 'spiral';
  }
  function star(id) {
    return texture('star:'+id,(c,n)=>{
      const cool=/blue|white|pulsar/.test(id),color=cool?'#98c9ff':/red|hyper|brown/.test(id)?'#f5a779':'#ffe1a0';
      glow(c,n/2,n/2,n*.48,color,.32);glow(c,n/2,n/2,n*.23,color,.8);glow(c,n/2,n/2,n*.09,'#fff9ed');
      if(/pulsar/.test(id)){c.save();c.translate(n/2,n/2);c.scale(.035,1);glow(c,0,0,n*.49,'#c1eeff');c.restore();}
    },256);
  }
  return { planet, galaxy, galaxyKind, star, glow, texture, variants: GALAXY_VARIANTS };
}

function createRenderer(THREE, canvas, opts) {
  const T = TUNING;
  const builders = makeGeometryBuilders(THREE);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: opts.antialias !== undefined ? opts.antialias : T.ANTIALIAS, powerPreference: 'high-performance', alpha: false, stencil: false });
  renderer.setPixelRatio(Math.min(opts.dpr || window.devicePixelRatio || 1, T.MAX_DPR));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const skyColor = new THREE.Color(0xa9c4dd);
  scene.background = skyColor;
  scene.fog = new THREE.Fog(0xb8cbdc, 70, 400);
  const camera = new THREE.PerspectiveCamera(T.FOV, 1, 0.5, 60000);

  // ---- lights: low warm sun, long shadows ----
  const sun = new THREE.DirectionalLight(0xffe4bd, 2.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(opts.shadowMap || T.SHADOW_MAP, opts.shadowMap || T.SHADOW_MAP);
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.12;
  const sunDir = new THREE.Vector3(0.6, 0.5, 0.62).normalize(); // low SE sun; shadows fall up-left on screen
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xcfe0f5, 0x7a8452, 1.1);
  scene.add(hemi);

  // ---- ground ----
  const gtex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
    g.fillStyle = '#789753'; g.fillRect(0, 0, 512, 512);
    const prng = mulberry32(99);
    for (let i = 0; i < 5500; i++) { const x = prng() * 512, y = prng() * 512, r = 0.8 + prng() * 1.8; const v = prng(); g.fillStyle = v < 0.5 ? 'rgba(80,125,60,0.20)' : v < 0.8 ? 'rgba(150,170,95,0.16)' : 'rgba(130,105,70,0.12)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    for (let i = 0; i < 3500; i++) { const x=prng()*512,y=prng()*512; g.strokeStyle=prng()<.5?'rgba(215,210,140,0.20)':'rgba(45,95,55,0.18)';g.lineWidth=.8;g.beginPath();g.moveTo(x,y);g.lineTo(x+(prng()-.5)*2,y-1-prng()*2);g.stroke(); }
    for (let i = 0; i < 16; i++) { const x = prng() * 512, y = prng() * 512, r = 15 + prng() * 35; g.fillStyle = 'rgba(130,115,70,0.055)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  })();
  const townGroup = new THREE.Group(); scene.add(townGroup);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ map: gtex, color: 0xe6e6d6, roughness: 1, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; townGroup.add(ground);
  // roads + fields (flat decals)
  {
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x4d4b48, roughness: 1 });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8c66a });
    const RS = T.ROAD_SPACING;
    for (let k = -2; k <= 2; k++) {
      for (const alongX of [true, false]) {
        const r = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? 900 : T.ROAD_WIDTH, alongX ? T.ROAD_WIDTH : 900), roadMat);
        r.rotation.x = -Math.PI / 2; r.position.set(alongX ? 0 : k * RS, 0.03, alongX ? k * RS : 0); r.receiveShadow = true; townGroup.add(r);
        const l = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? 900 : 0.25, alongX ? 0.25 : 900), lineMat);
        l.rotation.x = -Math.PI / 2; l.position.set(alongX ? 0 : k * RS, 0.04, alongX ? k * RS : 0); townGroup.add(l);
      }
    }
    const fieldMat = new THREE.MeshStandardMaterial({ color: 0xa88f4e, roughness: 1 });
    const fieldMat2 = new THREE.MeshStandardMaterial({ color: 0x86a04a, roughness: 1 });
    const prng = mulberry32(5);
    for (let i = -3; i < 3; i++) for (let j = -3; j < 3; j++) { if (prng() < 0.45) continue; const cx = (i + 0.5) * RS, cz = (j + 0.5) * RS; const w = 40 + prng() * 40, h = 40 + prng() * 40; const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), prng() < 0.5 ? fieldMat : fieldMat2); f.rotation.x = -Math.PI / 2; f.position.set(cx + (prng() - 0.5) * 30, 0.02, cz + (prng() - 0.5) * 30); f.receiveShadow = true; townGroup.add(f); }
  }

  // ---- instanced object meshes ----
  const objMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0 });
  // Only vertices flagged 'tint' take the per-instance color; roofs, trunks, wheels keep their own color.
  objMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float tint;')
      .replace('#include <color_vertex>', 'vColor = vec3(1.0); vColor *= color;\n#ifdef USE_INSTANCING_COLOR\n vColor.xyz *= mix(vec3(1.0), instanceColor.xyz, tint);\n#endif');
  };
  objMat.customProgramCacheKey = () => 'tinted';
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true }); // the Sun: unlit, always bright
  const meshes = {};
  const art = createCosmicArt(THREE), cosmicMaterials = new Map();
  const planetIds = new Set([...SOLAR_ORBITS.map(p=>p.id),'moon','pluto','sun']);
  const companions = [];
  function debrisGeometry(size) {
    // Legacy large solar pickups are now loose rocky/icy aggregates, not invented planets or extra suns.
    const rnd=mulberry32(size*73),positions=[],normals=[],colors=[];
    for(let i=0;i<32;i++) {
      const a=rnd()*TAU,r=Math.sqrt(rnd())*size*.40,s=size*(.025+rnd()*.065);
      let g=new THREE.IcosahedronGeometry(s,1);if(g.index)g=g.toNonIndexed();g.translate(Math.cos(a)*r,s+(rnd()*.1)*size,Math.sin(a)*r);
      positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);
      const shade=.35+rnd()*.35;for(let j=0;j<g.attributes.position.count;j++)colors.push(shade,shade*.95,shade*.87);g.dispose();
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;
  }
  function cosmicMaterial(key, map, transparent=false) {
    if (!cosmicMaterials.has(key)) cosmicMaterials.set(key, transparent
      ? new THREE.MeshBasicMaterial({ map, transparent:true, depthWrite:false, side:THREE.DoubleSide, blending:THREE.AdditiveBlending, fog:false })
      : new THREE.MeshStandardMaterial({ map, roughness:0.92, metalness:0, emissive:key==='sun'?0xffb43c:0x000000, emissiveMap:key==='sun'?map:null, emissiveIntensity:key==='sun'?1.3:0 }));
    return cosmicMaterials.get(key);
  }
  const dummy = new THREE.Object3D();
  const M4 = new THREE.Matrix4();
  const galaxyColors = [0xff91c2,0x80d9ff,0xffd283,0xa793ff,0x8cebd9,0xffa68a,0xc9edff,0xffb8e2];
  const WHITE = new THREE.Color(0xffffff);
  // ---- the last goal: a big black hole (black core; the disk and photon ring follow it, see updateFinalHole) ----
  // core radius as a share of the goal's size: 0.8 makes it about 1.5x her own black hole when she reaches it
  const FINAL_HOLE_ID = 'u_everything', FINAL_HOLE_R = 0.8;
  const holeCoreMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
  let finalHoleObj = null;
  const solarOverviewScale = {mercury:3,venus:2.4,earth:2.8,mars:2.5,jupiter:1.3,saturn:1.15,uranus:1.8,neptune:1.8};
  let objs = [];
  function buildObjects(list, types) {
    for (const id in meshes) { scene.remove(meshes[id]); meshes[id].geometry.dispose(); meshes[id].dispose(); delete meshes[id]; }
    for (const entry of companions) {scene.remove(entry.mesh);entry.mesh.geometry.dispose();entry.mesh.material.dispose();}
    companions.length=0;
    objs = list;
    const byType = {};
    for (const o of list) (byType[o.type.id] = byType[o.type.id] || []).push(o);
    finalHoleObj = null;
    for (const t of (types || TYPES)) {
      const all = byType[t.id] || []; if (!all.length) continue;
      const debris=stageId==='solar'&&['pluto','bigmoon','icemoon','gasdwarf','giant','dwarfstar'].includes(t.id);
      const texturedPlanet=stageId==='solar'&&planetIds.has(t.id)&&!debris;
      const finalHole=t.id===FINAL_HOLE_ID; // the last goal is a real black hole, not a picture
      const galaxySprite=t.id.startsWith('u_')&&!finalHole;
      const nebulaSprite=/^g_(big)?nebula$|^g_wisp$/.test(t.id);
      const starSprite=t.id.startsWith('g_')&&!nebulaSprite;
      // universe galaxies are spread over several looks (arms, winding, palette) so neighbours differ
      const buckets = new Map();
      for (const o of all) { const v = galaxySprite ? (o.id * 13 + t.index * 7) % art.variants : 0; if (!buckets.has(v)) buckets.set(v, []); buckets.get(v).push(o); }
      for (const [variant, arr] of buckets) {
      let geo, material=t.glow?glowMat:objMat;
      if(texturedPlanet) {
        geo=new THREE.SphereGeometry(t.size/2,40,24);geo.translate(0,t.size/2,0);
        material=cosmicMaterial(t.id,art.planet(t.id));
      } else if(debris){geo=debrisGeometry(t.size);material=objMat;
      } else if(finalHole){geo=new THREE.SphereGeometry(t.size*FINAL_HOLE_R,48,32);geo.translate(0,t.size*0.4,0);material=holeCoreMat;
      } else if(galaxySprite||nebulaSprite||starSprite) {
        geo=new THREE.PlaneGeometry(t.size*2.2,t.size*2.2);geo.rotateX(-Math.PI/2);geo.translate(0,t.size*0.4,0);
        const kind=nebulaSprite?'nebula':/g_.*cluster|g_globular|g_core/.test(t.id)?'elliptical':art.galaxyKind(t.id);
        const isStar=starSprite&&!/cluster|globular|core/.test(t.id);
        material=cosmicMaterial(isStar?'star:'+t.id:'galaxy:'+kind+':'+(galaxySprite?'neutral':'blue')+(variant?':'+variant:''),isStar?art.star(t.id):art.galaxy(kind,galaxySprite?'neutral':'blue',variant),true);
      } else geo = builders[t.id]();
      const im = new THREE.InstancedMesh(geo, material, arr.length);
      im.castShadow = !!shadowsOn && t.tier >= T.SHADOW_TIERS_MIN; im.receiveShadow = !!shadowsOn && t.tier >= 3;
      im.frustumCulled = false;
      const c = new THREE.Color();
      arr.forEach((o, i) => {
        o.inst = i; o.mesh = im; if (finalHole) finalHoleObj = o;
        dummy.position.set(o.x, 0, o.z); dummy.rotation.set(0, o.ry, 0); dummy.scale.setScalar(o.scale); dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        // the palette now lives in each galaxy picture, so the per-galaxy tint is kept light
        if (galaxySprite) c.setHex(galaxyColors[(o.id*7+o.colorIndex)%galaxyColors.length]).lerp(WHITE, 0.45);
        else c.setHex(finalHole||texturedPlanet||nebulaSprite||starSprite||debris?0xffffff:t.colors[o.colorIndex]);
        im.setColorAt(i, c);
        if(texturedPlanet&&(t.id==='saturn'||t.id==='uranus')) {
          const r=t.size/2;
          for(const [inner,outer,opacity] of [[1.35,1.68,0.55],[1.73,2.05,0.75],[2.09,2.22,0.3]]){
            const ringGeo=new THREE.RingGeometry(r*inner,r*outer,96);ringGeo.rotateX(t.id==='uranus'?-0.15:-Math.PI/2+0.32);ringGeo.translate(0,r,0);
            const ringMesh=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:t.id==='uranus'?0x8caeb3:0xc8b38b,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false}));
            ringMesh.matrixAutoUpdate=false;scene.add(ringMesh);companions.push({mesh:ringMesh,o});
          }
        }
      });
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      scene.add(im); meshes[t.id + ':' + variant] = im;
      }
    }
    buildCosmicScene();
  }
  function hideInstance(o) { M4.makeScale(0, 0, 0); o.mesh.setMatrixAt(o.inst, M4); o.mesh.instanceMatrix.needsUpdate = true; }
  function setInstance(o, x, y, z, ry, rx, rz, s) { dummy.position.set(x, y, z); dummy.rotation.set(rx || 0, ry, rz || 0); dummy.scale.setScalar(s); dummy.updateMatrix(); o.mesh.setMatrixAt(o.inst, dummy.matrix); o.mesh.instanceMatrix.needsUpdate = true; }

  // ---- tornado funnel (custom shader: twist, lean, squash) ----
  const funnelGeo = (() => {
    const pts = [];
    const N = GRAPHICS.funnelRows;
    for (let i = 0; i <= N; i++) { const y = i / N; const r = 0.35 + 0.65 * Math.pow(y, 0.75) + 0.9 * Math.pow(y, 3); pts.push(new THREE.Vector2(r, y)); }
    const g = new THREE.LatheGeometry(pts, GRAPHICS.funnelSegments);
    return g;
  })();
  const funnelUniforms = { uTime: { value: 0 }, uLean: { value: new THREE.Vector2(0, 0) }, uSquash: { value: 1 }, uScale: { value: new THREE.Vector2(1, 1) }, uColor: { value: new THREE.Color(0xa99c8a) }, uCore: { value: new THREE.Color(0x6a5f55) }, uAlpha: { value: 0.66 }, uSky: { value: new THREE.Color(0xb8cbdc) }, uFog: { value: new THREE.Vector2(70, 400) }, uSeed: { value: 0 } };
  const funnelMat = new THREE.ShaderMaterial({
    uniforms: funnelUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime; uniform vec2 uLean; uniform float uSquash; uniform vec2 uScale;
      varying float vY; varying vec2 vRing; varying float vFacing; varying float vFogDepth;
      void main(){
        vec3 p = position; // unit funnel: radius ~ [0.35,1.9], y in [0,1]
        vY = p.y; vRing = normalize(p.xz); float vA = atan(p.z, p.x);
        float twist = uTime * 1.6 - p.y * 4.0;
        float wob = 0.06 * sin(vA * 3.0 + twist) + 0.04 * sin(vA * 5.0 - twist * 1.7 + p.y * 9.0);
        p.xz *= (1.0 + wob) * uScale.x / max(uSquash, 0.2);
        p.y *= uScale.y * uSquash;
        // top lags behind the base (lean), quadratic with height
        p.xz += uLean * (p.y / max(uScale.y, 0.001)) * (p.y / max(uScale.y, 0.001));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vFacing = abs(dot(normalize(normalMatrix * normal),normalize(-mv.xyz)));
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; uniform vec3 uCore; uniform float uAlpha; uniform vec3 uSky; uniform vec2 uFog;
      varying float vY; varying vec2 vRing; varying float vFacing; varying float vFogDepth;
      void main(){
        float vA = atan(vRing.y,vRing.x); // interpolate direction, not the angle across its wrap seam
        // Horizontal streaks that spin around the funnel (not stripes running up it). The rings are broken into long dashes
        // that travel sideways with the spin, which is what reads as rotation; a spinning helix would look like climbing.
        // Angles only appear as whole-number multiples, so the pattern is continuous around the funnel.
        float spin = vA + uTime * 2.6; // same direction as the funnel's twist, a little faster
        // thin crisp rings (sharpened sine peaks), each broken into long dashes with its own offset
        float ringArg = vY * 34.0 + sin(spin * 2.0) * 0.35;
        float ringId = floor((ringArg + 1.5707963) / 6.2831853); // changes at the dark gap between rings
        float offs = fract(sin(ringId * 12.9898) * 43758.5453) * 6.2831853;
        float line = pow(0.5 + 0.5 * sin(ringArg), 6.0) * smoothstep(0.3, 0.6, 0.5 + 0.5 * sin(spin * 2.0 + offs));
        // a second set of finer, fainter lines between them
        float ringArg2 = vY * 71.0 - sin(spin * 3.0) * 0.4 + 1.1;
        float ringId2 = floor((ringArg2 + 1.5707963) / 6.2831853);
        float offs2 = fract(sin(ringId2 * 78.233 + 3.1) * 43758.5453) * 6.2831853;
        float line2 = pow(0.5 + 0.5 * sin(ringArg2), 10.0) * smoothstep(0.4, 0.7, 0.5 + 0.5 * sin(spin * 3.0 - offs2));
        float dust = max(line, line2 * 0.6);
        float dens = mix(0.18, 1.0, smoothstep(0.04, 0.5, dust));
        float edge = 1.0 - smoothstep(0.75, 1.0, vY);
        float base = smoothstep(0.0, 0.06, vY);
        vec3 col = mix(uCore, uColor, 0.48 + dust * 0.32);
        col = mix(col, uColor * 1.15, pow(vY, 2.0) * 0.5);
        float f = clamp((vFogDepth - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
        col = mix(col, uSky, f);
        float silhouette = smoothstep(0.0,0.28,vFacing);
        gl_FragColor = vec4(col, uAlpha * dens * edge * base * silhouette);
      }`,
  });
  const funnel = new THREE.Mesh(funnelGeo, funnelMat); funnel.frustumCulled = false; funnel.renderOrder = 5; scene.add(funnel);
  // inner core (denser, darker)
  const coreMat = funnelMat.clone(); coreMat.uniforms = THREE.UniformsUtils.clone(funnelUniforms); coreMat.uniforms.uAlpha.value = 0.92; coreMat.uniforms.uColor.value = new THREE.Color(0x7d7267); coreMat.uniforms.uCore.value = new THREE.Color(0x4a423b);
  const core = new THREE.Mesh(funnelGeo, coreMat); core.frustumCulled = false; core.renderOrder = 4; scene.add(core);
  // dust skirt at the base
  const skirtTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, 'rgba(120,105,85,0.55)'); gr.addColorStop(0.5, 'rgba(120,105,85,0.28)'); gr.addColorStop(1, 'rgba(120,105,85,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); const prng = mulberry32(3); g.fillStyle = 'rgba(80,70,55,0.35)'; for (let i = 0; i < 90; i++) { const a = prng() * TAU, r = 30 + prng() * 90; g.beginPath(); g.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 3 + prng() * 9, 0, TAU); g.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: skirtTex, transparent: true, depthWrite: false, fog: true }));
  skirt.rotation.x = -Math.PI / 2; skirt.renderOrder = 3; scene.add(skirt);
  // shadow-catching blob under the funnel (a tornado casts a soft dark patch)
  const blob = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.05; blob.renderOrder = 2; scene.add(blob);

  // ---- debris ring ----
  const RN = T.DEBRIS_RING_N;
  const streakAxis = new THREE.Vector3(0, 0, 1), streakDir = new THREE.Vector3(); // chips and debris drawn as streaks
  const ring = new THREE.InstancedMesh(new THREE.SphereGeometry(.65,8,6), new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.9 }), RN);
  ring.castShadow = false; ring.frustumCulled = false; scene.add(ring);
  const ringData = [];
  { const prng = mulberry32(77); const c = new THREE.Color(); for (let i = 0; i < RN; i++) { const h = Math.pow(prng(), 1.6); ringData.push({ h, a0: prng() * TAU, w: 0.8 + prng() * 1.4, s: 0.05 + prng() * 0.12, r: 0.9 + prng() * 1.0, spin: prng() * TAU }); const v = prng(); c.setHex(v < 0.6 ? 0x7a6a55 : v < 0.8 ? 0x5a5048 : v < 0.9 ? 0xa89a7a : [0xc93a2f, 0xe6e6e6, 0x2f74c0, 0xd8b83a][Math.floor(prng() * 4)]); ring.setColorAt(i, c); } ring.instanceColor.needsUpdate = true; }

  // ---- black hole (the form after Earth): dark core, spinning accretion disk in her color, bright lensing halo ----
  const bhGroup = new THREE.Group(); bhGroup.visible = false; scene.add(bhGroup);
  const bhCore = new THREE.Mesh(new THREE.SphereGeometry(1,64,40), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })); bhCore.renderOrder = 6; bhGroup.add(bhCore);
  const bhUniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x3a86ff) }, uHot: { value: new THREE.Color(0xfff2d0) }, uAlpha: { value: 1 } };
  const bhDiskMat = new THREE.ShaderMaterial({
    uniforms: bhUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; uniform vec3 uHot; uniform float uAlpha; varying vec2 vP;
      void main(){
        float r = length(vP); float a = atan(vP.y, vP.x);
        // unit disk: inner edge 0.3, outer 1.0; swirl bands drift inward with time
        float inner = smoothstep(0.28, 0.36, r); float outer = 1.0 - smoothstep(0.62, 1.0, r);
        float band = 0.55 + 0.45 * sin(a * 3.0 - uTime * 2.2 + r * 18.0);
        float band2 = 0.6 + 0.4 * sin(a * 7.0 + uTime * 3.7 - r * 30.0);
        float heat = 1.0 - smoothstep(0.3, 0.75, r);
        vec3 col = mix(uColor, uHot, heat * heat) * (0.55 + 0.6 * band * band2);
        gl_FragColor = vec4(col, uAlpha * inner * outer * (0.5 + 0.5 * band));
      }`,
  });
  const bhDisk = new THREE.Mesh(new THREE.CircleGeometry(1, 64), bhDiskMat); bhDisk.rotation.x = -Math.PI / 2 + 0.28; bhDisk.renderOrder = 7; bhDisk.frustumCulled = false; bhGroup.add(bhDisk);
  const bhHaloMat = new THREE.ShaderMaterial({
    uniforms: bhUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uColor; uniform vec3 uHot; uniform float uAlpha; varying vec2 vP;
      void main(){ float r = length(vP); float ring = exp(-pow((r - 0.5) * 9.0, 2.0)); float glow = exp(-pow(r * 2.0, 2.0)) * 0.35; gl_FragColor = vec4(mix(uColor, uHot, ring) * (ring + glow), uAlpha * (ring * 0.9 + glow)); }`,
  });
  const bhHalo = new THREE.Mesh(new THREE.CircleGeometry(1, 48), bhHaloMat); bhHalo.renderOrder = 8; bhHalo.frustumCulled = false; bhGroup.add(bhHalo);
  // the last goal's hot orange disk and photon ring (its black core is the goal's own instance, so they follow it in)
  const holeUniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xff7a2a) }, uHot: { value: new THREE.Color(0xfff4d8) }, uAlpha: { value: 1 } };
  const holeGroup = new THREE.Group(); holeGroup.visible = false; scene.add(holeGroup);
  const holeDiskMat = bhDiskMat.clone(); holeDiskMat.uniforms = holeUniforms;
  const holeDisk = new THREE.Mesh(new THREE.CircleGeometry(1, 96), holeDiskMat); holeDisk.rotation.x = -Math.PI / 2 + 0.32; holeDisk.renderOrder = 7; holeDisk.frustumCulled = false; holeGroup.add(holeDisk);
  const holeRingMat = bhHaloMat.clone(); holeRingMat.uniforms = holeUniforms;
  const holeRing = new THREE.Mesh(new THREE.CircleGeometry(1, 64), holeRingMat); holeRing.renderOrder = 8; holeRing.frustumCulled = false; holeGroup.add(holeRing);
  const holeInvQ = new THREE.Quaternion();
  function updateFinalHole(G) {
    const o = finalHoleObj; holeGroup.visible = !!o && o.state !== 2 && envId === 'universe' && !G.overview;
    if (!holeGroup.visible) return;
    o.mesh.getMatrixAt(o.inst, M4); M4.decompose(holeGroup.position, holeGroup.quaternion, holeGroup.scale);
    const R = o.type.size * FINAL_HOLE_R, cy = o.type.size * 0.4;
    const k = (G.swallowT > 0 || G.swallowed) ? G.swallowK : 0, grow = 1 + 0.35 * k; // it swells as it pulls her in
    holeDisk.position.set(0, cy, 0); holeDisk.scale.setScalar(R * 2.3 * grow); // ends well short of the level start holeDisk.rotation.z = -G.tick * DT * 0.5 * (1 + 2 * k);
    holeRing.position.set(0, cy, 0); holeRing.scale.setScalar(R * 2.16 * grow);
    holeRing.quaternion.copy(holeInvQ.copy(holeGroup.quaternion).invert()).multiply(camera.quaternion);
    holeUniforms.uTime.value = G.tick * DT * 1.2 * (1 + 2 * k);
  }
  let form = 'tornado', transformT = 0;
  const bhCenter = new THREE.Vector3();
  function setForm(f) {
    if (f === form) return;
    const wasTornado = form === 'tornado';
    form = f;
    const bh = form === 'blackhole';
    bhGroup.visible = bh; funnel.visible = !bh; core.visible = !bh;
    transformT = (bh && wasTornado) ? T.BH_TRANSFORM_S : 0;
  }

  // ---- burst particles (dust, chips, confetti) ----
  const PN = T.PARTICLE_POOL;
  const parts = new THREE.InstancedMesh(new THREE.SphereGeometry(.65,8,6), new THREE.MeshStandardMaterial({ roughness: 1 }), PN);
  parts.frustumCulled = false; parts.castShadow = false; scene.add(parts);
  const P = { x: new Float32Array(PN), y: new Float32Array(PN), z: new Float32Array(PN), vx: new Float32Array(PN), vy: new Float32Array(PN), vz: new Float32Array(PN), life: new Float32Array(PN), max: new Float32Array(PN), s: new Float32Array(PN), spin: new Float32Array(PN), orbit: new Uint8Array(PN), next: 0 };
  const fxRng = mulberry32(4242);
  const pc = new THREE.Color();
  function emitParticles(n, x, y, z, spread, up, size, color, orbit, life) {
    for (let k = 0; k < n; k++) {
      const i = P.next; P.next = (P.next + 1) % PN;
      const a = fxRng() * TAU, sp = spread * (0.4 + fxRng());
      P.x[i] = x + Math.cos(a) * fxRng() * size * 2; P.y[i] = y; P.z[i] = z + Math.sin(a) * fxRng() * size * 2;
      P.vx[i] = Math.cos(a) * sp; P.vz[i] = Math.sin(a) * sp; P.vy[i] = up * (0.5 + fxRng());
      P.max[i] = P.life[i] = life * (0.6 + fxRng() * 0.8); P.s[i] = size * (0.5 + fxRng()); P.spin[i] = fxRng() * TAU; P.orbit[i] = orbit ? 1 : 0;
      if (Array.isArray(color)) pc.setHex(color[Math.floor(fxRng() * color.length)]); else pc.setHex(color);
      parts.setColorAt(i, pc);
    }
    parts.instanceColor.needsUpdate = true;
  }
  function updateParticles(dt, tx, tz, fr, fh) {
    for (let i = 0; i < PN; i++) {
      if (P.life[i] <= 0) { M4.makeScale(0, 0, 0); parts.setMatrixAt(i, M4); continue; }
      P.life[i] -= dt;
      if (P.orbit[i] && form === 'blackhole') {
        // fall into the disk: fast orbit, steady inward pull, flatten to the disk plane, gone at the horizon
        const dx = P.x[i] - tx, dz = P.z[i] - tz; const d = Math.hypot(dx, dz) + 1e-4;
        const tang = 14 * fr / (0.4 + d / fr);
        P.vx[i] += (-dz / d * tang - dx / d * 6 * fr) * dt * 3; P.vz[i] += (dx / d * tang - dz / d * 6 * fr) * dt * 3;
        P.vy[i] += (fr * T.BH_Y - P.y[i]) * 6 * dt - P.vy[i] * 3 * dt;
        P.vx[i] *= 0.97; P.vz[i] *= 0.97;
        if (d < fr * T.BH_CORE) P.life[i] = 0;
      } else if (P.orbit[i]) {
        // spiral up the funnel
        const dx = P.x[i] - tx, dz = P.z[i] - tz; const d = Math.hypot(dx, dz) + 1e-4;
        const tang = 9 / (0.5 + d / fr);
        P.vx[i] += (-dz / d * tang - dx / d * 3) * dt * 4; P.vz[i] += (dx / d * tang - dz / d * 3) * dt * 4; P.vy[i] += 4 * dt;
        P.vx[i] *= 0.98; P.vz[i] *= 0.98;
      } else { P.vy[i] -= 9.8 * dt * 0.6; P.vx[i] *= 0.985; P.vz[i] *= 0.985; if (P.y[i] < 0.05 && P.vy[i] < 0) { P.vy[i] = 0; P.y[i] = 0.05; } }
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
      const t = P.life[i] / P.max[i];
      const s = P.s[i] * (0.3 + 0.7 * t);
      dummy.position.set(P.x[i], P.y[i], P.z[i]);
      if (P.orbit[i] && form !== 'blackhole') {
        // debris whirling round the tornado: a thin streak along its motion, so the funnel reads as spinning lines
        const sp = Math.hypot(P.vx[i], P.vz[i]) + 1e-4; // horizontal motion only: the streaks lie flat and spin round
        streakDir.set(P.vx[i] / sp, 0, P.vz[i] / sp); dummy.quaternion.setFromUnitVectors(streakAxis, streakDir);
        dummy.scale.set(s * 0.2, s * 0.2, s * (1.4 + Math.min(sp * 0.25, 3.5)));
      } else { dummy.rotation.set(P.spin[i] + P.life[i] * 5, P.spin[i], 0); dummy.scale.setScalar(s); }
      dummy.updateMatrix(); parts.setMatrixAt(i, dummy.matrix);
    }
    parts.instanceMatrix.needsUpdate = true;
    void fh;
  }

  // ---- stars (space stage) ----
  const stars = (() => {
    const N = 2600; const pos = new Float32Array(N * 3); const prng = mulberry32(31);
    for (let i = 0; i < N; i++) { const u = prng() * 2 - 1, a = prng() * TAU, r = Math.sqrt(1 - u * u); pos[i * 3] = r * Math.cos(a) * 30000; pos[i * 3 + 1] = Math.abs(u) * 30000 + 200; pos[i * 3 + 2] = r * Math.sin(a) * 30000; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false })); m.visible = false; m.frustumCulled = false; scene.add(m); return m;
  })();
  // galaxy: a denser field plus soft nebula haze; universe: sparse far specks
  const haze = (() => {
    const N = 90; const pos = new Float32Array(N * 3), col = new Float32Array(N * 3); const prng = mulberry32(53); const c = new THREE.Color(); const pal = [0x9b6bd6, 0x2ec4b6, 0xff5fa2, 0x3a86ff, 0xff9a4a];
    for (let i = 0; i < N; i++) { const u = prng() * 0.9, a = prng() * TAU, r = Math.sqrt(1 - u * u); pos[i * 3] = r * Math.cos(a) * 30000; pos[i * 3 + 1] = u * 30000 + 800; pos[i * 3 + 2] = r * Math.sin(a) * 30000; c.setHex(pal[i % pal.length]).multiplyScalar(0.35); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const tex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(cv); return t; })();
    const m = new THREE.Points(g, new THREE.PointsMaterial({ vertexColors: true, size: 260, sizeAttenuation: false, fog: false, map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.visible = false; m.frustumCulled = false; scene.add(m); return m;
  })();
  const stars2 = (() => {
    const N = 5000; const pos = new Float32Array(N * 3); const prng = mulberry32(37);
    for (let i = 0; i < N; i++) { const u = prng() * 2 - 1, a = prng() * TAU, r = Math.sqrt(1 - u * u); pos[i * 3] = r * Math.cos(a) * 30000; pos[i * 3 + 1] = Math.abs(u) * 30000 + 200; pos[i * 3 + 2] = r * Math.sin(a) * 30000; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.4, sizeAttenuation: false, fog: false })); m.visible = false; m.frustumCulled = false; scene.add(m); return m;
  })();
  // A distant, non-interactive layer stays behind every space scene, including overviews.
  const deepStars = (() => {
    const count=1600,pos=new Float32Array(count*3),col=new Float32Array(count*3);
    const rnd=mulberry32(9128),color=new THREE.Color();
    const palette=[0xddeaff,0xa8d9ff,0xffe4bd,0xc9baff];
    for(let i=0;i<count;i++){
      pos[i*3]=(rnd()-.5)*18000;pos[i*3+1]=-240-rnd()*50;pos[i*3+2]=(rnd()-.5)*18000;
      color.setHex(palette[i%palette.length]).multiplyScalar(.2+rnd()*.35);
      col[i*3]=color.r;col[i*3+1]=color.g;col[i*3+2]=color.b;
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));
    const points=new THREE.Points(geo,new THREE.PointsMaterial({vertexColors:true,size:1.3,sizeAttenuation:false,fog:false,depthWrite:false,transparent:true,opacity:.75}));
    points.frustumCulled=false;points.visible=false;scene.add(points);return points;
  })();
  const cosmicScene = new THREE.Group(); scene.add(cosmicScene);
  const orbitGuides=[];
  function clearCosmicScene() {
    for(const child of [...cosmicScene.children]) {
      cosmicScene.remove(child); child.geometry?.dispose(); child.material?.dispose();
    }
    orbitGuides.length=0;
  }
  function pointsCloud(positions, colors, size=2) {
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const p=new THREE.Points(g,new THREE.PointsMaterial({vertexColors:true,size,sizeAttenuation:false,transparent:true,opacity:0.72,depthWrite:false,fog:false}));p.frustumCulled=false;cosmicScene.add(p);return p;
  }
  function guide(radius,cx,cz,color,opacity=0.3) {
    const pts=[];for(let i=0;i<192;i++){const a=i/192*TAU;pts.push(new THREE.Vector3(cx+Math.cos(a)*radius,0,cz+Math.sin(a)*radius));}
    const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false,fog:false}));cosmicScene.add(line);return line;
  }
  function label(text,x,z,color='#a8b8d0',scale=95) {
    const map=art.texture('label:'+text,(c,n)=>{c.fillStyle=color;c.font='500 23px -apple-system, sans-serif';c.textAlign='center';c.fillText(text,n/2,n/2+8);},256);
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,depthWrite:false,depthTest:false,fog:false}));s.position.set(x,75,z);s.scale.set(scale*4,scale*4,1);s.userData.labelScale=scale;cosmicScene.add(s);return s;
  }
  function buildCosmicScene() {
    clearCosmicScene();cosmicScene.visible=stageId!=='town';
    if(stageId==='town')return;
    const rnd=mulberry32(30491),positions=[],colors=[];const c=new THREE.Color();
    if(stageId==='solar') {
      const [cx,cz]=TUNING.SUN_POS;
      for(const orbit of SOLAR_ORBITS) {
        const line=guide(orbit.radius,cx,cz,orbit.color);
        const o=objs.find(o=>o.type.id===orbit.id);
        const name=label(orbit.name,o.x,o.z,orbit.color,65);name.userData.body=o;orbitGuides.push({line,o,label:name});
      }
      const earth=objs.find(o=>o.type.id==='earth');
      const moonGuide=guide(145,0,0,0x6c8fbb,0.26);orbitGuides.push({line:moonGuide,parent:earth});
      for(const [inner,outer,count,tint] of [[1480,1580,2400,0xb59b7b],[3150,3650,3900,0x9fb8ca]]) {
        for(let i=0;i<count;i++){const a=rnd()*TAU,r=inner+rnd()*(outer-inner);positions.push(cx+Math.cos(a)*r,(rnd()-0.5)*35,cz+Math.sin(a)*r);c.setHex(tint).multiplyScalar(0.35+rnd()*0.65);colors.push(c.r,c.g,c.b);}
      }
      pointsCloud(positions,colors,1.5);
      label('ASTEROID BELT',cx-1520,cz,'#a79a89',65);label('KUIPER BELT',cx,cz+3490,'#96b5ca',90);
      const sunName=label('SUN',cx,cz,'#ffce83',55);sunName.position.y=1100;sunName.userData.body=objs.find(o=>o.type.id==='sun');
      const corona=new THREE.Mesh(new THREE.PlaneGeometry(1900,1900),new THREE.MeshBasicMaterial({map:art.star('sun'),transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false}));corona.rotation.x=-Math.PI/2;corona.position.set(cx,-3,cz);corona.userData.sun=objs.find(o=>o.type.id==='sun');cosmicScene.add(corona);
    } else if(stageId==='galaxy') {
      const [cx,cz]=TUNING.GALAXY_CORE_POS;
      const disk=new THREE.Mesh(new THREE.PlaneGeometry(10500,10500),new THREE.MeshBasicMaterial({map:art.galaxy('barred'),transparent:true,opacity:1,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,fog:false}));disk.rotation.x=-Math.PI/2;disk.position.set(cx,-70,cz);disk.userData.galaxyBackdrop=true;cosmicScene.add(disk);
      for(let i=0;i<12500;i++) {
        const r=Math.pow(rnd(),0.75)*4600,a=(i%2)*Math.PI+Math.log(1+r/780)*2.25+(rnd()+rnd()+rnd()-1.5)*(.25+r/9000);
        positions.push(Math.cos(a)*r,(rnd()-0.5)*90,Math.sin(a)*r*0.85);
        c.setHex(i%17===0?0xf08ab9:i%3?0x7ccfff:0xffdfab).multiplyScalar(0.35+rnd()*0.55);colors.push(c.r,c.g,c.b);
      }
      const spiralStars=pointsCloud(positions,colors,1.1);spiralStars.position.set(cx,0,cz);spiralStars.userData.galaxyStars=true;
      label('GALACTIC CENTER',cx,cz-600,'#eed9b8',90);
    } else {
      // Many colored, individual galaxies are visible behind the edible galaxies.
      // The background meshes have no game objects and can never be absorbed.
      const nodes=[];for(let i=0;i<30;i++)nodes.push([Math.cos(i*2.4)*(1200+rnd()*4600),Math.sin(i*2.4)*(1200+rnd()*4600)-1100]);
      const distant=[];
      for(let i=0;i<nodes.length;i++) {
        const a=nodes[i],near=nodes.map((b,j)=>({b,j,d:Math.hypot(a[0]-b[0],a[1]-b[1])})).filter(x=>x.j>i).sort((a,b)=>a.d-b.d).slice(0,2);
        for(const {b} of near) {
          const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),bend=(rnd()-.5)*length*.5;
          for(let k=0;k<450;k++) {const t=rnd(),spread=120+Math.sin(t*Math.PI)*230,curve=Math.sin(t*Math.PI)*bend,offset=(rnd()+rnd()-1)*spread;positions.push(lerp(a[0],b[0],t)-dz/length*(curve+offset),(rnd()-0.5)*160,lerp(a[1],b[1],t)+dx/length*(curve+offset));c.setHex(galaxyColors[i%galaxyColors.length]).multiplyScalar(0.12+rnd()*0.28);colors.push(c.r,c.g,c.b);}
        }
        distant.push({x:a[0],z:a[1],size:600+rnd()*700,kind:i%4,color:galaxyColors[i%galaxyColors.length],angle:rnd()*TAU});
      }
      for(let i=0;i<70;i++){
        const a=rnd()*TAU,r=500+Math.sqrt(rnd())*4700;
        distant.push({x:Math.cos(a)*r,z:Math.sin(a)*r-1100,size:320+rnd()*650,kind:i%4,color:galaxyColors[(i*5+2)%galaxyColors.length],angle:rnd()*TAU});
      }
      for(let kind=0;kind<4;kind++){
        const entries=distant.filter(g=>g.kind===kind),name=['spiral','elliptical','barred','irregular'][kind];
        const geometry=new THREE.PlaneGeometry(1,1);geometry.rotateX(-Math.PI/2);
        const material=new THREE.MeshBasicMaterial({map:art.galaxy(name,'neutral'),transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,fog:false});
        const mesh=new THREE.InstancedMesh(geometry,material,entries.length);mesh.frustumCulled=false;
        entries.forEach((g,i)=>{dummy.position.set(g.x,-60,g.z);dummy.rotation.set(0,g.angle,0);dummy.scale.setScalar(g.size);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,c.setHex(g.color));});
        mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;cosmicScene.add(mesh);
      }
      pointsCloud(positions,colors,1.3);
    }
  }
  let shadowsOn = true, stageId = 'town', envId = 'town';
  const dustColor = new THREE.Color(0xa99c8a), dustCore = new THREE.Color(0x6a5f55), tmpC = new THREE.Color();
  function setColor(colorId) {
    const hex = (T.COLORS[colorId] !== undefined) ? T.COLORS[colorId] : T.COLORS.blue;
    tmpC.setHex(hex);
    funnelUniforms.uColor.value.copy(dustColor).lerp(tmpC, T.COLOR_MIX);
    funnelUniforms.uCore.value.copy(dustCore).lerp(tmpC, T.COLOR_MIX * 0.6);
    coreMat.uniforms.uColor.value.copy(dustColor).lerp(tmpC, T.COLOR_MIX * 0.8);
    coreMat.uniforms.uCore.value.copy(dustCore).lerp(tmpC, T.COLOR_MIX * 0.5);
    bhUniforms.uColor.value.setHex(hex);
    // a share of the orbiting chips take the color too
    const prng = mulberry32(77 + 1); const c = new THREE.Color();
    for (let i = 0; i < RN; i++) { const v = prng(); if (v < 0.35) { c.setHex(hex).offsetHSL(0, 0, (prng() - 0.5) * 0.2); ring.setColorAt(i, c); } }
    ring.instanceColor.needsUpdate = true;
  }
  const ENVS = { town: { sky: 0xb8cbdc }, solar: { sky: 0x05060f }, galaxy: { sky: 0x08051a }, universe: { sky: 0x020208 } };
  // Discovery worlds: snow and candy towns get their own ground; every other town keeps the grass texture.
  const groundTint = { snow: 0xf1f6fb, candy: 0xf7cfe2 };
  function setTheme(theme) {
    const g = themeGround(theme), m = ground.material;
    const wantMap = g ? null : gtex, wantColor = g ? groundTint[g] : 0xe6e6d6;
    if (m.map !== wantMap) { m.map = wantMap; m.needsUpdate = true; }
    m.color.setHex(wantColor);
    // additive light vanishes on a white or pink ground, so light grounds get a solid orange column instead
    const solid = !!g; beaconMat.blending = solid ? THREE.NormalBlending : THREE.AdditiveBlending;
    beaconMat.uniforms.uSolid.value = solid ? 1 : 0; beaconMat.uniforms.uColor.value.setHex(solid ? 0xff8a1a : 0xffd447);
  }
  function setEnvironment(stage, env) {
    stageId = stage; envId = env || (stage === 'town' ? 'town' : 'solar');
    const space = envId !== 'town';
    townGroup.visible = !space; skyDome.visible = !space; skirt.visible = !space; blob.visible = !space;
    stars.visible = envId === 'solar' || envId === 'galaxy'; stars2.visible = false; haze.visible = false; deepStars.visible=space;
    stars.material.size = envId === 'universe' ? 1.2 : 2.2; if (envId === 'universe') stars.visible = true;
    shadowsOn = !space; renderer.shadowMap.enabled = !space; sun.castShadow = !space;
    scene.background = space ? new THREE.Color(ENVS[envId].sky) : skyColor;
    scene.fog.color.setHex(ENVS[envId].sky);
    funnelUniforms.uSky.value = scene.fog.color; coreMat.uniforms.uSky.value = scene.fog.color;
    hemi.intensity = space ? 0.35 : 1.1; sun.intensity = space ? 3.2 : 2.9;
  }

  // ---- sky dome (gradient) ----
  let skyDome;
  {
    const g = new THREE.SphereGeometry(1900, 16, 8);
    const col = new Float32Array(g.attributes.position.count * 3); const top = new THREE.Color(0x6f9ccf), hor = new THREE.Color(0xd9e2ea);
    for (let i = 0; i < g.attributes.position.count; i++) { const y = g.attributes.position.getY(i) / 1900; const c = hor.clone().lerp(top, clamp(y * 1.6, 0, 1)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })); sky.renderOrder = -10; scene.add(sky); skyDome = sky;
  }

  // ---- per-frame update from game state ----
  const shakeRng = mulberry32(9);
  let prevLeanX = 0, prevLeanZ = 0;
  let width = 1, height = 1;
  let overview=false;
  const frustum = new THREE.Frustum(); const projView = new THREE.Matrix4(); const sph = new THREE.Sphere();
  function resize(w, h) { width = w; height = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

  function update(G, rdt) {
    updateBeacon(G);
    overview=!!G.overview;
    const fr = G.funnelR(), fh = fr * T.FUNNEL_HEIGHT;
    // camera
    const shakeAmp = G.shake * G.camDist;
    const sx = (shakeRng() * 2 - 1) * shakeAmp, sy = (shakeRng() * 2 - 1) * shakeAmp, sz = (shakeRng() * 2 - 1) * shakeAmp;
    camera.position.set(G.camPos.x + sx, G.camPos.y + sy, G.camPos.z + sz);
    camera.fov = T.FOV + G.fovPunch; camera.updateProjectionMatrix();
    camera.lookAt(G.focus.x + sx * 0.5, 0, G.focus.z + sz * 0.5);
    camera.rotation.z += (shakeRng() * 2 - 1) * G.shake * 0.6;
    if(G.overview&&G.stage!=='town') {
      const center=G.stage==='solar'?TUNING.SUN_POS:G.stage==='galaxy'?TUNING.GALAXY_CORE_POS:[0,-1100];
      const distance=(G.stage==='solar'?7900:G.stage==='galaxy'?10600:12500)*Math.max(1,1.2/camera.aspect);
      camera.position.set(center[0],distance,center[1]+distance*0.65);camera.lookAt(center[0],0,center[1]);camera.fov=50;camera.updateProjectionMatrix();
    }
    for(const o of G.orbiters) if(o.state===0)setInstance(o,o.x,0,o.z,o.ry,0,0,o.scale);
    for(const entry of orbitGuides) {
      if(entry.parent){entry.line.position.set(entry.parent.x,0,entry.parent.z);entry.line.visible=entry.parent.state===0;}
      if(entry.o){entry.label.visible=entry.o.state===0;entry.label.position.set(entry.o.x,entry.o.size*(overview&&stageId==='solar'?(solarOverviewScale[entry.o.type.id]||1):1)+45,entry.o.z);}
    }
    for(const child of cosmicScene.children){
      if(child.userData.labelScale){child.visible=overview&&(!child.userData.body||child.userData.body.state===0);child.scale.setScalar((G.stage==='solar'?1250:1850)*Math.min(1.2,Math.max(1,1.2/camera.aspect)));}
      if(child.userData.sun)child.visible=child.userData.sun.state===0;
      if(child.userData.galaxyBackdrop){child.material.opacity=overview?1:Math.max(.22,clamp((G.camDist-1000)/5000,0,.55));child.rotation.z+=rdt*.025;}
      if(child.userData.galaxyStars)child.rotation.y+=rdt*.025;
    }
    if (envId !== 'town') { const fogDistance=overview?camera.position.y:G.camDist;scene.fog.near = fogDistance * 40; scene.fog.far = fogDistance * 80; } else { scene.fog.near = G.camDist * T.FOG_NEAR_K; scene.fog.far = G.camDist * T.FOG_FAR_K; }
    funnelUniforms.uFog.value.set(scene.fog.near, scene.fog.far); coreMat.uniforms.uFog.value.set(scene.fog.near, scene.fog.far);
    // sun + shadow frustum follow the tornado, sized to the view
    const sr = Math.max(30, G.camDist * 1.6);
    sun.position.set(G.pos.x + sunDir.x * sr * 2, sunDir.y * sr * 2, G.pos.z + sunDir.z * sr * 2);
    sun.target.position.set(G.pos.x, 0, G.pos.z - G.camDist * 0.3); sun.target.updateMatrixWorld();
    const sc = sun.shadow.camera; sc.left = -sr; sc.right = sr; sc.top = sr; sc.bottom = -sr; sc.near = 1; sc.far = sr * 5; sc.updateProjectionMatrix();

    // funnel: position, lean (top lags the base), squash on acceleration / hard turns
    const ms = T.MAX_SPEED * G.speedScale();
    const leanTx = -G.vel.x / ms * fr * 2.0 - G.acc.x / (T.ACCEL * G.speedScale()) * fr * 1.0 + G.intent.x * fr * 0.9;
    const leanTz = -G.vel.z / ms * fr * 2.0 - G.acc.z / (T.ACCEL * G.speedScale()) * fr * 1.0 + G.intent.z * fr * 0.9;
    const lk = 1 - Math.exp(-14 * rdt);
    prevLeanX += (leanTx - prevLeanX) * lk; prevLeanZ += (leanTz - prevLeanZ) * lk;
    const accMag = Math.hypot(G.acc.x, G.acc.z) / (T.ACCEL * G.speedScale());
    const squash = 1 - 0.18 * clamp(accMag, 0, 1) + 0.06 * Math.sin(G.tick * 0.35);
    for (const u of [funnelUniforms, coreMat.uniforms]) { u.uTime.value = G.tick * DT * T.SPIN; u.uLean.value.set(prevLeanX, prevLeanZ); u.uSquash.value = squash; u.uScale.value.set(fr, fh); }
    coreMat.uniforms.uScale.value.set(fr * 0.55, fh * 0.9);
    funnel.position.set(G.pos.x, 0, G.pos.z); core.position.set(G.pos.x, 0, G.pos.z);
    const isBH = form === 'blackhole';
    if (isBH) {
      // collapse-in on liftoff: the funnel shrinks into the core while the disk spins up
      if (transformT > 0) transformT = Math.max(0, transformT - rdt);
      // 5-min ending: her black hole shrinks away as the big one pulls her in
      const sw = (G.swallowT > 0 || G.swallowed) ? Math.max(0.03, 1 - easeIn(G.swallowK)) : 1;
      const k = 1 - transformT / T.BH_TRANSFORM_S; const grow = easeOut(k) * sw;
      funnel.visible = transformT > 0; core.visible = transformT > 0;
      if (transformT > 0) { const sq = 1 - k; for (const u of [funnelUniforms, coreMat.uniforms]) { u.uScale.value.set(fr * sq, fh * (0.2 + 0.8 * sq)); u.uAlpha.value = 0.66 * sq; } }
      bhCenter.set(G.pos.x + prevLeanX * 0.15, fr * T.BH_Y, G.pos.z + prevLeanZ * 0.15);
      bhCore.position.copy(bhCenter); bhCore.scale.setScalar(Math.max(0.001, fr * T.BH_CORE * grow));
      bhDisk.position.copy(bhCenter); bhDisk.scale.setScalar(Math.max(0.001, fr * T.BH_DISK * (0.3 + 0.7 * grow)));
      bhDisk.rotation.z = -G.tick * DT * T.SPIN * 0.9;
      bhHalo.position.copy(bhCenter); bhHalo.scale.setScalar(Math.max(0.001, fr * T.BH_CORE * 2.6 * grow)); bhHalo.quaternion.copy(camera.quaternion);
      bhUniforms.uTime.value = G.tick * DT * T.SPIN; bhUniforms.uAlpha.value = 0.6 + 0.4 * grow;
    } else { funnelUniforms.uAlpha.value = 0.66; coreMat.uniforms.uAlpha.value = 0.92; }
    updateFinalHole(G);
    // finale: fall into the core
    if (finaleK > 0) {
      const k = easeIn(clamp(finaleK, 0, 1));
      const target = isBH ? bhCenter : funnel.position;
      camera.position.lerp(target, k * 0.985); camera.fov = T.FOV + 40 * k; camera.updateProjectionMatrix(); camera.lookAt(target);
    }
    skirt.position.set(G.pos.x, 0.06, G.pos.z); skirt.scale.setScalar(fr * 7); skirt.rotation.z = G.tick * 0.05 * T.SPIN;
    blob.position.set(G.pos.x, 0.05, G.pos.z); blob.scale.setScalar(fr * 1.6);
    // debris ring (tornado: climbs the funnel; black hole: flat streaks circling the disk, fastest at the inner edge)
    const rt = G.tick * DT * T.SPIN;
    for (let i = 0; i < RN; i++) {
      const d = ringData[i];
      let a, rr, y, lx, lz;
      if (isBH) {
        const orb = 0.9 + 2.6 * d.h; a = d.a0 - rt * d.w * (6 / (0.4 + orb)); rr = fr * orb * (1 + 0.06 * Math.sin(rt * 4 + d.a0));
        y = fr * T.BH_Y + Math.sin(rt * 3 + d.spin) * 0.08 * fr - rr * 0.28 * Math.sin(a); lx = 0; lz = 0;
      } else {
        a = d.a0 + rt * d.w * (5.5 / (0.6 + d.h * 2));
        rr = fr * d.r * (0.45 + 1.4 * d.h) * (1 + 0.15 * Math.sin(rt * 3 + d.a0));
        y = d.h * fh * 0.85 + 0.2 + Math.sin(rt * 2 + d.spin) * 0.3 * fr;
        lx = prevLeanX * d.h * d.h; lz = prevLeanZ * d.h * d.h;
      }
      dummy.position.set(G.pos.x + Math.cos(a) * rr + lx, y, G.pos.z + Math.sin(a) * rr + lz);
      const cs = d.s * (0.5 + Math.pow(fr, 0.8) * 0.8);
      if (isBH) { dummy.rotation.set(rt * 3 + d.spin, a, d.spin); dummy.scale.setScalar(cs); }
      else {
        // around the tornado each chip is a thin horizontal streak lying along its orbit: spinning lines, not balls
        streakDir.set(-Math.sin(a), 0, Math.cos(a)); dummy.quaternion.setFromUnitVectors(streakAxis, streakDir);
        dummy.scale.set(cs * 0.24, cs * 0.24, cs * (2.2 + 1.2 * d.w));
      }
      dummy.updateMatrix(); ring.setMatrixAt(i, dummy.matrix);
    }
    ring.instanceMatrix.needsUpdate = true;
    // absorbing objects: anticipation (lift + shake), then spiral in, shrink, tumble
    for (const o of G.absorbing) {
      const t = o.absorbT, ant = T.SPIRAL_ANTICIPATION;
      let x, y, z, s, rx, rz;
      if (t < ant) { const k = t / ant; x = o.startX + Math.sin(G.tick * 1.3) * 0.06 * o.size; z = o.startZ + Math.cos(G.tick * 1.7) * 0.06 * o.size; y = easeOut(k) * o.size * 0.35; s = o.scale * (1 + 0.12 * k); rx = k * 0.3; rz = Math.sin(G.tick * 0.9) * 0.15 * k; }
      else {
        const k = (t - ant) / (1 - ant);
        const ang = o.spiralA + easeIn(k) * TAU * 1.25 + k * 2;
        const rad = lerp(o.spiralR, fr * (isBH ? 0.25 : 0.4), easeIn(k));
        x = G.pos.x + Math.cos(ang) * rad; z = G.pos.z + Math.sin(ang) * rad; y = isBH ? lerp(o.size * 0.35, fr * T.BH_Y, easeIn(k)) : o.size * 0.35 + easeIn(k) * fh * 0.7; s = o.scale * (1.12 - 1.0 * easeIn(k)); rx = k * 5; rz = k * 3;
      }
      setInstance(o, x, y, z, o.ry + t * 4, rx, rz, Math.max(0.001, s));
    }
    // highlighted (newly edible) objects bob; rattled objects shake
    if (G.highlighted) for (const o of G.highlighted) { if (o.state !== 0) continue; const k = o.highlightT / T.HIGHLIGHT_S; setInstance(o, o.x, Math.abs(Math.sin(G.tick * 0.25)) * o.size * 0.15 * k, o.z, o.ry, 0, 0, o.scale * (1 + 0.06 * Math.sin(G.tick * 0.5) * k)); }
    for (const o of rattling) { const age = (G.tick * DT) - o.rattleTick; if (o.state !== 0 || age > 0.5) { if (o.state === 0) setInstance(o, o.x, 0, o.z, o.ry, 0, 0, o.scale); continue; } const k = (1 - age / 0.5) * (o.rattleAmp || 1); setInstance(o, o.x + Math.sin(age * 60) * 0.03 * o.size * k, 0, o.z, o.ry + Math.sin(age * 45) * 0.05 * k, Math.sin(age * 50) * 0.06 * k, 0, o.scale); }
    for (let i = rattling.length - 1; i >= 0; i--) if (o_age(rattling[i], G) > 0.5 || rattling[i].state !== 0) rattling.splice(i, 1);
    updateParticles(rdt, G.pos.x, G.pos.z, fr, fh);
    for(const entry of companions){entry.mesh.visible=entry.o.state!==2;entry.o.mesh.getMatrixAt(entry.o.inst,entry.mesh.matrix);entry.mesh.matrixWorldNeedsUpdate=true;}
    // visibility frustum (for telemetry)
    camera.updateMatrixWorld(); projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projView);
  }
  let finaleK = 0; // 0 = normal camera; (0,1] = falling into the core
  function setFinale(k) { finaleK = k; }
  // ---- goal beacon: a soft column of light over the level's goal, so there is always somewhere to head ----
  const beaconMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffd447) }, uAlpha: { value: 0.5 }, uSolid: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying float vY; void main(){ vY = position.y + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; uniform float uSolid; varying float vY; void main(){ float a = uAlpha * smoothstep(0.0, 0.08, vY) * pow(1.0 - vY, 1.6); gl_FragColor = vec4(uColor * mix(a, 1.0, uSolid), a); }',
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32, 1, true), beaconMat); beacon.frustumCulled = false; beacon.renderOrder = 9; beacon.visible = false; scene.add(beacon);
  function updateBeacon(G) {
    const g = G.goalRef; beacon.visible = !!g && g.state === 0 && finaleK === 0 && !G.overview;
    if (!beacon.visible) return;
    const town = G.stage === 'town', w = g.size * (town ? 0.32 : 0.45), h = g.size * (town ? 9 : 5);
    beacon.position.set(g.x, h / 2, g.z); beacon.scale.set(w, h, w);
    // brighter once the clock has super-sized her: that is when heading there matters most
    beaconMat.uniforms.uAlpha.value = (G.superSized ? 0.75 : 0.38) * (0.8 + 0.2 * Math.sin(G.tick * 0.08));
  }
  const rattling = [];
  const o_age = (o, G) => (G.tick * DT) - o.rattleTick;
  function objectVisible(o, G) { sph.center.set(o.x, o.size * 0.4, o.z); sph.radius = Math.max(o.size * 0.6, o.foot); if (!frustum.intersectsSphere(sph)) return false; const d = Math.hypot(o.x - G.camPos.x, o.z - G.camPos.z); return d < scene.fog.far * 0.9; }

  const FURNITURE = [0xf7f2ea, 0xff9ac2, 0x8a2f2f, 0x7a5230, 0x1c1c1c, 0xffffff, 0xf2d34b, 0x3f6fbf, 0x2f8f5a];
  const FURNISHED = { house: 18, bighouse: 26, barn: 14, church: 22, shed: 6, rv: 8, bus: 10 };
  // react to game events (visual side only)
  function onEvent(e, G) {
    const fr = G.funnelR();
    if (e.kind === 'absorb') {
      const o = G.objs[e.id]; hideInstance(o);
      const n = Math.round(6 + 26 * e.frac);
      emitParticles(n, G.pos.x, 0.2 + fr * 0.5, G.pos.z, 2 + e.frac * 6 * fr, 3 + 6 * fr * e.frac, 0.08 + 0.12 * e.size, o.type.colors, true, 0.8 + e.frac);
      // Playtest 1: 'go inside houses' -- buildings burst into their furniture, which spirals up the funnel
      if (FURNISHED[o.type.id]) emitParticles(FURNISHED[o.type.id], G.pos.x, 0.5, G.pos.z, 3 + fr, 4 + fr * 0.8, 0.045 * e.size + 0.25, FURNITURE, true, 1.4 + e.frac);
      if (e.firstOfTier) emitParticles(90, G.pos.x, 0.5, G.pos.z, 4 + fr * 3, 4 + fr * 2, 0.1 + e.size * 0.08, [0xffd447, 0xffffff, 0xff7a3a, 0x7ad0ff], false, 1.4);
    } else if (e.kind === 'dust') {
      const o = G.objs[e.id]; hideInstance(o);
      emitParticles(4, G.pos.x, 0.2 + fr * 0.3, G.pos.z, 1 + fr, 2 + fr, 0.06 + 0.1 * e.size, o.type.colors, true, 0.6);
    } else if (e.kind === 'sway') {
      const o = G.objs[e.id]; o.rattleTick = G.tick * DT; o.rattleAmp = 0.35; if (!rattling.includes(o)) rattling.push(o);
    } else if (e.kind === 'rattle') {
      const o = G.objs[e.id]; o.rattleTick = G.tick * DT; o.rattleAmp = 1; if (!rattling.includes(o)) rattling.push(o);
      emitParticles(5, o.x, o.size * 0.5, o.z, 1.5 + o.size * 0.3, 1.5 + o.size * 0.25, 0.05 + 0.04 * o.size, [0x8a7a62, 0xb0a48c], false, 0.7);
    } else if (e.kind === 'puff') {
      emitParticles(5, G.pos.x, 0.1, G.pos.z, 1.5 + fr * 2, 1.2 + fr * 0.8, 0.12 + fr * 0.15, [0x9a8a6a, 0xb5a789, 0x7d7059], false, 0.7 + fr * 0.1);
    } else if (e.kind === 'squeeze') {
      emitParticles(30, G.pos.x, 0.3, G.pos.z, 3 + fr * 2, 2 + fr, 0.1 + fr * 0.1, [0x8a7a62, 0xb0a48c], false, 0.8);
    } else if (e.kind === 'tierup') {
      emitParticles(140, G.pos.x, 0.3, G.pos.z, 6 + fr * 4, 3 + fr * 2, 0.12 + fr * 0.12, [0xffd447, 0xffffff, 0xff7a3a, 0x7ad0ff, 0x9dff7a], false, 1.6);
    } else if (e.kind === 'supersize') {
      // super size: a ring burst in her color plus gold, sized to the new (biggest) scale
      const big = Math.max(fr, e.power * TUNING.FUNNEL_RADIUS);
      emitParticles(260, G.pos.x, 0.5, G.pos.z, 8 + big * 4, 4 + big * 2, 0.15 + big * 0.1, [TUNING.COLORS[G.colorId] || 0xffffff, 0xffd447, 0xffffff, 0xff7a3a], false, 2.0);
    } else if (e.kind === 'timeup') {
      emitParticles(180, G.pos.x, fr, G.pos.z, 6 + fr * 5, 5 + fr * 2, 0.14 + fr * 0.1, [0xffffff, 0xffd447, TUNING.COLORS[G.colorId] || 0xffffff], G.stageDef.form === 'blackhole', 1.6);
    } else if (e.kind === 'win' && e.swallowed) {
      // the 5-min ending: no celebration; a last swirl of glowing dust falls in after her
      emitParticles(160, G.pos.x, fr, G.pos.z, 6 + fr * 3, 2 + fr, 0.14 + fr * 0.05, [0xff7a2a, 0xfff4d8, 0xffb070], true, 2.2);
    } else if (e.kind === 'win') {
      emitParticles(600, G.pos.x, fr * 4, G.pos.z, 30 + fr * 6, 12 + fr * 3, 0.25 + fr * 0.035, [0xff4b6e, 0xffd447, 0x47d1ff, 0x9dff7a, 0xffffff, 0xff8a3a], false, 5);
      funnelUniforms.uColor.value.setHex(0xffd27a); coreMat.uniforms.uColor.value.setHex(0xe0a040);
      if (form === 'blackhole') bhUniforms.uColor.value.setHex(0xffd27a);
    } else if (e.kind === 'stage') {
      // liftoff / new stage: a burst in her color around the player
      emitParticles(300, G.pos.x, fr * 0.8, G.pos.z, 8 + fr * 3, 4 + fr * 2, 0.12 + fr * 0.1, [T.COLORS[G.colorId] || 0xffffff, 0xffffff, 0xffd447], form === 'blackhole', 2.0);
    }
  }
  function render() {
    // The map shows the astronomical structure; game-sized pickups and the player stay in the playable view.
    const hidden=[],moonMatrices=[],planetMatrices=[],ringMatrices=[];
    if(overview&&stageId==='solar')for(const o of objs)if(o.type.id==='moon'&&!o.orbit){const matrix=new THREE.Matrix4();o.mesh.getMatrixAt(o.inst,matrix);moonMatrices.push({o,matrix});hideInstance(o);}
    if(overview&&stageId==='solar'){
      for(const o of objs){const factor=solarOverviewScale[o.type.id];if(!factor||o.state===2)continue;
        const matrix=new THREE.Matrix4();o.mesh.getMatrixAt(o.inst,matrix);planetMatrices.push({o,matrix});
        o.mesh.setMatrixAt(o.inst,matrix.clone().scale(new THREE.Vector3(factor,factor,factor)));o.mesh.instanceMatrix.needsUpdate=true;
      }
      for(const entry of companions){const factor=solarOverviewScale[entry.o.type.id];if(!factor)continue;
        ringMatrices.push({mesh:entry.mesh,matrix:entry.mesh.matrix.clone()});
        entry.mesh.matrix.scale(new THREE.Vector3(factor,factor,factor));entry.mesh.matrixWorldNeedsUpdate=true;
      }
    }
    if(overview)for(const child of scene.children){
      const realPlanet=stageId==='solar'&&Object.entries(meshes).some(([id,m])=>m===child&&planetIds.has(id)&&id!=='pluto');
      const ring=companions.some(e=>e.mesh===child);
      if(child.visible&&!child.isLight&&child!==cosmicScene&&child!==stars&&child!==deepStars&&child!==skyDome&&!realPlanet&&!ring){hidden.push(child);child.visible=false;}
    }
    renderer.render(scene,camera);
    for(const child of hidden)child.visible=true;
    for(const {o,matrix} of moonMatrices){o.mesh.setMatrixAt(o.inst,matrix);o.mesh.instanceMatrix.needsUpdate=true;}
    for(const {o,matrix} of planetMatrices){o.mesh.setMatrixAt(o.inst,matrix);o.mesh.instanceMatrix.needsUpdate=true;}
    for(const {mesh,matrix} of ringMatrices){mesh.matrix.copy(matrix);mesh.matrixWorldNeedsUpdate=true;}
  }
  function reset() { funnelUniforms.uColor.value.copy(dustColor); coreMat.uniforms.uColor.value.setHex(0x7d7267); for (let i = 0; i < PN; i++) P.life[i] = 0; rattling.length = 0; finaleK = 0; }
  return { renderer, scene, camera, buildObjects, update, render, resize, onEvent, objectVisible, reset, setEnvironment, setTheme, setColor, setForm, setFinale, get form() { return form; }, get width() { return width; }, get height() { return height; } };
}

