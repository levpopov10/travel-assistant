import { useEffect, useState } from 'react';
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
} from '@ionic/react';
import { fetchWeatherByQuery, fetchWeatherRange, WeatherData, DailyWeather } from '../services/weatherService';
import './WeatherInfo.css';

interface WeatherInfoProps {
  location?: string;
  startDate?: string;
  endDate?: string;
}

const WeatherInfo: React.FC<WeatherInfoProps> = ({ location = '', startDate, endDate }) => {
  const [data, setData] = useState<WeatherData | DailyWeather[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const query = location;
    if (!query) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    if (startDate && endDate) {
      fetchWeatherRange(query, startDate, endDate)
        .then(setData)
        .catch((err) => { const msg = String(err?.message || ""); if (msg.includes("out of allowed range")) { setError("Forecast is available only for the next 16 days."); } else { setError(msg || "Failed to load weather"); } })
        .finally(() => setLoading(false));
    } else {
      fetchWeatherByQuery(query)
        .then(setData)
        .catch((err) => { const msg = String(err?.message || ""); if (msg.includes("out of allowed range")) { setError("Forecast is available only for the next 16 days."); } else { setError(msg || "Failed to load weather"); } })
        .finally(() => setLoading(false));
    }
  }, [location, startDate, endDate, isOpen]);

  useEffect(() => {
    setIsOpen(false);
    setData(null);
    setError(null);
  }, [location]);

  const title = location ? `Weather in ${location}` : 'Weather';
  const formatDay = (date: string) =>
    new Date(date).toLocaleDateString(undefined, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });

  return (
    <IonCard className="weather-card">
      <IonCardHeader
        className="weather-header"
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }
        }}
      >
        <IonCardTitle>{title}</IonCardTitle>
        <p className="weather-toggle-text">{isOpen ? 'Hide details' : 'Show details'}</p>
      </IonCardHeader>
      {!isOpen && (
        <IonCardContent className="weather-content">
          <p className="weather-state">Tap the weather header to view forecast</p>
        </IonCardContent>
      )}
      {isOpen && (
        <IonCardContent className="weather-content">
        {loading && <p className="weather-state">Loading weather...</p>}
        {error && <p className="weather-state weather-state-error">{error}</p>}

        {!loading && !error && Array.isArray(data) && data.length > 0 && (
          <div className="weather-forecast-grid">
            {data.map((d) => (
              <div className="weather-day-card" key={d.date}>
                <p className="weather-day-date">{formatDay(d.date)}</p>
                <p className="weather-day-temp">{Math.round(d.temperature)} C</p>
                <p className="weather-day-desc">{d.description}</p>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && data && !Array.isArray(data) && (
          <div className="weather-now-card">
            <p className="weather-now-temp">{Math.round(data.temperature)} C</p>
            <p className="weather-now-desc">{data.description}</p>
          </div>
        )}

        {!data && !loading && !error && <p className="weather-state">No weather data yet.</p>}
        </IonCardContent>
      )}
    </IonCard>
  );
};

export default WeatherInfo;

