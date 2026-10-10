/**
 * AS IMAGENS DA FOLHA DA PALAVRA — a busca (os critérios estão em `criterios.ts`).
 *
 * O CAMINHO, na ordem, e cada passo só acontece se o anterior não bastou:
 *
 *  1. O VERBETE DA PALAVRA no Wikcionário (a seção do idioma dela), no wiki do idioma, no inglês e
 *     no da interface. São os mesmos pedidos que o dicionário da folha já faz (`secaoDoVerbete`
 *     guarda a promessa), então este passo quase sempre sai de graça. Dele vêm as figuras, a classe
 *     gramatical e o LEMA ("particípio do verbo concordar").
 *  2. O VERBETE DO LEMA, quando a palavra é forma flexionada e o verbete dela não tem figura:
 *     "running" não tem imagem, "run" tem a corredora.
 *  3. O VERBETE DA TRADUÇÃO, quando nem a palavra nem o lema têm figura: "cadeira" não tem, "chair"
 *     tem. No máximo duas: a tradução pode ter sentidos que a palavra não tem.
 *  4. A BUSCA LIVRE (Openverse), só para COMPLETAR: a palavra precisa ser substantivo, já ter pelo
 *     menos uma figura de verbete, e a imagem precisa ter a palavra como título inteiro.
 *
 * QUANDO NÃO MOSTRAR NADA: quando os passos 1 a 3 não acham nenhuma figura que passe no filtro.
 * Nenhum editor de dicionário ilustrou a palavra, o lema nem a tradução: é o caso de "concordado",
 * "although", "saudade". A lista volta vazia e a folha fecha a coluna da imagem.
 *
 * SEM SERVIÇO NOVO: o Wikcionário (`*.wiktionary.org`, já na CSP por causa do dicionário) e o
 * Openverse, pelo proxy de sempre. As figuras do Wikcionário moram no Wikimedia Commons; os dados
 * delas (autor, licença, miniatura) saem da API do próprio Wikcionário, que enxerga o Commons.
 */
import { buscarImagensLivres, type ImageResult } from '../../data/rotas/imagens';
import { extractSenses, secaoDoVerbete } from '../dictionary';
import { idiomaDaInterface } from '../i18n';
import { baseLang } from '../languages';
import {
  type Candidata,
  escolherImagens,
  figurasDoVerbete,
  type ImagemDaPalavra,
  lemaDoVerbete,
  temSubstantivo,
  TETO_DE_IMAGENS,
  tituloEhOTermo,
} from './criterios';

export interface PedidoDeImagens {
  palavra: string;
  /** O idioma DA PALAVRA (o da frase de onde ela saiu). */
  idioma: string;
  /**
   * A tradução, pronta ou como pedir. Só é usada (e só então pedida) se os verbetes da palavra e do
   * lema não têm figura: quem chama não paga uma tradução para a maioria das palavras.
   */
  traducao?: string | null | (() => Promise<string | null | undefined>);
  /** Em que idioma a tradução está. Sem ele não há como achar a seção do verbete dela. */
  idiomaDaTraducao?: string;
}

/** Quanto esperar pela tradução (o tradutor local pode estar baixando o modelo) antes de seguir sem ela. */
const ESPERA_DA_TRADUCAO_MS = 4000;
/** O teto da busca inteira. Passou disto, a folha fica sem imagem em vez de girar para sempre. */
const TETO_DA_BUSCA_MS = 15_000;
/** Quantas figuras do verbete da TRADUÇÃO entram: ela pode ter sentidos que a palavra não tem. */
const FIGURAS_DA_TRADUCAO = 2;
/** Quantos arquivos pedir de uma vez à API de imagens (o resto do verbete não cabe na folha mesmo). */
const ARQUIVOS_POR_PEDIDO = 8;

const HOST_DAS_IMAGENS = 'en.wiktionary.org';
const LARGURA_NA_FOLHA = 640;

interface Verbete {
  /** O wiki tem a seção deste idioma nesta página. */
  achado: boolean;
  figuras: string[];
  lema: string | null;
  substantivo: boolean;
}
const SEM_VERBETE: Verbete = { achado: false, figuras: [], lema: null, substantivo: false };

/** A marca de que a rede falhou em algum passo: resultado vazio com falha não vai para o cache. */
interface Corrida {
  falhou: boolean;
}

async function lerVerbete(wiki: string, pagina: string, idioma: string, corrida: Corrida): Promise<Verbete> {
  try {
    const secao = await secaoDoVerbete(wiki, pagina, idioma);
    if (!secao) return SEM_VERBETE;
    const sentidos = extractSenses(secao.html);
    return {
      achado: true,
      figuras: figurasDoVerbete(secao.html),
      lema: lemaDoVerbete(sentidos, pagina),
      substantivo: temSubstantivo(sentidos),
    };
  } catch {
    corrida.falhou = true;
    return SEM_VERBETE;
  }
}

/** Texto de um campo que a API devolve em HTML ("<a href=…>Diliff</a>"). */
function semMarcacao(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const texto = (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').replace(/\s+/g, ' ').trim();
  return texto ? texto.slice(0, 80) : undefined;
}

interface PaginaDeArquivo {
  title?: string;
  imageinfo?: Array<{
    url?: string;
    thumburl?: string;
    descriptionurl?: string;
    width?: number;
    height?: number;
    mime?: string;
    extmetadata?: Record<string, { value?: string } | undefined>;
  }>;
}

/** Autor, licença, tamanho e miniatura dos arquivos, num pedido só, na ordem em que foram pedidos. */
async function dadosDosArquivos(titulos: string[], corrida: Corrida): Promise<Candidata[]> {
  if (!titulos.length) return [];
  const parametros = [
    'action=query',
    `titles=${encodeURIComponent(titulos.join('|'))}`,
    'prop=imageinfo',
    'iiprop=url|size|mime|extmetadata',
    `iiurlwidth=${LARGURA_NA_FOLHA}`,
    'iiextmetadatafilter=LicenseShortName|Artist|Categories',
    /* Resposta que não muda de hora em hora: com isto ela fica no cache da Wikimedia e do navegador,
       e reabrir a mesma palavra em outra sessão não gasta pedido. */
    'maxage=86400',
    'smaxage=86400',
    'formatversion=2',
    'format=json',
    'origin=*',
  ].join('&');
  let paginas: PaginaDeArquivo[];
  try {
    const res = await fetch(`https://${HOST_DAS_IMAGENS}/w/api.php?${parametros}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    paginas = ((await res.json()) as { query?: { pages?: PaginaDeArquivo[] } }).query?.pages ?? [];
  } catch {
    corrida.falhou = true;
    return [];
  }
  const candidatas: Candidata[] = [];
  for (const titulo of titulos) {
    const pagina = paginas.find((p) => p.title === titulo);
    const info = pagina?.imageinfo?.[0];
    const url = info?.thumburl ?? info?.url;
    if (!info || !url) continue;
    candidatas.push({
      id: titulo,
      url,
      titulo: titulo.replace(/^File:/, '').replace(/\.\w+$/, ''),
      autor: semMarcacao(info.extmetadata?.Artist?.value),
      licenca: semMarcacao(info.extmetadata?.LicenseShortName?.value),
      pagina: info.descriptionurl,
      acervo: 'Wikimedia Commons',
      fonte: 'verbete',
      largura: info.width,
      altura: info.height,
      tipo: info.mime,
      marcas: (info.extmetadata?.Categories?.value ?? '').split('|').filter(Boolean),
    });
  }
  return candidatas;
}

const ACERVOS: Record<string, string> = { flickr: 'Flickr', wikimedia: 'Wikimedia Commons' };

function licencaDoOpenverse(r: ImageResult): string | undefined {
  if (!r.license) return undefined;
  if (r.license === 'pdm') return 'Domínio público';
  if (r.license === 'cc0') return 'CC0';
  return `CC ${r.license.toUpperCase()}${r.licenseVersion ? ` ${r.licenseVersion}` : ''}`;
}

/** Um resultado da busca livre como candidata. A miniatura do Openverse serve a folha: o original pode ter 5 MB. */
export function candidataDaBusca(r: ImageResult): Candidata {
  return {
    id: `busca:${r.id}`,
    url: r.thumbnail || r.url,
    titulo: r.title ?? '',
    autor: r.creator || undefined,
    licenca: licencaDoOpenverse(r),
    pagina: r.landingUrl,
    acervo: ACERVOS[r.source ?? ''] ?? r.source ?? 'Openverse',
    fonte: 'busca',
    largura: r.width,
    altura: r.height,
    tipo: r.filetype,
    marcas: r.tags,
  };
}

/** A tradução vale como consulta só quando é UMA palavra: "to agree with" não é título de verbete. */
function termoDaTraducao(traducao: string | null | undefined): string | null {
  const limpa = (traducao ?? '').trim().replace(/[.!?…]+$/, '');
  if (!limpa || /\s/.test(limpa)) return null;
  return limpa.toLowerCase();
}

function comTeto<T>(promessa: Promise<T>, ms: number, senao: T): Promise<T> {
  return Promise.race([promessa, new Promise<T>((r) => setTimeout(() => r(senao), ms))]);
}

async function buscar(pedido: PedidoDeImagens, corrida: Corrida): Promise<ImagemDaPalavra[]> {
  let palavra = pedido.palavra.trim();
  const idioma = baseLang(pedido.idioma);

  // 1) O verbete da palavra. Três wikis, em paralelo: quase sempre os que o dicionário já pediu.
  const wikis = [idioma, 'en', baseLang(idiomaDaInterface())].filter((w, i, a) => w && a.indexOf(w) === i);
  let daPalavra = await Promise.all(wikis.map((w) => lerVerbete(w, palavra, idioma, corrida)));
  /* "Although" no começo da frase: o título do verbete diferencia maiúscula de minúscula, e a página
     é "although". Só depois de não achar como veio, para não trocar o "Haus" do alemão por "haus". */
  if (!daPalavra.some((v) => v.achado) && palavra !== palavra.toLowerCase()) {
    palavra = palavra.toLowerCase();
    daPalavra = await Promise.all(wikis.map((w) => lerVerbete(w, palavra, idioma, corrida)));
  }
  let figuras = daPalavra.flatMap((v) => v.figuras);
  let substantivo = daPalavra.some((v) => v.substantivo);
  const lema = daPalavra.find((v) => v.lema)?.lema ?? null;

  // 2) O verbete do lema, no wiki inglês (o que ilustra os verbetes; o português quase nunca).
  if (!figuras.length && lema) {
    const doLema = await lerVerbete('en', lema, idioma, corrida);
    figuras = doLema.figuras;
    substantivo ||= doLema.substantivo;
  }

  // 3) O verbete da tradução.
  if (!figuras.length && pedido.traducao && pedido.idiomaDaTraducao) {
    const pedida = typeof pedido.traducao === 'function' ? pedido.traducao().catch(() => null) : pedido.traducao;
    const traducao = termoDaTraducao(await comTeto(Promise.resolve(pedida), ESPERA_DA_TRADUCAO_MS, null));
    const idiomaDela = baseLang(pedido.idiomaDaTraducao);
    if (traducao && idiomaDela && idiomaDela !== idioma) {
      figuras = (await lerVerbete('en', traducao, idiomaDela, corrida)).figuras.slice(0, FIGURAS_DA_TRADUCAO);
    }
  }

  const figurasUnicas = figuras.filter((f, i, a) => a.indexOf(f) === i).slice(0, ARQUIVOS_POR_PEDIDO);
  const doVerbete = await dadosDosArquivos(figurasUnicas, corrida);
  const escolhidas = escolherImagens(doVerbete);

  // O CRITÉRIO DE NÃO MOSTRAR: sem figura de verbete, não há imagem. A busca livre não decide sozinha.
  if (!escolhidas.length) return [];

  // 4) A busca livre só completa a galeria de um substantivo que o dicionário já ilustrou.
  if (escolhidas.length >= TETO_DE_IMAGENS || !substantivo) return escolhidas;
  const termos = lema ? [palavra, lema] : [palavra];
  const livres = (await buscarImagensLivres(lema ?? palavra).catch(() => []))
    .map(candidataDaBusca)
    .filter((c) => tituloEhOTermo(c.titulo, termos));
  return escolherImagens([...doVerbete, ...livres]);
}

/* Cache por palavra, como o do dicionário (`lookup`): o resultado e a busca em andamento. Reabrir a
   mesma palavra, ou abri-la em duas telas, não repete pedido. */
const guardadas = new Map<string, Promise<ImagemDaPalavra[]>>();
const TETO_DO_CACHE = 300;

/**
 * As imagens que ilustram a palavra: de zero a quatro, a melhor primeiro. Nunca rejeita: sem rede,
 * sem verbete ou sem figura, a resposta é a lista vazia, e a folha fecha a coluna.
 */
export function buscarImagensDaPalavra(pedido: PedidoDeImagens): Promise<ImagemDaPalavra[]> {
  const palavra = pedido.palavra.trim();
  const idioma = baseLang(pedido.idioma);
  if (!palavra || !idioma) return Promise.resolve([]);

  const chave = `${idioma}|${baseLang(idiomaDaInterface())}|${palavra.toLowerCase()}`;
  const guardada = guardadas.get(chave);
  if (guardada) return guardada;

  const corrida: Corrida = { falhou: false };
  const busca = comTeto<ImagemDaPalavra[] | null>(
    buscar(pedido, corrida).catch(() => {
      corrida.falhou = true;
      return [];
    }),
    TETO_DA_BUSCA_MS,
    null,
  ).then((imagens) => {
    // Vazio por falha (ou por demora) não é resposta: a próxima abertura tenta de novo.
    if (imagens === null || (corrida.falhou && !imagens.length)) guardadas.delete(chave);
    return imagens ?? [];
  });

  if (guardadas.size >= TETO_DO_CACHE) guardadas.delete(guardadas.keys().next().value as string);
  guardadas.set(chave, busca);
  return busca;
}
