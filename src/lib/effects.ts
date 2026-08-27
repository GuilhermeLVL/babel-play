import type { ThemeType } from './appearance';

/**
 * EFEITOS VISUAIS — a personalidade de cada tema, e o canal por onde os acontecimentos reais
 * pedem uma comemoração.
 *
 * O QUE ESTAVA ERRADO
 * ───────────────────
 * Havia UM efeito de poeira cobrindo a tela inteira, idêntico nos seis temas: mudava só a cor do
 * acento. Isso não é efeito, é ruído uniforme — e ruído sobre a área de leitura, ainda por cima.
 * Pior: era contínuo e desligado de tudo. A app nunca reagia a NADA que o usuário fizesse.
 *
 * A CORREÇÃO TEM DUAS PARTES
 * ──────────────────────────
 * 1. PRESET POR TEMA (abaixo). Cada tema ganha um comportamento físico próprio — brasa sobe,
 *    esporo oscila, pó afunda. O `vercel` recebe quase nada de propósito: o tema é contenção
 *    monocromática, e enfeitá-lo seria contradizê-lo.
 * 2. DUAS CAMADAS. A ambiente vive só na faixa superior da tela (atrás do cabeçalho), longe do
 *    texto que se lê. As RAJADAS são pontuais: nascem no ponto exato de um acontecimento real
 *    — ganhar XP, iniciar a gravação, subir de nível — e morrem em menos de um segundo.
 */

// Os kinds dos EVENTOS (patos, raios...) sao usados por lib/eventosDeJogo.
export type BurstKind = 'xp' | 'record' | 'levelUp' | 'combo' | 'perfeito' | 'confete' | 'erro'
  | 'patos' | 'voleibol' | 'coracoes' | 'raios' | 'fogos' | 'pizza' | 'trofeu' | 'fumaca';

/** Como a partícula é desenhada. Confete é retângulo girando — é o que dá a leitura de "festa". */
export type FormaParticula = 'circulo' | 'confete' | 'pixel' | 'raio' | 'coracao' | 'fumaca' | 'emoji';
/** De onde a rajada nasce: do ponto (radial) ou do topo da tela (chuva). */
export type OrigemRajada = 'radial' | 'chuva' | 'travessia' | 'cantos';

export interface ParticlePreset {
  /** Quantidade na camada ambiente. 0 desliga o ambiente sem desligar as rajadas. */
  ambientCount: number;
  /** Raio em px (mín/máx). */
  size: [number, number];
  /** Velocidade horizontal base em px/frame. */
  driftX: number;
  /** Velocidade vertical. NEGATIVO sobe (brasa), positivo afunda (pó). */
  driftY: number;
  /** Amplitude e período da oscilação horizontal. 0 = deriva reta. */
  wobble: number;
  wobbleSpeed: number;
  /** Faixa de opacidade (mín/máx) da camada ambiente. */
  alpha: [number, number];
  /** Halo suave em volta do ponto. Custa pintura — só onde soma. */
  glow: boolean;
  /** Token de cor do tema a usar. */
  colorToken: '--accent' | '--good' | '--warn' | '--ink-muted';
}

/**
 * Uma leitura de cada tema, e o efeito que decorre dela.
 * A regra que me guiou: o efeito tem de parecer consequência do tema, não decoração colada nele.
 */
export const PARTICLE_PRESETS: Record<ThemeType, ParticlePreset> = {
  // Cinza quente + terracotta, atelier. Terracotta é barro cozido → brasa que sobe e cintila.
  babel: {
    ambientCount: 16,
    size: [1, 2.4],
    driftX: 0.06,
    driftY: -0.22,
    wobble: 0.5,
    wobbleSpeed: 0.02,
    alpha: [0.12, 0.42],
    glow: true,
    colorToken: '--accent'
  },
  // Índigo elegante, geométrico. Poeira fina em deriva reta — nada de movimento orgânico.
  linear: {
    ambientCount: 20,
    size: [0.8, 1.6],
    driftX: 0.14,
    driftY: 0.05,
    wobble: 0,
    wobbleSpeed: 0,
    alpha: [0.1, 0.3],
    glow: false,
    colorToken: '--accent'
  },
  // Monocromático, cantos retos, contraste. O tema É contenção: quase nada, e sem halo.
  vercel: {
    ambientCount: 7,
    size: [0.8, 1.2],
    driftX: 0.03,
    driftY: 0.02,
    wobble: 0,
    wobbleSpeed: 0,
    alpha: [0.06, 0.16],
    glow: false,
    colorToken: '--ink-muted'
  },
  // Everforest orgânico, cantos arredondados. Esporo: grande, mole, oscilando ao cair.
  mochi: {
    ambientCount: 14,
    size: [1.6, 3.2],
    driftX: 0.04,
    driftY: 0.1,
    wobble: 1.4,
    wobbleSpeed: 0.012,
    alpha: [0.14, 0.36],
    glow: true,
    colorToken: '--good'
  },
  // Carvão sóbrio, tipográfico. Pó de biblioteca: lento, discreto, quase imperceptível.
  notion: {
    ambientCount: 11,
    size: [0.9, 1.8],
    driftX: 0.02,
    driftY: 0.06,
    wobble: 0.3,
    wobbleSpeed: 0.008,
    alpha: [0.07, 0.2],
    glow: false,
    colorToken: '--ink-muted'
  },
  // Cores escolhidas pelo usuário: comportamento neutro, para não brigar com escolha nenhuma.
  // Instrument Premium: poeira de LUZ que ascende devagar — baixa densidade, glow teal (bloom).
  premium: {
    ambientCount: 14,
    size: [1, 2.6],
    driftX: 0.04,
    driftY: -0.14,
    wobble: 0.7,
    wobbleSpeed: 0.012,
    alpha: [0.1, 0.4],
    glow: true,
    colorToken: '--accent'
  },
  custom: {
    ambientCount: 14,
    size: [1, 2.2],
    driftX: 0.08,
    driftY: -0.04,
    wobble: 0.6,
    wobbleSpeed: 0.015,
    alpha: [0.1, 0.32],
    glow: true,
    colorToken: '--accent'
  }
};

/* ══════════════════ ADAPTAÇÃO A CLARO / ESCURO ══════════════════
   O PROBLEMA MEDIDO: os presets acima foram calibrados olhando o tema padrão no escuro. Em fundo
   CLARO, uma partícula a 6% de opacidade sobre uma superfície clara é matematicamente invisível,
   e era o caso de `vercel` (0.06–0.16) e `notion` (0.07–0.20). O usuário relatou exatamente isso:
   "só aparece num tema". Não era impressão: em quatro dos seis temas não havia o que ver.

   Duas correções, e nenhuma delas mexe na intenção de desenho de cada tema:

   1. PISO DE OPACIDADE por modo. Nenhum preset pode resolver abaixo dele, a contenção do vercel
      continua sendo "quase nada", mas "quase nada" passa a ser visível, não zero.
   2. MODO DE COMPOSIÇÃO. No escuro, `lighter` faz as partículas SOMAREM luz ao fundo (é o que dá
      a sensação de brasa). No claro isso as apagaria, cor somada a um fundo já claro satura em
      branco,, então lá vale a composição normal com opacidade maior.

   O token de cor de cada tema é preservado de propósito: trocar o cinza do vercel/notion por
   `--accent` deixaria visível, mas às custas da identidade monocromática deles. */

/** Piso de opacidade da camada ambiente. Abaixo disto, não há efeito — há ausência de efeito. */
export const MIN_AMBIENT_ALPHA_DARK = 0.12;
export const MIN_AMBIENT_ALPHA_LIGHT = 0.18;
/** Quanto a opacidade cresce no claro (fundo claro engole translucidez). */
const LIGHT_ALPHA_GAIN = 1.8;
/** Teto, para o "pó" nunca virar confete opaco. */
const MAX_AMBIENT_ALPHA = 0.85;

export interface ResolvedParticleStyle extends ParticlePreset {
  /** Como o pincel combina com o fundo. */
  composite: 'lighter' | 'source-over';
}

/** O preset EFETIVO de um tema num modo — é isto que o canvas deve consumir, nunca o preset cru. */
export function resolveParticleStyle(theme: ThemeType, darkMode: boolean): ResolvedParticleStyle {
  const base = PARTICLE_PRESETS[theme] ?? PARTICLE_PRESETS.custom;
  const piso = darkMode ? MIN_AMBIENT_ALPHA_DARK : MIN_AMBIENT_ALPHA_LIGHT;
  const ganho = darkMode ? 1 : LIGHT_ALPHA_GAIN;
  const min = Math.min(Math.max(base.alpha[0] * ganho, piso), MAX_AMBIENT_ALPHA);
  const max = Math.min(Math.max(base.alpha[1] * ganho, min), MAX_AMBIENT_ALPHA);
  return {
    ...base,
    alpha: [min, max],
    // Halo só soma no escuro; no claro vira um borrão pálido que suja o fundo.
    glow: base.glow && darkMode,
    composite: darkMode ? 'lighter' : 'source-over',
  };
}

/**
 * Perfil de cada rajada.
 *
 * A ESCALA É INTENCIONAL e é o que separa "gostoso" de "espalhafatoso": um acerto comum ganha 14
 * partículas por 700ms; uma rodada perfeita ganha confete de verdade. Se tudo fosse exagerado,
 * nada seria — o exagero só é sentido quando existe contraste com o comum.
 */
export interface BurstSpec {
  count: number;
  speed: number;
  size: [number, number];
  life: number;
  colorToken: ParticlePreset['colorToken'];
  /** Cores fixas por particula (sorteadas); quando ausente, vale o token do tema. */
  paleta?: string[];
  /** Para forma 'emoji': o(s) caractere(s) sorteado(s) por particula. */
  emojis?: string[];
  forma?: FormaParticula;
  origem?: OrigemRajada;
  /** Gravidade extra (confete cai; faísca sobe e some). */
  gravidade?: number;
}

export const BURST_SPECS: Record<BurstKind, BurstSpec> = {
  // Acertou um item. Curto e afirmativo — é o efeito mais frequente do app, então é o mais contido.
  xp: { count: 14, speed: 2.6, size: [1.5, 3], life: 700, colorToken: '--good' },
  // Começou/parou de gravar. Onda que sai do botão.
  record: { count: 18, speed: 3.2, size: [1.2, 2.6], life: 800, colorToken: '--accent' },
  // Subiu de nível. Um dos dois momentos que merecem exagero.
  levelUp: { count: 40, speed: 4.4, size: [1.8, 3.6], life: 1300, colorToken: '--warn' },
  // Sequência crescendo: faísca rápida e quente, sem ocupar a tela.
  combo: { count: 20, speed: 5, size: [1.2, 2.4], life: 600, colorToken: '--warn', gravidade: -0.02 },
  // Rodada sem erro nenhum. O OUTRO momento de exagero: confete caindo do topo.
  perfeito: { count: 70, speed: 2.2, size: [3, 6], life: 2200, colorToken: '--accent', forma: 'confete', origem: 'chuva', gravidade: 0.05 },
  // Confete pontual (fim de rodada boa), nascendo do ponto.
  confete: { count: 36, speed: 4, size: [2.5, 5], life: 1500, colorToken: '--good', forma: 'confete', gravidade: 0.06 },
  // Erro: um tremor curto de partículas escuras. Existe para o acerto ter contraste.
  erro: { count: 8, speed: 1.8, size: [1, 2], life: 380, colorToken: '--ink-muted' },

  // ── EVENTOS (lib/eventosDeJogo): raros e condicionais. Emojis via fillText — baratos e vivos. ──
  patos:    { count: 16, speed: 1.6, size: [4, 7], life: 3200, colorToken: '--warn', forma: 'emoji', emojis: ['🦆'], origem: 'chuva', gravidade: 0.03 },
  voleibol: { count: 3,  speed: 2.6, size: [6, 9], life: 2600, colorToken: '--warn', forma: 'emoji', emojis: ['🏐', '⚽', '🏀'], origem: 'travessia' },
  coracoes: { count: 22, speed: 2.0, size: [3, 6], life: 2400, colorToken: '--accent', forma: 'coracao', origem: 'chuva', gravidade: 0.02, paleta: ['#F04E23', '#FF7BAC', '#FFB3C6', '#E63946'] },
  raios:    { count: 10, speed: 4.5, size: [3, 5], life: 700,  colorToken: '--warn', forma: 'raio', origem: 'cantos', paleta: ['#F59E0B', '#FFD166', '#FFF3B0'] },
  fogos:    { count: 34, speed: 5,   size: [1.6, 3.2], life: 1200, colorToken: '--accent', paleta: ['#F04E23', '#F59E0B', '#3E8E4E', '#4C9AFF', '#FF7BAC'], gravidade: 0.03 },
  pizza:    { count: 12, speed: 1.8, size: [4, 7], life: 3000, colorToken: '--warn', forma: 'emoji', emojis: ['🍕', '🍔', '🌮'], origem: 'chuva', gravidade: 0.035 },
  trofeu:   { count: 2,  speed: 2.2, size: [8, 10], life: 3000, colorToken: '--warn', forma: 'emoji', emojis: ['🏆'], origem: 'travessia' },
  fumaca:   { count: 14, speed: 1.2, size: [4, 7], life: 1400, colorToken: '--ink-muted', forma: 'fumaca', gravidade: -0.015 },
};

// ─────────────────────────────── Barramento de rajadas ───────────────────────────────

export interface BurstEvent {
  x: number;
  y: number;
  kind: BurstKind;
}

type Listener = (e: BurstEvent) => void;
const listeners = new Set<Listener>();

export function onBurst(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Pede uma rajada no ponto (x, y) da VIEWPORT.
 *
 * É um barramento, e não uma prop, porque quem dispara está fundo na árvore (o `earnXp` do Study,
 * o botão de gravar da Captura) e quem desenha é o canvas lá em cima, no `main`. Passar callback
 * por essas dez camadas seria fiação sem nenhum ganho — e o emissor não precisa saber se existe
 * um canvas ouvindo: se as animações estiverem desligadas, ninguém escuta e nada acontece.
 */
export function emitBurst(x: number, y: number, kind: BurstKind): void {
  for (const fn of listeners) fn({ x, y, kind });
}

/** Atalho: rajada no centro de um elemento (o botão que o usuário acabou de clicar). */
export function burstFromElement(el: Element | null | undefined, kind: BurstKind): void {
  if (!el) return;
  const r = el.getBoundingClientRect();
  emitBurst(r.left + r.width / 2, r.top + r.height / 2, kind);
}
