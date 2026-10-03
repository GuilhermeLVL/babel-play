/**
 * A VOZ NATURAL DA NUVEM NO CLIENTE (E5 da Fase E) — um `TtsEngine` (`src/lib/tts.ts`) que lê a
 * tradução do modo intérprete com a voz de `POST /api/ai/tts` (Premium, `vozNatural`).
 *
 * FORA DO JS INICIAL: só o intérprete a usa, e ele chega por `import()`.
 *
 * A REGRA QUE IMPORTA: A QUALQUER FALHA, A VOZ DO APARELHO LÊ A MESMA FALA. 402 (sem o Premium, a cota
 * do mês), 429 (nuvem ocupada, o uso justo do dia), 5xx, 501/503 (sem chave, flag desligada), 422 (sem
 * voz no idioma), timeout, rede, áudio que o navegador não deixa tocar: o MESMO texto vai à reserva
 * (`nativeTts`, a `speechSynthesis`) com os MESMOS callbacks — a fila de fala (`filaDeFala.ts`) recebe o
 * `onStart`/`onEnd` de sempre, e a pessoa ouve a tradução sem perceber que a nuvem não respondeu.
 *
 * E NÃO INSISTE: depois de uma recusa que não muda na próxima fala, a nuvem fica PAUSADA — 402/501/503
 * pela sessão inteira (o plano, a flag e a chave não mudam em segundos), 429 pelo `Retry-After` (a
 * cota do dia volta amanhã, a nuvem ocupada em segundos), 422 só para aquele idioma. 5xx, timeout e
 * rede valem só para o item: o próximo tenta de novo.
 *
 * O GUARDA DE ECO: enquanto o áudio toca, `marcarFalaExterna` (`tts.ts`) mantém o `isTtsActive` ligado
 * — o microfone não transcreve a própria voz do app. O Repetir não pede de novo: o último áudio fica
 * guardado (um só, em memória).
 *
 * A reprodução é por `HTMLAudioElement` num elemento SÓ, reaproveitado: no iPhone, um elemento que já
 * tocou dentro de um toque fica liberado — `destravarVozDaNuvem()` é para a tela chamar no toque do
 * botão de falar (E3).
 */
import { ROTA_DA_VOZ_NATURAL } from '../../core/vozNatural';
import { apiFetch } from '../../data/funil';
import { chaveLigada } from '../captura/testesDoInterprete';
import { marcarFalaExterna, nativeTts, type SpeakOptions, type TtsEngine } from '../tts';
import { partirEmFrases } from './frasesDaVoz';

/** Quanto a nuvem tem para devolver o áudio antes de a voz do aparelho assumir. */
export const PRAZO_DA_VOZ_DA_NUVEM_MS = 6_000;

/** Quem falou por último: o que o intérprete mostra ("a voz em uso") e o rótulo da métrica `tts_inicio`. */
export type MotorDaVoz = 'voz-da-nuvem' | 'voz-do-aparelho';

/** Um áudio tocando. O padrão é o `HTMLAudioElement`; os testes trocam. */
export interface ReprodutorDaVoz {
  /** Resolve quando o som COMEÇA; rejeita se o navegador não deixar tocar. */
  tocar(): Promise<void>;
  parar(): void;
  aoTerminar(cb: () => void): void;
  aoFalhar(cb: () => void): void;
}

export interface OpcoesDaVozDaNuvem {
  /** A voz de reserva — a do aparelho. */
  reserva?: TtsEngine;
  /** O pedido ao servidor (padrão: o `apiFetch` do funil, que leva o Bearer). */
  buscar?: (caminho: string, init: RequestInit) => Promise<Response>;
  /** Toca os bytes (padrão: um `HTMLAudioElement` reaproveitado). */
  tocador?: (audio: Blob) => ReprodutorDaVoz;
  prazoMs?: number;
  /** Uma voz PRONTA do modelo (o servidor ignora o que não for da lista dele). */
  voz?: string;
  /** O relógio (ms) das pausas. */
  agora?: () => number;
  /** A nuvem não serviu e a voz do aparelho leu (para o log e a telemetria da tela). */
  aoRecuar?: (motivo: MotivoDoRecuo) => void;
  /**
   * A VOZ POR FRASE está ligada? Lido a cada fala. Padrão: a chave de teste `vozPorFrase` do
   * `/diagnostico` (desligada de fábrica). Ligada, uma tradução de várias frases é sintetizada frase a
   * frase (2 em voo) e a primeira começa a tocar sem esperar as outras.
   */
  porFrase?: () => boolean;
}

/** Sínteses simultâneas na voz por frase: mais que isto só disputa a rede e atrasa a primeira. */
const SINTESES_EM_VOO = 2;

/** O que um pedido de síntese devolveu: o áudio, ou o motivo de a voz do aparelho ler no lugar. */
type ResultadoDaSintese = { audio: Blob } | { recuo: MotivoDoRecuo };

export type MotivoDoRecuo =
  | 'pausada'
  | 'plano'
  | 'cota'
  | 'desligada'
  | 'sem-voz'
  | 'ocupada'
  | 'uso-justo'
  | 'servidor'
  | 'prazo'
  | 'rede'
  | 'reproducao';

export interface VozDaNuvem extends TtsEngine {
  /** Quem leu a última fala: a nuvem ou a reserva do aparelho. */
  motorDaUltimaFala(): MotorDaVoz;
}

/* ─────────────────────────── o reprodutor padrão ─────────────────────────── */

let elementoCompartilhado: HTMLAudioElement | null = null;
const elemento = (): HTMLAudioElement => (elementoCompartilhado ??= new Audio());

/** Um silêncio de 1 amostra (WAV), para liberar o elemento de áudio dentro do toque. */
const SILENCIO = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==';

/**
 * Libera a reprodução no iPhone: chame DENTRO do toque do botão de falar. O elemento que tocou num
 * gesto pode tocar depois sem ele — e a tradução chega segundos depois do toque.
 */
export function destravarVozDaNuvem(): void {
  try {
    const el = elemento();
    el.src = SILENCIO;
    void el.play().catch(() => {
      /* sem liberar: a voz do aparelho é a reserva */
    });
  } catch {
    /* sem `Audio` (teste, navegador antigo): nada a liberar */
  }
}

function tocadorPadrao(audio: Blob): ReprodutorDaVoz {
  const el = elemento();
  const url = URL.createObjectURL(audio);
  let solto = false;
  const soltar = () => {
    if (solto) return;
    solto = true;
    URL.revokeObjectURL(url);
  };
  el.src = url;
  return {
    tocar: () => el.play(),
    parar: () => {
      el.pause();
      soltar();
    },
    aoTerminar: (cb) => {
      el.onended = () => {
        soltar();
        cb();
      };
    },
    aoFalhar: (cb) => {
      el.onerror = () => {
        soltar();
        cb();
      };
    },
  };
}

/* ─────────────────────────── o motor ─────────────────────────── */

/** Segundos do `Retry-After`; ausente ou ilegível, `padrao`. */
function segundos(res: Response, padrao: number): number {
  const n = Number(res.headers.get('retry-after'));
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

export function criarVozDaNuvem(o: OpcoesDaVozDaNuvem = {}): VozDaNuvem {
  const reserva = o.reserva ?? nativeTts;
  const buscar = o.buscar ?? ((caminho: string, init: RequestInit) => apiFetch(caminho, init));
  const tocador = o.tocador ?? tocadorPadrao;
  const agora = o.agora ?? (() => Date.now());
  const prazo = o.prazoMs ?? PRAZO_DA_VOZ_DA_NUVEM_MS;

  /** A fala em curso: callbacks de uma fala cancelada ou substituída são ignorados. */
  let vez = 0;
  /** Os pedidos em voo (um na fala de sempre; até `SINTESES_EM_VOO` na voz por frase). */
  const pedidos = new Set<AbortController>();
  let tocando: ReprodutorDaVoz | null = null;
  let soltarEco: (() => void) | null = null;
  let pausadaAte = 0;
  const idiomasSemVoz = new Set<string>();
  /* O Repetir não pede de novo: os áudios da ÚLTIMA fala (um por frase) ficam em memória, e uma fala
     de texto diferente os troca. */
  const cacheDeAudio = new Map<string, Blob>();
  let textoDoCache = '';
  let motor: MotorDaVoz = 'voz-da-nuvem';
  const abortarPedidos = () => {
    for (const p of pedidos) p.abort();
    pedidos.clear();
  };
  const porFrase = o.porFrase ?? (() => chaveLigada('vozPorFrase'));

  const pararAudio = () => {
    tocando?.parar();
    tocando = null;
    soltarEco?.();
    soltarEco = null;
  };

  /** A voz do aparelho lê ESTA fala, com os mesmos callbacks. */
  const recuar = (minha: number, texto: string, opts: SpeakOptions, motivo: MotivoDoRecuo) => {
    if (minha !== vez) return;
    motor = 'voz-do-aparelho';
    o.aoRecuar?.(motivo);
    reserva.speak(texto, opts);
  };

  /** A recusa do servidor: o motivo e quanto tempo a nuvem fica fora. */
  const lerRecusa = async (res: Response, idioma: string): Promise<MotivoDoRecuo> => {
    let code: string | undefined;
    try {
      code = ((await res.clone().json()) as { code?: string })?.code;
    } catch {
      /* corpo sem JSON */
    }
    if (res.status === 402) {
      pausadaAte = Infinity;
      return code === 'quota_exceeded' ? 'cota' : 'plano';
    }
    if (res.status === 501 || (res.status === 503 && code === 'voz_natural_desligada')) {
      pausadaAte = Infinity;
      return 'desligada';
    }
    if (res.status === 422) {
      idiomasSemVoz.add(idioma);
      return 'sem-voz';
    }
    if (res.status === 429) {
      pausadaAte = agora() + segundos(res, 30) * 1000;
      return code === 'uso_justo_do_dia' ? 'uso-justo' : 'ocupada';
    }
    /* 503 do portão (orçamento, chave de emergência): pausa curta. 5xx: só este item. */
    if (res.status === 503) pausadaAte = agora() + segundos(res, 60) * 1000;
    return 'servidor';
  };

  const tocar = async (minha: number, audio: Blob, texto: string, opts: SpeakOptions) => {
    const r = tocador(audio);
    tocando = r;
    let comecou = false;
    r.aoTerminar(() => {
      if (minha !== vez) return;
      tocando = null;
      soltarEco?.();
      soltarEco = null;
      opts.onEnd?.();
    });
    r.aoFalhar(() => {
      if (minha !== vez) return;
      tocando = null;
      soltarEco?.();
      soltarEco = null;
      if (comecou) opts.onError?.();
      else recuar(minha, texto, opts, 'reproducao');
    });
    try {
      await r.tocar();
    } catch {
      if (minha !== vez) return;
      tocando = null;
      recuar(minha, texto, opts, 'reproducao');
      return;
    }
    if (minha !== vez) {
      r.parar();
      return;
    }
    comecou = true;
    motor = 'voz-da-nuvem';
    soltarEco = marcarFalaExterna();
    opts.onStart?.();
  };

  /**
   * O áudio de UM texto: do cache (o Repetir), ou pedido ao servidor com o prazo da nuvem; `{ recuo }` =
   * a voz do aparelho lê no lugar, e `null` = a fala foi cancelada ou trocada (ninguém lê nada). Cada
   * pedido leva o PRÓPRIO controle e o PRÓPRIO prazo — na voz por frase, o prazo é por frase.
   */
  const obter = async (minha: number, texto: string, opts: SpeakOptions): Promise<ResultadoDaSintese | null> => {
    const idioma = opts.lang;
    const chave = `${idioma}\u0000${texto}`;
    const guardado = cacheDeAudio.get(chave);
    if (guardado) return { audio: guardado };
    if (agora() < pausadaAte) return { recuo: 'pausada' };
    if (idiomasSemVoz.has(idioma)) return { recuo: 'sem-voz' };

    const controle = new AbortController();
    pedidos.add(controle);
    let estourou = false;
    const relogio = setTimeout(() => {
      estourou = true;
      controle.abort();
    }, prazo);
    let res: Response;
    try {
      res = await buscar(ROTA_DA_VOZ_NATURAL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto,
          idioma,
          ...(o.voz ? { voz: o.voz } : {}),
          ...(opts.rate && opts.rate !== 1 ? { velocidade: opts.rate } : {}),
        }),
        signal: controle.signal,
      });
    } catch {
      clearTimeout(relogio);
      pedidos.delete(controle);
      return minha !== vez ? null : { recuo: estourou ? 'prazo' : 'rede' };
    }
    clearTimeout(relogio);
    pedidos.delete(controle);
    if (minha !== vez) return null;
    if (!res.ok) return { recuo: await lerRecusa(res, idioma) };
    let audio: Blob;
    try {
      audio = await res.blob();
    } catch {
      return minha !== vez ? null : { recuo: 'rede' };
    }
    if (minha !== vez) return null;
    if (!audio.size) return { recuo: 'servidor' };
    cacheDeAudio.set(chave, audio);
    return { audio };
  };

  /** A fala de sempre: um pedido, um áudio. */
  const falar = async (minha: number, texto: string, opts: SpeakOptions) => {
    const r = await obter(minha, texto, opts);
    if (!r || minha !== vez) return;
    if ('recuo' in r) return recuar(minha, texto, opts, r.recuo);
    return tocar(minha, r.audio, texto, opts);
  };

  /**
   * A VOZ POR FRASE: as sínteses saem em paralelo (`SINTESES_EM_VOO`), mas o som é SEMPRE na ordem do
   * texto — a segunda pronta antes da primeira espera. Cada frase tem o prazo da nuvem e a própria
   * queda para a voz do aparelho (a que falha é lida pelo aparelho, no lugar, e as outras seguem na
   * nuvem). Para quem chamou é UMA fala: `onStart` só da primeira, `onEnd` só da última.
   */
  const falarPorFrases = (minha: number, frases: string[], opts: SpeakOptions) => {
    const n = frases.length;
    const prontas: Array<ResultadoDaSintese | undefined> = new Array(n);
    let proximaAPedir = 0;
    let emVoo = 0;
    let daVez = 0;
    let tocandoUma = false;

    const emFrase = (i: number): SpeakOptions => ({
      ...opts,
      onStart: i === 0 ? opts.onStart : undefined,
      onEnd:
        i === n - 1
          ? opts.onEnd
          : () => {
              if (minha !== vez) return;
              tocandoUma = false;
              daVez = i + 1;
              tocarAVez();
            },
      /* Erro no meio: a fala acaba aqui — as frases que faltam não são lidas depois de a fila seguir. */
      onError: () => {
        if (minha !== vez) return;
        vez++;
        abortarPedidos();
        opts.onError?.();
      },
    });

    function tocarAVez(): void {
      if (minha !== vez || tocandoUma || daVez >= n) return;
      const r = prontas[daVez];
      if (!r) return; // a da vez ainda não está pronta: as outras esperam
      tocandoUma = true;
      const i = daVez;
      if ('recuo' in r) recuar(minha, frases[i], emFrase(i), r.recuo);
      else void tocar(minha, r.audio, frases[i], emFrase(i));
    }

    function pedirMais(): void {
      while (minha === vez && emVoo < SINTESES_EM_VOO && proximaAPedir < n) {
        const i = proximaAPedir++;
        emVoo++;
        void obter(minha, frases[i], opts)
          .catch((): ResultadoDaSintese => ({ recuo: 'rede' }))
          .then((r) => {
            emVoo--;
            if (!r || minha !== vez) return;
            prontas[i] = r;
            pedirMais();
            tocarAVez();
          });
      }
    }
    pedirMais();
  };

  return {
    speak(texto: string, opts?: SpeakOptions) {
      if (!texto?.trim() || !opts) return;
      const minha = ++vez;
      abortarPedidos();
      pararAudio();
      /* Só cala a reserva se ela fala: o `cancel()` do nativo reabre a cauda do guarda de eco. */
      if (reserva.isSpeaking?.() !== false) reserva.cancel();
      if (texto !== textoDoCache) {
        cacheDeAudio.clear();
        textoDoCache = texto;
      }
      const frases = porFrase() ? partirEmFrases(texto, opts.lang) : [texto];
      if (frases.length > 1) {
        try {
          falarPorFrases(minha, frases, opts);
        } catch {
          recuar(minha, texto, opts, 'rede');
        }
        return;
      }
      void falar(minha, texto, opts).catch(() => recuar(minha, texto, opts, 'rede'));
    },
    cancel() {
      vez++;
      abortarPedidos();
      pararAudio();
      reserva.cancel();
    },
    isSpeaking: () => tocando !== null || (reserva.isSpeaking?.() ?? false),
    motorDaUltimaFala: () => motor,
  };
}
