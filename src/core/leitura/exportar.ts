/**
 * AS EXPORTAÇÕES DAS ANOTAÇÕES (L2, §5 da spec) — todas puras, geradas no navegador, grátis.
 *
 *  · JSON no modelo W3C Web Annotation (`@context` oficial), para portabilidade;
 *  · Markdown por capítulo (citação em bloco, nota, link `frasy://livro/<id>#<cfi>`), para Notion/Obsidian;
 *  · o arquivo de TEXTO do Anki, separado por tab (frente: a palavra ou o trecho; verso: tradução/nota;
 *    extra: a frase de contexto e a fonte), com as diretivas que o Anki 2.1.55+ lê (`#separator:tab`,
 *    `#html:false`, `#columns`) — formato nativo, e não CSV de planilha, para o cartão não levar o apóstrofo
 *    da mitigação de fórmula;
 *  · CSV para planilha, com a mitigação de injeção de fórmula da OWASP (`campoCsv`).
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

/**
 * Um campo de CSV PARA PLANILHA (RFC 4180, com a mitigação de injeção de fórmula da OWASP): o campo que
 * começa com `=`, `+`, `-`, `@`, tab ou CR ganha um apóstrofo na frente ANTES das aspas — senão o Excel e o
 * Google Sheets o executam como fórmula (`=HYPERLINK(...)` num grifo vira link clicável para qualquer lugar).
 * Depois, entre aspas quando precisa, com aspas dobradas.
 */
export function campoCsv(v: string): string {
  const neutro = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  const s = neutro.replace(/\r\n?/g, '\n');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV PARA PLANILHA de todas as anotações vivas do livro (tipo, capítulo, trecho, nota, palavra, cor, data,
 * link). É o arquivo que alguém abre no Excel/Sheets, por isso cada campo passa por `campoCsv`.
 */
export function paraCsvDePlanilha(livro: LivroDaExportacao, anotacoes: readonly AnotacaoDeLeitura[]): string {
  const vivas = anotacoesVivas(anotacoes.filter((a) => a.livroId === livro.id));
  const linhas = [['tipo', 'capitulo', 'trecho', 'nota', 'palavra', 'cor', 'criado_em', 'link'].join(',')];
  for (const a of vivas) {
    linhas.push(
      [
        a.tipo,
        a.alvo.capitulo ?? '',
        a.alvo.citacao.exact,
        a.nota,
        a.palavra ?? '',
        a.cor,
        iso(a.criadoEm),
        linkDaAnotacao(a),
      ]
        .map(campoCsv)
        .join(','),
    );
  }
  return linhas.join('\n') + '\n';
}

/**
 * Um campo no FORMATO DE TEXTO DO ANKI (`#separator:tab`): o importador do Anki lê o campo entre aspas
 * duplas com tab, quebra de linha e aspas dentro (`""` = uma aspa), então é assim que tab e quebra de linha
 * são escapados — sem trocar nada do texto, e sem o apóstrofo da planilha, que sujaria o cartão. O Anki não
 * avalia fórmulas: a mitigação de planilha não se aplica a este arquivo.
 */
export function campoDoAnki(v: string): string {
  const s = v.replace(/\r\n?/g, '\n');
  return /["\t\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Lê de volta as linhas de dados de um arquivo de texto do Anki (ignora as diretivas `#…`). Para o teste e a importação. */
export function lerTextoDoAnki(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;
  let inicioDeLinha = true;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (inicioDeLinha && ch === '#' && !aspas) {
      i = texto.indexOf('\n', i);
      if (i < 0) break;
      continue;
    }
    inicioDeLinha = false;
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"' && campo === '') aspas = true;
    else if (ch === '\t') {
      linha.push(campo);
      campo = '';
    } else if (ch === '\n') {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
      inicioDeLinha = true;
    } else campo += ch;
  }
  if (campo || linha.length) linhas.push([...linha, campo]);
  return linhas;
}

/**
 * O ARQUIVO DE TEXTO DO ANKI (Arquivo → Importar, Anki 2.1.55+): uma linha por anotação viva, separada
 * por tab, com as diretivas que o Anki lê (`#separator:tab`, `#html:false`, `#columns`, `#tags column`).
 *
 *  · frente: a palavra (tipo `palavra`) ou o trecho grifado;
 *  · verso: a tradução da palavra (quando a tela a tiver em `traducoes`) e/ou a nota;
 *  · contexto: a frase do livro (a citação com o entorno, para a palavra; vazio para o trecho, que já é a frente);
 *  · fonte: "Título — capítulo".
 */
export function paraTextoDoAnki(
  livro: LivroDaExportacao,
  anotacoes: readonly AnotacaoDeLeitura[],
  traducoes: Readonly<Record<string, string>> = {},
): string {
  const vivas = anotacoesVivas(anotacoes.filter((a) => a.livroId === livro.id));
  const linhas = ['#separator:tab', '#html:false', '#columns:Frente\tVerso\tContexto\tFonte\tTags', '#tags column:5'];
  for (const a of vivas) {
    const c = a.alvo.citacao;
    const palavra = a.tipo === 'palavra' ? (a.palavra ?? '') : '';
    const frente = palavra || c.exact;
    if (!frente.trim()) continue;
    const verso = [palavra ? (traducoes[palavra.toLowerCase()] ?? '') : '', a.nota].filter(Boolean).join(' — ');
    const contexto = palavra ? `${c.prefix}${c.exact}${c.suffix}`.trim() : '';
    const fonte = [livro.titulo, a.alvo.capitulo].filter(Boolean).join(' — ');
    linhas.push([frente, verso, contexto, fonte, `frasy_livro::${a.tipo}`].map(campoDoAnki).join('\t'));
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
