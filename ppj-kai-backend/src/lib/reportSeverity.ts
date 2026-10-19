import prisma from '../config/database';
/** Current category severity matches the admin alarm. Unknown legacy keys retain their fallback. */
export async function emergencyCategoryKeys(): Promise<string[]> {
  const categories = await prisma.kategoriTemuan.findMany({ select: { key: true, color: true } });
  const known = new Set(categories.map(category => category.key));
  return [...categories.filter(category => category.color === 'error').map(category => category.key), ...['emergency','berat'].filter(key => !known.has(key))];
}
