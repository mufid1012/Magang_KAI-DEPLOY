import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import bcrypt from 'bcryptjs';
import { createCanvas } from 'canvas';
import ExcelJS from 'exceljs';
import { execFileSync } from 'node:child_process';

// Explicit opt-in: this suite never accepts the application/production database URL.
const url = process.env.AUDIT_DATABASE_URL;
if (!url || new URL(url).hostname !== '127.0.0.1' || !new URL(url).pathname.startsWith('/ppj_audit')) {
  throw new Error('AUDIT_DATABASE_URL must point to an isolated local ppj_audit* database');
}
process.env.DATABASE_URL = url;
process.env.JWT_SECRET = 'audit-integration-secret-with-more-than-32-characters';
process.env.TRACKING_BYPASS_ENABLED = 'true';
const { createApp }: typeof import('../src/app') = require('../src/app');
const prisma: typeof import('../src/config/database').default = require('../src/config/database').default;

test('real MySQL: roles, assignment, tracking, reports, approval, PDF, import, bypass and scheduler', async t => {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server,'listening');
  const address=server.address(); if (!address || typeof address==='string') throw new Error('No port');
  const base=`http://127.0.0.1:${address.port}/api`;
  const suffix=Date.now().toString();
  const password=await bcrypt.hash('test-password',10);
  const admin=await prisma.user.create({data:{nipp:'A'+suffix,nama:'Audit Admin',password,role:'admin'}});
  const otherAdmin=await prisma.user.create({data:{nipp:'B'+suffix,nama:'Other Admin',password,role:'admin'}});
  const ppj=await prisma.user.create({data:{nipp:'P'+suffix,nama:'Audit PPJ',password,role:'ppj',managerId:admin.id}});
  const other=await prisma.user.create({data:{nipp:'O'+suffix,nama:'Other PPJ',password,role:'ppj',managerId:otherAdmin.id}});
  const wilayah=await prisma.wilayah.create({data:{kode:'A'+suffix,nama:'Audit region',stations:JSON.stringify(['Sta. Jenar','Sta. Wojo'])}});
  const qc=await prisma.user.create({data:{nipp:'Q'+suffix,nama:'Audit QC',password,role:'qc',wilayahAssignments:{create:{wilayahId:wilayah.id}}}});
  const kupt=await prisma.user.create({data:{nipp:'K'+suffix,nama:'Audit KUPT',password,role:'kupt'}});
  const guest=await prisma.user.create({data:{nipp:'G'+suffix,nama:'Audit Guest',password,role:'guest'}});
  const users=[admin,otherAdmin,ppj,other,qc,kupt,guest];
  const tokens=new Map<number,string>();
  const request=(path:string,method='GET',body?:unknown,user=admin.id) => fetch(base+path,{method,headers:{...(body ? {'Content-Type':'application/json'} : {}),...(tokens.has(user)?{Authorization:'Bearer '+tokens.get(user)}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const json=async(response:Response,status:number)=>{const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;};
  let taskId=0,trackingId=0;
  try {
    for (const user of users) {
      const data=await json(await request('/auth/login','POST',{nipp:user.nipp,password:'test-password'},0),200);tokens.set(user.id,data.token);
    }
    await t.test('route protection and malformed IDs do not leak managed tasks',async()=>{
      await json(await request('/admin/tugas','GET',undefined,0),401);
      for(const id of [ppj.id,guest.id]) await json(await request('/admin/tugas','GET',undefined,id),403);
      await json(await request('/admin/tugas/12x'),400);
      await json(await request('/admin/tugas/template','GET',undefined,qc.id),403);
      await json(await request('/tracking/train-alerts','GET',undefined,ppj.id),200);
      await json(await request('/tracking/warnings/nearby?tugasId=1&lat=-7&lng=110','GET',undefined,ppj.id),200);
    });
    const assignment={jalur:'Audit Jenar-Wojo',tanggal:'2026-10-19',assignedTo:ppj.id,startPointName:'Sta. Jenar',endPointName:'Sta. Wojo',startPointLat:-7.802037,startPointLong:110.000797,endPointLat:-7.862278,endPointLong:110.041092};
    await t.test('manual assignments share date/time/active-user checks and accept zero coordinates',async()=>{
      await json(await request('/admin/tugas','POST',{...assignment,tanggal:'2026-02-30'}),400);
      await json(await request('/admin/tugas','POST',{...assignment,jamMulai:'25:00'}),400);
      await prisma.user.update({where:{id:ppj.id},data:{isActive:false}});
      await json(await request('/admin/tugas','POST',assignment),403);
      await prisma.user.update({where:{id:ppj.id},data:{isActive:true}});
      const zero=await json(await request('/admin/tugas','POST',{...assignment,startPointLat:0,startPointLong:0,jamMulai:0.33333333333}),201);
      assert.equal(zero.data.jamMulai,'08:00');
      const data=await json(await request('/admin/tugas','POST',assignment),201);taskId=data.data.id;
      const own=await json(await request(`/admin/tugas/${taskId}`),200);assert.equal(own.data.assignedTo,ppj.id);
      await json(await request(`/admin/tugas/${taskId}`,'GET',undefined,otherAdmin.id),404);
      await json(await request(`/admin/tugas/${taskId}`,'GET',undefined,qc.id),200);
      await json(await request(`/admin/tugas/${taskId}`,'GET',undefined,kupt.id),404);
      await json(await request('/admin/tugas','POST',assignment,qc.id),403);
    });
    await t.test('normal tracking requires both photo and geofence; repeated start is rejected',async()=>{
      await json(await request(`/tracking/start/${taskId}`,'POST',{lat:0,lng:0,fotoAwal:'selfie'},ppj.id),400);
      await json(await request(`/tracking/start/${taskId}`,'POST',{lat:assignment.startPointLat,lng:assignment.startPointLong},ppj.id),400);
      const data=await json(await request(`/tracking/start/${taskId}`,'POST',{lat:assignment.startPointLat,lng:assignment.startPointLong,fotoAwal:'selfie'},ppj.id),200);trackingId=data.trackingId;
      await json(await request(`/tracking/start/${taskId}`,'POST',{lat:assignment.startPointLat,lng:assignment.startPointLong,fotoAwal:'selfie'},ppj.id),409);
      await json(await request(`/tracking/update/${trackingId}`,'POST',{lat:assignment.endPointLat,lng:assignment.endPointLong},ppj.id),200);
      await json(await request(`/tracking/update/${trackingId}`,'POST',{lat:0,lng:0},other.id),404);
    });
    const category='darurat_kategori_panjang_'+suffix;
    await t.test('long dynamic categories, large photos and severity statistics stay consistent',async()=>{
      await json(await request('/admin/kategori-temuan','POST',{key:category,label:'Audit custom emergency',icon:'warning',color:'error'}),201);
      const canvas=createCanvas(256,256),ctx=canvas.getContext('2d'),image=ctx.createImageData(256,256);
      let seed=12345;for(let i=0;i<image.data.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;image.data[i]=seed&255;}
      ctx.putImageData(image,0,0);const photo=canvas.toDataURL('image/png');assert.ok(photo.length>65535);
      const report={trackingId,jenisTemuan:category,deskripsi:'Audit finding',lat:assignment.endPointLat,lng:assignment.endPointLong,fotoUrl:photo};
      await json(await request('/laporan','POST',report,other.id),404);
      await json(await request('/laporan','POST',{...report,jenisTemuan:'unknown'},ppj.id),400);
      await json(await request('/laporan','POST',report,ppj.id),200);
      const stats=await json(await request('/admin/stats'),200);assert.ok(stats.data.laporanDarurat>=1);
      const summary=await json(await request('/tugas/summary','GET',undefined,ppj.id),200);assert.equal(summary.data.emergencyReports,1);
      const lists=await json(await request('/admin/tugas?summary=true'),200);
      const task=lists.data.find((row:any)=>row.id===taskId);assert.equal(task.tracking[0].fotoAwal,undefined);assert.equal(task.tracking[0].laporan[0].foto,undefined);
      const detail=await json(await request(`/admin/tugas/${taskId}`),200);assert.equal(detail.data.tracking[0].laporan[0].foto,photo);
    });
    await t.test('8-hour high-frequency routes complete, need approval, then allow a real PDF',async()=>{
      const route=Array.from({length:28800},(_,i)=>[assignment.startPointLat+(assignment.endPointLat-assignment.startPointLat)*i/28799,assignment.startPointLong+(assignment.endPointLong-assignment.startPointLong)*i/28799]);
      await json(await request(`/tracking/stop/${trackingId}`,'POST',{lat:0,lng:0,fotoSelesai:'end'},ppj.id),400);
      await json(await request(`/tracking/stop/${trackingId}`,'POST',{lat:assignment.endPointLat,lng:assignment.endPointLong,fotoSelesai:'end',routePath:route},ppj.id),200);
      const row=await prisma.tracking.findUniqueOrThrow({where:{id:trackingId},include:{tugas:true}});assert.equal(row.tugas.status,'need_approval');assert.equal(JSON.parse(row.routePath!).length,20000);
      assert.deepEqual(JSON.parse(row.routePath!)[0],route[0]);assert.deepEqual(JSON.parse(row.routePath!).at(-1),route.at(-1));
      await json(await request(`/tugas/${taskId}/report`,'GET',undefined,ppj.id),403);
      await json(await request(`/admin/tracking/${trackingId}/approve`,'POST',{safetyStatus:'tidak_aman'},qc.id),403);
      await json(await request(`/admin/tracking/${trackingId}/approve`,'POST',{safetyStatus:'tidak_aman'}),200);
      // Omit external tile network from this integration check; the PDF fallback still executes.
      await prisma.tracking.update({where:{id:trackingId},data:{routePath:null,fotoAwal:null,fotoSelesai:null}});
      const pdf=await request(`/tugas/${taskId}/report`,'GET',undefined,ppj.id);assert.equal(pdf.status,200);assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,4).toString(),'%PDF');
    });
    await t.test('bypass remains available for missed tasks, start and stop without photos/geofence',async()=>{
      const data=await json(await request('/admin/tugas','POST',assignment),201);const id=data.data.id;
      await prisma.tugasPpj.update({where:{id},data:{status:'missed'}});
      const started=await json(await request(`/tracking/start/${id}`,'POST',{lat:0,lng:0,bypassMode:true},ppj.id),200);
      await json(await request(`/tracking/stop/${started.trackingId}`,'POST',{lat:0,lng:0,bypassMode:true,routePath:[[0,0],[0,0.1]]},ppj.id),200);
      process.env.TRACKING_BYPASS_ENABLED='false';
      const second=await json(await request('/admin/tugas','POST',assignment),201);
      await json(await request(`/tracking/start/${second.data.id}`,'POST',{lat:0,lng:0,bypassMode:true},ppj.id),400);
      process.env.TRACKING_BYPASS_ENABLED='true';
    });
    await t.test('Excel import matches manual normalization and does not steal other managers staff',async()=>{
      const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Tugas');sheet.addRow(['NIPP','Nama','Awal','Akhir','Tanggal','Mulai','Selesai']);sheet.addRow([ppj.nipp,'PPJ','Jenar','Wojo','2026-10-20',1/3,0.5]);sheet.addRow([other.nipp,'Other','Jenar','Wojo','2026-10-20',1/3,0.5]);
      const form=new FormData();form.append('file',new Blob([new Uint8Array(await workbook.xlsx.writeBuffer())],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'audit.xlsx');
      const response=await fetch(base+'/admin/tugas/import',{method:'POST',headers:{Authorization:'Bearer '+tokens.get(admin.id)},body:form});const data=await json(response,200);assert.equal(data.data.created,1);assert.equal(data.data.failed,1);
      const imported=await prisma.tugasPpj.findFirstOrThrow({where:{assignedTo:ppj.id,tanggal:new Date('2026-10-20')}});assert.equal(imported.jamMulai,'08:00');assert.equal(imported.jamSelesai,'12:00');
    });
    await t.test('real scheduler catches up expired dates without changing completed assignments',async()=>{
      const {checkMissedTasks}=require('../src/lib/scheduler') as typeof import('../src/lib/scheduler');
      const expired=await prisma.tugasPpj.create({data:{...assignment,tanggal:new Date('2026-10-18'),jamMulai:'08:00'}});
      assert.ok(await checkMissedTasks(new Date('2026-10-21T03:00:00Z'))>=1);
      assert.equal((await prisma.tugasPpj.findUniqueOrThrow({where:{id:expired.id}})).status,'missed');
      assert.equal((await prisma.tugasPpj.findUniqueOrThrow({where:{id:taskId}})).status,'completed');
    });
    await t.test('schema reconciliation is idempotent and preserves populated records',async()=>{
      const before=await prisma.user.count();
      for(let i=0;i<2;i++) execFileSync(process.execPath,[require.resolve('prisma/build/index.js'),'db','execute','--file','prisma/migrations/20261019120000_complete_legacy_schema/migration.sql','--url',url!],{stdio:'pipe'});
      assert.equal(await prisma.user.count(),before);
      assert.equal((await prisma.tugasPpj.findUniqueOrThrow({where:{id:taskId}})).status,'completed');
      assert.equal((await prisma.laporan.findFirstOrThrow({where:{trackingId}})).jenisTemuan,category);
    });
    await t.test('deactivated users lose access despite an existing JWT',async()=>{
      await prisma.user.update({where:{id:ppj.id},data:{isActive:false}});
      await json(await request('/tugas','GET',undefined,ppj.id),401);
    });
  } finally {
    server.close();await once(server,'close');await prisma.$disconnect();
  }
});
