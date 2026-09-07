/**
 * A CURVA DE XP NO TEMPO — pura, e por isso a MESMA nas duas pontas.
 *
 * Ela nasceu só no servidor (`computeXpHistory`), e o modo sem conta não tinha `/api/metrics/xp`:
 * a aba de Progresso levava um 501 e o gráfico ficava vazio para quem estuda sem conta. Copiar a
 * agregação para o servidor efêmero resolveria a tela e criaria a segunda verdade — setenta linhas
 * de "some evento por balde" que concordariam só enquanto ninguém mexesse numa delas.
 *
 * Então ela virou esta função, que recebe LINHAS e devolve a curva. O servidor entrega linhas do
 * SQLite, o modo sem conta entrega linhas do IndexedDB, e a fórmula é uma só — a mesma postura de
 * `economiaDeMetricas` e de `chaveDedup`.
 *
 * O QUE ENTRA NA CURVA, e o que não entra:
 *   · ENTRA o que tem carimbo de tempo próprio: sessões e as palavras delas, revisões e acertos,
 *     itens de jogo.
 *   · NÃO ENTRA o XP de conquista, presença, marcos de sequência e rodadas perfeitas. Os dois
 *     primeiros têm carimbo e caberiam; os dois últimos são agregados derivados, e situá-los no
 *     tempo exige decidir em que DIA um marco "acontece".
 *
 * A CONSEQUÊNCIA HONESTA, e ela fica escrita porque a tela precisa repetir: o último ponto do
 * gráfico fica ABAIXO do XP que o distintivo mostra, pela soma dos termos de fora. O gráfico
 * responde "quando eu subi de nível?", que é a pergunta dele.
 *
 * A RESSALVA: isto é reconstrução SOB A FÓRMULA ATUAL, não um livro-razão. Mudar os pesos
 * reescreve o passado. É aceitável porque é a mesma propriedade que o número de hoje sempre teve;
 * o que não seria aceitável é fingir um registro histórico que não existe.
 */
import { xpDeEventos, nivelDoXp, type EventosDeXp } from './xp';

export type BaldeDeXp = 'dia' | 'semana';

export interface PontoDeXp {
  /** Início do balde, epoch ms (meia-noite local do dia, ou do domingo da semana). */
  em: number;
  xpNoPeriodo: number;
  xpAcumulado: number;
  nivel: number;
}

export interface MarcoDeNivel {
  em: number;
  nivel: number;
}

export interface HistoricoDeXp {
  pontos: PontoDeXp[];
  /** "Saiu do 1 para o 2 em tal dia" — o que a pessoa pediu para ver. */
  marcos: MarcoDeNivel[];
  /** O total acumulado até hoje, sob a fórmula atual. */
  xpTotal: number;
}

/** As linhas que a curva precisa, na forma mínima que as duas pontas conseguem produzir. */
export interface LinhasDoHistorico {
  /** Uma por gravação: quando aconteceu e quantas palavras trouxe. */
  sessoes: Array<{ em: number; palavras: number }>;
  /** Uma por revisão de SRS: quando e se foi acerto (nota ≥ 3). */
  revisoes: Array<{ em: number; certa: boolean }>;
  /** Uma por item de jogo que NÃO virou revisão (`kind === 'drill'`). */
  itensDeJogo: Array<{ em: number; certo: boolean }>;
}

/** Meia-noite local do dia, ou o domingo da semana. Local, e não UTC: o dia é o do usuário. */
export function inicioDoBalde(ts: number, balde: BaldeDeXp): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  if (balde === 'semana') d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

export function historicoDeXp(
  linhas: LinhasDoHistorico,
  opts: { balde?: BaldeDeXp; desde?: number } = {},
): HistoricoDeXp {
  const balde = opts.balde ?? 'dia';

  /* Um acumulador por balde. Guardamos os EVENTOS, não o XP: assim `xpDeEventos` é aplicada uma
     vez só, no fim, e continua sendo a única definição da fórmula. */
  const porBalde = new Map<number, EventosDeXp>();
  const somar = (ts: number, patch: Partial<EventosDeXp>) => {
    const chave = inicioDoBalde(ts, balde);
    const atual = porBalde.get(chave)
      ?? { sessoes: 0, palavrasCapturadas: 0, revisoes: 0, revisoesCertas: 0, itensDeJogo: 0, itensDeJogoCertos: 0 };
    porBalde.set(chave, {
      sessoes: atual.sessoes + (patch.sessoes ?? 0),
      palavrasCapturadas: atual.palavrasCapturadas + (patch.palavrasCapturadas ?? 0),
      revisoes: atual.revisoes + (patch.revisoes ?? 0),
      revisoesCertas: atual.revisoesCertas + (patch.revisoesCertas ?? 0),
      itensDeJogo: (atual.itensDeJogo ?? 0) + (patch.itensDeJogo ?? 0),
      itensDeJogoCertos: (atual.itensDeJogoCertos ?? 0) + (patch.itensDeJogoCertos ?? 0),
    });
  };

  /* A sessão e as palavras dela caem no MESMO instante: a contagem mora na linha da sessão, não
     numa tabela de palavras com data própria. É a aproximação certa — as palavras foram
     capturadas naquela gravação. */
  for (const s of linhas.sessoes) somar(s.em, { sessoes: 1, palavrasCapturadas: s.palavras });
  for (const r of linhas.revisoes) somar(r.em, { revisoes: 1, revisoesCertas: r.certa ? 1 : 0 });
  for (const i of linhas.itensDeJogo) somar(i.em, { itensDeJogo: 1, itensDeJogoCertos: i.certo ? 1 : 0 });

  const chaves = [...porBalde.keys()].sort((a, b) => a - b);

  let acumulado = 0;
  let nivelAnterior = 1;
  const pontos: PontoDeXp[] = [];
  const marcos: MarcoDeNivel[] = [];

  for (const em of chaves) {
    const xpNoPeriodo = xpDeEventos(porBalde.get(em)!);
    acumulado += xpNoPeriodo;
    const nivel = nivelDoXp(acumulado);

    /* Um balde pode cruzar MAIS DE UM nível (uma maratona de estudo). Cada travessia vira um
       marco, senão a tela mostraria "subiu para o 5" sem nunca ter mencionado o 3 e o 4. */
    for (let n = nivelAnterior + 1; n <= nivel; n++) marcos.push({ em, nivel: n });
    nivelAnterior = nivel;

    // O recorte por data é aplicado DEPOIS do acúmulo: o "desde" corta a visão, não a história.
    if (!opts.desde || em >= inicioDoBalde(opts.desde, balde)) {
      pontos.push({ em, xpNoPeriodo, xpAcumulado: acumulado, nivel });
    }
  }

  return { pontos, marcos, xpTotal: acumulado };
}
