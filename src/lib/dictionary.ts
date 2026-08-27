import { baseLang } from './languages';

/**
 * DICIONÁRIO REAL — cliente do Wiktionary (Wikimedia), multi-wiki.
 *
 * REGRA INEGOCIÁVEL: quando não há verbete — ou o verbete não traz o dado — devolvemos `not-found` /
 * campo ausente. NUNCA um palpite. "Não encontramos" é uma resposta válida; inventar não é.
 *
 * ─────────────────────────── O QUE ESTAVA ERRADO (e por quê) ───────────────────────────
 *
 * 1) **Tudo era consultado no `en.wiktionary`.** Ele tem verbete de quase todos os idiomas — mas
 *    define tudo EM INGLÊS. O usuário clicava numa palavra francesa e recebia a glosa em inglês, num
 *    bloco rotulado apenas "Dicionário". Era o sintoma "palavra em português com descrição em inglês".
 *
 * 2) **O IPA só funcionava para inglês (e alemão).** A extração casava o template LITERAL
 *    `{{IPA|xx|/…/}}` no **wikitext**. Só que a maioria das línguas usa templates AUTO-GERADORES
 *    (`{{fr-IPA}}`, `{{es-pr}}`, `{{pt-IPA}}`, `{{ru-IPA}}`, `{{ja-pron}}`…): o IPA é produzido por
 *    módulo Lua na RENDERIZAÇÃO e **não existe no wikitext**. Resultado: `undefined` silencioso em
 *    ~26 dos 28 idiomas, e o painel simplesmente omitia a fonética sem dizer por quê.
 *
 * ─────────────────────────── A SOLUÇÃO (uma só, genérica) ───────────────────────────
 *
 * Ler o **HTML RENDERIZADO** (`action=parse&prop=text`) em vez do wikitext, e aplicá-lo a uma CADEIA
 * DE WIKIS. Um único parser resolve os dois problemas de uma vez:
 *
 *  • **Definição na língua certa** — o `pt.wiktionary` define EM PORTUGUÊS; o `fr.wiktionary`, em
 *    francês. Tentamos, em ordem: o wiki do idioma do USUÁRIO → o wiki do idioma DA PALAVRA → o
 *    `en.wiktionary` (que é o de maior cobertura). O verbete sempre diz de qual wiki veio e em que
 *    língua a definição está escrita (`glossLang`) — o usuário nunca é pego de surpresa lendo inglês.
 *
 *  • **IPA em todos os idiomas** — os templates Lua não expõem IPA no wikitext, mas renderizam
 *    `<span class="IPA">` no HTML. Ler o HTML resolve os ~26 idiomas que falhavam, **sem uma regra
 *    por idioma**.
 *
 * DESAMBIGUAÇÃO: num wiktionary, cada idioma é uma SEÇÃO da mesma página ("die" tem seção inglesa e
 * seção alemã). Localizamos a seção do idioma pedido pelo título — daí os mapas de nome abaixo. Se a
 * seção não existe, o verbete "não existe naquele idioma", e nunca servimos a acepção de outra língua.
 */

// ───────────────────── Nomes de idioma POR WIKI (é assim que achamos a seção) ─────────────────────
//
// O título da seção de um idioma vem escrito no idioma DO WIKI: no `en.wiktionary` a seção do francês
// se chama "French"; no `pt.wiktionary`, "Francês"; no `fr.wiktionary`, "Français". Sem estes mapas
// não há como localizar a seção — e é o que permite trocar de wiki sem uma regra por idioma.

/** Nome do idioma EM INGLÊS (seções do en.wiktionary). */
const NAME_EN: Record<string, string> = {
  pt: 'Portuguese', en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  nl: 'Dutch', ru: 'Russian', pl: 'Polish', uk: 'Ukrainian', tr: 'Turkish', sv: 'Swedish',
  da: 'Danish', nb: 'Norwegian Bokmål', fi: 'Finnish', cs: 'Czech', el: 'Greek', ro: 'Romanian',
  hu: 'Hungarian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', hi: 'Hindi', ar: 'Arabic',
  he: 'Hebrew', id: 'Indonesian', vi: 'Vietnamese', th: 'Thai', ca: 'Catalan', gl: 'Galician',
};

/** Nome do idioma EM PORTUGUÊS (seções do pt.wiktionary). */
const NAME_PT: Record<string, string> = {
  pt: 'Português', en: 'Inglês', es: 'Espanhol', fr: 'Francês', de: 'Alemão', it: 'Italiano',
  nl: 'Neerlandês', ru: 'Russo', pl: 'Polonês', uk: 'Ucraniano', tr: 'Turco', sv: 'Sueco',
  da: 'Dinamarquês', nb: 'Norueguês', fi: 'Finlandês', cs: 'Tcheco', el: 'Grego', ro: 'Romeno',
  hu: 'Húngaro', ja: 'Japonês', ko: 'Coreano', zh: 'Chinês', hi: 'Híndi', ar: 'Árabe',
  he: 'Hebraico', id: 'Indonésio', vi: 'Vietnamita', th: 'Tailandês', ca: 'Catalão', gl: 'Galego',
};

/** Nome do idioma NELE MESMO (seção da própria língua no wiki dela). */
const NAME_SELF: Record<string, string> = {
  pt: 'Português', en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano',
  nl: 'Nederlands', ru: 'Русский', pl: 'Polski', uk: 'Українська', tr: 'Türkçe', sv: 'Svenska',
  da: 'Dansk', nb: 'Norsk', fi: 'Suomi', cs: 'Čeština', el: 'Ελληνικά', ro: 'Română',
  hu: 'Magyar', ja: '日本語', ko: '한국어', zh: '漢語', hi: 'हिन्दी', ar: 'العربية',
  he: 'עברית', id: 'Bahasa Indonesia', vi: 'Tiếng Việt', th: 'ไทย', ca: 'Català', gl: 'Galego',
};

/** Como se chama, no wiki `wikiLang`, a seção do idioma `wordLang`. `undefined` = não sabemos. */
function sectionName(wikiLang: string, wordLang: string): string | undefined {
  if (wikiLang === 'en') return NAME_EN[wordLang];
  if (wikiLang === 'pt') return NAME_PT[wordLang];
  if (wikiLang === wordLang) return NAME_SELF[wordLang];
  return undefined; // wiki de terceira língua: não temos o mapa, e não vamos adivinhar o título
}

interface DictionarySense {
  partOfSpeech: string;
  definition: string;
  examples: string[];
}

interface DictionaryEntry {
  word: string;
  /** Código curto do idioma DA PALAVRA (ex.: 'fr'). */
  lang: string;
  /** IPA REAL do verbete. `undefined` = o verbete não traz — e a UI diz isso, não inventa. */
  ipa?: string;
  /**
   * De onde veio a FONÉTICA — pode ser um wiki diferente do que deu a definição. Na prática só o
   * en.wiktionary publica IPA em marcação legível, então uma definição em português costuma vir
   * acompanhada de um IPA do wiki inglês. Procedência separada porque as fontes são separadas.
   */
  ipaSource?: { wiki: string; url: string };
  senses: DictionarySense[];
  /**
   * Idioma em que as DEFINIÇÕES estão escritas. Pode diferir de `lang`: uma palavra francesa definida
   * pelo en.wiktionary tem `lang: 'fr'` e `glossLang: 'en'`. A UI precisa avisar quando não for 'pt'.
   */
  glossLang: string;
  source: {
    name: 'Wiktionary';
    /** Qual wiki respondeu ('pt.wiktionary.org', 'fr.wiktionary.org', 'en.wiktionary.org'). */
    wiki: string;
    url: string;
    license: 'CC BY-SA 4.0';
  };
}

/** Erros de rede/CORS não podem virar "palavra não encontrada": são estados diferentes. */
export type DictionaryResult =
  | { status: 'found'; entry: DictionaryEntry }
  | { status: 'not-found'; word: string; sourceUrl: string }
  | { status: 'error'; message: string };

const cache = new Map<string, DictionaryResult>();
const inflight = new Map<string, Promise<DictionaryResult>>();

/** Idioma da interface. Hoje a app é pt-BR; fica isolado aqui para não virar literal espalhado. */
const UI_LANG = 'pt';

function wikiHost(lang: string): string {
  return `${lang}.wiktionary.org`;
}

function pageUrl(host: string, word: string, anchor?: string): string {
  const base = `https://${host}/wiki/${encodeURIComponent(word)}`;
  // Âncora da seção do idioma: numa página com dezenas de línguas, cair no topo é inútil.
  return anchor ? `${base}#${encodeURIComponent(anchor.replace(/ /g, '_'))}` : base;
}

/** Comparação de títulos tolerante a acento/caixa/espaço — os títulos vêm do HTML, não de nós. */
function sameHeading(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return norm(a) === norm(b);
}

// ───────────────────────────── O parser (um só, para todos os wikis) ─────────────────────────────
//
// COMO LOCALIZAMOS A SEÇÃO DO IDIOMA — e por que NÃO olhamos o nível do cabeçalho.
// Cada wiki estrutura os títulos do seu jeito: no `en` e no `fr` o idioma é um `<h2>` (e a classe
// gramatical, `<h3>`); no `pt` o idioma é `<h1>` e a classe gramatical é que é `<h2>`. Adivinhar o
// nível por wiki seria frágil e quebraria de novo no próximo wiki. Em vez disso usamos a **API de
// seções**: pedimos a lista (`prop=sections`), achamos a seção pelo NOME, e buscamos só ela
// (`section=<índice>`). Nenhuma suposição sobre marcação — funciona igual em qualquer wiktionary.

async function wikiApi(host: string, params: string): Promise<any> {
  const res = await fetch(`https://${host}/w/api.php?${params}&formatversion=2&format=json&origin=*`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** O `line` de uma seção vem com HTML dentro (`<span><span>Português</span></span>`). */
function headingText(line: string): string {
  return line.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** Índice da seção do idioma pedido. `null` = a página não tem verbete NESTE idioma. */
async function sectionIndex(host: string, word: string, heading: string): Promise<string | null> {
  const json = await wikiApi(host, `action=parse&page=${encodeURIComponent(word)}&prop=sections`);
  const sections: Array<{ index: string; line: string }> = json?.parse?.sections ?? [];
  const hit = sections.find(s => sameHeading(headingText(s.line || ''), heading));
  return hit ? String(hit.index) : null;
}

/**
 * IPA REAL da seção. É AQUI que os ~26 idiomas voltam a funcionar: os templates Lua (`{{fr-IPA}}`,
 * `{{ja-pron}}`…) não escrevem IPA no wikitext, mas renderizam `<span class="IPA">` no HTML.
 *
 * Recortar a seção do idioma é OBRIGATÓRIO, não um detalhe: uma varredura na página inteira devolvia
 * a fonética da língua errada — em `casa`, a inglesa (/ˈkɑːsə/) em vez da portuguesa (/ˈka.zɐ/).
 */
function extractIpa(section: HTMLElement): string | undefined {
  for (const s of Array.from(section.querySelectorAll('span.IPA'))) {
    const t = (s.textContent || '').trim();
    // Só transcrição fonética/fonêmica de verdade: /…/ ou […]. Descarta respelling e ruído.
    if (/^[/[].+[/\]]$/.test(t)) return t;
  }
  return undefined;
}

/**
 * Definições: os `<li>` das listas ORDENADAS (`<ol>`). A restrição a `<ol>` não é estética — as
 * seções de Pronúncia e Etimologia usam `<ul>`, e ler qualquer `<li>` fazia "(Belgium, France)
 * IPA(key): /ʃjɛ̃/" aparecer como se fosse a definição de *chien*.
 */
function extractSenses(html: string): DictionarySense[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('.mw-editsection, style, script').forEach(n => n.remove());

  const senses: DictionarySense[] = [];
  let pos = '';

  for (const el of Array.from(doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, ol'))) {
    if (el.tagName !== 'OL') {
      const text = (el.textContent || '').trim();
      if (text) pos = text; // subtítulo corrente (Substantivo / Verb / Nom…)
      continue;
    }
    for (const li of Array.from(el.children).filter(c => c.tagName === 'LI')) {
      const clone = li.cloneNode(true) as HTMLElement;
      // Exemplos e subacepções vivem em listas aninhadas: separá-los do texto da definição.
      const nested = Array.from(clone.querySelectorAll('ul, ol, dl'));
      const examples = nested
        .map(n => (n.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(t => t.length > 1);
      nested.forEach(n => n.remove());

      const definition = (clone.textContent || '').replace(/\s+/g, ' ').trim();
      if (definition) senses.push({ partOfSpeech: pos, definition, examples });
    }
  }
  return senses;
}

interface WikiHit {
  html: string;
  heading: string;
  host: string;
  wikiLang: string;
}

/** Busca a seção do idioma num wiki. `null` = aquele wiki não tem verbete deste idioma. */
async function fetchSection(
  host: string,
  wikiLang: string,
  word: string,
  wordLang: string,
): Promise<WikiHit | null> {
  const heading = sectionName(wikiLang, wordLang);
  if (!heading) return null; // sem mapa do nome da seção, não temos como localizar, e não chutamos

  const index = await sectionIndex(host, word, heading);
  if (index === null) return null;

  const json = await wikiApi(
    host,
    `action=parse&page=${encodeURIComponent(word)}&section=${encodeURIComponent(index)}&prop=text`,
  );
  const html: string | undefined = json?.parse?.text;
  return typeof html === 'string' ? { html, heading, host, wikiLang } : null;
}

/**
 * A cadeia de wikis, em ordem de preferência:
 *   1. o wiki do idioma DO USUÁRIO → definição EM PORTUGUÊS (era isto que faltava);
 *   2. o wiki do idioma DA PALAVRA → definição na própria língua estudada (legítimo e útil);
 *   3. `en.wiktionary`             → a maior cobertura do mundo, mas define em inglês.
 */
function wikiChain(wordLang: string): Array<{ host: string; lang: string }> {
  const langs = [UI_LANG, wordLang, 'en'].filter((l, i, a) => l && a.indexOf(l) === i);
  return langs.map(l => ({ host: wikiHost(l), lang: l }));
}

async function lookupUncached(word: string, lang: string): Promise<DictionaryResult> {
  const term = word.trim();
  let networkFailed = false;

  // ── 1) DEFINIÇÕES: o primeiro wiki da cadeia que tiver o verbete neste idioma.
  let hit: WikiHit | null = null;
  let senses: DictionarySense[] = [];

  for (const { host, lang: wikiLang } of wikiChain(lang)) {
    try {
      const found = await fetchSection(host, wikiLang, term, lang);
      if (!found) continue;
      const parsed = extractSenses(found.html);
      if (parsed.length === 0) continue;
      hit = found;
      senses = parsed;
      break;
    } catch {
      // Rede/CORS caiu NESTE wiki. Segue a cadeia, mas lembra — para não reportar "não encontramos"
      // quando na verdade não conseguimos nem perguntar. São estados diferentes.
      networkFailed = true;
    }
  }

  if (!hit) {
    if (networkFailed) {
      return {
        status: 'error',
        message: 'Não foi possível consultar o Wiktionary (sem conexão?). Tente de novo.',
      };
    }
    return { status: 'not-found', word: term, sourceUrl: pageUrl(wikiHost('en'), term, NAME_EN[lang]) };
  }

  // ── 2) FONÉTICA: fonte INDEPENDENTE da definição.
  // Só o en.wiktionary publica IPA em marcação legível (`span.IPA`); o pt e o fr, na prática, não têm
  // nenhum. Se buscássemos a fonética apenas no wiki que deu a definição, escolher o pt (que é o que
  // queremos, pela glosa em português) nos custaria o IPA — trocaríamos um acerto por uma perda.
  let ipa = extractIpa(new DOMParser().parseFromString(hit.html, 'text/html').body);
  let ipaSource = ipa ? { wiki: hit.host, url: pageUrl(hit.host, term, hit.heading) } : undefined;

  if (!ipa && hit.host !== wikiHost('en')) {
    try {
      const en = await fetchSection(wikiHost('en'), 'en', term, lang);
      if (en) {
        ipa = extractIpa(new DOMParser().parseFromString(en.html, 'text/html').body);
        if (ipa) ipaSource = { wiki: en.host, url: pageUrl(en.host, term, en.heading) };
      }
    } catch {
      /* sem IPA — o verbete ainda vale pelas definições, e a UI diz que a fonética não veio */
    }
  }

  return {
    status: 'found',
    entry: {
      word: term,
      lang,
      ipa,
      ipaSource,
      senses,
      glossLang: hit.wikiLang,
      source: {
        name: 'Wiktionary',
        wiki: hit.host,
        url: pageUrl(hit.host, term, hit.heading),
        license: 'CC BY-SA 4.0',
      },
    },
  };
}

/**
 * Consulta o verbete. Cacheado por (palavra, idioma) e à prova de chamadas concorrentes — o painel
 * de vocabulário dispara isto a cada clique em palavra.
 */
export async function lookup(word: string, lang: string): Promise<DictionaryResult> {
  const l = baseLang(lang);
  const term = word.trim();
  if (!term || !l) return { status: 'error', message: 'Palavra ou idioma ausente.' };

  const key = `${l}:${term.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const pending = inflight.get(key);
  if (pending) return pending;

  const p = lookupUncached(term, l)
    .then(result => {
      // Erros de rede NÃO entram no cache: seria condenar a palavra a falhar para sempre.
      if (result.status !== 'error') cache.set(key, result);
      return result;
    })
    .finally(() => { inflight.delete(key); });

  inflight.set(key, p);
  return p;
}

/**
 * Link para a pronúncia HUMANA (Forvo).
 *
 * Sem `toLowerCase()`: ele quebrava toda língua em que a caixa é significativa — o substantivo alemão
 * `Haus` virava `/word/haus`, que é outra entrada (ou nenhuma).
 */
export function forvoUrl(word: string, lang: string): string {
  return `https://forvo.com/word/${encodeURIComponent(word.trim())}/#${baseLang(lang)}`;
}

/** Link direto ao verbete — já ancorado na seção do idioma, para não cair no topo de uma página enorme. */
export function wiktionaryUrl(word: string, lang?: string): string {
  const l = baseLang(lang || '');
  const anchor = l ? NAME_EN[l] : undefined;
  return pageUrl(wikiHost('en'), word.trim(), anchor);
}
