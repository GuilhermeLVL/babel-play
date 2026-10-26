/**
 * AS EXPORTAÇÕES DAS ANOTAÇÕES (L2, §5 da spec) — todas puras, geradas no navegador, grátis.
 *
 *  · JSON no modelo W3C Web Annotation (`@context` oficial), para portabilidade;
 *  · Markdown por capítulo (citação em bloco, nota, link `frasy://livro/<id>#<cfi>`), para Notion/Obsidian;
 *  · CSV do Anki (frente: a palavra ou o trecho; verso: tradução/nota; extra: a frase de contexto e a
 *    fonte), com o cabeçalho de diretivas que o Anki 2.1.55+ lê (`#separator`, `#html`, `#columns`).
 *
 * Os RÓTULOS vêm de quem chama (o núcleo não traduz): a tela passa o texto pelo `t()`.
 */
import { type AnotacaoDeLeitura, anotacoesVivas, type CorDeAnotacao, type TipoDeAnotacao } from './anotacao';

export const CONTEXTO_W3C = 'http://www.w3.org/ns/anno.jsonld';
/** O `conformsTo` do seletor de fragmento de um EPUB CFI (W3C Web Annotation, §4.2.1). */
export const CFI_CONFORMS_TO = 'http://www.idpf.org/epub/linking/cfi/epub-cfi.html';

export interface LivroDaExportacao {
  id: string;
  titulo: string;
  autor?: string;
  /** Crédito da fonte ("Standard Ebooks", "arquivo trazido por você"…). */
  fonte?: string;
}

/** O endereço do livro dentro do Frasy (o `source` do alvo W3C e o link do Markdown). */
export const uriDoLivro = (livroId: string) => `frasy://livro/${encodeURIComponent(livroId)}`;
export const linkDaAnotacao = (a: AnotacaoDeLeitura) =>
  a.alvo.cfi ? `${uriDoLivro(a.livroId)}#${encodeURIComponent(a.alvo.cfi)}` : uriDoLivro(a.livroId);

const MOTIVACAO: Record<TipoDeAnotacao, string> = {
  grifo: 'highlighting',
  nota: 'commenting',
  palavra: 'tagging',
};

const iso = (ms: number) => new Date(ms).toISOString();

/** Uma anotação no modelo W3C (https://www.w3.org/TR/annotation-model/). */
export function paraWebAnnotation(a: AnotacaoDeLeitura): Record<string, unknown> {
  const corpo: Record<string, unknown>[] = [];
  if (a.nota) corpo.push({ type: 'TextualBody', value: a.nota, format: 'text/plain', purpose: 'commenting' });
  if (a.palavra) corpo.push({ type: 'TextualBody', value: a.palavra, purpose: 'tagging' });
  const seletores: Record<string, unknown>[] = [];
  if (a.alvo.cfi) seletores.push({ type: 'FragmentSelector', conformsTo: CFI_CONFORMS_TO, value: a.alvo.cfi });
  if (a.alvo.citacao.exact) {
    seletores.push({
      type: 'TextQuoteSelector',
      exact: a.alvo.citacao.exact,
      ...(a.alvo.citacao.prefix ? { prefix: a.alvo.citacao.prefix } : {}),
      ...(a.alvo.citacao.suffix ? { suffix: a.alvo.citacao.suffix } : {}),
    });
  }
  return {
    '@context': CONTEXTO_W3C,
    id: `urn:uuid:${a.id}`,
    type: 'Annotation',
    motivation: MOTIVACAO[a.tipo],
    created: iso(a.criadoEm),
    modified: iso(a.atualizadoEm),
    ...(corpo.length ? { body: corpo.length === 1 ? corpo[0] : corpo } : {}),
    target: {
      type: 'SpecificResource',
      source: uriDoLivro(a.livroId),
      styleClass: `cor-${a.cor}`,
      selector: seletores.length === 1 ? seletores[0] : seletores,
    },
  };
}

/** A coleção inteira (uma `AnnotationCollection` com uma página só). */
export function colecaoW3C(livro: LivroDaExportacao, anotacoes: readonly AnotacaoDeLeitura[]) {
  const vivas = anotacoesVivas(anotacoes.filter((a) => a.livroId === livro.id));
  return {
    '@context': CONTEXTO_W3C,
    id: `${uriDoLivro(livro.id)}/anotacoes`,
    type: 'AnnotationCollection',
    label: livro.titulo,
    total: vivas.length,
    first: {
      type: 'AnnotationPage',
      startIndex: 0,
      items: vivas.map((a) => {
        // Na página, o `@context` vai uma vez só (na coleção).
        const { '@context': _contexto, ...resto } = paraWebAnnotation(a);
        void _contexto;
        return resto;
      }),
    },
  };
}

const TIPOS = new Set<TipoDeAnotacao>(['grifo', 'nota', 'palavra']);

/**
 * Lê de volta uma anotação W3C produzida por `paraWebAnnotation` (ou por outra ferramenta, quando ela
 * usar os mesmos seletores). Devolve só os campos; quem chama valida com `validarAnotacao`.
 */
export function deWebAnnotation(o: unknown, livroId: string): Partial<AnotacaoDeLeitura> | null {
  if (!o || typeof o !== 'object') return null;
  const w = o as Record<string, unknown>;
  if (w.type !== 'Annotation') return null;
  const id = typeof w.id === 'string' ? w.id.replace(/^urn:uuid:/, '') : '';
  const motivacao = typeof w.motivation === 'string' ? w.motivation : '';
  const tipo = (Object.entries(MOTIVACAO).find(([, m]) => m === motivacao)?.[0] ?? 'grifo') as TipoDeAnotacao;
  const alvo = (w.target && typeof w.target === 'object' ? w.target : {}) as Record<string, unknown>;
  const sels = Array.isArray(alvo.selector) ? alvo.selector : alvo.selector ? [alvo.selector] : [];
  const frag = sels.find((s) => (s as Record<string, unknown>)?.type === 'FragmentSelector') as
    | Record<string, unknown>
    | undefined;
  const quote = sels.find((s) => (s as Record<string, unknown>)?.type === 'TextQuoteSelector') as
    | Record<string, unknown>
    | undefined;
  const corpos = Array.isArray(w.body) ? w.body : w.body ? [w.body] : [];
  const valorDe = (proposito: string) =>
    (corpos.find((b) => (b as Record<string, unknown>)?.purpose === proposito) as Record<string, unknown> | undefined)
      ?.value;
  const cor = typeof alvo.styleClass === 'string' ? alvo.styleClass.replace(/^cor-/, '') : undefined;
  const t = (s: unknown) => (typeof s === 'string' ? s : '');
  const nota = t(valorDe('commenting'));
  const palavra = t(valorDe('tagging'));
  return {
    id,
    livroId,
    tipo: TIPOS.has(tipo) ? tipo : 'grifo',
    alvo: {
      cfi: t(frag?.value),
      citacao: { exact: t(quote?.exact), prefix: t(quote?.prefix), suffix: t(quote?.suffix) },
    },
    cor: cor as CorDeAnotacao | undefined,
    nota,
    ...(palavra ? { palavra } : {}),
    criadoEm: Date.parse(t(w.created)) || 0,
    atualizadoEm: Date.parse(t(w.modified)) || Date.parse(t(w.created)) || 0,
    apagadoEm: null,
  };
}

export interface RotulosDoMarkdown {
  semCapitulo: string;
  nota: string;
  palavra: string;
  abrirNoFrasy: string;
  exportadoEm: (data: string) => string;
}

const ROTULOS_PADRAO: RotulosDoMarkdown = {
  semCapitulo: 'Sem capítulo',
  nota: 'Nota',
  palavra: 'Palavra',
  abrirNoFrasy: 'abrir no Frasy',
  exportadoEm: (d) => `Exportado em ${d}`,
};

/** Citação em bloco do Markdown: cada linha com `> `, e nada que vire título/lista sem querer no começo. */
const emBloco = (s: string) =>
  s
    .split(/\r?\n/)
    .map((l) => `> ${l.replace(/^([#>*+-]|\d+\.)\s/, '\\$1 ')}`)
    .join('\n');

/** Markdown por capítulo, na ordem de leitura. */
export function paraMarkdown(
  livro: LivroDaExportacao,
  anotacoes: readonly AnotacaoDeLeitura[],
  opcoes: { agora: number; rotulos?: Partial<RotulosDoMarkdown> } = { agora: 0 },
): string {
  const r = { ...ROTULOS_PADRAO, ...opcoes.rotulos };
  const vivas = anotacoesVivas(anotacoes.filter((a) => a.livroId === livro.id));
  const linhas: string[] = [`# ${livro.titulo}`];
  const sub = [livro.autor, livro.fonte].filter(Boolean).join(' · ');
  if (sub) linhas.push('', `_${sub}_`);
  linhas.push('', `_${r.exportadoEm(new Date(opcoes.agora).toISOString().slice(0, 10))}_`);
  let capituloAtual: string | null = null;
  for (const a of vivas) {
    const cap = a.alvo.capitulo || r.semCapitulo;
    if (cap !== capituloAtual) {
      capituloAtual = cap;
      linhas.push('', `## ${cap}`);
    }
    linhas.push('');
    if (a.tipo === 'palavra' && a.palavra) linhas.push(`**${r.palavra}:** ${a.palavra}`, '');
    if (a.alvo.citacao.exact) linhas.push(emBloco(a.alvo.citacao.exact));
    if (a.nota) linhas.push('', `**${r.nota}:** ${a.nota.replace(/\r?\n/g, '  \n')}`);
    linhas.push('', `[${r.abrirNoFrasy}](${linkDaAnotacao(a)})`);
  }
  return linhas.join('\n') + '\n';
}

/** Um campo de CSV (RFC 4180): entre aspas quando precisa, aspas dobradas. */
export function campoCsv(v: string): string {
  const s = v.replace(/\r\n?/g, '\n');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV para importar no Anki: uma linha por anotação viva (palavra, grifo ou nota).
 *
 *  · frente: a palavra (tipo `palavra`) ou o trecho grifado;
 *  · verso: a tradução da palavra (quando a tela a tiver em `traducoes`) e/ou a nota;
 *  · contexto: a frase do livro (a citação com o entorno, para a palavra; vazio para o trecho, que já é a frente);
 *  · fonte: "Título — capítulo".
 */
export function paraCsvDoAnki(
  livro: LivroDaExportacao,
  anotacoes: readonly AnotacaoDeLeitura[],
  traducoes: Readonly<Record<string, string>> = {},
): string {
  const vivas = anotacoesVivas(anotacoes.filter((a) => a.livroId === livro.id));
  const linhas = ['#separator:Comma', '#html:false', '#columns:Frente,Verso,Contexto,Fonte', '#tags column:5'];
  for (const a of vivas) {
    const c = a.alvo.citacao;
    const palavra = a.tipo === 'palavra' ? (a.palavra ?? '') : '';
    const frente = palavra || c.exact;
    if (!frente.trim()) continue;
    const verso = [palavra ? (traducoes[palavra.toLowerCase()] ?? '') : '', a.nota].filter(Boolean).join(' — ');
    const contexto = palavra ? `${c.prefix}${c.exact}${c.suffix}`.trim() : '';
    const fonte = [livro.titulo, a.alvo.capitulo].filter(Boolean).join(' — ');
    linhas.push([frente, verso, contexto, fonte, `frasy livro::${a.tipo}`].map(campoCsv).join(','));
  }
  return linhas.join('\n') + '\n';
}

/** O nome de arquivo seguro para o título ("Dom Casmurro" → "dom-casmurro"). */
export function nomeDeArquivo(titulo: string, extensao: string): string {
  const base =
    titulo
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'livro';
  return `${base}.${extensao}`;
}
