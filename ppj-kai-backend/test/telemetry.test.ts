import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';

const url = process.env.AUDIT_DATABASE_URL;
if (!url || new URL(url).hostname !== '127.0.0.1' || !new URL(url).pathname.startsWith('/ppj_audit')) throw Error('Use isolated 127.0.0.1/ppj_audit* only');
process.env.DATABASE_URL = url;
process.env.JWT_SECRET = 'telemetry-integration-secret-over-32-characters';
const { createApp }: typeof import('../src/app') = require('../src/app');
const prisma: typeof import('../src/config/database').default = require('../src/config/database').default;
const { generateToken }: typeof import('../src/utils/jwt') = require('../src/utils/jwt');

test('MySQL telemetry: replay, quality, freshness, scopes, stop races, cascade and 20 active PPJ load', async t => {
  const server = createApp().listen(0,'127.0.0.1'); await once(server,'listening');
  const address=server.address(); if (!address || typeof address==='string') throw Error('port');
  const base=`http://127.0.0.1:${address.port}/api`, suffix=Date.now().toString();
  const makeUser=(role:string,n:number,managerId?:number)=>prisma.user.create({data:{nipp:`T${suffix}${n}`,nama:`Telemetry ${role} ${n}`,password:'unused',role,managerId: managerId ?? null}});
  const admin=await makeUser('admin',0), stranger=await makeUser('admin',1), kupt=await makeUser('kupt',2);
  const ppj=await makeUser('ppj',3,admin.id), other=await makeUser('ppj',4,kupt.id), guest=await makeUser('guest',5), qc=await makeUser('qc',6), outsideQc=await makeUser('qc',7);
  const wilayah=await prisma.wilayah.create({data:{kode:`T${suffix}`,nama:'Telemetry scope',stations:'["Sta. Jenar"]',users:{create:{userId:qc.id}}}});
  const taskData={jalur:'Telemetry Jenar',tanggal:new Date(),startPointName:'Sta. Jenar',endPointName:'Sta. Wojo',startPointLat:0,startPointLong:0,endPointLat:0,endPointLong:0,status:'in_progress'};
  const makeSession=async(userId:number)=>{
    const task=await prisma.tugasPpj.create({data:{...taskData,assignedTo:userId}});
    return prisma.tracking.create({data:{tugasId:task.id,startTime:new Date(Date.now()-600000),startLat:0,startLong:0}});
  };
  const tracking=await makeSession(ppj.id), legacy=await makeSession(other.id);
  const request=(path:string,user=ppj,body?:unknown)=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${generateToken(user.id,user.role)}`,'Content-Type':'application/json'},body:body===undefined?null:JSON.stringify(body)});
  const json=async(res:Response,status=200)=>{const data=await res.json();assert.equal(res.status,status,JSON.stringify(data));return data;};
  const epoch=Date.now()-120000;
  const samples=Array.from({length:25},(_,i)=>({id:`gps:${epoch+i*5000}`,capturedAt:epoch+i*5000,lat:0,lng:i*30/111195,accuracy:2,deviceSpeed:6}));
  try {
    await t.test('server recomputes, inserts a batch and deduplicates simultaneous retries and changed IDs',async()=>{
      const payload={samples,speedKmh:999,violation:true};
      const responses=await Promise.all([request(`/tracking/update/${tracking.id}`,ppj,payload),request(`/tracking/update/${tracking.id}`,ppj,payload)]);
      for(const response of responses) {const result=await json(response);assert.equal(result.acknowledged.length,25);assert.ok(result.summary.speedKmh<30);}
      assert.equal(await prisma.trackingSample.count({where:{trackingId:tracking.id}}),25);
      const retry=await json(await request(`/tracking/update/${tracking.id}`,ppj,{samples:[{...samples[24],id:'different-id'}]}));
      assert.equal(retry.acknowledged[0],'different-id');assert.equal(await prisma.trackingSample.count({where:{trackingId:tracking.id}}),25);
      const events=await prisma.speedEvent.findMany({where:{trackingId:tracking.id}});assert.equal(events.length,1);assert.ok(events[0]!.durationMs>=60000);
      assert.equal(events[0]!.isTest,false);
    });
    await t.test('late offline samples are stored without rewinding state or live position',async()=>{
      const before=await prisma.tracking.findUniqueOrThrow({where:{id:tracking.id}});
      await json(await request(`/tracking/update/${tracking.id}`,ppj,{samples:[{...samples[0],id:'late-point',capturedAt:epoch+2500,lng:20}]}));
      const after=await prisma.tracking.findUniqueOrThrow({where:{id:tracking.id}});
      assert.deepEqual(after.telemetryState,before.telemetryState);assert.equal(after.endLong,before.endLong);
      assert.equal((await prisma.trackingSample.findFirstOrThrow({where:{trackingId:tracking.id,sampleId:'late-point'}})).quality,'late');
      const offline=await makeSession(ppj.id);
      await json(await request(`/tracking/update/${offline.id}`,ppj,{samples:samples.slice(0,8)}));
      const row=await prisma.tracking.findUniqueOrThrow({where:{id:offline.id}});assert.equal(row.positionCapturedAt,null);assert.equal(row.endLat,null);
      const detail=await json(await request(`/tracking/${offline.id}/telemetry`));assert.equal(detail.summary.speedKmh,null);
    });
    await t.test('poor accuracy clears current speed, keeps labelled previous position and records loss metadata',async()=>{
      await json(await request(`/tracking/update/${tracking.id}`,ppj,{samples:[{...samples[24],id:'weak',capturedAt:Date.now(),accuracy:80}],reportedLoss:7}));
      const live=await json(await request('/admin/live-positions',admin));
      const pos=live.data.find((p:any)=>p.tugasId===tracking.tugasId);assert.equal(pos.speedKmh,null);assert.equal(pos.quality,'poor_accuracy');assert.equal(pos.reportedLoss,7);
      assert.equal(pos.positionCapturedAt,epoch+120000);assert.equal(pos.accuracy,2);
    });
    await t.test('scope: owner admin, manager KUPT, QC wilayah, own PPJ; guest is denied',async()=>{
      await json(await request(`/tracking/${tracking.id}/telemetry`,admin));await json(await request(`/tracking/${tracking.id}/telemetry`,qc));
      for(const user of [stranger,kupt,other,outsideQc])await json(await request(`/tracking/${tracking.id}/telemetry`,user),404);
      await json(await request(`/tracking/${legacy.id}/telemetry`,kupt));
      for(const path of ['/admin/live-positions',`/tracking/${tracking.id}/telemetry`])await json(await request(path,guest),403);
      const foreign=await json(await request('/admin/live-positions',stranger));assert.equal(foreign.data.length,0);
      await json(await request(`/tracking/update/${tracking.id}`,other,{samples:[]}),409);
      await json(await request(`/tracking/${tracking.id}/telemetry?cursor=NaN`),400);
      const old=await json(await request(`/tracking/${legacy.id}/telemetry`,kupt));assert.equal(old.summary.speedKmh,null);assert.equal(old.summary.averageKmh,null);
    });
    await t.test('payload bounds and future/invalid values fail without partial writes',async()=>{
      for(const bad of [[{...samples[0],capturedAt:Date.now()+60000}],[{...samples[0],lat:91}]]) await json(await request(`/tracking/update/${tracking.id}`,ppj,{samples:bad}),400);
      await json(await request(`/tracking/update/${tracking.id}`,ppj,{samples:Array(121).fill(samples[0])}),413);
      await json(await request(`/tracking/update/${tracking.id}`,ppj,{samples:[],padding:'x'.repeat(65536)}),413);
      await json(await request(`/tracking/update/${tracking.id}`,ppj,{samples:[{...samples[0],id:'expired',capturedAt:Date.now()-90000000}]}));
    });
    await t.test('update/stop serialize; completed sessions reject late writes; optional final batch is atomic',async()=>{
      const stopBody={lat:0,lng:0,fotoSelesai:'end',routePath:[[0,0],[0,0.001]]};
      const results=await Promise.all([request(`/tracking/update/${tracking.id}`,ppj,{samples:[{...samples[24],id:'race',capturedAt:Date.now()+100}]}),request(`/tracking/stop/${tracking.id}`,ppj,stopBody)]);
      assert.ok([200,409].includes(results[0]!.status));await json(results[1]!);
      const before=await prisma.trackingSample.count({where:{trackingId:tracking.id}});
      await json(await request(`/tracking/update/${tracking.id}`,ppj,{samples:[{...samples[24],id:'after-stop',capturedAt:Date.now()+200}]}),409);
      assert.equal(await prisma.trackingSample.count({where:{trackingId:tracking.id}}),before);
      const task=await prisma.tugasPpj.findUniqueOrThrow({where:{id:tracking.tugasId}});assert.equal(task.status,'need_approval');
      const row=await prisma.tracking.findUniqueOrThrow({where:{id:tracking.id}});assert.equal(row.safetyStatus,'aman');
      const final=await makeSession(ppj.id);
      await json(await request(`/tracking/stop/${final.id}`,ppj,{...stopBody,bypassMode:true,samples}));
      assert.equal(await prisma.trackingSample.count({where:{trackingId:final.id}}),25);
      assert.equal((await prisma.speedEvent.findFirstOrThrow({where:{trackingId:final.id}})).isTest,true);
      await prisma.tracking.delete({where:{id:final.id}});assert.equal(await prisma.trackingSample.count({where:{trackingId:final.id}}),0);assert.equal(await prisma.speedEvent.count({where:{trackingId:final.id}}),0);
    });
    await t.test('light local HTTP/MySQL load: 20 PPJ, 3 paced rounds, each uploading 2 samples per ten seconds',async()=>{
      const sessions=[];
      for(let i=0;i<20;i++){const user=await makeUser('ppj',20+i,admin.id);sessions.push({user,tracking:await makeSession(user.id)});}
      const latencies:number[]=[],pollLatencies:number[]=[],sizes:number[]=[],start=performance.now();let errors=0;
      for(let round=0;round<3;round++) {
        if(round)await wait(Math.max(0,round*10000-(performance.now()-start)));
        await Promise.all(sessions.map(async({user,tracking:session})=>{
          const now=Date.now();const batch=[0,1].map(i=>({id:`r:${round}:${i}`,capturedAt:now-5000+i*5000,lat:0,lng:(round*2+i)*7/111195,accuracy:3,deviceSpeed:1.4}));
          const began=performance.now();const res=await request(`/tracking/update/${session.id}`,user,{samples:batch});await res.arrayBuffer();latencies.push(performance.now()-began);if(res.status!==200)errors++;
        }));
        const began=performance.now(),res=await request('/admin/live-positions',admin),body=await res.text();pollLatencies.push(performance.now()-began);sizes.push(Buffer.byteLength(body));if(res.status!==200)errors++;
      }
      assert.equal(errors,0);
      const percentile=(items:number[],p:number)=>[...items].sort((a,b)=>a-b)[Math.ceil(items.length*p)-1];
      const result={activePpj:20,rounds:3,uploadRequests:latencies.length,samples:120,errors,elapsedSeconds:(performance.now()-start)/1000,
        uploadP50Ms:percentile(latencies,.5),uploadP95Ms:percentile(latencies,.95),uploadMaxMs:Math.max(...latencies),
        livePollMs:pollLatencies,livePayloadBytes:sizes,environment:'Local Windows, Node '+process.version+', MySQL 8.0.30, isolated audit DB; no production capacity claim'};
      console.log('TELEMETRY_LOAD',JSON.stringify(result));
      writeFileSync('test/telemetry-load-result.json',JSON.stringify(result,null,2)+'\n');
    });
  } finally {
    server.close();await once(server,'close');
    // Test fixtures only. Cascade behavior is also exercised above.
    const users=await prisma.user.findMany({where:{nipp:{startsWith:`T${suffix}`}},select:{id:true}}),ids=users.map(u=>u.id);
    await prisma.tracking.deleteMany({where:{tugas:{assignedTo:{in:ids}}}});await prisma.tugasPpj.deleteMany({where:{assignedTo:{in:ids}}});
    await prisma.user.deleteMany({where:{id:{in:ids.filter(id=>![admin.id,stranger.id,kupt.id].includes(id))}}});
    await prisma.user.deleteMany({where:{id:{in:[admin.id,stranger.id,kupt.id]}}});await prisma.wilayah.delete({where:{id:wilayah.id}});await prisma.$disconnect();
  }
});
