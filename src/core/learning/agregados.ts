/**
 * AGREGADOS DIÁRIOS: a conta, pura, que transforma revisões e itens de jogo em células por
 * (idioma, dia). É UMA função para os dois usos (change `modelo-do-aluno-e-dados`, tarefa 2.1):
 *
 *  · a ESCRITA entrega um evento (uma revisão, os itens de uma rodada) e recebe as células a somar;
 *  · a RECONSTRUÇÃO entrega o bruto já agrupado (por quarto de hora, idioma, nota…) e recebe as
 *    células inteiras.
 *
 * Como as duas passam pela mesma conta, "somado na escrita" e "recontado do bruto" não têm como
 * divergir por definição diferente; só por escrita feita por fora, e essa o servidor detecta
 * (`estado_dos_agregados`, migração 0053).
 *
 * O DIA não é decidido aqui: quem chama entrega `diaDe(carimbo)`. No servidor é o dia local no fuso
 * gravado do usuário (`diaNumeroNoFuso`), o mesmo da ofensiva e das missões.
 */

/** Os contadores de uma célula. Todos somáveis: célula = soma dos eventos daquele idioma e dia. */
export interface ContadoresDoDia {
  /** Revisões que aconteceram, inclusive as desfeitas e as de cartão apagado (é o que o perfil conta). */
  revisoes: number;
  /** Dessas, as de nota >= 3 (o "acerto" do perfil e do XP). */
  acertos: number;
  /** Revisões que continuam no histórico (`deleted_at` nulo): o que a Memória dos Cartões conta. */
  revisoesVivas: number;
  /** As vivas, por nota (1 Errei, 2 Difícil, 3 Bom, 4 Fácil). Viva sem nota não entra em nenhuma. */
  nota1: number;
  nota2: number;
  nota3: number;
  nota4: number;
  /** Vivas que foram a PRIMEIRA revisão do cartão (não havia estabilidade antes). */
  novas: number;
  /** Soma do tempo de resposta das vivas que o mediram (ms). */
  tempoRevisaoMs: number;
  /** Vivas com retenção prevista gravada, a soma dessas previsões e quantas foram lembradas (nota >= 2). */
  comPrevisao: number;
  somaPrevista: number;
  lembradasComPrevisao: number;
  /** Itens de jogo ou de estudo gravados, e os certos. */
  itensDeJogo: number;
  itensCertos: number;
  /** Dos itens, os que NÃO viraram revisão (`kind = 'drill'`): é o que o XP conta. */
  itensDrill: number;
  itensDrillCertos: number;
  /** Soma do tempo de resposta dos itens (ms). */
  tempoJogoMs: number;
  /** Rodadas (`round_id` distinto) começadas no dia. */
  rodadas: number;
}

export interface CelulaDoDia extends ContadoresDoDia {
  /** Base do idioma do cartão ('en'); '' quando o item não tem cartão. */
  idioma: string;
  dia: number;
}

export const CONTADORES_DO_DIA: ReadonlyArray<keyof ContadoresDoDia> = [
  'revisoes',
  'acertos',
  'revisoesVivas',
  'nota1',
  'nota2',
  'nota3',
  'nota4',
  'novas',
  'tempoRevisaoMs',
  'comPrevisao',
  'somaPrevista',
  'lembradasComPrevisao',
  'itensDeJogo',
  'itensCertos',
  'itensDrill',
  'itensDrillCertos',
  'tempoJogoMs',
  'rodadas',
];

/** Um grupo de `n` revisões iguais no que a conta enxerga. Um evento sozinho é `n = 1`. */
export interface GrupoDeRevisoes {
  /** Um carimbo qualquer do grupo; todo o grupo cai no mesmo dia. */
  em: number;
  idioma: string | null;
  grade: number | null;
  /** `deleted_at` nulo. */
  viva: boolean;
  /** Primeira revisão do cartão (`prev_stability` nulo). */
  nova: boolean;
  /** Quantas revisões; negativo para tirar (uma revisão desfeita). */
  n: number;
  /** Soma dos tempos de resposta do grupo (ms). */
  respostaMs?: number;
  /** Quantas do grupo têm retenção prevista, e a soma delas. */
  comPrevisao?: number;
  somaPrevista?: number;
  /**
   * Mexe só nos contadores das VIVAS. É a revisão que deixa de estar viva (desfeita, ou cartão
   * apagado): ela continua em `revisoes` e `acertos`, e sai do resto.
   */
  soParteViva?: boolean;
}

/** Um grupo de `n` itens de jogo iguais no que a conta enxerga. */
export interface GrupoDeItens {
  em: number;
  idioma: string | null;
  /** `kind = 'drill'`: não virou revisão. */
  drill: boolean;
  n: number;
  /** Quantos do grupo foram certos (`correct > 0`). */
  certos: number;
  /** Soma dos tempos (ms). */
  ms?: number;
}

/** Uma rodada: conta uma vez, no dia em que começou, no idioma `idiomaDaRodada` dos itens dela. */
export interface RodadaAgregavel {
  em: number;
  idioma: string | null;
}

/**
 * O idioma em que uma rodada é contada: o menor (ordem de texto) entre os idiomas dos itens, com ''
 * para item sem cartão. Regra arbitrária, mas fixa e reproduzível em SQL (`min`), que é o que a
 * reconstrução precisa.
 */
export function idiomaDaRodada(idiomas: ReadonlyArray<string | null | undefined>): string {
  let menor: string | null = null;
  for (const i of idiomas) {
    const v = i ?? '';
    if (menor === null || v < menor) menor = v;
  }
  return menor ?? '';
}

function celulaVazia(idioma: string, dia: number): CelulaDoDia {
  return {
    idioma,
    dia,
    revisoes: 0,
    acertos: 0,
    revisoesVivas: 0,
    nota1: 0,
    nota2: 0,
    nota3: 0,
    nota4: 0,
    novas: 0,
    tempoRevisaoMs: 0,
    comPrevisao: 0,
    somaPrevista: 0,
    lembradasComPrevisao: 0,
    itensDeJogo: 0,
    itensCertos: 0,
    itensDrill: 0,
    itensDrillCertos: 0,
    tempoJogoMs: 0,
    rodadas: 0,
  };
}

/**
 * Soma os grupos em células. A saída vem ordenada por (idioma, dia) e sem células zeradas, para a
 * comparação entre "somado" e "recontado" não depender da ordem de chegada.
 */
export function agregarPorDia(
  entrada: {
    revisoes?: ReadonlyArray<GrupoDeRevisoes>;
    itens?: ReadonlyArray<GrupoDeItens>;
    rodadas?: ReadonlyArray<RodadaAgregavel>;
  },
  diaDe: (em: number) => number,
): CelulaDoDia[] {
  const celulas = new Map<string, CelulaDoDia>();
  const celula = (idioma: string | null, em: number): CelulaDoDia => {
    const i = idioma ?? '';
    const dia = diaDe(em);
    const chave = `${i}|${dia}`;
    let c = celulas.get(chave);
    if (!c) {
      c = celulaVazia(i, dia);
      celulas.set(chave, c);
    }
    return c;
  };

  for (const g of entrada.revisoes ?? []) {
    if (!g.n) continue;
    const c = celula(g.idioma, g.em);
    const nota = g.grade ?? 0;
    if (!g.soParteViva) {
      c.revisoes += g.n;
      if (nota >= 3) c.acertos += g.n;
    }
    if (!g.viva) continue;
    c.revisoesVivas += g.n;
    if (nota === 1) c.nota1 += g.n;
    else if (nota === 2) c.nota2 += g.n;
    else if (nota === 3) c.nota3 += g.n;
    else if (nota === 4) c.nota4 += g.n;
    if (g.nova) c.novas += g.n;
    c.tempoRevisaoMs += g.respostaMs ?? 0;
    c.comPrevisao += g.comPrevisao ?? 0;
    c.somaPrevista += g.somaPrevista ?? 0;
    if (nota >= 2) c.lembradasComPrevisao += g.comPrevisao ?? 0;
  }

  for (const g of entrada.itens ?? []) {
    if (!g.n) continue;
    const c = celula(g.idioma, g.em);
    c.itensDeJogo += g.n;
    c.itensCertos += g.certos;
    if (g.drill) {
      c.itensDrill += g.n;
      c.itensDrillCertos += g.certos;
    }
    c.tempoJogoMs += g.ms ?? 0;
  }

  for (const r of entrada.rodadas ?? []) celula(r.idioma, r.em).rodadas += 1;

  return [...celulas.values()]
    .filter((c) => CONTADORES_DO_DIA.some((k) => c[k] !== 0))
    .sort((a, b) => (a.idioma < b.idioma ? -1 : a.idioma > b.idioma ? 1 : a.dia - b.dia));
}
