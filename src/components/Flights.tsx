import { IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton } from '@ionic/react';

interface FlightsProps {
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
}

const isIata = (value?: string) => /^[A-Za-z]{3}$/.test((value || '').trim());

const cityToIata: Record<string, string> = {
  varna: 'VAR',
  sofia: 'SOF',
  paris: 'CDG',
  london: 'LHR',
  berlin: 'BER',
  rome: 'FCO',
  madrid: 'MAD',
  barcelona: 'BCN',
  vienna: 'VIE',
  prague: 'PRG',
  warsaw: 'WAW',
  budapest: 'BUD',
  istanbul: 'IST',
  dubai: 'DXB',
  cairo: 'CAI',
  tokyo: 'HND',
  seoul: 'ICN',
  bangkok: 'BKK',
  singapore: 'SIN',
  beijing: 'PEK',
  shanghai: 'PVG',
  delhi: 'DEL',
  mumbai: 'BOM',
  newyork: 'JFK',
  losangeles: 'LAX',
  chicago: 'ORD',
  toronto: 'YYZ',
  vancouver: 'YVR',
  sydney: 'SYD',
  melbourne: 'MEL',
  amsterdam: 'AMS',
  athens: 'ATH',
  bucharest: 'OTP',
};

const normalizeKey = (value?: string) =>
  (value || '').toLowerCase().replace(/[\s-]/g, '');

const resolveIata = (value?: string): string | undefined => {
  if (!value) return undefined;
  if (isIata(value)) return value.trim().toUpperCase();
  return cityToIata[normalizeKey(value)];
};

const buildSkyscannerUrl = (
  origin?: string,
  destination?: string,
  departureDate?: string,
  returnDate?: string
) => {
  const fromCode = resolveIata(origin);
  const toCode = resolveIata(destination);

  if (!fromCode || !toCode) {
    return 'https://www.skyscanner.com/flights';
  }

  const from = fromCode.toLowerCase();
  const to = toCode.toLowerCase();
  const outDate = (departureDate || '').replaceAll('-', '').slice(2);
  const inDate = (returnDate || '').replaceAll('-', '').slice(2);

  if (!outDate || !inDate) {
    return `https://www.skyscanner.com/transport/flights/${from}/${to}/`;
  }

  return `https://www.skyscanner.com/transport/flights/${from}/${to}/${outDate}/${inDate}/`;
};

const buildAviasalesUrl = (
  origin?: string,
  destination?: string,
  departureDate?: string,
  returnDate?: string
) => {
  const fromCode = resolveIata(origin);
  const toCode = resolveIata(destination);

  if (!fromCode || !toCode) {
    return 'https://www.aviasales.com';
  }

  const params = new URLSearchParams();
  params.set('origin', fromCode);
  params.set('destination', toCode);
  if (departureDate) params.set('depart_date', departureDate);
  if (returnDate) params.set('return_date', returnDate);

  return `https://www.aviasales.com/search?${params.toString()}`;
};

const Flights: React.FC<FlightsProps> = ({ origin, destination, departureDate, returnDate }) => {
  return (
    <IonCard className="accommodation-card flights-card">
      <IonCardHeader>
        <IonCardTitle>Flight Tickets</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p>
          Route: <strong>{origin || 'Origin'}</strong> to <strong>{destination || 'Destination'}</strong>
        </p>
        <p>Enter city names. Airport codes are resolved automatically for popular destinations.</p>
        <IonButton
          className="service-btn service-btn-light"
          fill="solid"
          style={
            {
              '--background': '#ffffff',
              '--color': '#111111',
              '--border-color': '#111111',
            } as React.CSSProperties
          }
          href={buildSkyscannerUrl(origin, destination, departureDate, returnDate)}
          target="_blank"
        >
          Skyscanner
        </IonButton>
        <IonButton
          className="service-btn service-btn-accent"
          fill="solid"
          style={
            {
              '--background': '#ffffff',
              '--color': '#111111',
              '--border-color': '#111111',
            } as React.CSSProperties
          }
          href={buildAviasalesUrl(origin, destination, departureDate, returnDate)}
          target="_blank"
        >
          Aviasales
        </IonButton>
      </IonCardContent>
    </IonCard>
  );
};

export default Flights;
