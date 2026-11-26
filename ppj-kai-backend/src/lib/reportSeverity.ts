import prisma from '../config/database';

const LEGACY_EMERGENCY_KEYS = ['emergency', 'berat'];

/** Current category severity matches the admin alarm. Unknown legacy keys retain their fallback. */
export async function emergencyCategoryKeys(): Promise<string[]> {
  const categories = await prisma.kategoriTemuan.findMany({ select: { key: true, color: true } });
  const known = new Set(categories.map(category => category.key));
  return [...categories.filter(category => category.color === 'error').map(category => category.key), ...LEGACY_EMERGENCY_KEYS.filter(key => !known.has(key))];
}

export interface CategoryInfo { label: string; emergency: boolean }

/** Label and severity per report key, using the same rule as emergencyCategoryKeys. */
export async function categoryLookup(): Promise<(key: string) => CategoryInfo> {
  const categories = await prisma.kategoriTemuan.findMany({ select: { key: true, label: true, color: true } });
  const byKey = new Map(categories.map(category => [category.key, category]));
  return key => {
    const category = byKey.get(key);
    if (category) return { label: category.label, emergency: category.color === 'error' };
    // Deleted category: the stored key is all that is left.
    return { label: key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()), emergency: LEGACY_EMERGENCY_KEYS.includes(key) };
  };
}
