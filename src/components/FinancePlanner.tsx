import { useEffect, useState } from 'react';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonSpinner,
} from '@ionic/react';

interface FinancePlannerProps {
  days?: number;
}

const scamWarnings = [
  'Do not exchange money in unofficial street points.',
  'Avoid ATM assistance from strangers.',
  'Always check currency conversion screen before card payment.',
];

const currencyOptions = ['USD', 'EUR', 'GBP', 'TRY', 'JPY', 'CNY', 'AUD', 'CAD'] as const;

// The base URL for the currency rates API. In development you may
// hit a local server on port 3001, but when the app runs on a phone
// 'localhost' refers to the device itself which usually has no backend.
//
// To avoid the slow/failing lookups described by the user, prefer using
// a real host address via an environment variable. For example,
// VITE_API_BASE=http://192.168.1.5:3001 or a production URL.
const API_BASE = import.meta.env.VITE_API_BASE || '';

// Decide whether we should attempt to talk to a backend server at all.
// On a real device `window.location.hostname` will usually be something
// like `192.168.x.x` or `capacitor://localhost` where there is no Node
// server running, so it's pointless to even try.  In that case just skip
// straight to the public provider.
const shouldTryBackend = () => {
  if (API_BASE) return true;
  if (typeof window === 'undefined') return true;
  const { protocol, hostname } = window.location;
  // Only attempt local backend automatically when running in an HTTP(S)
  // context (browser). Capacitor/electron use other protocols like
  // "capacitor:" or "ionic:", where a Node server is not present.
  if (!protocol || !protocol.startsWith('http')) return false;
  return hostname === 'localhost' || hostname === '127.0.0.1';
};

const getApiBase = () => {
  if (API_BASE) return API_BASE;
  // caller should have used shouldTryBackend to decide whether to call
  // this, but fall back just in case.
  return `${window.location.protocol}//${window.location.hostname}:3001`;
};

const FinancePlanner: React.FC<FinancePlannerProps> = () => {
  const [baseCurrency, setBaseCurrency] = useState<string>('USD');
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>(['EUR', 'GBP']);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loadingRates, setLoadingRates] = useState(false);
  const [ratesError, setRatesError] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Helper that adds a timeout so we don't wait forever when the
    // local server is unreachable (e.g. phone trying to hit localhost).
    const fetchWithTimeout = async (input: RequestInfo, opts: RequestInit = {}) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3000); // 3‑second timeout
      try {
        return await fetch(input, { ...opts, signal: controller.signal });
      } finally {
        clearTimeout(id);
      }
    };

    const loadRates = async () => {
      setLoadingRates(true);
      setRatesError('');
      try {
        let nextRates: Record<string, number> = {};

        if (shouldTryBackend()) {
          // try local/backend first; if it fails quickly, fall back to public
          try {
            const response = await fetchWithTimeout(
              `${getApiBase()}/api/rates?base=${encodeURIComponent(baseCurrency)}`
            );
            if (!response.ok) {
              throw new Error(`Failed to load rates (${response.status})`);
            }
            const data = await response.json();
            nextRates = (data?.rates || {}) as Record<string, number>;
          } catch (localErr) {
            console.warn('backend fetch failed, using public provider', localErr);
            // either timed out or host was unreachable – ignore and use
            // the public provider instead.
            const fallbackResponse = await fetch(
              `https://open.er-api.com/v6/latest/${encodeURIComponent(baseCurrency)}`
            );
            if (!fallbackResponse.ok) {
              throw new Error(`Failed to load rates (${fallbackResponse.status})`);
            }
            const fallbackData = await fallbackResponse.json();
            nextRates = (fallbackData?.rates || {}) as Record<string, number>;
          }
        } else {
          // device not on localhost and no API_BASE specified – go straight
          // to the public provider instead of waiting for a timeout.
          const fallbackResponse = await fetch(
            `https://open.er-api.com/v6/latest/${encodeURIComponent(baseCurrency)}`
          );
          if (!fallbackResponse.ok) {
            throw new Error(`Failed to load rates (${fallbackResponse.status})`);
          }
          const fallbackData = await fallbackResponse.json();
          nextRates = (fallbackData?.rates || {}) as Record<string, number>;
        }

        if (!nextRates || Object.keys(nextRates).length === 0) {
          throw new Error('Currency rates are empty');
        }

        if (!cancelled) {
          setRates(nextRates);
        }
      } catch (err: any) {
        if (!cancelled) {
          setRates({});
          const message = String(err?.message || '');
          setRatesError(message || 'Failed to load currency rates');
        }
      } finally {
        if (!cancelled) setLoadingRates(false);
      }
    };

    loadRates();
    return () => {
      cancelled = true;
    };
  }, [baseCurrency]);

  return (
    <IonCard className="finance-card">
      <IonCardHeader>
        <IonCardTitle>Finance</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <IonItem>
          <IonLabel>Base currency</IonLabel>
          <IonSelect value={baseCurrency} onIonChange={(e) => setBaseCurrency(String(e.detail.value || 'USD'))}>
            {currencyOptions.map((currency) => (
              <IonSelectOption key={currency} value={currency}>
                {currency}
              </IonSelectOption>
            ))}
          </IonSelect>
        </IonItem>

        <IonItem>
          <IonLabel>Show rates for</IonLabel>
          <IonSelect
            multiple
            value={selectedCurrencies}
            onIonChange={(e) => setSelectedCurrencies(((e.detail.value as string[]) || []).slice(0, 2))}
          >
            {currencyOptions
              .filter((currency) => currency !== baseCurrency)
              .map((currency) => (
                <IonSelectOption key={currency} value={currency}>
                  {currency}
                </IonSelectOption>
              ))}
          </IonSelect>
        </IonItem>

        {loadingRates ? (
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IonSpinner name="crescent" />
            <span>Loading rates...</span>
          </div>
        ) : null}

        {!loadingRates && ratesError ? <p>{ratesError}</p> : null}

        {!loadingRates && !ratesError && (
          <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
            {selectedCurrencies.length === 0 ? (
              <p>Select at least one currency.</p>
            ) : (
              selectedCurrencies.map((currency) => (
                <p key={currency} style={{ margin: 0 }}>
                  1 {baseCurrency} = <strong>{rates[currency] ? rates[currency].toFixed(2) : '-'} {currency}</strong>
                </p>
              ))
            )}
          </div>
        )}

        <IonButton expand="block" onClick={() => setShowDetails((v) => !v)}>
          {showDetails ? 'Hide scam warnings' : 'Show scam warnings'}
        </IonButton>

        {showDetails ? (
          <ul style={{ marginTop: '10px' }}>
            {scamWarnings.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        ) : null}
      </IonCardContent>
    </IonCard>
  );
};

export default FinancePlanner;
