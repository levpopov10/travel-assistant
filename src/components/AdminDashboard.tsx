import React, { useEffect, useMemo, useState } from 'react';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonGrid, IonRow, IonCol, IonSpinner } from '@ionic/react';
import { getAdminUsers } from '../services/adminService';

const AdminDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const items = await getAdminUsers();
        if (!mounted) return;
        setUsers(items);
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const total = users.length;
    const pro = users.filter((u) => u.plan === 'pro').length;
    const admins = users.filter((u) => u.role === 'admin').length;
    const active = users.filter((u) => u.planStatus === 'active').length;
    return { total, pro, admins, active };
  }, [users]);

  if (loading) {
    return (
      <IonCard>
        <IonCardHeader>
          <IonCardTitle>Dashboard</IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          <IonSpinner name="crescent" />
        </IonCardContent>
      </IonCard>
    );
  }

  return (
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>Dashboard</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <IonGrid>
          <IonRow>
            <IonCol size="6">
              <IonChip color="primary">Total Users: {stats.total}</IonChip>
            </IonCol>
            <IonCol size="6">
              <IonChip color="secondary">Pro Users: {stats.pro}</IonChip>
            </IonCol>
          </IonRow>
          <IonRow>
            <IonCol size="6">
              <IonChip color="tertiary">Admins: {stats.admins}</IonChip>
            </IonCol>
            <IonCol size="6">
              <IonChip color="success">Active Subs: {stats.active}</IonChip>
            </IonCol>
          </IonRow>
        </IonGrid>
      </IonCardContent>
    </IonCard>
  );
};

export default AdminDashboard;
