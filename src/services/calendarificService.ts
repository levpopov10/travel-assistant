// Holidays service (Calendarific-compatible shape) powered by public Nager.Date API.

import { getCountryCode } from './countryCodeMap';
import { geocode } from './geocodeService';
import { fetchPublicHolidays } from './holidayService';

export interface Holiday {
  name: string;
  date: string;
  type: string[];
}

export async function fetchHolidaysByCity(
  cityOrCountry: string,
  year: number = new Date().getFullYear()
): Promise<Holiday[]> {
  if (!cityOrCountry) return [];

  // start with manual map lookup
  let countryCode = getCountryCode(cityOrCountry);
  // if result is default 'us' and user supplied something else, try geocoding to infer
  if (countryCode === 'us') {
    try {
      const locs = await geocode(cityOrCountry);
      if (locs.length > 0) {
        const inferred = getCountryCode(locs[0].country);
        if (inferred) {
          countryCode = inferred;
        }
      }
    } catch {
      // ignore geocode errors, keep existing code
    }
  }

  try {
    const items = await fetchPublicHolidays(countryCode.toUpperCase(), year);
    return items.map((h) => ({
      name: h.localName || h.name,
      date: h.date,
      type: Array.isArray(h.types) ? h.types : [],
    }));
  } catch {
    return [];
  }
}
