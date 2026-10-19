import { legacyReplayUrl } from '../src/lib/legacyReplay';
import { fetchRailwayGeometry } from '../src/lib/railway';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CameraSession } from '../src/lib/cameraSession';
import { compactRoute, parseRoute } from '../../shared/route';
import { StableMinQueue } from '../../shared/priorityQueue';
import { petugasColor, formatDuration } from '../../shared/display';
import { haversineMeters, haversineKm, formatDistanceKm } from '../../shared/geo';
import { STATIONS, GUEST_STATIONS } from '../../shared/stations';
import { resolveTugasStatus } from '../src/lib/tugasStatus';

test('heap matches stable sorted queue for duplicates and ties',()=>{
 const q=new StableMinQueue<number>();const expected:{value:number;priority:number}[]=[];
 for(let i=0;i<3000;i++){const priority=(i*997)%101;q.push(i,priority);expected.push({value:i,priority});}
 expected.sort((a,b)=>a.priority-b.priority);
 assert.deepEqual(Array.from({length:3000},()=>q.pop()),expected.map(x=>x.value));assert.equal(q.pop(),undefined);
});
test('long GPS sessions retain endpoints, numeric storage and valid bounds',()=>{
 const source=Array.from({length:28800},(_,i)=>[-7+i/100000,110+i/100000] as [number,number]);
 const compact=compactRoute(source);assert.equal(compact.length,20000);assert.deepEqual(compact[0],source[0]);assert.deepEqual(compact.at(-1),source.at(-1));
 assert.deepEqual(parseRoute('[["-7","110"],[-7.1,110.1]]'),[[-7,110],[-7.1,110.1]]);
 for(const value of ['bad',[[NaN,110]],[[91,110]],[[null,110]],[[0,181]],[[0,0,1]]]) assert.equal(parseRoute(value),null);
});
test('camera streams are stopped on close and when a late permission promise resolves',async()=>{
 const session=new CameraSession();let stopped=0;let resolve!:(stream:MediaStream)=>void;
 const stream={getTracks:()=>[{stop:()=>stopped++}]} as unknown as MediaStream;
 const opening=session.open(()=>new Promise(done=>{resolve=done}));session.stop();resolve(stream);assert.equal(await opening,null);assert.equal(stopped,1);
 await session.open(async()=>stream);session.stop();assert.equal(stopped,2);assert.equal(session.stream,null);
});
test('pure helpers retain color algorithm, numeric distance, format and route subsets',()=>{
 for(const nipp of ['KAI-1234','ADMIN-001','long'.repeat(100)]){let hash=0;for(let i=0;i<nipp.length;i++){hash=nipp.charCodeAt(i)+((hash<<5)-hash);hash=hash&hash;}assert.equal(petugasColor(nipp),`hsl(${(Math.abs(hash)*137)%360}, 65%, 42%)`);}
 assert.equal(haversineMeters(0,0,0,0),0);assert.ok(haversineMeters(0,0,0,180)>20000000);assert.equal(typeof haversineKm(0,0,0,1),'number');assert.equal(formatDistanceKm(0,0,0,1),'111.2');
 assert.equal(formatDuration(3600),'1j 0m');assert.equal(STATIONS.length,15);assert.equal(GUEST_STATIONS.length,14);assert.equal(GUEST_STATIONS.at(-1)?.name,'Sta. Kedungbanteng');assert.ok(STATIONS.some(s=>s.name==='Sta. Wonogiri'));
});
test('legacy completed assignments still require approval on frontend',()=>{
 assert.equal(resolveTugasStatus({status:'completed',tracking:[{status:'stopped',approvalStatus:'not_approved'}]}).status,'need_approval');
 assert.equal(resolveTugasStatus({status:'need_approval',tracking:[{status:'stopped',approvalStatus:'approved'}]}).status,'completed');
});

test('legacy replay never sends a different account token or another API destination',()=>{
 const token='current',headers={Authorization:'Bearer current'},base='http://localhost:5001/api';
 assert.equal(legacyReplayUrl('laporan',headers,token,base,'http://localhost:3000')?.href,'http://localhost:5001/api/laporan');
 for(const [url,h] of [['http://evil.test/api/laporan',headers],['http://localhost:5001/other',headers],['laporan',{Authorization:'Bearer old-account'}],['laporan',undefined]] as const) assert.equal(legacyReplayUrl(url,h,token,base,'http://localhost:3000'),null);
});
test('concurrent identical railway requests are deduplicated and retain the route',async()=>{
 const original=globalThis.fetch;let requests=0;
 globalThis.fetch=async()=>{requests++;await Promise.resolve();return new Response(JSON.stringify({elements:[{type:'way',geometry:[{lat:-7.8,lon:110},{lat:-7.801,lon:110.001},{lat:-7.802,lon:110.002}]}]}),{status:200});};
 try {
  const first=fetchRailwayGeometry(-7.8,110,-7.802,110.002),second=fetchRailwayGeometry(-7.8,110,-7.802,110.002);
  assert.equal(first,second);assert.deepEqual(await first,[[[-7.8,110],[-7.801,110.001],[-7.802,110.002]]]);assert.equal(requests,1);
 } finally { globalThis.fetch=original; }
});
