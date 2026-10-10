/**
 * AS IMAGENS DA FOLHA DA PALAVRA — os critérios, sem rede.
 *
 * O QUE ESTAVA ERRADO (relato do dono, 10/10/2026): a folha buscava a palavra crua no Openverse e
 * mostrava o PRIMEIRO resultado. O Openverse é uma busca de texto livre sobre títulos e etiquetas de
 * acervos (Flickr, Wikimedia, bibliotecas): para "concordado" o primeiro resultado era a capa de um
 * livro de 1615 ("Proverbios morales… concordados por el Maestro…"), que só tem a palavra no título.
 * Uma imagem só, e errada, ensina errado.
 *
 * O QUE VALE AGORA, em uma frase: a imagem precisa ter sido ESCOLHIDA POR ALGUÉM para ilustrar a
 * palavra. Quem escolhe é o editor do Wikcionário, que põe a figura dentro do verbete, ao lado do
 * sentido que ela mostra. A busca livre nunca decide sozinha: ela só completa a galeria de uma
 * palavra que o dicionário já ilustrou, e só com imagem cujo TÍTULO é a própria palavra.
 *
 * Aqui ficam as decisões puras (testadas com respostas gravadas em `tests/fixtures/imagens-da-palavra`):
 *  - `lemaDoVerbete`: "particípio do verbo concordar" → `concordar` (o verbete já diz);
 *  - `temSubstantivo`: a classe gramatical, lida dos títulos do verbete;
 *  - `figurasDoVerbete`: os arquivos que o verbete mostra como figura (ícones de 14 px ficam fora);
 *  - `motivoDeRecusa`: o filtro (capa de livro, página digitalizada, logotipo, partitura, mapa…);
 *  - `tituloEhOTermo`: a régua da busca livre;
 *  - `escolherImagens`: ordem, sem repetidas, teto de 4.
 * A rede mora em `imagensDaPalavra.ts`.
 */
import { chaveDaPalavra, dobrarTexto } from '../../core/texto/palavra';
import type { DictionarySense } from '../dictionary';

/** Quantas imagens a folha mostra: a principal e até três miniaturas. */
export const TETO_DE_IMAGENS = 4;

/** De onde a imagem veio: do verbete (escolhida por um editor) ou da busca livre (só complemento). */
export type FonteDaImagem = 'verbete' | 'busca';

/** Uma imagem pronta para a folha, com tudo o que a atribuição precisa. */
export interface ImagemDaPalavra {
  id: string;
  /** A imagem em tamanho de tela (cerca de 640 px de largura). */
  url: string;
  titulo: string;
  autor?: string;
  /** "CC BY-SA 4.0", "Domínio público"… Ausente = a fonte não informou; o link diz. */
  licenca?: string;
  /** A página da imagem no acervo, com autor, licença e condições: é o "verificar" da atribuição. */
  pagina?: string;
  /** O acervo: "Wikimedia Commons", "Flickr"… */
  acervo: string;
  fonte: FonteDaImagem;
}

/** Uma candidata como a rede a devolve, antes do filtro. */
export interface Candidata extends ImagemDaPalavra {
  largura?: number;
  altura?: number;
  /** `image/svg+xml`, `image/jpeg`… ou a extensão, quando é só o que a fonte dá. */
  tipo?: string;
  /** Categorias do acervo (Wikimedia) e etiquetas (Openverse), tudo junto. */
  marcas?: string[];
  /** A fonte marcou como conteúdo adulto. */
  adulto?: boolean;
}

// ─────────────────────────────── o lema (a forma de dicionário) ───────────────────────────────

/* As definições de FORMA FLEXIONADA são frases feitas, e é isso que permite lê-las sem adivinhar:
   o Wikcionário em português escreve "particípio do verbo concordar", "plural de cachorro"; o
   inglês, "past participle of concordar", "present participle and gerund of run", "plural of apple".
   A palavra depois do "de/of" é o lema. Uma definição comum ("a type of apple") não tem a palavra
   gramatical antes do "of", e uma definição longa não é forma de nada. */
const FORMA_EM_PORTUGUES = [
  /\bdo verbo ([\p{L}-]+)\s*[.;:]?$/iu,
  /^(?:forma\s+)?(?:feminin[oa]|masculin[oa]|plural|singular|aumentativo|diminutivo|superlativo)[\p{L}\s]{0,40}?\s(?:de|do|da)\s([\p{L}-]+)\s*[.;:]?$/iu,
];
const FORMA_EM_INGLES =
  /\b(?:participle|gerund|plural|singular|indicative|subjunctive|imperative|tense|past|inflection|form|comparative|superlative|feminine|masculine|diminutive|augmentative)\b[^.;()]{0,40}?\sof\s([\p{L}'’-]+)\s*[.;:]?$/iu;
const TAMANHO_DE_FORMA = 110;

/**
 * O lema que o verbete aponta, ou `null` quando a palavra já é a forma de dicionário.
 *
 * Só a PRIMEIRA definição conta: "banco" tem, lá no fim do verbete inglês, "first-person singular
 * present indicative of bancar", mas é antes de tudo um substantivo; trocar a busca por "bancar"
 * seria errar a palavra inteira por causa do último sentido.
 */
export function lemaDoVerbete(sentidos: DictionarySense[], palavra: string): string | null {
  const primeira = sentidos[0]?.definition.trim();
  if (!primeira || primeira.length > TAMANHO_DE_FORMA) return null;
  const achado =
    FORMA_EM_PORTUGUES.map((r) => r.exec(primeira)?.[1]).find(Boolean) ?? FORMA_EM_INGLES.exec(primeira)?.[1];
  if (!achado || chaveDaPalavra(achado) === chaveDaPalavra(palavra)) return null;
  return achado;
}

// ─────────────────────────────── a classe gramatical ───────────────────────────────

/* O título da classe vem no idioma do wiki. "Forma de substantivo" e "Locução substantiva" contam;
   "Forma verbal", "Participle", "Conjunção" não. */
const SUBSTANTIVO =
  /^(?:forma de )?(?:substantiv|noun|proper noun|sustantiv|sostantiv|nom(?: commun| propre)?$)|locução substantiva/i;

/** O verbete tem pelo menos um sentido de substantivo? É o que libera a busca livre. */
export function temSubstantivo(sentidos: DictionarySense[]): boolean {
  return sentidos.some((s) => SUBSTANTIVO.test(s.partOfSpeech.trim()));
}

// ─────────────────────────────── as figuras do verbete ───────────────────────────────

/** Abaixo disto, na página, a figura é ícone (cadeado de 8 px, logo da Wikipédia de 14 px). */
const LARGURA_DE_FIGURA = 100;

/**
 * Os arquivos que a seção do verbete mostra como FIGURA, na ordem em que aparecem (que é a ordem
 * dos sentidos). Devolve o título canônico (`File:Red Apple.jpg`), que é o que a API de imagens aceita
 * em qualquer wiki; o prefixo local ("Ficheiro:", "Imagem:") é trocado.
 */
export function figurasDoVerbete(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const titulos: string[] = [];
  for (const a of Array.from(doc.querySelectorAll('a.mw-file-description'))) {
    const img = a.querySelector('img');
    const href = a.getAttribute('href') ?? '';
    const nome = /\/wiki\/[^:/]+:(.+)$/.exec(href)?.[1];
    if (!img || !nome) continue;
    if (Number(img.getAttribute('width') ?? 0) < LARGURA_DE_FIGURA) continue;
    let limpo: string;
    try {
      limpo = decodeURIComponent(nome);
    } catch {
      continue;
    }
    const titulo = `File:${limpo.replace(/_/g, ' ')}`;
    if (!titulos.includes(titulo)) titulos.push(titulo);
  }
  return titulos;
}

// ─────────────────────────────── o filtro ───────────────────────────────

/* O QUE NÃO ILUSTRA UMA PALAVRA. Cada linha saiu de um caso visto nas respostas gravadas:
   a capa de livro de "concordado" (título de ficha de biblioteca, acervo "Fondo Antiguo de la
   Biblioteca…"), o cadeado e o logo da Wikipédia dentro do verbete de "apple" e "run", o diagrama
   de escada em SVG e a meia-calça de 402 × 1054 de "run", o anúncio e o infográfico de "banco". */
const TITULO_DE_DOCUMENTO =
  /\b(?:logo|logotipo|icon|ícone|icone|mapa?|maps|book|livro|libro|cover|capa|title ?page|frontisp\w+|page|página|pagina|folio|manuscri\w+|partitura|sheet music|score|poster|cartaz|advertis\w+|anúncio|anuncio|publicit\w+|screenshot|infogra\w+|diagram\w*|chart|gráfico|typograph\w+|tipograf\w+|document\w*|newspaper|jornal|stamp|selo|coat of arms|brasão|bandeira|flag|banner)\b/iu;
const MARCA_DE_DOCUMENTO =
  /\b(?:logos?|icons?|trademarks?|title pages|book covers|books|scans|scanned|manuscripts?|sheet music|maps?|diagrams?|svg|documents?|typography|typographie|publicit[eé]|pub|infograf\w+|flags?|coats of arms)\b/iu;
const ENFEITE_DE_PAGINA = /\b(?:logos?|icons?|trademarks?)\b/i;
const ACERVO_DE_DOCUMENTO = /bibliot|librar|archiv|arquivo|fondo antiguo|book images|museum|museo|museu/i;
const TIPO_RECUSADO = /svg|pdf|djvu|tiff?|gif|ogg|ogv|webm|wav/i;
/* Título de FICHA: longo, com as barras e os pontos e vírgulas de uma referência bibliográfica. */
const TAMANHO_DE_FICHA = 70;

/** Menor lado aceito: abaixo disto a imagem esticada na folha vira um borrão. */
const LADO_MINIMO = 200;
/** Mais alta que isto é página, cartaz ou tira; mais larga é faixa ou panorâmica. */
const ALTA_DEMAIS = 1.9;
const LARGA_DEMAIS = 2.6;

/** Por que esta candidata NÃO serve, ou `null` quando ela passa. O motivo é para o teste e o registro. */
export function motivoDeRecusa(c: Candidata): string | null {
  if (!c.url) return 'sem endereço';
  if (c.adulto) return 'conteúdo adulto';
  if (c.tipo && TIPO_RECUSADO.test(c.tipo)) return 'tipo de arquivo';
  if (/\.(?:svg|pdf|djvu|tiff?|gif)(?:$|[?/])/i.test(c.url)) return 'tipo de arquivo';
  if (c.largura && c.altura) {
    if (Math.min(c.largura, c.altura) < LADO_MINIMO) return 'pequena demais';
    if (c.altura / c.largura > ALTA_DEMAIS) return 'proporção de página';
    if (c.largura / c.altura > LARGA_DEMAIS) return 'proporção de faixa';
  }
  /* A figura do VERBETE foi posta ali por um editor: um mapa no verbete de um país ou um livro no
     verbete de "livro" são a ilustração certa. Dela só saem os enfeites da página (logos e ícones). */
  if (c.fonte === 'verbete') {
    return c.marcas?.some((m) => ENFEITE_DE_PAGINA.test(m)) ? 'enfeite da página' : null;
  }
  if (TITULO_DE_DOCUMENTO.test(c.titulo)) return 'título de documento';
  if (c.marcas?.some((m) => MARCA_DE_DOCUMENTO.test(m))) return 'categoria de documento';
  if (c.titulo.length > TAMANHO_DE_FICHA) return 'título de ficha';
  if (c.autor && ACERVO_DE_DOCUMENTO.test(c.autor)) return 'acervo de documentos';
  return null;
}

// ─────────────────────────────── a régua da busca livre ───────────────────────────────

/**
 * O título da imagem É o termo? "Cachorros 2", "Apple.", "running" valem; "Piggy Bank", "Apple Logo",
 * "Praia do Cachorro" não. É a régua mais dura que o Openverse permite: ele não sabe o ASSUNTO da
 * foto, só o título e as etiquetas que o autor escreveu, e a palavra no meio de um título é
 * exatamente como a capa do livro entrou.
 */
export function tituloEhOTermo(titulo: string, termos: string[]): boolean {
  const limpo = dobrarTexto(titulo, { espacos: 'colapsar' })
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!limpo || limpo.includes(' ')) return false;
  return termos.some((t) => {
    const termo = chaveDaPalavra(t);
    return !!termo && (limpo === termo || limpo === `${termo}s` || limpo === `${termo}es`);
  });
}

// ─────────────────────────────── a escolha ───────────────────────────────

/* A mesma foto chega por dois caminhos (o verbete e a busca apontam o mesmo arquivo do Commons) e o
   mesmo autor publica a série inteira com o mesmo título ("Cachorros", "Cachorros 2"). */
function chaveDoArquivo(url: string): string {
  const caminho = url.split(/[?#]/)[0].replace(/\/+$/, '');
  const nome = caminho.split('/').pop() ?? '';
  // A miniatura do Openverse termina em `/<id>/thumb`: ali o nome do arquivo não diz nada.
  if (!/\.\w{3,4}$/.test(nome)) return caminho.toLowerCase();
  let limpo = nome;
  try {
    limpo = decodeURIComponent(nome);
  } catch {
    /* nome com % solto: compara como veio */
  }
  return limpo.replace(/^\d+px-/, '').toLowerCase();
}
const chaveDaSerie = (c: Candidata) => `${chaveDaPalavra(c.autor)}|${chaveDaPalavra(c.titulo.replace(/\d+/g, ''))}`;

/** Filtra, tira as repetidas e corta no teto. A ordem de entrada é a ordem de preferência. */
export function escolherImagens(candidatas: Candidata[], teto = TETO_DE_IMAGENS): ImagemDaPalavra[] {
  const arquivos = new Set<string>();
  const series = new Set<string>();
  const escolhidas: ImagemDaPalavra[] = [];
  for (const c of candidatas) {
    if (escolhidas.length >= teto) break;
    if (motivoDeRecusa(c)) continue;
    const arquivo = chaveDoArquivo(c.url);
    const serie = chaveDaSerie(c);
    if (arquivos.has(arquivo) || (c.autor && series.has(serie))) continue;
    arquivos.add(arquivo);
    series.add(serie);
    escolhidas.push({
      id: c.id,
      url: c.url,
      titulo: c.titulo,
      autor: c.autor,
      licenca: c.licenca,
      pagina: c.pagina,
      acervo: c.acervo,
      fonte: c.fonte,
    });
  }
  return escolhidas;
}
