/**
 * AUDITORIA DE IDIOMA — o reparo do passivo, sem chutar.
 *
 * As Fases 1–3 consertaram o caminho de ESCRITA: daqui para frente o idioma de um cartão vem da frase
 * de onde a palavra saiu. Mas os cartões que já estão no banco foram gravados pelo código antigo, e
 * carregam três danos conhecidos:
 *
 *   • **Sem rótulo** — a Leitura gravava `srcLang`/`tgtLang` ausentes. Vira `null` no banco. E sem
 *     idioma o painel de vocabulário nem chega a consultar o dicionário: o verbete "não existe".
 *   • **Rótulo da sessão** — a Análise carimbava em TODA palavra o idioma da PRIMEIRA fala da sessão.
 *     Numa sessão bilíngue, metade dos cartões saiu com o idioma do outro lado da conversa.
 *   • **Par invertido** — Estudo e Métricas liam a mesma configuração ao contrário da Análise. O mesmo
 *     cartão nascia com `src`/`tgt` trocados dependendo da tela em que você clicou.
 *
 * A REGRA DESTE MÓDULO, e é a razão de ele existir separado da correção automática:
 *
 *   **Nada é reescrito sem sinal.** A detecção roda sobre a FRASE do cartão (nunca sobre a palavra
 *   solta — a heurística satura em ~0.11 de confiança para uma palavra, o que jamais venceria um
 *   rótulo, mesmo um rótulo errado). Cada cartão cai em uma de quatro faixas, e só a primeira é
 *   aplicável sem você olhar:
 *
 *     'ok'        — o rótulo bate com o texto. Não se toca.
 *     'confiante' — o texto contradiz o rótulo COM confiança, ou não havia rótulo e o texto é claro.
 *                   Propomos a correção. Você ainda confirma.
 *     'ambiguo'   — há sinal, mas fraco (ou o cartão não tem frase, só a palavra). Perguntamos.
 *     'sem-sinal' — não há como saber. Fica exatamente como está, e a UI DIZ que ficou.
 *
 * Um cartão em 'sem-sinal' NÃO é um cartão consertado. Ele é um cartão sobre o qual nós admitimos não
 * ter informação — que é diferente, e é a única resposta honesta.
 */
import { detectLanguage, type LangDetection } from './langDetect';
import { baseLang } from './languages';
import type { LangConfig } from './langConfig';
import type { VocabCard } from '../types';

/** Acima disto, o texto vence o rótulo. Mesmo limiar do `spokenLang.ts` — uma regra só na app. */
const CONFIDENT = 0.6;
/** Abaixo disto não há sinal nenhum; entre os dois, há sinal fraco → é caso de perguntar. */
const WEAK = 0.25;

type Verdict = 'ok' | 'confiante' | 'ambiguo' | 'sem-sinal';

export interface LangFinding {
  /** Id do item auditado (cartão OU fala). O campo é genérico apesar do nome histórico. */
  cardId: string;
  /** Se este achado é de um cartão de vocabulário ou de uma fala de transcrição. */
  kind: 'card' | 'utterance';
  /** Rótulo de exibição: a palavra (cartão) ou "Fala N" (fala). */
  word: string;
  /** O texto que serviu de evidência (frase do cartão / `sourceText` da fala). Sem ele, não há detecção. */
  sentence?: string;
  verdict: Verdict;
  /** O que está gravado hoje. `undefined` = a coluna está nula no banco. */
  current: { srcLang?: string; tgtLang?: string };
  /** O que propomos gravar. `null` quando não propomos nada (veredictos 'ok' e 'sem-sinal'). */
  proposed: { srcLang: string; tgtLang: string } | null;
  detected: LangDetection | null;
  /** Por que este item caiu nesta faixa — em pt-BR, para aparecer na tela. */
  reason: string;
}

/**
 * O alvo da tradução é derivado, nunca detectado: é a resposta a "o que o usuário quer entender?".
 * Palavra no idioma que ele estuda → traduz para o dele. Palavra no idioma dele (ou num terceiro) →
 * traduz para o outro lado. Mesma regra do `vocabWord.ts`; se ela mudar lá, muda aqui.
 */
export function targetFor(lang: string, cfg: LangConfig): string {
  const mine = baseLang(cfg.mine);
  const studying = baseLang(cfg.studying);
  return lang === mine ? studying : mine;
}

/** Um item genérico a auditar — abstrai cartão e fala sob o MESMO classificador. */
interface AuditInput {
  id: string;
  kind: 'card' | 'utterance';
  /** Rótulo de exibição (palavra do cartão / "Fala N"). */
  word: string;
  /** Texto de evidência (frase do cartão / `sourceText` da fala). */
  text?: string | null;
  rawSrc?: string | null;
  rawTgt?: string | null;
}

/** Termo por tipo, para as mensagens saírem com o artigo certo em pt-BR ("O cartão" × "A fala"). */
const TERM: Record<AuditInput['kind'], { cap: string; low: string }> = {
  card: { cap: 'O cartão', low: 'o cartão' },
  utterance: { cap: 'A fala', low: 'a fala' },
};

/**
 * O classificador. Não escreve nada — só decide a faixa e propõe. Cartões e falas passam por AQUI: a
 * única diferença é de onde vêm o texto e o rótulo (e o artigo das mensagens).
 */
async function classify(input: AuditInput, cfg: LangConfig): Promise<LangFinding> {
  const term = TERM[input.kind];
  const current = {
    srcLang: input.rawSrc ? baseLang(input.rawSrc) : undefined,
    tgtLang: input.rawTgt ? baseLang(input.rawTgt) : undefined,
  };
  const sentence = input.text?.trim() || undefined;

  const base: Omit<LangFinding, 'verdict' | 'proposed' | 'reason'> = {
    cardId: input.id,
    kind: input.kind,
    word: input.word,
    sentence,
    current,
    detected: null,
  };

  // Sem texto não há evidência. (Para cartões: a palavra solta não serve — a detecção por palavra
  // única não passa de ~0.11 de confiança, muito abaixo do limiar, e usá-la seria trocar um chute por
  // outro. As falas sempre têm a frase inteira, então caem aqui só quando o `sourceText` está vazio.)
  if (!sentence) {
    return {
      ...base,
      verdict: current.srcLang ? 'ambiguo' : 'sem-sinal',
      proposed: null,
      reason: current.srcLang
        ? `${term.cap} não tem texto de origem, então não há como conferir o rótulo "${current.srcLang}". Só você sabe.`
        : `${term.cap} não tem idioma nem texto de origem. Não há nada que nos permita deduzir o idioma, precisa ser você a dizer.`,
    };
  }

  const detected = await detectLanguage(sentence);
  const withDetection = { ...base, detected };

  if (!detected || detected.confidence < WEAK) {
    return {
      ...withDetection,
      verdict: 'sem-sinal',
      proposed: null,
      reason: 'O texto é curto ou ambíguo demais para identificar o idioma com honestidade. Deixamos como está.',
    };
  }

  const lang = baseLang(detected.lang);
  const proposed = { srcLang: lang, tgtLang: targetFor(lang, cfg) };
  const pct = Math.round(detected.confidence * 100);

  // O par já está correto — inclusive o alvo. Um src certo com tgt invertido continua sendo um bug.
  if (current.srcLang === lang && current.tgtLang === proposed.tgtLang) {
    return { ...withDetection, verdict: 'ok', proposed: null, reason: `O rótulo bate com o texto (${pct}% de confiança).` };
  }

  // GUARDA CONTRA FALSO POSITIVO DA HEURÍSTICA. Palavras-função curtas do inglês ("to", "do", "a",
  // "and") também são stopwords de pl/cs/ca — num texto curto o placar cruza 0.6 e a heurística
  // "crava" um idioma que o usuário NEM ESTUDA. Medido no baralho real: 57 dos 430 confiantes
  // propunham cs/pl/es/ca, todos por heurística, todos sobre frases em inglês. Então: um idioma FORA
  // dos dois configurados, detectado só por heurística, nunca é pré-marcado — cai em 'ambiguo' (a UI
  // pergunta). O detector NATIVO (on-device) é confiável e não é rebaixado por esta regra.
  const configured = new Set([baseLang(cfg.mine), baseLang(cfg.studying)]);
  const trustworthy = detected.method === 'native' || configured.has(lang);

  if (detected.confidence >= CONFIDENT && trustworthy) {
    if (!current.srcLang) {
      return {
        ...withDetection,
        verdict: 'confiante',
        proposed,
        reason: `${term.cap} está sem idioma, e o texto é claramente ${lang} (${pct}%).`,
      };
    }
    if (current.srcLang !== lang) {
      return {
        ...withDetection,
        verdict: 'confiante',
        proposed,
        reason: `${term.cap} diz "${current.srcLang}", mas o texto está em ${lang} (${pct}%).`,
      };
    }
    // src bate, tgt não: é a assinatura exata do par invertido entre Estudo/Métricas e Análise.
    return {
      ...withDetection,
      verdict: 'confiante',
      proposed,
      reason: `O idioma está certo (${lang}), mas a direção da tradução está errada: ${term.low} traduz para "${current.tgtLang ?? '-'}" em vez de "${proposed.tgtLang}".`,
    };
  }

  // Chega aqui por um de dois caminhos: sinal fraco (entre WEAK e CONFIDENT), ou um idioma inesperado
  // cravado com força só pela heurística (a colisão de stopwords acima). Nos dois casos há sinal, mas
  // não o bastante para passar por cima de você.
  const unexpectedStrong = detected.confidence >= CONFIDENT && !trustworthy;
  return {
    ...withDetection,
    verdict: 'ambiguo',
    proposed,
    reason: unexpectedStrong
      ? `O texto parece ${lang} (${pct}%), mas ${lang} não é um idioma que você configurou e essa detecção é só heurística, palavras curtas em inglês colidem com ${lang}. Confira antes de aplicar.`
      : current.srcLang
        ? `${term.cap} diz "${current.srcLang}" e o texto parece ${lang}, mas só com ${pct}% de confiança, pouco para sobrescrever no automático.`
        : `${term.cap} está sem idioma. O texto parece ${lang}, mas só com ${pct}% de confiança.`,
  };
}

/** Audita um cartão. Não escreve nada — só classifica e propõe. */
async function auditCard(card: VocabCard, cfg: LangConfig): Promise<LangFinding> {
  return classify(
    { id: card.id, kind: 'card', word: card.word, text: card.sentence, rawSrc: card.srcLang, rawTgt: card.tgtLang },
    cfg,
  );
}

export interface AuditReport {
  findings: LangFinding[];
  counts: Record<Verdict, number>;
}

/** Conta os veredictos e ordena (decisões primeiro, certos por último). Compartilhado deck × falas. */
function toReport(findings: LangFinding[]): AuditReport {
  const counts: Record<Verdict, number> = { ok: 0, confiante: 0, ambiguo: 0, 'sem-sinal': 0 };
  for (const f of findings) counts[f.verdict]++;
  const order: Record<Verdict, number> = { confiante: 0, ambiguo: 1, 'sem-sinal': 2, ok: 3 };
  findings.sort((a, b) => order[a.verdict] - order[b.verdict]);
  return { findings, counts };
}

/** Audita o baralho inteiro. Sequencial de propósito: o detector nativo tem cache e serializa melhor. */
export async function auditDeck(cards: VocabCard[], cfg: LangConfig): Promise<AuditReport> {
  const findings: LangFinding[] = [];
  for (const card of cards) findings.push(await auditCard(card, cfg));
  return toReport(findings);
}

/** Uma fala auditável — só os campos que o classificador olha (não dependemos do tipo do servidor). */
export interface AuditUtterance {
  id: string;
  idx?: number | null;
  sourceText?: string | null;
  sourceLang?: string | null;
  targetLang?: string | null;
}

/** Audita uma fala. `word` vira "Fala N" (a fala não tem palavra-título); o texto é o `sourceText`. */
async function auditUtterance(u: AuditUtterance, cfg: LangConfig): Promise<LangFinding> {
  const n = typeof u.idx === 'number' ? u.idx + 1 : undefined;
  return classify(
    { id: u.id, kind: 'utterance', word: n ? `Fala ${n}` : 'Fala', text: u.sourceText, rawSrc: u.sourceLang, rawTgt: u.targetLang },
    cfg,
  );
}

/** Audita todas as falas. Mesmo contrato e mesma ordenação do `auditDeck`. */
export async function auditUtterances(utterances: AuditUtterance[], cfg: LangConfig): Promise<AuditReport> {
  const findings: LangFinding[] = [];
  for (const u of utterances) findings.push(await auditUtterance(u, cfg));
  return toReport(findings);
}
