import prisma from '../config/database';

let tableReady: Promise<void> | null = null;

// Like MAP locations, support older installations provisioned using db push.
export function ensureLoginPhotosTable(): Promise<void> {
  if (!tableReady) {
    tableReady = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`login_photos\` (
        \`id\` INTEGER NOT NULL AUTO_INCREMENT,
        \`title\` VARCHAR(150) NOT NULL,
        \`image\` LONGBLOB NOT NULL,
        \`mime_type\` VARCHAR(30) NOT NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`sort_order\` INTEGER NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `).then(() => undefined).catch(error => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}
