import React, { useEffect, useState } from 'react';
import './Listings.css';
import {
  IonCard,
  IonCardContent,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonButton,
} from '@ionic/react';
import { getRentalListings, RentalListing } from '../services/rentalService';

interface ListingsProps {
  destination?: string;
  arrival?: string;
  departure?: string;
  adults?: number;
}

const Listings: React.FC<ListingsProps> = ({ destination, arrival, departure, adults = 2 }) => {
  const [listings, setListings] = useState<RentalListing[]>([]);

  useEffect(() => {
    let mounted = true;
    getRentalListings(destination, arrival, departure, adults).then((data) => {
      if (mounted) setListings(data);
    });

    return () => {
      mounted = false;
    };
  }, [destination, arrival, departure, adults]);

  const buildAirbnbUrl = (place?: string, checkin?: string, checkout?: string, adultsCount?: number) => {
    const dest = place ? encodeURIComponent(place) : '';
    const base = `https://www.airbnb.com/s/${dest}/homes`;
    const q: string[] = [];
    if (checkin) q.push(`checkin=${encodeURIComponent(checkin)}`);
    if (checkout) q.push(`checkout=${encodeURIComponent(checkout)}`);
    if (adultsCount) q.push(`adults=${adultsCount}`);
    return base + (q.length ? `?${q.join('&')}` : '');
  };

  const buildBookingUrl = (place?: string, checkin?: string, checkout?: string, adultsCount?: number) => {
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
    if (adultsCount) params.set('group_adults', String(adultsCount));
    return `${base}?${params.toString()}`;
  };

  return (
    <IonCard className="listings-card">
      <IonCardContent>
        <IonList>
          {listings.map((l) => (
            <IonItem key={l.id} lines="full">
              <IonLabel>
                <h3>
                  {l.title} {l.isSponsored && <IonBadge color="tertiary">Sponsored</IonBadge>}
                </h3>
                <p>{l.location}</p>
                <p>{l.description}</p>
                <p>
                  <strong>
                    {l.currency} {l.price > 0 ? l.price : ''} {l.priceUnit ? `/ ${l.priceUnit}` : ''}
                  </strong>
                </p>
              </IonLabel>
              <div className="external-buttons">
                {l.airbnbUrl ? (
                  <IonButton fill="solid" size="small" className="external-airbnb" href={l.airbnbUrl} target="_blank">
                    Airbnb
                  </IonButton>
                ) : (
                  <IonButton
                    fill="solid"
                    size="small"
                    className="external-airbnb"
                    href={buildAirbnbUrl(destination, arrival, departure, adults)}
                    target="_blank"
                  >
                    Airbnb
                  </IonButton>
                )}

                {l.bookingUrl ? (
                  <IonButton fill="solid" size="small" className="external-booking" href={l.bookingUrl} target="_blank">
                    Booking
                  </IonButton>
                ) : (
                  <IonButton
                    fill="solid"
                    size="small"
                    className="external-booking"
                    href={buildBookingUrl(destination, arrival, departure, adults)}
                    target="_blank"
                  >
                    Booking
                  </IonButton>
                )}

                {!l.airbnbUrl && !l.bookingUrl && l.url ? (
                  <IonButton fill="outline" size="small" href={l.url} target="_blank">
                    Open
                  </IonButton>
                ) : null}
              </div>
            </IonItem>
          ))}
        </IonList>
      </IonCardContent>
    </IonCard>
  );
};

export default Listings;
