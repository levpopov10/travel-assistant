import { useState } from 'react';
import { IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonChip, IonButton } from '@ionic/react';
import { generateTravelStyles } from '../services/openrouterService';

const styles = ['Relaxation', 'Adventure', 'Culture', 'Beach', 'Food'];

interface TravelStyleSelectorProps {
  destination?: string;
  onStyleChange?: (style: string) => void;
}

const TravelStyleSelector: React.FC<TravelStyleSelectorProps> = ({ destination = '', onStyleChange }) => {
  const [selected, setSelected] = useState<string>('');
  const [aiStyles, setAiStyles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSelect = (style: string) => {
    setSelected(style);
    onStyleChange?.(style);
  };

  const handleGenerateAiStyles = async () => {
    if (!destination) return;

    setLoading(true);
    setError('');
    try {
      const generated = await generateTravelStyles(destination);
      setAiStyles(generated);
      if (generated.length > 0) {
        handleSelect(generated[0]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to generate styles');
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonCard className="style-card">
      <IonCardHeader>
        <IonCardTitle>Personalization</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <div className="styles-list">
          {styles.map((s, idx) => (
            <IonChip
              key={idx}
              color={selected === s ? 'primary' : 'medium'}
              onClick={() => handleSelect(s)}
            >
              {s}
            </IonChip>
          ))}
        </div>

        <IonButton expand="block" onClick={handleGenerateAiStyles} disabled={!destination || loading}>
          {loading ? 'Generating...' : 'Generate styles with AI'}
        </IonButton>

        {error && <p>{error}</p>}

        {aiStyles.length > 0 && (
          <div className="styles-list" style={{ marginTop: '10px' }}>
            {aiStyles.map((s, idx) => (
              <IonChip
                key={`ai-${idx}`}
                color={selected === s ? 'primary' : 'tertiary'}
                onClick={() => handleSelect(s)}
              >
                {s}
              </IonChip>
            ))}
          </div>
        )}

        {selected && (
          <p>
            Travel style: <strong>{selected}</strong>
          </p>
        )}
      </IonCardContent>
    </IonCard>
  );
};

export default TravelStyleSelector;
