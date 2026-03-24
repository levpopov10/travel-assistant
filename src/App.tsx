import { useEffect, useState } from 'react';
import { Redirect, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Admin from './pages/Admin';
import { getCurrentUser, isAuthenticated, subscribeAuthChange } from './services/authService';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

/**
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */

/* import '@ionic/react/css/palettes/dark.always.css'; */
/* import '@ionic/react/css/palettes/dark.class.css'; */
import '@ionic/react/css/palettes/dark.system.css';

/* Theme variables */
import './theme/variables.css';

setupIonicReact();

const App: React.FC = () => {
  const [authed, setAuthed] = useState(isAuthenticated());

  useEffect(() => {
    const sync = () => setAuthed(isAuthenticated());
    return subscribeAuthChange(sync);
  }, []);

  return (
    <IonApp>
      <IonReactRouter>
        <IonRouterOutlet>
          <Route exact path="/auth" render={() => (authed ? <Redirect to="/home" /> : <Auth />)} />
          <Route exact path="/home" render={() => (authed ? <Home /> : <Redirect to="/auth" />)} />
          <Route
            exact
            path="/admin"
            render={() => {
              if (!authed) return <Redirect to="/auth" />;
              const user = getCurrentUser();
              if (!user || user.role !== 'admin') return <Redirect to="/home" />;
              return <Admin />;
            }}
          />
          <Route exact path="/" render={() => <Redirect to={authed ? '/home' : '/auth'} />} />
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
};

export default App;
