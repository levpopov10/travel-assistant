import { useState } from 'react';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonInput,
  IonSpinner,
} from '@ionic/react';
import { BudgetTripSuggestion } from '../services/budgetAdvisorService';
import { generateBudgetTripSuggestions } from '../services/openrouterService';

interface BudgetAdvisorProps {
  onOriginChange?: (origin: string) => void;
  onChooseSuggestion?: (destination: string) => void;
}

const BudgetAdvisor: React.FC<BudgetAdvisorProps> = ({
  onOriginChange,
  onChooseSuggestion,
}) => {
  const [origin, setOrigin] = useState('');
  const [budget, setBudget] = useState<string>('');
  const [days, setDays] = useState<string>('');
  const [travelers, setTravelers] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<BudgetTripSuggestion[]>([]);
  const [hasSuggested, setHasSuggested] = useState(false);

  const numericBudget = Number(budget);
  const numericDays = Number(days);
  const numericTravelers = Number(travelers);
  const normalizedOrigin = origin.trim();

  const onSuggest = async () => {
    setHasSuggested(true);
    if (!normalizedOrigin) {
      setError('Origin city is required');
      setSuggestions([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const items = await generateBudgetTripSuggestions({
        origin: normalizedOrigin,
        budgetUsd: numericBudget,
        tripDays: numericDays,
        travelers: numericTravelers,
      });
      setSuggestions(items);
    } catch (err) {
      setSuggestions([]);
      setError(String((err as Error)?.message || 'Failed to generate budget suggestions'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonCard className="advisor-card">
      <IonCardHeader>
        <IonCardTitle>Budget Advisor</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p style={{ fontSize: '0.95rem', marginBottom: '12px', color: '#123' }}>
          AI advisor estimates destination fit by budget, flights, and accommodation.
        </p>
        <IonInput
          placeholder="Origin city (required)"
          value={origin}
          onIonInput={(e) => {
            const next = String(e.detail.value || '');
            setOrigin(next);
            onOriginChange?.(next);
          }}
          style={{ marginBottom: '10px' }}
        />
        <IonInput
          type="number"
          min="1"
          placeholder="Total budget (USD)"
          value={budget}
          onIonInput={(e) => setBudget(String(e.detail.value || ''))}
          style={{ marginBottom: '10px' }}
        />
        <IonInput
          type="number"
          min="1"
          placeholder="Trip days (e.g. 5)"
          value={days}
          onIonInput={(e) => setDays(String(e.detail.value || ''))}
          style={{ marginBottom: '12px' }}
        />
        <IonInput
          type="number"
          min="1"
          placeholder="Travelers"
          value={travelers}
          onIonInput={(e) => setTravelers(String(e.detail.value || ''))}
          style={{ marginBottom: '12px' }}
        />
        <IonButton
          expand="block"
          onClick={onSuggest}
          disabled={
            !normalizedOrigin ||
            !numericBudget ||
            numericBudget <= 0 ||
            !numericDays ||
            numericDays <= 0 ||
            !numericTravelers ||
            numericTravelers <= 0 ||
            loading
          }
        >
          Suggest destinations
        </IonButton>

        {loading ? (
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IonSpinner name="crescent" />
            <span>Generating AI suggestions...</span>
          </div>
        ) : null}

        {!loading && error ? (
          <p style={{ marginTop: '12px', color: '#8b0000' }}>{error}</p>
        ) : null}

        {!loading && !error && hasSuggested && suggestions.length === 0 && numericBudget > 0 ? (
          <p style={{ marginTop: '12px' }}>No recommendations for this budget.</p>
        ) : null}

        {suggestions.length > 0 ? (
          <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
            {suggestions.map((item: BudgetTripSuggestion) => (
              <div
                key={`${item.destination}-${item.country}`}
                style={{
                  background: 'rgba(255,255,255,0.75)',
                  borderRadius: '12px',
                  padding: '10px',
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {item.destination}, {item.country}
                </div>
                <div style={{ fontSize: '0.88rem' }}>Flights: ${item.flightEstimateUsd}</div>
                <div style={{ fontSize: '0.88rem' }}>Accommodation: ${item.stayEstimateUsd}</div>
                <div style={{ fontSize: '0.88rem' }}>Food and transport: ${item.foodTransportEstimateUsd}</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Total: ${item.totalEstimateUsd}</div>
                <div style={{ fontSize: '0.85rem' }}>{item.reason}</div>
                <div style={{ marginTop: 8 }}>
                  <IonButton
                    size="small"
                    onClick={() => onChooseSuggestion?.(item.destination)}
                  >
                    Plan this trip
                  </IonButton>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </IonCardContent>
    </IonCard>
  );
};

export default BudgetAdvisor;
