import type { Lacuna, RefsDeMidia } from './tipos';

/**
 * ENTIDADES NOMEADAS COMUNS DE DECK (S10) — tabela PEQUENA e deliberada, não uma lib inteira.
 *
 * `limparCampo` só desfazia `&nbsp; &amp; &lt; &gt; &quot; &#39;` — as seis que apareciam nos
 * decks de teste. Qualquer baralho exportado de uma ferramenta que escapa acento (comum em CSV/
 * Anki-desktop antigo em certas locales) sobrevivia com `&eacute;`, `&rsquo;` etc. no meio da
 * palavra, e a régua de qualidade reprovava por ruído — de novo, culpando o dado pelo nosso
 * descuido. A lista é a de entidades NOMEADAS que decks de idioma realmente usam; o resto (a
 * imensa maioria dos acentos) já cai na decodificação NUMÉRICA genérica abaixo.
 */
const ENTIDADES_NOMEADAS: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ecirc: 'ê',
  ccedil: 'ç',
  ouml: 'ö',
  uuml: 'ü',
  auml: 'ä',
  szlig: 'ß',
  ntilde: 'ñ',
  aacute: 'á',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
};

/**
 * Decodifica entidades HTML de um campo: NUMÉRICAS (`&#39;`, `&#x27;`) de forma genérica, mais a
 * tabela pequena de NOMEADAS acima — inclusive as seis que `limparCampo` tratava uma a uma antes
 * (`nbsp amp lt gt quot #39`), agora cobertas por esta função só.
 */
function decodificarEntidadesDoCampo(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_all, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_all, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (all, nome: string) => ENTIDADES_NOMEADAS[nome.toLowerCase()] ?? all);
}

/**
 * Limpa o HTML que o Anki guarda no campo.
 *
 * Os campos vêm com marcação de verdade (`<b>`, `<br>`, `<div>`, `[sound:...]`, `<img>`). Jogar
 * isso num cartão de vocabulário produziria uma "palavra" com tags no meio — e a régua de
 * qualidade depois a reprovaria por ruído, o que seria culpar o dado pelo nosso descuido.
 */
export function limparCampo(bruto: string): string {
  const semTagsNemLacunas = (bruto ?? '')
    // Referências de mídia viram nada: não importamos os arquivos, então o marcador só atrapalha.
    .replace(/\[sound:[^\]]*\]/gi, ' ')
    .replace(/<img[^>]*>/gi, ' ')
    // Quebras viram espaço ANTES de as tags sumirem, senão "luz<br>claridade" vira "luzclaridade".
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(div|p|li|tr)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    /*
     * FURIGANA (S10): `漢字[かんじ]` é a notação padrão de decks de japonês — o Anki a exibe com
     * ruby text, mas em texto puro os colchetes sobram. `漢字[かんじ]` precisa virar `漢字`.
     *
     * A REGRA PRECISA DE ESCOPO: um colchete comum, tipo definição informal `"[informal]"` ou
     * gramática `"to run [away]"`, NÃO é furigana e não pode ser comido — cortaria conteúdo
     * legítimo do baralho. O que distingue os dois casos é o caractere IMEDIATAMENTE ANTES do `[`:
     * furigana sempre segue um caractere Han/Hiragana/Katakana (a "palavra base" que a leitura
     * anota); colchete de definição segue espaço, letra latina ou pontuação. Por isso o `$1` no
     * replace: o caractere-gatilho é capturado e devolvido, só o `[...]` some.
     *
     * Roda DEPOIS de `[sound:...]` já ter sido tratado acima — senão um som citado logo após um
     * caractere CJK (`猫[sound:cat.mp3]`) seria mordido por este regex também.
     */
    .replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\[[^\]]*\]/gu, '$1');

  /*
   * ENTIDADES POR ÚLTIMO, depois das tags terem sumido — não antes. Se `&lt;div&gt;` (HTML
   * ESCAPADO, texto literal que a nota queria mostrar) fosse decodificado ANTES da remoção de
   * tags, o `<div>` resultante seria confundido com uma tag de verdade e apagado pelo
   * `.replace(/<[^>]+>/g, '')` acima — corrompendo conteúdo que o próprio Anki preservava como
   * texto. `decodificarEntidadesDoCampo` cobre as numéricas (`&#39;`, `&#x27;`) e a tabela pequena
   * de nomeadas (ver `ENTIDADES_NOMEADAS`); ela sozinha já cobre as seis entidades que o código
   * tratava antes uma a uma.
   */
  return decodificarEntidadesDoCampo(semTagsNemLacunas).replace(/\s+/g, ' ').trim();
}

/** Desfaz as entidades HTML mais comuns num nome de arquivo de mídia. */
function decodificarEntidades(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

/**
 * EXTRAI as referências de mídia ANTES de `limparCampo` apagar o marcador.
 *
 * O DEFEITO QUE ISTO CONSERTA: `limparCampo` some com `[sound:x.mp3]` e `<img src=...>` porque o
 * ARQUIVO não é importado — mas o NOME sobrevivia em lugar nenhum. Um baralho de pronúncia que só
 * tem áudio nos campos (frente = palavra, verso = tradução, som só no campo `Audio`) perdia essa
 * referência silenciosamente: a nota virava texto puro sem ninguém saber que existia um arquivo.
 *
 * `<img>` aceita aspas simples, duplas e sem aspas — os três são HTML válido, e o Anki gera os
 * três dependendo da versão/plugin que escreveu o campo.
 */
export function extrairMidia(bruto: string): RefsDeMidia {
  const texto = bruto ?? '';
  const sons: string[] = [];
  const imagens: string[] = [];

  const reSom = /\[sound:([^\]]+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = reSom.exec(texto))) {
    const nome = decodificarEntidades(m[1].trim());
    if (nome && !sons.includes(nome)) sons.push(nome);
  }

  const reImg = /<img[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
  while ((m = reImg.exec(texto))) {
    const nome = decodificarEntidades((m[1] ?? m[2] ?? m[3] ?? '').trim());
    if (nome && !imagens.includes(nome)) imagens.push(nome);
  }

  return { sons, imagens };
}

/**
 * EXTRAI as lacunas de cloze e devolve o texto com elas substituídas pela resposta.
 *
 * `{{c1::resposta}}` ou `{{c1::resposta::dica}}` — a dica é o SEGUNDO `::`, não qualquer `::` no
 * meio da resposta, daí procurar só o primeiro `indexOf('::')` dentro do conteúdo já isolado por
 * `}}`, em vez de um regex com dois grupos opcionais (que teria uma ambiguidade de mínimo/máximo
 * bem mais fácil de acertar errado do que este split direto).
 *
 * SE ISTO NÃO RODASSE antes de `limparCampo`, `{{c1::...}}` cru vazaria para a tela: o campo
 * limpo hoje só tira HTML e `[sound:]`/`<img>`, não marcação de cloze.
 */
export function extrairCloze(bruto: string): { texto: string; lacunas: Lacuna[] } {
  const lacunas: Lacuna[] = [];
  const re = /\{\{c(\d+)::([\s\S]*?)\}\}/g;
  const texto = (bruto ?? '').replace(re, (_all, ord: string, conteudo: string) => {
    const i = conteudo.indexOf('::');
    const resposta = i >= 0 ? conteudo.slice(0, i) : conteudo;
    const dica = i >= 0 ? conteudo.slice(i + 2) : undefined;
    lacunas.push({ ordinal: Number(ord), resposta, dica });
    return resposta;
  });
  lacunas.sort((a, b) => a.ordinal - b.ordinal);
  return { texto, lacunas };
}

/** Limpa o campo já COM as lacunas de cloze resolvidas — a ordem importa (ver `extrairCloze`). */
export function limparELacunas(bruto: string): { texto: string; lacunas: Lacuna[] } {
  const { texto, lacunas } = extrairCloze(bruto ?? '');
  return { texto: limparCampo(texto), lacunas };
}
