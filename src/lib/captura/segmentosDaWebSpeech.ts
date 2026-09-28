/**
 * PARCIAL/FINAL DA WEB SPEECH → SEGMENTOS DA TELA. A Web Speech não passa pelo pipeline (não há PCM
 * para o VAD nem para o Whisper): ela devolve texto pronto, parcial e final. Este é o mapeamento que o
 * microfone já usava (`fontesDeAudio.ts`), agora compartilhado com o áudio da aba/sistema
 * (`webSpeechDoSistema.ts`), para os dois produzirem o MESMO segmento que o pipeline produz:
 *   · o parcial cria (ou reescreve) UM balão `isPartial`, com o id guardado em `idDoParcialRef`;
 *   · o final reaproveita esse id (o balão vira definitivo no mesmo lugar), com as palavras e o fim
 *     no relógio da sessão, e pede a tradução.
 */
import type { Dispatch, SetStateAction } from 'react';

import { formatTime, type SpeechSegment, wordsFromText } from './tiposDaFala';
import type { OpcoesDeTraducao } from './traducaoDaFala';

export interface DepsDosSegmentosDaWebSpeech {
  source: 'mic' | 'system';
  speakerId: string;
  /** Idioma das palavras do segmento (clique para estudar). */
  idiomaDasPalavras: string;
  /** Par da tradução (ISO-639-1). */
  de: () => string;
  para: () => string;
  /** Fala da pessoa (`falada`: registro informal na tradução) — o microfone. */
  falada: boolean;
  idDoParcialRef: { current: string | null };
  timerRef: { current: number };
  nowRel: () => number;
  setSpeechSegments: Dispatch<SetStateAction<SpeechSegment[]>>;
  translateSegment: (segId: string, text: string, srcCode?: string, tgtCode?: string, opts?: OpcoesDeTraducao) => void;
  /** Descartar este resultado (anti-eco do microfone: era o TTS do app). */
  ignorar?: () => boolean;
}

const novoId = () => Math.random().toString(36).slice(2, 11);

export function segmentosDaWebSpeech(d: DepsDosSegmentosDaWebSpeech) {
  const aoParcial = (text: string) => {
    if (d.ignorar?.()) return;
    const clean = text.trim();
    if (!clean) return;
    if (!d.idDoParcialRef.current) d.idDoParcialRef.current = novoId();
    const pid = d.idDoParcialRef.current;
    d.setSpeechSegments((prev) => {
      const idx = prev.findIndex((s) => s.id === pid);
      if (idx !== -1) {
        const u = [...prev];
        u[idx] = { ...u[idx], originalText: clean };
        return u;
      }
      return [
        ...prev,
        {
          id: pid,
          speakerId: d.speakerId,
          source: d.source,
          timestamp: formatTime(d.timerRef.current),
          originalText: clean,
          translatedText: '…',
          words: [],
          isPartial: true,
          tStartMs: d.nowRel(),
        },
      ];
    });
  };

  const aoFinal = (text: string) => {
    if (d.ignorar?.()) {
      d.idDoParcialRef.current = null;
      return;
    }
    const clean = text.trim();
    if (!clean) return;
    const uttId = d.idDoParcialRef.current ?? novoId();
    d.idDoParcialRef.current = null;
    d.setSpeechSegments((prev) => {
      const existing = prev.find((s) => s.id === uttId);
      const committed: SpeechSegment = {
        id: uttId,
        speakerId: d.speakerId,
        source: d.source,
        timestamp: formatTime(d.timerRef.current),
        originalText: clean,
        translatedText: '…',
        words: wordsFromText(clean, d.idiomaDasPalavras),
        isPartial: false,
        tStartMs: existing?.tStartMs ?? d.nowRel(),
        tEndMs: d.nowRel(),
      };
      const idx = prev.findIndex((s) => s.id === uttId);
      if (idx !== -1) {
        const u = [...prev];
        u[idx] = committed;
        return u;
      }
      return [...prev, committed];
    });
    d.translateSegment(uttId, clean, d.de(), d.para(), { falada: d.falada });
  };

  return { aoParcial, aoFinal };
}
