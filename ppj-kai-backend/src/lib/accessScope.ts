import type { Prisma } from '@prisma/client';
import prisma from '../config/database';

export async function getStationsForUser(userId: number, role: string): Promise<string[] | null> {
  if (role === 'admin') return null; // admin → no filter

  const assignments = await prisma.userWilayah.findMany({
    where: { userId },
    include: { wilayah: true },
  });

  const stations: string[] = [];
  for (const a of assignments) {
    try {
      const parsed: unknown = JSON.parse(a.wilayah.stations);
      if (Array.isArray(parsed)) stations.push(...parsed.filter((item): item is string => typeof item === 'string'));
    } catch {
      // skip malformed JSON
    }
  }
  return stations;
}

export function buildStationFilter(stations: string[] | null): Prisma.TugasPpjWhereInput {
  if (!stations) return {}; // admin → no filter
  return {
    OR: [
      { startPointName: { in: stations } },
      { endPointName: { in: stations } },
    ],
  };
}
export async function taskScope(userId: number, role: string): Promise<Prisma.TugasPpjWhereInput | null> {
  if (role === 'ppj') return { assignedTo: userId };
  if (role === 'admin' || role === 'kupt') return { user: { managerId: userId } };
  if (role === 'qc') return buildStationFilter(await getStationsForUser(userId, role) ?? []);
  return null;
}
