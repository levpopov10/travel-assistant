import React, { useEffect, useMemo, useState } from 'react';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonCheckbox,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonSearchbar,
} from '@ionic/react';
import { trash } from 'ionicons/icons';
import { getAdminUsers, setUserSubscription, setUserRole, deleteUser, updateUser } from '../services/adminService';
import { getCurrentUser } from '../services/authService';

const AdminUsers: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  

  const reload = async () => {
    setLoading(true);
    try {
      const items = await getAdminUsers();
      setUsers(items);
      setSelected({});
    } catch (e) {
      // ignore for now
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      return (
        String(u.email || '').toLowerCase().includes(q) ||
        String(u.name || '').toLowerCase().includes(q) ||
        String(u.id || '').toLowerCase().includes(q)
      );
    });
  }, [query, users]);

  const [editing, setEditing] = useState<Record<string, { name: string; email: string }>>({});

  const toggleSelect = (id: string) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  };

  const anySelected = Object.values(selected).some(Boolean);

  const bulkSetPlan = async (plan: 'free' | 'pro') => {
    if (!anySelected) return;
    const ok = window.confirm(`Set ${plan} for selected users?`);
    if (!ok) return;
    const ids = Object.keys(selected).filter((k) => selected[k]);
    try {
      for (const id of ids) {
        await setUserSubscription({ userId: id, plan, planStatus: plan === 'pro' ? 'active' : 'inactive', planExpiresAt: plan === 'pro' ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString() : '' });
      }
      await reload();
      window.alert('Plans updated');
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`Failed to update some subscriptions:\n${msg}`);
      await reload();
    }
  };

  const bulkSetRole = async (role: string) => {
    if (!anySelected) return;
    const ok = window.confirm(`Set role "${role}" for selected users?`);
    if (!ok) return;
    const ids = Object.keys(selected).filter((k) => selected[k]);
    try {
      if (role === 'admin') {
        // only top-level admin can bulk-add admins (level 1)
        if (getCurrentUser()?.adminLevel !== 1) {
          throw new Error('only highest-level admin can add admins');
        }
        const input = window.prompt('Enter admin level to assign to selected users (1-3)', '3');
        if (input === null) throw new Error('cancelled');
        const lvl = Math.min(3, Math.max(1, parseInt(String(input || '3'), 10) || 3));
        for (const id of ids) {
          await setUserRole(id, 'admin', lvl);
        }
      } else {
        for (const id of ids) {
          await setUserRole(id, role);
        }
      }
      await reload();
      window.alert('Roles updated');
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`Failed to update some roles:\n${msg}`);
      await reload();
    }
  };

  const bulkDelete = async () => {
    if (!anySelected) return;
    const ok = window.confirm('Delete selected users? This cannot be undone.');
    if (!ok) return;
    const ids = Object.keys(selected).filter((k) => selected[k]);
    try {
      for (const id of ids) {
        await deleteUser(id);
      }
      await reload();
      window.alert('Selected users deleted');
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`Failed to delete some users:\n${msg}`);
      await reload();
    }
  };

  return (
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>Users</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <div style={{ marginBottom: 8 }}>
          <IonSearchbar value={query} onIonChange={(e) => setQuery(String(e.detail.value || ''))} placeholder="Search users" />
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <IonButton disabled={!anySelected} onClick={() => bulkSetPlan('pro')}>Set Pro</IonButton>
          <IonButton disabled={!anySelected} onClick={() => bulkSetPlan('free')}>Set Free</IonButton>
          <IonSelect placeholder="Set role" disabled={!anySelected} onIonChange={(e) => bulkSetRole(String(e.detail.value || 'user'))}>
            <IonSelectOption value="user">user</IonSelectOption>
            <IonSelectOption value="manager">manager</IonSelectOption>
            <IonSelectOption value="admin">admin</IonSelectOption>
          </IonSelect>
          <IonButton color="danger" disabled={!anySelected} onClick={bulkDelete}><IonIcon icon={trash} /> Delete</IonButton>
          <IonButton onClick={reload}>Refresh</IonButton>
        </div>

        <IonList>
          {filtered.map((u) => (
            <IonItem key={u.id}>
              <IonCheckbox checked={!!selected[u.id]} onIonChange={() => toggleSelect(u.id)} />
              <IonLabel style={{ marginLeft: 8 }}>
                {!editing[u.id] ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong>{u.name || '—'}</strong>
                    <span style={{ opacity: 0.8 }}>{u.email}</span>
                    <span className={`admin-badge level-${u.adminLevel || 3}`} style={{ marginLeft: 8 }}>L{u.adminLevel || 3}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                    <input value={editing[u.id].name} onChange={(e) => setEditing((s) => ({ ...s, [u.id]: { ...s[u.id], name: e.target.value } }))} />
                    <input value={editing[u.id].email} onChange={(e) => setEditing((s) => ({ ...s, [u.id]: { ...s[u.id], email: e.target.value } }))} />
                  </div>
                )}
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  id: {u.id} • role: {u.role} • level: {u.adminLevel || 3} • plan: {u.plan} ({u.planStatus})
                </div>
              </IonLabel>
              <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                {!editing[u.id] ? (
                  <>
                    <IonButton size="small" onClick={async () => { try { await setUserSubscription({ userId: u.id, plan: 'pro', planStatus: 'active', planExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString() }); await reload(); window.alert('Plan updated'); } catch (err) { console.error(err); const msg = err instanceof Error ? err.message : String(err); window.alert(`Failed to update plan:\n${msg}`); } }}>
                      Pro
                    </IonButton>
                    <IonButton size="small" color="medium" onClick={async () => { try { await setUserSubscription({ userId: u.id, plan: 'free', planStatus: 'inactive', planExpiresAt: '' }); await reload(); window.alert('Plan updated'); } catch (err) { console.error(err); const msg = err instanceof Error ? err.message : String(err); window.alert(`Failed to update plan:\n${msg}`); } }}>
                      Free
                    </IonButton>
                    {u.role !== 'admin' && (
                      <IonButton
                        size="small"
                        color="tertiary"
                        disabled={!(getCurrentUser()?.adminLevel === 1)}
                        onClick={async () => {
                          const ok = window.confirm(`Promote ${u.email || u.name || u.id} to admin?`);
                          if (!ok) return;
                          const input = window.prompt('Enter admin level for this user (1-3) where 1=top,3=view-only', '3');
                          if (input === null) return;
                          const lvl = Math.min(3, Math.max(1, parseInt(String(input || '3'), 10) || 3));
                          try {
                            await setUserRole(u.id, 'admin', lvl);
                            await reload();
                            window.alert('User promoted to admin');
                          } catch (err) {
                            console.error(err);
                            const msg = err instanceof Error ? err.message : String(err);
                            window.alert(`Failed to promote user:\n${msg}`);
                          }
                        }}
                      >
                        Make Admin
                      </IonButton>
                    )}
                    {u.role === 'admin' && (
                      <IonButton
                        size="small"
                        color="warning"
                        disabled={!(getCurrentUser()?.adminLevel === 1)}
                        onClick={async () => {
                          const ok = window.confirm(`Demote ${u.email || u.name || u.id} from admin?`);
                          if (!ok) return;
                          try {
                          await setUserRole(u.id, 'user', 3);
                            await reload();
                            window.alert('User demoted from admin');
                          } catch (err) {
                            console.error(err);
                            const msg = err instanceof Error ? err.message : String(err);
                            window.alert(`Failed to demote user:\n${msg}`);
                          }
                        }}
                      >
                        Demote
                      </IonButton>
                    )}
                    <IonButton size="small" onClick={() => setEditing((s) => ({ ...s, [u.id]: { name: u.name || '', email: u.email || '' } }))}>
                      Edit
                    </IonButton>
                  </>
                ) : (
                  <>
                    <IonButton size="small" onClick={async () => { try { const fields = editing[u.id]; await updateUser(u.id, fields); setEditing((s) => { const copy = { ...s }; delete copy[u.id]; return copy; }); await reload(); window.alert('Saved'); } catch (err) { console.error(err); window.alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`); } }}>
                      Save
                    </IonButton>
                    <IonButton size="small" color="medium" onClick={() => setEditing((s) => { const copy = { ...s }; delete copy[u.id]; return copy; })}>
                      Cancel
                    </IonButton>
                  </>
                )}
                <IonButton size="small" color="danger" onClick={async () => { const ok = window.confirm('Delete this user?'); if (!ok) return; try { await deleteUser(u.id); await reload(); window.alert('User deleted'); } catch (err) { console.error(err); const msg = err instanceof Error ? err.message : String(err); window.alert(`Failed to delete user:\n${msg}`); } }}>
                  Delete
                </IonButton>
              </div>
            </IonItem>
          ))}
        </IonList>
      </IonCardContent>
    </IonCard>
  );
};

export default AdminUsers;
