import './index.css';

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

import App from './App.tsx';
import ErroDaTela from './components/ErroDaTela';
import {instalarRelatorioDeErros} from './lib/relatorioDeErros';
import {bootTheme} from './lib/theme';

// Antes do primeiro render: pinta `data-theme` e `.dark` a partir do localStorage.
// O servidor reconcilia depois (App → hydrateTheme), mas sem isto haveria um
// flash do tema padrão em cada carregamento.
bootTheme();
// E4 — erro de runtime do navegador deixou de morrer no console: window.onerror e
// unhandledrejection reportam ao diário do servidor (só erro; nenhum dado do usuário).
instalarRelatorioDeErros();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErroDaTela>
      <App />
    </ErroDaTela>
  </StrictMode>,
);
