/**
 * TRADUÇÃO DE PALAVRA SOLTA — a escada do toque, do mais barato ao mais caro.
 *
 *   1. dicionário LOCAL (`dicionarioLocal.ts`): forma → lema → glosa do pacote que o app já serve.
 *      Zero rede depois do primeiro toque no idioma, zero IA.
 *   2. WIKTIONARY ao vivo (`dictionary.ts`): o mesmo verbete que o painel já busca para mostrar os
 *      sentidos — cacheado e deduplicado por (palavra, idioma), então não é pedido novo. Só serve
 *      quando o wiki define NO idioma de destino (pt.wiktionary para quem lê português).
 *   3. MT (`gateway.mt`): só se os dois falharem. Era o PRIMEIRO passo antes (harness §1.2, M1).
 *
 * O resultado diz qual degrau respondeu (`fonte`) e o id que vai para `VocabWord.mtEngine` — a
 * interface rotula a procedência e a telemetria conta quantos toques deixaram de ir ao MT.
 *
 * As fontes são injetáveis: o teste prova a ordem sem rede, e prova que glosa local NÃO chama MT.
 */
import { type AchadoLocal, glosaLocal } from './dicionarioLocal';
import { type DictionaryResult, lookup } from './dictionary';

export type FonteDaPalavra = 'dicionario-local' | 'wiktionary' | 'mt';

export interface PalavraTraduzida {
  texto: string;
  fonte: FonteDaPalavra;
  /** Id gravado em `VocabWord.mtEngine`: o próprio degrau, ou o motor de MT que respondeu. */
  motor: string;
  /** Lema que casou no dicionário local, quando houve. */
  lema?: string;
}

export interface FontesDaPalavra {
  local?: (palavra: string, lang: string, alvo: string) => Promise<AchadoLocal | null>;
  wiktionary?: (palavra: string, lang: string, alvo: string) => Promise<string | null>;
}

interface MtDePalavra {
  translate(text: string, src: string | null, tgt: string): Promise<{ text: string; engine: string }>;
}

/** Escritas não latinas: glosa com letra delas não serve a destino latino. */
const DESTINO_LATINO = new Set(['pt', 'en', 'es', 'fr', 'it', 'de', 'nl', 'sv', 'pl', 'tr', 'ca', 'gl', 'ro', 'da', 'nb', 'fi', 'cs', 'hu', 'id', 'vi']);

/**
 * A glosa serve como resposta? Filtro de DADO RUIM, não de gosto: o Wikidata tem lexemas
 * "portugueses" em escrita árabe (aljamiado) e eles vazaram para os pacotes — `casa` saía como
 * `كَاجَ`. Mostrar isso como tradução é pior do que cair no próximo degrau.
 */
export function glosaServe(glosa: string, alvo: string): boolean {
  const g = glosa.trim();
  if (!g || g.length > 60) return false;
  if (DESTINO_LATINO.has(alvo.toLowerCase().split('-')[0])) {
    // Toda LETRA precisa ser latina; número, espaço, barra e pontuação passam.
    return !/(?!\p{Script=Latin})\p{L}/u.test(g);
  }
  return true;
}

/** O verbete fala SOBRE a palavra ("plural de dog") em vez de traduzi-la. Mesma régua do gerador. */
const METALINGUAGEM = /^(?:o |a )?(?:feminino|masculino|plural|singular|diminutivo|aumentativo|superlativo|particípio|gerúndio|forma|flexão|variante|grafia|sinônimo|antônimo|abreviação|abreviatura)\b/i;

/**
 * Do verbete do Wiktionary, a tradução curta — ou `null`. Só quando o wiki definiu no idioma de
 * destino: uma definição inglesa não é "tradução para português", é outro texto para ler.
 * Primeira acepção, sem rótulos entre parênteses no início, cortada na primeira vírgula.
 */
export function glosaDoVerbete(r: DictionaryResult | null, alvo: string): string | null {
  if (!r || r.status !== 'found') return null;
  if (r.entry.glossLang !== alvo.toLowerCase().split('-')[0]) return null;
  const def = r.entry.senses[0]?.definition ?? '';
  const curta = def
    .replace(/^(?:\s*\([^)]*\))+\s*/u, '')
    .split(/[,;(]/)[0]
    .replace(/[\s.:·]+$/u, '')
    .trim();
  if (!curta || curta.length > 40 || METALINGUAGEM.test(curta)) return null;
  return glosaServe(curta, alvo) ? curta : null;
}

/** Teto do Wiktionary: acima disto o toque espera à toa; o MT responde e o verbete chega depois. */
const TETO_DO_WIKTIONARY_MS = 2500;

const FONTES_PADRAO: Required<FontesDaPalavra> = {
  local: (palavra, lang, alvo) => glosaLocal(palavra, lang, alvo, (g) => glosaServe(g, alvo)),
  wiktionary: async (palavra, lang, alvo) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const teto = new Promise<null>((ok) => { timer = setTimeout(() => ok(null), TETO_DO_WIKTIONARY_MS); });
    try {
      return glosaDoVerbete(await Promise.race([lookup(palavra, lang), teto]), alvo);
    } finally {
      clearTimeout(timer);
    }
  },
};

async function tentar<T>(f: (() => Promise<T | null>) | undefined): Promise<T | null> {
  if (!f) return null;
  try {
    return await f();
  } catch {
    return null; // um degrau que estoura não derruba a escada
  }
}

/**
 * Traduz UMA palavra de `lang` para `alvo`. `mt = null` quando o par não tem motor: os degraus de
 * dicionário ainda podem responder. `null` = ninguém respondeu (a UI diz o motivo, não inventa).
 */
export async function traduzirPalavraSolta(
  palavra: string,
  lang: string,
  alvo: string,
  mt: MtDePalavra | null,
  fontes: FontesDaPalavra = FONTES_PADRAO,
): Promise<PalavraTraduzida | null> {
  const f = { ...FONTES_PADRAO, ...fontes };

  const local = await tentar(() => f.local(palavra, lang, alvo));
  if (local) return { texto: local.glosa, fonte: 'dicionario-local', motor: 'dicionario-local', lema: local.lema };

  const wiki = await tentar(() => f.wiktionary(palavra, lang, alvo));
  if (wiki) return { texto: wiki, fonte: 'wiktionary', motor: 'wiktionary' };

  if (!mt) return null;
  const r = await tentar(() => mt.translate(palavra, lang, alvo));
  return r?.text ? { texto: r.text, fonte: 'mt', motor: r.engine } : null;
}
