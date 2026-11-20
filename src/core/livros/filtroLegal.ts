/**
 * O FILTRO LEGAL DO CATÁLOGO (spec de Livros & Leitura, Design §1). Função pura: o relógio entra por parâmetro.
 *
 * No Brasil a obra entra em domínio público 70 anos contados de 1º de janeiro do ano seguinte à morte do
 * autor (Lei 9.610, art. 41). Morto em 1955, a obra é livre desde 1º/1/2026; morto em 1956, só em 2027.
 * Daí `anoLimite = ano − 71`. A tradução tem direito próprio (art. 14): o tradutor obedece à mesma regra.
 * "Domínio público nos EUA" não basta, e por isso nada aqui confia no rótulo da fonte.
 *
 * As regras, na ordem em que a primeira que falha vira o motivo:
 *   1. a fonte é uma das aceitas;
 *   2. há autor (obra anônima só entra pela lista de exceções revisada, que o chamador aplica antes);
 *   3. todo autor tem ano de morte, e ele é ≤ `anoLimite`;
 *   4. o que É TRADUÇÃO tem tradutor identificado (ver `ehTraducao`: na dúvida, é tradução);
 *   5. todo tradutor tem ano de morte, e ele é ≤ `anoLimite`.
 * Sem ano de morte, FORA: na dúvida, o livro não entra.
 */
import { FONTES_DO_LIVRO, type MotivoDeExclusao, type Pessoa } from './tipos';

/** O ano de morte mais recente que entra no catálogo montado no ano `ano`. */
export function anoLimite(ano: number): number {
  return ano - 71;
}

/**
 * O ANO CIVIL NO BRASIL (America/Sao_Paulo). A virada que importa para a Lei 9.610 é 1º de janeiro aqui: às
 * 23h de 31/12 em São Paulo já é 1º/1 em UTC, e um relógio em UTC liberaria uma obra algumas horas antes.
 */
export function anoEmSaoPaulo(agora: Date): number {
  // ast-grep-ignore: locale-cravado — locale de MÁQUINA: só extrai os dígitos do ano para a conta da lei; ninguém lê este texto.
  const ano = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(agora);
  return Number(ano);
}

export interface MetadadosLegais {
  autores: readonly Pessoa[];
  tradutores: readonly Pessoa[];
  /** O idioma do TEXTO que vai ser lido (código de duas letras). */
  idioma: string;
  /** A fonte ou o próprio texto diz que é tradução ("translated by", `trl` no OPF, P655 na Wikidata). */
  traducaoDeclarada?: boolean;
  fonte: string;
}

export type Veredito = { entra: true } | { entra: false; motivo: MotivoDeExclusao; detalhe: string };

const lista = (ps: readonly Pessoa[]) => ps.map((p) => p.nome).join(', ');

/**
 * É TRADUÇÃO? Sim quando há tradutor, quando a fonte ou o texto dizem que é, e quando NÃO DÁ PARA CONFIRMAR
 * que cada autor escrevia no idioma do texto (`idiomas` vem da Wikidata: idioma de escrita, idiomas falados
 * ou escritos, língua materna; ou da lista manual revisada). Falha fechada: autor sem idioma conhecido conta
 * como tradução, e tradução sem tradutor identificado não entra.
 */
export function ehTraducao(
  m: Pick<MetadadosLegais, 'autores' | 'tradutores' | 'idioma' | 'traducaoDeclarada'>,
): boolean {
  if (m.tradutores.length > 0 || m.traducaoDeclarada) return true;
  return !m.autores.every((a) => !!a.idiomas?.length && a.idiomas.includes(m.idioma));
}

export function avaliarLegalidade(m: MetadadosLegais, ano: number): Veredito {
  const limite = anoLimite(ano);
  if (!(FONTES_DO_LIVRO as readonly string[]).includes(m.fonte)) {
    return { entra: false, motivo: 'fonte-nao-aceita', detalhe: `fonte "${m.fonte}" fora da lista` };
  }
  if (m.autores.length === 0) {
    return { entra: false, motivo: 'sem-autor', detalhe: 'obra sem autor identificado' };
  }
  const autorSemAno = m.autores.filter((a) => a.anoMorte == null);
  if (autorSemAno.length) {
    return {
      entra: false,
      motivo: 'autor-sem-ano-de-morte',
      detalhe: `sem o ano de morte de ${lista(autorSemAno)}`,
    };
  }
  const autorProtegido = m.autores.find((a) => (a.anoMorte as number) > limite);
  if (autorProtegido) {
    return {
      entra: false,
      motivo: 'autor-protegido',
      detalhe: `${autorProtegido.nome} morreu em ${autorProtegido.anoMorte}; a obra fica livre no Brasil em ${(autorProtegido.anoMorte as number) + 71}`,
    };
  }
  if (ehTraducao(m) && m.tradutores.length === 0) {
    const semIdioma = m.autores.filter((a) => !a.idiomas?.length);
    const detalhe = m.traducaoDeclarada
      ? 'a fonte diz que é tradução, sem tradutor identificado'
      : semIdioma.length
        ? `não deu para confirmar o idioma em que ${lista(semIdioma)} escrevia; tratado como tradução sem tradutor`
        : 'o autor não escrevia neste idioma: é tradução, sem tradutor identificado';
    return { entra: false, motivo: 'traducao-sem-tradutor', detalhe };
  }
  const tradutorSemAno = m.tradutores.filter((t) => t.anoMorte == null);
  if (tradutorSemAno.length) {
    return {
      entra: false,
      motivo: 'tradutor-sem-ano-de-morte',
      detalhe: `sem o ano de morte do tradutor (${lista(tradutorSemAno)})`,
    };
  }
  const tradutorProtegido = m.tradutores.find((t) => (t.anoMorte as number) > limite);
  if (tradutorProtegido) {
    return {
      entra: false,
      motivo: 'tradutor-protegido',
      detalhe: `o tradutor ${tradutorProtegido.nome} morreu em ${tradutorProtegido.anoMorte}; a tradução fica livre no Brasil em ${(tradutorProtegido.anoMorte as number) + 71}`,
    };
  }
  return { entra: true };
}

/** Atalho booleano. */
export function entraNoCatalogo(m: MetadadosLegais, ano: number): boolean {
  return avaliarLegalidade(m, ano).entra;
}

/**
 * A DEFESA DUPLA DO CLIENTE: o mesmo filtro, de novo, sobre cada livro do JSON publicado, com o ano-limite
 * MAIS RESTRITIVO entre o que o catálogo declara e o que o relógio do Brasil dá (`anoEmSaoPaulo − 71`). Um
 * catálogo montado com `--ano` adiantado, ou com o `anoLimite` editado à mão, não libera obra protegida; um
 * livro sem ano de morte, ou tradução sem tradutor, cai aqui mesmo que o script o tenha deixado passar.
 * O que ela NÃO pega: um ano de morte errado no próprio JSON (aí só a revisão da fonte resolve).
 */
export function passaNaDefesaDoCliente(
  livro: Pick<MetadadosLegais, 'autores' | 'tradutores' | 'idioma' | 'traducaoDeclarada' | 'fonte'>,
  anoLimitePublicado: number,
  agora: Date,
): boolean {
  const limite = Math.min(anoLimitePublicado, anoLimite(anoEmSaoPaulo(agora)));
  return avaliarLegalidade(livro, limite + 71).entra;
}
