/**
 * OS SENTIDOS — som, vibração e movimento do aparelho. Porte de `sentidos.js` (o arquivo inteiro), dos
 * sons de jogo de `jogos.js:45-55` e dos dois do tema Água de `agua.js:254-257`, com os mesmos números.
 *
 * O que muda do protótipo para o app:
 *
 *   - Lá `sentidos.som` e `sentidos.vibra` são botões da barra de demonstração. Aqui quem manda são os
 *     interruptores que o app já tem: "Som dos toques" (`somMudo()`, `babel.sound_enabled`) e
 *     "Vibração" (`tatoLigado()`, `babel.vibracao`).
 *   - Lá cada som é pendurado numa função do protótipo (`abrirFolha = com(abrirFolha, …)`). Aqui quem
 *     troca a tela e abre o painel é o React: o som sai de quem OBSERVA o documento (o painel que
 *     entra, o diálogo que abre, o aviso que aparece, a tela que monta), como `folha.ts`, `dialogos.ts`
 *     e `telas.ts` já fazem com a animação.
 *   - Com a camada desligada (`polido()` falso: animações desligadas ou Modo desempenho) nada daqui
 *     toca, e o app volta ao kit de sempre (`soundFx.ts` + `sfxDelegate.ts`).
 *
 * Itens da lista `fidelidade/casca-e-telas.md`: C1–C12.
 */
import { EVENTO_DA_JOGADA } from '../comemoracao/intensidade';
import { novoEstadoDaInclinacao, passoDaInclinacao, pedirLicencaDoSensor } from '../dispositivo/inclinacao';
import { tatoLigado } from '../dispositivo/tato';
import { desviarKit, play, somMudo, type SoundEvent } from '../soundFx';
import { anima, MOLA_SUAVE, polido, reduz } from './base';
import { moverPonteiro } from './ponteiro';

/** Os 18 de `sentidos.js:66-85`, os 8 de jogo de `jogos.js:45-54` e o `mergulho` de `agua.js:256`. */
export type Sentido =
  | 'toque'
  | 'nav'
  | 'aba'
  | 'abre'
  | 'fecha'
  | 'aviso'
  | 'sucesso'
  | 'erro'
  | 'vira'
  | 'acerto'
  | 'moeda'
  | 'liga'
  | 'desliga'
  | 'grava'
  | 'chega'
  | 'fala'
  | 'festa'
  | 'onda'
  | 'tique'
  | 'conta'
  | 'vai'
  | 'tecla'
  | 'encaixa'
  | 'solta'
  | 'quique'
  | 'sobe'
  | 'mergulho';

/* ---- Som: sintetizado na hora (Web Audio), sem arquivo nenhum (`sentidos.js:10-64`) -------------- */

type ComWebkit = Window & { webkitAudioContext?: typeof AudioContext };
let ac: AudioContext | null = null;
let mestre: GainNode | null = null;
let ultimoSom = 0;
let ultimaAba = -Infinity;

/** `audio()` de `sentidos.js:14-26`: um contexto só, ganho mestre 0,55, compressor, destino. */
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ac) {
    const AC = window.AudioContext ?? (window as ComWebkit).webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    mestre = ac.createGain();
    mestre.gain.value = 0.55;
    const comp = ac.createDynamicsCompressor();
    mestre.connect(comp);
    comp.connect(ac.destination);
  }
  if (ac.state === 'suspended') void ac.resume()?.catch?.(() => undefined);
  return ac;
}

interface OpcoesDaNota {
  t?: number;
  d?: number;
  tipo?: OscillatorType;
  g?: number;
  f2?: number | null;
}

/** `nota()` de `sentidos.js:27-42`. */
function nota(f: number, { t = 0, d = 0.12, tipo = 'sine', g = 0.12, f2 = null }: OpcoesDaNota = {}): void {
  const a = audio();
  if (!a || !mestre) return;
  const t0 = a.currentTime + t;
  const o = a.createOscillator();
  const v = a.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
  v.gain.setValueAtTime(0.0001, t0);
  v.gain.exponentialRampToValueAtTime(g, t0 + 0.006);
  v.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(v);
  v.connect(mestre);
  o.start(t0);
  o.stop(t0 + d + 0.02);
}

interface OpcoesDoSopro {
  g?: number;
  de?: number;
  ate?: number;
  t?: number;
}

/** `sopro()` de `sentidos.js:43-64`: ruído branco por um passa-banda que varre de `de` a `ate`. */
function sopro(d: number, { g = 0.06, de = 400, ate = 2400, t = 0 }: OpcoesDoSopro = {}): void {
  const a = audio();
  if (!a || !mestre) return;
  const t0 = a.currentTime + t;
  const n = Math.floor(a.sampleRate * d);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const dados = buf.getChannelData(0);
  for (let i = 0; i < n; i++) dados[i] = Math.random() * 2 - 1;
  const s = a.createBufferSource();
  s.buffer = buf;
  const filtro = a.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.Q.value = 1.2;
  filtro.frequency.setValueAtTime(de, t0);
  filtro.frequency.exponentialRampToValueAtTime(ate, t0 + d);
  const v = a.createGain();
  v.gain.setValueAtTime(0.0001, t0);
  v.gain.exponentialRampToValueAtTime(g, t0 + d * 0.3);
  v.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  s.connect(filtro);
  filtro.connect(v);
  v.connect(mestre);
  s.start(t0);
}

/**
 * O interruptor "Som dos toques" do app manda no som (`sentidos.js:183-191`): o estado vivo é o de
 * `soundFx` (`setSoundMuted`), e a chave guardada (`babel.sound_enabled`) vale antes de ele chegar.
 */
function comSom(): boolean {
  if (somMudo()) return false;
  try {
    return localStorage.getItem('babel.sound_enabled') !== 'false';
  } catch {
    return true;
  }
}

const temaAgua = (): boolean => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'agua';

/** Cada som é curto, grave ou agudo conforme o gesto: abrir sobe, fechar desce, erro é grave. */
const SONS: Record<Sentido, () => void> = {
  /* `sentidos.js:67`; no tema Água o toque vira gota (`agua.js:254-255`). */
  toque: () => {
    if (temaAgua()) {
      nota(1500 + Math.random() * 300, { d: 0.07, g: 0.045, f2: 620 });
      nota(2400, { t: 0.03, d: 0.04, g: 0.018 });
    } else nota(1700, { d: 0.028, g: 0.035, tipo: 'triangle' });
  },
  nav: () => nota(520, { d: 0.09, g: 0.1, f2: 780 }),
  aba: () => nota(700, { d: 0.06, g: 0.08, f2: 940 }),
  abre: () => {
    sopro(0.22, { de: 400, ate: 2600 });
    nota(330, { d: 0.2, g: 0.07, f2: 660 });
  },
  fecha: () => {
    sopro(0.16, { de: 2200, ate: 320, g: 0.05 });
    nota(620, { d: 0.13, g: 0.05, f2: 310 });
  },
  aviso: () => {
    nota(880, { d: 0.12, g: 0.08 });
    nota(1320, { t: 0.07, d: 0.18, g: 0.06 });
  },
  sucesso: () => [523, 659, 784, 1047].forEach((f, i) => nota(f, { t: i * 0.075, d: 0.24, g: 0.1, tipo: 'triangle' })),
  erro: () => {
    nota(196, { d: 0.16, g: 0.12, tipo: 'square', f2: 150 });
    nota(150, { t: 0.12, d: 0.18, g: 0.1, tipo: 'square', f2: 120 });
  },
  vira: () => {
    sopro(0.09, { de: 1200, ate: 3400, g: 0.05 });
    nota(420, { d: 0.05, g: 0.04, f2: 640 });
  },
  acerto: () => [659, 988, 1319].forEach((f, i) => nota(f, { t: i * 0.07, d: 0.22, g: 0.1, tipo: 'triangle' })),
  moeda: () => [1318, 1760, 2093].forEach((f, i) => nota(f, { t: i * 0.055, d: 0.16, g: 0.06, tipo: 'triangle' })),
  liga: () => nota(660, { d: 0.07, g: 0.08, f2: 990 }),
  desliga: () => nota(660, { d: 0.07, g: 0.07, f2: 440 }),
  grava: () => {
    nota(440, { d: 0.09, g: 0.09 });
    nota(660, { t: 0.09, d: 0.12, g: 0.09 });
  },
  chega: () => {
    nota(784, { d: 0.1, g: 0.08 });
    nota(1175, { t: 0.08, d: 0.16, g: 0.07 });
  },
  fala: () => nota(1250, { d: 0.03, g: 0.025 }),
  festa: () => {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => nota(f, { t: i * 0.06, d: 0.3, g: 0.09, tipo: 'triangle' }));
    sopro(0.6, { de: 3000, ate: 9000, g: 0.04, t: 0.2 });
  },
  onda: () => {
    sopro(0.55, { de: 300, ate: 3200, g: 0.05 });
    nota(220, { d: 0.5, g: 0.04, f2: 440 });
  },
  /* Os de jogo, `jogos.js:46-53`. */
  tique: () => nota(1040, { d: 0.04, g: 0.05, tipo: 'square' }),
  conta: () => nota(520, { d: 0.14, g: 0.1, tipo: 'triangle' }),
  vai: () => {
    nota(784, { d: 0.3, g: 0.1, tipo: 'triangle' });
    nota(1175, { d: 0.3, g: 0.08, tipo: 'triangle' });
  },
  tecla: () => nota(820 + Math.random() * 260, { d: 0.03, g: 0.04, tipo: 'triangle' }),
  encaixa: () => nota(560, { d: 0.07, g: 0.08, f2: 840, tipo: 'triangle' }),
  solta: () => nota(700, { d: 0.06, g: 0.06, f2: 460, tipo: 'triangle' }),
  quique: () => nota(240, { d: 0.1, g: 0.11, f2: 520 }),
  sobe: () => [392, 523, 659, 784].forEach((f, i) => nota(f, { t: i * 0.06, d: 0.18, g: 0.09, tipo: 'triangle' })),
  /* Equipar o tema Água, `agua.js:256`. */
  mergulho: () => {
    sopro(0.7, { de: 2600, ate: 220, g: 0.07 });
    nota(520, { d: 0.5, g: 0.05, f2: 130 });
    [1300, 1700, 2100].forEach((f, i) => nota(f, { t: 0.25 + i * 0.09, d: 0.08, g: 0.03, f2: f * 0.6 }));
  },
};

/* ---- Vibração: padrão por tipo de acontecimento (`sentidos.js:87-90`, `jogos.js:55`, `agua.js:257`) */

export const TATO: Readonly<Partial<Record<Sentido, number | readonly number[]>>> = {
  toque: 6,
  nav: 8,
  aba: 6,
  abre: 10,
  fecha: 6,
  aviso: [8, 40, 8],
  sucesso: [10, 50, 10, 50, 18],
  erro: [30, 40, 30],
  vira: 8,
  acerto: [10, 30, 16],
  moeda: [8, 30, 8],
  liga: 10,
  desliga: 8,
  grava: 14,
  chega: 10,
  festa: [15, 40, 15, 40, 30],
  onda: 12,
  tique: 5,
  conta: 10,
  vai: 22,
  tecla: 5,
  encaixa: 8,
  solta: 6,
  quique: 12,
  sobe: [10, 30, 10, 30, 20],
  mergulho: [14, 50, 8, 30, 6],
};

/**
 * O iPhone não tem `navigator.vibrate`; um interruptor nativo escondido dá um toque do sistema
 * (Safari 17.4+). `sentidos.js:91-93`; o CSS é `celular.css` (`.px-tato-ios`).
 */
function tatoIos(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let el = document.querySelector<HTMLElement>('.px-tato-ios');
  if (!el) {
    el = document.createElement('label');
    el.className = 'px-tato-ios';
    el.setAttribute('aria-hidden', 'true');
    const caixa = document.createElement('input');
    caixa.type = 'checkbox';
    caixa.setAttribute('switch', '');
    caixa.tabIndex = -1;
    el.append(caixa);
    document.body.append(el);
  }
  return el;
}

/**
 * Só do app: o mesmo som pedido duas vezes no mesmo instante conta uma vez. Aqui um acontecimento pode
 * chegar por dois caminhos (o jogo que chama `sentir('erro')` e o motor de comemoração que avisa a mesma
 * jogada; o clique na aba e o `repintar` da tela, que só roda depois de o React redesenhar).
 */
const MESMO_SOM_MS = 45;
const MESMA_ABA_MS = 120;
const ultimoDeCada = new Map<Sentido, number>();

/**
 * `sentir(nome)` de `sentidos.js:94-111`: o som e a vibração do acontecimento, no mesmo instante.
 *
 * Só com a camada ligada. Com ela desligada (animações desligadas, Modo desempenho) o protótipo fica
 * mudo; o app volta ao som de sempre: `antigo` é o evento do kit (`soundFx`) que aquele ponto tocava.
 */
export function sentir(nome: Sentido, antigo?: SoundEvent): void {
  if (!polido()) {
    if (antigo) play(antigo);
    return;
  }
  const agora = performance.now();
  const fraco = nome === 'toque' || nome === 'aviso' || nome === 'fala';
  if (fraco && agora - ultimoSom < 160) return;
  if (agora - (ultimoDeCada.get(nome) ?? -Infinity) < (nome === 'aba' ? MESMA_ABA_MS : MESMO_SOM_MS)) return;
  ultimoDeCada.set(nome, agora);
  if (nome === 'aba') ultimaAba = agora;
  if (!fraco) ultimoSom = agora;
  if (comSom()) {
    try {
      SONS[nome]?.();
    } catch {
      /* sem áudio neste navegador */
    }
  }
  const padrao = TATO[nome];
  if (tatoLigado() && padrao !== undefined && !reduz()) {
    try {
      if (typeof navigator.vibrate === 'function') navigator.vibrate(typeof padrao === 'number' ? padrao : [...padrao]);
      else if (nome !== 'toque' && nome !== 'fala') document.querySelector<HTMLElement>('.px-tato-ios')?.click();
    } catch {
      /* sem motor de vibração */
    }
  }
}

/**
 * As vibrações que o protótipo pede direto, fora da tabela (`navigator.vibrate?.(…)` em `telas.js:249`,
 * `telas2.js:114, 221, 467, 607`): as mesmas, atrás do interruptor de vibração do app.
 */
export function vibrar(padrao: number | number[]): void {
  if (!tatoLigado()) return;
  try {
    navigator.vibrate?.(padrao);
  } catch {
    /* sem motor de vibração */
  }
}

/** O contexto de áudio, quando o som está ligado, a camada também e o navegador deixa. */
function audioSeDer(): AudioContext | null {
  try {
    return comSom() && polido() ? audio() : null;
  } catch {
    return null;
  }
}

/**
 * `somSegurar()` de `sentidos.js:113-130`. Segurar para comprar: o tom sobe de 280 a 980 Hz em 1,1 s
 * enquanto o dedo segura e some se soltar antes. Devolve como calar.
 */
export function somSegurar(): () => void {
  const ctx = audioSeDer();
  if (!ctx || !mestre) return () => undefined;
  const o = ctx.createOscillator();
  const v = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(280, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(980, ctx.currentTime + 1.1);
  v.gain.setValueAtTime(0.0001, ctx.currentTime);
  v.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.05);
  o.connect(v);
  v.connect(mestre);
  o.start();
  let calado = false;
  return () => {
    if (calado) return;
    calado = true;
    v.gain.cancelScheduledValues(ctx.currentTime);
    v.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.02);
    o.stop(ctx.currentTime + 0.1);
  };
}

/* ---- A aba ativa nunca fica fora da vista (`abaAVista`, `sentidos.js:292-299`) ------------------- */

const $$ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];
const ABA_ATIVA = '.q-aba[aria-selected="true"], .q-aba[aria-checked="true"]';

/**
 * Numa barra de abas que rola de lado (o celular), a aba escolhida vai para o meio. Com uma barra, só
 * ela; sem nenhuma, todas as `.q-abas` do documento, como no protótipo.
 */
export function abaAVista(g?: HTMLElement | null): void {
  if (typeof document === 'undefined' || !polido()) return;
  if (g === null) return;
  for (const barra of g ? [g] : $$('.q-abas')) {
    const a = barra.querySelector<HTMLElement>(ABA_ATIVA);
    if (!a || barra.scrollWidth <= barra.clientWidth + 2) continue;
    barra.scrollLeft = a.offsetLeft - (barra.clientWidth - a.offsetWidth) / 2;
  }
}

/* ---- Movimento do aparelho (`sentidos.js:196-273`) ---------------------------------------------- */

/** Poucos alvos, só os que são "objeto" (`sentidos.js:233`). */
const ALVOS_DO_GIRO =
  'button.q-tile:not(.apagado):not(.em-linha), .px-premium, .px-vitrine-tela, .px-item .px-arte, .carta:not(.virada):not(.par)';
const SEM_LUZ = '.carta, .px-arte, .px-vitrine-tela';
/*
 * QUANDO O LAÇO DO GIROSCÓPIO DORME E ACORDA. A inclinação vai de −1 a 1 (22° do aparelho) e vira até 9°
 * de giro no cartão e até 45% da largura da tela no ponto da aura.
 *   - dorme quando falta menos de 0,001 para chegar: 0,009° no cartão e 0,18 px na aura de um celular;
 *   - acorda com uma leitura a mais de 0,004 do que está na tela: 0,09° do aparelho, 0,036° no cartão,
 *     0,7 px na aura. Abaixo disso nada na tela mudaria de lugar de forma visível.
 * A folga entre os dois números evita o liga-desliga com o ruído do sensor.
 */
const GIRO_CHEGOU = 0.001;
const GIRO_ACORDA = 0.004;

const celular = (): boolean => window.matchMedia?.('(max-width: 720px)').matches ?? false;

/* As abas primárias de `telas.ts` (as três de `prototipo.js:110-114` mais as que o app tem a mais). */
const PRIMARIA = '.qe-abas, .qp-abas, .qv-abas, .qc > .q-abas:not(.q-seg), .q-aju .q-abas:not(.q-seg)';
/** O que já rola de lado por conta própria: ali o dedo não troca de aba (`sentidos.js:309`). */
const ROLA_DE_LADO =
  '.q-abas, .qj-ferramentas, .px-trilha, [data-testid="missoes-no-inicio"], .qe-kpis, .q-tabela-caixa, .q-acoes, input, .tabuleiro';

/**
 * O que o kit de sempre (`soundFx`) deixa de tocar com a camada ligada, porque o protótipo tem o som
 * dele para o mesmo acontecimento:
 *   - `recordStart` é o `grava` (`direto.js:51`, `jogos2.js:626`); parar de gravar não soa lá;
 *   - `add` (guardou a palavra) é o `sucesso` (`telas.js:246`);
 *   - `success` e `error` soltos: no protótipo o resultado chega como aviso (`toast` → `aviso`) e a
 *     jogada como `acerto` / `erro` (abaixo, pelo aviso da jogada). O kit não toca por cima.
 */
const DO_KIT: Partial<Record<SoundEvent, Sentido | null>> = {
  recordStart: 'grava',
  recordStop: null,
  add: 'sucesso',
  success: null,
  error: null,
};

/**
 * Liga os sentidos enquanto a casca do desenho novo estiver montada. Devolve como desligar.
 *
 * Quem dispara o quê (`sentidos.js:138-174`):
 *   - apertar um botão, aba, `summary` ou link: `toque`; um interruptor: `liga` / `desliga`;
 *   - trocar a aba primária da tela: `aba`; chegar uma tela nova por clique: `nav`;
 *   - o painel "Mais" e todo `<dialog>` (diálogos, folha de baixo, busca): `abre` / `fecha`;
 *   - um aviso (`.toast`) que aparece: `aviso`.
 */
export function instalarSentidos(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const raiz = document.documentElement;
  let vivo = true;
  let ultimaTecla = 0;
  let ultimoPonteiro = 0;

  /* ---- O giroscópio (`sentidos.js:196-265`) ---- */
  const giro = { ativo: false, x: 0, y: 0, ax: 0, ay: 0, alvos: [] as HTMLElement[], rodando: false };
  const neutro = novoEstadoDaInclinacao();
  let pediuGiro = false;
  /* No iPhone o sensor só liga com permissão, pedida dentro de um toque (`sentidos.js:199-205`). */
  const pedirGiroscopio = () => {
    if (pediuGiro) return;
    pediuGiro = true;
    void pedirLicencaDoSensor();
  };
  /** O que o laço escreveu por último em cada alvo: quadro que não muda nada não escreve de novo. */
  let escrito = new WeakMap<HTMLElement, string>();
  /** Volta a pedir quadros: chegou leitura fora do lugar, ou os alvos são outros. */
  const acordarGiro = () => {
    if (giro.rodando) return;
    giro.rodando = true;
    requestAnimationFrame(quadroDoGiro);
  };
  const alvosDoGiro = () => {
    for (const el of giro.alvos) {
      el.style.transform = '';
      el.querySelector(':scope > .px-luz.giro')?.remove();
    }
    giro.alvos = [];
    escrito = new WeakMap();
    if (!vivo || !giro.ativo || !polido()) return;
    giro.alvos = $$(ALVOS_DO_GIRO)
      .filter((el) => el.offsetParent)
      .slice(0, 16);
    giro.alvos.slice(0, 4).forEach((el) => {
      if (el.matches(SEM_LUZ)) return;
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      const l = document.createElement('i');
      l.className = 'px-luz giro on';
      l.setAttribute('aria-hidden', 'true');
      el.append(l);
    });
    /* Os alvos novos ainda não têm a inclinação de agora: o laço escreve neles, mesmo com o aparelho parado. */
    acordarGiro();
  };
  /*
   * O LAÇO DORME COM O APARELHO PARADO (auditoria de desempenho de 10/10/2026, G1). Antes, bastava UMA
   * leitura do sensor para ele rodar a cada quadro para sempre: 860 ms/s de fio principal no celular médio
   * e 991 no fraco, com o Início parado. Agora ele para quando a inclinação na tela chegou à do aparelho
   * e nenhum alvo ficou sem receber o último valor; `aoGirar` o acorda quando uma leitura sai do lugar.
   * A suavização (12% por quadro) e o que é escrito em cada alvo são os mesmos.
   */
  const quadroDoGiro = () => {
    if (!vivo || !giro.ativo || !polido()) {
      giro.rodando = false;
      return;
    }
    const chegou = Math.abs(giro.ax - giro.x) < GIRO_CHEGOU && Math.abs(giro.ay - giro.y) < GIRO_CHEGOU;
    if (!chegou) {
      giro.x += (giro.ax - giro.x) * 0.12;
      giro.y += (giro.ay - giro.y) * 0.12;
    }
    /* A aura já segue o ponteiro: o giroscópio passa a ser o ponteiro (`sentidos.js:253`). */
    moverPonteiro(innerWidth * (0.5 + giro.x * 0.45), innerHeight * (0.45 + giro.y * 0.4));
    let faltou = false;
    for (const el of giro.alvos) {
      if (!el.isConnected) continue;
      /* A entrada da tela (ou a transição da própria inclinação) está em curso neste alvo: ele recebe o
         valor quando ela acabar, e até lá o laço não dorme. */
      if (
        (el.getAnimations?.() ?? []).some(
          (a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity,
        )
      ) {
        faltou = true;
        continue;
      }
      const f = el.matches('.carta') ? 0.6 : 1;
      const inclinado = `perspective(800px) rotateY(${giro.x * 9 * f}deg) rotateX(${-giro.y * 8 * f}deg)`;
      /* Alguém pode ter limpado o estilo do alvo (uma carta que virou): aí escreve de novo. */
      if (escrito.get(el) === inclinado && el.style.transform !== '') continue;
      escrito.set(el, inclinado);
      el.style.transform = inclinado;
      const l = el.lastElementChild as HTMLElement | null;
      if (l?.classList.contains('giro')) {
        l.style.setProperty('--mx', (0.5 - giro.x * 0.6) * el.offsetWidth + 'px');
        l.style.setProperty('--my', (0.4 - giro.y * 0.6) * el.offsetHeight + 'px');
      }
    }
    if (chegou && !faltou) {
      giro.rodando = false;
      return;
    }
    requestAnimationFrame(quadroDoGiro);
  };
  /* `aoGirar()` de `sentidos.js:206-223`: o zero adaptativo (0,004) e a normalização (÷22) são os de
     `passoDaInclinacao`. */
  const aoGirar = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null || reduz()) return;
    const i = passoDaInclinacao(neutro, e.beta, e.gamma);
    giro.ax = i.x;
    giro.ay = i.y;
    if (!giro.ativo) {
      giro.ativo = true;
      raiz.dataset.pxGiro = 'on';
      alvosDoGiro();
    }
    /* O sensor entrega leituras o tempo todo, mesmo com o aparelho na mesa (o ruído dele). Só acorda o
       laço a leitura que tiraria a inclinação do lugar. */
    if (Math.abs(giro.ax - giro.x) > GIRO_ACORDA || Math.abs(giro.ay - giro.y) > GIRO_ACORDA) acordarGiro();
  };
  /* Outra largura de tela: a luz de cada alvo é medida de novo. */
  const aoRedimensionarOGiro = () => {
    if (!giro.ativo) return;
    escrito = new WeakMap();
    acordarGiro();
  };

  /* ---- Apertar (`sentidos.js:161-174`) ---- */
  const aoApertar = (e: PointerEvent) => {
    ultimoPonteiro = performance.now();
    if (!polido()) return;
    /* O navegador só libera o áudio depois do primeiro gesto. */
    if (comSom()) {
      try {
        audio();
      } catch {
        /* sem áudio neste navegador */
      }
    }
    pedirGiroscopio();
    const b = (e.target as Element | null)?.closest?.<HTMLElement>('button, [role="tab"], summary, a');
    if (!b || (b as HTMLButtonElement).disabled) return;
    if (b.classList.contains('q-interruptor') || b.getAttribute('role') === 'switch')
      return sentir(b.getAttribute('aria-checked') === 'true' ? 'desliga' : 'liga');
    if (b.matches('.carta, .q-item, [data-px-comprar]')) return;
    sentir('toque');
  };

  /* ---- A aba primária (`trocar` com origem `'aba'`, `sentidos.js:156`; `prototipo.js:1178-1184`) ---- */
  const aoClicar = (e: MouseEvent) => {
    if (!polido()) return;
    const aba = (e.target as Element | null)?.closest?.<HTMLElement>('.q-aba');
    if (!aba || (aba as HTMLButtonElement).disabled || aba.matches(ABA_ATIVA)) return;
    if (aba.closest(PRIMARIA)) sentir('aba');
  };

  /* ---- Deslizar o dedo de lado troca a aba principal da tela (`sentidos.js:306-329`) ---- */
  let d: { x: number; y: number; t: number } | null = null;
  const telaDe = (alvo: EventTarget | null) => (alvo as Element | null)?.closest?.<HTMLElement>('.px-tela') ?? null;
  const aoPousar = (e: PointerEvent) => {
    const tela = telaDe(e.target);
    d =
      tela && celular() && polido() && tela.querySelector(PRIMARIA) && !(e.target as Element).closest(ROLA_DE_LADO)
        ? { x: e.clientX, y: e.clientY, t: performance.now() }
        : null;
  };
  const aoLevantar = (e: PointerEvent) => {
    const tela = telaDe(e.target);
    if (!d || !tela) return void (d = null);
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const rapido = performance.now() - d.t < 600;
    d = null;
    if (!rapido || Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
    const abas = $$('.q-aba', tela.querySelector<HTMLElement>(PRIMARIA) ?? tela);
    const i =
      Math.max(
        0,
        abas.findIndex((a) => a.matches(ABA_ATIVA)),
      ) + (dx < 0 ? 1 : -1);
    if (abas[i]) abas[i].click();
    else if (!reduz()) {
      /* Sem mais abas para esse lado: a tela estica um pouco e volta. */
      sentir('toque');
      anima(
        tela,
        [
          { transform: 'translateX(0)' },
          { transform: `translateX(${dx < 0 ? -22 : 22}px)` },
          { transform: 'translateX(0)' },
        ],
        { d: 420, e: MOLA_SUAVE },
      );
    }
  };

  /* ---- Quem observa o documento: painel, diálogo, aviso, tela nova, aba que muda ---- */
  const abertos = new WeakSet<HTMLDialogElement>();
  /* O diálogo que só voltou para sair (`dialogos.ts`) vem sem toque e escondido de quem lê a tela. */
  const aVista = (dl: HTMLDialogElement) => dl.open && dl.getAttribute('aria-hidden') !== 'true';
  const abriu = (dl: HTMLDialogElement) => {
    if (abertos.has(dl) || !aVista(dl)) return;
    abertos.add(dl);
    sentir('abre');
  };
  const fechou = (dl: HTMLDialogElement) => {
    if (!abertos.delete(dl)) return;
    sentir('fecha');
  };
  for (const dl of $$<HTMLDialogElement>('dialog[open]')) abertos.add(dl);
  /* O painel "Mais". Quando sai, `folha.ts` o devolve ao documento só para a saída (`px-saindo`):
     esse fantasma não abre nem fecha nada. */
  const paineis = new WeakSet<Element>();
  for (const el of $$('.q-mais-fundo')) paineis.add(el);
  const painelEntrou = (el: Element) => {
    if (paineis.has(el) || el.classList.contains('px-saindo')) return;
    paineis.add(el);
    sentir('abre');
  };
  const painelSaiu = (el: Element) => {
    if (paineis.delete(el)) sentir('fecha');
  };

  let temTela = !!document.querySelector('.px-tela > *');
  let ultimaNav = -Infinity;
  let pedidoDeAbas = 0;
  const depoisDaTroca = () => {
    /* `sentidos.js:266-267, 303-305`: os alvos do giroscópio 60 ms depois, a aba à vista no quadro seguinte. */
    if (giro.ativo) window.setTimeout(alvosDoGiro, 60);
    if (!pedidoDeAbas)
      pedidoDeAbas = requestAnimationFrame(() => {
        pedidoDeAbas = 0;
        abaAVista();
      });
  };
  /* A tela nova de `telas.ts`: um filho direto de `.px-tela` (a navegação) ou um palco que montou mais
     fundo (as telas de dentro do Jogar). Diálogo, painel e o "carregando" não são tela. */
  const ehTelaNova = (n: Node, alvo: Node, tela: Element): boolean =>
    n instanceof HTMLElement &&
    !n.matches('dialog, .q-mais-fundo, .px-luz, .px-onda-caixa, .px-aura') &&
    !n.classList.contains('carregando-da-tela') &&
    !n.closest('.px-pal, dialog, .q-mais-fundo') &&
    (alvo === tela || n.matches('.q-palco, .tela') || !!n.querySelector('.q-palco, .tela'));

  const observador = new MutationObserver((mudancas) => {
    let telaNova = false;
    let abaMudou = false;
    let aviso = false;
    for (const m of mudancas) {
      if (m.type === 'attributes') {
        const el = m.target;
        if (m.attributeName === 'open') {
          if (el instanceof HTMLDialogElement) (aVista(el) ? abriu : fechou)(el);
        } else if (el instanceof Element && el.matches('.q-aba')) abaMudou = true;
        continue;
      }
      for (const n of m.removedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        if (n.classList.contains('q-mais-fundo')) painelSaiu(n);
        for (const dl of n instanceof HTMLDialogElement ? [n] : $$<HTMLDialogElement>('dialog', n)) fechou(dl);
      }
      const tela = document.querySelector('.px-tela');
      for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        if (n.classList.contains('q-mais-fundo')) painelEntrou(n);
        for (const dl of n instanceof HTMLDialogElement ? [n] : $$<HTMLDialogElement>('dialog', n)) abriu(dl);
        if (m.target instanceof Element && m.target.matches('.toast')) aviso = true;
        if (tela && tela.contains(m.target) && ehTelaNova(n, m.target, tela)) telaNova = true;
      }
    }
    if (aviso) sentir('aviso');
    if (telaNova) {
      /* `trocar` com origem `'clique'` e uma tela antes desta (`sentidos.js:157`). A troca de aba
         primária também monta palco novo: essa já soou como `aba`. */
      const agora = performance.now();
      const porClique = ultimoPonteiro >= ultimaTecla && agora - ultimoPonteiro < 4000;
      if (temTela && porClique && agora - ultimaAba > 400 && agora - ultimaNav > 300) {
        ultimaNav = agora;
        sentir('nav');
      }
      temTela = true;
    }
    if (telaNova || abaMudou) depoisDaTroca();
  });
  observador.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['open', 'aria-selected', 'aria-checked'],
  });

  const aoTeclar = () => (ultimaTecla = performance.now());

  /* O acerto e o erro de uma jogada (`pjAcerto`, `pjErro`: `jogos.js:234, 245`). Os jogos avisam o
     motor de comemoração do app, e ele avisa a janela antes de pedir o som ao kit de sempre: com a
     camada ligada soa o do protótipo, e o kit não toca por cima. */
  let naJogada = false;
  const aoJogar = (e: Event) => {
    if (!polido()) return;
    const tipo = (e as CustomEvent<{ tipo?: string }>).detail?.tipo;
    if (tipo !== 'acerto' && tipo !== 'erro') return;
    sentir(tipo);
    /* O som que o motor pede logo em seguida, no mesmo passo, é o desta jogada: já soou. */
    naJogada = true;
    queueMicrotask(() => (naJogada = false));
  };
  desviarKit((evento) => {
    if (!polido()) return false;
    if (naJogada) return true;
    if (!(evento in DO_KIT)) return false;
    const nome = DO_KIT[evento];
    if (nome) sentir(nome);
    return true;
  });

  tatoIos();
  document.addEventListener('pointerdown', aoApertar, true);
  document.addEventListener('click', aoClicar, true);
  document.addEventListener('pointerdown', aoPousar);
  document.addEventListener('pointerup', aoLevantar);
  window.addEventListener('keydown', aoTeclar, { capture: true });
  window.addEventListener('deviceorientation', aoGirar);
  window.addEventListener('resize', aoRedimensionarOGiro);
  window.addEventListener(EVENTO_DA_JOGADA, aoJogar);
  depoisDaTroca();

  return () => {
    vivo = false;
    observador.disconnect();
    desviarKit(null);
    document.removeEventListener('pointerdown', aoApertar, true);
    document.removeEventListener('click', aoClicar, true);
    document.removeEventListener('pointerdown', aoPousar);
    document.removeEventListener('pointerup', aoLevantar);
    window.removeEventListener('keydown', aoTeclar, { capture: true });
    window.removeEventListener('deviceorientation', aoGirar);
    window.removeEventListener('resize', aoRedimensionarOGiro);
    window.removeEventListener(EVENTO_DA_JOGADA, aoJogar);
    if (pedidoDeAbas) cancelAnimationFrame(pedidoDeAbas);
    alvosDoGiro();
    delete raiz.dataset.pxGiro;
    document.querySelector('.px-tato-ios')?.remove();
  };
}

/** Só para os testes: o motor volta ao começo (contexto novo, nenhuma supressão pendente). */
export function zerarSentidosParaTeste(): void {
  ac = null;
  mestre = null;
  ultimoSom = -Infinity;
  ultimaAba = -Infinity;
  ultimoDeCada.clear();
}
