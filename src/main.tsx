import './index.css';
/* O protótipo aprovado é o "Figma" do app: o mesmo CSS, gerado de docs/prototipos. Depois do
   index.css para que, onde os dois falam da mesma classe, valha o desenho aprovado. */
import './styles/prototipo.css';
import './styles/prototipo-app.css';
/* Alvos de 48/56 px e texto maior no Quest/celular (só onde `<html data-dispositivo>` pede). */
import './styles/dispositivo.css';
/* Por último: só QUANDO o navegador trabalha (content-visibility etc.), nunca o desenho. */
import './styles/desempenho.css';

import { RefreshCw } from 'lucide-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import ErroDaTela from './components/ErroDaTela';
import { toast } from './components/Toast';
import { ligarAvisoDeNovaVersao } from './lib/avisoDeNovaVersao';
import { capturarTokenDoConvite } from './lib/conviteNaUrl';
import { marcarDispositivoNoDocumento } from './lib/dispositivo/perfil';
import { instalarRelatorioDeErros } from './lib/relatorioDeErros';
import { bootTheme } from './lib/theme';

// Fase 4: o link do convite ao responsável sai da barra antes que o login ou o roteador o apaguem.
capturarTokenDoConvite();

// Antes do primeiro render: pinta `data-theme` e `.dark` a partir do localStorage.
// O servidor reconcilia depois (App → hydrateTheme), mas sem isto haveria um
// flash do tema padrão em cada carregamento.
bootTheme();
// Perfil do aparelho por capacidade (Quest, celular, desktop): `<html data-dispositivo data-modo-leve>`.
marcarDispositivoNoDocumento();
// E4 — erro de runtime do navegador deixou de morrer no console: window.onerror e
// unhandledrejection reportam ao diário do servidor (só erro; nenhum dado do usuário).
instalarRelatorioDeErros();
// P0-7b — o servidor já é de outra versão (deploy com a aba aberta): um aviso discreto, uma vez,
// com "Atualizar". Quem detecta é o `apiFetch`; aqui só se liga o evento ao canal de avisos.
ligarAvisoDeNovaVersao(({ mensagem, rotuloDaAcao, aoAtualizar }) =>
  toast.info(mensagem, { icone: RefreshCw, duration: 0, action: { label: rotuloDaAcao, onClick: aoAtualizar } }),
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErroDaTela>
      <App />
    </ErroDaTela>
  </StrictMode>,
);
