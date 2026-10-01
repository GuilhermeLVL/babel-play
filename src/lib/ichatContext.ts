/**
 * Construtor de "contexto ativo" do iChat.
 *
 * Dado a tela atual (view), a sessão selecionada e a transcrição ao vivo, busca o
 * CONTEÚDO REAL daquela tela (via src/data/api.ts) e devolve um bloco compacto que vai ao
 * tutor como MATERIAL — o servidor o cerca como dado (`src/lib/ichat/contencao.ts`); o cliente
 * não escreve prompt de sistema. Cacheado por alguns segundos para não refazer fetch a
 * cada mensagem. Reusa os fetchers existentes — não refatora estado.
 */
import { fetchDeck, fetchMetrics, fetchSessionTranscript, type UtteranceRow } from '../data/api';
import type { Recording, ViewType } from '../types';

const LIMITE = 2200;

export interface ContextoExtras {
  practiceSeed?: string;
}

function truncar(s: string, n = LIMITE): string {
  const t = (s || '').trim();
  return t.length <= n ? t : t.slice(0, n) + ' […]';
}

function pct(v: number | null | undefined): string {
  return Math.round((v ?? 0) * 100) + '%';
}

function excertoTranscricao(uts: UtteranceRow[]): string {
  const linhas = uts
    .filter((u) => u.sourceText && u.sourceText.trim())
    .map((u) => (u.speakerName ? `${u.speakerName}: ` : '') + u.sourceText!.trim());
  return truncar(linhas.join('\n')) || '(sem transcrição disponível)';
}

function parIdiomas(uts: UtteranceRow[]): string {
  const src = uts.find((u) => u.sourceLang)?.sourceLang;
  const tgt = uts.find((u) => u.targetLang)?.targetLang;
  return src && tgt ? `${src} → ${tgt}` : '';
}

function nomeTela(view: ViewType): string {
  switch (view) {
    case 'hub':
      return 'Início';
    case 'capture':
      return 'Captura ao vivo';
    case 'interprete':
      return 'Intérprete (conversa frente a frente)';
    case 'library':
      return 'Biblioteca';
    case 'analysis':
      return 'Análise da sessão';
    case 'reading':
      return 'Modo Leitura';
    case 'study':
      return 'Prática & Treinos';
    case 'metrics':
      return 'Vocabulário & Métricas';
    case 'settings':
      return 'Configurações';
    default:
      return String(view);
  }
}

// cache simples por chave (view + id + tamanho do transcript ao vivo)
const cache = new Map<string, { at: number; val: string }>();
const TTL = 12_000;

async function _construir(
  view: ViewType,
  recording: Recording | null,
  liveTranscription: string,
  extras: ContextoExtras,
): Promise<string> {
  switch (view) {
    case 'capture': {
      const t = (liveTranscription || '').trim();
      return t
        ? `Tela: Captura ao vivo. Transcrição capturada até agora:\n"${truncar(t)}"`
        : `Tela: Captura ao vivo. Ainda não há fala capturada nesta sessão.`;
    }

    case 'hub':
    case 'metrics': {
      const m = await fetchMetrics();
      if (!m) return `Tela: ${nomeTela(view)}. Sem métricas disponíveis ainda.`;
      const nivel = m.levelDistribution?.slice().sort((a, b) => b.count - a.count)[0]?.level ?? '-';
      return [
        `Tela: ${nomeTela(view)}, dados REAIS do usuário. As estimativas vêm com nível de confiança; não trate estimativa como fato absoluto.`,
        `- Sessões: ${m.sessions} · Palavras capturadas: ${m.wordsCaptured} · Palavras únicas: ${m.uniqueWords}`,
        `- Vocabulário: ${m.deckSize} cartões (novos ${m.newCards} · a revisar hoje ${m.dueToday})`,
        `- Revisões: ${m.reviews} (acertos ${m.correctReviews}) · precisão ${pct(m.accuracy)} (confiança ${pct(m.accuracyConfidence)})`,
        `- Retenção média: ${pct(m.avgRetention)} (confiança ${pct(m.avgRetentionConfidence)})`,
        `- Ritmo de fala: ${Math.round(m.wpm)} WPM (confiança ${pct(m.wpmConfidence)})`,
        `- Nível predominante: ${nivel} (confiança ${pct(m.levelConfidence)}) · streak: ${m.streakDays} dia(s)`,
      ].join('\n');
    }

    case 'library':
    case 'analysis':
    case 'reading':
    case 'study': {
      const seed = extras.practiceSeed?.trim();
      if (recording?.id) {
        try {
          const tr = await fetchSessionTranscript(recording.id);
          const titulo = tr.session.title ?? recording.title;
          const par = parIdiomas(tr.utterances);
          const cab = `Tela: ${nomeTela(view)}, sessão "${titulo}" (${recording.type}${par ? `, ${par}` : ''}).`;
          const alvo = seed ? `\nAlvo do exercício atual: "${truncar(seed, 400)}".` : '';
          return `${cab}${alvo}\nConteúdo real da sessão:\n"${excertoTranscricao(tr.utterances)}"`;
        } catch {
          /* cai para o genérico abaixo */
        }
      }
      if (seed) {
        return `Tela: Prática & Treinos. Alvo do exercício atual: "${truncar(seed, 400)}".`;
      }
      if (view === 'library') {
        const deck = await fetchDeck();
        const amostra = deck
          .slice(0, 10)
          .map((c) => c.word)
          .filter(Boolean)
          .join(', ');
        return `Tela: Biblioteca. Nenhuma sessão aberta. Vocabulário do usuário: ${deck.length} cartão(ões)${amostra ? `. Amostra: ${amostra}` : ''}.`;
      }
      return `Tela: ${nomeTela(view)}. Nenhuma sessão selecionada.`;
    }

    default:
      return `Tela: ${nomeTela(view)}.`;
  }
}

/** Constrói o contexto da tela (com cache curto). Nunca lança — degrada com uma linha honesta. */
export async function construirContextoDaTela(
  view: ViewType,
  recording: Recording | null,
  liveTranscription: string,
  extras: ContextoExtras = {},
): Promise<string> {
  const chave = `${view}:${recording?.id ?? '-'}:${view === 'capture' ? (liveTranscription || '').length : ''}:${extras.practiceSeed ?? ''}`;
  const hit = cache.get(chave);
  if (hit && Date.now() - hit.at < TTL) return hit.val;
  try {
    const val = await _construir(view, recording, liveTranscription, extras);
    cache.set(chave, { at: Date.now(), val });
    return val;
  } catch {
    return `Tela: ${nomeTela(view)}. (não foi possível carregar o conteúdo desta tela agora)`;
  }
}
