/**
 * A ESCUTA GUIADA na tela da sessão: guarda o modo escolhido NESTE aparelho e liga a máquina pura
 * (`core/learning/escutaGuiada`) ao player (`seekTo` / `setIsPlaying`) e ao teclado.
 *
 * A preferência é por aparelho (`localStorage`, com o acesso protegido: navegação privada pode
 * recusar o armazenamento). Não há tempo nem prêmio em nada disto (Decreto 12.880, art. 9º).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { CefrLevel } from '../../core/learning/contract';
import {
  ehModoDeEscuta,
  type EstadoDeEscuta,
  etapaAtual,
  type EtapaDeEscuta,
  iniciarEscuta,
  irParaFrase,
  type ModoDeEscuta,
  modoSugerido,
  proximoPasso,
  revelarTexto,
  textoVisivel,
  trocarModo,
} from '../../core/learning/escutaGuiada';
import type { FalaDaAnalise } from './tiposDaAnalise';

const CHAVE = 'babel.analise.modoDeEscuta';

/** O modo guardado neste aparelho, ou `null` (nunca escolheu / sem armazenamento). */
export function lerModoDeEscuta(): ModoDeEscuta | null {
  try {
    const v = localStorage.getItem(CHAVE);
    return ehModoDeEscuta(v) ? v : null;
  } catch {
    return null;
  }
}

function gravarModoDeEscuta(modo: ModoDeEscuta): void {
  try {
    localStorage.setItem(CHAVE, modo);
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

/** Enter só vira "Próximo passo" quando nada que use o Enter tem o foco. */
export function enterLivrePara(alvo: EventTarget | null, doc: Document = document): boolean {
  const el = alvo as HTMLElement | null;
  if (el && el !== doc.body && el !== doc.documentElement) {
    if (el.isContentEditable) return false;
    if (el.closest?.('button, a, input, select, textarea, summary, [role="button"], [role="dialog"], [role="menu"]')) {
      return false;
    }
  }
  return !doc.querySelector('[role="dialog"], dialog[open]');
}

export interface EscutaGuiadaDaTela {
  modo: ModoDeEscuta;
  sugerido: ModoDeEscuta;
  etapa: EtapaDeEscuta | null;
  /** O texto da frase em foco está oculto? */
  oculto: boolean;
  /** Índice (`FalaDaAnalise.index`) da frase com o texto oculto, ou `null`. */
  fraseOculta: number | null;
  /** Não há para onde avançar (última etapa da última frase). */
  noFim: boolean;
  mudarModo: (modo: ModoDeEscuta) => void;
  proximo: () => void;
  revelar: () => void;
}

export function useEscutaGuiada(opts: {
  falas: readonly FalaDaAnalise[];
  indiceAtivo: number;
  nivel: CefrLevel | null;
  seekTo: (t: number) => void;
  setIsPlaying: (v: boolean) => void;
  /** Documento e afins: sem player, sem passos. */
  desligada?: boolean;
}): EscutaGuiadaDaTela {
  const { falas, indiceAtivo, nivel, seekTo, setIsPlaying, desligada = false } = opts;
  const total = falas.length;
  const frase = Math.max(0, indiceAtivo);
  const [salvo, setSalvo] = useState<ModoDeEscuta | null>(lerModoDeEscuta);
  const modo: ModoDeEscuta = desligada ? 'livre' : (salvo ?? 'livre');
  const [estado, setEstado] = useState<EstadoDeEscuta>(() => iniciarEscuta(modo, frase));
  /* Trocar de frase por qualquer meio (anterior, próxima, toque numa fala, o áudio andando) recomeça os
     passos dela: derivado no render, sem efeito, para o texto não piscar na frase nova. */
  const atual = irParaFrase(trocarModo(estado, modo), frase);
  const etapa = etapaAtual(atual);
  const oculto = !textoVisivel(atual);
  const noFim = proximoPasso(atual, total).terminou;

  const tocarFrase = useCallback(
    (i: number, tocar: boolean) => {
      const alvo = falas[i];
      if (!alvo) return;
      seekTo(alvo.startTime);
      setIsPlaying(tocar);
    },
    [falas, seekTo, setIsPlaying],
  );

  const proximo = useCallback(() => {
    const r = proximoPasso(atual, total);
    if (r.terminou) return;
    setEstado(r.estado);
    const e = etapaAtual(r.estado);
    if (r.estado.frase !== atual.frase) tocarFrase(r.estado.frase, e !== 'ler');
    else if (e === 'ouvir-com-texto') tocarFrase(r.estado.frase, true);
    else if (e === 'ler') setIsPlaying(false);
  }, [atual, total, tocarFrase, setIsPlaying]);

  const revelar = useCallback(() => {
    setEstado(revelarTexto(atual));
    setIsPlaying(false);
  }, [atual, setIsPlaying]);

  const mudarModo = useCallback(
    (m: ModoDeEscuta) => {
      gravarModoDeEscuta(m);
      setSalvo(m);
      setEstado(iniciarEscuta(m, frase));
    },
    [frase],
  );

  const ativo = modo !== 'livre';
  useEffect(() => {
    if (!ativo) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!enterLivrePara(e.target)) return;
      e.preventDefault();
      proximo();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [ativo, proximo]);

  return useMemo(
    () => ({
      modo,
      sugerido: modoSugerido(nivel),
      etapa,
      oculto,
      fraseOculta: oculto ? frase : null,
      noFim,
      mudarModo,
      proximo,
      revelar,
    }),
    [modo, nivel, etapa, oculto, frase, noFim, mudarModo, proximo, revelar],
  );
}
