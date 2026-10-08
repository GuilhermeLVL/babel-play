/**
 * O PAR CLARO/ESCURO DE CADA TEMA — a prévia `.paleta.duas` do protótipo aprovado ("o tema é um
 * par, não uma cor só"): três cores do claro (cartão, fundo, destaque) e três do escuro.
 *
 * Tabela e não leitura do CSS em tempo de execução: com o app no escuro, um elemento de sonda
 * `[data-theme=x]` herda `.dark` do `<html>` e não há como medir o claro. Os valores são os de
 * `src/index.css` (e de `src/styles/temas-v2.css`), e `tests/parDoTema.test.ts` falha se divergirem.
 */
export const PAR_DO_TEMA: Record<string, { claro: [string, string, string]; escuro: [string, string, string] }> = {
  babel: { claro: ['#F5F2EA', '#E6E2D6', '#F04E23'], escuro: ['#211C17', '#17130F', '#FF6B3D'] },
  linear: { claro: ['#ffffff', '#f9f9fb', '#5e6ad2'], escuro: ['#121216', '#08080a', '#5e6ad2'] },
  vercel: { claro: ['#fafafa', '#ffffff', '#000000'], escuro: ['#111111', '#000000', '#ffffff'] },
  mochi: { claro: ['#fdf6e3', '#f3efdf', '#87c095'], escuro: ['#343f44', '#2d353b', '#a7c080'] },
  notion: { claro: ['#f7f7f5', '#ffffff', '#2383e2'], escuro: ['#202020', '#191919', '#2eaadc'] },
  premium: { claro: ['#ffffff', '#F2F9F7', '#0D9488'], escuro: ['#0D1720', '#05090D', '#2DD4BF'] },
  aurora: { claro: ['#0E1626', '#070B14', '#4ADE80'], escuro: ['#0E1626', '#070B14', '#4ADE80'] },
  /* Recompensas v2, onda 4: os valores são os de `src/styles/temas-v2.css`. */
  radio: { claro: ['#FBF6EC', '#EDE3D1', '#B8501A'], escuro: ['#241A12', '#19120C', '#FFA451'] },
  papel: { claro: ['#FFFDF7', '#F1EDE3', '#1F4F8C'], escuro: ['#1B1E25', '#13151A', '#8FB6F2'] },
  neon: { claro: ['#FFFFFF', '#F3F0FA', '#B5157F'], escuro: ['#140F24', '#0A0714', '#FF4FD8'] },
  fliperama: { claro: ['#FFFFFF', '#E6ECF6', '#D1143A'], escuro: ['#14192C', '#0A0D19', '#FFD23F'] },
  jardim: { claro: ['#F9FCF4', '#E8F0E1', '#2E7D4F'], escuro: ['#17231A', '#0F1912', '#7FD18F'] },
  observatorio: { claro: ['#F8FAFD', '#E7EBF3', '#3543A8'], escuro: ['#0F1426', '#070A16', '#A3ACFF'] },
  agua: { claro: ['#F2FBFD', '#D3EDF3', '#0A7EA4'], escuro: ['#0E2634', '#06141D', '#4FD3EA'] },
};
