/**
 * DICIONÁRIO LOCAL — as glosas que o app JÁ SERVE, consultadas antes de qualquer rede de tradução.
 *
 * POR QUE EXISTE. Tocar numa palavra da legenda mandava a palavra ao MT (opus-mt, nuvem, MyMemory)
 * mesmo quando a resposta já estava em `public/glosas/<xx>-pt.json` ou na trilha do inglês — arquivos
 * que o próprio app baixa para os jogos. Degrau M1 do harness adaptativo (§1.2): palavra solta se
 * responde com dicionário, a custo zero de rede e de IA.
 *
 * DE ONDE VEM O DADO, por par (praticado → nativo), decidido pelo índice embutido (`indice.json`):
 *   - trilha v2 (es, fr, it, de, …): `public/glosas/<xx>-<nativo>.json`, só o arquivo do par;
 *   - trilha v1 (en): a tradução mora na própria trilha (`public/trilha/en.json`) — usa o carregador
 *     da trilha, que já sabe recusar a glosa de outro par.
 * Par que o índice não lista não custa um 404: devolve `null` sem rede.
 *
 * CACHE: memória por sessão + Cache Storage entre sessões (mesmo padrão de `modelManifest.ts`),
 * com a versão da trilha na chave — regenerar o arquivo muda a versão e invalida o que ficou.
 * Sem `caches` (teste, contexto inseguro) cai no `fetch` simples, que o HTTP cache do CDN já cobre.
 *
 * O ARQUIVO É PREGUIÇOSO. Nada aqui baixa no import: só o primeiro toque num idioma baixa o pacote
 * dele — o orçamento do JS inicial (≤ 180 KB gzip) não vê glosa nenhuma.
 */
import { candidatosDeLema } from '../core/texto/lemas';
import { baseDoIdioma, indiceDaTrilha } from '../data/trilha/indice';

interface Pacote {
  /** chave (lema, como o gerador escreveu) → glosa no nativo. */
  glosas: Record<string, string>;
  /** Mesmas glosas indexadas em minúscula — o toque raramente acerta a caixa. */
  minusculas: Record<string, string>;
  /** forma(minúscula) → lema, quando o gerador emitiu (`--formas`). */
  formas?: Record<string, string>;
}

export interface AchadoLocal {
  glosa: string;
  /** O lema que casou — difere da palavra tocada quando veio de `formas` ou de regra. */
  lema: string;
}

/* v2: as glosas foram REGENERADAS com o Wikcionário (28/09) sem a trilha mudar — e a chave abaixo
   só leva a versão e o total da TRILHA, então o cache v1 continuaria servindo o arquivo antigo (com
   as glosas em escrita trocada). Regenerar glosas sem regenerar a trilha exige subir este nome. */
const NOME_DO_CACHE = 'babel-glosas-v2';
const CACHES_ANTIGOS = ['babel-glosas-v1'];
let antigosApagados = false;
const pacotes = new Map<string, Promise<Pacote | null>>();

/** Apaga, uma vez por página, os caches de glosas de nomes anteriores — espaço que ninguém lê mais. */
function apagarCachesAntigos(): void {
  if (antigosApagados || typeof caches === 'undefined') return;
  antigosApagados = true;
  for (const nome of CACHES_ANTIGOS) {
    caches.delete(nome).catch((erro: unknown) => {
      console.warn('[glosas] não foi possível apagar o cache antigo', nome, erro);
    });
  }
}

async function baixarJson(url: string, versao: string): Promise<unknown> {
  /* A chave leva a versão em query; o `fetch` vai à URL limpa (o CDN e o transporte de teste
     servem pela URL do arquivo). */
  const chave = `${url}?v=${encodeURIComponent(versao)}`;
  let cache: Cache | null = null;
  apagarCachesAntigos();
  try {
    if (typeof caches !== 'undefined') {
      cache = await caches.open(NOME_DO_CACHE);
      const guardado = await cache.match(chave);
      if (guardado) return await guardado.json();
    }
  } catch {
    cache = null; // Cache Storage indisponível (modo privado, cota): segue pela rede
  }
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    if (cache) {
      try {
        await cache.put(chave, r.clone());
      } catch {
        /* cota cheia: o dado ainda serve agora */
      }
    }
    return await r.json();
  } catch {
    return null; // offline e sem cache: o toque segue para o próximo degrau
  }
}

const emMinusculas = (g: Record<string, string>): Record<string, string> => {
  const m: Record<string, string> = {};
  for (const [k, v] of Object.entries(g)) {
    const chave = k.toLowerCase();
    if (!(chave in m)) m[chave] = v;
  }
  return m;
};

interface ArquivoV2 {
  glosas?: Record<string, string>;
  formas?: Record<string, string>;
}
interface TrilhaV1 {
  versao?: unknown;
  niveis?: Record<string, Array<[string, string?]>>;
}

async function montarPacote(idioma: string, nativo: string): Promise<Pacote | null> {
  const entrada = indiceDaTrilha()[idioma];
  if (!entrada || !(entrada.glosas ?? []).includes(nativo)) return null;
  const versao = `${entrada.versao}-${entrada.total}`;

  let glosas: Record<string, string> = {};
  let formas: Record<string, string> | undefined;
  if (entrada.versao >= 2) {
    const arq = (await baixarJson(`/glosas/${idioma}-${nativo}.json`, versao)) as ArquivoV2 | null;
    if (!arq?.glosas) return null;
    glosas = arq.glosas;
    formas = arq.formas;
  } else {
    // v1: a trilha traz `[palavra, tradução, frase?]`; o índice já garantiu que a tradução é deste par.
    const trilha = (await baixarJson(`/trilha/${idioma}.json`, versao)) as TrilhaV1 | null;
    for (const lista of Object.values(trilha?.niveis ?? {})) {
      for (const [palavra, traducao] of lista ?? []) {
        if (palavra && traducao && !(palavra in glosas)) glosas[palavra] = traducao;
      }
    }
    if (!Object.keys(glosas).length) return null;
  }
  return { glosas, minusculas: emMinusculas(glosas), formas };
}

function pacoteDe(lang: string, alvo: string): Promise<Pacote | null> {
  const chave = `${baseDoIdioma(lang)}-${baseDoIdioma(alvo)}`;
  let p = pacotes.get(chave);
  if (!p) {
    p = montarPacote(baseDoIdioma(lang), baseDoIdioma(alvo));
    // Falha não fica em cache: offline agora não condena o idioma pela sessão inteira.
    p.then(
      (r) => {
        if (!r) pacotes.delete(chave);
      },
      () => pacotes.delete(chave),
    );
    pacotes.set(chave, p);
  }
  return p;
}

/** Há pacote local para o par? Síncrono, sem rede — lê só o índice embutido. */
export function temDicionarioLocal(lang: string, alvo: string): boolean {
  return (indiceDaTrilha()[baseDoIdioma(lang)]?.glosas ?? []).includes(baseDoIdioma(alvo));
}

/**
 * A glosa local da palavra tocada, ou `null`. Tenta os candidatos de `candidatosDeLema` em ordem e
 * para no primeiro que o pacote conhece. `aceita` filtra dado ruim do dump (ver `glosaServe`).
 */
export async function glosaLocal(
  palavra: string,
  lang: string,
  alvo: string,
  aceita: (glosa: string) => boolean = () => true,
): Promise<AchadoLocal | null> {
  if (!temDicionarioLocal(lang, alvo)) return null;
  const pacote = await pacoteDe(lang, alvo);
  if (!pacote) return null;
  for (const c of candidatosDeLema(palavra, lang, pacote.formas)) {
    const glosa = pacote.glosas[c] ?? pacote.minusculas[c.toLowerCase()];
    if (glosa && aceita(glosa)) return { glosa, lema: c };
  }
  return null;
}
