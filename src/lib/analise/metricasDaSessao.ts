/**
 * AS MÉTRICAS DESTA SESSÃO — WPM, pausas longas, sobreposição, silêncio, maior monólogo, vícios de
 * linguagem, palavras-chave e o detalhe lexical da palavra selecionada.
 *
 * Saiu de `views/Analysis.tsx` sem mudar comportamento: cada `useMemo` continua na MESMA ordem em
 * que estava no componente (é o que mantém a lista de hooks idêntica), e o cálculo de cada um virou
 * função PURA, testável sem montar a tela (`tests/metricasDaSessao.test.ts`).
 *
 * A regra de honestidade que atravessa o arquivo inteiro: sem timing confiável o valor é `null`, e
 * a tela mostra "—". Nenhum número é inventado para preencher um cartão.
 */
import {
  computeTextStats,
  contarSobreposicoes,
  contarViciosDasFalas,
  extractKeywords,
  retrievability,
} from '@core';
import React from 'react';

import type { Sentence } from '../sentences';
import type { FalaCrua, FalaDaAnalise, SilencioDaSessao } from './tiposDaAnalise';

/**
 * WPM REAL da sessão: palavras / tempo falado (do primeiro tStartMs ao último tEndMs).
 * Sem timing confiável → null (a UI mostra "—", nunca um número inventado).
 */
export function calcularWpm(utterances: FalaCrua[], wordCount: number): number | null {
  if (utterances.length === 0 || wordCount === 0) return null;
  const first = utterances.find((u) => u.tStartMs != null);
  const last = [...utterances].reverse().find((u) => u.tEndMs != null);
  if (!first || !last || first.tStartMs == null || last.tEndMs == null) return null;
  const secs = (last.tEndMs - first.tStartMs) / 1000;
  if (secs < 1) return null;
  return Math.round(wordCount / (secs / 60));
}

/**
 * Pausas longas (>3s) REAIS: intervalos entre utterances consecutivas com timing.
 * Sem timing confiável → null (a UI mostra "—", nunca um número inventado).
 */
export function contarPausasLongas(utterances: FalaCrua[]): number | null {
  if (utterances.length < 2) return null;
  let hasTiming = false;
  let count = 0;
  for (let i = 1; i < utterances.length; i++) {
    const prev = utterances[i - 1];
    const cur = utterances[i];
    if (prev.tEndMs == null || cur.tStartMs == null) continue;
    hasTiming = true;
    if (cur.tStartMs - prev.tEndMs > 3000) count++;
  }
  return hasTiming ? count : null;
}

/**
 * SILÊNCIO TOTAL REAL: a soma dos intervalos entre falas consecutivas, em ms, mais a fração da
 * gravação que ele representa. `null` sem timing.
 *
 * Existe porque o cartão "Pausas Articulatórias" mostrava **"45 seg"** e **"Representa 12% da
 * gravação, ritmo saudável"** cravados no JSX — números inventados apresentados como medição, no
 * mesmo painel em que a linha vizinha diz corretamente "requer análise de áudio". O dado sempre
 * esteve aqui: é o mesmo laço de `contarPausasLongas`, sem o corte de 3 segundos.
 *
 * O julgamento ("ritmo saudável") NÃO volta. Não existe norma no app com que comparar, e afirmar
 * que 12% é saudável seria inventar de novo — agora com uma casa decimal a mais.
 */
export function calcularSilencio(utterances: FalaCrua[]): SilencioDaSessao | null {
  if (utterances.length < 2) return null;
  let hasTiming = false;
  let somaMs = 0;
  let primeiro: number | null = null;
  let ultimo: number | null = null;
  for (let i = 0; i < utterances.length; i++) {
    const cur = utterances[i];
    if (cur.tStartMs != null && primeiro == null) primeiro = cur.tStartMs;
    if (cur.tEndMs != null) ultimo = cur.tEndMs;
    if (i === 0) continue;
    const prev = utterances[i - 1];
    if (prev.tEndMs == null || cur.tStartMs == null) continue;
    hasTiming = true;
    const vao = cur.tStartMs - prev.tEndMs;
    if (vao > 0) somaMs += vao;
  }
  if (!hasTiming || primeiro == null || ultimo == null || ultimo <= primeiro) return null;
  return { ms: somaMs, pct: Math.round((somaMs / (ultimo - primeiro)) * 100) };
}

/** Maior monólogo REAL: maior duração de uma única fala (tEnd − tStart). Null sem timing. */
export function calcularMaiorMonologo(utterances: FalaCrua[]): number | null {
  let maxMs = 0;
  let hasTiming = false;
  for (const u of utterances) {
    if (u.tStartMs == null || u.tEndMs == null) continue;
    hasTiming = true;
    if (u.tEndMs - u.tStartMs > maxMs) maxMs = u.tEndMs - u.tStartMs;
  }
  return hasTiming ? maxMs : null;
}

/**
 * SOBREPOSIÇÃO DE FALA MEDIDA. O indicador dizia "requer diarização — em breve", e a diarização
 * está aqui: `speaker` vem de `utterances.speaker_name` e a tela já o renderiza três vezes.
 * Faltava a comparação, que é intersecção de intervalos (ver `core/learning/sobreposicao`).
 *
 * Recebe `Sentence[]`, NÃO o `parsedSentences` da tela: o adaptador de lá troca `startMs`/`endMs`
 * (ms) por um `startTime` em SEGUNDOS e não carrega `source`. Sobreposição precisa dos ms crus.
 */
export function medirSobreposicao(sentences: Sentence[]) {
  return contarSobreposicoes(
    sentences.map((s) => ({ speaker: s.speaker, source: s.source, startMs: s.startMs, endMs: s.endMs })),
  );
}

/**
 * VÍCIOS DE LINGUAGEM MEDIDOS. Onde havia **8** cravado no JSX com a legenda "uso excessivo de
 * marcadores como 'tipo' e 'ah'" — e, três painéis acima, o MESMO indicador dizendo "em breve".
 *
 * Cada fala é contada com a lista do PRÓPRIO idioma (`sentences` já traz `lang` resolvido pela
 * cadeia de fallback da tela), porque uma gravação é frequentemente mista e `um` é hesitação em
 * inglês e artigo em português — no banco desta máquina, 171 das 172 ocorrências eram artigo.
 */
export function medirVicios(sentences: Sentence[]) {
  /* `s.text` — NÃO `s.original`. `Sentence` (lib/sentences) usa `text`; é o `parsedSentences` da
     tela que renomeia para `original`. Escrevi `s.original` aqui e o cartão ficou mudo, porque
     `@types/react` não está instalado e todo hook devolve `any`: o tsc não pega. */
  return contarViciosDasFalas(sentences.map((s) => ({ text: s.text, lang: s.lang })));
}

/** O que o painel de topologia lexical mostra sobre a palavra clicada. */
export interface DetalheLexical {
  card: any;
  trechos: { texto: string; startTime: number }[];
  ocorrencias: number;
  retencao: number | null;
  fonetica: string | null;
  nivel: string | null;
  nivelConfianca: number | null;
  noDeck: boolean;
  traducao: string | null;
  lang: string | undefined;
}

/**
 * MICRODADOS LEXICAIS REAIS da palavra selecionada no gráfico de topologia.
 *
 * O painel que isto alimenta era uma demonstração cravada para TRÊS palavras (`heuristics`,
 * `leverage`, `bottleneck`) — e como toda a lógica era ternário com `else`, qualquer outra palavra
 * recebia os dados de `bottleneck`. Clicar em "casa" afirmava que casa se pronuncia /ˈbɒtəlnɛk/,
 * é nível C1, apareceu 3 vezes, tem 45% de retenção e foi usada em "We need to casa our existing
 * user base to drive growth". Cinco campos falsos sobre um cartão REAL do baralho de quem usa.
 *
 * Nada disso precisava ser inventado: `vocab_cards` já guarda `phonetics`, `cefr_level`,
 * `cefr_confidence`, `stability` e `last_review`, e as ocorrências e os trechos estão no
 * transcrito desta mesma tela. O painel não estava sem dado — ele não lia o cartão que a pessoa
 * acabou de clicar.
 */
export function montarDetalheLexical(
  palavra: string | null,
  vocabCards: any[],
  falas: FalaDaAnalise[],
  textoCompleto: string,
  agoraMs: number = Date.now(),
): DetalheLexical | null {
  if (!palavra) return null;
  const alvo = palavra.toLowerCase();
  const card = vocabCards.find((c) => String(c.word ?? '').toLowerCase() === alvo);

  /* Trechos REAIS: falas do transcrito que contêm a palavra, com o tempo para poder ouvir. */
  const trechos = falas
    .filter((s) => s.original.toLowerCase().includes(alvo))
    .slice(0, 4)
    .map((s) => ({ texto: s.original, startTime: s.startTime }));

  /* Ocorrências CONTADAS no transcrito, com fronteira por letra (o `\b` quebra em acento). */
  let ocorrencias: number;
  try {
    const re = new RegExp('(?<!\\p{L})' + alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\p{L})', 'giu');
    ocorrencias = (textoCompleto.toLowerCase().match(re) ?? []).length;
  } catch {
    /* Palavra com forma que quebra o RegExp: cai na contagem de trechos, que não usa regex. */
    ocorrencias = trechos.length;
  }

  /* Retenção pelo FSRS: só existe depois de uma revisão. Antes disso é `null`, não 45%. */
  let retencao: number | null = null;
  const estabilidade = Number(card?.fsrsStability ?? card?.stability ?? 0);
  const ultima = Number(card?.lastReview ?? 0);
  if (estabilidade > 0 && ultima > 0) {
    const dias = Math.max(0, (agoraMs - ultima) / 86_400_000);
    retencao = Math.round(retrievability(dias, estabilidade) * 100);
  }

  return {
    card,
    trechos,
    ocorrencias,
    retencao,
    /* `phonetics` vem do dicionário na captura; muitos cartões não têm. Sem ela a linha não
       aparece, o app não tem dicionário fonético para preencher, e chutar IPA é inventar. */
    fonetica: (card?.phonetics ? String(card.phonetics) : '').trim() || null,
    nivel: card?.cefrLevel ? String(card.cefrLevel) : null,
    nivelConfianca: card?.cefrConfidence != null ? Number(card.cefrConfidence) : null,
    noDeck: !!card?.inDeck,
    traducao: (card?.back ? String(card.back) : '').trim() || null,
    lang: card?.srcLang ? String(card.srcLang) : undefined,
  };
}

/** Tudo que as métricas precisam da tela — por parâmetro, sem contexto novo. */
export interface DepsDasMetricasDaSessao {
  /** As linhas cruas de `utterances` (é onde está o timing em ms). */
  realUtterances: FalaCrua[];
  /** As frases canônicas (`lib/sentences`) — traz `lang` e os milissegundos crus. */
  sentences: Sentence[];
  /** O adaptador local desta tela (`startTime` em segundos). */
  parsedSentences: FalaDaAnalise[];
  /** Idioma de FALLBACK da sessão (só quando a fala não traz o seu). */
  ttsLang: string;
  selectedLexicalWord: string | null;
  vocabCards: any[];
}

/**
 * Os dez `useMemo` das métricas, na ordem exata em que viviam no componente.
 *
 * A ordem importa duas vezes: o React exige a mesma sequência de hooks a cada render, e a extração
 * só é segura porque este bloco era CONTÍGUO na tela — nada foi reordenado.
 */
export function useMetricasDaSessao(deps: DepsDasMetricasDaSessao) {
  const { realUtterances, sentences, parsedSentences, ttsLang, selectedLexicalWord, vocabCards } = deps;

  // Estatísticas determinísticas do texto real (transcrição). Fonte dos KPIs.
  const fullTranscriptText = React.useMemo(() => parsedSentences.map((s) => s.original).join(' '), [parsedSentences]);
  /* AS ESTATISTICAS SAO DO IDIOMA DA SESSAO, nao do ingles por omissao: silabas e Flesch sao
     heuristicas inglesas e a densidade lexical depende de haver lista de stopwords. Passando o
     idioma, o que nao se aplica volta `null` e a tela mostra um traco em vez de numero inventado. */
  const stats = React.useMemo(() => computeTextStats(fullTranscriptText, ttsLang), [fullTranscriptText, ttsLang]);

  // WPM REAL da sessão: palavras / tempo falado (do primeiro tStartMs ao último tEndMs).
  const realWpm = React.useMemo(
    () => calcularWpm(realUtterances, stats.wordCount),
    [realUtterances, stats.wordCount],
  );

  // Pausas longas (>3s) REAIS: intervalos entre utterances consecutivas com timing.
  const realLongPauses = React.useMemo(() => contarPausasLongas(realUtterances), [realUtterances]);

  const realSobreposicao = React.useMemo(() => medirSobreposicao(sentences), [sentences]);

  const lexicalDetail = React.useMemo(
    () => montarDetalheLexical(selectedLexicalWord, vocabCards, parsedSentences, fullTranscriptText),
    [selectedLexicalWord, vocabCards, parsedSentences, fullTranscriptText],
  );

  const realVicios = React.useMemo(() => medirVicios(sentences), [sentences]);

  const realSilencio = React.useMemo(() => calcularSilencio(realUtterances), [realUtterances]);

  const realMonologue = React.useMemo(() => calcularMaiorMonologo(realUtterances), [realUtterances]);

  // Tópicos REAIS = palavras-chave extraídas deterministicamente do transcrito (não rótulos inventados).
  const topKeywords = React.useMemo(
    () => extractKeywords(fullTranscriptText, { max: 6, lang: ttsLang }),
    [fullTranscriptText, ttsLang],
  );

  return {
    fullTranscriptText,
    stats,
    realWpm,
    realLongPauses,
    realSobreposicao,
    lexicalDetail,
    realVicios,
    realSilencio,
    realMonologue,
    topKeywords,
  };
}
