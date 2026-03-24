import { useState } from 'react';
import {
  IonInput,
  IonButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
} from '@ionic/react';
import { SearchHistoryEntry } from '../services/searchHistoryService';

interface TravelInputsProps {
  onOriginChange?: (origin: string) => void;
  onDestinationChange?: (destination: string, origin?: string) => void;
  onHistoryClear?: () => void;
  onHistoryDelete?: (entry: SearchHistoryEntry) => void;
  searchHistory?: SearchHistoryEntry[];
}

const normalizeCity = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
    .join(' ');

const TravelInputs: React.FC<TravelInputsProps> = ({
  onOriginChange,
  onDestinationChange,
  onHistoryClear,
  onHistoryDelete,
  searchHistory = [],
}) => {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [step, setStep] = useState<'origin' | 'destination'>('origin');

  const handleOriginNext = () => {
    if (origin.trim()) {
      const normalizedOrigin = normalizeCity(origin);
      setOrigin(normalizedOrigin);
      onOriginChange?.(normalizedOrigin);

      // Reset destination when origin changes to avoid stale arrival airport/city.
      setDestination('');
      onDestinationChange?.('');

      setStep('destination');
    }
  };

  const handleDestinationSet = () => {
    if (destination.trim()) {
      const normalizedDestination = normalizeCity(destination);
      setDestination(normalizedDestination);
      onDestinationChange?.(normalizedDestination, origin);
    }
  };

  const handleChangeOrigin = () => {
    setStep('origin');
  };

  const handleSelectHistory = (item: SearchHistoryEntry) => {
    setOrigin(item.origin || '');
    setDestination(item.destination || '');
    if (item.origin) onOriginChange?.(item.origin);
    onDestinationChange?.(item.destination, item.origin || '');
    setStep('destination');
  };

  return (
    <IonCard className="travel-inputs-card">
      <IonCardHeader>
        <IonCardTitle>
          {step === 'origin' ? 'Where are you traveling from?' : 'Where do you want to go? (City or Country)'}
        </IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        {step === 'origin' ? (
          <>
            <p style={{ fontSize: '0.95rem', marginBottom: '16px', color: '#f5f5f5' }}>
              Enter your departure city.
            </p>
            <IonInput
              placeholder="Example: Varna, Paris, Tokyo"
              value={origin}
              onIonChange={(e) => setOrigin(e.detail.value || '')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleOriginNext();
              }}
              style={{ marginBottom: '16px' }}
            />
            <IonButton
              expand="block"
              onClick={handleOriginNext}
              disabled={!origin.trim()}
            >
              Next
            </IonButton>
          </>
        ) : (
          <>
            <p style={{ fontSize: '0.95rem', marginBottom: '8px', color: '#f5f5f5' }}>
              <strong>From:</strong> {origin}
            </p>
            <p style={{ fontSize: '0.95rem', marginBottom: '16px', color: '#f5f5f5' }}>
              Enter destination city or country.
            </p>
            <IonInput
              placeholder="Example: Bulgaria, Italy, Sofia, Barcelona"
              value={destination}
              onIonChange={(e) => setDestination(e.detail.value || '')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDestinationSet();
              }}
              style={{ marginBottom: '16px' }}
              autofocus
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <IonButton
                expand="block"
                onClick={handleChangeOrigin}
                color="medium"
              >
                Back
              </IonButton>
              <IonButton
                expand="block"
                onClick={handleDestinationSet}
                disabled={!destination.trim()}
              >
                Select
              </IonButton>
            </div>
          </>
        )}
        {searchHistory.length > 0 ? (
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <p style={{ fontSize: '0.9rem', margin: 0, color: '#f5f5f5' }}>
                Recent searches
              </p>
              <IonButton
                size="small"
                color="danger"
                fill="solid"
                style={{
                  '--border-radius': '999px',
                  '--padding-start': '10px',
                  '--padding-end': '10px',
                  minHeight: '30px',
                  fontSize: '0.72rem',
                  letterSpacing: '0.2px',
                }}
                onClick={onHistoryClear}
              >
                Clear all
              </IonButton>
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {searchHistory.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px',
                    borderRadius: '10px',
                    background: 'rgba(255,255,255,0.18)',
                  }}
                >
                  <IonButton
                    size="small"
                    fill="solid"
                    color="light"
                    style={{
                      '--border-radius': '10px',
                      '--padding-start': '10px',
                      '--padding-end': '10px',
                      margin: 0,
                    }}
                    onClick={() => handleSelectHistory(item)}
                  >
                    {(item.origin ? `${item.origin} -> ` : '') + item.destination}
                  </IonButton>
                  <IonButton
                    size="small"
                    color="danger"
                    fill="outline"
                    style={{
                      '--border-radius': '999px',
                      '--padding-start': '10px',
                      '--padding-end': '10px',
                      marginLeft: 'auto',
                      fontWeight: 700,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onHistoryDelete?.(item);
                    }}
                  >
                    Delete
                  </IonButton>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </IonCardContent>
    </IonCard>
  );
};

export default TravelInputs;
