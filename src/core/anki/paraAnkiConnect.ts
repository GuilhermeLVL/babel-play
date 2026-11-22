/**
 * DO CARTÃO DO FRASY PARA A NOTA DO ANKI (AnkiConnect) — puro, sem rede e sem DOM.
 *
 * O Anki guarda os campos como HTML. Texto da pessoa (palavra, frase, nota) NUNCA entra cru: `<`, `>` e `&`
 * viram entidades antes de qualquer marcação nossa (`<b>`, `<i>`, `{{c1::…}}`). Assim uma frase com `<script>`
 * aparece como texto no cartão, nunca como código.
 *
 * O mapeamento é por PAPEL: cada campo do modelo do Anki recebe um papel (`palavra`, `traducao`, `verso`…).
 * O padrão vem do NOME dos campos (Front/Back, Frente/Verso, Word/Meaning…), como o leitor de `.apkg`.
 */
import { indiceDoExemplo, indicePorNome, PADRAO_FRENTE, PADRAO_VERSO } from './mapeamento';

/** O que vai num campo do modelo. `verso` = tradução + frase de contexto (o padrão do "Basic"). */
export type PapelDoCampo = 'palavra' | 'traducao' | 'verso' | 'frase' | 'cloze' | 'nota' | 'nivel' | 'nenhum';

export const PAPEIS_DO_CAMPO: readonly PapelDoCampo[] = [
  'palavra',
  'traducao',
  'verso',
  'frase',
  'cloze',
  'nota',
  'nivel',
  'nenhum',
];

/** Nome do campo do modelo → papel. */
export type MapeamentoDeCampos = Record<string, PapelDoCampo>;

/** O mínimo que o Frasy sabe de um cartão para mandar ao Anki. */
export interface CartaoParaAnki {
  palavra: string;
  traducao: string;
  frase?: string;
  nota?: string;
  nivel?: string;
  etiquetas?: string[];
}

export interface NotaParaAnki {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
  options: { allowDuplicate: false; duplicateScope: 'deck' };
}

/** Teto de um campo (em caracteres do texto original). Frase de legenda tem dezenas; isto é folga. */
export const TETO_DO_CAMPO = 2000;
/** Teto de uma etiqueta do Anki. */
export const TETO_DA_ETIQUETA = 64;
/** A etiqueta que marca tudo o que o Frasy mandou. */
export const ETIQUETA_DO_FRASY = 'frasy';

/**
 * Escapa o texto para o HTML do Anki. Além de `&`, `<` e `>`: aspas, chaves e colchetes.
 * Chaves: `{{c2::…}}` e `{{Campo}}` de uma frase de terceiros não podem virar lacuna ou referência no Anki.
 * Colchetes: `[sound:…]`, `[latex]…[/latex]` e `[$]…[/$]` são interpretados pelo Anki no texto cru do campo
 * (tocam arquivo, compilam LaTeX). Como entidade (`&#91;`) a tela mostra o mesmo texto e o Anki não interpreta.
 */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;');
}

/** Corta em pontos de código: nunca no meio de um par substituto (emoji, ideograma raro). */
function cortar(texto: string, teto: number): string {
  if (texto.length <= teto) return texto;
  return Array.from(texto.slice(0, teto * 2))
    .slice(0, teto)
    .join('');
}

/** Tira caracteres de controle (menos quebra de linha), apara e corta no teto (por pontos de código). */
export function limparTexto(texto: unknown, teto = TETO_DO_CAMPO): string {
  if (typeof texto !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const semControle = texto.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  return cortar(semControle.trim(), teto).trim();
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Acha a PALAVRA na frase em TEXTO PURO, nunca no HTML já escapado (onde `&amp;` ou `&#39;` teriam "amp" ou "39"
 * por dentro). Como palavra inteira (sem letra ou número ao redor); senão como trecho (idiomas sem espaço).
 * Devolve [antes, achado, depois] ou `null`; quem chama escapa cada pedaço.
 */
function separarPalavra(frase: string, palavra: string): [string, string, string] | null {
  if (!palavra) return null;
  const alvo = escaparRegex(palavra);
  const inteira = new RegExp(`(?<![\\p{L}\\p{N}])(${alvo})(?![\\p{L}\\p{N}])`, 'iu');
  const trecho = new RegExp(`(${alvo})`, 'iu');
  for (const re of [inteira, trecho]) {
    const m = re.exec(frase);
    if (m) return [frase.slice(0, m.index), m[1]!, frase.slice(m.index + m[1]!.length)];
  }
  return null;
}

/** A frase de contexto em itálico, com a palavra em negrito (HTML seguro). Vazio sem frase. */
export function fraseDeContexto(c: CartaoParaAnki): string {
  const frase = limparTexto(c.frase);
  if (!frase) return '';
  const p = separarPalavra(frase, limparTexto(c.palavra));
  if (!p) return `<i>${escaparHtml(frase)}</i>`;
  return `<i>${escaparHtml(p[0])}<b>${escaparHtml(p[1])}</b>${escaparHtml(p[2])}</i>`;
}

/**
 * A frase com a palavra como lacuna `{{c1::palavra}}`; `null` se não há frase ou a palavra não aparece nela.
 * Só as chaves e o `c1::` são nossos; dentro da lacuna o `:` também vira entidade (`::` abriria uma dica).
 */
export function fraseComLacuna(c: CartaoParaAnki): string | null {
  const frase = limparTexto(c.frase);
  const p = frase ? separarPalavra(frase, limparTexto(c.palavra)) : null;
  if (!p) return null;
  return `${escaparHtml(p[0])}{{c1::${escaparHtml(p[1]).replace(/:/g, '&#58;')}}}${escaparHtml(p[2])}`;
}

/** O verso do "Basic": a tradução e, embaixo, a frase de contexto. */
export function versoComContexto(c: CartaoParaAnki): string {
  const trad = escaparHtml(limparTexto(c.traducao));
  const ctx = fraseDeContexto(c);
  return ctx ? `${trad}<br><br>${ctx}` : trad;
}

/** O valor (HTML) de um papel para este cartão. `null` só no `cloze` que não se forma. */
export function valorDoPapel(papel: PapelDoCampo, c: CartaoParaAnki): string | null {
  switch (papel) {
    case 'palavra':
      return escaparHtml(limparTexto(c.palavra));
    case 'traducao':
      return escaparHtml(limparTexto(c.traducao));
    case 'verso':
      return versoComContexto(c);
    case 'frase':
      return fraseDeContexto(c);
    case 'cloze':
      return fraseComLacuna(c);
    case 'nota':
      return escaparHtml(limparTexto(c.nota));
    case 'nivel':
      return escaparHtml(limparTexto(c.nivel, 16));
    default:
      return '';
  }
}

/** Etiqueta do Anki: sem espaço (vira `_`), sem vazio, no teto. */
export function etiquetaDoAnki(e: string): string {
  return limparTexto(e, TETO_DA_ETIQUETA)
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** As etiquetas do cartão + `frasy`, sem repetir (comparando sem diferença de caixa). */
export function etiquetasDaNota(etiquetas: string[] | undefined): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const bruta of [...(etiquetas ?? []), ETIQUETA_DO_FRASY]) {
    const e = etiquetaDoAnki(bruta);
    if (!e || vistas.has(e.toLowerCase())) continue;
    vistas.add(e.toLowerCase());
    saida.push(e);
  }
  return saida;
}

/**
 * O mapeamento PADRÃO para os campos de um modelo: a frente pelo nome (Front/Frente/Word…) recebe a
 * `palavra` e o verso (Back/Verso/Meaning…) o `verso` (tradução + contexto). Frase, nota e nível só se o
 * nome disser. Sem nomes reconhecíveis, o 1º campo é a palavra e o 2º o verso.
 */
export function mapeamentoPadrao(camposDoModelo: string[]): MapeamentoDeCampos {
  const mapa: MapeamentoDeCampos = Object.fromEntries(camposDoModelo.map((c) => [c, 'nenhum' as PapelDoCampo]));
  if (camposDoModelo.length === 0) return mapa;
  const frente = indicePorNome(camposDoModelo, PADRAO_FRENTE);
  const verso = indicePorNome(camposDoModelo, PADRAO_VERSO);
  const iFrente = frente >= 0 ? frente : 0;
  const iVerso = verso >= 0 && verso !== iFrente ? verso : camposDoModelo.findIndex((_c, i) => i !== iFrente);
  mapa[camposDoModelo[iFrente]!] = 'palavra';
  if (iVerso >= 0) mapa[camposDoModelo[iVerso]!] = 'verso';
  const nomes = camposDoModelo.filter((_c, i) => i !== iFrente && i !== iVerso);
  const iFrase = indiceDoExemplo(nomes);
  if (iFrase >= 0) mapa[nomes[iFrase]!] = 'frase';
  const iNota = nomes.findIndex((n) => /^(note|notes|nota|notas)$/i.test(n.trim()));
  if (iNota >= 0) mapa[nomes[iNota]!] = 'nota';
  const iNivel = nomes.findIndex((n) => /^(level|nivel|nível|cefr)$/i.test(n.trim()));
  if (iNivel >= 0) mapa[nomes[iNivel]!] = 'nivel';
  return mapa;
}

/** O mapeamento serve? Precisa de ao menos um campo com `palavra`, `traducao`, `verso` ou `cloze`. */
export function mapeamentoUsavel(mapa: MapeamentoDeCampos): boolean {
  return Object.values(mapa).some((p) => p === 'palavra' || p === 'traducao' || p === 'verso' || p === 'cloze');
}

export type ResultadoDaNota = { ok: true; nota: NotaParaAnki } | { ok: false; motivo: 'sem-palavra' | 'sem-lacuna' };

/**
 * Monta a nota de UM cartão. Sem palavra não há cartão. Com campo `cloze` mapeado, a palavra precisa
 * aparecer na frase: sem lacuna o Anki recusaria a nota, então ela é recusada aqui, com motivo.
 */
export function montarNotaParaAnki(
  c: CartaoParaAnki,
  alvo: { deckName: string; modelName: string; mapeamento: MapeamentoDeCampos },
): ResultadoDaNota {
  if (!limparTexto(c.palavra)) return { ok: false, motivo: 'sem-palavra' };
  const fields: Record<string, string> = {};
  for (const [campo, papel] of Object.entries(alvo.mapeamento)) {
    const v = valorDoPapel(papel, c);
    if (v === null) return { ok: false, motivo: 'sem-lacuna' };
    fields[campo] = v;
  }
  return {
    ok: true,
    nota: {
      deckName: alvo.deckName,
      modelName: alvo.modelName,
      fields,
      tags: etiquetasDaNota(c.etiquetas),
      options: { allowDuplicate: false, duplicateScope: 'deck' },
    },
  };
}
