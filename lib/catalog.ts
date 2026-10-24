import catalogData from '../data/catalog.json';
import reviewData from '../data/reviews.json';
import comparisonCatalogData from '../data/comparison-catalog.json';
import comparisonReviewData from '../data/comparison-reviews.json';
import { samePurpose } from './comparison-groups';
import type { Review, SKU } from './types';

/** These checked-in synthetic records are the only product/review facts supplied to the model. */
export const catalog = [...catalogData, ...comparisonCatalogData] as unknown as SKU[];
export const reviews = [...reviewData, ...comparisonReviewData] as Review[];
const skuById = new Map(catalog.map((sku) => [sku.id, sku]));
const reviewById = new Map(reviews.map((review) => [review.id, review]));
export const getSku = (id: string): SKU | undefined => skuById.get(id);
export const getReview = (id: string): Review | undefined => reviewById.get(id);
export const reviewsForSku = (id: string): Review[] => reviews.filter((review) => review.skuId === id);

/** Only direct functional substitutes; excludes the selected item and quarantine/owned defaults. */
export function comparisonCandidatesForSku(id: string, pool: SKU[] = catalog): SKU[] {
  const selected = getSku(id);
  return selected ? pool.filter(sku => sku.id !== id && samePurpose(selected, sku)) : [];
}

export function reviewStats(id: string) {
  const rows = reviewsForSku(id);
  const stars: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  const tagCounts: Record<string, number> = {};
  for (const row of rows) {
    stars[row.stars] = (stars[row.stars] || 0) + 1;
    for (const tag of new Set(row.tags)) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }
  return {
    count: rows.length,
    average: rows.length ? Number((rows.reduce((sum, row) => sum + row.stars, 0) / rows.length).toFixed(2)) : null,
    stars,
    tagCounts,
    tagPercentages: Object.fromEntries(Object.entries(tagCounts).map(([tag, count]) => [tag, Math.round(count / rows.length * 100)])),
  };
}
