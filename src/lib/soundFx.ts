import type { ThemeType } from './appearance';

/**
 * KIT SONORO — sintetizado na Web Audio API, com timbre próprio por tema.
 *
 * COMO ESTÁ FATORADO, E POR QUÊ
 * ─────────────────────────────
 * A primeira versão tinha uma tabela completa por tema: seis tabelas × N eventos, tudo ajustado à
 * mão. Bastava querer um evento novo para ter de escrever seis linhas, e as tabelas iam
 * inevitavelmente divergir entre si (foi assim que os emojis e os rótulos por perfil apodreceram
 * nas rodadas anteriores).
 *
 * Agora são dois eixos independentes:
 *
 *   TEMA   → o TIMBRE: forma de onda, nota-base, decaimento e volume. Seis entradas curtas.
 *   EVENTO → o GESTO MUSICAL: os intervalos em semitons a partir da nota-base do tema.
 *
 * A frequência final é `base(tema) + intervalo(evento)`. Um evento novo é UMA linha e nasce já
 * soando certo nos seis temas; um tema novo são quatro números.
 *
 * Tudo continua 100% sintetizado: zero download, zero arquivo de áudio, funciona offline.
 */

export type SoundEvent =
  // ── Navegação e chrome
  | 'click'        // botão genérico — o mais discreto de todos
  | 'nav'          // trocou de tela ou de aba
  | 'open'         // overlay abriu
  | 'close'        // overlay fechou
  // ── Estado
  | 'toggleOn'     // interruptor/checkbox ligou
  | 'toggleOff'    // interruptor/checkbox desligou
  | 'select'       // escolheu um item de uma lista
  // ── Conteúdo
  | 'add'          // guardou algo (palavra no deck, mídia importada)
  | 'remove'       // tirou algo
  | 'speak'        // disparou áudio/TTS
  // ── Resultado
  | 'success'      // acertou / concluiu
  | 'error'        // falhou
  | 'combo'        // emendou acertos — entre o acerto comum e o subir de nível
  | 'recordStart'  // começou a gravar
  | 'recordStop'   // parou de gravar
  | 'levelUp'      // subiu de nível — o único celebratório
  // ── Duelo relâmpago (jogo contra o tempo)
  | 'tick'         // último segundos: um toque seco por segundo
  | 'timeBonus'    // ganhou segundos de volta — deslizada para cima
  | 'fever';       // entrou no modo fever — acorde cheio

let audioCtx: AudioContext | null = null;
let soundMuted = false;
let currentTheme: ThemeType = 'babel';

export function setSoundMuted(muted: boolean) {
  soundMuted = muted;
}

export function isSoundMuted(): boolean {
  return soundMuted;
}

/** Chamado de onde o tema é aplicado (lib/theme.ts). Sem isto o kit fica no padrão. */
export function setSoundTheme(theme: ThemeType) {
  currentTheme = theme;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtxClass) audioCtx = new AudioCtxClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/* ─────────────────────────── Eixo 1: o TIMBRE do tema ─────────────────────────── */

interface ThemeVoice {
  wave: OscillatorType;
  /** Nota-base, em semitons a partir de A4 (440 Hz). Define o registro do tema. */
  root: number;
  /** Multiplicador de duração. `mochi` deixa ressoar; `vercel` corta seco. */
  decay: number;
  /** Multiplicador de volume. */
  gain: number;
  /** Onda do `error` — é o único evento que se permite ser áspero. */
  errorWave: OscillatorType;
}

/**
 * A leitura de cada tema, traduzida em som. A regra é a mesma das partículas: o efeito tem de
 * parecer consequência do tema, não decoração colada nele.
 */
const THEME_VOICES: Record<ThemeType, ThemeVoice> = {
  // Atelier quente, terracotta: triangular, registro médio, decaimento generoso.
  babel:  { wave: 'triangle', root: -9,  decay: 1,    gain: 1,    errorWave: 'sawtooth' },
  // Índigo elegante e geométrico: senoide limpa, precisa, sem sobra.
  linear: { wave: 'sine',     root: 0,   decay: 0.85, gain: 0.95, errorWave: 'square' },
  // Monocromático, cantos retos: blip curtíssimo e agudo, quase um clique de hardware.
  vercel: { wave: 'square',   root: 12,  decay: 0.3,  gain: 0.75, errorWave: 'square' },
  // Everforest orgânico, arredondado: triangular grave, ressoando.
  mochi:  { wave: 'triangle', root: -7,  decay: 1.7,  gain: 1.05, errorWave: 'triangle' },
  // Carvão sóbrio, tipográfico: senoide grave e discreta. Presente, nunca chamativa.
  notion: { wave: 'sine',     root: -14, decay: 0.9,  gain: 0.7,  errorWave: 'sine' },
  // Escolha do usuário: neutro, para não brigar com paleta nenhuma.
  // Instrument Premium: senoide limpa, registro grave, decaimento generoso (resonante); erro macio.
  premium: { wave: 'sine',    root: -5,  decay: 1.1,  gain: 0.9,  errorWave: 'triangle' },
  custom: { wave: 'sine',     root: 0,   decay: 0.9,  gain: 0.95, errorWave: 'square' }
};

/* ─────────────────────────── Eixo 2: o GESTO do evento ─────────────────────────── */

interface EventShape {
  /** Intervalos em semitons a partir da nota-base do tema. Vários = arpejo ou acorde. */
  steps: number[];
  /** Duração de CADA nota, em segundos (antes do `decay` do tema). */
  dur: number;
  /** Intervalo entre o início de uma nota e a seguinte. 0 = simultâneo. */
  stagger: number;
  /** Volume relativo (antes do `gain` do tema). O `click` é o mais baixo de propósito: é o som
   *  que toca centenas de vezes por sessão, e som repetido alto vira irritação. */
  gain: number;
  /** Glissando: a nota desliza até `freq * slide`. */
  slide?: number;
  /** Usa a onda áspera do tema. */
  harsh?: boolean;
}

/**
 * A GRAMÁTICA dos gestos, e é ela que faz o conjunto soar coerente:
 *
 *   sobe   = criar, abrir, ligar, acertar        (0 → +7, +12)
 *   desce  = fechar, desligar, remover, errar    (+7 → 0, −5)
 *   único  = neutro: clique, escolher            (uma nota só)
 *
 * Assim o usuário aprende o vocabulário sem nunca pensar nele: qualquer coisa que suba é ganho.
 */
export const EVENTS: Record<SoundEvent, EventShape> = {
  click:       { steps: [0],              dur: 0.04, stagger: 0,     gain: 0.5, slide: 0.7 },
  nav:         { steps: [0, 7],           dur: 0.05, stagger: 0.03,  gain: 0.62 },
  open:        { steps: [-7, 0],          dur: 0.07, stagger: 0.035, gain: 0.6 },
  close:       { steps: [0, -7],          dur: 0.065, stagger: 0.03, gain: 0.55 },

  toggleOn:    { steps: [0, 5],           dur: 0.045, stagger: 0.028, gain: 0.6 },
  toggleOff:   { steps: [5, 0],           dur: 0.045, stagger: 0.028, gain: 0.52 },
  select:      { steps: [4],              dur: 0.045, stagger: 0,     gain: 0.55 },

  add:         { steps: [0, 4, 9],        dur: 0.06, stagger: 0.035, gain: 0.7 },
  remove:      { steps: [9, 2],           dur: 0.06, stagger: 0.04,  gain: 0.6 },
  speak:       { steps: [7],              dur: 0.05, stagger: 0,     gain: 0.5, slide: 1.3 },

  success:     { steps: [0, 7, 12],       dur: 0.15, stagger: 0.05,  gain: 1 },
  error:       { steps: [-10, -14],       dur: 0.12, stagger: 0.06,  gain: 0.62, harsh: true },
  /* Emendar acertos tocava `select` — uma nota só, o MESMO som de escolher item numa lista. O
     gesto de ganho da casa é subir, então o combo sobe (0 → +4 → +7); fica mais curto e mais
     baixo que `success` porque acontece DURANTE a sequência e não pode competir com o acerto. */
  combo:       { steps: [0, 4, 7],        dur: 0.055, stagger: 0.03, gain: 0.75 },
  recordStart: { steps: [-5, 2, 7],       dur: 0.09, stagger: 0.05,  gain: 0.85 },
  recordStop:  { steps: [7, 2, -5],       dur: 0.09, stagger: 0.05,  gain: 0.85 },
  levelUp:     { steps: [0, 7, 12, 19],   dur: 0.2,  stagger: 0.07,  gain: 1.1 },

  // Duelo relâmpago. `tick` é o mais baixo: toca todo segundo no fim. `timeBonus` desliza para
  // cima (ganho). `fever` é o único acorde de quatro notas fora do levelUp — é raro de propósito.
  tick:        { steps: [0],              dur: 0.03, stagger: 0,     gain: 0.4,  harsh: true },
  timeBonus:   { steps: [7],              dur: 0.12, stagger: 0,     gain: 0.7,  slide: 1.5 },
  fever:       { steps: [0, 4, 7, 12],    dur: 0.22, stagger: 0.04,  gain: 1 },
};

/** Volume-mestre do kit. Um número, para calibrar tudo de uma vez. */
const MASTER = 0.09;

/**
 * ANTI-ATROPELO. Com o som delegado a toda a app (ver lib/sfxDelegate), um clique repetido rápido
 * — um stepper segurado, uma lista percorrida no teclado — empilharia osciladores e viraria lama.
 * A mesma nota não reinicia antes de `MIN_GAP`.
 */
const MIN_GAP = 45;
const lastPlayed = new Map<SoundEvent, number>();

/**
 * PRIORIDADE SEMÂNTICA — o som específico vence o genérico.
 *
 * O problema: o listener delegado roda na CAPTURA e toca `click` em qualquer botão; logo depois, o
 * handler do botão toca o som da AÇÃO (`speak` ao ouvir uma palavra, `add` ao guardar no deck).
 * Resultado: dois sons no mesmo gesto.
 *
 * A saída não é marcar os ~15 botões envolvidos à mão — isso volta a espalhar a regra e o próximo
 * botão nasce errado. Aqui o `click` genérico é AGENDADO com um atraso curto; se um som semântico
 * chegar nessa janela, ele cancela o genérico e toca sozinho. 55 ms está bem abaixo do limiar em
 * que se percebe atraso entre o clique e o som (~100 ms), então quem só clica não nota nada.
 */
const DEFER_MS = 55;
let pendingGeneric: ReturnType<typeof setTimeout> | null = null;

function cancelPendingGeneric() {
  if (pendingGeneric !== null) {
    clearTimeout(pendingGeneric);
    pendingGeneric = null;
  }
}

/** Usado pelo listener delegado para o `click` genérico. Ver a explicação acima. */
export function playGeneric(event: SoundEvent): void {
  cancelPendingGeneric();
  pendingGeneric = setTimeout(() => {
    pendingGeneric = null;
    play(event);
  }, DEFER_MS);
}

/**
 * Toca um evento com o timbre do tema em vigor.
 *
 * O ÚNICO veto é o interruptor de som do usuário. Duas condições foram removidas daqui porque
 * estavam erradas:
 *
 *   • `prefers-reduced-motion` — é uma preferência sobre MOVIMENTO. Usá-la para silenciar áudio
 *     fazia quem liga "reduzir animações" no Windows perder TODO o som, vendo um botão que dizia
 *     "Silenciar os sons" (isto é, ligado) sem nada tocar. A interface mentia, e não havia como
 *     consertar por dentro do app.
 *   • `performance-mode` — sintetizar um oscilador de 50 ms não custa quadro nenhum. O Modo
 *     Desempenho existe para cortar PINTURA (desfoque, sombra composta), não áudio.
 *
 * Nunca lança: um erro de áudio jamais pode derrubar uma interação.
 */
/**
 * `transpose`: semitons somados à nota-base. O Duelo relâmpago sobe o `combo` um semitom por acerto
 * em sequência — a escada que sobe é o retorno mais imediato de "está dando certo". Limitado a
 * ±24 para não virar apito.
 */
export function play(event: SoundEvent, opts: { transpose?: number } = {}): void {
  if (soundMuted) { cancelPendingGeneric(); return; }

  // Um som pedido diretamente é sempre mais específico que o `click` que o delegado agendou.
  cancelPendingGeneric();

  const agora = typeof performance !== 'undefined' ? performance.now() : 0;
  const anterior = lastPlayed.get(event);
  if (anterior != null && agora - anterior < MIN_GAP) return;
  lastPlayed.set(event, agora);

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const voice = THEME_VOICES[currentTheme] ?? THEME_VOICES.custom;
    const shape = EVENTS[event];
    if (!shape) return;

    const wave = shape.harsh ? voice.errorWave : voice.wave;
    const dur = shape.dur * voice.decay;
    const peak = Math.max(0.0001, shape.gain * voice.gain * MASTER);
    const now = ctx.currentTime;

    shape.steps.forEach((step, idx) => {
      const transpose = Math.max(-24, Math.min(24, opts.transpose ?? 0));
      const freq = 440 * Math.pow(2, (voice.root + step + transpose) / 12);
      const t0 = now + idx * shape.stagger;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = wave;
      osc.frequency.setValueAtTime(freq, t0);
      if (shape.slide) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * shape.slide), t0 + dur);
      }

      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.012, dur * 0.3));
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    });
  } catch {
    // Áudio indisponível (contexto bloqueado, aba sem gesto do usuário): silêncio, sem quebrar nada.
  }
}

/* ── Compatibilidade com chamadores antigos. Preferir `play()` no código novo. ── */
export const playClickSound = () => play('click');
export const playTabSound = () => play('nav');
export const playSuccessSound = () => play('success');
