/**
 * AS MISSÕES DO DIA E O CONGELAMENTO DA OFENSIVA (recompensas v2, onda 5 — spec §7.2 e §8.2).
 *
 * TRÊS MISSÕES POR DIA, sorteadas de um conjunto pequeno — revisar N palavras, salvar N palavras
 * da captura, fechar rodadas de 2+ estrelas, praticar um jogo nunca jogado — e sorteadas de modo
 * DETERMINÍSTICO: a semente é o próprio dia. O servidor e o navegador chegam às mesmas três sem
 * guardar nada, e recarregar a página não troca a missão de ninguém. Nenhuma missão mede tempo
 * (Decreto 12.880/2026, art. 9º): todas contam RESULTADO gravado.
 *
 * A META DO DIA (`meta:<AAAA-MM-DD>`, 15 Seeds / 20 XP) passa a ser "as três missões fechadas" —
 * substitui os 20 acertos provisórios da onda 2. Quem confere é o servidor, sobre as linhas
 * gravadas, com `missoesComProgresso`; o cliente só pede.
 *
 * O DIA DE UMA RODADA É O DIA EM QUE ELA COMEÇOU. A rodada é gravada no fim; quem começa às
 * 23:59 e termina às 00:01 fez a rodada do dia anterior. O servidor grava `created_at` como o
 * INÍCIO (`inicioDaRodada`: agora menos a duração, com teto), e daí em diante tudo que lê o
 * carimbo — missões, meta, ofensiva — concorda sobre o dia.
 *
 * O CONGELAMENTO (`ofensivaComCongelamento`): a meta do dia cumprida rende 1 congelamento por
 * semana (segunda a domingo), guardando no máximo 2; um dia sem prática no meio de uma ofensiva
 * ativa gasta 1 automaticamente e a ofensiva não quebra. Derivado do histórico, nunca comprado,
 * nunca ganho por tempo.
 *
 * Regra deste arquivo: TS puro — roda no Node (Express) e no navegador (espelho sem conta).
 */
import { diaNoFuso } from './learning/economia';
import { PESOS_SEEDS, PESOS_XP } from './learning/xp';
import { ehJogo } from './maestria';
import { estrelasDaRodada } from './minigames/fases';
import { type MinigameId, MINIGAMES } from './minigames/types';

export type TipoDeMissao = 'revisar' | 'palavras' | 'rodadaBoa' | 'jogoNovo';

export interface Missao {
  /** Estável no dia (é o tipo): chave de lista e de notificação. */
  id: TipoDeMissao;
  tipo: TipoDeMissao;
  /** Quanto a missão pede. */
  alvo: number;
  /** Quanto já foi feito no dia (pode passar do alvo; a tela limita). */
  atual: number;
}

/** O que cada tipo pode pedir. Pequeno de propósito: uma meta que cabe num intervalo. */
export const ALVOS_DAS_MISSOES: Readonly<Record<TipoDeMissao, readonly number[]>> = {
  revisar: [10, 15, 20],
  palavras: [3, 5],
  rodadaBoa: [1, 2],
  jogoNovo: [1],
};

/** Ordem de exibição (e de desempate do sorteio). */
const ORDEM: readonly TipoDeMissao[] = ['revisar', 'palavras', 'rodadaBoa', 'jogoNovo'];

/** Estrelas mínimas para a rodada contar na missão — a régua do baú (precisão ≥ 75%). */
export const ESTRELAS_DA_MISSAO = 2;

/** A recompensa da meta do dia — os mesmos pesos que `valorDoCredito('meta:<dia>')` credita. */
export const RECOMPENSA_DA_META = { seeds: PESOS_SEEDS.metaDiaria, xp: PESOS_XP.metaDiaria } as const;

/* FNV-1a de 32 bits + mulberry32: pequeno, sem dependência e igual em qualquer motor JS. */
function semente(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function gerador(s: number): () => number {
  let a = s;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * AS TRÊS MISSÕES DE UM DIA — determinísticas: mesmo dia e mesmo histórico, mesmas missões.
 *
 * `jogosJogados` são os jogos jogados ANTES do dia (`jogosJogadosAntes`): jogar o último jogo
 * inédito no meio do dia não pode trocar as missões daquele dia. "Praticar um jogo novo" só entra
 * quando existe jogo nunca jogado.
 */
export function missoesDoDia(dia: string, historico: { jogosJogados: readonly MinigameId[] }): Missao[] {
  const jogados = new Set(historico.jogosJogados);
  const temJogoNovo = (Object.keys(MINIGAMES) as MinigameId[]).some((j) => !jogados.has(j));
  const tipos = ORDEM.filter((t) => t !== 'jogoNovo' || temJogoNovo);
  const aleatorio = gerador(semente(`missoes:${dia}`));
  // Fisher–Yates com a semente do dia; depois volta à ordem de exibição.
  const embaralhados = [...tipos];
  for (let i = embaralhados.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [embaralhados[i], embaralhados[j]] = [embaralhados[j], embaralhados[i]];
  }
  const escolhidos = new Set(embaralhados.slice(0, 3));
  return ORDEM.filter((t) => escolhidos.has(t)).map((tipo) => {
    const opcoes = ALVOS_DAS_MISSOES[tipo];
    return { id: tipo, tipo, alvo: opcoes[Math.floor(aleatorio() * opcoes.length)], atual: 0 };
  });
}

/** A meta do dia: as três missões fechadas. Lista vazia nunca é meta cumprida. */
export function metaConcluida(m: readonly Missao[]): boolean {
  return m.length > 0 && m.every((x) => x.atual >= x.alvo);
}

/** Falta exatamente uma missão — o gatilho do aviso "missão quase completa". */
export function missaoQuaseCompleta(m: readonly Missao[]): boolean {
  return m.length > 0 && !metaConcluida(m) && m.filter((x) => x.atual >= x.alvo).length === m.length - 1;
}

/* ── O que foi feito num dia, a partir do que está GRAVADO ────────────────────────────────── */

/** Uma linha de `exercise_results` de jogo — o formato de `LinhaDeMaestria`. */
export interface LinhaDeRodada {
  exerciseKind: string | null;
  roundId: string | null;
  correct: number | null;
  createdAt: number;
}

/** Os carimbos que as missões leem. Os dois servidores montam isto das mesmas tabelas. */
export interface FontesDasMissoes {
  /** Carimbos de revisão (`review_logs`). */
  revisoes: readonly number[];
  /** Carimbos das palavras salvas da captura (cartão do caderno que nasceu de uma sessão). */
  palavrasSalvas: readonly number[];
  /** Linhas de rodada de jogo. */
  rodadas: readonly LinhaDeRodada[];
}

interface RodadaAgrupada {
  jogo: MinigameId;
  dia: string;
  estrelas: 0 | 1 | 2 | 3;
}

function agruparRodadas(linhas: readonly LinhaDeRodada[], fuso: string): RodadaAgrupada[] {
  const porRodada = new Map<string, { jogo: MinigameId; em: number; respondidas: number; certas: number }>();
  for (const l of linhas) {
    if (!l.roundId || !ehJogo(l.exerciseKind)) continue;
    const r = porRodada.get(l.roundId) ?? { jogo: l.exerciseKind, em: l.createdAt, respondidas: 0, certas: 0 };
    r.em = Math.min(r.em, l.createdAt);
    if (l.correct != null) {
      r.respondidas += 1;
      if (l.correct > 0) r.certas += 1;
    }
    porRodada.set(l.roundId, r);
  }
  return [...porRodada.values()].map((r) => ({
    jogo: r.jogo,
    dia: diaNoFuso(r.em, fuso),
    estrelas: r.respondidas ? estrelasDaRodada(Math.round((r.certas / r.respondidas) * 100)) : 0,
  }));
}

/** Os jogos com alguma rodada gravada ANTES do dia (no fuso). */
export function jogosJogadosAntes(dia: string, fuso: string, rodadas: readonly LinhaDeRodada[]): MinigameId[] {
  const jogos = new Set<MinigameId>();
  for (const r of agruparRodadas(rodadas, fuso)) if (r.dia < dia) jogos.add(r.jogo);
  return [...jogos];
}

/** O que foi feito no dia, por tipo de missão — conta tudo, esteja o tipo sorteado ou não. */
export function feitosDoDia(dia: string, fuso: string, fontes: FontesDasMissoes): Record<TipoDeMissao, number> {
  const noDia = (t: number) => diaNoFuso(t, fuso) === dia;
  const rodadas = agruparRodadas(fontes.rodadas, fuso);
  const jaJogados = new Set(rodadas.filter((r) => r.dia < dia).map((r) => r.jogo));
  const doDia = rodadas.filter((r) => r.dia === dia);
  return {
    revisar: fontes.revisoes.filter(noDia).length,
    palavras: fontes.palavrasSalvas.filter(noDia).length,
    rodadaBoa: doDia.filter((r) => r.estrelas >= ESTRELAS_DA_MISSAO).length,
    jogoNovo: new Set(doDia.map((r) => r.jogo).filter((j) => !jaJogados.has(j))).size,
  };
}

/**
 * AS MISSÕES DE UM DIA COM O PROGRESSO — a função que o servidor usa para conferir a meta e que
 * o espelho sem conta chama igual. Cada rodada conta no dia em que COMEÇOU (o `createdAt` gravado).
 */
export function missoesComProgresso(dia: string, fuso: string, fontes: FontesDasMissoes): Missao[] {
  const feitos = feitosDoDia(dia, fuso, fontes);
  const antes = jogosJogadosAntes(dia, fuso, fontes.rodadas);
  return missoesDoDia(dia, { jogosJogados: antes }).map((m) => ({ ...m, atual: feitos[m.tipo] }));
}

/* ── O dia de uma rodada ─────────────────────────────────────────────────────────────────── */

/**
 * Teto da duração aceita: uma rodada que diz ter começado há mais de 2 h é tratada como de 2 h.
 * É o limite do quanto um cliente adulterado consegue empurrar uma rodada para o dia anterior —
 * e mesmo assim a rodada conta num dia só, nunca em dois.
 */
export const DURACAO_MAXIMA_DA_RODADA_MS = 2 * 60 * 60 * 1000;

/** O carimbo de INÍCIO de uma rodada gravada agora, a partir da duração que o cliente mediu. */
export function inicioDaRodada(agora: number, duracaoMs: number | null | undefined): number {
  if (typeof duracaoMs !== 'number' || !Number.isFinite(duracaoMs) || duracaoMs <= 0) return agora;
  return agora - Math.min(Math.floor(duracaoMs), DURACAO_MAXIMA_DA_RODADA_MS);
}

/* ── A ofensiva com congelamento ─────────────────────────────────────────────────────────── */

export const MAXIMO_DE_CONGELAMENTOS = 2;

/** `AAAA-MM-DD` -> o número do dia (a mesma unidade de `diaLocal`). `null` se malformado. */
export function numeroDoDia(dia: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/** Semana de segunda a domingo: o dia 0 (01/01/1970) foi uma quinta. */
const semanaDe = (dia: number) => Math.floor((dia + 3) / 7);

export interface HistoricoDaOfensiva {
  /** Dias (número, `diaLocal`) com prática real: revisão, rodada ou palavra salva. */
  diasDePratica: Iterable<number>;
  /** Dias (número) em que a meta do dia foi creditada (`meta:<dia>`). */
  diasDeMeta: Iterable<number>;
  hoje: number;
}

/**
 * A OFENSIVA, com os congelamentos aplicados. Percorre do primeiro dia ao de hoje:
 *   · dia com meta: se a semana ainda não rendeu congelamento, rende 1 (até 2 guardados);
 *   · dia com prática: a ofensiva cresce;
 *   · dia passado sem prática: com ofensiva ativa e congelamento guardado, gasta 1 (o dia fica
 *     "congelado": não soma, não quebra); sem congelamento, a ofensiva zera;
 *   · hoje sem prática ainda não é dia perdido — o dia não acabou.
 */
export function ofensivaComCongelamento(h: HistoricoDaOfensiva): {
  atual: number;
  congelamentos: 0 | 1 | 2;
  congelados: number[];
} {
  const pratica = new Set(h.diasDePratica);
  const metas = new Set(h.diasDeMeta);
  const todos = [...pratica, ...metas].filter((d) => d <= h.hoje);
  if (!todos.length) return { atual: 0, congelamentos: 0, congelados: [] };
  const semanasQueRenderam = new Set<number>();
  let congelamentos = 0;
  let atual = 0;
  const congelados: number[] = [];
  for (let d = Math.min(...todos); d <= h.hoje; d++) {
    if (metas.has(d) && !semanasQueRenderam.has(semanaDe(d))) {
      semanasQueRenderam.add(semanaDe(d));
      congelamentos = Math.min(MAXIMO_DE_CONGELAMENTOS, congelamentos + 1);
    }
    if (pratica.has(d)) atual += 1;
    else if (d < h.hoje) {
      if (atual > 0 && congelamentos > 0) {
        congelamentos -= 1;
        congelados.push(d);
      } else atual = 0;
    }
  }
  return { atual, congelamentos: congelamentos as 0 | 1 | 2, congelados };
}

export function congelamentosDisponiveis(h: HistoricoDaOfensiva): 0 | 1 | 2 {
  return ofensivaComCongelamento(h).congelamentos;
}

/* ── O estado que a rota devolve ─────────────────────────────────────────────────────────── */

export interface EstadoDasMissoes {
  dia: string;
  missoes: Missao[];
  metaConcluida: boolean;
  /** `meta:<dia>` já lançado no razão. */
  metaCreditada: boolean;
  recompensa: { seeds: number; xp: number };
  ofensiva: number;
  congelamentos: 0 | 1 | 2;
}

/** O corpo de `GET /api/metrics/missoes` — montado igual pelos dois servidores. */
export function estadoDasMissoes(entrada: {
  agora: number;
  fuso: string;
  fontes: FontesDasMissoes;
  metasCreditadas: readonly string[];
  ofensiva: { atual: number; congelamentos: 0 | 1 | 2 };
}): EstadoDasMissoes {
  const dia = diaNoFuso(entrada.agora, entrada.fuso);
  const missoes = missoesComProgresso(dia, entrada.fuso, entrada.fontes);
  return {
    dia,
    missoes,
    metaConcluida: metaConcluida(missoes),
    metaCreditada: entrada.metasCreditadas.includes(dia),
    recompensa: { ...RECOMPENSA_DA_META },
    ofensiva: entrada.ofensiva.atual,
    congelamentos: entrada.ofensiva.congelamentos,
  };
}
