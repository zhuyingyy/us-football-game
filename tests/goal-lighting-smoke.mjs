// Visual regression: the aim guide must render in front of the goal while reflections follow it.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const b=await chromium.launch({channel:'chrome',headless:true});
const errors=[];
try{
 const p=await b.newPage({viewport:{width:390,height:822},deviceScaleFactor:2});
 p.on('pageerror',e=>errors.push(e.message));
 await mkdir('outputs',{recursive:true});
 const sampleMaterial=async()=>{
  const samples=[];
  for(const [x,y] of [[390,900],[389,813],[330,795],[257,650]]){
   samples.push(await p.evaluate(({x,y})=>new Promise(resolve=>{
    window.__FIELD_GOAL_GAME__.renderer.snapshotPixel(x,y,c=>resolve([c.red,c.green,c.blue]));
   }),{x,y}));
  }
  return samples;
 };
 await p.goto(process.env.GAME_URL || 'http://localhost:5173/');
 await p.waitForFunction(()=>window.__FIELD_GOAL_GAME__?.scene.getScene('Game')?.sys.isActive());
 await p.evaluate(()=>{const s=window.__FIELD_GOAL_GAME__.scene.getScene('Game');s.scene.pause();s.goalVisual={centerX:390,scale:1};s.round.pattern='ANGLE';s.aimVisual={x:390,windOffset:0};s.ball.prepare(390);s.visualTime=0;s.refreshGoal();s.drawAim();});
 await p.screenshot({path:'outputs/goal-environment-normal.png'});
 const normal=await sampleMaterial();
 await p.evaluate(()=>{const s=window.__FIELD_GOAL_GAME__.scene.getScene('Game');s.round.pattern='GOLD';s.refreshGoal();s.drawAim();});
 await p.screenshot({path:'outputs/goal-environment-gold.png'});
 const gold=await sampleMaterial();
 await p.evaluate(()=>{const s=window.__FIELD_GOAL_GAME__.scene.getScene('Game');s.aim.setVisible(false);s.marker.setVisible(false);});
 await p.screenshot({path:'outputs/goal-environment-clear.png'});
 const clear=await sampleMaterial();
 assert.ok(await p.evaluate(()=>{const s=window.__FIELD_GOAL_GAME__.scene.getScene('Game');return s.aim.depth>s.goal.depth&&s.marker.depth>s.goal.depth&&!s.aim.mask&&!s.marker.mask;}),'Aim guide and target must stay visibly above the goal');
 for(const [x,scale,name] of [[190,.752,'left'],[590,.608,'right']]) {
  const geometry=await p.evaluate(({x,scale})=>{const s=window.__FIELD_GOAL_GAME__.scene.getScene('Game');s.goalVisual={centerX:x,scale};s.refreshGoal();return [s.goal,s.goalLightLeft,s.goalLightRight].map(v=>[v.x,v.y,v.displayWidth,v.displayHeight]);},{x,scale});
  assert.deepEqual(geometry[0],geometry[1]);assert.deepEqual(geometry[0],geometry[2]);
  await p.screenshot({path:`outputs/goal-environment-${name}.png`});
 }
 assert.deepEqual(errors,[]);console.log('PASS: aim guide stays above the goal; reflections follow movement and scale; no browser errors.');
}finally{await b.close();}
