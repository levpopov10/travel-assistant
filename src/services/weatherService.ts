// Weather service using Open-Meteo and its geocoding API
// No API key required. We resolve coordinates from location text.

import { fetchWeatherApi } from 'openmeteo';
import { geocode } from './geocodeService';

export interface WeatherData {
  temperature: number;
  code: number;
  description: string;
}

export interface DailyWeather {
  date: string;
  temperature: number;
  code: number;
  description: string;
}

const codeToDesc: Record<number, string> = {
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'depositing rime fog',
  51: 'light drizzle',
  53: 'moderate drizzle',
  55: 'dense drizzle',
  56: 'light freezing drizzle',
  57: 'dense freezing drizzle',
  61: 'slight rain',
  63: 'moderate rain',
  65: 'heavy rain',
  71: 'slight snow fall',
  73: 'moderate snow fall',
  75: 'heavy snow fall',
  80: 'slight rain showers',
  81: 'moderate rain showers',
  82: 'violent rain showers',
  95: 'thunderstorm',
  96: 'thunderstorm with slight hail',
  99: 'thunderstorm with heavy hail',
};

export async function fetchWeatherByQuery(query: string): Promise<WeatherData> {
  if (!query) throw new Error('Empty query');

  const locations = await geocode(query);
  if (locations.length === 0) throw new Error('Location not found');

  const { latitude, longitude } = locations[0];
  const params = {
    latitude: [latitude],
    longitude: [longitude],
    current: 'temperature_2m,weather_code',
  };

  const responses = await fetchWeatherApi('https://api.open-meteo.com/v1/forecast', params);
  if (responses.length === 0) throw new Error('Empty weather response');

  const current = responses[0].current();
  if (!current) throw new Error('No current weather');

  const temp = current.variables(0)?.value() ?? 0;
  const code = current.variables(1)?.value() ?? 0;

  return {
    temperature: temp,
    code,
    description: codeToDesc[code] || String(code),
  };
}

export async function fetchWeatherRange(
  query: string,
  startDate?: string,
  endDate?: string
): Promise<DailyWeather[]> {
  if (!query) throw new Error('Empty query');

  const locations = await geocode(query);
  if (locations.length === 0) throw new Error('Location not found');

  const toIsoDate = (d: Date) => d.toISOString().split('T')[0];
  const addDays = (base: Date, days: number) => {
    const copy = new Date(base);
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy;
  };

  const toDate = (value?: string) => {
    if (!value) return null;
    const normalized = value.split('T')[0];
    const parsed = new Date(`${normalized}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const today = new Date();
  const allowedStart = addDays(today, -93);
  const allowedEnd = addDays(today, 15);

  const rawStart = toDate(startDate);
  const rawEnd = toDate(endDate);

  let requestedStart = rawStart ?? allowedStart;
  let requestedEnd = rawEnd ?? allowedEnd;
  if (requestedStart > requestedEnd) {
    [requestedStart, requestedEnd] = [requestedEnd, requestedStart];
  }

  const clampedStart = requestedStart < allowedStart ? allowedStart : requestedStart;
  const clampedEnd = requestedEnd > allowedEnd ? allowedEnd : requestedEnd;

  if (clampedStart > clampedEnd) {
    return [];
  }

  const { latitude, longitude } = locations[0];
  const params: any = {
    latitude: [latitude],
    longitude: [longitude],
    daily: 'temperature_2m_max,weathercode',
    timezone: 'auto',
  };

  params.start_date = toIsoDate(clampedStart);
  params.end_date = toIsoDate(clampedEnd);

  const responses = await fetchWeatherApi('https://api.open-meteo.com/v1/forecast', params);
  if (responses.length === 0) throw new Error('Empty weather response');

  const resp = responses[0];
  const daily = resp.daily();
  if (!daily) throw new Error('No daily weather');

  const range = (start: number, stop: number, step: number) =>
    Array.from({ length: Math.floor((stop - start) / step) }, (_, i) => start + i * step);

  const utcOffset = resp.utcOffsetSeconds();
  const timeArr = range(Number(daily.time()), Number(daily.timeEnd()), daily.interval()).map(
    (t) => new Date((t + utcOffset) * 1000).toISOString().split('T')[0]
  );

  const temps = daily.variables(0)?.valuesArray() ?? [];
  const codes = daily.variables(1)?.valuesArray() ?? [];

  const result: DailyWeather[] = [];
  for (let i = 0; i < timeArr.length; i++) {
    result.push({
      date: timeArr[i],
      temperature: temps[i] ?? 0,
      code: codes[i] ?? 0,
      description: codeToDesc[codes[i]] || String(codes[i]),
    });
  }

  return result;
}

