export interface BudgetDestinationSuggestion {
  destination: string;
  country: string;
  averageDailyCostUsd: number;
  tags: string[];
  reason: string;
}

export interface BudgetTripSuggestion {
  destination: string;
  country: string;
  tags: string[];
  flightEstimateUsd: number;
  stayEstimateUsd: number;
  foodTransportEstimateUsd: number;
  totalEstimateUsd: number;
  reason: string;
}

interface DestinationSeed extends BudgetDestinationSuggestion {
  region: 'europe' | 'asia';
}

const DESTINATIONS: DestinationSeed[] = [
  {
    destination: 'Sofia',
    country: 'Bulgaria',
    averageDailyCostUsd: 48,
    tags: ['low-cost', 'city break', 'history'],
    reason: 'Affordable hotels, food, and public transport.',
    region: 'europe',
  },
  {
    destination: 'Krakow',
    country: 'Poland',
    averageDailyCostUsd: 55,
    tags: ['architecture', 'food', 'weekend'],
    reason: 'Good value old town stay and low dining costs.',
    region: 'europe',
  },
  {
    destination: 'Budapest',
    country: 'Hungary',
    averageDailyCostUsd: 62,
    tags: ['thermal baths', 'nightlife', 'city'],
    reason: 'Balanced cost with many free and low-cost attractions.',
    region: 'europe',
  },
  {
    destination: 'Lisbon',
    country: 'Portugal',
    averageDailyCostUsd: 82,
    tags: ['coast', 'culture', 'food'],
    reason: 'Great weather and many budget-friendly neighborhoods.',
    region: 'europe',
  },
  {
    destination: 'Athens',
    country: 'Greece',
    averageDailyCostUsd: 78,
    tags: ['history', 'mediterranean', 'walkable'],
    reason: 'Reasonable daily expenses outside peak season.',
    region: 'europe',
  },
  {
    destination: 'Istanbul',
    country: 'Turkey',
    averageDailyCostUsd: 58,
    tags: ['markets', 'culture', 'food'],
    reason: 'Strong value for food and accommodation.',
    region: 'europe',
  },
  {
    destination: 'Bangkok',
    country: 'Thailand',
    averageDailyCostUsd: 52,
    tags: ['street food', 'city', 'shopping'],
    reason: 'Very low daily spend with broad transport options.',
    region: 'asia',
  },
  {
    destination: 'Barcelona',
    country: 'Spain',
    averageDailyCostUsd: 105,
    tags: ['beach', 'architecture', 'nightlife'],
    reason: 'Higher costs but still manageable with early bookings.',
    region: 'europe',
  },
  {
    destination: 'Rome',
    country: 'Italy',
    averageDailyCostUsd: 112,
    tags: ['history', 'food', 'museums'],
    reason: 'Premium destination with many free landmarks.',
    region: 'europe',
  },
  {
    destination: 'Tokyo',
    country: 'Japan',
    averageDailyCostUsd: 145,
    tags: ['technology', 'food', 'culture'],
    reason: 'Comfortable mid-range travel requires a larger budget.',
    region: 'asia',
  },
];

function estimateFlightPerTravelerUsd(origin: string, region: 'europe' | 'asia'): number {
  const normalized = origin.toLowerCase();
  const usHints = ['new york', 'los angeles', 'chicago', 'miami', 'san francisco', 'usa', 'us'];
  const isUsOrigin = usHints.some((hint) => normalized.includes(hint));
  if (isUsOrigin && region === 'asia') return 1050;
  if (isUsOrigin && region === 'europe') return 740;
  if (region === 'asia') return 720;
  return 380;
}

export function recommendDestinationsByBudget(
  totalBudgetUsd: number,
  tripDays = 5,
  limit = 5
): BudgetDestinationSuggestion[] {
  if (!Number.isFinite(totalBudgetUsd) || totalBudgetUsd <= 0) return [];
  const dailyBudget = totalBudgetUsd / Math.max(1, tripDays);
  const scored = DESTINATIONS.map((item) => {
    const diff = Math.abs(item.averageDailyCostUsd - dailyBudget);
    const affordabilityBonus = item.averageDailyCostUsd <= dailyBudget ? 8 : 0;
    return {
      item,
      score: affordabilityBonus - diff,
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function buildBudgetTripFallback(input: {
  origin?: string;
  budgetUsd: number;
  tripDays: number;
  travelers?: number;
  limit?: number;
}): BudgetTripSuggestion[] {
  const budgetUsd = Number(input.budgetUsd);
  const tripDays = Math.max(1, Number(input.tripDays) || 5);
  const travelers = Math.max(1, Number(input.travelers) || 1);
  const limit = Math.max(1, Number(input.limit) || 5);
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) return [];

  const origin = String(input.origin || '');
  const scored = DESTINATIONS.map((item) => {
    const flightPerTraveler = estimateFlightPerTravelerUsd(origin, item.region);
    const stayPerTraveler = Math.round(item.averageDailyCostUsd * tripDays * 0.58);
    const foodPerTraveler = Math.round(item.averageDailyCostUsd * tripDays * 0.42);
    const total = (flightPerTraveler + stayPerTraveler + foodPerTraveler) * travelers;
    const delta = Math.abs(total - budgetUsd);
    const overBudgetPenalty = total > budgetUsd ? (total - budgetUsd) * 0.4 : 0;
    return {
      item,
      flightEstimateUsd: flightPerTraveler * travelers,
      stayEstimateUsd: stayPerTraveler * travelers,
      foodTransportEstimateUsd: foodPerTraveler * travelers,
      totalEstimateUsd: total,
      score: -delta - overBudgetPenalty,
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => ({
      destination: entry.item.destination,
      country: entry.item.country,
      tags: entry.item.tags,
      flightEstimateUsd: entry.flightEstimateUsd,
      stayEstimateUsd: entry.stayEstimateUsd,
      foodTransportEstimateUsd: entry.foodTransportEstimateUsd,
      totalEstimateUsd: entry.totalEstimateUsd,
      reason: entry.item.reason,
    }));
}
