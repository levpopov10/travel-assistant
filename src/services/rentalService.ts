export interface RentalListing {
  id: string;
  title: string;
  price: number;
  currency: string;
  priceUnit: string;
  location: string;
  description?: string;
  image?: string;
  url?: string;
  airbnbUrl?: string;
  bookingUrl?: string;
  isSponsored?: boolean;
}

interface SearchResultItem {
  title?: string;
  price?: string;
  listingUrl?: string;
}

interface SearchResponse {
  site?: 'airbnb' | 'booking';
  results?: SearchResultItem[];
}

const parsePrice = (priceText?: string): number => {
  if (!priceText) return 0;
  const cleaned = priceText.replace(/,/g, '').match(/(\d+(\.\d+)?)/);
  if (!cleaned) return 0;
  return Number(cleaned[1]) || 0;
};

const detectCurrency = (priceText?: string): string => {
  if (!priceText) return 'USD';
  if (/\$|USD/i.test(priceText)) return 'USD';
  if (/€|EUR/i.test(priceText)) return 'EUR';
  if (/£|GBP/i.test(priceText)) return 'GBP';
  if (/RUB/i.test(priceText)) return 'RUB';
  return 'USD';
};

const getServerBase = (): string => {
  if (typeof window === 'undefined') return 'http://localhost:3001';
  return window.location.origin.replace(/:\d+$/, ':3001');
};

const fetchSite = async (
  site: 'airbnb' | 'booking',
  destination: string,
  arrival?: string,
  departure?: string,
  adults = 2
): Promise<SearchResultItem[]> => {
  const params = new URLSearchParams();
  params.set('site', site);
  params.set('destination', destination);
  if (arrival) params.set('checkin', arrival);
  if (departure) params.set('checkout', departure);
  params.set('adults', String(adults));

  const response = await fetch(`${getServerBase()}/api/search?${params.toString()}`);
  if (!response.ok) return [];

  const data = (await response.json()) as SearchResponse;
  return data.results || [];
};

export const getRentalListings = async (
  destination?: string,
  arrival?: string,
  departure?: string,
  adults = 2
): Promise<RentalListing[]> => {
  if (!destination) return [];

  try {
    const [airbnb, booking] = await Promise.all([
      fetchSite('airbnb', destination, arrival, departure, adults),
      fetchSite('booking', destination, arrival, departure, adults),
    ]);

    const mappedAirbnb = airbnb.map((item, index): RentalListing => ({
      id: `airbnb-${index}`,
      title: item.title || 'Airbnb listing',
      price: parsePrice(item.price),
      currency: detectCurrency(item.price),
      priceUnit: 'night',
      location: destination,
      description: 'Source: Airbnb',
      url: item.listingUrl,
      airbnbUrl: item.listingUrl,
    }));

    const mappedBooking = booking.map((item, index): RentalListing => ({
      id: `booking-${index}`,
      title: item.title || 'Booking listing',
      price: parsePrice(item.price),
      currency: detectCurrency(item.price),
      priceUnit: 'night',
      location: destination,
      description: 'Source: Booking',
      url: item.listingUrl,
      bookingUrl: item.listingUrl,
    }));

    return [...mappedAirbnb, ...mappedBooking];
  } catch (error) {
    console.error('Failed to load rental listings', error);
    return [];
  }
};

export default { getRentalListings };
