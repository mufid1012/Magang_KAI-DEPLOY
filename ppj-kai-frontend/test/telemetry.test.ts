import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TelemetryQueue, TelemetryUploader } from '../src/lib/telemetryQueue';
import { VisiblePoller } from '../src/lib/visiblePoller';
import { initialSpeedState, TELEMETRY } from '../../shared/telemetry';
const sample=(i:number)=>({id:`s:${i}`,capturedAt:1800000000000+i*5000,lat:0,lng:0,accuracy:2,deviceSpeed:null});
function storage() { const map=new Map<string,string>();return {getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);}}; }
test('persistent queue survives refresh, acknowledges only accepted IDs, and isolates account/session/server',()=>{
  const store=storage(), q=new TelemetryQueue('api:alice:1',store);
  q.append(sample(0),initialSpeedState());q.append(sample(1),initialSpeedState());
  const restored=new TelemetryQueue('api:alice:1',store);assert.equal(restored.data.samples.length,2);
  restored.acknowledge([sample(0).id]);assert.equal(restored.data.samples.length,1);
  assert.equal(restored.append(sample(1),initialSpeedState()),false);
  for(const key of ['api:bob:1','other:alice:1','api:alice:2']) assert.equal(new TelemetryQueue(key,store).data.samples.length,0);
});
test('full queue preserves unacknowledged data and reports loss; failed storage is explicit',()=>{
  const q=new TelemetryQueue('full',storage());
  for(let i=0;i<=TELEMETRY.MAX_QUEUE;i++)q.append(sample(i),initialSpeedState());
  assert.equal(q.data.samples.length,TELEMETRY.MAX_QUEUE);assert.equal(q.data.lost,1);assert.equal(q.data.samples[0]?.id,'s:0');
  const failed=new TelemetryQueue('failed',{getItem:()=>null,setItem:()=>{throw Error('Quota exceeded')}});
  failed.append(sample(0),initialSpeedState());assert.equal(failed.storageError,true);assert.equal(failed.data.samples.length,1);
});
test('upload taking over ten seconds and concurrent stop-flush share exactly one request',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout']});
  const q=new TelemetryQueue('slow',storage());q.append(sample(0),initialSpeedState());
  let requests=0, active=0,maxActive=0;
  const u=new TelemetryUploader(q,async samples=>{requests++;active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,20000));active--;return samples.map(s=>s.id);});
  const a=u.upload(); t.mock.timers.tick(11000);const b=u.upload();assert.equal(a,b);assert.equal(requests,1);
  const stop=u.flush(Date.now()+45000);t.mock.timers.tick(9000);await Promise.all([a,b,stop]);
  assert.equal(maxActive,1);assert.equal(q.data.samples.length,0);
});
test('offline/retry retains samples until acknowledge, skips empty requests, and enforces bounded stop',async()=>{
  const store=storage();const q=new TelemetryQueue('retry',store);q.append(sample(0),initialSpeedState());let requests=0;
  const u=new TelemetryUploader(q,async samples=>{if(++requests===1)throw Error('offline');return samples.map(s=>s.id)});
  await assert.rejects(u.upload());assert.equal(q.data.samples.length,1);
  const refreshed=new TelemetryQueue('retry',store);assert.equal(refreshed.data.samples.length,1);
  await assert.rejects(u.flush(Date.now()-1));assert.equal(q.data.samples.length,1);
  await u.upload();await u.upload();assert.equal(requests,2);assert.equal(q.data.samples.length,0);
});
test('monitor polling pauses on hidden/closed/logout, backs off, and never overlaps',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let visible=true,calls=0,resolve!:()=>void;
  const p=new VisiblePoller(()=>visible,async signal=>{calls++; await new Promise<void>(r=>{resolve=r;signal.addEventListener('abort',()=>r())});});
  const a=p.poll();await p.poll();assert.equal(calls,1);
  visible=false;p.visibilityChanged();await a;t.mock.timers.tick(60000);assert.equal(calls,1);
  visible=true;p.visibilityChanged();assert.equal(calls,2);p.stop();resolve();await Promise.resolve();t.mock.timers.tick(60000);assert.equal(calls,2);
  let failures=0;const backoff=new VisiblePoller(()=>true,async()=>{failures++;throw Error('network')});
  await backoff.poll();t.mock.timers.tick(10000);assert.equal(failures,1);t.mock.timers.tick(10000);assert.equal(failures,2);backoff.stop();
});
