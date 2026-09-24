// =====================================================================================================
// GEOMETRY BUILDERS (procedural, rounded, vertex-colored). Origin at ground center, +y up, faces -z = "front".
// Built lazily after THREE is available.
// =====================================================================================================
const GRAPHICS = Object.freeze({ roundSegments:32, smallSphereSegments:16, rockSegments:20, sphereRows:20, funnelSegments:64, funnelRows:40, bevelSegments:2 });
function roundedBoxGeometry(THREE,w,h,d,soften=1) {
  const smallest=Math.min(w,h,d),largest=Math.max(w,h,d);
  // Thin rails, paper and window panes keep their deliberate planar shape; main silhouettes get a bevel.
  if(smallest<.08||smallest/largest<.10)return new THREE.BoxGeometry(w,h,d);
  const radius=Math.min(smallest*.20*soften,largest*.045*soften,.4*soften,smallest*.45),steps=GRAPHICS.bevelSegments*2;
  const g=new THREE.BoxGeometry(1,1,1,steps,steps,steps),p=g.attributes.position,n=g.attributes.normal;
  const half=[w/2,h/2,d/2],v=new THREE.Vector3(),closest=new THREE.Vector3(),normal=new THREE.Vector3();
  const coordinate=(unit,half)=>{
    const a=Math.abs(unit)*2;
    return Math.sign(unit)*(a<.01?0:a<.9?half-radius:half);
  };
  for(let i=0;i<p.count;i++){
    v.set(coordinate(p.getX(i),half[0]),coordinate(p.getY(i),half[1]),coordinate(p.getZ(i),half[2]));
    closest.set(clamp(v.x,-half[0]+radius,half[0]-radius),clamp(v.y,-half[1]+radius,half[1]-radius),clamp(v.z,-half[2]+radius,half[2]-radius));
    normal.copy(v).sub(closest).normalize();v.copy(closest).addScaledVector(normal,radius);
    p.setXYZ(i,v.x,v.y,v.z);n.setXYZ(i,normal.x,normal.y,normal.z);
  }
  g.userData.bevelRadius=radius;return g;
}
function makeGeometryBuilders(THREE) {
  const parts = [];
  function push(geo, color, matrix) {
    // Compute before expanding indices. Recomputing on the merged triangle soup destroys smooth shading.
    if(!geo.attributes.normal)geo.computeVertexNormals();
    if (geo.index) geo = geo.toNonIndexed();
    if (matrix) geo.applyMatrix4(matrix);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3), tint = new Float32Array(n);
    const c = new THREE.Color(color);
    const tv = color === 0xffffff ? 1 : 0;
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; tint[i] = tv; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('tint', new THREE.BufferAttribute(tint, 1));
    parts.push(geo);
  }
  function merge() {
    let total = 0;
    for (const g of parts) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), tint = new Float32Array(total);
    let o = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      col.set(g.attributes.color.array, o * 3);
      tint.set(g.attributes.tint.array, o);
      o += g.attributes.position.count;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('tint', new THREE.BufferAttribute(tint, 1));
    parts.length = 0;
    return out;
  }
  const M = new THREE.Matrix4();
  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const box = (w, h, d, color, x, y, z, ry, soften) => {
    const g = roundedBoxGeometry(THREE,w,h,d,soften);
    const m = new THREE.Matrix4().makeRotationY(ry || 0);
    m.premultiply(T(x, y, z));
    push(g, color, m);
  };
  const cyl = (rt, rb, h, seg, color, x, y, z) => push(new THREE.CylinderGeometry(rt, rb, h, Math.max(seg,GRAPHICS.roundSegments)), color, T(x, y, z));
  const cone = (r, h, seg, color, x, y, z) => push(new THREE.ConeGeometry(r, h, seg===4?4:Math.max(seg,GRAPHICS.roundSegments)), color, T(x, y, z));
  const sphere = (r, color, x, y, z, sx, sy, sz, segments) => {
    const radial=segments||(r<.8?GRAPHICS.smallSphereSegments:GRAPHICS.roundSegments);
    const g = new THREE.SphereGeometry(r,radial,radial<=GRAPHICS.rockSegments?12:GRAPHICS.sphereRows);
    const m = new THREE.Matrix4().makeScale(sx || 1, sy || 1, sz || 1); m.premultiply(T(x, y, z));
    push(g, color, m);
  };
  const crown = (r, color, x, y, z, sx, sy, sz) => {
    const g=new THREE.SphereGeometry(r,GRAPHICS.roundSegments,GRAPHICS.sphereRows);
    const p=g.attributes.position;
    for(let i=0;i<p.count;i++){
      const px=p.getX(i),py=p.getY(i),pz=p.getZ(i);
      const a=Math.atan2(pz,px),wave=1+.045*Math.sin(a*5+py*.45)+.025*Math.cos(a*3-py*.7);
      p.setXYZ(i,px*wave,py,pz*wave);
    }
    g.computeVertexNormals();
    const m=new THREE.Matrix4().makeScale(sx,sy,sz);m.premultiply(T(x,y,z));push(g,color,m);
  };
  // gabled roof: a triangular prism spanning w (x) by d (z), height h, base at y0
  const roof = (w, h, d, color, x, y0, z, overhang) => {
    const oh = overhang || 0.4;
    const hw = w / 2 + oh, hd = d / 2 + oh;
    const profile=new THREE.Shape();profile.moveTo(-hw,0);profile.lineTo(hw,0);profile.lineTo(0,h);profile.closePath();
    const bevel=Math.min(.2,h*.08,w*.02);
    const g=new THREE.ExtrudeGeometry(profile,{depth:hd*2,steps:1,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,curveSegments:1});
    g.translate(0,0,-hd);
    push(g, color, T(x, y0, z));
  };
  // The white/instance color is 0xffffff so instanceColor tints it; fixed-color parts use their own color.
  const W = 0xffffff;
  const builders = {
    leaf() {
      const g = new THREE.BufferGeometry();
      const v = [ -0.13, 0, 0,  0, 0, -0.24,  0.13, 0, 0,   -0.13, 0, 0,  0.13, 0, 0,  0, 0, 0.2,   -0.13, 0, 0,  0.13, 0, 0,  0, 0, -0.24,   -0.13, 0, 0,  0, 0, 0.2,  0.13, 0, 0 ];
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
      const m = new THREE.Matrix4().makeRotationX(0.35); m.premultiply(T(0, 0.08, 0));
      push(g, W, m); return merge();
    },
    paper() { box(0.3, 0.012, 0.42, W, 0, 0.02, 0, 0.3); return merge(); },
    trash() { sphere(0.3, W, 0, 0.26, 0, 1, 0.85, 1); sphere(0.12, 0x555a60, 0, 0.55, 0, 1, 0.7, 1); return merge(); },
    chair() {
      box(0.55, 0.06, 0.55, W, 0, 0.45, 0); box(0.55, 0.5, 0.06, W, 0, 0.72, 0.27);
      const lc = 0xbfc3c7; box(0.05, 0.45, 0.05, lc, -0.24, 0.22, -0.24); box(0.05, 0.45, 0.05, lc, 0.24, 0.22, -0.24);
      box(0.05, 0.45, 0.05, lc, -0.24, 0.22, 0.24); box(0.05, 0.45, 0.05, lc, 0.24, 0.22, 0.24);
      return merge();
    },
    can() { cyl(0.32, 0.28, 1.0, 10, W, 0, 0.5, 0); cyl(0.36, 0.36, 0.08, 10, 0x33383c, 0, 1.03, 0); return merge(); },
    mailbox() { box(0.09, 1.15, 0.09, 0x6e4a2a, 0, 0.57, 0); box(0.28, 0.24, 0.5, W, 0, 1.25, 0); box(0.05, 0.16, 0.03, 0xd8342a, 0.16, 1.32, -0.12); return merge(); },
    fence() {
      box(0.1, 1.2, 0.1, W, -1.15, 0.6, 0); box(0.1, 1.2, 0.1, W, 1.15, 0.6, 0);
      box(2.4, 0.1, 0.05, W, 0, 0.45, 0); box(2.4, 0.1, 0.05, W, 0, 0.95, 0);
      for (let i = -3; i <= 3; i++) box(0.09, 1.1, 0.04, W, i * 0.33, 0.6, 0.02);
      return merge();
    },
    table() { box(2.2, 0.08, 0.8, W, 0, 0.76, 0); box(2.2, 0.06, 0.3, W, 0, 0.45, 0.62); box(2.2, 0.06, 0.3, W, 0, 0.45, -0.62); for (const x of [-0.8, 0.8]) { box(0.08, 0.76, 1.5, 0x7a5a3a, x, 0.38, 0); } return merge(); },
    dumpster() { box(2.6, 1.4, 1.5, W, 0, 0.75, 0); box(2.65, 0.12, 1.55, 0x2a2a2a, 0, 1.5, 0); box(0.3, 0.3, 1.5, 0x2a2a2a, -1.3, 0.2, 0); box(0.3, 0.3, 1.5, 0x2a2a2a, 1.3, 0.2, 0); return merge(); },
    tramp() { cyl(1.6, 1.6, 0.1, 14, 0x1e1e22, 0, 0.9, 0); cyl(1.85, 1.85, 0.12, 14, W, 0, 0.9, 0); cyl(1.62, 1.62, 0.14, 14, 0x1e1e22, 0, 0.91, 0); for (const a of [0, 1.57, 3.14, 4.71]) box(0.08, 0.9, 0.08, 0x8a8f94, Math.cos(a) * 1.5, 0.45, Math.sin(a) * 1.5); return merge(); },
    shed() { box(3.0, 2.3, 2.4, W, 0, 1.15, 0); roof(3.0, 0.9, 2.4, 0x8a8a84, 0, 2.3, 0, 0.25); box(0.8, 1.6, 0.06, 0x3b2f22, 0, 0.8, -1.22); return merge(); },
    car() {
      box(4.3, 0.55, 1.85, W, 0, 0.62, 0, 0, 1.6); box(2.3, 0.6, 1.7, W, -0.1, 1.2, 0, 0, 1.6);
      box(2.2, 0.45, 1.74, 0x1f2a33, -0.1, 1.15, 0, 0, 1.35);
      const wc = 0x1d1d1d; for (const [x, z] of [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]]) {
        const g = new THREE.CylinderGeometry(0.34, 0.34, 0.25, GRAPHICS.roundSegments); const m = new THREE.Matrix4().makeRotationX(Math.PI / 2); m.premultiply(T(x, 0.34, z)); push(g, wc, m);
      }
      return merge();
    },
    boat() { box(5.6, 1.1, 2.0, W, 0, 0.9, 0); box(1.6, 0.9, 1.5, 0x9fb7c6, 0.6, 1.9, 0); box(5.6, 0.15, 2.1, 0x2b5f8a, 0, 1.2, 0); box(3.2, 0.5, 2.2, 0x555555, -0.4, 0.3, 0); return merge(); },
    rv() { box(8.0, 2.7, 2.6, W, 0, 1.85, 0, 0, 1.5); box(8.0, 0.35, 2.62, 0x8a5a2a, 0, 1.4, 0); box(7.6, 0.2, 2.3, 0xdddddd, 0, 3.3, 0);
      const wc = 0x1d1d1d; for (const [x, z] of [[-2.6, -1.25], [2.4, -1.25], [-2.6, 1.25], [2.4, 1.25]]) { const g = new THREE.CylinderGeometry(0.45, 0.45, 0.3, GRAPHICS.roundSegments); const m = new THREE.Matrix4().makeRotationX(Math.PI / 2); m.premultiply(T(x, 0.45, z)); push(g, wc, m); }
      return merge(); },
    bus() { box(10.5, 2.6, 2.5, W, 0, 1.9, 0, 0, 1.5); box(10.6, 0.9, 2.55, 0x1f2a33, 0, 2.3, 0, 0, 1.35); box(2.0, 1.4, 2.4, W, -5.2, 1.4, 0, 0, 1.4); box(10.3, 0.15, 2.3, 0xf7f0d0, 0, 3.25, 0);
      const wc = 0x1d1d1d; for (const [x, z] of [[-3.4, -1.2], [3.6, -1.2], [-3.4, 1.2], [3.6, 1.2]]) { const g = new THREE.CylinderGeometry(0.5, 0.5, 0.35, GRAPHICS.roundSegments); const m = new THREE.Matrix4().makeRotationX(Math.PI / 2); m.premultiply(T(x, 0.5, z)); push(g, wc, m); }
      return merge(); },
    pine() {
      cyl(0.25,0.4,3.0,6,0x5a4030,0,1.5,0);
      const profile=[[0.2,2.8],[1.4,3.2],[2.9,3.5],[2.6,4.1],[2.0,5.2],[2.5,5.4],[2.1,6.1],[1.4,7.2],[1.85,7.4],[1.4,8.2],[0.8,9.7],[0.05,11.3]];
      const foliage=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),GRAPHICS.roundSegments);
      foliage.computeVertexNormals();push(foliage,W);
      return merge();
    },
    tree() { cyl(0.32,0.5,4.0,7,0x5a4030,0,2.0,0); crown(3.65,W,-0.2,7.3,0,1.16,0.87,1.05); crown(1.9,W,2.1,7.8,-0.35,1,0.88,1); return merge(); },
    house() {
      box(10, 4.6, 8, W, 0, 2.3, 0); roof(10, 3.0, 8, 0x7d5a4e, 0, 4.6, 0, 0.5);
      box(1.0, 2.2, 1.0, 0x8a4a3a, 3.2, 6.3, 1.5);
      box(1.2, 2.2, 0.1, 0x3b2f22, 0, 1.1, -4.02); box(1.6, 1.3, 0.1, 0x9fc0d8, -3.2, 2.6, -4.02); box(1.6, 1.3, 0.1, 0x9fc0d8, 3.2, 2.6, -4.02);
      return merge();
    },
    barn() { box(14, 7, 10, W, 0, 3.5, 0); roof(14, 4.5, 10, 0x9a9a94, 0, 7, 0, 0.5); box(3.0, 4.0, 0.15, 0x5a2a1e, 0, 2.0, -5.05); box(14.2, 0.9, 10.2, 0xf0f0f0, 0, 0.45, 0); return merge(); },
    silo() { cyl(3.4, 3.4, 16, 14, W, 0, 8, 0); sphere(3.4, 0x8a9096, 0, 16, 0, 1, 0.6, 1); box(0.4, 17, 0.4, 0x6f7377, 3.5, 8.5, 0); return merge(); },
    bighouse() {
      box(11, 7.5, 9, W, 0, 3.75, 0); roof(11, 3.4, 9, 0x6e6a66, 0, 7.5, 0, 0.5);
      box(1.0, 2.4, 1.0, 0x8a4a3a, -3.6, 9.2, 1.0);
      box(1.2, 2.2, 0.1, 0x3b2f22, 0, 1.1, -4.52); for (const x of [-3.6, 3.6]) for (const y of [2.6, 5.6]) box(1.5, 1.3, 0.1, 0x9fc0d8, x, y, -4.52);
      box(5, 0.2, 2.2, 0xd8d2c4, 0, 2.6, -5.5); for (const x of [-2.2, 2.2]) box(0.25, 2.5, 0.25, 0xd8d2c4, x, 1.3, -6.4);
      return merge();
    },
    elevator() { box(8, 22, 8, W, 0, 11, 0); box(3, 5, 3, 0x8c8880, 0, 24.5, 0); cyl(2.2, 2.2, 20, 12, W, 6.5, 10, 0); cyl(2.2, 2.2, 20, 12, W, -6.5, 10, 0); box(9, 0.6, 2, 0x6f6b66, 0, 17, 0); return merge(); },
    church() { box(10, 6, 16, W, 0, 3, 0); roof(10, 3.5, 16, 0x7a7a76, 0, 6, 0, 0.4); box(3.2, 12, 3.2, W, 0, 6, -8.5); cone(2.4, 6, 4, 0x7a7a76, 0, 15, -8.5); box(1.4, 2.6, 0.15, 0x5a3a2a, 0, 1.3, -10.12); return merge(); },
    // ---- space ----
    // ---- discovery worlds (origin at ground centre, +y up, the front faces -x for animals) ----
    chick() { sphere(0.16, W, 0, 0.17, 0, 1.1, 1, 1); sphere(0.11, W, -0.1, 0.36, 0); cone(0.035, 0.08, 8, 0xff9a2a, -0.2, 0.36, 0); sphere(0.02, 0x222222, -0.17, 0.4, 0.05); sphere(0.02, 0x222222, -0.17, 0.4, -0.05); return merge(); },
    puppy() { sphere(0.28, W, 0, 0.45, 0, 1.5, 0.9, 0.9); sphere(0.22, W, -0.42, 0.7, 0); sphere(0.1, 0x3a2a1e, -0.62, 0.66, 0, 1, 0.8, 0.9); for (const z of [-0.2, 0.2]) sphere(0.09, 0x6e4a2a, -0.38, 0.86, z, 0.6, 1.4, 0.6); for (const [x, z] of [[-0.25, -0.14], [0.25, -0.14], [-0.25, 0.14], [0.25, 0.14]]) cyl(0.06, 0.06, 0.3, 12, W, x, 0.15, z); sphere(0.07, W, 0.45, 0.62, 0, 1.6, 0.6, 0.6); return merge(); },
    sheep() { sphere(0.45, W, 0, 0.72, 0, 1.3, 0.9, 1); for (const [x, y, z] of [[0.3, 0.95, 0.2], [-0.2, 0.98, -0.25], [0.35, 0.8, -0.3], [-0.1, 1.0, 0.25]]) sphere(0.22, W, x, y, z); sphere(0.2, 0x2a2a2a, -0.62, 0.82, 0, 1.2, 1, 0.9); for (const [x, z] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]]) cyl(0.06, 0.06, 0.45, 12, 0x2a2a2a, x, 0.22, z); return merge(); },
    pig() { sphere(0.8, W, 0, 0.95, 0, 1.4, 0.9, 0.95); sphere(0.5, W, -1.05, 1.15, 0); cyl(0.2, 0.22, 0.2, 16, 0xe88a9a, -1.55, 1.1, 0); for (const z of [-0.28, 0.28]) cone(0.14, 0.3, 4, W, -0.95, 1.6, z); for (const [x, z] of [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]]) cyl(0.16, 0.16, 0.5, 12, W, x, 0.25, z); return merge(); },
    cow() { box(2.2, 1.1, 1.05, W, 0, 1.5, 0, 0, 1.5); box(0.7, 0.7, 0.65, W, -1.35, 1.95, 0, 0, 1.2); box(0.35, 0.3, 0.55, 0xe8b0a8, -1.72, 1.75, 0); for (const z of [-0.3, 0.3]) cone(0.07, 0.35, 8, 0xe8e0c8, -1.3, 2.45, z); for (const [x, y, z] of [[0.3, 1.9, 0.53], [-0.4, 1.4, -0.53], [0.7, 1.3, 0.53]]) sphere(0.3, 0x2a2a2a, x, y, z, 1, 1, 0.15); for (const [x, z] of [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]]) cyl(0.14, 0.14, 1.0, 12, 0x3a3a3a, x, 0.5, z); return merge(); },
    horse() { box(2.3, 0.95, 0.8, W, 0, 1.95, 0, 0, 1.5); box(0.55, 1.2, 0.5, W, -1.15, 2.6, 0, 0, 1.2); box(0.9, 0.45, 0.45, W, -1.55, 3.15, 0, 0, 1.2); box(0.18, 1.1, 0.12, 0x3a2a1e, -1.0, 2.9, 0); for (const [x, z] of [[-0.9, -0.28], [0.9, -0.28], [-0.9, 0.28], [0.9, 0.28]]) cyl(0.12, 0.1, 1.5, 12, W, x, 0.75, z); sphere(0.18, 0x3a2a1e, 1.3, 1.8, 0, 2.2, 0.6, 0.6); return merge(); },
    elephant() { sphere(2.1, W, 0, 3.1, 0, 1.45, 1, 1); sphere(1.35, W, -3.0, 3.8, 0); cyl(0.35, 0.5, 2.8, 16, W, -3.9, 2.4, 0); for (const z of [-1.1, 1.1]) sphere(1.1, W, -2.6, 3.9, z, 0.3, 1, 0.9); for (const z of [-0.5, 0.5]) cone(0.14, 0.9, 12, 0xf4f0e6, -3.8, 2.8, z); for (const [x, z] of [[-1.6, -0.9], [1.6, -0.9], [-1.6, 0.9], [1.6, 0.9]]) cyl(0.55, 0.55, 1.8, 16, W, x, 0.9, z); return merge(); },
    giraffe() { sphere(1.3, W, 0, 4.1, 0, 1.55, 0.9, 0.8); cyl(0.3, 0.42, 5.2, 16, W, -1.7, 7.0, 0); box(1.1, 0.55, 0.55, W, -2.1, 9.7, 0, 0, 1.2); for (const z of [-0.15, 0.15]) cyl(0.05, 0.05, 0.4, 8, 0x6e4a2a, -1.8, 10.15, z); for (const [x, y, z] of [[0.4, 4.6, 0.72], [-0.6, 4.0, -0.72], [-1.6, 6.2, 0.3], [-1.7, 7.8, -0.3], [0.9, 3.9, -0.7]]) sphere(0.28, 0x8a5a2a, x, y, z, 1, 1, 0.2); for (const [x, z] of [[-1.1, -0.45], [1.1, -0.45], [-1.1, 0.45], [1.1, 0.45]]) cyl(0.17, 0.14, 3.4, 12, W, x, 1.7, z); return merge(); },
    dinoegg() { sphere(0.2, W, 0, 0.27, 0, 1, 1.35, 1); for (const [x, y, z] of [[0.12, 0.3, 0.12], [-0.1, 0.4, 0.1], [0.05, 0.18, -0.17]]) sphere(0.05, 0x7aa05a, x, y, z, 1, 1, 0.4); return merge(); },
    babydino() { sphere(0.35, W, 0, 0.55, 0, 1.4, 1, 1); sphere(0.25, W, -0.5, 0.85, 0, 1.2, 1, 1); sphere(0.18, W, 0.62, 0.5, 0, 2.4, 0.6, 0.6); for (const x of [-0.3, 0, 0.3]) cone(0.08, 0.2, 4, 0xffd447, x, 0.95, 0); for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) cyl(0.08, 0.08, 0.3, 12, W, x, 0.15, z); return merge(); },
    raptor() { sphere(0.6, W, 0, 1.45, 0, 1.6, 0.8, 0.7); sphere(0.35, W, -1.05, 2.05, 0, 1.5, 0.8, 0.75); sphere(0.3, W, 1.35, 1.35, 0, 3.2, 0.5, 0.5); for (const z of [-0.22, 0.22]) cyl(0.13, 0.08, 1.2, 12, W, 0.1, 0.6, z); for (const z of [-0.25, 0.25]) sphere(0.08, W, -0.65, 1.3, z, 1, 2, 1); return merge(); },
    stego() { sphere(1.8, W, 0, 2.4, 0, 1.8, 1, 1); sphere(0.6, W, -3.2, 1.8, 0, 1.3, 0.9, 0.9); sphere(0.7, W, 3.3, 1.9, 0, 2.6, 0.6, 0.6); for (let i = -2; i <= 2; i++) cone(0.55, 1.3, 4, 0xd0603a, i * 1.0, 4.2 - Math.abs(i) * 0.3, 0); for (const z of [-0.2, 0.2]) cone(0.15, 0.8, 8, 0xe8dcc8, 4.6, 2.3, z); for (const [x, z] of [[-1.6, -0.8], [1.6, -0.8], [-1.6, 0.8], [1.6, 0.8]]) cyl(0.45, 0.45, 1.4, 16, W, x, 0.7, z); return merge(); },
    trex() { sphere(2.8, W, 0, 6.0, 0, 1.45, 1.1, 1); box(3.2, 2.2, 2.0, W, -4.4, 9.0, 0, 0, 1.3); box(2.6, 0.5, 1.8, 0xf4f0e6, -4.7, 7.95, 0, 0, 1); sphere(1.2, W, 4.8, 5.4, 0, 3.4, 0.6, 0.6); for (const z of [-1.1, 1.1]) cyl(0.75, 0.55, 4.4, 16, W, 0.4, 2.2, z); for (const z of [-1.0, 1.0]) cyl(0.18, 0.18, 1.2, 8, W, -2.5, 6.3, z); sphere(0.2, 0x111111, -5.3, 9.6, 1.0); sphere(0.2, 0x111111, -5.3, 9.6, -1.0); return merge(); },
    bronto() { sphere(3.6, W, 0, 5.8, 0, 1.6, 1, 1); cyl(0.8, 1.3, 9.5, 20, W, -5.0, 10.8, 0); sphere(1.1, W, -5.6, 15.8, 0, 1.6, 0.9, 1); sphere(1.4, W, 6.5, 5.0, 0, 4.2, 0.55, 0.55); for (const [x, z] of [[-3, -1.8], [3, -1.8], [-3, 1.8], [3, 1.8]]) cyl(1.0, 1.0, 3.6, 16, W, x, 1.8, z); return merge(); },
    gumdrop() { cone(0.2, 0.34, 20, W, 0, 0.17, 0); sphere(0.2, W, 0, 0.04, 0, 1, 0.3, 1); return merge(); },
    lollipop() { cyl(0.03, 0.03, 1.0, 8, 0xf4f4f4, 0, 0.5, 0); sphere(0.32, W, 0, 1.1, 0, 1, 1, 0.28); sphere(0.2, 0xffffff, 0, 1.1, 0, 1, 1, 0.3); return merge(); },
    cupcake() { cyl(1.0, 0.75, 1.0, 24, 0xe8a0c0, 0, 0.5, 0); sphere(1.05, W, 0, 1.25, 0, 1, 0.65, 1); sphere(0.55, W, 0, 1.75, 0, 1, 0.8, 1); sphere(0.2, 0xd8263a, 0, 2.3, 0); return merge(); },
    donut() { { const g = new THREE.TorusGeometry(1.35, 0.55, 20, 48); const m = new THREE.Matrix4().makeRotationX(-Math.PI / 2); m.premultiply(T(0, 0.55, 0)); push(g, 0xd8a060, m); } { const g = new THREE.TorusGeometry(1.35, 0.5, 20, 48, Math.PI * 2); const m = new THREE.Matrix4().makeScale(1, 1, 0.6); m.premultiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)); m.premultiply(T(0, 0.78, 0)); push(g, W, m); } for (let i = 0; i < 14; i++) { const a = i * 0.45, r = 1.35 + Math.sin(i * 1.7) * 0.25; box(0.3, 0.08, 0.08, [0xff4f7a, 0x4fb0ff, 0xffd447, 0x9dff7a][i % 4], Math.cos(a) * r, 1.08, Math.sin(a) * r, a); } return merge(); },
    candycane() { for (let i = 0; i < 12; i++) cyl(0.45, 0.45, 0.55, 20, i % 2 ? 0xd8263a : W, 0, 0.28 + i * 0.55, 0); for (let i = 0; i <= 6; i++) { const a = Math.PI * i / 6; sphere(0.47, i % 2 ? 0xd8263a : W, -1.0 + Math.cos(a) * 1.0, 6.9 + Math.sin(a) * 1.0, 0); } return merge(); },
    gingerhouse() { box(9, 5.5, 7, W, 0, 2.75, 0, 0, 1.5); roof(9, 3.8, 7, 0xfbf6f0, 0, 5.5, 0, 0.6); box(1.6, 2.6, 0.2, 0xd8263a, 0, 1.3, -3.55); for (const [x, y] of [[-2.8, 3.2], [2.8, 3.2]]) box(1.4, 1.2, 0.2, 0xfff4b8, x, y, -3.55); for (let i = 0; i < 9; i++) sphere(0.28, [0xff4f7a, 0x4fb0ff, 0x9dff7a][i % 3], -4 + i, 5.6, -3.6); cyl(0.5, 0.5, 2.2, 16, 0xfbf6f0, 2.5, 8.2, 1.2); return merge(); },
    snowball() { sphere(0.22, W, 0, 0.22, 0); return merge(); },
    penguin() { sphere(0.34, W, 0, 0.55, 0, 1, 1.5, 0.95); sphere(0.26, 0xf8f8f8, -0.12, 0.5, 0, 0.8, 1.3, 0.85); sphere(0.22, W, 0, 1.02, 0); cone(0.06, 0.16, 8, 0xff9a2a, -0.26, 1.0, 0); for (const z of [-0.08, 0.08]) sphere(0.035, 0xffffff, -0.18, 1.08, z); for (const z of [-0.36, 0.36]) sphere(0.12, W, 0, 0.6, z, 0.5, 1.6, 0.4); for (const z of [-0.12, 0.12]) sphere(0.1, 0xff9a2a, -0.08, 0.04, z, 1.4, 0.4, 1); return merge(); },
    snowman() { sphere(0.8, W, 0, 0.75, 0); sphere(0.56, W, 0, 1.9, 0); sphere(0.4, W, 0, 2.75, 0); cone(0.08, 0.45, 12, 0xff8a2a, -0.55, 2.75, 0); cyl(0.32, 0.32, 0.5, 20, 0x1e1e22, 0, 3.35, 0); cyl(0.5, 0.5, 0.06, 20, 0x1e1e22, 0, 3.1, 0); for (const y of [1.7, 1.95, 2.2]) sphere(0.06, 0x1e1e22, -0.54, y, 0); box(0.9, 0.15, 0.3, 0xd8263a, 0, 2.38, 0, 0.3); return merge(); },
    igloo() { sphere(3.4, W, 0, 0, 0, 1, 0.78, 1); cyl(1.1, 1.1, 1.9, 20, W, -3.2, 0.9, 0); box(0.9, 1.3, 1.4, 0x5a7a92, -4.05, 0.65, 0); for (let i = 1; i < 4; i++) cyl(3.45 * Math.sqrt(1 - (i / 4.2) ** 2), 3.45 * Math.sqrt(1 - (i / 4.2) ** 2), 0.05, 40, 0xc8dcea, 0, i * 0.66, 0); return merge(); },
    icecastle() { box(11, 6, 9, W, 0, 3, 0, 0, 1.5); for (const [x, z] of [[-5.5, -4.5], [5.5, -4.5], [-5.5, 4.5], [5.5, 4.5]]) { cyl(1.4, 1.6, 10, 24, W, x, 5, z); cone(1.8, 4, 24, 0x9ad0f0, x, 12, z); } cyl(2.2, 2.4, 13, 24, W, 0, 6.5, 0); cone(2.7, 5, 24, 0x9ad0f0, 0, 15.5, 0); box(2.2, 3.4, 0.3, 0x6a9ab8, 0, 1.7, -4.6); return merge(); },
    helmet() { sphere(0.2, W, 0, 0.18, 0, 1, 0.95, 1); box(0.05, 0.12, 0.3, 0x2a2a2a, -0.2, 0.2, 0); cone(0.06, 0.25, 8, 0xd8263a, 0, 0.45, 0); return merge(); },
    knight() { cyl(0.26, 0.3, 0.8, 20, W, 0, 0.75, 0); sphere(0.2, W, 0, 1.33, 0); box(0.05, 0.08, 0.26, 0x2a2a2a, -0.2, 1.34, 0); cone(0.06, 0.3, 8, 0xd8263a, 0, 1.6, 0); box(0.08, 0.6, 0.45, 0x3a6fd8, -0.32, 0.85, 0.12); cyl(0.03, 0.03, 1.6, 8, 0x8a6a48, 0.3, 0.9, -0.2); cone(0.06, 0.2, 8, 0xc0c8d0, 0.3, 1.78, -0.2); for (const z of [-0.12, 0.12]) cyl(0.09, 0.09, 0.35, 12, 0x5a5f66, 0, 0.18, z); return merge(); },
    catapult() { box(3.0, 0.4, 1.6, W, 0, 0.6, 0, 0, 1); for (const z of [-0.7, 0.7]) { box(0.3, 1.6, 0.25, W, 0.2, 1.4, z); } box(0.25, 0.25, 1.7, W, 0.2, 2.1, 0); { const g = new THREE.BoxGeometry(3.2, 0.22, 0.25); const m = new THREE.Matrix4().makeRotationZ(-0.6); m.premultiply(T(-0.4, 1.9, 0)); push(g, W, m); } sphere(0.35, 0x6a6a6a, -1.65, 2.95, 0); for (const [x, z] of [[-1.1, -0.9], [1.1, -0.9], [-1.1, 0.9], [1.1, 0.9]]) { const g = new THREE.CylinderGeometry(0.45, 0.45, 0.18, GRAPHICS.roundSegments); const m = new THREE.Matrix4().makeRotationX(Math.PI / 2); m.premultiply(T(x, 0.45, z)); push(g, 0x5a4030, m); } return merge(); },
    dragon() { sphere(2.0, W, 0, 3.6, 0, 1.8, 1, 1); cyl(0.6, 0.9, 3.0, 16, W, -2.8, 5.4, 0); sphere(0.9, W, -3.4, 7.0, 0, 1.6, 0.9, 1); for (const z of [-0.4, 0.4]) cone(0.15, 0.8, 8, 0xf4f0e6, -3.0, 7.9, z); sphere(0.18, 0xffd447, -4.3, 7.3, 0.5); sphere(0.18, 0xffd447, -4.3, 7.3, -0.5); sphere(0.9, W, 4.4, 3.0, 0, 3.4, 0.5, 0.5); for (const side of [-1, 1]) { const g = new THREE.BoxGeometry(3.6, 0.15, 4.2); const m = new THREE.Matrix4().makeRotationX(side * 0.55); m.premultiply(T(0.2, 5.6, side * 2.6)); push(g, W, m); } for (let i = 0; i < 5; i++) cone(0.35, 0.8, 4, 0xffd447, -1.6 + i * 0.9, 5.4 - Math.abs(i - 2) * 0.2, 0); for (const [x, z] of [[-1.6, -0.9], [1.6, -0.9], [-1.6, 0.9], [1.6, 0.9]]) cyl(0.45, 0.4, 1.8, 12, W, x, 0.9, z); return merge(); },
    castle() { for (const [w, d, x, z] of [[14, 1.4, 0, -6.8], [14, 1.4, 0, 6.8], [1.4, 14, -6.8, 0], [1.4, 14, 6.8, 0]]) box(w, 6, d, W, x, 3, z, 0, 1); for (let i = -3; i <= 3; i++) { box(1, 1, 1.5, W, i * 2, 6.5, -6.8); box(1, 1, 1.5, W, i * 2, 6.5, 6.8); } for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) { cyl(1.8, 2.0, 9, 24, W, x, 4.5, z); cone(2.3, 4, 24, 0xc0403a, x, 11, z); } cyl(2.8, 3.0, 13, 24, W, 0, 6.5, 0); cone(3.4, 5, 24, 0x3a6fd8, 0, 15.5, 0); box(3, 4, 0.4, 0x4a3a2a, 0, 2, -7.5); cyl(0.08, 0.08, 3, 8, 0x5a4030, 0, 19.5, 0); box(1.6, 0.9, 0.08, 0xffd447, 0.8, 20.4, 0); return merge(); },
    rock_s() { sphere(5, W, 0, 5, 0, 1.2, 0.8, 1, GRAPHICS.rockSegments); return merge(); },
    rock_m() { sphere(9, W, 0, 9, 0, 1.1, 0.75, 1.3, GRAPHICS.rockSegments); sphere(4, 0x5a524a, 5, 12, 3,1,1,1,GRAPHICS.rockSegments); return merge(); },
    rock_l() { sphere(15, W, 0, 15, 0, 1.3, 0.8, 1,GRAPHICS.rockSegments); sphere(6, 0x5a524a, -8, 20, 6,1,1,1,GRAPHICS.rockSegments); sphere(4, 0x5a524a, 9, 9, -8,1,1,1,GRAPHICS.rockSegments); return merge(); },
    satellite() { box(3, 3, 3, W, 0, 7, 0); box(14, 0.2, 4, 0x2b4f8a, 0, 7, 0); cyl(0.2, 0.2, 5, 6, 0xaaaaaa, 0, 10.5, 0); sphere(1.5, 0xaaaaaa, 0, 13, 0); return merge(); },
    rocket() { // Retired Space Shuttle orbiter: delta wings, black underside, cockpit and three engines.
      sphere(3, W, 0, 7, 0, 1, 0.85, 3.7); box(4.8, 0.5, 15, 0x182332, 0, 5, 0);
      const wing = new THREE.BufferGeometry(); wing.setAttribute('position', new THREE.Float32BufferAttribute([-2,6,-5,-11,6,8,2,6,8, 2,6,-5,-2,6,8,11,6,8],3)); wing.computeVertexNormals(); push(wing, W);
      box(4, 0.4, 3, 0x142a42, 0, 9.2, -6); box(0.6, 5, 5, W, 0, 10, 7);
      for (const x of [-1.7,0,1.7]) sphere(1.1, 0x28313b, x, 6.5, 10, 1, 1, 1.4);
      return merge();
    },
    comet() { sphere(6, W, 0, 12, 0); sphere(4, 0xdff6ff, 8, 14, 0, 2.2, 0.6, 0.6); sphere(3, 0xeafaff, 18, 15, 0, 2.6, 0.5, 0.5); return merge(); },
    station() { box(30, 4, 4, W, 0, 22, 0); box(4, 4, 30, W, 0, 22, 0); sphere(6, 0x9fb7c6, 0, 22, 0); for (const [x, z] of [[14, 0], [-14, 0], [0, 14], [0, -14]]) box(10, 0.3, 6, 0x2b4f8a, x, 22, z); return merge(); },
    pluto() { sphere(25, W, 0, 25, 0); sphere(10, 0xe8dccc, 8, 40, 6, 1, 0.5, 1); return merge(); },
    moon() { sphere(30, W, 0, 30, 0); sphere(6, 0x8a8a8a, 14, 42, 10, 1, 0.3, 1); sphere(4, 0x8a8a8a, -12, 48, 8, 1, 0.3, 1); sphere(5, 0x8a8a8a, 6, 22, -22, 1, 0.3, 1); return merge(); },
    mercury() { sphere(37, W, 0, 37, 0); sphere(7, 0x7a746c, 18, 52, 14, 1, 0.3, 1); sphere(5, 0x7a746c, -20, 40, 20, 1, 0.3, 1); return merge(); },
    mars() { sphere(45, W, 0, 45, 0); sphere(12, 0xf0e8e0, 0, 88, 0, 1, 0.3, 1); sphere(9, 0x9a3a22, 25, 50, 28, 1, 0.5, 1); return merge(); },
    bigmoon() { sphere(45, W, 0, 45, 0); sphere(9, 0x8a8070, 20, 62, 18, 1, 0.3, 1); sphere(7, 0x8a8070, -24, 48, 20, 1, 0.3, 1); return merge(); },
    venus() { sphere(62, W, 0, 62, 0); sphere(30, 0xf2dea0, 20, 90, 30, 1.2, 0.5, 1); return merge(); },
    earth() { sphere(65, W, 0, 65, 0); sphere(28, 0x4f9a3a, 30, 75, 40, 1, 0.7, 1.3); sphere(22, 0x4f9a3a, -40, 90, -20, 1.4, 0.6, 1); sphere(16, 0x4f9a3a, 20, 40, -45, 1, 0.5, 1.2); sphere(20, 0xf6f6f6, 0, 128, 0, 1.4, 0.3, 1.4); sphere(30, 0xf6f6f6, 10, 52, 30, 1.6, 0.25, 0.8); return merge(); },
    icemoon() { sphere(80, W, 0, 80, 0); sphere(14, 0xb8dceb, 30, 120, 40, 1, 0.3, 1); sphere(10, 0xb8dceb, -40, 90, 50, 1, 0.3, 1); return merge(); },
    gasdwarf() { sphere(120, W, 0, 120, 0); sphere(60, 0xffffff, 40, 150, 60, 1.4, 0.3, 1); return merge(); },
    giant() { sphere(190, W, 0, 190, 0); for (const [y, c] of [[120, 0xffffff], [230, 0x333344]]) sphere(180, c, 0, y, 0, 1.05, 0.1, 1.05); return merge(); },
    neptune() { sphere(105, W, 0, 105, 0); sphere(30, 0x2c46b8, 50, 120, 60, 1.6, 0.4, 1); return merge(); },
    uranus() { sphere(110, W, 0, 110, 0); cyl(160, 160, 2, 40, 0xbfe6ee, 0, 110, 0); cyl(135, 135, 3, 40, 0x7fd3e6, 0, 110, 0); return merge(); },
    saturn() { sphere(165, W, 0, 165, 0); for (const [y, c] of [[120, 0xcfb070], [200, 0xd8bc80]]) sphere(120, c, 0, y, 0, 1.3, 0.12, 1.3); cyl(300, 300, 3, 48, 0xd6c49a, 0, 165, 0); cyl(255, 255, 4, 48, 0xe3c98a, 0, 165, 0); cyl(215, 215, 5, 48, 0xb8a070, 0, 165, 0); return merge(); },
    jupiter() { sphere(215, W, 0, 215, 0); for (const [y, c] of [[130, 0xb87850], [190, 0xe8c8a0], [250, 0xc08860], [300, 0xe8d0b0]]) sphere(200, c, 0, y, 0, 1.06, 0.12, 1.06); sphere(30, 0xc84a30, 190, 200, 90, 1.4, 0.7, 1); return merge(); },
    dwarfstar() { sphere(280, W, 0, 280, 0); return merge(); },
    sun() { sphere(450, W, 0, 450, 0); return merge(); },
    // ---- galaxy: stars, clouds, clusters (size = diameter; centered size/2 above the plane like the planets) ----
    g_rogue() { sphere(5, W, 0, 5, 0); sphere(2, 0x3a4a80, 3, 7, 2, 1, 0.5, 1); return merge(); },
    g_iceworld() { sphere(7, W, 0, 7, 0); sphere(3, 0xffffff, 2, 12, 2, 1, 0.4, 1); return merge(); },
    g_browndwarf() { sphere(9, W, 0, 9, 0); sphere(9, 0x5a2a1a, 0, 9, 0, 1.02, 0.15, 1.02); return merge(); },
    g_wisp() { sphere(9, W, 0, 10, 0, 1.6, 0.5, 0.8); sphere(6, W, 9, 12, 4, 1.2, 0.5, 0.8); sphere(5, W, -8, 9, -3, 1, 0.5, 1); return merge(); },
    g_reddwarf() { sphere(15, W, 0, 15, 0); return merge(); },
    g_whitedwarf() { sphere(14, W, 0, 17, 0); sphere(22, 0xdfe8ff, 0, 17, 0, 1, 0.08, 1); return merge(); },
    g_yellowstar() { sphere(22, W, 0, 22, 0); return merge(); },
    g_orangestar() { sphere(25, W, 0, 25, 0); sphere(8, 0xffd080, 14, 38, 10, 1, 0.5, 1); return merge(); },
    g_bluestar() { sphere(30, W, 0, 30, 0); sphere(40, 0xcfe0ff, 0, 30, 0, 1, 0.06, 1); return merge(); },
    g_orangegiant() { sphere(37, W, 0, 37, 0); sphere(37, 0xffc070, 0, 37, 0, 1.02, 0.2, 1.02); return merge(); },
    g_redgiant() { sphere(45, W, 0, 45, 0); sphere(45, 0xffa070, 0, 60, 0, 1.02, 0.15, 1.02); return merge(); },
    g_cluster() { for (const [x, y, z, r] of [[0, 45, 0, 16], [26, 52, 10, 10], [-24, 38, 14, 12], [8, 70, -20, 9], [-14, 62, -18, 8], [30, 30, -14, 7], [-32, 58, -4, 6], [10, 22, 26, 7]]) sphere(r, W, x, y, z); return merge(); },
    g_nebula() { sphere(45, W, 0, 62, 0, 1.4, 0.7, 1.1); sphere(34, W, 50, 70, 20, 1.2, 0.6, 1); sphere(30, W, -48, 55, -16, 1.1, 0.7, 1.2); sphere(22, 0xffffff, 10, 80, -10, 1, 0.5, 1); sphere(12, 0xfff0c0, -20, 66, 24); sphere(9, 0xfff0c0, 34, 50, -30); return merge(); },
    g_supergiant() { sphere(65, W, 0, 65, 0); sphere(65, 0xffe0b0, 0, 65, 0, 1.02, 0.18, 1.02); return merge(); },
    g_pulsar() { sphere(40, W, 0, 80, 0); cyl(6, 22, 150, 8, 0x8fd0ff, 0, 155, 0); cyl(22, 6, 150, 8, 0x8fd0ff, 0, 5, 0); cyl(120, 120, 3, 40, 0xbfe8ff, 0, 80, 0); return merge(); },
    g_bigcluster() { for (const [x, y, z, r] of [[0, 105, 0, 34], [60, 120, 24, 22], [-56, 90, 30, 26], [20, 160, -46, 20], [-34, 145, -40, 18], [70, 70, -34, 16], [-74, 130, -10, 14], [24, 52, 60, 16], [-20, 190, 10, 12], [90, 150, 10, 10]]) sphere(r, W, x, y, z); return merge(); },
    g_bluesuper() { sphere(110, W, 0, 110, 0); sphere(150, 0xbcdcff, 0, 110, 0, 1, 0.05, 1); return merge(); },
    g_bignebula() { sphere(90, W, 0, 120, 0, 1.4, 0.7, 1.1); sphere(70, W, 100, 130, 40, 1.2, 0.6, 1); sphere(60, W, -95, 105, -30, 1.1, 0.7, 1.2); sphere(44, 0xffffff, 20, 160, -20, 1, 0.5, 1); sphere(24, 0xfff0c0, -40, 130, 50); sphere(18, 0xfff0c0, 70, 100, -60); sphere(14, 0xfff0c0, -80, 150, 0); return merge(); },
    g_supernova() { sphere(70, 0xffffff, 0, 165, 0); sphere(165, W, 0, 165, 0, 1, 0.12, 1); sphere(165, W, 0, 165, 0, 0.12, 1, 1); sphere(165, W, 0, 165, 0, 1, 1, 0.12); sphere(120, W, 0, 165, 0, 0.7, 0.7, 0.7); return merge(); },
    g_minihole() { sphere(150, 0x000000, 0, 190, 0); cyl(320, 320, 5, 48, W, 0, 190, 0); cyl(250, 250, 8, 48, 0xffffff, 0, 190, 0); return merge(); },
    g_globular() { sphere(140, W, 0, 215, 0); for (let i = 0; i < 14; i++) { const a = i * 2.4, r = 150 + (i % 4) * 22; sphere(28 + (i % 3) * 10, W, Math.cos(a) * r, 215 + Math.sin(i * 1.7) * 90, Math.sin(a) * r); } return merge(); },
    g_hypergiant() { sphere(280, W, 0, 280, 0); sphere(280, 0xffb070, 0, 280, 0, 1.02, 0.14, 1.02); return merge(); },
    g_core() { sphere(450, W, 0, 450, 0); cyl(760, 760, 6, 56, 0xe8c8ff, 0, 450, 0); cyl(620, 620, 10, 56, 0xfff4d6, 0, 450, 0); sphere(120, 0x000000, 0, 905, 0); return merge(); },
    // ---- universe: galaxies (flat discs with a bulge), groups, quasars, and everything ----
    u_speck() { cyl(5, 5, 1, 12, W, 0, 5, 0); sphere(2, 0xffffff, 0, 5, 0); return merge(); },
    u_dwarf() { sphere(9, W, 0, 9, 0, 1, 0.5, 0.8); sphere(4, 0xffffff, 0, 9, 0); return merge(); },
    u_irregular() { sphere(5, W, 0, 7, 0, 1.4, 0.5, 0.9); sphere(4, W, 6, 8, 3, 1.1, 0.5, 0.8); sphere(3, 0xffffff, -4, 6, -3); return merge(); },
    u_lenticular() { cyl(11, 11, 1.5, 20, W, 0, 11, 0); sphere(5, 0xfff0c0, 0, 11, 0, 1, 0.7, 1); return merge(); },
    u_smallspiral() { cyl(15, 15, 1.5, 20, W, 0, 15, 0); sphere(5, 0xfff0c0, 0, 15, 0, 1, 0.6, 1); for (const a of [0, 2.1, 4.2]) sphere(3, 0xffffff, Math.cos(a) * 10, 15, Math.sin(a) * 10, 1.8, 0.6, 1); return merge(); },
    u_ringgal() { cyl(17, 17, 1.5, 24, W, 0, 17, 0); cyl(12, 12, 2, 24, 0x101020, 0, 17, 0); sphere(5, 0xfff0c0, 0, 17, 0, 1, 0.6, 1); return merge(); },
    u_bulge() { sphere(25, W, 0, 25, 0, 1, 0.8, 1); cyl(34, 34, 1.5, 24, 0xffe8f0, 0, 25, 0); return merge(); },
    u_barred() { cyl(22, 22, 1.5, 24, W, 0, 22, 0); box(27, 3, 6, 0xfff0c0, 0, 22, 0, 0.5); sphere(7, 0xfff8e0, 0, 22, 0, 1, 0.6, 1); return merge(); },
    u_spiral() { cyl(30, 30, 2, 28, W, 0, 30, 0); sphere(10, 0xfff0c0, 0, 30, 0, 1, 0.6, 1); for (const a of [0, 1.6, 3.1, 4.7]) sphere(5, 0xffffff, Math.cos(a) * 19, 30, Math.sin(a) * 19, 2.2, 0.6, 1); return merge(); },
    u_elliptical() { sphere(37, W, 0, 37, 0, 1, 0.6, 0.8); sphere(14, 0xfff8e0, 0, 37, 0); return merge(); },
    u_bigirregular() { sphere(30, W, 0, 45, 0, 1.5, 0.5, 0.9); sphere(24, W, 34, 50, 18, 1.1, 0.5, 0.9); sphere(18, 0xffffff, -24, 40, -16); sphere(10, 0xffffff, 20, 60, -20); return merge(); },
    u_pair() { cyl(28, 28, 2, 24, W, -22, 45, -10); cyl(22, 22, 2, 24, W, 26, 50, 14); sphere(9, 0xfff0c0, -22, 45, -10, 1, 0.6, 1); sphere(7, 0xfff0c0, 26, 50, 14, 1, 0.6, 1); box(40, 2, 6, 0xd8e0ff, 2, 47, 2, 0.5); return merge(); },
    u_bigspiral() { cyl(62, 62, 3, 32, W, 0, 62, 0); sphere(20, 0xfff0c0, 0, 62, 0, 1, 0.6, 1); for (const a of [0, 1.05, 2.1, 3.15, 4.2, 5.25]) sphere(9, 0xffffff, Math.cos(a) * 40, 62, Math.sin(a) * 40, 2.4, 0.6, 1); return merge(); },
    u_giantell() { sphere(65, W, 0, 65, 0, 1, 0.65, 0.85); sphere(26, 0xfff8e0, 0, 65, 0); return merge(); },
    u_quasar() { sphere(40, W, 0, 80, 0); cyl(4, 20, 150, 8, 0xbfe8ff, 0, 155, 0); cyl(20, 4, 150, 8, 0xbfe8ff, 0, 5, 0); cyl(130, 130, 3, 40, 0x9ad6ff, 0, 80, 0); return merge(); },
    u_group() { for (const [x, z, r] of [[0, 0, 60], [95, 40, 40], [-80, 60, 45], [30, -90, 35], [-60, -70, 30]]) { cyl(r, r, 2, 24, W, x, 105, z); sphere(r * 0.3, 0xfff0c0, x, 105, z, 1, 0.6, 1); } return merge(); },
    u_bigquasar() { sphere(60, W, 0, 110, 0); cyl(6, 30, 210, 8, 0xd0f0ff, 0, 215, 0); cyl(30, 6, 210, 8, 0xd0f0ff, 0, 5, 0); cyl(180, 180, 4, 40, 0xbfe8ff, 0, 110, 0); return merge(); },
    u_giantspiral() { cyl(120, 120, 4, 40, W, 0, 120, 0); sphere(38, 0xfff0c0, 0, 120, 0, 1, 0.6, 1); for (let i = 0; i < 8; i++) { const a = i * 0.785; sphere(16, 0xffffff, Math.cos(a) * 78, 120, Math.sin(a) * 78, 2.6, 0.6, 1); } return merge(); },
    u_cluster() { for (let i = 0; i < 9; i++) { const a = i * 0.7, r = i ? 90 + (i % 3) * 40 : 0; cyl(50 - (i % 3) * 10, 50 - (i % 3) * 10, 3, 24, W, Math.cos(a) * r, 165 + Math.sin(i * 1.3) * 60, Math.sin(a) * r); } sphere(40, 0xfff8e0, 0, 165, 0); return merge(); },
    u_wall() { for (let i = -3; i <= 3; i++) { cyl(44, 44, 3, 24, W, i * 55, 190 + Math.sin(i) * 40, i * 12); } box(400, 6, 30, 0xd0d8ff, 0, 190, 0, 0.2); return merge(); },
    u_supercluster() { for (let i = 0; i < 14; i++) { const a = i * 0.9, r = i ? 110 + (i % 4) * 45 : 0; cyl(60 - (i % 3) * 14, 60 - (i % 3) * 14, 3, 24, W, Math.cos(a) * r, 215 + Math.sin(i * 1.1) * 80, Math.sin(a) * r); } sphere(60, 0xfff8e0, 0, 215, 0); return merge(); },
    u_attractor() { sphere(200, W, 0, 280, 0); sphere(280, 0xfff4d6, 0, 280, 0, 1, 0.08, 1); sphere(280, 0xfff4d6, 0, 280, 0, 0.08, 1, 1); sphere(280, 0xfff4d6, 0, 280, 0, 1, 1, 0.08); return merge(); },
    u_everything() { sphere(450, W, 0, 450, 0); cyl(780, 780, 8, 64, 0x9b6bd6, 0, 450, 0); cyl(660, 660, 12, 64, 0x47d1ff, 0, 450, 0); cyl(540, 540, 16, 64, 0xff5fa2, 0, 450, 0); for (let i = 0; i < 16; i++) { const a = i * 0.39; sphere(40 + (i % 3) * 20, 0xffffff, Math.cos(a) * 560, 450 + Math.sin(i * 2.3) * 300, Math.sin(a) * 560); } return merge(); },
    tower() {
      const lc = 0x8b8f94;
      for (const [x, z] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) box(0.5, 18, 0.5, lc, x, 9, z);
      box(6.8, 0.3, 0.3, lc, 0, 8, -3.2); box(6.8, 0.3, 0.3, lc, 0, 8, 3.2); box(0.3, 0.3, 6.8, lc, -3.2, 8, 0); box(0.3, 0.3, 6.8, lc, 3.2, 8, 0);
      box(6.8, 0.3, 0.3, lc, 0, 13.5, -3.2); box(6.8, 0.3, 0.3, lc, 0, 13.5, 3.2); box(0.3, 0.3, 6.8, lc, -3.2, 13.5, 0); box(0.3, 0.3, 6.8, lc, 3.2, 13.5, 0);
      cyl(0.6, 0.6, 18, 8, 0x6f7377, 0, 9, 0);
      cyl(5.2, 4.2, 6.5, 14, W, 0, 20.5, 0); cone(5.4, 2.6, 14, 0x9aa3ab, 0, 25.0, 0); cyl(5.4, 5.4, 0.4, 14, 0x9aa3ab, 0, 17.4, 0);
      return merge();
    },
  };
  return builders;
}

