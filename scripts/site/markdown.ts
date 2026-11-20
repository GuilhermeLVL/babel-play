/**
 * MARKDOWN DOS GUIAS → HTML, no build do site público (`scripts/site/gerar.ts`).
 *
 * Um conversor pequeno e de propósito restrito, em vez de uma dependência nova: os guias são texto
 * corrido escrito por nós (`content/guias/*.md`), e o que eles precisam é o básico — títulos, parágrafos,
 * listas, citações, código, tabelas simples, negrito, itálico e links. HTML cru NÃO passa: todo texto é
 * escapado antes da marcação inline, e link só sai com `http(s):`, `mailto:`, `/` ou `#`. Assim um guia
 * nunca injeta script na página (e a CSP também não deixaria).
 */

import yaml from 'js-yaml';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto para HTML (conteúdo e atributos). */
export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** URL aceita num link de guia; o resto vira texto. */
function urlSegura(url: string): string | null {
  const u = url.trim();
  if (/^(https?:\/\/|mailto:)/i.test(u) || u.startsWith('/') || u.startsWith('#')) return u;
  return null;
}

/** Marcação inline sobre texto JÁ escapado: código, links, negrito e itálico. */
function inline(texto: string): string {
  const codigos: string[] = [];
  let s = escaparHtml(texto).replace(/`([^`]+)`/g, (_m, c: string) => {
    codigos.push(`<code>${c}</code>`);
    return `\u0000${codigos.length - 1}\u0000`;
  });
  /* `[rótulo](url)` ou `[rótulo](<url>)` (a forma que o prettier usa); os `<>` já vieram escapados. */
  s = s.replace(
    /\[([^\]]+)\]\((?:&lt;(.*?)&gt;|([^)\s]+))\)/g,
    (_m, rotulo: string, angular?: string, nua?: string) => {
      /* A URL já foi escapada junto com o texto: `&amp;` volta a ser `&` só para conferir o esquema. */
      const segura = urlSegura((angular ?? nua ?? '').replace(/&amp;/g, '&'));
      if (!segura) return rotulo;
      const externo = /^https?:\/\//i.test(segura);
      return `<a href="${escaparHtml(segura)}"${externo ? ' rel="noopener"' : ''}>${rotulo}</a>`;
    },
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codigos[Number(i)] ?? '');
}

const ehItemNaoOrdenado = (l: string) => /^\s*[-*+]\s+/.test(l);
const ehItemOrdenado = (l: string) => /^\s*\d+[.)]\s+/.test(l);
const ehLinhaDeTabela = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const ehSeparadorDeTabela = (l: string) => /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(l);

function celulas(linha: string): string[] {
  return linha
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
}

/**
 * Converte o corpo do guia. O primeiro `# Título` é descartado (a página já escreve o título do
 * frontmatter como `<h1>`); outros `#` viram `<h2>`, para a página ter um `<h1>` só.
 */
export function markdownParaHtml(md: string): string {
  const linhas = md.replace(/\r\n?/g, '\n').split('\n');
  const saida: string[] = [];
  let i = 0;
  let primeiroTitulo = true;
  while (i < linhas.length) {
    const linha = linhas[i];
    if (!linha.trim()) {
      i++;
      continue;
    }
    const cerca = /^\s*(```|~~~)/.exec(linha);
    if (cerca) {
      const corpo: string[] = [];
      i++;
      while (i < linhas.length && !linhas[i].trim().startsWith(cerca[1])) corpo.push(linhas[i++]);
      i++;
      saida.push(`<pre><code>${escaparHtml(corpo.join('\n'))}</code></pre>`);
      continue;
    }
    const titulo = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(linha);
    if (titulo) {
      i++;
      const nivel = titulo[1].length;
      if (nivel === 1 && primeiroTitulo && saida.length === 0) {
        primeiroTitulo = false;
        continue;
      }
      primeiroTitulo = false;
      const h = Math.max(2, nivel);
      saida.push(`<h${h}>${inline(titulo[2])}</h${h}>`);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(linha)) {
      i++;
      saida.push('<hr>');
      continue;
    }
    if (/^\s*>/.test(linha)) {
      const corpo: string[] = [];
      while (i < linhas.length && /^\s*>/.test(linhas[i])) corpo.push(linhas[i++].replace(/^\s*>\s?/, ''));
      saida.push(`<blockquote>${markdownParaHtml(corpo.join('\n'))}</blockquote>`);
      continue;
    }
    if (ehItemNaoOrdenado(linha) || ehItemOrdenado(linha)) {
      const ordenada = ehItemOrdenado(linha);
      const teste = ordenada ? ehItemOrdenado : ehItemNaoOrdenado;
      const itens: string[] = [];
      while (i < linhas.length && linhas[i].trim()) {
        if (teste(linhas[i])) itens.push(linhas[i].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''));
        else if (itens.length) itens[itens.length - 1] += ` ${linhas[i].trim()}`;
        i++;
      }
      const tag = ordenada ? 'ol' : 'ul';
      saida.push(`<${tag}>${itens.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (ehLinhaDeTabela(linha) && i + 1 < linhas.length && ehSeparadorDeTabela(linhas[i + 1])) {
      const cabecalho = celulas(linha);
      i += 2;
      const corpo: string[][] = [];
      while (i < linhas.length && ehLinhaDeTabela(linhas[i])) corpo.push(celulas(linhas[i++]));
      saida.push(
        `<div class="tabela"><table><thead><tr>${cabecalho.map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead>` +
          `<tbody>${corpo.map((l) => `<tr>${l.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
      );
      continue;
    }
    const paragrafo: string[] = [];
    while (
      i < linhas.length &&
      linhas[i].trim() &&
      !/^(#{1,6})\s/.test(linhas[i]) &&
      !/^\s*(```|~~~|>)/.test(linhas[i]) &&
      !ehItemNaoOrdenado(linhas[i]) &&
      !ehItemOrdenado(linhas[i])
    ) {
      paragrafo.push(linhas[i++].trim());
    }
    if (!paragrafo.length) {
      /* Linha que nenhuma regra quis (uma `|` solta, por exemplo): sai como parágrafo, nunca trava o laço. */
      paragrafo.push(linhas[i++].trim());
    }
    saida.push(`<p>${inline(paragrafo.join(' '))}</p>`);
  }
  return saida.join('\n');
}

/** Valor do frontmatter: texto, booleano ou lista de textos. */
export type ValorDoFrontmatter = string | boolean | string[];

/** Normaliza um valor do YAML: data vira AAAA-MM-DD, número vira texto, lista vira lista de textos. */
function normalizar(v: unknown): ValorDoFrontmatter | undefined {
  if (typeof v === 'boolean' || typeof v === 'string') return v;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.toISOString().slice(0, 10);
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map((x) => normalizar(x)).filter((x): x is string => typeof x === 'string');
  return undefined;
}

/**
 * O FRONTMATTER (`---` … `---`), lido por um parser YAML de verdade (`js-yaml`): o prettier do pre-commit
 * reescreve aspas e listas (simples ou duplas, em linha ou em bloco), e as duas formas valem. Sem
 * frontmatter (ou YAML inválido): `temFrontmatter` falso e `dados` vazio.
 */
export function lerFrontmatter(texto: string): {
  dados: Record<string, ValorDoFrontmatter>;
  corpo: string;
  temFrontmatter: boolean;
} {
  const t = texto.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(t);
  if (!m) return { dados: {}, corpo: t, temFrontmatter: false };
  let bruto: unknown;
  try {
    bruto = yaml.load(m[1]);
  } catch {
    return { dados: {}, corpo: t.slice(m[0].length), temFrontmatter: false };
  }
  const dados: Record<string, ValorDoFrontmatter> = {};
  if (bruto && typeof bruto === 'object' && !Array.isArray(bruto)) {
    for (const [chave, valor] of Object.entries(bruto as Record<string, unknown>)) {
      const v = normalizar(valor);
      if (v !== undefined) dados[chave] = v;
    }
  }
  return { dados, corpo: t.slice(m[0].length), temFrontmatter: true };
}
