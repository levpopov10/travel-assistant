import { useMemo, useState } from 'react';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { loginUser, registerUser } from '../services/authService';
import './Auth.css';

type Mode = 'login' | 'register';

const Auth: React.FC = () => {
  const history = useHistory();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    if (mode === 'register') {
      return Boolean(name.trim() && email.trim() && password.length >= 6);
    }
    return Boolean(identifier.trim() && password);
  }, [email, identifier, mode, name, password]);

  const onSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') {
        await registerUser({ name, email, password });
      } else {
        await loginUser({ identifier, password });
      }
      history.replace('/home');
    } catch (err: any) {
      setError(err?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Travel Assistant</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="auth-content">
        <IonCard className="auth-card">
          <IonCardHeader>
            <IonCardTitle>Account</IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            <IonSegment value={mode} onIonChange={(e) => setMode(e.detail.value as Mode)}>
              <IonSegmentButton value="login">
                <IonLabel>Login</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="register">
                <IonLabel>Register</IonLabel>
              </IonSegmentButton>
            </IonSegment>

            {mode === 'register' && (
              <IonItem>
                <IonLabel position="stacked">Name</IonLabel>
                <IonInput value={name} onIonInput={(e) => setName(String(e.detail.value || ''))} />
              </IonItem>
            )}

            {mode === 'register' ? (
              <IonItem>
                <IonLabel position="stacked">Email</IonLabel>
                <IonInput
                  type="email"
                  value={email}
                  onIonInput={(e) => setEmail(String(e.detail.value || ''))}
                />
              </IonItem>
            ) : (
              <IonItem>
                <IonLabel position="stacked">Login or Email</IonLabel>
                <IonInput
                  value={identifier}
                  onIonInput={(e) => setIdentifier(String(e.detail.value || ''))}
                />
              </IonItem>
            )}

            <IonItem>
              <IonLabel position="stacked">Password</IonLabel>
              <IonInput
                type="password"
                value={password}
                onIonInput={(e) => setPassword(String(e.detail.value || ''))}
              />
            </IonItem>

            {error ? <p className="auth-error">{error}</p> : null}

            <IonButton expand="block" disabled={!canSubmit || loading} onClick={onSubmit}>
              {loading ? 'Please wait...' : mode === 'register' ? 'Create account' : 'Sign in'}
            </IonButton>
          </IonCardContent>
        </IonCard>
      </IonContent>
    </IonPage>
  );
};

export default Auth;
