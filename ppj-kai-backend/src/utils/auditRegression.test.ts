import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { parseAssignmentDate, assignmentTimes } from './assignmentValidation';
import { scheduledStart } from './schedule';
import { ExpiringCache } from '../lib/mapLocationCache';
import prisma from '../config/database';
import { taskScope } from '../lib/accessScope';
import { emergencyCategoryKeys } from '../lib/reportSeverity';
const original={assignments:prisma.userWilayah.findMany,categories:prisma.kategoriTemuan.findMany};
afterEach(()=>{prisma.userWilayah.findMany=original.assignments;prisma.kategoriTemuan.findMany=original.categories;});
test('assignment dates and spreadsheet/manual hours follow the same contract',()=>{
 assert.equal(parseAssignmentDate('2026-02-30'),null);assert.equal(parseAssignmentDate('invalid'),null);
 assert.equal(parseAssignmentDate('2026-10-19')?.toISOString(),'2026-10-19T00:00:00.000Z');
 // Indonesian order DD-MM-YYYY: never read month-first (10/07 is 10 July, not 7 October), any letter case for month names.
 for (const text of ['10-07-2026','10/07/2026','10.07.2026','10 07 2026','10-7-2026','10 Juli 2026','10 JULI 2026','10-jul-2026','10 Jul  2026'])
  assert.equal(parseAssignmentDate(text)?.toISOString(),'2026-07-10T00:00:00.000Z',text);
 assert.equal(parseAssignmentDate('1-2-2026')?.toISOString(),'2026-02-01T00:00:00.000Z');
 assert.equal(parseAssignmentDate('17 Agt 2026')?.toISOString(),'2026-08-17T00:00:00.000Z');
 for (const text of ['31-04-2026','29-02-2026','13-13-2026','10-07-26','2026-07-10T00:00','10 Juliana 2026','07/10/2026x'])
  assert.equal(parseAssignmentDate(text),null,text);
 assert.equal(parseAssignmentDate('29-02-2028')?.toISOString(),'2028-02-29T00:00:00.000Z');
 assert.equal(parseAssignmentDate(' 2026-07-10 ')?.toISOString(),'2026-07-10T00:00:00.000Z');
 assert.equal(parseAssignmentDate(46213)?.toISOString(),'2026-07-10T00:00:00.000Z');
 assert.deepEqual(assignmentTimes(1/3,'12:00'),{jamMulai:'08:00',jamSelesai:'12:00'});assert.equal(assignmentTimes('24:01','12:00'),null);
 assert.equal(scheduledStart('2026-10-19','00:30')?.toISOString(),'2026-10-18T17:30:00.000Z');assert.equal(scheduledStart('2026-10-19','bad'),null);
});
test('bounded geocoding cache expires and evicts oldest keys',()=>{
 const cache=new ExpiringCache<number>(2,10);cache.set('a',1,0);cache.set('b',2,1);cache.set('c',3,2);
 assert.equal(cache.size,2);assert.equal(cache.get('a',2),undefined);assert.equal(cache.get('b',11),undefined);cache.set('d',4,20);assert.equal(cache.size,1);assert.equal(cache.get('d',20),4);
});
test('scope avoids unnecessary managed-user wilayah queries and fails closed on malformed JSON',async()=>{
 prisma.userWilayah.findMany=(async()=>[{wilayah:{stations:'{"bad":true}'}},{wilayah:{stations:'["Sta. Jenar",12]'}},{wilayah:{stations:'invalid'}}]) as any;
 assert.deepEqual(await taskScope(1,'admin'),{user:{managerId:1}});assert.deepEqual(await taskScope(2,'kupt'),{user:{managerId:2}});assert.deepEqual(await taskScope(3,'ppj'),{assignedTo:3});assert.equal(await taskScope(4,'guest'),null);
 assert.deepEqual(await taskScope(5,'qc'),{OR:[{startPointName:{in:['Sta. Jenar']}},{endPointName:{in:['Sta. Jenar']}}]});
});
test('dynamic emergency severity agrees with UI while known legacy keys can be reclassified',async()=>{
 prisma.kategoriTemuan.findMany=(async()=>[{key:'custom_emergency',color:'error'},{key:'berat',color:'primary'},{key:'light',color:'primary'}]) as any;
 assert.deepEqual(await emergencyCategoryKeys(),['custom_emergency','emergency']);
});
