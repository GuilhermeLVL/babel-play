import { type Conquista, CONQUISTAS, type ContextoDeConquistas } from './learning/conquistas';
import { PESOS_SEEDS, PESOS_XP } from './learning/xp';
import { CATALOGO_DA_LOJA, type ItemDaLoja, type Raridade } from './loja';
import {
  creditoDeMaestria,
  LIMIARES_DE_MAESTRIA,
  type LinhaDeMaestria,
  maestriaPorJogo,
  type NivelAlcancavel,
} from './maestria';
import { estrelasDaRodada } from './minigames/fases';
import type { MinigameId } from './minigames/types';
import { type SlotDoPasse, slotsDoPasse } from './passe';

/**
 * A TABELA DE PREÇOS QUE O SERVIDOR CONSULTA.
 *
 * O DEFEITO QUE ISTO FECHA (auditoria de 01/09). `POST /api/metrics/seeds/gastar` gravava o
 * `amount` e o `reason` que o cliente mandasse, e a POSSE é derivada do razão
 * (`reason LIKE 'loja:%'`). Então `{amount: 1, reason: 'loja:tema-custom'}` entregava o lendário
 * de 600 Seeds por 1 — e o servidor passava a ATESTAR essa posse. O gêmeo,
 * `POST /api/metrics/seeds/creditar`, cunhava até 10.000 Seeds e 10.000 XP por request com um
 * `creditoId` inventado.
 *
 * A regra que passa a valer é a de qualquer economia de jogo séria: **o cliente diz QUAL evento
 * aconteceu; o servidor decide QUANTO vale.** Este módulo é o "quanto".
 *
 * POR QUE NO CORE. O projeto já fazia certo do outro lado: `server/routes/billing.ts` importa
 * `core/creditos.ts` e resolve o preço do pacote a partir do SKU — é por isso que a compra de
 * Créditos nunca teve esse furo. Aqui é o mesmo desenho, aplicado às Seeds.
 *
 * Regra deste arquivo: TS puro. Nada de DOM, nada de localStorage — ele roda no Node.
 */

/* ── Preços que não moram no catálogo de itens ──────────────────────────────────────────────
 * Estavam em `lib/` (bundle do cliente) e por isso eram invisíveis ao servidor. Vêm para cá como
 * FONTE; os módulos de `lib/` passam a reexportar, para nenhuma tela mudar de import. */

/** Croma: barato de propósito — é onde a Seed sobrando vai parar, não uma segunda barreira. */
export const PRECO_DO_CROMA: Record<Raridade, number> = {
  comum: 15,
  raro: 25,
  epico: 40,
  lendario: 60,
};

/** Pular a rodada mantendo o combo (economia v2: ≈ metade de um dia ativo). */
export const CUSTO_PULAR_RODADA = 40;

/* ── Autorização de um GASTO ────────────────────────────────────────────────────────────────── */

export type GastoAutorizado =
  | { tipo: 'loja'; itemId: string; preco: number }
  | { tipo: 'croma'; itemId: string; matiz: string; preco: number }
  | { tipo: 'pular-rodada'; preco: number };

/** Por que um motivo foi recusado — texto curto, para o 400 dizer o que houve. */
export type RecusaDeGasto = { erro: string };

/** Vale para qualquer autorização — de Seeds ou de Créditos. */
export function ehRecusa<T extends object>(r: T | RecusaDeGasto): r is RecusaDeGasto {
  return 'erro' in r;
}

const itemPorId = (id: string): ItemDaLoja | undefined => CATALOGO_DA_LOJA.find((i) => i.id === id);

/**
 * Traduz o `reason` de um gasto no que ele autoriza — ou recusa.
 *
 * O formato é FECHADO de propósito. Enquanto `reason` era `z.string().max(40)`, ele era ao mesmo
 * tempo o campo de diagnóstico e o título de propriedade: qualquer string virava posse.
 */
export function autorizarGasto(reason: string): GastoAutorizado | RecusaDeGasto {
  if (reason === 'pular-rodada') return { tipo: 'pular-rodada', preco: CUSTO_PULAR_RODADA };

  if (reason.startsWith('loja:')) {
    const itemId = reason.slice(5);
    const item = itemPorId(itemId);
    if (!item) return { erro: `item inexistente: ${itemId}` };
    /* O que só sai de conquista NUNCA entra pela porta da compra. Sem esta linha, um `reason`
       forjado entregava o tema Aurora — que a Loja não vende em lugar nenhum. */
    if (item.exclusivoDe) return { erro: `${itemId} é exclusivo de conquista e não está à venda` };
    if (item.precoSeeds === undefined) return { erro: `${itemId} não tem preço: só destrava por nível` };
    return { tipo: 'loja', itemId, preco: item.precoSeeds };
  }

  if (reason.startsWith('croma:')) {
    const [, itemId, matiz] = reason.split(':');
    if (!itemId || !matiz) return { erro: 'croma malformado' };
    const item = itemPorId(itemId);
    if (!item) return { erro: `item inexistente: ${itemId}` };
    return { tipo: 'croma', itemId, matiz, preco: PRECO_DO_CROMA[item.raridade] };
  }

  /* APRIMORAMENTOS SAÍRAM (recompensas v2, 27/09): `aprimoramento:*` não se vende mais. Quem
     comprou recebe o reembolso (`core/reembolso.ts`); a recusa é explícita para o motivo ficar
     legível no 400, em vez de cair no "motivo desconhecido" genérico. */
  if (reason.startsWith('aprimoramento:')) return { erro: 'aprimoramentos saíram do catálogo' };

  return { erro: `motivo desconhecido: ${reason.slice(0, 24)}` };
}

/* ── Autorização de um gasto de CRÉDITOS (a moeda comprada) ────────────────────────────────── */

export type GastoDeCredito = { tipo: 'premium'; itemId: string; preco: number };

/**
 * O gasto de Créditos tem a MESMA régua do de Seeds, e por um motivo direto: é a moeda que custou
 * dinheiro. Se o preço em Seeds já não podia vir do cliente, o preço em Créditos menos ainda.
 *
 * `premium:<id>` é o único formato porque, por enquanto, o único destino do Crédito é a prateleira
 * paga. Quando houver um segundo, ele entra aqui e não em cada rota.
 */
export function autorizarGastoDeCredito(reason: string): GastoDeCredito | RecusaDeGasto {
  if (!reason.startsWith('premium:')) return { erro: `motivo desconhecido: ${reason.slice(0, 24)}` };
  const itemId = reason.slice('premium:'.length);
  const item = itemPorId(itemId);
  if (!item) return { erro: `item inexistente: ${itemId}` };
  if (item.precoCreditos === undefined) return { erro: `${itemId} não é vendido em Créditos` };
  return { tipo: 'premium', itemId, preco: item.precoCreditos };
}

/* ── Autorização de um CRÉDITO ──────────────────────────────────────────────────────────────── */

/** O `creditoId` que o cliente usa para conquista é `conquista-<id>` (`src/lib/conquistas.ts`). */
export function conquistaDoCreditoId(creditoId: string): Conquista | null {
  if (!creditoId.startsWith('conquista-')) return null;
  const id = creditoId.slice('conquista-'.length);
  return CONQUISTAS.find((c) => c.id === id) ?? null;
}

/**
 * O QUE UM `creditoId` VALE — a metade que faltava da autoridade.
 *
 * O GASTO já era decidido aqui desde 01/09 (`autorizarGasto`); o CRÉDITO só conhecia uma família,
 * a de conquista. As outras — os cofres do passe — chegavam ao servidor e levavam 400 "crédito
 * desconhecido" (`server/routes/metrics.ts`), com dois efeitos medidos na auditoria de 07/09:
 * a tela do passe repetia o pedido a cada montagem e nunca marcava o baú, e as 36 linhas
 * `passe:t1:*` que existiam no banco tinham entrado ANTES do endurecimento, com o valor que o
 * cliente mandou (10 a 172 Seeds, 2.472 no total).
 *
 * `seedsDoCofreDoPasse` foi escrita para isto e nunca teve chamador. Ela também pedia a curva
 * (`quantiaPorDecada`) por parâmetro, o que reabria a mesma porta pelo lado de dentro: quem
 * chamasse com outra curva creditava outro valor. Aqui a curva não se passa — ela se LÊ, de
 * `slotsDoPasse()`, que é a mesma função que desenha o trilho na tela. Um cofre vale o que a tela
 * mostra porque é literalmente o mesmo número.
 */

/** O que um crédito autorizado entrega, e o que ele exige para valer. */
export interface CreditoAutorizado {
  creditoId: string;
  seeds: number;
  xp: number;
  /** O que vai para `seed_credits.reason` — a coluna de onde a posse é derivada. */
  reason: string;
  /** Nível do app exigido. 0 = sem exigência (a conquista traz a sua própria condição). */
  nivelMinimo: number;
  /** Presente só na família de conquista: quem confere a condição precisa dela. */
  conquista?: Conquista;
  /**
   * Presente só na família `meta:<AAAA-MM-DD>`: o dia (no fuso do usuário) cuja meta tem de ter
   * sido cumprida. Quem credita confere a janela (hoje ou ontem) e os acertos daquele dia.
   */
  metaDoDia?: string;
  /**
   * Presente só na família `maestria:<jogo>:<nível>` (recompensas v2, onda 3): quem credita soma
   * os pontos do jogo nas linhas gravadas e confere que alcançam `pontosExigidos`.
   */
  maestria?: { jogo: MinigameId; nivel: NivelAlcancavel; pontosExigidos: number };
}

/** `meta:<AAAA-MM-DD>` -> o dia, ou null. Data de calendário válida, sem hora. */
export function diaDaMeta(creditoId: string): string | null {
  const m = /^meta:(\d{4})-(\d{2})-(\d{2})$/.exec(creditoId);
  if (!m) return null;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(Date.UTC(a, mes - 1, d));
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/* Índice dos cofres por `creditoId`, montado uma vez. `slotsDoPasse()` percorre o catálogo
   inteiro e é determinística — chamá-la a cada crédito seria trabalho repetido para o mesmo
   resultado. */
let cofresPorId: Map<string, Extract<SlotDoPasse, { tipo: 'seeds' }>> | null = null;
function cofreDoPasse(creditoId: string) {
  if (!cofresPorId) {
    cofresPorId = new Map();
    for (const s of slotsDoPasse()) if (s.tipo === 'seeds') cofresPorId.set(s.creditoId, s);
  }
  return cofresPorId.get(creditoId);
}

/**
 * O VALOR DE UM CRÉDITO, decidido pela regra — nunca pelo corpo do pedido.
 *
 * Devolve a recusa em vez de lançar, pelo mesmo motivo de `autorizarGasto`: quem chama precisa
 * responder 400 com um motivo legível, e não engolir uma exceção.
 *
 * A conferência de NÍVEL fica com o chamador (é ele que sabe o nível: o servidor calcula de
 * `computeProfile`, o modo sem conta de `economiaDeMetricas`). O que esta função garante é que
 * ninguém precise adivinhar QUAL nível exigir.
 */
export function valorDoCredito(creditoId: string): CreditoAutorizado | RecusaDeGasto {
  const conquista = conquistaDoCreditoId(creditoId);
  if (conquista) {
    return {
      creditoId,
      seeds: conquista.recompensa.seeds,
      xp: conquista.recompensa.xp,
      reason: `conquista:${conquista.id}`,
      nivelMinimo: 0,
      conquista,
    };
  }

  const cofre = cofreDoPasse(creditoId);
  if (cofre) {
    /* A década N do passe é o nível N do app (`slotDestravado`). Sem esta linha, o crédito do
       cofre da década 10 sairia no nível 1 — e ele vale 172 Seeds. */
    return {
      creditoId,
      seeds: cofre.quantidade,
      xp: 0,
      reason: `passe:${creditoId.split(':')[1]}`,
      nivelMinimo: cofre.decada,
    };
  }

  /* A META DO DIA (recompensas v2). O valor é fixo e sai dos pesos; a CONDIÇÃO (acertos no dia)
     depende do banco e do fuso, então fica com quem credita — como o nível do cofre do passe. */
  if (creditoId.startsWith('meta:')) {
    const dia = diaDaMeta(creditoId);
    if (!dia) return { erro: `meta malformada: ${creditoId.slice(0, 40)}` };
    return {
      creditoId,
      seeds: PESOS_SEEDS.metaDiaria,
      xp: PESOS_XP.metaDiaria,
      reason: `meta:${dia}`,
      nivelMinimo: 0,
      metaDoDia: dia,
    };
  }

  /* A MAESTRIA (recompensas v2, onda 3): `maestria:<jogo>:<nível>` vale `nivelDeMaestria × nível`
     Seeds. O valor é da regra; a CONDIÇÃO (os pontos do jogo alcançarem o limiar) depende das
     linhas gravadas, então fica com quem credita — como a meta do dia. Nunca à venda. */
  if (creditoId.startsWith('maestria:')) {
    const m = creditoDeMaestria(creditoId);
    if (!m) return { erro: `maestria malformada: ${creditoId.slice(0, 40)}` };
    return {
      creditoId,
      seeds: PESOS_SEEDS.nivelDeMaestria * m.nivel,
      xp: 0,
      reason: creditoId,
      nivelMinimo: 0,
      maestria: { ...m, pontosExigidos: LIMIARES_DE_MAESTRIA[m.nivel - 1] },
    };
  }

  /* A FAMÍLIA DE DROP NÃO SE RESOLVE AQUI, e a recusa é explícita para não ser confundida com um
     id inventado. Esta função traduz id -> valor, e o valor de um drop depende do ITEM SORTEADO —
     que não está no id e nem poderia estar: se estivesse, o cliente escolheria o item ao escolher
     o `creditoId`, que é exatamente o furo que o desenho do drop existe para fechar. Quem credita
     um drop é `valorDoDrop(creditoId, itemId)`, chamada pela rota DEPOIS de o servidor sortear. */
  if (roundIdDoDrop(creditoId)) {
    return { erro: 'crédito de drop não se resolve pelo id: o item é sorteado pelo servidor' };
  }

  return { erro: `crédito desconhecido: ${creditoId.slice(0, 40)}` };
}

/**
 * AS CONQUISTAS QUE O SERVIDOR SABE CONFERIR — desde as recompensas v2 (onda 5), TODAS.
 *
 * Cada condição do catálogo lê só o que o servidor mede: métricas, nível, recordes, compras e a
 * maestria somada das linhas gravadas (`contextoConferivelDeConquistas`). O Colecionador conta
 * eventos raros VISTOS, estado que só o navegador tem; para ele vale a régua dos pré-requisitos
 * (`progressoConferivelDoColecionador`), aplicada em `progressoNoServidor`. O Express e o espelho
 * sem conta conferem a mesma lista com o mesmo contexto.
 */
export const CONQUISTAS_CONFERIVEIS: ReadonlySet<string> = new Set(CONQUISTAS.map((c) => c.id));

/**
 * O CONTEXTO DE CONQUISTAS QUE O SERVIDOR MONTA — o mesmo no Express e no espelho, para as duas
 * pontas decidirem igual. Eventos vistos entram como zero (a régua do Colecionador não os lê) e a
 * maestria sai de `maestriaPorJogo` sobre as linhas gravadas, nunca do que o cliente diz.
 */
export function contextoConferivelDeConquistas(p: {
  metricas: ContextoDeConquistas['metricas'];
  nivel: number;
  melhorComboPorJogo: Record<string, number>;
  linhasDeMaestria: ReadonlyArray<LinhaDeMaestria>;
}): ContextoDeConquistas {
  const maestria: NonNullable<ContextoDeConquistas['maestria']> = {};
  for (const j of maestriaPorJogo(p.linhasDeMaestria)) if (j.nivel > 0) maestria[j.jogo] = j.nivel;
  return {
    metricas: p.metricas,
    nivel: p.nivel,
    melhorComboPorJogo: p.melhorComboPorJogo,
    eventosVistos: 0,
    totalDeEventos: 0,
    idiomas: p.metricas.idiomas ?? 0,
    compras: p.metricas.itensComprados?.length ?? 0,
    maestria,
  };
}

/**
 * Quantos eventos RAROS existem (`EVENTOS_RAROS` em `lib/eventosDeJogo`, que o core não importa).
 * `tests/colecionador.test.ts` confere que os dois números batem.
 */
export const EVENTOS_RAROS_DO_JOGO = 6;

/** O combo em que o último evento condicional do Duelo acontece (`sobrecarga`, combo 15). */
export const COMBO_DO_ULTIMO_EVENTO = 15;

/**
 * O COLECIONADOR, NA RÉGUA DO SERVIDOR. A condição real ("viu os onze eventos") o servidor não
 * enxerga; o que ele enxerga são os PRÉ-REQUISITOS de cada evento, todos gravados no banco:
 *
 *  1. `aquecendo`, `tempestade` e `sobrecarga` só nascem no Duelo, nos combos 5, 10 e 15 →
 *     melhor combo do Duelo ≥ 15;
 *  2. `perfeita` nasce de uma rodada perfeita → ao menos uma `rodadasPerfeitas`;
 *  3. os seis raros são sorteados um por ACERTO, no máximo → ao menos seis acertos (itens de
 *     jogo certos + revisões certas).
 *
 * É condição NECESSÁRIA, não suficiente: não prova que os eventos foram vistos (`fogos`, do
 * recorde batido, nem entra), mas fecha o crédito a quem nunca jogou o bastante para vê-los —
 * que era o que qualquer pedido direto à rota conseguia.
 */
export function progressoConferivelDoColecionador(ctx: ContextoDeConquistas): { atual: number; meta: number } {
  const m = ctx.metricas;
  const acertos = (m.drillCorrect ?? 0) + (m.correctReviews ?? 0);
  const requisitos = [
    (ctx.melhorComboPorJogo['blitz'] ?? 0) >= COMBO_DO_ULTIMO_EVENTO,
    (m.rodadasPerfeitas ?? 0) >= 1,
    acertos >= EVENTOS_RAROS_DO_JOGO,
  ];
  return { atual: requisitos.filter(Boolean).length, meta: requisitos.length };
}

/**
 * O progresso que o SERVIDOR confere antes de creditar uma conquista: o da própria regra, exceto
 * onde a regra lê estado que só o navegador tem (hoje, só o Colecionador).
 */
export function progressoNoServidor(conquista: Conquista, ctx: ContextoDeConquistas): { atual: number; meta: number } {
  return conquista.id === 'colecionador' ? progressoConferivelDoColecionador(ctx) : conquista.progresso(ctx);
}

/* ── DROP: o cosmético que cai no fim da rodada ─────────────────────────────────────────────── */

/**
 * O CANAL DE DROP, e por que ele NÃO é uma quinta porta da Loja.
 *
 * A versão que existia no ramo de trabalho (`src/lib/drops.ts`) estava errada de três jeitos, e os
 * três são o mesmo erro: o cliente decidindo. (1) chamava `creditarSeeds({creditoId, amount,
 * reason})` — `amount` e `reason` já tinham SAÍDO do contrato justamente porque eram a cunhagem de
 * moeda pelo corpo do pedido; (2) o `creditoId` era `drop-partida-bau-${Date.now()}`, e o relógio
 * dentro do id destrói a única idempotência que existe aqui, que é POR `creditoId` (índice único
 * em `seed_credits`) — cada montagem da tela viraria um baú novo; (3) `drop-partida-bau-*` não
 * casava nenhuma família de `valorDoCredito`, então levava 400 de qualquer maneira.
 *
 * O DESENHO QUE VALE:
 *
 * · `ItemDaLoja` não tem campo `canal`. As quatro portas de obtenção (nível, Seeds, conquista,
 *   Créditos) são DERIVADAS dos campos que o item já tem. Um campo `canal: 'drop'` faria o item
 *   existir num quinto lugar e obrigaria toda régua a crescer um caso. Então o drop não é uma
 *   porta: ele SORTEIA entre itens que já têm porta. Uma régua só continua valendo.
 *
 * · `creditoId` = `drop:<roundId>`. Um drop por RODADA. A rodada é um fato gravado
 *   (`exercise_results.round_id`, via `POST /api/exercises/rodada`), com dono e com carimbo de
 *   tempo: ancorar o baú nela é o que impede tanto o baú repetido quanto o baú sem partida.
 *
 * · QUEM SORTEIA É O SERVIDOR. Se o cliente escolhesse o item, escolheria o lendário — é a mesma
 *   lição do `amount` que a auditoria de 01/09 cobrou. O cliente diz "terminei a rodada R"; o
 *   servidor diz o que caiu.
 */

/**
 * AS SEEDS QUE ACOMPANHAM O DROP.
 *
 * Cinco, que é exatamente `PESOS_SEEDS.rodadaPerfeita` — o maior bônus POR RODADA que a economia
 * já tinha. O número não é estético: ele fixa o teto do que o drop pode fazer com a moeda. Uma
 * rodada perfeita de 20 itens rende 25 Seeds (20 acertos + 5 da rodada limpa); o drop soma no
 * máximo mais 5, ou seja +20% no melhor caso, e nunca mais do que jogar sem errar já paga.
 *
 * A RECOMPENSA DE VERDADE É O ITEM, e ela é grande: um comum vale 40-60 Seeds de catálogo, um raro
 * 100-140. Pôr Seeds altas aqui somaria uma segunda renda por rodada em cima de um prêmio que já
 * vale de 8 a 28 rodadas perfeitas — e a economia v2 foi calibrada para o lendário sair em ≈ 1
 * semana de uso diário. Cinco é o valor que faz o baú parecer um bônus sem reescrever essa
 * calibragem. Zero também fecharia a conta, mas deixaria a linha do ledger sem nada além do razão.
 */
export const SEEDS_DO_DROP = 5;

/**
 * O PESO DE CADA RARIDADE NO SORTEIO.
 *
 * Só comum e raro entram (ver `itensSorteaveisNoDrop`), e a proporção é 3 para 1. Épico e lendário
 * ficam de fora porque são o TOPO da escada de preço (200-260 e 380-600 Seeds): entregá-los de
 * graça no fim de uma rodada apagaria o motivo de poupar, que é a única mecânica de longo prazo
 * que esta economia tem. O drop existe para dar um empurrão, não para substituir a Loja.
 */
export const PESOS_DO_DROP: Readonly<Record<'comum' | 'raro', number>> = { comum: 75, raro: 25 };

/**
 * `drop:<roundId>` -> roundId, ou null se o crédito não for desta família.
 *
 * Recusa `roundId` com `:` porque o dois-pontos é o separador que todas as outras famílias usam, e
 * um roundId com `:` tornaria `drop:a:b` ambíguo. O gerador real não produz isso (`Play.tsx`:
 * `${gameId}-${Date.now()}-${aleatorio}`), então a regra não custa nada e fecha a ambiguidade
 * antes de ela existir.
 */
export function roundIdDoDrop(creditoId: string): string | null {
  if (!creditoId.startsWith('drop:')) return null;
  const roundId = creditoId.slice('drop:'.length);
  if (!roundId || roundId.includes(':')) return null;
  return roundId;
}

/**
 * O BAÚ EXIGE DESEMPENHO — duas estrelas na régua do fim de rodada (`estrelasDaRodada` de
 * `minigames/fases`, a mesma que a tela mostra): precisão ≥ 75%.
 *
 * Até 27/09 o servidor sorteava um item a cada rodada gravada, mesmo com 0% de acerto — o baú
 * premiava abrir o jogo, não jogar. A conta é feita sobre as LINHAS GRAVADAS da rodada
 * (`exercise_results`), não sobre o que o cliente diz: só entra quem teve resposta (`correct` não
 * nulo), e uma rodada sem nenhuma resposta não rende baú.
 */
export const ESTRELAS_PARA_O_BAU = 2;

export function rodadaRendeBau(linhas: ReadonlyArray<{ correct?: number | null }>): {
  rende: boolean;
  estrelas: 0 | 1 | 2 | 3;
} {
  const respondidas = linhas.filter((l) => l.correct != null);
  if (!respondidas.length) return { rende: false, estrelas: 0 };
  const certas = respondidas.filter((l) => (l.correct ?? 0) > 0).length;
  const estrelas = estrelasDaRodada(Math.round((certas / respondidas.length) * 100));
  return { rende: estrelas >= ESTRELAS_PARA_O_BAU, estrelas };
}

/**
 * O item pode cair num baú? Quatro perguntas, todas respondidas por campos que o item JÁ tem —
 * nenhuma delas precisa de um `canal` novo no catálogo.
 *
 *  1. `exclusivoDe` fora. Conquista não se sorteia: o que separa o tema Aurora de qualquer outro
 *     lendário é EXATAMENTE ter sido conquistado. Um baú que o entrega apaga a conquista inteira.
 *  2. `precoCreditos` fora. Créditos é a moeda que custou dinheiro; sortear de graça o que outra
 *     pessoa pagou é o furo mais caro que este arquivo pode abrir.
 *  3. Só comum e raro (ver `PESOS_DO_DROP`).
 *  4. `precoSeeds` obrigatório. ESTA É A LINHA QUE NÃO ESTAVA NO DESENHO ORIGINAL e que foi
 *     acrescentada aqui: sem ela o baú sorteia `fonte-padrao`, `pos-topo`, `cur-padrao`, `ras-off`
 *     e `pack-classico` — itens de nível 1 e sem preço, que TODA pessoa já tem desde o primeiro
 *     minuto e que a posse (derivada de compras) nunca vai listar como possuídos. O baú entregaria
 *     o nada, repetidamente, e ainda gastaria a rodada. "Ter porta", aqui, quer dizer ter a porta
 *     das Seeds: só é prêmio o que custaria alguma coisa.
 */
function ehSorteavelNoDrop(item: ItemDaLoja): boolean {
  if (item.exclusivoDe) return false;
  if (item.precoCreditos !== undefined) return false;
  if (item.raridade !== 'comum' && item.raridade !== 'raro') return false;
  return item.precoSeeds !== undefined;
}

/**
 * Os itens que um drop pode entregar AGORA: os sorteáveis menos o que a pessoa já tem.
 *
 * `jaPossui` vem do razão dos eventos (`seed_spends.reason LIKE 'loja:%'` mais
 * `seed_credits.reason LIKE 'drop:%'`), nunca do navegador — é a mesma fonte de onde
 * `itensComprados` já deriva a posse. Item repetido não é prêmio: sem esta subtração, quem já
 * comprou tudo o que é comum abriria baús de duplicata sem nunca saber por quê.
 *
 * A ordem é a do catálogo, que é estável — é o que torna `decidirBau` reprodutível dado o
 * mesmo float.
 */
export function itensSorteaveisNoDrop(jaPossui: ReadonlySet<string>): ItemDaLoja[] {
  return CATALOGO_DA_LOJA.filter((i) => ehSorteavelNoDrop(i) && !jaPossui.has(i.id));
}

/* ── BAÚ v2 (recompensas v2, 27/09) ─────────────────────────────────────────────────────────
 *
 * O que mudou em relação ao baú de antes, e por quê:
 *
 * · TETO DIÁRIO de três baús, no dia LOCAL de quem joga. O baú é bônus de desempenho, não renda:
 *   sem teto, a rodada mais curta que dá duas estrelas vira fábrica de sorteio.
 * · GARANTIA (pity): o 5º baú seguido sem raro é raro. A chance anunciada (75/25) continua a
 *   mesma; a garantia só corta a cauda de azar — ninguém fica vinte baús sem ver um raro.
 * · REPETIDO VIRA SEEDS. Antes, sem peça nova na faixa sorteada, a probabilidade ia para a outra
 *   faixa e, com a coleção completa, o baú devolvia nada. Agora a faixa sorteada é a faixa que
 *   vale: sem peça nova nela, o baú paga Seeds pela raridade (comum 15, raro 40), com a mensagem
 *   dita. A taxa anunciada deixa de mudar sozinha à medida que a coleção enche.
 * · AS CHANCES VÃO NA RESPOSTA, junto de quantos baús faltam para o raro garantido.
 *
 * Nada disto é comprável: o baú só sai de rodada gravada com duas estrelas, nunca por Créditos,
 * e as Seeds nunca se compram (ECA Digital art. 20; `tests/eca-art20-*`).
 */
export const BAUS_POR_DIA = 3;
export const PITY_DO_BAU = 5; // o 5º baú seguido sem raro é raro
export const SEEDS_DO_REPETIDO = { comum: 15, raro: 40 } as const;
/** As chances anunciadas, em porcentagem — as mesmas do peso do sorteio. */
export const CHANCES_DO_BAU: Readonly<Record<'comum' | 'raro', number>> = PESOS_DO_DROP;

export type RaridadeDoBau = 'comum' | 'raro';
export type DecisaoDoBau =
  | { tipo: 'sem-bau'; motivo: 'estrelas' | 'teto' }
  | { tipo: 'item'; item: ItemDaLoja; raridade: RaridadeDoBau }
  | { tipo: 'seeds'; seeds: number; raridade: RaridadeDoBau };

/**
 * A DECISÃO DO BAÚ, pura e determinística: mesmas entradas, mesma saída.
 *
 * O float entra por parâmetro pelo mesmo motivo de sempre: o que se quer provar é a REGRA (o
 * corte em 75%, a garantia, o repetido), não uma média. DUAS ETAPAS: primeiro a faixa (ou a
 * garantia), depois um item uniforme dentro dela, com a fração que sobrou do mesmo float.
 */
export function decidirBau(entrada: {
  estrelas: 0 | 1 | 2 | 3;
  bausHoje: number;
  semRaroSeguidos: number;
  sorteio: number;
  elegiveis: ItemDaLoja[];
}): DecisaoDoBau {
  if (entrada.estrelas < ESTRELAS_PARA_O_BAU) return { tipo: 'sem-bau', motivo: 'estrelas' };
  if (entrada.bausHoje >= BAUS_POR_DIA) return { tipo: 'sem-bau', motivo: 'teto' };

  /* Float defeituoso (NaN, negativo, >= 1) vira 0 em vez de derrubar a rota: um baú é bônus. */
  const f = Number.isFinite(entrada.sorteio) ? Math.min(0.999999999, Math.max(0, entrada.sorteio)) : 0;
  const corte = CHANCES_DO_BAU.comum / (CHANCES_DO_BAU.comum + CHANCES_DO_BAU.raro);
  const garantido = entrada.semRaroSeguidos >= PITY_DO_BAU - 1;
  const raridade: RaridadeDoBau = garantido || f >= corte ? 'raro' : 'comum';
  const dentro = garantido ? f : raridade === 'comum' ? f / corte : (f - corte) / (1 - corte);

  const faixa = entrada.elegiveis.filter((i) => i.raridade === raridade && ehSorteavelNoDrop(i));
  if (!faixa.length) return { tipo: 'seeds', seeds: SEEDS_DO_REPETIDO[raridade], raridade };
  return { tipo: 'item', item: faixa[Math.min(faixa.length - 1, Math.floor(dentro * faixa.length))], raridade };
}

/** Um baú já aberto, como o razão o guarda: quando (carimbo) e o `reason` gravado. */
export interface BauAberto {
  em: number;
  reason: string;
}

/**
 * A raridade de um baú já aberto, lida do `reason`: `drop:<itemId>` (a peça — raridade do
 * catálogo) ou `bau:repetido:<raridade>` (virou Seeds). Peça que saiu do catálogo conta como comum.
 */
export function raridadeDoBau(reason: string): RaridadeDoBau {
  if (reason.startsWith('bau:repetido:')) return reason.endsWith(':raro') ? 'raro' : 'comum';
  const item = itemPorId(reason.slice('drop:'.length));
  return item?.raridade === 'raro' ? 'raro' : 'comum';
}

/**
 * O ESTADO DO BAÚ de uma conta: quantos saíram HOJE (no fuso de quem joga) e quantos seguidos, do
 * mais recente para trás, não foram raros. `diaDe` recebe o carimbo e devolve a chave do dia no
 * fuso certo — quem chama passa `diaNoFuso(t, fuso)`; o core não sabe o fuso.
 */
export function situacaoDoBau(
  baus: readonly BauAberto[],
  hoje: string,
  diaDe: (t: number) => string,
): { bausHoje: number; semRaroSeguidos: number } {
  const bausHoje = baus.filter((b) => diaDe(b.em) === hoje).length;
  let semRaroSeguidos = 0;
  for (const b of [...baus].sort((a, z) => z.em - a.em)) {
    if (raridadeDoBau(b.reason) === 'raro') break;
    semRaroSeguidos += 1;
  }
  return { bausHoje, semRaroSeguidos };
}

/** Quantos baús faltam para o raro garantido, contando o próximo (1 = o próximo é raro). */
export function proximoRaroGarantidoEm(semRaroSeguidos: number): number {
  return Math.max(1, PITY_DO_BAU - semRaroSeguidos);
}

/**
 * O CRÉDITO DE UM BAÚ REPETIDO: Seeds pela raridade sorteada, e o `reason` NÃO é `drop:` — ele
 * não atesta posse de peça nenhuma (a posse é derivada de `drop:<itemId>`).
 */
export function valorDoRepetido(creditoId: string, raridade: RaridadeDoBau): CreditoAutorizado | RecusaDeGasto {
  if (!roundIdDoDrop(creditoId)) return { erro: `crédito de drop malformado: ${creditoId.slice(0, 40)}` };
  return { creditoId, seeds: SEEDS_DO_REPETIDO[raridade], xp: 0, reason: `bau:repetido:${raridade}`, nivelMinimo: 0 };
}

/**
 * O CRÉDITO DE UM DROP JÁ SORTEADO — a régua que a rota atravessa antes de gravar.
 *
 * Sem esta função a rota gravaria o `reason` que tivesse em mãos, e `drop:<itemId>` é a coluna de
 * onde a posse é derivada: seria o furo de 01/09 outra vez, agora pela porta do baú. Por isso ela
 * confere DUAS coisas — que o item existe no catálogo e que ele seria sorteável — mesmo sabendo
 * que quem chama acabou de sortear de uma lista que já passou por `itensSorteaveisNoDrop`. A
 * conferência dupla custa uma busca em array e é o que impede a próxima rota, escrita por outra
 * pessoa daqui a seis meses, de entregar `tema-custom` num baú.
 *
 * O que NÃO se confere aqui é a POSSE: esta função não sabe quem é a pessoa. Quem subtrai o que já
 * se tem é `itensSorteaveisNoDrop`, com o conjunto lido do banco.
 */
export function valorDoDrop(creditoId: string, itemId: string): CreditoAutorizado | RecusaDeGasto {
  if (!roundIdDoDrop(creditoId)) return { erro: `crédito de drop malformado: ${creditoId.slice(0, 40)}` };
  const item = itemPorId(itemId);
  if (!item) return { erro: `item inexistente: ${itemId}` };
  if (!ehSorteavelNoDrop(item)) return { erro: `${itemId} não sai em drop` };
  return { creditoId, seeds: SEEDS_DO_DROP, xp: 0, reason: `drop:${itemId}`, nivelMinimo: 0 };
}
