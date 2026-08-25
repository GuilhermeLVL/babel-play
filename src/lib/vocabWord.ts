/**
 * PRODUTOR ÚNICO DE PALAVRA/CARTÃO — quem decide o idioma de uma palavra e para onde traduzi-la.
 *
 * POR QUE ISTO EXISTE. Havia CINCO produtores de cartão de vocabulário na app, e QUATRO estavam
 * errados — cada um errando de um jeito diferente:
 *
 *   Reading.tsx:169     não gravava idioma nenhum → o banco guardava `null`. Sem idioma, o painel nem
 *                       chega a consultar o dicionário, e não diz por quê. (E a Leitura é justamente a
 *                       única tela que TEM detecção por frase — e jogava o resultado fora.)
 *   Analysis.tsx:525    gravava o idioma da PRIMEIRA fala da sessão inteira em toda palavra. A função
 *                       certa (`langOfWord`) existe no mesmo arquivo e não era usada na escrita.
 *   LiveCapture:1542    gravava `sourceLang` SEMPRE, contradizendo o `handleFinalizeSave` do próprio
 *                       arquivo, que inverte corretamente por fala.
 *   Study/Metrics       usavam o par "votado" do deck, apurado misturando formatos ('pt-BR|en-US' vs
 *                       'en|pt') como se fossem pares distintos.
 *
 * O resultado era o sintoma relatado: palavra em português com descrição em inglês (e vice-versa), e
 * verbete que "não existe" — porque procurávamos a palavra inglesa na seção portuguesa do dicionário.
 *
 * AS DUAS REGRAS DESTE MÓDULO:
 *
 *  1. **O idioma da palavra vem da FRASE de onde ela saiu, não da sessão.** Uma sessão bilíngue tem
 *     falas em dois idiomas; o idioma "da sessão" não significa nada para uma palavra específica.
 *
 *  2. **A direção da tradução é decidida pelo idioma DA PALAVRA.** Traduzir sempre `sessão.source →
 *     sessão.target` é o que mandava uma palavra inglesa para o MT declarada como portuguesa.
 *
 * NOTA SOBRE DETECÇÃO: nunca detectamos o idioma de uma palavra SOLTA. A heurística de `langDetect`
 * satura em ~0.11 de confiança para uma única palavra (o fator de amostra é `nº de palavras / 8`),
 * bem abaixo do limiar de override — ou seja, para palavra solta a detecção jamais venceria um rótulo
 * errado. Por isso o idioma vem do CONTEXTO. Sem contexto, o rótulo declarado prevalece, e dizemos
 * que a origem foi o rótulo (`langSource: 'declared'`) para a auditoria poder revisitar depois.
 */
import type { VocabWord } from '../types';
import { baseLang, mtCoverage, langLabel } from './languages';
import { resolveSpokenLang } from './spokenLang';
import type { LangConfig } from './langConfig';

/** De onde saiu o idioma que gravamos. Torna o rótulo AUDITÁVEL (ver a auditoria de idioma). */
export type LangSource = 'detected' | 'declared' | 'config' | 'unknown';

export interface WordOrigin {
  /** A palavra clicada. */
  word: string;
  /** A frase de onde ela saiu. É DAQUI que sai o idioma real — não da palavra. */
  context?: string;
  /** Idioma que os dados AFIRMAM para essa frase (`Sentence.lang`, `utterance.sourceLang`). Pode mentir. */
  declaredLang?: string;
  /** Configuração do usuário — último recurso, quando não há contexto nem rótulo. */
  config: LangConfig;
}

export interface ResolvedWord {
  word: string;
  /** ISO-639-1 REAL da palavra. '' = não sabemos (e a UI deve dizer isso, não chutar). */
  lang: string;
  /** ISO-639-1 para onde traduzir. Decidido pelo idioma da palavra. */
  targetLang: string;
  /** Como chegamos em `lang`. */
  langSource: LangSource;
  /** O par (`lang` → `targetLang`) tem motor? Permite avisar ANTES de o usuário esperar em vão. */
  coverage: ReturnType<typeof mtCoverage>;
  context?: string;
}

/**
 * Resolve o idioma da palavra e a direção da tradução.
 *
 * A escolha do alvo é a pergunta "o que o usuário quer entender?":
 *  • palavra no idioma que ele ESTUDA  → traduz para o idioma DELE;
 *  • palavra no idioma DELE            → traduz para o que ele estuda (é o caso de produzir, não de entender);
 *  • palavra num TERCEIRO idioma       → traduz para o idioma DELE (é o único que ele com certeza lê).
 */
export async function resolveWord(origin: WordOrigin): Promise<ResolvedWord> {
  const { word, context, declaredLang, config } = origin;

  const mine = baseLang(config.mine);
  const studying = baseLang(config.studying);
  const declared = baseLang(declaredLang || '');

  let lang = declared;
  let langSource: LangSource = declared ? 'declared' : 'unknown';

  // O contexto é o que permite detectar de verdade. Sem ele, ficamos com o rótulo.
  if (context && context.trim()) {
    const spoken = await resolveSpokenLang(context, declaredLang || '');
    if (spoken.lang) {
      lang = spoken.lang;
      langSource = spoken.source === 'detected' ? 'detected' : 'declared';
    }
  }

  // Nem rótulo, nem contexto: assumimos o idioma estudado — é a aposta menos absurda, mas é uma
  // aposta, e fica registrada como tal para a auditoria poder revisar.
  if (!lang) {
    lang = studying;
    langSource = 'config';
  }

  const targetLang = lang === mine ? studying : mine;

  return {
    word,
    lang,
    targetLang,
    langSource,
    coverage: mtCoverage(lang, targetLang),
    context: context?.trim() || undefined,
  };
}

/** O que o gateway precisa expor para traduzir. Mantém este módulo desacoplado do gateway concreto. */
export interface MtLike {
  translate(
    text: string,
    src: string | null,
    tgt: string,
  ): Promise<{ text: string; engine: string }>;
}

/**
 * Monta o `VocabWord` do painel: idioma certo, tradução na direção certa, motor declarado.
 *
 * Falha honesta: se não houver motor para o par (`coverage === 'unknown'`) ou a tradução estourar, a
 * palavra vem SEM tradução — e o painel diz o motivo, em vez de ficar em "traduzindo…" para sempre.
 */
export async function buildVocabWord(
  origin: WordOrigin,
  mt: MtLike,
): Promise<{ vocab: VocabWord; resolved: ResolvedWord }> {
  const resolved = await resolveWord(origin);

  const vocab: VocabWord = {
    word: resolved.word,
    translation: '',
    lang: resolved.lang || undefined,
    example: resolved.context,
  };

  if (resolved.coverage === 'unknown' || resolved.coverage === 'same') {
    return { vocab, resolved };
  }

  try {
    const { text, engine } = await mt.translate(resolved.word, resolved.lang, resolved.targetLang);
    if (text) {
      vocab.translation = text;
      vocab.mtEngine = engine;
    }
  } catch {
    /* sem tradução — honesto. Quem chama decide como mostrar o motivo. */
  }

  return { vocab, resolved };
}

/** Idiomas a gravar no cartão. Um lugar só, para os cinco produtores não divergirem de novo. */
export function cardLangs(resolved: ResolvedWord): { srcLang?: string; tgtLang?: string } {
  return {
    srcLang: resolved.lang || undefined,
    tgtLang: resolved.targetLang || undefined,
  };
}

/**
 * MOTIVO HONESTO de uma palavra ter ficado SEM tradução. Sem isto o painel exibia "traduzindo…"
 * para sempre — indistinguível de lentidão — porque o `catch` acima engole a falha do MT.
 * `null` = há tradução, não há o que explicar.
 *
 * Estava duplicado entre `Analysis.tsx:519` e `Reading.tsx:224` — e `Reading` é renderizado DENTRO
 * de `Analysis`, então as duas cópias coexistiam em memória. São strings de contrato com o
 * usuário: divergir sem ninguém notar era questão de tempo.
 */
export function mtNoteFor(resolved: ResolvedWord, translation: string): string | null {
  if (translation) return null;
  if (resolved.coverage === 'same') {
    return `A palavra já está em ${langLabel(resolved.lang)} — não há o que traduzir.`;
  }
  if (resolved.coverage === 'unknown') {
    return 'Não há motor de tradução para este par de idiomas.';
  }
  return 'A tradução automática falhou (o motor não respondeu). Tente de novo.';
}

export interface TokenDeTexto {
  original: string;
  clean: string;
  id: string;
}

/**
 * Fatia o texto em tokens com a forma "limpa" usada como chave de palavra.
 *
 * O `[^\p{L}]` NÃO é detalhe de estilo: as duas cópias anteriores usavam `[^a-zA-Z]`, que num app
 * de tradução multi-idioma descartava acento ("não" virava "no") e zerava alfabeto não-latino —
 * cirílico e grego viravam string vazia, e a palavra deixava de ser clicável. Era o mesmo bug
 * escrito duas vezes.
 */
export function tokenizarTexto(text: string): TokenDeTexto[] {
  return text.split(' ').map((w, index) => {
    const clean = w.replace(/[^\p{L}]/gu, '').toLowerCase();
    return { original: w, clean, id: `${index}-${clean}` };
  });
}
