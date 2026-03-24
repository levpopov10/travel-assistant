import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/react';

interface TransportProps {
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
}

const buildFlixbusUrl = (
  origin?: string,
  destination?: string,
  departureDate?: string,
  returnDate?: string
) => {
  const route = [origin, destination].filter(Boolean).join(' to ');
  if (!route) return 'https://www.flixbus.com';
  const datePart = [departureDate, returnDate].filter(Boolean).join(' ');
  const query = `${route} ${datePart} FlixBus`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
};

const Transport: React.FC<TransportProps> = ({ origin = '', destination = '', departureDate, returnDate }) => {
  return (
    <IonCard className="transport-card">
      <IonCardHeader>
        <IonCardTitle>FlixBus</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p>
          Route: <strong>{origin || 'Origin'}</strong> to <strong>{destination || 'Destination'}</strong>
        </p>
        <IonButton
          className="service-btn service-btn-light"
          fill="solid"
          href={buildFlixbusUrl(origin, destination, departureDate, returnDate)}
          target="_blank"
        >
          Open FlixBus
        </IonButton>
      </IonCardContent>
    </IonCard>
  );
};

export default Transport;

