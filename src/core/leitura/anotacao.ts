/**
 * A ANOTAÇÃO DO LEITOR (L2 da spec `docs/specs/2026-10-26-livros-e-leitura.md`, §4) — o modelo, puro.
 *
 * Âncora dupla, como no modelo W3C Web Annotation: o CFI do EPUB acha o trecho rápido; a citação
 * (`TextQuoteSelector`: `exact` + até 32 caracteres de `prefix`/`suffix`) reancora quando a edição muda.
 * Sem os dois, a anotação aparece em "não localizadas" — nunca some (ver `reancorar.ts`).
 *
 * O MESMO módulo valida no cliente e no servidor (`server/routes/leitura.ts`): o cliente não é
 * confiável, e uma regra escrita duas vezes diverge. O teto de 500 caracteres da citação vale para
 * TODO livro no servidor: ele não tem como saber se o livro é do catálogo ou trazido pela pessoa, e o
 * que a spec pede é que o servidor nunca vire cópia da obra trazida.
 */

export const TIPOS_DE_ANOTACAO = ['grifo', 'nota', 'palavra'] as const;
export type TipoDeAnotacao = (typeof TIPOS_DE_ANOTACAO)[number];

/** As cores possíveis de um grifo. O nome é o token; a cor de verdade é do tema (CSS). */
export const CORES_DE_ANOTACAO = ['amarelo', 'verde', 'azul', 'rosa', 'laranja'] as const;
export type CorDeAnotacao = (typeof CORES_DE_ANOTACAO)[number];

/** A cor de cada tipo, quando a pessoa não escolhe outra: o tipo se reconhece pela cor. */
export const COR_DO_TIPO: Record<TipoDeAnotacao, CorDeAnotacao> = {
  grifo: 'amarelo',
  nota: 'azul',
  palavra: 'verde',
};

/** Teto da citação guardada (`exact`). */
export const MAX_CITACAO = 500;
/** Teto do contexto em volta da citação (`prefix`/`suffix`). */
export const MAX_CONTEXTO = 32;
/** Teto da nota escrita. */
export const MAX_NOTA = 4_000;
/** Teto do CFI (um CFI de verdade tem dezenas de caracteres; mil é folga para livro muito aninhado). */
export const MAX_CFI = 1_000;
/** Teto do id do livro (`arq:<hash>`, `sessao:<id>` ou o id do catálogo). */
export const MAX_LIVRO_ID = 120;
/** Teto do rótulo do capítulo. */
export const MAX_CAPITULO = 300;
/** Teto da palavra salva (tipo `palavra`). */
export const MAX_PALAVRA = 200;

export interface CitacaoDoTexto {
  exact: string;
  prefix: string;
  suffix: string;
}

export interface AlvoDaAnotacao {
  /** EPUB CFI (`epubcfi(...)`). Vazio quando só a citação existe (ex.: anotação migrada da Leitura antiga). */
  cfi: string;
  citacao: CitacaoDoTexto;
  /** Rótulo do capítulo (do sumário), para agrupar na exportação. */
  capitulo?: string;
}

export interface AnotacaoDeLeitura {
  id: string;
  livroId: string;
  tipo: TipoDeAnotacao;
  alvo: AlvoDaAnotacao;
  cor: CorDeAnotacao;
  /** A nota escrita (vazia num grifo sem nota). */
  nota: string;
  /** Só no tipo `palavra`: a palavra salva no deck. */
  palavra?: string;
  criadoEm: number;
  atualizadoEm: number;
  /** Apagada (lápide para a sincronização). `null` = viva. */
  apagadoEm: number | null;
}

const ehTexto = (x: unknown): x is string => typeof x === 'string';
const ehNumero = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
/** Sem caracteres de controle (exceto quebra de linha e tab na nota): o que vai a CSV e Markdown sai limpo. */
// eslint-disable-next-line no-control-regex
const semControle = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

/** Ids aceitos: uuid ou qualquer token curto sem espaço. */
export const ehIdDeAnotacao = (x: unknown): x is string => ehTexto(x) && /^[A-Za-z0-9_-]{8,64}$/.test(x);

/** O id do livro: só caracteres seguros (vira chave de IndexedDB, parte de URL e de `origin_ref`). */
export const ehLivroId = (x: unknown): x is string =>
  ehTexto(x) && x.length > 0 && x.length <= MAX_LIVRO_ID && /^[A-Za-z0-9:._~-]+$/.test(x);

/**
 * A citação de um trecho dentro de `texto` (`[inicio, fim)`): o `exact` cortado no teto e até 32
 * caracteres de cada lado. Corta pelo código de caractere (não quebra emoji ao meio).
 */
export function citacaoDe(texto: string, inicio: number, fim: number, teto = MAX_CITACAO): CitacaoDoTexto {
  const a = Math.max(0, Math.min(inicio, texto.length));
  const b = Math.max(a, Math.min(fim, texto.length));
  const exact = cortar(texto.slice(a, b), teto);
  const antes = Array.from(texto.slice(Math.max(0, a - MAX_CONTEXTO * 2), a));
  const depois = Array.from(texto.slice(b, b + MAX_CONTEXTO * 2));
  return {
    exact,
    prefix: antes.slice(-MAX_CONTEXTO).join(''),
    suffix: depois.slice(0, MAX_CONTEXTO).join(''),
  };
}

/** Corta por ponto de código (não por unidade UTF-16). */
export function cortar(s: string, teto: number): string {
  const cps = Array.from(s);
  return cps.length <= teto ? s : cps.slice(0, teto).join('');
}

const tamanho = (s: string) => Array.from(s).length;

export type ResultadoDaValidacao =
  | { ok: true; anotacao: AnotacaoDeLeitura }
  | { ok: false; erro: string; code: string };

/**
 * Valida (e normaliza) uma anotação vinda de fora — do disco, do servidor ou do corpo de um pedido.
 *
 * `estrito` (o servidor): citação acima do teto é RECUSADA, e não cortada — quem manda mais do que o
 * teto está fora do contrato. No cliente (`estrito = false`) o excesso é cortado, porque o que se lê
 * do disco antigo não deve sumir por um caractere a mais.
 */
export function validarAnotacao(x: unknown, opcoes: { estrito?: boolean } = {}): ResultadoDaValidacao {
  const estrito = opcoes.estrito === true;
  if (!x || typeof x !== 'object') return { ok: false, erro: 'anotação inválida', code: 'anotacao_invalida' };
  const o = x as Record<string, unknown>;
  if (!ehIdDeAnotacao(o.id)) return { ok: false, erro: 'id inválido', code: 'id_invalido' };
  if (!ehLivroId(o.livroId)) return { ok: false, erro: 'livro inválido', code: 'livro_invalido' };
  if (!(TIPOS_DE_ANOTACAO as readonly unknown[]).includes(o.tipo)) {
    return { ok: false, erro: 'tipo inválido', code: 'tipo_invalido' };
  }
  const tipo = o.tipo as TipoDeAnotacao;
  const alvo = (o.alvo && typeof o.alvo === 'object' ? o.alvo : {}) as Record<string, unknown>;
  const cit = (alvo.citacao && typeof alvo.citacao === 'object' ? alvo.citacao : {}) as Record<string, unknown>;
  const cfi = ehTexto(alvo.cfi) ? alvo.cfi.trim() : '';
  if (cfi && (!cfi.startsWith('epubcfi(') || cfi.length > MAX_CFI)) {
    return { ok: false, erro: 'CFI inválido', code: 'cfi_invalido' };
  }
  const exactBruto = ehTexto(cit.exact) ? semControle(cit.exact) : '';
  if (!exactBruto.trim() && !cfi) return { ok: false, erro: 'anotação sem âncora', code: 'sem_ancora' };
  if (estrito && tamanho(exactBruto) > MAX_CITACAO) {
    return { ok: false, erro: `a citação passa de ${MAX_CITACAO} caracteres`, code: 'citacao_longa' };
  }
  const prefixBruto = ehTexto(cit.prefix) ? semControle(cit.prefix) : '';
  const suffixBruto = ehTexto(cit.suffix) ? semControle(cit.suffix) : '';
  if (estrito && (tamanho(prefixBruto) > MAX_CONTEXTO || tamanho(suffixBruto) > MAX_CONTEXTO)) {
    return { ok: false, erro: 'contexto da citação longo demais', code: 'contexto_longo' };
  }
  const notaBruta = ehTexto(o.nota) ? semControle(o.nota) : '';
  if (estrito && tamanho(notaBruta) > MAX_NOTA) {
    return { ok: false, erro: `a nota passa de ${MAX_NOTA} caracteres`, code: 'nota_longa' };
  }
  const capitulo = ehTexto(alvo.capitulo) ? cortar(semControle(alvo.capitulo).trim(), MAX_CAPITULO) : '';
  const cor = (CORES_DE_ANOTACAO as readonly unknown[]).includes(o.cor) ? (o.cor as CorDeAnotacao) : COR_DO_TIPO[tipo];
  const palavra = ehTexto(o.palavra) ? cortar(semControle(o.palavra).trim(), MAX_PALAVRA) : '';
  if (tipo === 'palavra' && !palavra) return { ok: false, erro: 'palavra vazia', code: 'palavra_vazia' };
  if (!ehNumero(o.criadoEm) || !ehNumero(o.atualizadoEm)) {
    return { ok: false, erro: 'datas inválidas', code: 'datas_invalidas' };
  }
  const apagadoEm = o.apagadoEm == null ? null : ehNumero(o.apagadoEm) ? o.apagadoEm : null;
  return {
    ok: true,
    anotacao: {
      id: o.id,
      livroId: o.livroId,
      tipo,
      alvo: {
        cfi,
        citacao: {
          exact: cortar(exactBruto, MAX_CITACAO),
          prefix: Array.from(prefixBruto).slice(-MAX_CONTEXTO).join(''),
          suffix: cortar(suffixBruto, MAX_CONTEXTO),
        },
        ...(capitulo ? { capitulo } : {}),
      },
      cor,
      nota: cortar(notaBruta, MAX_NOTA),
      ...(palavra ? { palavra } : {}),
      criadoEm: Math.floor(o.criadoEm),
      atualizadoEm: Math.floor(o.atualizadoEm),
      apagadoEm: apagadoEm == null ? null : Math.floor(apagadoEm),
    },
  };
}

/** Uma anotação nova, já normalizada. `id` e `agora` vêm de quem chama (o núcleo não sorteia nem lê relógio). */
export function novaAnotacao(e: {
  id: string;
  livroId: string;
  tipo: TipoDeAnotacao;
  cfi: string;
  citacao: CitacaoDoTexto;
  capitulo?: string;
  cor?: CorDeAnotacao;
  nota?: string;
  palavra?: string;
  agora: number;
}): AnotacaoDeLeitura {
  const r = validarAnotacao({
    id: e.id,
    livroId: e.livroId,
    tipo: e.tipo,
    alvo: { cfi: e.cfi, citacao: e.citacao, capitulo: e.capitulo },
    cor: e.cor ?? COR_DO_TIPO[e.tipo],
    nota: e.nota ?? '',
    palavra: e.palavra,
    criadoEm: e.agora,
    atualizadoEm: e.agora,
    apagadoEm: null,
  });
  if (!r.ok) throw new Error(`anotação inválida: ${r.code}`);
  return r.anotacao;
}

/**
 * A SINCRONIZAÇÃO: última escrita vence, por id. A lápide (`apagadoEm`) é uma escrita como outra: uma
 * remoção mais nova vence a edição mais velha, e uma edição mais nova "ressuscita" (quem editou depois
 * de apagar noutro aparelho quis a anotação). Empate fica com o lado de cá (`locais`).
 */
export function mesclarAnotacoes(
  locais: readonly AnotacaoDeLeitura[],
  remotas: readonly AnotacaoDeLeitura[],
): AnotacaoDeLeitura[] {
  const porId = new Map<string, AnotacaoDeLeitura>();
  for (const a of locais) porId.set(a.id, a);
  for (const r of remotas) {
    const l = porId.get(r.id);
    if (!l || marcaDeTempo(r) > marcaDeTempo(l)) porId.set(r.id, r);
  }
  return [...porId.values()];
}

/** O instante da última mudança (edição ou remoção). */
export const marcaDeTempo = (a: AnotacaoDeLeitura): number => Math.max(a.atualizadoEm, a.apagadoEm ?? 0);

/** As vivas, na ordem de leitura aproximada (pelo CFI; sem CFI, por criação). */
export function anotacoesVivas(lista: readonly AnotacaoDeLeitura[]): AnotacaoDeLeitura[] {
  return lista.filter((a) => a.apagadoEm == null).sort(ordemDeLeitura);
}

/**
 * Ordem de leitura sem o parser de CFI: os passos numéricos do CFI comparados um a um
 * (`/6/4!/4/2:10` < `/6/4!/4/10`). Bom o bastante para listar; o motor resolve o resto.
 */
export function ordemDeLeitura(a: AnotacaoDeLeitura, b: AnotacaoDeLeitura): number {
  const pa = passosDoCfi(a.alvo.cfi);
  const pb = passosDoCfi(b.alvo.cfi);
  if (pa.length && pb.length) {
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
    if (pa.length !== pb.length) return pa.length - pb.length;
  } else if (pa.length !== pb.length) return pa.length ? -1 : 1;
  return a.criadoEm - b.criadoEm;
}

/** Os números de um CFI na ordem (o início do intervalo, quando houver). */
export function passosDoCfi(cfi: string): number[] {
  const corpo = /^epubcfi\((.*)\)$/.exec(cfi)?.[1];
  if (!corpo) return [];
  const inicio = corpo.split(',').slice(0, 2).join('');
  return Array.from(inicio.matchAll(/[/:](\d+)/g), (m) => Number(m[1]));
}
