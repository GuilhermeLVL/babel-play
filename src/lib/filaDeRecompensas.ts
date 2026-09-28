/**
 * A FILA DE RECOMPENSAS — o que o modal de resgate (`RecompensaDesbloqueada`) mostra, sem o modal.
 *
 * Mora fora do componente para o ARRANQUE não carregar o modal: o App, o Play, a barra de maestria
 * e os hooks de estado precisam dos tipos, dos eventos e da fila desde a primeira pintura, mas o
 * modal (com as prévias, a miniatura e o motor de comemoração) só quando há o que mostrar. Ele vem
 * por `import()` no App (orçamento do bundle, `scripts/perf/orcamento-bundle.mjs`).
 */
import { type MinigameId, type NivelAlcancavel, PESOS_SEEDS } from '@core';

import type { ItemDaLoja } from './loja';

export type Recompensa =
  | { tipo: 'nivel'; nivel: number; itens: ItemDaLoja[] }
  | { tipo: 'conquista'; id: string; nome: string; seeds: number; xp: number; item?: ItemDaLoja }
  /* O bau de fim de rodada. A chave e o `roundId` porque o drop e idempotente POR rodada no
     servidor: repetir o mesmo id devolve o mesmo item, entao repetir a tela seria mostrar duas
     vezes o mesmo premio. BAÚ v2: sem `item` (e com `repetido`) a faixa sorteada nao tinha peca
     nova e o bau pagou Seeds; `chances` e `proximoRaroGarantidoEm` vao para a tela como vieram. */
  | {
      tipo: 'drop';
      roundId: string;
      seeds: number;
      item?: ItemDaLoja;
      repetido?: boolean;
      raridade?: 'comum' | 'raro';
      chances?: { comum: number; raro: number };
      proximoRaroGarantidoEm?: number;
    }
  /* A MAESTRIA DE UM JOGO subiu de nível (recompensas v2, onda 3). As Seeds são as da regra
     (`nivelDeMaestria × nível`), creditadas pelo servidor depois de conferir os pontos. */
  | { tipo: 'maestria'; jogo: MinigameId; nivel: NivelAlcancavel; seeds: number; itens: ItemDaLoja[] };

export const EVENTO_RODADA_FECHOU = 'babel:rodada-fechou';
/** O bau da rodada saiu. `detail` traz o que o SERVIDOR sorteou; o App resolve o id no catalogo. */
export const EVENTO_DROP_GANHO = 'babel:drop-ganho';
/** A barra de maestria cruzou um limiar. `detail`: `{ jogo, nivel }`. */
export const EVENTO_MAESTRIA_SUBIU = 'babel:maestria-subiu';
export interface DetalheDaMaestria {
  jogo: MinigameId;
  nivel: NivelAlcancavel;
}
/** A recompensa de um nível de maestria, com as Seeds da regra. */
export function recompensaDaMaestria(jogo: MinigameId, nivel: NivelAlcancavel, itens: ItemDaLoja[]): Recompensa {
  return { tipo: 'maestria', jogo, nivel, seeds: PESOS_SEEDS.nivelDeMaestria * nivel, itens };
}
export interface DetalheDoDrop {
  roundId: string;
  /** `null` = sem peça: o baú virou Seeds (`repetido`) ou o teto do dia foi alcançado (`semBau`). */
  itemId: string | null;
  seeds: number;
  repetido?: boolean;
  raridade?: 'comum' | 'raro';
  chances?: { comum: number; raro: number };
  proximoRaroGarantidoEm?: number;
  semBau?: 'teto';
  limite?: number;
}
const CHAVE_VISTAS = 'babel.recompensas_vistas';

export function chaveDaRecompensa(r: Recompensa): string {
  if (r.tipo === 'nivel') return `nivel:${r.nivel}`;
  if (r.tipo === 'drop') return `drop:${r.roundId}`;
  if (r.tipo === 'maestria') return `maestria:${r.jogo}:${r.nivel}`;
  return `conquista:${r.id}`;
}
export function recompensasVistas(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE_VISTAS) || '[]') as string[]);
  } catch {
    return new Set();
  }
}
export function marcarVista(r: Recompensa): void {
  try {
    const v = recompensasVistas();
    v.add(chaveDaRecompensa(r));
    localStorage.setItem(CHAVE_VISTAS, JSON.stringify([...v].slice(-200)));
  } catch {
    /* sem storage */
  }
}
/**
 * A fila não repete: as conquistas são reavaliadas a cada métrica nova, e antes de o usuário fechar
 * a primeira a mesma já tinha entrado de novo ("Primeira captura" voltava depois de fechada).
 */
export function enfileirarSemRepetir(fila: Recompensa[], novas: Recompensa[]): Recompensa[] {
  const ja = new Set(fila.map(chaveDaRecompensa));
  const saida = [...fila];
  for (const r of novas) {
    const chave = chaveDaRecompensa(r);
    if (ja.has(chave)) continue;
    ja.add(chave);
    saida.push(r);
  }
  return saida;
}
/** Fechar tira TODAS as cópias daquela recompensa, não só a da frente. */
export function tirarDaFila(fila: Recompensa[], r: Recompensa): Recompensa[] {
  const chave = chaveDaRecompensa(r);
  return fila.filter((x) => chaveDaRecompensa(x) !== chave);
}
/** Há uma rodada de jogo em curso? (Play marca o body enquanto joga.) */
export function jogoAtivo(): boolean {
  return typeof document !== 'undefined' && document.body.hasAttribute('data-jogo-ativo');
}

/**
 * O LOTE DE NOVIDADES (recompensas v2, spec 10.2): quando várias chegam juntas (fim de rodada com
 * baú, maestria e conquista), o modal continua abrindo uma por vez, mas diz "3 novidades · 1 de 3".
 * O lote é o que estava na fila quando a primeira abriu, mais o que entrar antes de ela esvaziar.
 */
export function posicaoNoLote(lote: readonly string[], fila: readonly Recompensa[]): { lote: string[]; posicao: number; total: number } {
  const chaves = fila.map(chaveDaRecompensa);
  const atual = chaves[0];
  if (!atual) return { lote: [], posicao: 0, total: 0 };
  const novo = lote.includes(atual) ? [...lote, ...chaves.filter((c) => !lote.includes(c))] : chaves;
  return { lote: novo, posicao: novo.indexOf(atual) + 1, total: novo.length };
}
