/**
 * O CONTEÚDO ESCOLHIDO — uma escolha só, para o app inteiro (`seletor.js:8-13`, `FX.fonte` + `FX.lang`
 * de `fontes.js:32-35`). Aqui só os tipos e as funções PURAS; quem guarda e avisa é `loja.ts`.
 *
 * A escolha é `{ idioma, fonte }`. O padrão é "Tudo". O idioma é o primeiro nível: quem tem dois
 * idiomas vê um por vez, e "Tudo" quer dizer "tudo em inglês". `idioma` vazio é "ainda não decidido":
 * vale o idioma de estudo do app até a primeira leitura do catálogo dizer quais existem.
 */
import type { ContagemDaFonte, ContagensDeConteudo, FonteContada } from '../../core/learning/contagensDeConteudo';

export type FonteDeConteudo =
  | { tipo: 'tudo' }
  | { tipo: 'dificeis' }
  /** `nome` é o título lembrado na hora da escolha: a ficha o mostra antes de o catálogo chegar. */
  | { tipo: 'sessao'; id: string; nome: string }
  | { tipo: 'anki'; id: string; nome: string }
  | { tipo: 'trilha' };

export interface Conteudo {
  /** Base ISO (`en`), ou vazio enquanto não decidido. */
  idioma: string;
  fonte: FonteDeConteudo;
}

export const TUDO: FonteDeConteudo = { tipo: 'tudo' };
export const CONTEUDO_PADRAO: Conteudo = { idioma: '', fonte: TUDO };

const base = (idioma: unknown) => (typeof idioma === 'string' ? idioma.toLowerCase().split('-')[0].slice(0, 3) : '');

/** Uma chave de texto por fonte: `tudo`, `dificeis`, `sessao:<id>`, `anki:<id>`, `trilha`. */
export function chaveDaFonte(f: FonteDeConteudo): string {
  return f.tipo === 'sessao' || f.tipo === 'anki' ? `${f.tipo}:${f.id}` : f.tipo;
}

export const mesmaFonte = (a: FonteDeConteudo, b: FonteDeConteudo) => chaveDaFonte(a) === chaveDaFonte(b);

export function mesmoConteudo(a: Conteudo, b: Conteudo): boolean {
  if (a.idioma !== b.idioma || !mesmaFonte(a.fonte, b.fonte)) return false;
  const nome = (f: FonteDeConteudo) => (f.tipo === 'sessao' || f.tipo === 'anki' ? f.nome : '');
  return nome(a.fonte) === nome(b.fonte);
}

/** Lê o que estava guardado (conta ou aparelho). Qualquer coisa fora do formato vira o padrão. */
export function lerConteudo(cru: unknown): Conteudo {
  if (!cru || typeof cru !== 'object') return CONTEUDO_PADRAO;
  const o = cru as { idioma?: unknown; fonte?: unknown };
  const f = (o.fonte ?? {}) as { tipo?: unknown; id?: unknown; nome?: unknown };
  let fonte: FonteDeConteudo = TUDO;
  if (f.tipo === 'dificeis' || f.tipo === 'trilha') fonte = { tipo: f.tipo };
  else if ((f.tipo === 'sessao' || f.tipo === 'anki') && typeof f.id === 'string' && f.id)
    fonte = { tipo: f.tipo, id: f.id.slice(0, 200), nome: typeof f.nome === 'string' ? f.nome.slice(0, 300) : '' };
  return { idioma: base(o.idioma), fonte };
}

/**
 * `fxEscolher()` de `seletor.js:50-71`: a fonte vira a escolha; se ela é de um idioma (sessão, baralho),
 * o idioma acompanha.
 */
export function escolher(c: Conteudo, fonte: FonteDeConteudo, idiomaDaFonte = ''): Conteudo {
  return { idioma: base(idiomaDaFonte) || c.idioma, fonte };
}

/** O "x" da ficha (`data-fs="tudo"`, `fontes.js:474`): volta para "Tudo" em um toque, no mesmo idioma. */
export const voltarParaTudo = (c: Conteudo): Conteudo => ({ idioma: c.idioma, fonte: TUDO });

/**
 * `fsMudarIdioma()` de `seletor.js:72-82`: a fonte de um idioma não existe no outro, então sessão e
 * baralho voltam para "Tudo" (deste idioma). Tudo, Difíceis e Trilha existem em todos.
 */
export function mudarIdioma(c: Conteudo, idioma: string): Conteudo {
  const k = base(idioma);
  if (!k || k === c.idioma) return c;
  const presa = c.fonte.tipo === 'sessao' || c.fonte.tipo === 'anki';
  return { idioma: k, fonte: presa ? TUDO : c.fonte };
}

/** A linha do catálogo que corresponde à fonte, ou `null` se ela não está lá. */
export function contagemDaFonte(f: FonteDeConteudo, k: ContagensDeConteudo): ContagemDaFonte | FonteContada | null {
  if (f.tipo === 'tudo') return k.tudo;
  if (f.tipo === 'dificeis') return k.dificeis;
  if (f.tipo === 'trilha') return k.trilha;
  return (f.tipo === 'sessao' ? k.sessoes : k.anki).find((x) => x.id === f.id) ?? null;
}

/**
 * CONFERE A ESCOLHA COM O QUE EXISTE. A sessão apagada, o baralho removido e a Trilha sem palavra
 * voltam para "Tudo", sem erro; o idioma passa a ser o que o catálogo aplicou (o que sumiu cai no
 * maior da conta); o nome lembrado se atualiza (a sessão foi renomeada).
 *
 * `k` tem de ser a leitura feita COM o idioma de `c` (quem chama garante): as sessões e os baralhos
 * que ela lista são só os do idioma aplicado.
 */
export function sanear(c: Conteudo, k: ContagensDeConteudo): Conteudo {
  const idioma = k.idioma || (k.idiomas.length === 1 ? k.idiomas[0].id : c.idioma);
  let fonte = c.fonte;
  if (fonte.tipo === 'sessao' || fonte.tipo === 'anki') {
    const id = fonte.id;
    const linha = (fonte.tipo === 'sessao' ? k.sessoes : k.anki).find((x) => x.id === id);
    if (!linha) fonte = TUDO;
    else if (linha.nome && linha.nome !== fonte.nome) fonte = { ...fonte, nome: linha.nome };
  } else if (fonte.tipo === 'trilha' && !k.trilha) fonte = TUDO;
  return idioma === c.idioma && fonte === c.fonte ? c : { idioma, fonte };
}
