import React, { useEffect, useState } from 'react';
import { IonCard, IonCardContent, IonList, IonItem, IonLabel, IonButton } from '@ionic/react';
import './MarketplaceEmbed.css';

interface Props {
  destination?: string;
  arrival?: string;
  departure?: string;
}

const MarketplaceEmbed: React.FC<Props> = ({ destination, arrival, departure }) => {
  const [airbnbResults, setAirbnbResults] = useState<any[]>([]);
  const [bookingResults, setBookingResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!destination) return;

    const fetchAll = async () => {
      setLoading(true);
      try {
        const base = window.location.origin.replace(/:\d+$/, ':3001');
        const qs = `destination=${encodeURIComponent(destination)}&checkin=${encodeURIComponent(arrival || '')}&checkout=${encodeURIComponent(departure || '')}`;

        const a = await fetch(`${base}/api/search?site=airbnb&${qs}`);
        const ba = await a.json();
        setAirbnbResults(ba.results || []);

        const b = await fetch(`${base}/api/search?site=booking&${qs}`);
        const bb = await b.json();
        setBookingResults(bb.results || []);
      } catch (err) {
        console.error('embed fetch error', err);
      }
      setLoading(false);
    };

    fetchAll();
  }, [destination, arrival, departure]);

  return (
    <IonCard className="marketplace-embed">
      <IonCardContent>
        {loading && <div className="embed-loading">Loading...</div>}

        <IonList>
          {airbnbResults.map((r, i) => (
            <IonItem key={`a-${i}`} lines="full">
              <IonLabel>
                <h3>{r.title}</h3>
                <p>{r.price}</p>
              </IonLabel>
              {r.listingUrl ? (
                <IonButton size="small" href={r.listingUrl} target="_blank">
                  Open
                </IonButton>
              ) : null}
            </IonItem>
          ))}
        </IonList>

        <IonList>
          {bookingResults.map((r, i) => (
            <IonItem key={`b-${i}`} lines="full">
              <IonLabel>
                <h3>{r.title}</h3>
                <p>{r.price}</p>
              </IonLabel>
              {r.listingUrl ? (
                <IonButton size="small" href={r.listingUrl} target="_blank">
                  Open
                </IonButton>
              ) : null}
            </IonItem>
          ))}
        </IonList>
      </IonCardContent>
    </IonCard>
  );
};

export default MarketplaceEmbed;
