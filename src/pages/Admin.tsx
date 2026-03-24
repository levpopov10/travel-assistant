import { useEffect, useMemo, useState } from 'react';
import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonChip,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { getCurrentUser, logoutUser, refreshMe, subscribeAuthChange, getAuthToken } from '../services/authService';
import { setUserSubscription, type AdminUserRow } from '../services/adminService';
import AdminDashboard from '../components/AdminDashboard';
import AdminUsers from '../components/AdminUsers';
import AuditLog from '../components/AuditLog';
import './Admin.css';

const Admin: React.FC = () => {
  const history = useHistory();
  const [currentUser, setCurrentUser] = useState(getCurrentUser());
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [audit, setAudit] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [tokenPreview, setTokenPreview] = useState('');

  useEffect(() => {
    try {
      const t = getAuthToken();
      setTokenPreview(t ? `${t.slice(0, 8)}...${t.slice(-6)}` : '(no token)');
    } catch {
      setTokenPreview('(err)');
    }
  }, []);

  useEffect(() => subscribeAuthChange(() => setCurrentUser(getCurrentUser())), []);

  useEffect(() => {
    const unsub = subscribeAuthChange(() => {
      try {
        const t = getAuthToken();
        setTokenPreview(t ? `${t.slice(0, 8)}...${t.slice(-6)}` : '(no token)');
      } catch {
        setTokenPreview('(err)');
      }
      setCurrentUser(getCurrentUser());
    });
    return unsub;
  }, []);

  useEffect(() => {
    refreshMe().catch(() => undefined);
  }, []);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      return (
        String(u.email || '').toLowerCase().includes(q) ||
        String(u.name || '').toLowerCase().includes(q) ||
        String(u.id || '').toLowerCase().includes(q)
      );
    });
  }, [query, users]);

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      // keep existing behavior: refresh user + audit via refreshMe()
      await refreshMe().catch(() => undefined);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLogout = () => {
    logoutUser().finally(() => history.replace('/auth'));
  };

  const stats = useMemo(() => {
    const total = users.length;
    const pro = users.filter((u) => u.plan === 'pro').length;
    const admins = users.filter((u) => u.role === 'admin').length;
    return { total, pro, admins };
  }, [users]);

  const setPlan = async (userId: string, plan: 'free' | 'pro') => {
    setError('');
    try {
      const planExpiresAt =
        plan === 'pro' ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString() : '';
      await setUserSubscription({ userId, plan, planStatus: plan === 'pro' ? 'active' : 'inactive', planExpiresAt });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update subscription');
    }
  };

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <IonPage className="admin-page">
        <IonHeader>
          <IonToolbar>
            <IonTitle>Admin</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding admin-content">
          <IonCard className="admin-card">
            <IonCardHeader>
              <IonCardTitle>Access denied</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <IonButton onClick={() => history.replace('/home')}>Back</IonButton>
            </IonCardContent>
          </IonCard>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage className="admin-page">
      <IonHeader>
        <IonToolbar>
          <IonTitle>
            <span className="admin-toolbar-title">
              Admin Panel <span className="admin-toolbar-subtitle">demo subscriptions</span>
            </span>
          </IonTitle>
          <div slot="end" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <IonButton fill="solid" onClick={onLogout}>
              Logout
            </IonButton>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding admin-content">
        <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--ion-color-medium)' }}>
          <div>Token: {tokenPreview}</div>
            <div>
            Current user: {currentUser ? `${currentUser.email} (${currentUser.role || 'n/a'})` : 'none'}
            {currentUser && typeof (currentUser as any).adminLevel === 'number' && (
              <span style={{ marginLeft: 8 }}>level: {(currentUser as any).adminLevel}</span>
            )}
          </div>
        </div>

        <div className="admin-grid">
          <div>
            <AdminDashboard />
            <div style={{ height: 16 }} />
            <AdminUsers />
          </div>
          <div>
            <AuditLog />
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Admin;
