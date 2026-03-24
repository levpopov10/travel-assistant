import { useEffect, useMemo, useState } from 'react';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCheckbox, IonItem, IonLabel } from '@ionic/react';

const STORAGE_KEY = 'travel_pretrip_checklist_v1';

const defaultItems = [
  'Visa',
  'Insurance',
  'Vaccinations',
  'Documents',
  'Power adapter',
];

type ChecklistState = Record<string, boolean>;

const readChecklist = (): ChecklistState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ChecklistState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const PreTripChecklist: React.FC = () => {
  const [state, setState] = useState<ChecklistState>({});

  useEffect(() => {
    setState(readChecklist());
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const completed = useMemo(
    () => defaultItems.filter((item) => state[item]).length,
    [state]
  );

  return (
    <IonCard className="checklist-card">
      <IonCardHeader>
        <IonCardTitle>Pre-trip checklist</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p>
          Completed: <strong>{completed}/{defaultItems.length}</strong>
        </p>
        {defaultItems.map((item) => (
          <IonItem key={item}>
            <IonCheckbox
              checked={Boolean(state[item])}
              onIonChange={(e) =>
                setState((prev) => ({ ...prev, [item]: Boolean(e.detail.checked) }))
              }
            />
            <IonLabel style={{ marginLeft: '10px' }}>{item}</IonLabel>
          </IonItem>
        ))}
      </IonCardContent>
    </IonCard>
  );
};

export default PreTripChecklist;

