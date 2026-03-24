import { describe, expect, it } from 'vitest';
import { buildBudgetTripFallback, recommendDestinationsByBudget } from './budgetAdvisorService';

describe('budgetAdvisorService', () => {
  it('returns destination suggestions by budget', () => {
    const items = recommendDestinationsByBudget(900, 6, 3);
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(3);
    expect(items[0]).toHaveProperty('destination');
    expect(items[0]).toHaveProperty('averageDailyCostUsd');
  });

  it('returns empty fallback list for invalid budget', () => {
    const items = buildBudgetTripFallback({ budgetUsd: 0, tripDays: 5 });
    expect(items).toEqual([]);
  });

  it('builds limited fallback trip suggestions with totals', () => {
    const items = buildBudgetTripFallback({
      origin: 'Sofia',
      budgetUsd: 2500,
      tripDays: 7,
      travelers: 2,
      limit: 2,
    });
    expect(items.length).toBe(2);
    expect(items.every((item) => item.totalEstimateUsd > 0)).toBe(true);
  });
});

