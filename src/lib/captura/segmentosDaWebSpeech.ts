/**
 * PARCIAL/FINAL DA WEB SPEECH → SEGMENTOS DA TELA. A Web Speech não passa pelo pipeline (não há PCM
 * para o VAD nem para o Whisper): ela devolve texto pronto, parcial e final. Este é o mapeamento que o
 * microfone já usava (`fontesDeAudio.ts`), agora compartilhado com o áudio da aba/sistema
 * (`webSpeechDoSistema.ts`), para os dois produzirem o MESMO segmento que o pipeline produz:
 *   · o parcial cria (ou reescreve) UM balão `isPartial`, com o id guardado em `idDoParcialRef`;
 *   · o final reaproveita esse id (o balão vira definitivo no mesmo lugar), com as palavras e o fim
 *     no relógio da sessão, e pede a tradução.
 *
 * REDE DE SEGURANÇA contra a legenda que repete (relato do dono no celular, 2026-09-29): quem
 * deduplica é o adaptador (`webSpeech.ts`), mas um final IGUAL ao anterior da mesma fonte, ou que o
 * ESTENDE, até `JANELA_DO_REENVIO_MS` depois dele, não abre outro balão — substitui o anterior (e o
 * retraduz, se o texto cresceu). Uma fala nova não começa com a anterior inteira.
 */
import type { Dispatch, SetStateAction } from 'react';

import { estende, JANELA_DO_REENVIO_MS } from '../../gateway/adapters/webSpeech';
import { formatTime, type LadoDoInterprete, type SpeechSegment, wordsFromText } from './tiposDaFala';
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
  /** Modo intérprete: o lado de quem fala nesta sessão (vai em cada balão). */
  lado?: LadoDoInterprete;
  /**
   * Um final NOVO foi comprometido (não o reenvio que só cresce o anterior): no intérprete, é o fim da
   * fala — o microfone fecha aqui.
   */
  aoFinalComprometido?: (segId: string) => void;
}

const novoId = () => Math.random().toString(36).slice(2, 11);

export function segmentosDaWebSpeech(d: DepsDosSegmentosDaWebSpeech) {
  /** O último final desta fonte (a rede de segurança compara o próximo com ele). */
  let ultimo: { id: string; texto: string; em: number } | null = null;

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
          ...(d.lado ? { lado: d.lado } : {}),
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
    const agora = d.nowRel();
    const anterior = ultimo && agora - ultimo.em <= JANELA_DO_REENVIO_MS ? ultimo : null;
    if (anterior && estende(anterior.texto, clean)) {
      // O mesmo texto de novo (ou ele crescido): o balão anterior é o desta fala; o parcial aberto sai.
      const pid = d.idDoParcialRef.current;
      d.idDoParcialRef.current = null;
      const cresceu = !estende(clean, anterior.texto);
      ultimo = { id: anterior.id, texto: cresceu ? clean : anterior.texto, em: agora };
      d.setSpeechSegments((prev) =>
        prev
          .filter((s) => !pid || s.id !== pid || s.id === anterior.id)
          .map((s) =>
            s.id === anterior.id && cresceu
              ? {
                  ...s,
                  originalText: clean,
                  translatedText: '…',
                  words: wordsFromText(clean, d.idiomaDasPalavras),
                  isPartial: false,
                  tEndMs: agora,
                }
              : s,
          ),
      );
      if (cresceu) d.translateSegment(anterior.id, clean, d.de(), d.para(), { falada: d.falada });
      return;
    }
    const uttId = d.idDoParcialRef.current ?? novoId();
    d.idDoParcialRef.current = null;
    ultimo = { id: uttId, texto: clean, em: agora };
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
        /* No intérprete o idioma é o do lado (declarado, não detectado): a sessão salva narra e estuda
           cada lado no idioma dele. */
        ...(d.lado ? { lado: d.lado, lang: d.de() } : {}),
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
    d.aoFinalComprometido?.(uttId);
  };

  return { aoParcial, aoFinal };
}
