import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].map(x=>x[1]);
const context=vm.createContext({console});
vm.runInContext(scripts[1],context);
const THREE=context.THREE,game=vm.runInContext(scripts[0]+'\nTornadoGame;',context);
const builders=game.makeGeometryBuilders(THREE);

test('smooth analytical sphere normals survive the actual game geometry merge',()=>{
  const g=builders.trash(),p=g.attributes.position,n=g.attributes.normal;
  const sphere=new THREE.SphereGeometry(.3,game.GRAPHICS.smallSphereSegments,12).toNonIndexed();
  let minimum=1;
  for(let i=0;i<sphere.attributes.position.count;i++){
    const normal=new THREE.Vector3(p.getX(i)/(.3*.3),(p.getY(i)-.26)/(.255*.255),p.getZ(i)/(.3*.3)).normalize();
    minimum=Math.min(minimum,normal.dot(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i))));
  }
  assert.ok(minimum>=.99,`radial normal alignment ${minimum} must be >= .99`);sphere.dispose();g.dispose();
});

test('all procedural game meshes have finite, unit-length normals and positions',()=>{
  for(const [name,build] of Object.entries(builders)){
    const g=build(),p=g.attributes.position,n=g.attributes.normal;
    assert.equal(n.count,p.count,name);
    for(let i=0;i<p.count;i++){
      assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)),name);
      const length=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));
      assert.ok(Math.abs(length-1)<.001,`${name}: invalid normal length ${length}`);
    }
    g.dispose();
  }
});

test('bevels preserve model dimensions and flat face centers',()=>{
  for(const dimensions of [[4.3,.55,1.85],[10,4.6,8],[.55,.5,.12]]){
    const g=game.roundedBoxGeometry(THREE,...dimensions);g.computeBoundingBox();
    const extent=g.boundingBox.getSize(new THREE.Vector3());
    [extent.x,extent.y,extent.z].forEach((value,i)=>assert.ok(Math.abs(value-dimensions[i])<1e-5));
    const n=g.attributes.normal;let flat=0,curved=0;
    for(let i=0;i<n.count;i++){
      const components=[Math.abs(n.getX(i)),Math.abs(n.getY(i)),Math.abs(n.getZ(i))];
      if(Math.max(...components)>.9999)flat++;else curved++;
    }
    assert.ok(flat>0&&curved>0,'beveled, not a sharp box or inflated sphere');g.dispose();
  }
});

test('reference-size circular silhouette error stays below .75 CSS pixel',()=>{
  // This is a geometric bound at these reference radii, not a perceptual score or every possible camera pose.
  for(const [label,radius,segments] of [['funnel',200,game.GRAPHICS.funnelSegments],['round town object',150,game.GRAPHICS.roundSegments],['tiny object',30,game.GRAPHICS.smallSphereSegments],['space rock',60,game.GRAPHICS.rockSegments]]){
    const error=radius*(1-Math.cos(Math.PI/segments));assert.ok(error<=.75,`${label}: ${error.toFixed(3)}px`);
  }
  assert.ok(game.GRAPHICS.funnelRows>=40);
});

test('Retina resolution and antialiasing defaults cannot silently regress',()=>{
  assert.equal(game.TUNING.ANTIALIAS,true);assert.equal(game.TUNING.MAX_DPR,2);
  // The browser gate independently checks the actual WebGL context/backing store.
});
