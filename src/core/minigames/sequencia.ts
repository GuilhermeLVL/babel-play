import type { MinigameId, RoundReport } from './types';
import type { PontosDaRodada } from './grade';

/**
 * A SEQUÊNCIA — o fim de uma rodada é o começo da próxima.
 *
 * O DEFEITO QUE ISTO CONSERTA. Terminar uma rodada levava a uma tela com UM botão, que voltava
 * para a grade de jogos. Para jogar de novo era preciso reencontrar a carta (que pode estar em
 * outra página do paginador), clicar, e passar pela antessala outra vez. No perfil infantil o
 * botão até dizia "Jogar de novo" — e não jogava: devolvia à grade igual aos outros.
 *
 * Pior: as duas ações que faltavam ali — "trocar por outras" e "repetir estas" — JÁ EXISTIAM e já
 * funcionavam. Só moravam na tela que aparece ANTES da partida, nunca depois.
 *
 * O QUE ESTE MÓDULO GUARDA. O que sobrevive entre uma rodada e a seguinte: o placar somado, o
 * combo vivo, e — o mais importante — quem já caiu. Nada de React aqui: é a parte que merece
 * teste, e o resto (três funções de ligação) fica em `Play.tsx`, onde já vivem `montarRodada` e
 * `comecar`.
 */
export interface EstadoSequencia {
  jogo: MinigameId;
  /** 'baralho' | 'sessao:<id>' | 'trilha:<nivel>' — congelada: trocar de fonte encerra a corrente. */
  origem: string;
  rodadas: number;
  pontos: number;
  acertos: number;
  total: number;
  xp: number;
  /** O combo VIVO: sai de uma rodada e entra na próxima como `sequenciaInicial`. */
  sequenciaAtual: number;
  melhorSequencia: number;
  /**
   * TUDO o que caiu na corrente inteira, SEM TETO — e este "sem teto" é a peça de segurança.
   *
   * A memória curta de `Play.tsx` (`vistasRecentes`) tem teto de 60 para não virar o baralho
   * inteiro numa maratona. Só que uma corrente longa é exatamente uma maratona: passado o teto, a
   * palavra volta a ser sorteada — e cada volta chama `reviewCard` de novo, mexendo de verdade na
   * estabilidade e na data do agendador. O estrago é invisível por semanas, que é precisamente do
   * que o cabeçalho de `grade.ts` avisa. Aqui não há teto: dentro de UMA corrente, o que já caiu
   * não volta.
   */
  vistosNaSequencia: ReadonlySet<string>;
  /**
   * As palavras da trilha já promovidas a cartão nesta corrente.
   *
   * Os cartões da trilha nascem sem `id`, e o promotor de erradas roda a cada fim de rodada. O
   * `Set` local dele só deduplica DENTRO de uma rodada — errar a mesma palavra em duas rodadas
   * seguidas, antes de o `fetchDeck` voltar, criaria a mesma carta duas vezes.
   */
  jaPromovidas: ReadonlySet<string>;
}

/** Um resumo pronto para a tela, para a UI não recalcular precisão em três lugares. */
export interface ResumoDaSequencia {
  rodadas: number;
  pontos: number;
  acertos: number;
  total: number;
  precisao: number;
  xp: number;
  combo: number;
  melhorSequencia: number;
}

function vazia(jogo: MinigameId, origem: string): EstadoSequencia {
  return {
    jogo, origem,
    rodadas: 0, pontos: 0, acertos: 0, total: 0, xp: 0,
    sequenciaAtual: 0, melhorSequencia: 0,
    vistosNaSequencia: new Set(), jaPromovidas: new Set(),
  };
}

/**
 * A corrente continua? Um único guard responde a três situações que, sem ele, misturariam
 * placares: trocar de jogo, trocar de fonte (baralho → trilha → sessão) e entrar por "Praticar
 * isto" vindo de outra tela. Em qualquer uma delas a corrente anterior acabou.
 */
export function mesmaCorrente(s: EstadoSequencia | null, jogo: MinigameId, origem: string): boolean {
  return !!s && s.jogo === jogo && s.origem === origem;
}

/**
 * Soma uma rodada à corrente — ou começa uma nova, se o guard disser que não é a mesma.
 *
 * `xp` vem de fora (de `xpFromRound`) para este módulo não precisar conhecer a fórmula do XP: ela
 * já mora em `grade.ts` e ter duas seria ter duas.
 */
export function acumular(
  anterior: EstadoSequencia | null,
  report: RoundReport,
  pontos: PontosDaRodada,
  origem: string,
  xpDaRodada: number,
): EstadoSequencia {
  const base = mesmaCorrente(anterior, report.gameId, origem)
    ? (anterior as EstadoSequencia)
    : vazia(report.gameId, origem);

  const acertos = report.items.filter(o => o.correct && !o.revealed).length;
  const vistos = new Set(base.vistosNaSequencia);
  for (const o of report.items) if (o.itemRef) vistos.add(o.itemRef);

  return {
    ...base,
    rodadas: base.rodadas + 1,
    pontos: base.pontos + pontos.total,
    acertos: base.acertos + acertos,
    total: base.total + report.items.length,
    xp: base.xp + xpDaRodada,
    sequenciaAtual: pontos.sequenciaFinal,
    melhorSequencia: Math.max(base.melhorSequencia, pontos.melhorSequencia),
    vistosNaSequencia: vistos,
  };
}

/** Registra o que a trilha já promoveu, para a rodada seguinte não promover de novo. */
export function marcarPromovidas(s: EstadoSequencia, refs: Iterable<string>): EstadoSequencia {
  const juntas = new Set(s.jaPromovidas);
  for (const r of refs) if (r) juntas.add(r);
  return { ...s, jaPromovidas: juntas };
}

export function resumir(s: EstadoSequencia | null): ResumoDaSequencia | null {
  if (!s || !s.rodadas) return null;
  return {
    rodadas: s.rodadas,
    pontos: s.pontos,
    acertos: s.acertos,
    total: s.total,
    precisao: s.total ? Math.round((s.acertos / s.total) * 100) : 0,
    xp: s.xp,
    combo: s.sequenciaAtual,
    melhorSequencia: s.melhorSequencia,
  };
}
