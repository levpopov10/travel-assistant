import { useEffect, useState } from 'react';
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonList,
  IonItem,
  IonLabel,
} from '@ionic/react';
import { Holiday, fetchHolidaysByCity } from '../services/calendarificService';

interface HolidaysProps {
  destination?: string;
  arrival?: string;
  departure?: string;
}

const Holidays: React.FC<HolidaysProps> = ({
  destination = '',
  arrival = '',
  departure = '',
}) => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const hasDateRange = Boolean(arrival && departure);

  useEffect(() => {
    if (!destination) {
      setHolidays([]);
      return;
    }
    const parseDate = (value: string): number | null => {
      if (!value) return null;
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? null : parsed;
    };

    const arrivalTs = parseDate(arrival);
    const departureTs = parseDate(departure);
    const hasRange = arrivalTs !== null && departureTs !== null;
    const rangeStart = hasRange ? Math.min(arrivalTs, departureTs) : null;
    const rangeEnd = hasRange ? Math.max(arrivalTs, departureTs) : null;

    const loadHolidays = async () => {
      setLoading(true);
      try {
        const years = new Set<number>();
        if (hasRange) {
          const startYear = new Date(rangeStart!).getFullYear();
          const endYear = new Date(rangeEnd!).getFullYear();
          for (let year = startYear; year <= endYear; year += 1) {
            years.add(year);
          }
        } else {
          years.add(new Date().getFullYear());
        }

        const allByYear = await Promise.all(
          Array.from(years).map((year) => fetchHolidaysByCity(destination, year))
        );

        const all = allByYear.flat();
        const unique = all.filter(
          (holiday, index, arr) =>
            arr.findIndex((h) => h.name === holiday.name && h.date === holiday.date) === index
        );

        if (!hasRange) {
          setHolidays([]);
          return;
        }

        const filtered = unique.filter((holiday) => {
          const holidayTs = parseDate(holiday.date);
          return holidayTs !== null && holidayTs >= rangeStart! && holidayTs <= rangeEnd!;
        });

        setHolidays(filtered);
      } finally {
        setLoading(false);
      }
    };

    loadHolidays();
  }, [destination, arrival, departure]);

  // Hide the whole block when there is nothing to show.
  if (!destination || !hasDateRange || (!loading && holidays.length === 0)) {
    return null;
  }

  return (
    <IonCard className="holiday-card">
      <IonCardHeader>
        <IonCardTitle>Holidays and Events</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        {loading && <p>Loading...</p>}
        {!loading && holidays.length > 0 && (
          <IonList>
            {holidays.slice(0, 8).map((h, idx) => (
              <IonItem key={idx}>
                <IonLabel>
                  <h3>{h.name}</h3>
                  <p>{h.date}{h.type && h.type.length > 0 ? ` - ${h.type.join(', ')}` : ''}</p>
                </IonLabel>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonCardContent>
    </IonCard>
  );
};

export default Holidays;
