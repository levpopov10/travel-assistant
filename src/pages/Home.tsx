import { useEffect, useRef, useState } from 'react';
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonButtons,
  IonButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonItem,
  IonLabel,
  IonInput,
  IonSegment,
  IonSegmentButton,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import './Home.css';

import TravelInputs from '../components/TravelInputs';
import WeatherInfo from '../components/WeatherInfo';
import Accommodation from '../components/Accommodation';
import Entertainment from '../components/Entertainment';
import EmergencyNumbers from '../components/EmergencyNumbers';
import Holidays from '../components/Holidays';
import Flights from '../components/Flights';
import BudgetAdvisor from '../components/BudgetAdvisor';
import Transport from '../components/Transport';
import FinancePlanner from '../components/FinancePlanner';
import { getCurrentUser, logoutUser, refreshMe, subscribeAuthChange } from '../services/authService';
import { demoCancelToFree, demoUpgradeToPro } from '../services/billingService';
import {
  addSearchHistory,
  clearSearchHistory,
  getSearchHistory,
  removeSearchHistoryItem,
  SearchHistoryEntry,
} from '../services/searchHistoryService';

const Home: React.FC = () => {
  const history = useHistory();
  const [currentUser, setCurrentUser] = useState(getCurrentUser());
  const [origin, setOrigin] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [arrival, setArrival] = useState<string>('');
  const [departure, setDeparture] = useState<string>('');
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'planner' | 'advisor'>('planner');
  const [subBusy, setSubBusy] = useState(false);
  const [subError, setSubError] = useState('');
  const historyOpRef = useRef(0);

  const beginHistoryOp = () => {
    historyOpRef.current += 1;
    return historyOpRef.current;
  };

  const applyHistoryIfLatest = (opId: number, items: SearchHistoryEntry[]) => {
    if (opId === historyOpRef.current) {
      setSearchHistory(items);
    }
  };

  useEffect(() => subscribeAuthChange(() => setCurrentUser(getCurrentUser())), []);

  useEffect(() => {
    refreshMe()
      .then(() => setCurrentUser(getCurrentUser()))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!currentUser?.id) {
      setSearchHistory([]);
      return;
    }
    const opId = beginHistoryOp();
    getSearchHistory(currentUser.id)
      .then((historyItems) => applyHistoryIfLatest(opId, historyItems))
      .catch(() => {
        if (opId === historyOpRef.current) setSearchHistory([]);
      });
  }, [currentUser?.id]);

  const onDestinationChange = (nextDestination: string, nextOrigin?: string) => {
    if (typeof nextOrigin === 'string') {
      setOrigin(nextOrigin);
    }
    setDestination(nextDestination);
    if (!nextDestination || !currentUser?.id) return;
    const originToSave = typeof nextOrigin === 'string' ? nextOrigin : origin;
    const opId = beginHistoryOp();
    addSearchHistory(currentUser.id, { origin: originToSave, destination: nextDestination })
      .then((historyItems) => applyHistoryIfLatest(opId, historyItems))
      .catch((error) => console.error('Failed to save search history', error));
  };

  const onLogout = () => {
    logoutUser().finally(() => history.replace('/auth'));
  };

  const onUpgrade = async () => {
    setSubError('');
    setSubBusy(true);
    try {
      await demoUpgradeToPro();
      setCurrentUser(getCurrentUser());
    } catch (e) {
      setSubError(e instanceof Error ? e.message : 'Upgrade failed');
    } finally {
      setSubBusy(false);
    }
  };

  const onCancel = async () => {
    setSubError('');
    setSubBusy(true);
    try {
      await demoCancelToFree();
      setCurrentUser(getCurrentUser());
    } catch (e) {
      setSubError(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setSubBusy(false);
    }
  };

  const onHistoryClear = () => {
    if (!currentUser?.id) return;
    const ok = window.confirm('Clear all search history?');
    if (!ok) return;
    const opId = beginHistoryOp();
    clearSearchHistory(currentUser.id)
      .then((historyItems) => applyHistoryIfLatest(opId, historyItems))
      .catch((error) => console.error('Failed to clear search history', error));
  };

  const onHistoryDelete = (entry: SearchHistoryEntry) => {
    if (!currentUser?.id) return;
    const opId = beginHistoryOp();
    setSearchHistory((prev) =>
      prev.filter((item) => !(item.id === entry.id && item.createdAt === entry.createdAt))
    );
    removeSearchHistoryItem(currentUser.id, entry)
      .then((historyItems) => applyHistoryIfLatest(opId, historyItems))
      .catch((error) => {
        console.error('Failed to delete history item', error);
        getSearchHistory(currentUser.id)
          .then((historyItems) => applyHistoryIfLatest(opId, historyItems))
          .catch(() => setSearchHistory((prev) => [entry, ...prev]));
      });
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Travel Assistant</IonTitle>
          <IonButtons slot="end">
            {currentUser?.role === 'admin' ? (
              <IonButton fill="outline" onClick={() => history.push('/admin')}>
                Admin
              </IonButton>
            ) : null}
            <IonButton className="logout-button" fill="solid" onClick={onLogout}>Logout</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="home-content" fullscreen>
        {currentUser ? <p className="welcome-user">Hi, {currentUser.name}</p> : null}
        {currentUser ? (
          <IonCard>
            <IonCardHeader>
              <IonCardTitle>Subscription</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <p style={{ marginTop: 0 }}>
                Plan: <strong>{String(currentUser.plan || 'free')}</strong>
                {currentUser.planExpiresAt ? ` (expires ${currentUser.planExpiresAt})` : ''}
              </p>
              {subError ? <p style={{ color: 'var(--ion-color-danger)' }}>{subError}</p> : null}
              {String(currentUser.plan || 'free') === 'pro' ? (
                <IonButton disabled={subBusy} color="medium" onClick={onCancel}>
                  Cancel (back to Free)
                </IonButton>
              ) : (
                <IonButton disabled={subBusy} onClick={onUpgrade}>
                  Upgrade to Pro (demo)
                </IonButton>
              )}
            </IonCardContent>
          </IonCard>
        ) : null}
        <IonCard className="home-tabs-card">
          <IonCardContent>
            <IonSegment
              value={activeTab}
              onIonChange={(e) => setActiveTab((e.detail.value as 'planner' | 'advisor') || 'planner')}
            >
              <IonSegmentButton value="planner">
                <IonLabel>Trip Planner</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="advisor">
                <IonLabel>Budget Advisor</IonLabel>
              </IonSegmentButton>
            </IonSegment>
          </IonCardContent>
        </IonCard>

        <div key={activeTab} className="tab-panel">
          {activeTab === 'advisor' ? (
            <BudgetAdvisor
              onOriginChange={setOrigin}
              onChooseSuggestion={(destination) => {
                setDestination(destination);
                setActiveTab('planner');
              }}
            />
          ) : (
            <>
              <TravelInputs
                onOriginChange={setOrigin}
                onDestinationChange={onDestinationChange}
                onHistoryClear={onHistoryClear}
                onHistoryDelete={onHistoryDelete}
                searchHistory={searchHistory}
              />

              {destination && (
                <>
                  <IonCard className="date-range-card">
                    <IonCardHeader>
                      <IonCardTitle>Trip Dates</IonCardTitle>
                    </IonCardHeader>
                    <IonCardContent>
                      <div className="date-fields-grid">
                        <IonItem>
                          <IonLabel position="stacked">From</IonLabel>
                          <IonInput
                            type="date"
                            value={arrival}
                            onIonInput={(e) => setArrival(String(e.detail.value || ''))}
                          />
                        </IonItem>
                        <IonItem>
                          <IonLabel position="stacked">To</IonLabel>
                          <IonInput
                            type="date"
                            value={departure}
                            onIonInput={(e) => setDeparture(String(e.detail.value || ''))}
                          />
                        </IonItem>
                      </div>
                    </IonCardContent>
                  </IonCard>

                  <WeatherInfo location={destination} startDate={arrival} endDate={departure} />
                  <Flights
                    origin={origin}
                    destination={destination}
                    departureDate={arrival}
                    returnDate={departure}
                  />
                  <Transport
                    origin={origin}
                    destination={destination}
                    departureDate={arrival}
                    returnDate={departure}
                  />
                  <Accommodation destination={destination} arrival={arrival} departure={departure} />
                  <FinancePlanner
                    days={
                      arrival && departure
                        ? Math.max(
                            1,
                            Math.ceil(
                              Math.abs(new Date(departure).getTime() - new Date(arrival).getTime()) /
                                (1000 * 60 * 60 * 24)
                            ) + 1
                          )
                        : 5
                    }
                  />
                  <Entertainment
                    destination={destination}
                    startDate={arrival}
                    endDate={departure}
                  />
                  <Holidays destination={destination} arrival={arrival} departure={departure} />
                  <EmergencyNumbers destination={destination} />
                </>
              )}
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Home;


