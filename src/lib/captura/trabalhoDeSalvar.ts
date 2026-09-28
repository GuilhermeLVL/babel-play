/**
 * O SALVAMENTO DA CAPTURA COMO TRABALHO DO MÓDULO — não da tela.
 *
 * Relato do dono (2026-09-28): "quando o usuário tenta ENCERRAR uma sessão, demora, trava, e ele
 * fica preso na tela sem conseguir sair". Medido: o "Salvar" fechava o Encerrar e esperava o
 * gravador parar (sem prazo) e o áudio das duas fontes ser misturado (decodificar, renderizar e
 * codificar Opus, tudo na thread da tela) antes de mostrar qualquer coisa; uma recusa do servidor
 * reabria o Encerrar, que só voltava a falhar. A ordem agora é a de quem tem pressa:
 *
 *   1. `preparar()` (as falas em voo, até ~3 s) já com "Salvando…" no indicador;
 *   2. o RASCUNHO vai para o navegador antes da primeira ida à rede (`rascunhoDaCaptura`);
 *   3. as FALAS, em lotes (`criarSessaoEmLotes` / `substituirFalasEmLotes`) — é o que importa;
 *   4. `aoSalvar` (a navegação do App) roda AQUI, com o texto guardado;
 *   5. o ÁUDIO, com prazo: o que não chegar a tempo fica de fora, e a sessão já está salva;
 *   6. o VOCABULÁRIO (versos em lote, cartões), que é enriquecimento e não segura ninguém.
 *
 * Tudo roda fora do ciclo de vida da tela: sair da captura no meio não interrompe nada, e o
 * indicador do App (`IndicadorDeSalvamento`) lê o mesmo estado (`estadoDoSalvamento`). Duas
 * chamadas para a mesma captura (clique duplo, "Salvar" repetido) são UM salvamento; toda
 * tentativa usa o mesmo `origemLocalId`, e o servidor devolve a sessão que já existia.
 */
import { makeCloze, resumoDosPulados } from '@core';

import {
  bulkAddCards,
  criarSessaoEmLotes,
  ehTetoDeSessoes,
  ErroDeSessao,
  patchSessionMeta,
  substituirFalasEmLotes,
  updateSession,
  uploadSessionAudio,
} from '../../data/api';
import type { Recording } from '../../types';
import { comPrazo } from '../dispositivo/sonda';
import { marcarOcupacaoDaCaptura } from '../filaDeRecompensas';
import { baseLang } from '../languages';
import { explicarParada, traduzirVersos } from '../versosDoVocabulario';
import { definirSalvamento, type FalhaDoSalvamento, lerSalvamento } from './estadoDoSalvamento';
import { apagarRascunho, guardarRascunho, type RascunhoDaCaptura } from './rascunhoDaCaptura';
import type { SpeechSegment } from './tiposDaFala';
import { palavrasDasFalas } from './vocabularioDaSessao';

/** Quanto o áudio pode demorar depois de o texto estar salvo, antes de a sessão seguir sem ele. */
export const PRAZO_DO_AUDIO_MS = 45_000;

type Traduzir = (texto: string, de: string, para: string) => Promise<{ text?: string }>;

export interface DepsDoSalvamento {
  /** Normalmente `gateway.mt.translate` (os versos dos cartões). */
  traduzir: Traduzir;
  /** A navegação do App (`onSave`): roda UMA vez, com as falas guardadas. */
  aoSalvar: (recording: Recording) => void;
  /** A gravação mudou depois (o áudio subiu): o App atualiza a lista. */
  aoAtualizar?: (recording: Recording) => void;
}

export interface EntradaDoSalvamento extends DepsDoSalvamento {
  origemLocalId: string;
  titulo: string;
  /** Espera as falas em voo e monta o rascunho — roda com o indicador já na tela. */
  preparar: () => Promise<{ rascunho: RascunhoDaCaptura; segmentos?: ReadonlyArray<SpeechSegment> }>;
  /** O áudio da sessão (o gravador parando e a mistura), quando houver. */
  audio?: Promise<Blob | null>;
  prazoDoAudioMs?: number;
}

export type ResultadoDoSalvamento =
  | { ok: true; recording: Recording; palavras: number; resumo: string }
  | { ok: false; falha: FalhaDoSalvamento };

let emCurso: { origemLocalId: string; promessa: Promise<ResultadoDoSalvamento> } | null = null;

/** A recusa em termos que a tela usa para escolher a saída. */
export function falhaDe(e: unknown): FalhaDoSalvamento {
  if (e instanceof ErroDeSessao) return { mensagem: e.message, codigo: e.codigo, status: e.status, teto: ehTetoDeSessoes(e) };
  return { mensagem: String((e as Error)?.message ?? e), status: 0, teto: false };
}

/** As falas do rascunho no formato que a extração de vocabulário lê (retentativa sem a tela). */
function segmentosDoRascunho(r: RascunhoDaCaptura): SpeechSegment[] {
  return r.utterances.map((u, i) => ({
    id: `r${i}`,
    speakerId: u.source === 'system' ? 'system' : 'user',
    source: u.source === 'system' ? 'system' : 'mic',
    timestamp: '',
    originalText: u.sourceText ?? '',
    translatedText: u.translatedText ?? '',
    words: [],
    lang: u.sourceLang,
  }));
}

async function guardarFalas(r: RascunhoDaCaptura, titulo: string, origemLocalId: string): Promise<Recording> {
  const progresso = (feitas: number, total: number) =>
    definirSalvamento({ fase: 'salvando', origemLocalId, titulo, etapa: 'falas', feitas, total });
  let recording: Recording;
  if (r.resumeId) {
    // Retomada: as falas trocam no MESMO id (um append duplicaria as reidratadas).
    recording = await substituirFalasEmLotes(r.resumeId, r.utterances, progresso);
    const upd = await updateSession(r.resumeId, { title: titulo, durationMs: r.durationMs });
    if (upd) recording = upd;
  } else {
    recording = await criarSessaoEmLotes(
      {
        title: titulo,
        kind: 'live',
        sourceLang: r.sourceLang,
        targetLang: r.targetLang,
        status: 'done',
        durationMs: r.durationMs,
        utterances: r.utterances,
        origemLocalId,
      },
      progresso,
    );
  }
  if (r.capa) {
    const comCapa = await patchSessionMeta(recording.id, { imageUrl: r.capa });
    if (comCapa) recording = comCapa;
  }
  return recording;
}

/** O vocabulário: versos em lote e cartões. Falha aqui não desfaz a sessão, só vira recado. */
async function ficharVocabulario(
  r: RascunhoDaCaptura,
  segmentos: ReadonlyArray<SpeechSegment>,
  sessaoId: string,
  traduzir: Traduzir,
): Promise<{ palavras: number; resumo: string }> {
  try {
    const pendentes = palavrasDasFalas(segmentos, r.parConfigurado);
    const semVerso = pendentes.filter((p) => !p.back);
    const traducao = await traduzirVersos(
      semVerso.map((p) => ({ word: p.word, src: baseLang(p.srcLang), tgt: baseLang(p.tgtLang) })),
      traduzir,
    );
    const cards = pendentes.map((p) => {
      const cloze = makeCloze(p.sentence, p.word);
      return {
        word: p.word,
        back: p.back || traducao.versos.get(p.word.toLowerCase()) || '',
        sentence: p.sentence,
        srcLang: p.srcLang,
        tgtLang: p.tgtLang,
        clozePrompt: cloze?.prompt,
        clozeAnswer: cloze?.answer,
        sessionId: sessaoId,
      };
    });
    /* O NÚMERO É O QUE O SERVIDOR GRAVOU, não o tentado (a régua de qualidade recusa parte). */
    const entrada = cards.length ? await bulkAddCards(cards) : { cards: [], skipped: [] };
    const salvos = entrada.cards.length;
    const pulados = resumoDosPulados(entrada.skipped);
    const parada = explicarParada(traducao);
    const resumo =
      salvos || entrada.skipped.length
        ? `Sessão salva · ${salvos} palavra(s) fichada(s)` +
          (pulados ? ` · ${entrada.skipped.length} pulada(s): ${pulados}` : '') +
          (parada ? ` · ${parada}` : '')
        : 'Sessão salva.';
    return { palavras: salvos, resumo };
  } catch (e) {
    return { palavras: 0, resumo: `Sessão salva. O vocabulário não foi fichado: ${String((e as Error)?.message ?? e)}` };
  }
}

async function executar(e: EntradaDoSalvamento): Promise<ResultadoDoSalvamento> {
  const { origemLocalId, titulo } = e;
  definirSalvamento({ fase: 'salvando', origemLocalId, titulo, etapa: 'finais', feitas: 0, total: 0 });
  let rascunho: RascunhoDaCaptura;
  let segmentos: ReadonlyArray<SpeechSegment> | undefined;
  try {
    ({ rascunho, segmentos } = await e.preparar());
  } catch (err) {
    const falha = falhaDe(err);
    definirSalvamento({ fase: 'falhou', origemLocalId, titulo, falha });
    return { ok: false, falha };
  }
  // O rascunho ANTES da rede: nenhuma saída daqui em diante perde as falas em silêncio.
  guardarRascunho(rascunho);

  let recording: Recording;
  try {
    recording = await guardarFalas(rascunho, titulo, origemLocalId);
  } catch (err) {
    const falha = falhaDe(err);
    definirSalvamento({ fase: 'falhou', origemLocalId, titulo, falha });
    return { ok: false, falha };
  }
  apagarRascunho(origemLocalId);
  e.aoSalvar(recording);
  definirSalvamento({ fase: 'salvo', origemLocalId, titulo, sessaoId: recording.id, palavras: null });

  // O áudio com prazo: a sessão já está salva, o que não chegar a tempo fica de fora.
  if (e.audio) {
    definirSalvamento({ fase: 'salvando', origemLocalId, titulo, etapa: 'audio', feitas: 0, total: 0 });
    const blob = await comPrazo(() => e.audio as Promise<Blob | null>, e.prazoDoAudioMs ?? PRAZO_DO_AUDIO_MS);
    if (blob) {
      const url = await uploadSessionAudio(recording.id, blob);
      if (url) {
        recording = { ...recording, audioUrl: url };
        e.aoAtualizar?.(recording);
      }
    }
  }

  definirSalvamento({ fase: 'salvando', origemLocalId, titulo, etapa: 'vocabulario', feitas: 0, total: 0 });
  const { palavras, resumo } = await ficharVocabulario(
    rascunho,
    segmentos ?? segmentosDoRascunho(rascunho),
    recording.id,
    e.traduzir,
  );
  definirSalvamento({ fase: 'salvo', origemLocalId, titulo, sessaoId: recording.id, palavras, resumo });
  return { ok: true, recording, palavras, resumo };
}

/**
 * Salva a captura em segundo plano. A mesma captura chamada de novo enquanto salva devolve a
 * MESMA promessa (um salvamento só).
 */
export function salvarCaptura(e: EntradaDoSalvamento): Promise<ResultadoDoSalvamento> {
  if (emCurso && emCurso.origemLocalId === e.origemLocalId) return emCurso.promessa;
  marcarOcupacaoDaCaptura('salvamento', true);
  const promessa = executar(e).finally(() => {
    if (emCurso?.promessa === promessa) emCurso = null;
    marcarOcupacaoDaCaptura('salvamento', false);
  });
  emCurso = { origemLocalId: e.origemLocalId, promessa };
  return promessa;
}

/** Tenta de novo a partir do rascunho guardado — o mesmo `origemLocalId`, sem áudio. */
export function tentarDeNovo(r: RascunhoDaCaptura, deps: DepsDoSalvamento): Promise<ResultadoDoSalvamento> {
  return salvarCaptura({
    ...deps,
    origemLocalId: r.origemLocalId,
    titulo: r.titulo,
    preparar: async () => ({ rascunho: r }),
  });
}

/** Descarta o rascunho (a pessoa decidiu): some do navegador e o aviso de falha sai. */
export function descartarRascunho(origemLocalId: string): void {
  apagarRascunho(origemLocalId);
  const s = lerSalvamento();
  if (s.fase === 'falhou' && s.origemLocalId === origemLocalId) definirSalvamento({ fase: 'ocioso' });
}
