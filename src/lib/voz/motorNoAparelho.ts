/**
 * O MOTOR DE VOZ NO APARELHO como `TtsEngine` (openspec `voz-no-aparelho`): a voz que o Narrador usa quando a porta
 * escolhe `neural-local`. Quem sintetiza é injetado (o cliente do worker do Supertonic; no teste, um falso); quem toca
 * também (o Web Audio; no teste, um relógio).
 *
 *  · FILA COM PRIORIDADE: a frase pedida por `speak` vai à frente; a pré-busca (`preparar`, até 2 à frente) vai atrás.
 *    Uma frase por vez no worker. O cache guarda as últimas 4 (a atual, as 2 seguintes e a anterior, para "repetir").
 *  · A DURAÇÃO REAL: o fim da frase (`onEnd`, que move o destaque) é o fim do áudio tocado, não uma estimativa.
 *  · SEM SILÊNCIO: frase que falha é lida NA HORA pela voz do aparelho (`reserva`); o aviso (`aoRecuar`) sai uma vez.
 *  · LIBERAR: `liberar()` agenda o fim do worker (na hora em aparelho de pouca memória, 20 s depois no resto, como os
 *    modelos da captura); falar de novo antes do prazo cancela.
 *  · MEDIDA: cada frase registra `performance.measure('voz-no-aparelho:frase', { detail: { rtf, … } })`.
 */
import {
  ehVozDoSupertonic,
  idiomaDoSupertonic,
  velocidadeDoModelo,
  VOZ_PADRAO_DO_NARRADOR,
} from '../../core/voz/supertonic';
import { marcarFalaExterna, type SpeakOptions, type TtsEngine } from '../tts';

export interface ClipeDaVoz {
  pcm: Float32Array;
  taxa: number;
  /** Tempo de síntese (ms) no worker. */
  ms: number;
  backend: string;
}

export interface SintetizadorDaVoz {
  sintetizar(texto: string, idioma: string, voz: string, velocidade: number): Promise<ClipeDaVoz>;
  liberar(): void;
}

export interface TocadorDaVoz {
  /** Toca e chama `aoFim` no fim real do áudio. Devolve o "parar" (que NÃO chama `aoFim`). */
  tocar(pcm: Float32Array, taxa: number, volume: number, aoFim: () => void): () => void;
}

export interface MotorNoAparelho extends TtsEngine {
  preparar(itens: ReadonlyArray<{ texto: string; opts: SpeakOptions }>): void;
  liberar(): void;
  /** Troca quem recebe o aviso de recuo (o motor é um só; o Narrador muda). */
  definirAoRecuar(f: ((motivo: string) => void) | undefined): void;
}

export interface OpcoesDoMotorNoAparelho {
  sintetizador: SintetizadorDaVoz;
  tocador: TocadorDaVoz;
  reserva: TtsEngine;
  /** A voz do narrador escolhida pela pessoa (padrão F1). */
  vozPadrao?: () => string;
  aoRecuar?: (motivo: string) => void;
  /** Quanto esperar para soltar o worker depois de `liberar()` (0 = na hora). */
  soltarAposMs?: number;
}

const TAMANHO_DO_CACHE = 4;
export const PRE_BUSCA_MAXIMA = 2;

interface Pedido {
  chave: string;
  args: [string, string, string, number];
  resolve: (c: ClipeDaVoz) => void;
  reject: (e: unknown) => void;
}

function medir(texto: string, c: ClipeDaVoz) {
  const audioS = c.pcm.length / c.taxa;
  try {
    const fim = performance.now();
    performance.measure('voz-no-aparelho:frase', {
      start: fim - c.ms,
      end: fim,
      detail: {
        caracteres: texto.length,
        ms: Math.round(c.ms),
        audioS,
        rtf: audioS ? c.ms / 1000 / audioS : 0,
        backend: c.backend,
      },
    });
  } catch {
    /* navegador sem `measure` com detalhe: a medida é só diagnóstico */
  }
}

export function criarMotorNoAparelho(o: OpcoesDoMotorNoAparelho): MotorNoAparelho {
  const cache = new Map<string, Promise<ClipeDaVoz>>();
  const fila: Pedido[] = [];
  let emCurso = false;
  let vez = 0;
  let pararSom: (() => void) | null = null;
  let fimDaFala: (() => void) | null = null;
  let falando = false;
  let avisou = false;
  let aoRecuar = o.aoRecuar;
  let soltura: ReturnType<typeof setTimeout> | null = null;

  const cancelarSoltura = () => {
    if (soltura) clearTimeout(soltura);
    soltura = null;
  };

  const resolver = (opts: SpeakOptions) => {
    const idioma = idiomaDoSupertonic(opts.lang);
    const voz = ehVozDoSupertonic(opts.voiceName) ? opts.voiceName : (o.vozPadrao?.() ?? VOZ_PADRAO_DO_NARRADOR);
    return { idioma, voz, velocidade: velocidadeDoModelo(opts.rate ?? 1) };
  };

  function bombear() {
    if (emCurso) return;
    const p = fila.shift();
    if (!p) return;
    emCurso = true;
    o.sintetizador
      .sintetizar(...p.args)
      .then(p.resolve, p.reject)
      .finally(() => {
        emCurso = false;
        bombear();
      });
  }

  function obter(texto: string, idioma: string, voz: string, velocidade: number, frente: boolean): Promise<ClipeDaVoz> {
    const chave = `${voz}|${velocidade.toFixed(3)}|${idioma}|${texto}`;
    const pronta = cache.get(chave);
    if (pronta) {
      cache.delete(chave); // reinsere: vira a mais recente
      cache.set(chave, pronta);
      if (frente) {
        const i = fila.findIndex((p) => p.chave === chave);
        if (i > 0) fila.unshift(...fila.splice(i, 1));
      }
      return pronta;
    }
    const promessa = new Promise<ClipeDaVoz>((resolve, reject) => {
      const p: Pedido = { chave, args: [texto, idioma, voz, velocidade], resolve, reject };
      if (frente) fila.unshift(p);
      else fila.push(p);
    });
    promessa.catch(() => {
      if (cache.get(chave) === promessa) cache.delete(chave); // falhou: outra vez tenta de novo
    });
    cache.set(chave, promessa);
    while (cache.size > TAMANHO_DO_CACHE) {
      const velha = cache.keys().next().value!;
      cache.delete(velha);
      const i = fila.findIndex((p) => p.chave === velha);
      if (i >= 0) fila.splice(i, 1)[0].reject(new Error('descartada'));
    }
    bombear();
    return promessa;
  }

  function calarSom() {
    pararSom?.();
    pararSom = null;
    fimDaFala?.();
    fimDaFala = null;
    falando = false;
  }

  const motor: MotorNoAparelho = {
    speak(texto, opts) {
      const minha = ++vez;
      calarSom();
      cancelarSoltura();
      const { idioma, voz, velocidade } = resolver(opts);
      if (!idioma || !texto.trim()) return o.reserva.speak(texto, opts);
      obter(texto, idioma, voz, velocidade, true).then(
        (c) => {
          if (minha !== vez) return;
          medir(texto, c);
          fimDaFala = marcarFalaExterna(); // o guarda anti-eco da captura também vale para esta voz
          falando = true;
          opts.onStart?.();
          pararSom = o.tocador.tocar(c.pcm, c.taxa, opts.volume ?? 1, () => {
            if (minha !== vez) return;
            pararSom = null;
            fimDaFala?.();
            fimDaFala = null;
            falando = false;
            opts.onEnd?.();
          });
        },
        () => {
          if (minha !== vez) return;
          if (!avisou) {
            avisou = true;
            aoRecuar?.('falha');
          }
          /* A MESMA frase, agora, pela voz do aparelho: nada de silêncio. */
          const { voiceName: _semVoz, ...resto } = opts;
          o.reserva.speak(texto, resto);
        },
      );
    },
    cancel() {
      vez++;
      calarSom();
    },
    isSpeaking: () => falando,
    preparar(itens) {
      for (const { texto, opts } of itens.slice(0, PRE_BUSCA_MAXIMA)) {
        const { idioma, voz, velocidade } = resolver(opts);
        if (idioma && texto.trim()) obter(texto, idioma, voz, velocidade, false).catch(() => undefined);
      }
    },
    liberar() {
      motor.cancel();
      cancelarSoltura();
      const soltar = () => {
        soltura = null;
        for (const p of fila.splice(0)) p.reject(new Error('liberado'));
        cache.clear();
        o.sintetizador.liberar();
      };
      const ms = o.soltarAposMs ?? 0;
      if (ms <= 0) soltar();
      else soltura = setTimeout(soltar, ms);
    },
    definirAoRecuar(f) {
      aoRecuar = f;
    },
  };
  return motor;
}

/** O tocador de verdade: um `AudioBufferSourceNode` por frase, com ganho (o volume da narração). */
export function tocadorWebAudio(contexto: () => AudioContext): TocadorDaVoz {
  return {
    tocar(pcm, taxa, volume, aoFim) {
      const ctx = contexto();
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      const buf = ctx.createBuffer(1, pcm.length, taxa);
      buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
      const fonte = ctx.createBufferSource();
      fonte.buffer = buf;
      const ganho = ctx.createGain();
      ganho.gain.value = Math.max(0, Math.min(1, volume));
      fonte.connect(ganho).connect(ctx.destination);
      let parado = false;
      fonte.onended = () => {
        if (!parado) aoFim();
      };
      fonte.start();
      return () => {
        parado = true;
        try {
          fonte.stop();
        } catch {
          /* já tinha acabado */
        }
        fonte.disconnect();
      };
    },
  };
}
