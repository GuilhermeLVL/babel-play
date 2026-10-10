/**
 * CALIBRAÇÃO DO FSRS: o que o agendador PREVIU contra o que a pessoa de fato LEMBROU.
 *
 * Só leitura, pura, sem banco: recebe o histórico de revisões e devolve, por faixa de retenção
 * prevista, quantas revisões caíram ali, a média do previsto e a fração lembrada. É a medida que
 * precisa existir ANTES de qualquer ajuste de pesos ou de meta (change `modelo-do-aluno-e-dados`,
 * tarefa 1.3; pesquisa em `docs/auditoria/2026-10-10-ciencia-do-aprendizado-e-dados.md`, seção 11).
 *
 * O QUE CONTA COMO "LEMBROU": nota 2, 3 ou 4. A nota 1 (Errei) é o esquecimento; é a mesma régua do
 * FSRS e da Memória dos Cartões (`resumoDosCartoes`). O perfil usa outra (nota >= 3 é "acerto"), e
 * por isso este número não é o "acerto" do perfil.
 *
 * O QUE FICA DE FORA:
 *  · a PRIMEIRA revisão de um cartão: não havia estabilidade, então não havia previsão;
 *  · revisão sem nota (linha antiga);
 *  · com `soPrimeiraDoDia` (o padrão), as repetições do mesmo cartão no mesmo dia: a previsão do FSRS
 *    vale para a primeira tentativa do dia, e a segunda, minutos depois, mede outra coisa.
 *
 * A previsão vem de `retencaoPrevista` quando a revisão a gravou (migração 0052). Nas antigas ela é
 * recalculada de `prevStability` e `elapsedDays`, que é a mesma conta: `retrievability(t, s)`.
 */
import { retrievability } from './scheduler';

export interface RevisaoParaCalibrar {
  cardId: string;
  /** Quando a nota foi dada (epoch ms). */
  em: number;
  grade: number | null;
  prevStability: number | null;
  elapsedDays: number | null;
  /** A retenção prevista gravada na hora; ausente nas revisões antigas. */
  retencaoPrevista?: number | null;
  /** 'revisao' | 'jogo:<id>'; ausente nas revisões antigas. */
  origem?: string | null;
}

export interface FaixaDeCalibracao {
  /** Limites da faixa de retenção prevista: `de` incluso, `ate` excluso (a última inclui 1). */
  de: number;
  ate: number;
  revisoes: number;
  /** Média da retenção prevista das revisões da faixa; `null` com a faixa vazia. */
  previsto: number | null;
  /** Fração lembrada (nota >= 2); `null` com a faixa vazia. */
  real: number | null;
}

export interface Calibracao {
  /** Quantas revisões entraram na conta (depois dos filtros). */
  revisoes: number;
  /** Quantas ficaram de fora, e por quê. */
  ignoradas: { semPrevisao: number; semNota: number; repetidasNoDia: number };
  /** Média do previsto e fração lembrada, sobre todas as revisões consideradas. */
  previsto: number | null;
  real: number | null;
  /**
   * O erro resumido: raiz da média, ponderada pelo tamanho da faixa, de (previsto − real)². É a
   * "RMSE por faixas" do benchmark público do FSRS. 0 = calibrado; `null` sem revisões.
   */
  erro: number | null;
  faixas: FaixaDeCalibracao[];
}

/** As faixas de retenção prevista: uma para tudo abaixo de 50%, depois de 10 em 10 pontos. */
export const FAIXAS_DE_CALIBRACAO: ReadonlyArray<readonly [number, number]> = [
  [0, 0.5],
  [0.5, 0.6],
  [0.6, 0.7],
  [0.7, 0.8],
  [0.8, 0.9],
  [0.9, 1],
];

/** A retenção que o FSRS previa nesta revisão, ou `null` quando não havia como prever. */
export function previsaoDaRevisao(
  r: Pick<RevisaoParaCalibrar, 'prevStability' | 'elapsedDays' | 'retencaoPrevista'>,
): number | null {
  if (typeof r.retencaoPrevista === 'number' && Number.isFinite(r.retencaoPrevista)) return r.retencaoPrevista;
  if (typeof r.prevStability !== 'number' || !(r.prevStability > 0)) return null;
  const t = typeof r.elapsedDays === 'number' && Number.isFinite(r.elapsedDays) ? r.elapsedDays : 0;
  return retrievability(t, r.prevStability);
}

function faixaDe(previsto: number): number {
  for (let i = 0; i < FAIXAS_DE_CALIBRACAO.length - 1; i++) if (previsto < FAIXAS_DE_CALIBRACAO[i][1]) return i;
  return FAIXAS_DE_CALIBRACAO.length - 1;
}

export function calibracaoDoFsrs(
  historico: ReadonlyArray<RevisaoParaCalibrar>,
  opts: {
    /** Só a primeira nota do dia por cartão (padrão: sim). */
    soPrimeiraDoDia?: boolean;
    /** O dia de um carimbo. Padrão: dia UTC; o servidor passa o dia no fuso do usuário. */
    diaDe?: (em: number) => number;
  } = {},
): Calibracao {
  const soPrimeira = opts.soPrimeiraDoDia ?? true;
  const diaDe = opts.diaDe ?? ((em: number) => Math.floor(em / 86_400_000));
  const ignoradas = { semPrevisao: 0, semNota: 0, repetidasNoDia: 0 };
  const acumulado = FAIXAS_DE_CALIBRACAO.map(() => ({ n: 0, somaPrevisto: 0, lembradas: 0 }));

  /* Em ordem de tempo: "a primeira do dia" é a mais antiga daquele cartão naquele dia. */
  const emOrdem = [...historico].sort((a, b) => a.em - b.em);
  const jaVistas = new Set<string>();
  for (const r of emOrdem) {
    /* A repetição no dia é decidida ANTES dos outros filtros: a segunda nota do dia não vira "a
       primeira" só porque a primeira não tinha nota ou previsão. */
    if (soPrimeira) {
      const chave = `${r.cardId}|${diaDe(r.em)}`;
      if (jaVistas.has(chave)) {
        ignoradas.repetidasNoDia += 1;
        continue;
      }
      jaVistas.add(chave);
    }
    if (r.grade !== 1 && r.grade !== 2 && r.grade !== 3 && r.grade !== 4) {
      ignoradas.semNota += 1;
      continue;
    }
    const previsto = previsaoDaRevisao(r);
    if (previsto === null) {
      ignoradas.semPrevisao += 1;
      continue;
    }
    const f = acumulado[faixaDe(previsto)];
    f.n += 1;
    f.somaPrevisto += previsto;
    if (r.grade >= 2) f.lembradas += 1;
  }

  let total = 0;
  let somaPrevisto = 0;
  let lembradas = 0;
  let somaDoErro = 0;
  const faixas: FaixaDeCalibracao[] = acumulado.map((f, i) => {
    const [de, ate] = FAIXAS_DE_CALIBRACAO[i];
    if (!f.n) return { de, ate, revisoes: 0, previsto: null, real: null };
    const previsto = f.somaPrevisto / f.n;
    const real = f.lembradas / f.n;
    total += f.n;
    somaPrevisto += f.somaPrevisto;
    lembradas += f.lembradas;
    somaDoErro += f.n * (previsto - real) ** 2;
    return { de, ate, revisoes: f.n, previsto, real };
  });

  return {
    revisoes: total,
    ignoradas,
    previsto: total ? somaPrevisto / total : null,
    real: total ? lembradas / total : null,
    erro: total ? Math.sqrt(somaDoErro / total) : null,
    faixas,
  };
}

/** A mesma conta, separada por origem da nota ('revisao', 'jogo:blitz', … e 'sem-origem' no passado). */
export function calibracaoPorOrigem(
  historico: ReadonlyArray<RevisaoParaCalibrar>,
  opts: Parameters<typeof calibracaoDoFsrs>[1] = {},
): Record<string, Calibracao> {
  const porOrigem = new Map<string, RevisaoParaCalibrar[]>();
  for (const r of historico) {
    const k = r.origem || 'sem-origem';
    const lista = porOrigem.get(k);
    if (lista) lista.push(r);
    else porOrigem.set(k, [r]);
  }
  const out: Record<string, Calibracao> = {};
  for (const k of [...porOrigem.keys()].sort()) out[k] = calibracaoDoFsrs(porOrigem.get(k)!, opts);
  return out;
}

/** O teto do tempo de resposta gravado (ms): acima disso é abandono, não lentidão. */
export const TETO_DA_RESPOSTA_MS = 60_000;

/** O tempo de resposta que vai para o registro: inteiro, entre 0 e o teto; `null` se não for número. */
export function tempoDeRespostaGravavel(ms: unknown): number | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null;
  return Math.min(TETO_DA_RESPOSTA_MS, Math.round(ms));
}
