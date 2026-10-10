/**
 * DETECÇÃO DE IDIOMA POR TEXTO, heurística e síncrona — mora no núcleo para servir ao navegador
 * (fallback do detector nativo em `lib/langDetect.ts`) e ao REPARO de dados antigos, que roda no
 * modo anônimo (IndexedDB) e no servidor sem o detector do navegador.
 *
 * Script Unicode decide sozinho (CJK, cirílico, árabe…); no alfabeto latino, palavras-função e
 * diacríticos pontuam. `null` = sem sinal: quem chama NUNCA chuta um idioma.
 */
export interface DeteccaoDeTexto {
  /** ISO-639-1. */
  lang: string
  /** 0..1 — pontuação normalizada (margem sobre o 2º lugar × tamanho da amostra), não probabilidade. */
  confidence: number
  method: 'heuristic'
}

// ───────────────────────── 2. Heurística (fallback) ─────────────────────────

/** Idiomas com script próprio: um único match de faixa Unicode já é decisivo. */
const SCRIPT_RANGES: Array<{ lang: string; re: RegExp }> = [
  { lang: 'ja', re: /[぀-ゟ゠-ヿ]/ },          // kana (decisivo p/ japonês)
  { lang: 'ko', re: /[가-힯ᄀ-ᇿ]/ },          // hangul
  { lang: 'zh', re: /[一-鿿]/ },                        // han (sem kana → chinês)
  { lang: 'ru', re: /[Ѐ-ӿ]/ },                        // cirílico (ru/uk, desambiguado abaixo)
  { lang: 'ar', re: /[؀-ۿ]/ },
  { lang: 'he', re: /[֐-׿]/ },
  { lang: 'el', re: /[Ͱ-Ͽ]/ },
  { lang: 'hi', re: /[ऀ-ॿ]/ },
  { lang: 'th', re: /[฀-๿]/ },
];

/**
 * Palavras-função de alta frequência — o sinal mais barato e robusto p/ alfabeto latino.
 *
 * COBERTURA: precisa acompanhar a lista de `languages.ts`. Faltavam sv, da, nb, fi, hu, cs, ro, ca e
 * gl — para esses, um texto em alfabeto latino não produzia sinal nenhum e `detectHeuristic` devolvia
 * `null`, ou seja, o rótulo declarado (potencialmente errado) vencia sempre. Idiomas de script
 * próprio (ja, ko, zh, ru, uk, ar, he, el, hi, th) são resolvidos por `SCRIPT_RANGES` e não precisam
 * de lista.
 */
const STOPWORDS: Record<string, string[]> = {
  pt: ['de', 'que', 'não', 'para', 'com', 'uma', 'os', 'as', 'do', 'da', 'em', 'você', 'é', 'mais', 'mas', 'como', 'está', 'isso', 'muito', 'também'],
  /* O inglês tinha só palavras longas: faltavam justamente as mais frequentes ("I", "to", "it", "is",
     "of", "we"). Sem elas, "I want to buy a car" pontuava só no tcheco ("a", "to") e saía como tcheco
     — o relato de "inglês classificado como tcheco". Ficam de fora as que são palavra comum em
     idioma vizinho ("a", "in", "on", "me", "my"): entrariam como ruído no português e no polonês. */
  en: ['the', 'and', 'that', 'for', 'with', 'you', 'this', 'have', 'not', 'are', 'was', 'but', 'they', 'from', 'what', 'about', 'would', 'there', 'their', 'which',
    'i', 'to', 'it', 'is', 'of', 'we', 'am', 'so', 'want', 'need', "i'm", "it's", "don't"],
  es: ['de', 'que', 'no', 'para', 'con', 'una', 'los', 'las', 'del', 'en', 'es', 'más', 'pero', 'como', 'está', 'esto', 'muy', 'también', 'por', 'su'],
  fr: ['de', 'que', 'ne', 'pour', 'avec', 'une', 'les', 'des', 'du', 'est', 'pas', 'plus', 'mais', 'comme', 'cette', 'dans', 'vous', 'nous', 'sur', 'ce'],
  it: ['di', 'che', 'non', 'per', 'con', 'una', 'gli', 'del', 'della', 'è', 'più', 'ma', 'come', 'questo', 'sono', 'nel', 'anche', 'sono', 'alla', 'si'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'für', 'mit', 'ein', 'eine', 'auf', 'auch', 'aber', 'wie', 'sich', 'den', 'dem', 'von', 'zu', 'es'],
  nl: ['de', 'het', 'een', 'en', 'is', 'niet', 'voor', 'met', 'op', 'dat', 'die', 'van', 'te', 'zijn', 'maar', 'ook', 'aan', 'er', 'als', 'wordt'],
  pl: ['nie', 'się', 'jest', 'że', 'na', 'do', 'to', 'jak', 'ale', 'przez', 'oraz', 'tego', 'jego', 'przy', 'czy', 'już', 'tylko', 'bardzo', 'może', 'gdy'],
  tr: ['bir', 'bu', 'için', 'çok', 've', 'ile', 'daha', 'değil', 'olarak', 'gibi', 'kadar', 'sonra', 'ancak', 'her', 'ne', 'var', 'olan', 'ben', 'sen', 'biz'],
  id: ['yang', 'dan', 'di', 'untuk', 'dengan', 'tidak', 'ini', 'itu', 'dari', 'akan', 'pada', 'adalah', 'saya', 'kami', 'juga', 'bisa', 'sudah', 'atau', 'ke', 'ada'],
  vi: ['của', 'và', 'là', 'có', 'không', 'được', 'trong', 'người', 'những', 'cho', 'một', 'này', 'với', 'các', 'đã', 'khi', 'để', 'ra', 'thì', 'nhưng'],
  sv: ['och', 'att', 'det', 'som', 'för', 'inte', 'med', 'har', 'den', 'till', 'är', 'på', 'av', 'men', 'jag', 'vi', 'kan', 'om', 'ett', 'från'],
  da: ['og', 'at', 'det', 'som', 'for', 'ikke', 'med', 'har', 'den', 'til', 'er', 'på', 'af', 'men', 'jeg', 'vi', 'kan', 'om', 'et', 'fra'],
  nb: ['og', 'å', 'det', 'som', 'for', 'ikke', 'med', 'har', 'den', 'til', 'er', 'på', 'av', 'men', 'jeg', 'vi', 'kan', 'om', 'et', 'fra'],
  fi: ['ja', 'on', 'ei', 'että', 'se', 'ovat', 'mutta', 'kuin', 'niin', 'myös', 'vain', 'kun', 'jos', 'hän', 'me', 'te', 'joka', 'tai', 'voi', 'olla'],
  hu: ['és', 'hogy', 'nem', 'egy', 'az', 'is', 'de', 'meg', 'van', 'csak', 'már', 'még', 'ha', 'volt', 'ez', 'vagy', 'mint', 'lehet', 'itt', 'nagyon'],
  cs: ['a', 'že', 'se', 'na', 'je', 'to', 'v', 'ale', 'jako', 'který', 'jsem', 'jsou', 'byl', 'nebo', 'když', 'jen', 'tak', 'však', 'může', 'více'],
  ro: ['și', 'că', 'nu', 'de', 'pentru', 'cu', 'este', 'sunt', 'dar', 'care', 'din', 'la', 'un', 'o', 'mai', 'ca', 'sau', 'când', 'foarte', 'așa'],
  ca: ['i', 'que', 'no', 'per', 'amb', 'una', 'els', 'les', 'del', 'és', 'més', 'però', 'com', 'aquest', 'també', 'seva', 'ha', 'molt', 'fer', 'quan'],
  gl: ['e', 'que', 'non', 'para', 'con', 'unha', 'os', 'as', 'do', 'da', 'é', 'máis', 'pero', 'como', 'tamén', 'seu', 'moi', 'cando', 'ou', 'polo'],
};

/** Marcas diacríticas que separam idiomas latinos parecidos. */
const DIACRITIC_HINTS: Array<{ lang: string; re: RegExp; weight: number }> = [
  { lang: 'pt', re: /[ãõáâàêéíóôúç]/i, weight: 1.5 },
  { lang: 'es', re: /[ñ¿¡áéíóúü]/i, weight: 1.5 },
  { lang: 'fr', re: /[àâçèéêëîïôùûüœ]/i, weight: 1.2 },
  { lang: 'de', re: /[äöüß]/i, weight: 2 },
  { lang: 'pl', re: /[ąćęłńóśźż]/i, weight: 2 },
  { lang: 'tr', re: /[çğıöşü]/i, weight: 1.5 },
  { lang: 'ro', re: /[ăâîșț]/i, weight: 2 },
  { lang: 'cs', re: /[áčďéěíňóřšťúůýž]/i, weight: 2 },
  { lang: 'vi', re: /[ăâđêôơư]/i, weight: 2 },
  // Escandinavos: as palavras-função são quase idênticas entre sv/da/nb (og·och, ikke, til…), então
  // o desempate vem daqui — sueco escreve ä/ö; dinamarquês e norueguês escrevem æ/ø.
  { lang: 'sv', re: /[äö]/i, weight: 1.5 },
  { lang: 'da', re: /[æø]/i, weight: 1.2 },
  { lang: 'nb', re: /[æø]/i, weight: 1.2 },
  { lang: 'fi', re: /[äö]/i, weight: 0.8 },
  { lang: 'hu', re: /[őű]/i, weight: 2.5 },
  { lang: 'ca', re: /·|[àèéíïòóúüç]/i, weight: 1 },
  { lang: 'gl', re: /[áéíóúñx]/i, weight: 0.5 },
];

/** Abaixo disto, as letras de outra escrita são um nome ou uma citação, e não o idioma da frase. */
const PARTE_MINIMA_DA_ESCRITA = 0.4;

export function detectarIdiomaPorTexto(text: string): DeteccaoDeTexto | null {
  const raw = (text || '').trim();
  if (raw.length < 2) return null;

  /* Script próprio → decisivo, QUANDO É A ESCRITA DA FRASE. Bastava UM caractere: a tradução para o
     português que citava um nome chinês ("Meu nome é 王伟…") saía como chinês com 0,95, e a conferência
     da tradução a rejeitava como "não traduziu" (`validaTraducao.ts`). Agora a escrita precisa ser
     uma parte de verdade das letras do texto; abaixo disso, quem decide são as palavras latinas. */
  const letras = raw.match(/\p{L}/gu) ?? [];
  const parte = (re: RegExp) => letras.filter((c) => re.test(c)).length / (letras.length || 1);
  const hasKana = /[぀-ゟ゠-ヿ]/.test(raw);
  for (const { lang, re } of SCRIPT_RANGES) {
    if (!re.test(raw)) continue;
    if (lang === 'zh' && hasKana) continue; // texto com kana é japonês, não chinês
    // Japonês mistura kana e han: as duas contam para a parte japonesa da frase.
    const doScript = lang === 'ja' ? parte(re) + parte(/[一-鿿]/) : parte(re);
    if (doScript < PARTE_MINIMA_DA_ESCRITA) continue;
    // ru vs uk: caracteres exclusivos do ucraniano.
    if (lang === 'ru' && /[іїєґ]/i.test(raw)) return { lang: 'uk', confidence: 0.9, method: 'heuristic' as const };
    return { lang, confidence: 0.95, method: 'heuristic' as const };
  }

  // Alfabeto latino → pontua por palavras-função + diacríticos.
  const words = raw.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  if (!words.length) return null;

  const scores: Record<string, number> = {};
  for (const [lang, list] of Object.entries(STOPWORDS)) {
    const set = new Set(list);
    let hits = 0;
    for (const w of words) if (set.has(w)) hits++;
    if (hits) scores[lang] = (scores[lang] ?? 0) + hits;
  }
  for (const { lang, re, weight } of DIACRITIC_HINTS) {
    if (re.test(raw)) scores[lang] = (scores[lang] ?? 0) + weight;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null; // nenhum sinal → não inventamos idioma

  const [lang, top] = ranked[0];
  const second = ranked[1]?.[1] ?? 0;
  // Confiança = quão destacado está o 1º lugar, moderado pelo tamanho da amostra.
  const margin = top / (top + second || 1);
  const sample = Math.min(1, words.length / 8);
  const confidence = Math.max(0.2, Math.min(0.9, margin * sample));
  return { lang, confidence, method: 'heuristic' as const };
}
