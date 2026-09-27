import type { ItemDaLoja } from './loja';

/**
 * O CATÁLOGO NOVO DAS RECOMPENSAS V2 (onda 4): temas completos, estilos de legenda e peles de
 * cartão. Mora num arquivo próprio para a onda só ACRESCENTAR — `CATALOGO_DA_LOJA` (loja.ts)
 * concatena esta lista numa linha, e o que a onda 2 removeu lá não briga com o que entra aqui.
 *
 * SÓ SEEDS, NUNCA NÍVEL. A simulação da onda 2 (`docs/economia-v2.md`) mostrou que o XP cresce
 * 1,5–3× mais rápido que as Seeds: com o nível abrindo o item, o preço nunca chegava a valer. Por
 * isso todo item daqui tem `nivel: NIVEL_SO_SEEDS` — um nível que ninguém alcança — e a régua
 * (`soPorSeeds`) tira esses itens da vitrine de nível, da próxima recompensa e do Passe. Só os
 * padrões (legenda clássica, cartão padrão) são livres.
 *
 * Preços dentro das faixas calibradas: comum 350–450, raro 1.000–1.300, épico 2.600–3.000. Os
 * marcados "candidato à temporada" ficam aqui com preço até a onda 5 decidir a trilha.
 */

/** Nível que nenhuma conta alcança: o item só se abre com Seeds (ou, na onda 5, pela temporada). */
export const NIVEL_SO_SEEDS = 999;

/* ── TEMAS COMPLETOS (equipam via persistTheme; tokens em `src/styles/temas-v2.css`) ── */
export const TEMAS_V2: ItemDaLoja[] = [
  {
    id: 'tema-radio',
    tipo: 'tema',
    alvo: 'radio',
    nome: 'Rádio',
    desc: 'Madeira e mostrador âmbar, com a grade do alto-falante ao fundo. Som de válvula quente.',
    raridade: 'raro',
    nivel: NIVEL_SO_SEEDS,
    precoSeeds: 1100,
    previa: ['#EDE3D1', '#FBF6EC', '#B8501A', '#2A1F16'],
  },
  {
    id: 'tema-papel',
    tipo: 'tema',
    alvo: 'papel',
    nome: 'Papel e tinta',
    desc: 'Folha pautada e tinta azul-escura, títulos em serifa. Som de lápis: curto e seco.',
    raridade: 'raro',
    nivel: NIVEL_SO_SEEDS,
    precoSeeds: 1000,
    previa: ['#F1EDE3', '#FFFDF7', '#1F4F8C', '#1C2230'],
  },
  {
    id: 'tema-jardim',
    tipo: 'tema',
    alvo: 'jardim',
    nome: 'Jardim',
    desc: 'Verde de folha e lavanda, cantos macios, sementes no fundo. Acertos em forma de coração.',
    raridade: 'raro',
    nivel: NIVEL_SO_SEEDS,
    precoSeeds: 1200,
    previa: ['#E8F0E1', '#F9FCF4', '#2E7D4F', '#1C291D'],
  },
  {
    id: 'tema-neon',
    tipo: 'tema',
    alvo: 'neon',
    nome: 'Neon noturno',
    desc: 'Magenta e verde elétrico sobre a noite, com a grade da cidade no fundo. Acertos em raio.',
    raridade: 'epico',
    nivel: NIVEL_SO_SEEDS,
    precoSeeds: 2600,
    previa: ['#0A0714', '#140F24', '#FF4FD8', '#F2EEFF'],
  },
  {
    id: 'tema-fliperama',
    tipo: 'tema',
    alvo: 'fliperama',
    nome: 'Fliperama',
    desc: 'Linhas de varredura, títulos em pixel e som de onda quadrada. Acertos em quadradinhos.',
    raridade: 'epico',
    nivel: NIVEL_SO_SEEDS,
    precoSeeds: 2800,
    previa: ['#0A0D19', '#14192C', '#FFD23F', '#F5F7FF'],
  },
  // Candidato à temporada (onda 5): fica com preço até a trilha ser desenhada.
  {
    id: 'tema-observatorio',
    tipo: 'tema',
    alvo: 'observatorio',
    nome: 'Observatório',
    desc: 'Céu de estrelas que passa devagar, azul profundo e títulos finos. Acertos em cometa.',
    raridade: 'epico',
    nivel: NIVEL_SO_SEEDS,
    precoSeeds: 3000,
    previa: ['#070A16', '#0F1426', '#A3ACFF', '#E4E9F7'],
  },
];

/* ── ESTILOS DE LEGENDA (equipam em `transcriptSettings.estilo`; desenho em `src/lib/estilosDeLegenda.ts`
   e `src/styles/legendas.css`). A clássica é o padrão livre; o resto, só Seeds. ── */
const legenda = (
  alvo: string,
  nome: string,
  desc: string,
  raridade: 'comum' | 'raro',
  precoSeeds: number,
): ItemDaLoja => ({ id: `leg-${alvo}`, tipo: 'legenda', alvo, nome, desc, raridade, nivel: NIVEL_SO_SEEDS, precoSeeds });

export const LEGENDAS_V2: ItemDaLoja[] = [
  {
    id: 'leg-classica',
    tipo: 'legenda',
    alvo: 'classica',
    nome: 'Legenda clássica',
    desc: 'O texto limpo, sem caixa. A palavra que você já aprendeu ganha um sublinhado verde.',
    raridade: 'comum',
    nivel: 1,
  },
  legenda('cinema', 'Legenda Cinema', 'Faixa por trás da fala e entrada suave; a palavra aprendida muda de cor.', 'comum', 350),
  legenda('fita', 'Legenda Fita', 'Marca-texto sob a fala; a palavra aprendida ganha o seu próprio destaque.', 'comum', 380),
  legenda('contorno', 'Legenda Contorno', 'Contorno forte em volta das letras, para ler sobre qualquer vídeo.', 'comum', 420),
  legenda('vidro', 'Legenda Vidro', 'Caixa de vidro com borda fina; a fala surge de leve.', 'raro', 1000),
  legenda('maquina', 'Legenda Máquina', 'A fala aparece como se fosse datilografada.', 'raro', 1100),
  legenda('karaoke', 'Legenda Karaokê', 'Vidro, sombra e a fala escrita da esquerda para a direita.', 'raro', 1200),
  // Candidato à temporada (onda 5).
  legenda('letreiro', 'Legenda Letreiro', 'Fita luminosa, contorno forte e entrada suave: legenda de letreiro.', 'raro', 1200),
];

/** Tudo o que a onda 4 acrescenta ao catálogo, na ordem da vitrine. */
export const CATALOGO_V2: ItemDaLoja[] = [...TEMAS_V2, ...LEGENDAS_V2];
