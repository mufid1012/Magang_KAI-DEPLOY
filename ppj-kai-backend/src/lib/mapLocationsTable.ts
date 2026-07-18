import prisma from '../config/database';

let tableReady: Promise<void> | null = null;

/**
 * Keep existing deployments that were originally provisioned with `prisma db push`
 * compatible with the MAP feature. The statement is idempotent and only creates
 * the new feature table when it has not been deployed yet.
 */
export function ensureMapLocationsTable(): Promise<void> {
  if (!tableReady) {
    tableReady = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`map_locations\` (
        \`id\` INTEGER NOT NULL AUTO_INCREMENT,
        \`name\` VARCHAR(150) NOT NULL,
        \`address\` TEXT NULL,
        \`description\` TEXT NULL,
        \`latitude\` DOUBLE NOT NULL,
        \`longitude\` DOUBLE NOT NULL,
        \`created_by\` INTEGER NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`map_locations_created_by_idx\` (\`created_by\`),
        CONSTRAINT \`map_locations_created_by_fkey\`
          FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`id\`)
          ON DELETE CASCADE ON UPDATE CASCADE,
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `).then(() => undefined).catch(error => {
      tableReady = null;
      throw error;
    });
  }

  return tableReady;
}
