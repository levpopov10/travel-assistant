import React, { useEffect, useState } from 'react';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonItem, IonLabel, IonList, IonSearchbar } from '@ionic/react';
import { getAuditLog } from '../services/adminService';

const AuditLog: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const rows = await getAuditLog(500);
      setItems(rows || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const filtered = items.filter((r) => {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return true;
    const text = JSON.stringify(r).toLowerCase();
    return text.includes(q);
  });

  return (
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>Audit Log</IonCardTitle>
      </IonCardHeader>
      <IonCardContent className="admin-audit">
        <div style={{ marginBottom: 8 }}>
          <IonSearchbar value={query} onIonChange={(e) => setQuery(String(e.detail.value || ''))} placeholder="Search audit" />
        </div>
        <IonList>
          {filtered.map((r, idx) => (
            <IonItem key={idx}>
              <IonLabel>
                <div style={{ fontSize: 13 }}>{r.at || r.timestamp || ''} {r.event || r.raw || ''}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{r.email || r.userId || ''} {r.status || ''}</div>
              </IonLabel>
            </IonItem>
          ))}
        </IonList>
        {loading && <div style={{ opacity: 0.8 }}>Loading…</div>}
      </IonCardContent>
    </IonCard>
  );
};

export default AuditLog;
