import { useCallback, useEffect, useState } from 'react';
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonList,
  IonItem,
  IonLabel,
} from '@ionic/react';
import { EmergencyContact, generateEmergencyContacts } from '../services/openrouterService';

const fallbackNumbers: EmergencyContact[] = [
  { label: 'Police', number: '112', note: 'Emergency line' },
  { label: 'Ambulance', number: '112', note: 'Medical emergency' },
  { label: 'Fire Service', number: '112', note: 'Fire emergency' },
];

const defaultRisks = [
  'Avoid isolated streets at night.',
  'Use licensed taxi services only.',
  'Keep copies of documents offline.',
];

const riskByDestination: Record<string, string[]> = {
  paris: ['Watch for pickpockets in metro and tourist zones.'],
  barcelona: ['High pickpocket risk in central areas.'],
  rome: ['Be careful at crowded landmarks and stations.'],
  istanbul: ['Use official taxi apps and avoid fare scams.'],
  bangkok: ['Ignore unofficial street tour offers.'],
};

const normalize = (value: string) => value.trim().toLowerCase();
const buildMapsQuery = (destination: string, type: 'hospital' | 'police') => {
  const query = type === 'hospital' ? `hospitals in ${destination}` : `tourist police in ${destination}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

interface EmergencyNumbersProps {
  destination?: string;
}

const EmergencyNumbers: React.FC<EmergencyNumbersProps> = ({ destination = '' }) => {
  const [numbers, setNumbers] = useState<EmergencyContact[]>(fallbackNumbers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const destinationRisks = destination ? riskByDestination[normalize(destination)] || [] : [];
  const risks = [...destinationRisks, ...defaultRisks].slice(0, 3);

  const loadNumbers = useCallback(async () => {
    if (!destination) {
      setNumbers(fallbackNumbers);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const generated = await generateEmergencyContacts(destination);
      if (generated.length > 0) {
        setNumbers(generated);
      } else {
        setNumbers(fallbackNumbers);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load emergency contacts');
      setNumbers(fallbackNumbers);
    } finally {
      setLoading(false);
    }
  }, [destination]);

  useEffect(() => {
    loadNumbers();
  }, [loadNumbers]);

  return (
    <IonCard className="emergency-card safety-emergency-card">
      <IonCardHeader>
        <IonCardTitle>Safety and Emergency</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        {loading && <p className="emergency-status">Loading updated numbers...</p>}
        {!loading && destination && (
          <p className="emergency-status emergency-status-ready" onClick={loadNumbers}>
            Refresh numbers
          </p>
        )}
        {error && <p>{error}</p>}
        <IonList>
          {numbers.map((item, idx) => (
            <IonItem key={idx} className="emergency-item" lines="full">
              <IonLabel>
                <h3>{item.label}</h3>
                <p>
                  <a href={`tel:${item.number}`}>{item.number}</a>
                </p>
                {item.note ? <p>{item.note}</p> : null}
              </IonLabel>
            </IonItem>
          ))}
        </IonList>

        {destination ? (
          <p className="emergency-status">
            <a href={buildMapsQuery(destination, 'hospital')} target="_blank" rel="noreferrer">
              Hospitals
            </a>{' '}
            |{' '}
            <a href={buildMapsQuery(destination, 'police')} target="_blank" rel="noreferrer">
              Tourist police
            </a>
          </p>
        ) : null}

        <IonList className="safety-tips-list">
          {risks.map((item, idx) => (
            <IonItem key={`risk-${idx}`} lines="none">
              <IonLabel className="safety-tip-text">{item}</IonLabel>
            </IonItem>
          ))}
        </IonList>
      </IonCardContent>
    </IonCard>
  );
};

export default EmergencyNumbers;
