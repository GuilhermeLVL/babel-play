/**
 * LIGA UM MOTOR DE VOZ AO AVATAR: `ligarAvatarAFala(engine)` devolve um `TtsEngine` que se comporta como o
 * original (mesmos callbacks, mesma ordem) e, de quebra, sabe SE o avatar deve estar falando e COMO está a boca.
 *
 * A fonte da verdade de "falando" é o motor de voz: `onStart` liga, `onEnd`/`onError`/`cancel` desligam. Fala
 * nova enquanto outra toca vale a nova (os callbacks atrasados da anterior não mexem no avatar, mas continuam
 * chegando a quem os passou). Erro síncrono do motor desliga e é relançado.
 *
 * De onde vem a boca (`pose(agoraMs)`, lida a cada quadro pelo motor de desenho, sem passar pelo React):
 *  · voz do aparelho (`speechSynthesis`): linha do tempo por texto (`core/avatar/boca.ts`), ancorada nos
 *    `boundary` quando existem (`origem() === 'eventos'`) e só pelo relógio quando não (`'relogio'`);
 *  · voz da nuvem (áudio no elemento compartilhado): a ABERTURA vem da amplitude (RMS, com piso) e a VOGAL da
 *    linha do tempo, que anda pelo relógio do próprio áudio e usa a duração real (`'amplitude'`). Sem analisador,
 *    ou com sinal sempre zero (áudio cross-origin sem CORS), cai na cadência (`'cadencia'`).
 *
 * PONTO DE EXTENSÃO (sem uso hoje): `wlipsync` daria a VOGAL a partir do espectro do áudio. Não está ligado
 * porque não há perfil validado em pt-BR (relatório de referências, seção 2). Se um dia houver, ele entra aqui,
 * em `poseDoAudio`, trocando só a `vogal` e mantendo a `abertura` da amplitude.
 */
import { useSyncExternalStore } from 'react';

import {
  aberturaDaAmplitude,
  ancorarLinha,
  avancarAte,
  type LinhaDaBoca,
  montarLinhaDaBoca,
  type PoseDaBoca,
} from '../../core/avatar/boca';
import { vozDaEmocao } from '../../core/avatar/emocao';
import type { EmocaoDoAvatar } from '../../core/avatar/estados';
import type { SpeakOptions, TtsEngine } from '../tts';
import { audioDaVozTocando, type FonteDeAudio, fonteDeAudioDaVoz } from './amplitude';

export type OrigemDaBoca = 'nenhuma' | 'relogio' | 'eventos' | 'amplitude' | 'cadencia';

/** Depois de tanto tempo falando sem NENHUMA amostra acima de zero, a amplitude é tratada como "sem sinal". */
export const PRAZO_SEM_SINAL_MS = 700;

export interface OpcoesDaLigacao {
  /** Relógio em ms (padrão `performance.now`). */
  agora?: () => number;
  /**
   * A fala atual está em áudio (voz da nuvem)? Consultada no `onStart`. Devolve a fonte do áudio ou `null`
   * (voz do aparelho). Padrão: o elemento compartilhado, se estiver tocando.
   */
  fonteDeAudio?: () => FonteDeAudio | null;
  /** A emoção da fala que vai começar. Ausente: a voz não é tocada. */
  emocao?: () => EmocaoDoAvatar;
  /** O motor tem controle de tom (`pitch`)? A voz da nuvem não: aí a emoção mexe só no ritmo. Padrão: sim. */
  temTom?: boolean;
}

export interface LigacaoDaFala {
  /** Use ESTE no lugar do motor original. */
  motor: TtsEngine;
  /** O avatar deve estar falando agora? (fonte da verdade: o motor de voz). */
  falando(): boolean;
  /** Avisa quando `falando()` muda (compatível com `useSyncExternalStore`). */
  assinar(cb: () => void): () => void;
  /** A boca em `agoraMs`, ou `null` se não está falando. Barata e sem efeito colateral além de ler o analisador. */
  pose(agoraMs?: number): PoseDaBoca | null;
  /** Como a boca está sendo guiada agora (diagnóstico e testes). */
  origem(): OrigemDaBoca;
  dispose(): void;
}

interface Fala {
  linha: LinhaDaBoca;
  t0: number;
  audio: FonteDeAudio | null;
  vistoSinal: boolean;
  /** Já refizemos a linha com a duração real do áudio? */
  duracaoAplicada: boolean;
  texto: string;
  idioma: string;
  velocidade: number;
}

export function ligarAvatarAFala(engine: TtsEngine, opcoes: OpcoesDaLigacao = {}): LigacaoDaFala {
  const agora = opcoes.agora ?? (() => performance.now());
  const fonteDeAudio = opcoes.fonteDeAudio ?? (() => (audioDaVozTocando() ? fonteDeAudioDaVoz() : null));
  const temTom = opcoes.temTom !== false;

  let vez = 0;
  let fala: Fala | null = null;
  let falando = false;
  let pausadoDesde: number | null = null;
  let pausado = 0;
  let origem: OrigemDaBoca = 'nenhuma';
  const ouvintes = new Set<() => void>();
  const avisar = () => {
    for (const cb of [...ouvintes]) cb();
  };
  const definirFalando = (v: boolean) => {
    if (falando === v) return;
    falando = v;
    avisar();
  };
  const desligar = () => {
    fala = null;
    origem = 'nenhuma';
    pausado = 0;
    pausadoDesde = null;
    definirFalando(false);
  };

  /** Tempo da fala em ms: relógio desde o `start`, sem as pausas. */
  const tempo = (t: number): number => {
    if (!fala) return 0;
    const parado = pausadoDesde !== null ? t - pausadoDesde : 0;
    return Math.max(0, t - fala.t0 - pausado - parado);
  };

  const motor: TtsEngine = {
    speak(texto, opts) {
      if (!texto || !texto.trim()) {
        engine.speak(texto, opts);
        return;
      }
      const minha = ++vez;
      desligar(); // a fala anterior (se havia) acabou para o avatar; a nova só "fala" no onStart

      const lang = opts?.lang ?? '';
      let efetivas: SpeakOptions | undefined = opts;
      if (opts && opcoes.emocao) {
        const e = opcoes.emocao();
        if (e !== 'neutro') {
          const v = vozDaEmocao(e, { rate: opts.rate, pitch: opts.pitch }, temTom);
          efetivas = { ...opts, rate: v.rate, ...(v.pitch !== undefined ? { pitch: v.pitch } : {}) };
        }
      }
      const velocidade = efetivas?.rate ?? 1;

      const envolvidas: SpeakOptions | undefined = efetivas && {
        ...efetivas,
        onStart: () => {
          if (minha === vez) {
            const t = agora();
            const audio = fonteDeAudio();
            const duracao = audio?.duracaoMs();
            fala = {
              linha: montarLinhaDaBoca({ texto, idioma: lang, velocidade, duracaoMs: duracao }),
              t0: t,
              audio,
              vistoSinal: false,
              duracaoAplicada: duracao !== undefined,
              texto,
              idioma: lang,
              velocidade,
            };
            pausado = 0;
            pausadoDesde = null;
            origem = audio ? 'cadencia' : 'relogio';
            definirFalando(true);
          }
          efetivas?.onStart?.();
        },
        onBoundary: (charIndex) => {
          if (minha === vez && fala && !fala.audio) {
            fala.linha = ancorarLinha(fala.linha, charIndex, tempo(agora()));
            if (fala.linha.ancora) origem = 'eventos';
          }
          efetivas?.onBoundary?.(charIndex);
        },
        onEnd: () => {
          if (minha === vez) desligar();
          efetivas?.onEnd?.();
        },
        onError: () => {
          if (minha === vez) desligar();
          efetivas?.onError?.();
        },
      };

      try {
        engine.speak(texto, envolvidas);
      } catch (e) {
        if (minha === vez) desligar();
        throw e;
      }
    },
    cancel() {
      vez += 1;
      desligar();
      engine.cancel();
    },
    pause: engine.pause
      ? () => {
          if (pausadoDesde === null && falando) pausadoDesde = agora();
          engine.pause?.();
        }
      : undefined,
    resume: engine.resume
      ? () => {
          if (pausadoDesde !== null) {
            pausado += agora() - pausadoDesde;
            pausadoDesde = null;
          }
          engine.resume?.();
        }
      : undefined,
    isSpeaking: engine.isSpeaking ? () => engine.isSpeaking?.() ?? false : undefined,
    isPaused: engine.isPaused ? () => engine.isPaused?.() ?? false : undefined,
  };

  const poseDoAudio = (f: Fala, t: number, audio: FonteDeAudio): PoseDaBoca => {
    // A duração real do áudio costuma chegar depois do `start`: refaz a linha uma vez, preservando o relógio.
    if (!f.duracaoAplicada) {
      const d = audio.duracaoMs();
      if (d !== undefined) {
        f.linha = montarLinhaDaBoca({ texto: f.texto, idioma: f.idioma, velocidade: f.velocidade, duracaoMs: d });
        f.duracaoAplicada = true;
      }
    }
    const relogio = audio.tempoMs() ?? tempo(t);
    const nasLetras = avancarAte(f.linha, relogio);
    const rms = audio.amplitude();
    if (rms !== null && rms > 0) f.vistoSinal = true;
    const semSinal = rms === null || (!f.vistoSinal && tempo(t) > PRAZO_SEM_SINAL_MS);
    if (semSinal) {
      origem = 'cadencia';
      return nasLetras;
    }
    origem = 'amplitude';
    const abertura = aberturaDaAmplitude(rms);
    return {
      vogal: abertura > 0 ? (nasLetras.vogal === 'F' ? 'A' : nasLetras.vogal) : 'F',
      abertura,
      acabou: nasLetras.acabou,
    };
  };

  return {
    motor,
    falando: () => falando,
    assinar(cb) {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    pose(t = agora()) {
      if (!falando || !fala) return null;
      if (fala.audio) return poseDoAudio(fala, t, fala.audio);
      return avancarAte(fala.linha, tempo(t));
    },
    origem: () => origem,
    dispose() {
      vez += 1;
      desligar();
      ouvintes.clear();
    },
  };
}

/** `true` enquanto o motor de voz ligado diz que fala. Sem ligação: `false`. */
export function useAvatarFalando(ligacao: LigacaoDaFala | null): boolean {
  return useSyncExternalStore(
    (cb) => (ligacao ? ligacao.assinar(cb) : () => undefined),
    () => (ligacao ? ligacao.falando() : false),
    () => false,
  );
}
