import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {bootTheme} from './lib/theme';

// Antes do primeiro render: pinta `data-theme` e `.dark` a partir do localStorage.
// O servidor reconcilia depois (App → hydrateTheme), mas sem isto haveria um
// flash do tema padrão em cada carregamento.
bootTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
