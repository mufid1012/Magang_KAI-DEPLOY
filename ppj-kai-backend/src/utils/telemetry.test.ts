import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceSpeed, initialSpeedState, speedSummary, validSampleShape, TELEMETRY } from '../../../shared/telemetry';
import type { TelemetrySample } from '../../../shared/telemetry';
import { parseBatch } from '../lib/telemetry';
const epoch = 1800000000000;
function sample(t: number, meters: number, speed: number | null = null, accuracy = 2): TelemetrySample {
  return { id: `s:${t}`, capturedAt: epoch + t * 1000, lat: 0, lng: meters / 111195, accuracy, deviceSpeed: speed };
}
function simulate(points: TelemetrySample[]) {
  let state = initialSpeedState(); const events = [];
  for (const p of points) { const r = advanceSpeed(state,p); state = r.state; if (r.event) events.push(r.event); }
  return {state,events};
}
test('stationary jitter and displacements below uncertainty are zero after warmup, never a review', () => {
  for (const device of [null,0]) {
    const {state,events} = simulate(Array.from({length:60},(_,i)=>sample(i*5, (i%3-1)*3, device,10)));
    assert.equal(state.speedKmh,0); assert.equal(state.distanceM,0); assert.equal(events.length,0);
  }
});
test('stable walking uses a conservative multi-point fallback; device speed includes valid zero', () => {
  const points = Array.from({length:20},(_,i)=>sample(i*5,i*7));
  const {state,events} = simulate(points);
  assert.ok(state.speedKmh! > 3 && state.speedKmh! < 5.1); assert.equal(events.length,0);
  assert.ok(state.durationMs > 0); assert.ok(speedSummary(state,epoch+95000).averageKmh! > 3);
  const device = simulate(points.map(p=>({...p,deviceSpeed:1.4}))).state;
  assert.ok(Math.abs(device.speedKmh!-5.04)<0.01); assert.equal(device.quality,'device');
});
test('starting and stopping settle without stale smoothing tails', () => {
  const points = Array.from({length:9},(_,i)=>sample(i*5,i*7,1.4));
  points.push(...Array.from({length:9},(_,i)=>sample(45+i*5,56,0)));
  const {state}=simulate(points); assert.equal(state.speedKmh,0); assert.equal(state.streak,null);
});
test('sustained fast movement produces an interval after 60 captured seconds, independent of requests', () => {
  const {state,events}=simulate(Array.from({length:25},(_,i)=>sample(i*5,i*30,6)));
  assert.equal(state.reviewCount,1); assert.ok(events.length>0);
  assert.equal(events[0]!.durationMs,60000); assert.ok(events[0]!.sampleCount>=13);
  assert.ok(events[0]!.worstAccuracy<=20); assert.equal(speedSummary(state,epoch+120000,true).reviewCount,0);
});
test('one teleport, one device spike, bad accuracy and a gap break the review sequence', () => {
  const walking=Array.from({length:25},(_,i)=>sample(i*5,i*7));
  walking[8]=sample(40,10000,50); assert.equal(simulate(walking).events.length,0);
  const fast=Array.from({length:25},(_,i)=>sample(i*5,i*30,6));
  fast[12]={...fast[12]!,accuracy:100}; assert.equal(simulate(fast).events.length,0);
  const before=simulate(fast.slice(0,10)).state;
  const after=advanceSpeed(before,sample(100,600,6)).state;
  assert.equal(after.speedKmh,null); assert.equal(after.streak,null); assert.equal(after.durationMs,before.durationMs);
  const spike=walking.map(p=>({...p,deviceSpeed: p.capturedAt===epoch+60000?30:null}));
  assert.equal(simulate(spike).events.length,0);
});
test('a smaller isolated spike below the physical ceiling does not become speed or distance', () => {
  const points=Array.from({length:18},(_,i)=>sample(i*5,i===3?100:0));
  const {state,events}=simulate(points);
  assert.equal(state.speedKmh,0);assert.equal(state.distanceM,0);assert.equal(events.length,0);
});
test('invalid device speeds fall back, invalid coordinates are rejected; null and 0 stay distinct', () => {
  for (const speed of [-1,100]) {
    const {state}=simulate(Array.from({length:9},(_,i)=>sample(i*5,i*7,speed)));
    assert.equal(state.quality,'coordinates');
  }
  assert.equal(validSampleShape({...sample(0,0),lat:NaN}),false);
  assert.equal(validSampleShape({...sample(0,0),deviceSpeed:Infinity}),false);
  assert.equal(validSampleShape(sample(0,0,0)),true); assert.equal(validSampleShape(sample(0,0,null)),true);
  assert.throws(()=>parseBatch([{...sample(0,0),deviceSpeed:'0'}],epoch));
});
test('duplicate/backward/late timestamps never rewind or double count; a timer cannot create speed', () => {
  const {state}=simulate(Array.from({length:10},(_,i)=>sample(i*5,i*7)));
  assert.equal(advanceSpeed(state,sample(45,300)).state,state);
  assert.equal(advanceSpeed(state,sample(20,300)).state,state);
  const old=speedSummary(state,epoch+45000+TELEMETRY.FRESH_MS+1);
  assert.equal(old.speedKmh,null); assert.equal(old.quality,'stale');
  assert.equal(speedSummary(null,epoch).speedKmh,null);
  assert.equal(advanceSpeed(state,sample(50,70),epoch+100000).state.speedKmh,null);
  assert.throws(()=>parseBatch([sample(900,0)],epoch));
});
test('frequent GPS callbacks keep the calculation state bounded and can still estimate', () => {
  let state=initialSpeedState();
  for(let i=0;i<1000;i++) {
    state=advanceSpeed(state,{...sample(0,0),id:`f:${i}`,capturedAt:epoch+i*100}).state;
    assert.ok(state.window.length<=21);
  }
  assert.equal(state.speedKmh,0);
});
