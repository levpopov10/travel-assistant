// Holiday / events fetching service using Nager.Date public API
// documentation: https://date.nager.at/swagger/index.html

export interface Holiday {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  fixed: boolean;
  global: boolean;
  counties: string[] | null;
  launchYear: number | null;
  types: string[];
}

export async function fetchPublicHolidays(
  countryCode: string,
  year: number = new Date().getFullYear()
): Promise<Holiday[]> {
  if (!countryCode) return [];
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn('Holiday request failed', res.status);
    return [];
  }
  const data = await res.json();
  return data as Holiday[];
}
