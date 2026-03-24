import { useCallback, useEffect, useState } from 'react';
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonButton,
  IonSegment,
  IonSegmentButton,
  IonLabel,
} from '@ionic/react';
import { EntertainmentIdea, generateEntertainmentIdeas } from '../services/openrouterService';

interface EntertainmentProps {
  destination?: string;
  startDate?: string;
  endDate?: string;
}

const entertainmentCategories = [
  { value: 'any', label: 'All' },
  { value: 'party', label: 'Party' },
  { value: 'relax', label: 'Relax' },
  { value: 'history', label: 'History' },
  { value: 'food', label: 'Food' },
  { value: 'extreme', label: 'Extreme' },
  { value: 'family', label: 'Family' },
] as const;
type EntertainmentCategory = (typeof entertainmentCategories)[number]['value'];

const emptyIdeasMap = (): Record<EntertainmentCategory, EntertainmentIdea[]> => ({
  any: [],
  party: [],
  relax: [],
  history: [],
  food: [],
  extreme: [],
  family: [],
});

const Entertainment: React.FC<EntertainmentProps> = ({
  destination = '',
  startDate,
  endDate,
}) => {
  const [ideasByCategory, setIdeasByCategory] = useState<Record<EntertainmentCategory, EntertainmentIdea[]>>(emptyIdeasMap);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<EntertainmentCategory>('any');

  const generateIdeas = useCallback(async (selectedCategory?: EntertainmentCategory) => {
    if (!destination) return;
    const targetCategory = selectedCategory || category;

    setLoading(true);
    setError('');
    try {
      const generatedIdeas = await generateEntertainmentIdeas({
        destination,
        startDate,
        endDate,
        category: targetCategory,
      });
      setIdeasByCategory((prev) => ({ ...prev, [targetCategory]: generatedIdeas }));
    } catch (err: any) {
      setError(err?.message || 'Failed to generate entertainment ideas');
      setIdeasByCategory((prev) => ({ ...prev, [targetCategory]: [] }));
    } finally {
      setLoading(false);
    }
  }, [category, destination, endDate, startDate]);

  useEffect(() => {
    if (!destination) {
      setIdeasByCategory(emptyIdeasMap());
      return;
    }

    let cancelled = false;
    const loadAllCategories = async () => {
      setLoading(true);
      setError('');
      try {
        const entries = await Promise.all(
          entertainmentCategories.map(async (item) => {
            const ideas = await generateEntertainmentIdeas({
              destination,
              startDate,
              endDate,
              category: item.value,
            });
            return [item.value, ideas] as const;
          })
        );

        if (cancelled) return;
        const next = emptyIdeasMap();
        entries.forEach(([cat, ideas]) => {
          next[cat] = ideas;
        });
        setIdeasByCategory(next);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to generate entertainment ideas');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAllCategories();
    return () => {
      cancelled = true;
    };
  }, [destination, startDate, endDate]);

  return (
    <IonCard className="entertainment-card">
      <IonCardHeader>
        <IonCardTitle>Entertainment</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <IonSegment
          scrollable
          value={category}
          onIonChange={(e) =>
            setCategory(
              (e.detail.value as (typeof entertainmentCategories)[number]['value']) || 'any'
            )
          }
        >
          {entertainmentCategories.map((item) => (
            <IonSegmentButton key={item.value} value={item.value}>
              <IonLabel>{item.label}</IonLabel>
            </IonSegmentButton>
          ))}
        </IonSegment>

        <IonButton expand="block" onClick={() => generateIdeas(category)} disabled={!destination || loading}>
          {loading ? 'Generating...' : 'Regenerate current tab'}
        </IonButton>

        {error && <p>{error}</p>}

        <div className="categories" style={{ marginTop: '12px' }}>
          {(ideasByCategory[category] || []).map((item, idx) => (
            <div key={idx} className="place-card">
              <span className="place-card-title">{item.title}</span>
              <div className="place-links">
                {item.mapsUrl && (
                  <a href={item.mapsUrl} target="_blank" rel="noopener noreferrer">
                    Maps
                  </a>
                )}
                {item.websiteUrl && (
                  <a href={item.websiteUrl} target="_blank" rel="noopener noreferrer">
                    Site
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </IonCardContent>
    </IonCard>
  );
};

export default Entertainment;
