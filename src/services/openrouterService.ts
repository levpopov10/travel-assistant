interface OpenRouterMessage {
  role: 'system' | 'user';
  content: string;
}
import { buildBudgetTripFallback, BudgetTripSuggestion } from './budgetAdvisorService';

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export interface EntertainmentIdea {
  title: string;
  mapsUrl?: string;
  websiteUrl?: string;
}

export interface EmergencyContact {
  label: string;
  number: string;
  note?: string;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = import.meta.env.VITE_OPENROUTER_MODEL || 'openrouter/auto';
const DEFAULT_MAX_TOKENS = Number(import.meta.env.VITE_OPENROUTER_MAX_TOKENS) || 1200;

function requireApiKey(): string {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('Missing VITE_OPENROUTER_API_KEY in .env');
  }
  return apiKey;
}

async function requestOpenRouter(messages: OpenRouterMessage[]): Promise<string> {
  const apiKey = requireApiKey();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12000);
  let response: Response;
  // Helper to actually perform the fetch with given max_tokens
  const doFetch = async (maxTokens: number) =>
    fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Travel Assistant',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

  try {
    // try first with configured/default tokens
    response = await doFetch(DEFAULT_MAX_TOKENS);
  } finally {
    clearTimeout(timeoutId);
  }

  // If the request failed due to insufficient credits or token limits (402),
  // retry once with a smaller max_tokens value to reduce cost.
  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 402) {
      try {
        const reduced = Math.max(256, Math.floor(DEFAULT_MAX_TOKENS / 3));
        const retryController = new AbortController();
        const retryTimeout = window.setTimeout(() => retryController.abort(), 12000);
        try {
          const retryResp = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': window.location.origin,
              'X-Title': 'Travel Assistant',
            },
            body: JSON.stringify({
              model: DEFAULT_MODEL,
              messages,
              temperature: 0.7,
              max_tokens: reduced,
            }),
            signal: retryController.signal,
          });
          if (retryResp.ok) {
            const data = (await retryResp.json()) as OpenRouterResponse;
            const content = data.choices?.[0]?.message?.content?.trim();
            if (!content) throw new Error('OpenRouter returned empty content on retry');
            return content;
          }
          const retryText = await retryResp.text();
          throw new Error(`OpenRouter error ${retryResp.status}: ${retryText}`);
        } finally {
          clearTimeout(retryTimeout);
        }
      } catch (retryErr) {
        throw new Error(`OpenRouter error ${response.status}: ${errorText}`);
      }
    }
    throw new Error(`OpenRouter error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenRouter returned empty content');
  }
  return content;
}

function parseList(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*[-*\d.)]+\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5);
}

export async function generateTravelStyles(destination: string): Promise<string[]> {
  const content = await requestOpenRouter([
    {
      role: 'system',
      content:
        'You are a travel expert. Return only a short bullet list. No intro text. Keep each item 1-3 words.',
    },
    {
      role: 'user',
      content: `Suggest 6 travel styles for a trip to ${destination}.`,
    },
  ]);

  return parseList(content);
}

export async function generateEntertainmentIdeas(input: {
  destination: string;
  startDate?: string;
  endDate?: string;
  category?: string;
}): Promise<EntertainmentIdea[]> {
  const { destination, startDate, endDate, category } = input;
  const dateText =
    startDate && endDate ? `Travel dates: ${startDate} to ${endDate}.` : 'Dates are not fixed.';
  const categoryText = category && category !== 'any' ? `Category: ${category}.` : '';

  const content = await requestOpenRouter([
    {
      role: 'system',
      content:
        'You are a local travel planner. Return only valid JSON with an "ideas" array. Each idea must have: "title", "mapsUrl", and "websiteUrl". If no official website is known, return an empty string for websiteUrl. mapsUrl must be a Google Maps search URL. No markdown. No extra text.',
    },
    {
      role: 'user',
      content: `Suggest 5 entertainment places in ${destination}. ${dateText} ${categoryText}`,
    },
  ]);

  try {
    const parsed = JSON.parse(content) as { ideas?: EntertainmentIdea[] };
    const ideas = Array.isArray(parsed.ideas) ? parsed.ideas : [];

    return ideas
      .map((idea) => ({
        title: (idea?.title || '').trim(),
        mapsUrl: (idea?.mapsUrl || '').trim(),
        websiteUrl: (idea?.websiteUrl || '').trim(),
      }))
      .filter((idea) => idea.title)
      .slice(0, 5);
  } catch {
    return parseList(content).map((title) => ({
      title,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${title} ${destination}`)}`,
      websiteUrl: '',
    }));
  }
}

export async function generateEmergencyContacts(destination: string): Promise<EmergencyContact[]> {
  const content = await requestOpenRouter([
    {
      role: 'system',
      content:
        'You are a travel safety assistant. Return only valid JSON with "contacts" array. Each contact must have: "label", "number", "note". Keep note short. No markdown. No extra text.',
    },
    {
      role: 'user',
      content: `Provide key emergency phone numbers for travelers in ${destination}: police, ambulance, fire, and tourist hotline if available.`,
    },
  ]);

  try {
    const parsed = JSON.parse(content) as { contacts?: EmergencyContact[] };
    const contacts = Array.isArray(parsed.contacts) ? parsed.contacts : [];

    return contacts
      .map((item) => ({
        label: (item?.label || '').trim(),
        number: (item?.number || '').trim(),
        note: (item?.note || '').trim(),
      }))
      .filter((item) => item.label && item.number)
      .slice(0, 5);
  } catch {
    return [
      { label: 'Police', number: '112', note: 'National emergency line in many countries' },
      { label: 'Ambulance', number: '112', note: 'Medical emergency' },
      { label: 'Fire Service', number: '112', note: 'Fire emergency' },
    ];
  }
}

function sanitizeBudgetTripSuggestion(item: Partial<BudgetTripSuggestion>): BudgetTripSuggestion | null {
  const destination = String(item.destination || '').trim();
  const country = String(item.country || '').trim();
  if (!destination || !country) return null;

  const toAmount = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  };

  const flightEstimateUsd = toAmount(item.flightEstimateUsd);
  const stayEstimateUsd = toAmount(item.stayEstimateUsd);
  const foodTransportEstimateUsd = toAmount(item.foodTransportEstimateUsd);
  const totalEstimateUsd = toAmount(item.totalEstimateUsd) || (
    flightEstimateUsd + stayEstimateUsd + foodTransportEstimateUsd
  );

  return {
    destination,
    country,
    tags: Array.isArray(item.tags)
      ? item.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 5)
      : [],
    flightEstimateUsd,
    stayEstimateUsd,
    foodTransportEstimateUsd,
    totalEstimateUsd,
    reason: String(item.reason || '').trim() || 'Matches your budget and trip length.',
  };
}

export async function generateBudgetTripSuggestions(input: {
  origin?: string;
  budgetUsd: number;
  tripDays: number;
  travelers?: number;
}): Promise<BudgetTripSuggestion[]> {
  const origin = String(input.origin || '').trim();
  const budgetUsd = Number(input.budgetUsd);
  const tripDays = Math.max(1, Number(input.tripDays) || 5);
  const travelers = Math.max(1, Number(input.travelers) || 1);
  const fallback = buildBudgetTripFallback({ origin, budgetUsd, tripDays, travelers, limit: 3 });

  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
    return [];
  }

  try {
    const content = await requestOpenRouter([
      {
        role: 'system',
        content:
          'You are a travel budget advisor. Return only valid JSON with key "suggestions". Each item must include: destination, country, tags(string[]), flightEstimateUsd, stayEstimateUsd, foodTransportEstimateUsd, totalEstimateUsd, reason. No markdown, no extra text.',
      },
      {
        role: 'user',
        content: `Create 3 destination suggestions for total budget ${budgetUsd} USD, trip length ${tripDays} days, travelers ${travelers}, origin "${origin || 'not specified'}". Include round-trip flight estimate, hotel estimate, local food/transport estimate, and total for all travelers.`,
      },
    ]);

    const parsed = JSON.parse(content) as { suggestions?: Partial<BudgetTripSuggestion>[] };
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.map(sanitizeBudgetTripSuggestion).filter(Boolean) as BudgetTripSuggestion[]
      : [];

    return suggestions.length ? suggestions.slice(0, 3) : fallback;
  } catch {
    return fallback;
  }
}
