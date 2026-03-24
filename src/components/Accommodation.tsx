import { IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton } from '@ionic/react';

interface AccommodationProps {
  destination?: string;
  arrival?: string;
  departure?: string;
  adults?: number;
}

const buildAirbnbUrl = (place?: string, checkin?: string, checkout?: string, adultsCount = 2) => {
  const dest = place ? encodeURIComponent(place) : '';
  const base = `https://www.airbnb.com/s/${dest}/homes`;
  const q: string[] = [];
  if (checkin) q.push(`checkin=${encodeURIComponent(checkin)}`);
  if (checkout) q.push(`checkout=${encodeURIComponent(checkout)}`);
  q.push(`adults=${adultsCount}`);
  return `${base}?${q.join('&')}`;
};

const buildBookingUrl = (place?: string, checkin?: string, checkout?: string, adultsCount = 2) => {
  const base = 'https://www.booking.com/searchresults.html';
  const params = new URLSearchParams();
  if (place) params.set('ss', place);
  if (checkin) {
    const [y, m, d] = checkin.split('-');
    if (y && m && d) {
      params.set('checkin_year', y);
      params.set('checkin_month', String(Number(m)));
      params.set('checkin_monthday', String(Number(d)));
    }
  }
  if (checkout) {
    const [y2, m2, d2] = checkout.split('-');
    if (y2 && m2 && d2) {
      params.set('checkout_year', y2);
      params.set('checkout_month', String(Number(m2)));
      params.set('checkout_monthday', String(Number(d2)));
    }
  }
  params.set('group_adults', String(adultsCount));
  return `${base}?${params.toString()}`;
};

const Accommodation: React.FC<AccommodationProps> = ({ destination, arrival, departure, adults = 2 }) => {
  return (
    <IonCard className="accommodation-card">
      <IonCardHeader>
        <IonCardTitle>Accommodation Search</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p>Open live listings on platforms:</p>
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
          href={buildAirbnbUrl(destination, arrival, departure, adults)}
          target="_blank"
        >
          Airbnb
        </IonButton>
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
          href={buildBookingUrl(destination, arrival, departure, adults)}
          target="_blank"
        >
          Booking
        </IonButton>
      </IonCardContent>
    </IonCard>
  );
};

export default Accommodation;
