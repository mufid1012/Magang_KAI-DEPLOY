import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// 12 Wilayah Data (JR 6.1 - JR 6.12)
// ─────────────────────────────────────────────────────────────────────────────

const WILAYAH_DATA = [
  { kode: 'JR 6.1',  nama: 'Jenar',        stations: JSON.stringify(['Sta. Jenar']) },
  { kode: 'JR 6.2',  nama: 'Wojo',         stations: JSON.stringify(['Sta. Wojo']) },
  { kode: 'JR 6.3',  nama: 'Wates',        stations: JSON.stringify(['Sta. Wates']) },
  { kode: 'JR 6.4',  nama: 'Yogyakarta',   stations: JSON.stringify(['Sta. Yogyakarta', 'Sta. Lempuyangan', 'Sta. Maguwo', 'Sta. Patukan']) },
  { kode: 'JR 6.5',  nama: 'Brambanan',    stations: JSON.stringify(['Sta. Brambanan']) },
  { kode: 'JR 6.6',  nama: 'Klaten',       stations: JSON.stringify(['Sta. Klaten']) },
  { kode: 'JR 6.7',  nama: 'Delanggu',     stations: JSON.stringify(['Sta. Delanggu']) },
  { kode: 'JR 6.8',  nama: 'Solobalapan',  stations: JSON.stringify(['Sta. Solo Balapan']) },
  { kode: 'JR 6.9',  nama: 'Wonogiri',     stations: JSON.stringify(['Sta. Wonogiri']) },
  { kode: 'JR 6.10', nama: 'Sumberlawang', stations: JSON.stringify(['Sta. Sumberlawang']) },
  { kode: 'JR 6.11', nama: 'Palur',        stations: JSON.stringify(['Sta. Palur']) },
  { kode: 'JR 6.12', nama: 'Sragen',       stations: JSON.stringify(['Sta. Sragen']) },
  { kode: 'JR 6.13', nama: 'Palur',        stations: JSON.stringify(['Sta. Palur']) },
];

async function main() {
  console.log('=== Starting seed ===\n');

  // ───────────────────────────────────────────────────────────────────────
  // Step 1: Migrate existing 'petugas' role → 'ppj'
  // ───────────────────────────────────────────────────────────────────────
  const migrateResult = await prisma.user.updateMany({
    where: { role: 'petugas' },
    data: { role: 'ppj' },
  });
  if (migrateResult.count > 0) {
    console.log(`✅ Migrated ${migrateResult.count} user(s) from role 'petugas' → 'ppj'`);
  } else {
    console.log('ℹ️  No users with role "petugas" to migrate');
  }

  // ───────────────────────────────────────────────────────────────────────
  // Step 2: Seed 12 Wilayah
  // ───────────────────────────────────────────────────────────────────────
  console.log('\n--- Seeding Wilayah ---');
  for (const w of WILAYAH_DATA) {
    await prisma.wilayah.upsert({
      where: { kode: w.kode },
      update: { nama: w.nama, stations: w.stations },
      create: w,
    });
    console.log(`  ✅ Wilayah ${w.kode} — ${w.nama}`);
  }

  // Fetch all wilayah for assignment later
  const allWilayah = await prisma.wilayah.findMany({ orderBy: { kode: 'asc' } });
  const wilayahByKode = Object.fromEntries(allWilayah.map(w => [w.kode, w]));

  // ───────────────────────────────────────────────────────────────────────
  // Step 3: Hash passwords
  // ───────────────────────────────────────────────────────────────────────
  const hashedAdminPass = await bcrypt.hash('admin123', 10);
  const hashedPpjPass = await bcrypt.hash('password123', 10);
  const hashedQcPass = await bcrypt.hash('qc123', 10);
  const hashedKuptPass = await bcrypt.hash('kupt123', 10);

  // ───────────────────────────────────────────────────────────────────────
  // Step 4: Upsert Admin
  // ───────────────────────────────────────────────────────────────────────
  console.log('\n--- Seeding Users ---');
  const admin = await prisma.user.upsert({
    where: { nipp: 'ADMIN-001' },
    update: { password: hashedAdminPass },
    create: {
      nipp: 'ADMIN-001',
      password: hashedAdminPass,
      nama: 'Admin Super',
      role: 'admin',
      isActive: true,
    },
  });
  console.log(`  ✅ Admin: ${admin.nipp} — ${admin.nama}`);

  // ───────────────────────────────────────────────────────────────────────
  // Step 5: Upsert QC Users
  // ───────────────────────────────────────────────────────────────────────
  const qcUsers = [
    { nipp: 'QC-A001', nama: 'QC Region A', wilayahKodes: ['JR 6.1', 'JR 6.2', 'JR 6.3', 'JR 6.4'] },
    { nipp: 'QC-B001', nama: 'QC Region B', wilayahKodes: ['JR 6.5', 'JR 6.6', 'JR 6.7', 'JR 6.8'] },
    { nipp: 'QC-C001', nama: 'QC Region C', wilayahKodes: ['JR 6.9', 'JR 6.10', 'JR 6.11', 'JR 6.12', 'JR 6.13'] },
  ];

  for (const qc of qcUsers) {
    const user = await prisma.user.upsert({
      where: { nipp: qc.nipp },
      update: { password: hashedQcPass, role: 'qc', nama: qc.nama },
      create: {
        nipp: qc.nipp,
        password: hashedQcPass,
        nama: qc.nama,
        role: 'qc',
        isActive: true,
      },
    });
    console.log(`  ✅ QC: ${user.nipp} — ${user.nama}`);

    // Assign wilayah
    for (const kode of qc.wilayahKodes) {
      const wilayah = wilayahByKode[kode];
      if (wilayah) {
        await prisma.userWilayah.upsert({
          where: { userId_wilayahId: { userId: user.id, wilayahId: wilayah.id } },
          update: {},
          create: { userId: user.id, wilayahId: wilayah.id },
        });
      }
    }
    console.log(`     → Assigned wilayah: ${qc.wilayahKodes.join(', ')}`);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Step 6: Upsert KUPT User
  // ───────────────────────────────────────────────────────────────────────
  const kupt = await prisma.user.upsert({
    where: { nipp: 'KUPT-001' },
    update: { password: hashedKuptPass, role: 'kupt', nama: 'KUPT Jenar' },
    create: {
      nipp: 'KUPT-001',
      password: hashedKuptPass,
      nama: 'KUPT Jenar',
      role: 'kupt',
      isActive: true,
    },
  });
  console.log(`  ✅ KUPT: ${kupt.nipp} — ${kupt.nama}`);

  // Assign JR 6.1 to KUPT
  const wilayahJR61 = wilayahByKode['JR 6.1'];
  if (wilayahJR61) {
    await prisma.userWilayah.upsert({
      where: { userId_wilayahId: { userId: kupt.id, wilayahId: wilayahJR61.id } },
      update: {},
      create: { userId: kupt.id, wilayahId: wilayahJR61.id },
    });
    console.log(`     → Assigned wilayah: JR 6.1`);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Step 7: Upsert PPJ (Petugas) User — linked to Admin via managerId
  // ───────────────────────────────────────────────────────────────────────
  const ppj = await prisma.user.upsert({
    where: { nipp: 'KAI-1234' },
    update: {
      password: hashedPpjPass,
      role: 'ppj',
      managerId: admin.id,
      jabatan: 'Track Inspector',
      division: 'DAOP 1 Jakarta',
      workArea: 'Sektor 4 (GMR-JAKK)',
      phone: '+62 812-3456-7890',
      isActive: true,
    },
    create: {
      nipp: 'KAI-1234',
      password: hashedPpjPass,
      nama: 'Budi Santoso',
      role: 'ppj',
      managerId: admin.id,
      jabatan: 'Track Inspector',
      division: 'DAOP 1 Jakarta',
      workArea: 'Sektor 4 (GMR-JAKK)',
      phone: '+62 812-3456-7890',
      isActive: true,
    },
  });
  console.log(`  ✅ PPJ: ${ppj.nipp} — ${ppj.nama} (managed by ${admin.nipp})`);

  // ───────────────────────────────────────────────────────────────────────
  // Step 8: Create sample tasks for PPJ (only if none exist)
  // ───────────────────────────────────────────────────────────────────────
  const existingTasks = await prisma.tugasPpj.count({
    where: { assignedTo: ppj.id },
  });

  if (existingTasks === 0) {
    console.log('\n--- Seeding Sample Tasks ---');
    const tugas1 = await prisma.tugasPpj.create({
      data: {
        jalur: 'Sta. Jenar → Sta. Wojo',
        tanggal: new Date(),
        status: 'pending',
        startPointName: 'Sta. Jenar',
        endPointName: 'Sta. Wojo',
        startPointLat: -7.802037,
        startPointLong: 110.000797,
        endPointLat: -7.862278,
        endPointLong: 110.041092,
        assignedTo: ppj.id,
      },
    });

    const tugas2 = await prisma.tugasPpj.create({
      data: {
        jalur: 'Sta. Yogyakarta → Sta. Lempuyangan',
        tanggal: new Date(),
        status: 'completed',
        startPointName: 'Sta. Yogyakarta',
        endPointName: 'Sta. Lempuyangan',
        startPointLat: -7.788870,
        startPointLong: 110.363213,
        endPointLat: -7.789961,
        endPointLong: 110.375275,
        assignedTo: ppj.id,
      },
    });

    console.log(`  ✅ Task 1: ${tugas1.jalur} (pending)`);
    console.log(`  ✅ Task 2: ${tugas2.jalur} (completed)`);
  } else {
    console.log('\nℹ️  Tasks already exist, skipping creation');
  }

  console.log('\n=== Seed completed ===');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
