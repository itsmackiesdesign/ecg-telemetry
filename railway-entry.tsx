import {createRoot} from 'react-dom/client';
import Home from './app/page';
import {InstallApp} from './components/install-app';
import './app/globals.css';
createRoot(document.getElementById('root')!).render(<><Home/><InstallApp/></>);
