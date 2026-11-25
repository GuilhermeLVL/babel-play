/**
 * O MODO "FRASE POR FRASE" na tela da sessão (openspec `repetir-e-pausar-por-frase`): guarda a escolha NESTE aparelho
 * e liga a máquina pura (`core/learning/frasePorFrase`) ao player.
 *
 *  - Com áudio gravado, o fim da frase é vigiado aqui (por `requestAnimationFrame` e por `timeupdate`, que segue vivo com a
 *    aba em segundo plano): repete (volta ao começo), espera a pessoa repetir em voz alta e segue, ou para.
 *  - Na narração por voz (sem áudio gravado) o player pergunta `aoFim` ao fim de cada fala (`playerDaSessao.ts`).
 *
 * A escolha é por aparelho (`localStorage`, com o acesso protegido). Nada é gravado, nem sai do aparelho.
 * Flag `frase_por_frase` desligada: o hook não faz nada e o player é o de sempre.
 */
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type AcaoDeFrase,
  aoFimDaFrase,
  CONFIG_PADRAO,
  type ConfigDeFrase,
  normalizarConfig,
} from '../../core/learning/frasePorFrase';
import { fimDaFrase, inicioDaFrase, type ResultadoDosTempos, temposUsaveis } from '../../core/learning/temposDaFrase';
import { FLAG_FRASE_POR_FRASE } from '../../core/planos';
import { useFlag } from '../flags';
import type { FalaDaAnalise } from './tiposDaAnalise';

const CHAVE = 'babel.analise.frasePorFrase';

/** Um fio antes do fim: a pausa acontece ANTES de a fala seguinte começar a soar. */
const FOLGA_S = 0.04;

export interface EscolhaDeFrase extends ConfigDeFrase {
  /** O modo está ligado nesta visita/aparelho? */
  ligado: boolean;
}

export function lerEscolhaDeFrase(): EscolhaDeFrase {
  try {
    const bruto = localStorage.getItem(CHAVE);
    const v = bruto ? (JSON.parse(bruto) as Record<string, unknown>) : null;
    return { ...normalizarConfig(v), ligado: v?.ligado === true };
  } catch {
    return { ...CONFIG_PADRAO, ligado: false };
  }
}

function gravarEscolhaDeFrase(e: EscolhaDeFrase): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(e));
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

/** O que o player de narração (TTS) precisa do modo; entregue por ref para não re-disparar a narração. */
export interface PontoDeFrasePorFrase {
  ativo: boolean;
  /** A fala `i` acabou de ser narrada em `duracaoMs`: o que fazer? */
  aoFim: (i: number, duracaoMs: number) => AcaoDeFrase;
}

export interface FrasePorFraseDaTela {
  /** A flag está ligada e a tela admite o modo (sem escuta guiada, sem documento). */
  disponivel: boolean;
  /** Os tempos das falas servem (só medido com áudio gravado). */
  tempos: ResultadoDosTempos;
  /** Ligado, disponível e com tempos bons: o player obedece à máquina. */
  ativo: boolean;
  /** A pausa de repetir está correndo (a vez da pessoa falar). */
  esperando: boolean;
  /** A frase em foco durante a pausa (`null` fora dela). */
  fraseDaPausa: number | null;
  escolha: EscolhaDeFrase;
  ligar: (v: boolean) => void;
  mudar: (parcial: Partial<ConfigDeFrase>) => void;
  /** Termina a pausa agora e segue para a frase seguinte ("Já falei"). */
  seguirAgora: () => void;
}

export function useFrasePorFrase(opts: {
  falas: readonly FalaDaAnalise[];
  hasRealAudio: boolean;
  audioRef: RefObject<HTMLAudioElement | null>;
  audioDuration: number;
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  /** Escuta guiada ligada, documento etc.: o modo não se aplica. */
  permitido: boolean;
  /** Entregue ao player de narração (TTS). */
  ponteDoPlayer: RefObject<PontoDeFrasePorFrase | null>;
}): FrasePorFraseDaTela {
  const { falas, hasRealAudio, audioRef, audioDuration, isPlaying, setIsPlaying, permitido, ponteDoPlayer } = opts;
  const flag = useFlag(FLAG_FRASE_POR_FRASE);
  const [escolha, setEscolha] = useState<EscolhaDeFrase>(lerEscolhaDeFrase);
  const disponivel = flag && permitido && falas.length > 0;
  /* Sem áudio gravado a narração é fala a fala e não há corte por tempo: só o áudio precisa de tempos bons. */
  const tempos = useMemo<ResultadoDosTempos>(
    () =>
      hasRealAudio
        ? temposUsaveis(falas, audioDuration > 0 ? audioDuration : null)
        : { usavel: true, motivo: null, indice: null },
    [falas, hasRealAudio, audioDuration],
  );
  const ativo = disponivel && escolha.ligado && tempos.usavel;

  const ligar = useCallback((v: boolean) => {
    setEscolha((e) => {
      const novo = { ...e, ligado: v };
      gravarEscolhaDeFrase(novo);
      return novo;
    });
  }, []);
  const mudar = useCallback((parcial: Partial<ConfigDeFrase>) => {
    setEscolha((e) => {
      const novo = { ...e, ...normalizarConfig({ ...e, ...parcial }) };
      gravarEscolhaDeFrase(novo);
      return novo;
    });
  }, []);

  const configRef = useRef<ConfigDeFrase>(escolha);
  configRef.current = escolha;
  const totalRef = useRef(falas.length);
  totalRef.current = falas.length;
  /* Quantas vezes a frase `feitaDe` já tocou (a máquina é pura; a conta fica aqui). */
  const feita = useRef({ de: -1, n: 0 });
  const [fraseDaPausa, setFraseDaPausa] = useState<number | null>(null);
  const pularEspera = useRef<(() => void) | null>(null);

  /* A narração por voz pergunta aqui o que fazer ao fim de cada fala. */
  const aoFim = useCallback((i: number, duracaoMs: number): AcaoDeFrase => {
    if (feita.current.de !== i) feita.current = { de: i, n: 0 };
    const r = aoFimDaFrase(configRef.current, i, totalRef.current, feita.current.n, duracaoMs);
    feita.current = { de: i, n: r.feita };
    return r.acao;
  }, []);
  useEffect(() => {
    ponteDoPlayer.current = ativo && !hasRealAudio ? { ativo: true, aoFim } : null;
    return () => {
      ponteDoPlayer.current = null;
    };
  }, [ativo, hasRealAudio, aoFim, ponteDoPlayer]);

  /* O ÁUDIO GRAVADO: vigia o fim da frase e age. */
  useEffect(() => {
    if (!ativo || !hasRealAudio || !isPlaying) return;
    const a = audioRef.current;
    if (!a) return;
    let cancelado = false;
    let raf = 0;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let esperandoAte = 0;
    let esperaDe = -1;
    let meusSeeks = 0;

    const buscar = (t: number) => {
      meusSeeks++;
      try {
        a.currentTime = t;
      } catch {
        meusSeeks--;
      }
    };
    const fraseNoTempo = (t: number) => {
      let k = -1;
      for (let i = 0; i < falas.length; i++) if (inicioDaFrase(falas[i]) <= t + 0.001) k = i;
      return k;
    };
    const fimDeEspera = () => {
      if (temporizador !== undefined) clearTimeout(temporizador);
      temporizador = undefined;
      esperandoAte = 0;
      pularEspera.current = null;
      setFraseDaPausa(null);
    };
    const retomar = () => {
      if (cancelado || esperaDe < 0) return;
      const proxima = esperaDe + 1;
      fimDeEspera();
      esperaDe = -1;
      const alvo = falas[proxima];
      if (!alvo) return;
      buscar(inicioDaFrase(alvo));
      a.play().catch(() => setIsPlaying(false));
    };
    const verificar = () => {
      if (cancelado || a.paused || esperaDe >= 0) return;
      const i = fraseNoTempo(a.currentTime);
      if (i < 0) return;
      const fim = fimDaFrase(falas, i, Number.isFinite(a.duration) ? a.duration : null);
      if (fim === null || a.currentTime < fim - FOLGA_S) return;
      const ini = inicioDaFrase(falas[i]);
      if (feita.current.de !== i) feita.current = { de: i, n: 0 };
      const velocidade = a.playbackRate > 0 ? a.playbackRate : 1;
      const r = aoFimDaFrase(
        configRef.current,
        i,
        totalRef.current,
        feita.current.n,
        ((fim - ini) * 1000) / velocidade,
      );
      feita.current = { de: i, n: r.feita };
      switch (r.acao.tipo) {
        case 'repetir':
          buscar(ini);
          break;
        case 'esperar': {
          a.pause();
          buscar(Math.max(ini, fim - 0.05));
          esperaDe = i;
          setFraseDaPausa(i);
          esperandoAte = Date.now() + r.acao.ms;
          temporizador = setTimeout(retomar, r.acao.ms);
          pularEspera.current = retomar;
          break;
        }
        case 'parar':
          a.pause();
          buscar(Math.max(ini, fim - 0.05));
          setIsPlaying(false);
          break;
        default:
          break;
      }
    };
    const quadro = () => {
      verificar();
      if (!cancelado) raf = requestAnimationFrame(quadro);
    };
    /* Quem busca por conta própria (anterior, próxima, toque numa fala) desfaz a pausa e recomeça a conta. */
    const aoBuscar = () => {
      if (meusSeeks > 0) {
        meusSeeks--;
        return;
      }
      feita.current = { de: -1, n: 0 };
      if (esperaDe >= 0) {
        fimDeEspera();
        esperaDe = -1;
        a.play().catch(() => setIsPlaying(false));
      }
    };
    /* Aba em segundo plano: o relógio é estrangulado, então ao voltar o foco a pausa que já venceu termina. */
    const aoVoltar = () => {
      if (!document.hidden && esperandoAte > 0 && Date.now() >= esperandoAte) retomar();
    };
    raf = requestAnimationFrame(quadro);
    a.addEventListener('timeupdate', verificar);
    a.addEventListener('seeking', aoBuscar);
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      cancelado = true;
      cancelAnimationFrame(raf);
      a.removeEventListener('timeupdate', verificar);
      a.removeEventListener('seeking', aoBuscar);
      document.removeEventListener('visibilitychange', aoVoltar);
      if (temporizador !== undefined) clearTimeout(temporizador);
      pularEspera.current = null;
      setFraseDaPausa(null);
    };
  }, [ativo, hasRealAudio, isPlaying, audioRef, falas, setIsPlaying]);

  const seguirAgora = useCallback(() => pularEspera.current?.(), []);

  return useMemo(
    () => ({
      disponivel,
      tempos,
      ativo,
      esperando: fraseDaPausa !== null,
      fraseDaPausa,
      escolha,
      ligar,
      mudar,
      seguirAgora,
    }),
    [disponivel, tempos, ativo, fraseDaPausa, escolha, ligar, mudar, seguirAgora],
  );
}
