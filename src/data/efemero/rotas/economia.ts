/**
 * ESPELHO SEM CONTA — Seeds, presença e o baú de fim de rodada.
 *
 * Metade de `src/data/rotas/economia.ts`. O caminho HTTP destas três rotas é de métrica, mas o
 * domínio é a economia: quem decide o preço, o valor e a idempotência é `core/economiaAutoridade`,
 * e é ele que precisa bater com o Express. O cliente faz exatamente o mesmo corte.
 *
 * Rotas: POST `/api/metrics/seeds/gastar`, POST `/api/metrics/seeds/creditar`,
 * POST `/api/metrics/presenca`, GET `/api/metrics/maestria`.
 *
 * `/api/billing/*` (créditos comprados com dinheiro, passe) NÃO tem espelho — justificado em
 * `tests/contratos/rotas-espelhadas`: moeda paga nasce e morre no servidor.
 */
import {
autorizarGasto, BAUS_POR_DIA, CHANCES_DO_BAU, decidirBau, ehRecusa, ESTRELAS_PARA_O_BAU,
itensSorteaveisNoDrop, progressoNoServidor, proximoRaroGarantidoEm, raridadeDoBau, rodadaRendeBau, roundIdDoDrop,
situacaoDoBau, valorDoCredito, valorDoDrop, valorDoRepetido,
} from '../../../core/economiaAutoridade';
import type { ContextoDeConquistas } from '../../../core/learning/conquistas';
import {
  acertosNoDia, diaLocal, diaNoFuso, fusoOuPadrao, META_DIARIA_ACERTOS, metaDoDiaCumprida, sequencias,
} from '../../../core/learning/economia';
import { economiaDeMetricas } from '../../../core/learning/xp';
import { type LinhaDeMaestria, maestriaPorJogo, nivelDeMaestria } from '../../../core/maestria';
import { reembolsosDevidos } from '../../../core/reembolso';
import { json, lerJson, num, str } from '../nucleo';
import { abrirStore } from '../store';
import { perfilEfemero } from './metricas';

/**
 * GASTA SEEDS — com o preço do catálogo, como no Express.
 *
 * O `amount` do corpo era gravado como veio, e a POSSE é derivada do razão (`reason LIKE
 * 'loja:%'`, ver `itensComprados` em `./metricas.ts`): `{amount: 1, reason: 'loja:tema-custom'}`
 * entregava o lendário de 600 Seeds por 1. O Express fechou isso em 01/09 com `autorizarGasto`;
 * aqui ficou aberto, e o acervo do modo sem conta MIGRA para a conta.
 *
 * O saldo também é conferido, pelo mesmo motivo do servidor real: o único guarda era o botão
 * desabilitado na tela, e um cliente adulterado não tem botão.
 */
export async function gastarSeeds(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const spendId = str(p.spendId);
  if (!spendId) return json({ error: 'spendId é obrigatório' }, 400);

  const autorizacao = autorizarGasto(str(p.reason) ?? '');
  if (ehRecusa(autorizacao)) return json({ error: autorizacao.erro, code: 'motivo_desconhecido' }, 400);

  const amount = num(p.amount);
  if (amount !== null && amount !== autorizacao.preco) {
    return json({ error: 'preço divergente do catálogo', code: 'preco_divergente', codigo: 'preco_divergente', detalhes: { preco: autorizacao.preco } }, 400);
  }

  const db = await abrirStore();
  const existente = await db.get('gastos', spendId);
  const jaExistia = !!existente;
  if (!jaExistia) {
    const { saldo } = economiaDeMetricas(await perfilEfemero(null));
    if (saldo < autorizacao.preco) {
      return json({ error: 'saldo insuficiente', code: 'saldo_insuficiente', codigo: 'saldo_insuficiente', detalhes: { falta: autorizacao.preco - saldo, saldo, preco: autorizacao.preco } }, 402);
    }
    await db.put('gastos', { spendId, amount: autorizacao.preco, reason: str(p.reason) ?? '', ref: str(p.ref), createdAt: Date.now() });
  }
  const total = (await db.getAll('gastos')).reduce((n, g) => n + g.amount, 0);
  return json({ jaExistia, gasto: existente?.amount ?? autorizacao.preco, seedsGastas: total });
}

/* ── ECONOMIA v2 (2026-08-28) ── */

/** Presença do dia: idempotente por dia local. O cliente manda o `dia` que calculou (fuso dele). */
export async function registrarPresenca(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const dia = num(p.dia) ?? diaLocal(Date.now());
  const db = await abrirStore();
  const jaExistia = !!(await db.get('presencas', dia));
  if (!jaExistia) await db.put('presencas', { dia, createdAt: Date.now() });
  const dias = (await db.getAll('presencas')).map((x) => x.dia);
  const { atual } = sequencias(dias, dia);
  return json({ jaExistia, dia, streakPresenca: atual });
}

/**
 * CRÉDITO AVULSO — idempotente por `creditoId`, e com o VALOR decidido pela regra.
 *
 * ATÉ 07/09 ESTA FUNÇÃO CUNHAVA MOEDA. Ela gravava o `amount` e o `xp` que viessem no corpo, sem
 * teto e sem catálogo: `{creditoId: 'x'.repeat(8), amount: 999999}` entrava. O Express tinha
 * fechado esse mesmo furo em 01/09 e este lado ficou aberto — o que é pior do que nunca ter
 * fechado, porque a economia passou a valer duas coisas diferentes conforme a pessoa tivesse
 * conta ou não, e o acervo do modo sem conta MIGRA para a conta.
 *
 * Agora as duas pontas chamam `valorDoCredito`, do core, e nenhuma das duas lê `amount`.
 */
/**
 * O DROP DE FIM DE RODADA, sem conta — o ESPELHO exato do caminho do Express.
 *
 * As MESMAS funções do core, na MESMA ordem de guardas: rodada existente, idempotência por
 * `creditoId` lendo o item do razão gravado, sorteio do servidor sobre o que ainda falta, e
 * `valorDoDrop` como última régua antes de gravar. O contrato entre as duas pontas é testado
 * (`tests/contratos/economia.test.ts`), e a razão de existir desse teste vale aqui em cheio: o
 * acervo do modo sem conta MIGRA para a conta, então um baú mais generoso deste lado seria um
 * cosmético cunhado de graça atravessando para o outro.
 *
 * A diferença de mecânica, e só ela: aqui não há `user_id` (o banco inteiro é de uma pessoa só) e
 * a posse da Loja sai de `gastos` com razão `loja:` em vez de `seed_spends`.
 */
async function creditarDrop(creditoId: string, roundId: string, fusoPedido: string | null): Promise<Response> {
  const db = await abrirStore();
  const daRodada = (await db.getAll('exercicios')).filter((e) => e.roundId === roundId);
  if (!daRodada.length) {
    return json({ error: 'rodada inexistente para este drop', code: 'rodada_inexistente', codigo: 'rodada_inexistente', detalhes: { roundId } }, 400);
  }

  const creditos = await db.getAll('creditos');
  const totais = (linhas: typeof creditos) => ({
    seedsCreditadas: linhas.reduce((n, c) => n + c.amount, 0),
    xpCreditado: linhas.reduce((n, c) => n + c.xp, 0),
  });

  /* BAÚ v2 (recompensas v2), com a régua e a ordem do Express: dia LOCAL no fuso de quem joga. */
  const fuso = fusoOuPadrao(fusoPedido);
  const diaDe = (t: number) => diaNoFuso(t, fuso);
  const baus = creditos.filter((c) => c.creditoId.startsWith('drop:')).map((c) => ({ ...c, em: c.createdAt }));

  const jaAberto = baus.find((c) => c.creditoId === creditoId);
  if (jaAberto) {
    const { semRaroSeguidos } = situacaoDoBau(baus, diaDe(Date.now()), diaDe);
    const repetido = jaAberto.reason.startsWith('bau:repetido:');
    return json({
      jaExistia: true, item: repetido ? null : jaAberto.reason.slice('drop:'.length), repetido, seeds: jaAberto.amount,
      raridade: raridadeDoBau(jaAberto.reason), chances: CHANCES_DO_BAU,
      proximoRaroGarantidoEm: proximoRaroGarantidoEm(semRaroSeguidos), ...totais(creditos),
    });
  }

  const desempenho = rodadaRendeBau(daRodada);
  const { bausHoje, semRaroSeguidos } = situacaoDoBau(baus, diaDe(Date.now()), diaDe);
  const jaPossui = new Set<string>();
  for (const g of await db.getAll('gastos')) {
    if (g.reason.startsWith('loja:')) jaPossui.add(g.reason.slice('loja:'.length));
  }
  for (const c of creditos) {
    if (c.reason.startsWith('drop:')) jaPossui.add(c.reason.slice('drop:'.length));
  }
  const decisao = decidirBau({
    estrelas: desempenho.estrelas, bausHoje, semRaroSeguidos, sorteio: Math.random(), elegiveis: itensSorteaveisNoDrop(jaPossui),
  });

  if (decisao.tipo === 'sem-bau' && decisao.motivo === 'estrelas') {
    return json({ error: 'rodada sem baú: exige duas estrelas', code: 'rodada_sem_bau', codigo: 'rodada_sem_bau', detalhes: { estrelas: desempenho.estrelas, exigido: ESTRELAS_PARA_O_BAU } }, 400);
  }
  if (decisao.tipo === 'sem-bau') {
    return json({
      jaExistia: false, item: null, semBau: 'teto', bausHoje, limite: BAUS_POR_DIA, chances: CHANCES_DO_BAU,
      proximoRaroGarantidoEm: proximoRaroGarantidoEm(semRaroSeguidos), ...totais(creditos),
    });
  }

  const credito = decisao.tipo === 'item' ? valorDoDrop(creditoId, decisao.item.id) : valorDoRepetido(creditoId, decisao.raridade);
  if (ehRecusa(credito)) return json({ error: credito.erro, code: 'drop_invalido', codigo: 'drop_invalido' }, 400);

  await db.put('creditos', {
    creditoId: credito.creditoId, amount: credito.seeds, xp: credito.xp, reason: credito.reason, createdAt: Date.now(),
  });
  return json({
    jaExistia: false, item: decisao.tipo === 'item' ? decisao.item.id : null, repetido: decisao.tipo === 'seeds',
    seeds: credito.seeds, raridade: decisao.raridade, chances: CHANCES_DO_BAU,
    proximoRaroGarantidoEm: proximoRaroGarantidoEm(decisao.raridade === 'raro' ? 0 : semRaroSeguidos + 1),
    ...totais(await db.getAll('creditos')),
  });
}

/**
 * O REEMBOLSO DO CORTE DO CATÁLOGO, sem conta — a mesma régua do Express (`reembolsosDevidos`
 * sobre o razão de gastos). A idempotência aqui é a chave do IndexedDB: `creditos` é indexado por
 * `creditoId`, então duas abas gravando o mesmo reembolso sobrescrevem a mesma linha.
 */
export async function reembolsarSeeds(): Promise<Response> {
  const db = await abrirStore();
  const gastos = await db.getAll('gastos');
  const antes = await db.getAll('creditos');
  const ja = new Set(antes.filter((c) => c.creditoId.startsWith('reembolso:')).map((c) => c.creditoId));
  let creditado = 0;
  for (const d of reembolsosDevidos(gastos, ja)) {
    if (await db.get('creditos', d.creditoId)) continue;
    await db.put('creditos', { creditoId: d.creditoId, amount: d.seeds, xp: 0, reason: d.creditoId, createdAt: Date.now() });
    creditado += d.seeds;
  }
  const todos = await db.getAll('creditos');
  return json({
    creditado,
    reembolsado: todos.filter((c) => c.creditoId.startsWith('reembolso:')).reduce((n, c) => n + c.amount, 0),
    seedsCreditadas: todos.reduce((n, c) => n + c.amount, 0),
    xpCreditado: todos.reduce((n, c) => n + c.xp, 0),
  });
}

/* ── MAESTRIA (recompensas v2, onda 3) ── */

/** As linhas de jogo do store, na forma que a soma da maestria lê — a mesma do Express. */
async function linhasDeMaestria(): Promise<LinhaDeMaestria[]> {
  const db = await abrirStore();
  return (await db.getAll('exercicios')).map((e) => ({
    exerciseKind: e.exerciseKind, roundId: e.roundId, correct: e.correct, combo: e.melhorSequencia, createdAt: e.createdAt,
  }));
}

/**
 * GET `/api/metrics/maestria` — os 18 jogos com pontos e nível, e os créditos `maestria:` já
 * lançados. Espelho do Express: a soma é `maestriaPorJogo`, do core, sobre as linhas gravadas.
 */
export async function lerMaestria(): Promise<Response> {
  const jogos = maestriaPorJogo(await linhasDeMaestria()).map((m) => ({ ...m, ...nivelDeMaestria(m.pontos) }));
  const db = await abrirStore();
  const creditados = (await db.getAll('creditos')).map((c) => c.creditoId).filter((id) => id.startsWith('maestria:')).sort();
  return json({ jogos, creditados });
}

export async function creditarSeeds(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const creditoId = str(p.creditoId);
  if (!creditoId) return json({ error: 'creditoId é obrigatório', code: 'credito_desconhecido' }, 400);

  /* A família de drop desvia antes de `valorDoCredito`, exatamente como no Express: o valor de um
     baú depende do item sorteado, que não está no id. */
  const roundIdDeDrop = roundIdDoDrop(creditoId);
  if (roundIdDeDrop) return creditarDrop(creditoId, roundIdDeDrop, str(p.fuso));

  const credito = valorDoCredito(creditoId);
  if (ehRecusa(credito)) return json({ error: credito.erro, code: 'credito_desconhecido' }, 400);

  const db = await abrirStore();
  const existente = await db.get('creditos', creditoId);
  const jaExistia = !!existente;
  if (!jaExistia) {
    /* O NÍVEL É CONFERIDO AQUI TAMBÉM, e do mesmo jeito: `economiaDeMetricas` sobre o perfil que
       este servidor calcula. Sem isto o cofre da década 10 sairia no nível 1 para quem joga sem
       conta — e depois migraria para a conta com as Seeds já lançadas. A conferência só roda no
       crédito NOVO: o reenvio de um crédito já lançado não pode ser recusado por nível. */
    if (credito.nivelMinimo > 0) {
      const { nivel } = economiaDeMetricas(await perfilEfemero(null));
      if (nivel < credito.nivelMinimo) {
        return json({ error: 'nível insuficiente para este crédito', code: 'nivel_insuficiente', codigo: 'nivel_insuficiente', detalhes: { nivel, exigido: credito.nivelMinimo } }, 400);
      }
    }
    /* A MAESTRIA (recompensas v2, onda 3), com a régua do Express: os pontos do jogo, somados das
       linhas gravadas (uma vez por `roundId`), alcançam o limiar do nível pedido. */
    if (credito.maestria) {
      const { jogo, pontosExigidos } = credito.maestria;
      const pontos = maestriaPorJogo(await linhasDeMaestria()).find((m) => m.jogo === jogo)?.pontos ?? 0;
      if (pontos < pontosExigidos) {
        return json({ error: 'nível de maestria ainda não alcançado', code: 'maestria_nao_alcancada', codigo: 'maestria_nao_alcancada', detalhes: { pontos, exigido: pontosExigidos } }, 400);
      }
    }
    /* A META DO DIA (recompensas v2), com a régua do Express: hoje ou ontem no fuso de quem
       joga, e os acertos gravados daquele dia alcançando a meta. */
    if (credito.metaDoDia) {
      const fuso = fusoOuPadrao(str(p.fuso));
      const agora = Date.now();
      if (![diaNoFuso(agora, fuso), diaNoFuso(agora - 86_400_000, fuso)].includes(credito.metaDoDia)) {
        return json({ error: 'dia da meta fora da janela', code: 'dia_fora_da_janela', codigo: 'dia_fora_da_janela', detalhes: { dia: credito.metaDoDia } }, 400);
      }
      const acertos = acertosNoDia((await perfilEfemero(null)).acertosRecentes ?? [], credito.metaDoDia, fuso);
      if (!metaDoDiaCumprida(acertos)) {
        return json({ error: 'meta do dia ainda não cumprida', code: 'meta_nao_cumprida', codigo: 'meta_nao_cumprida', detalhes: { acertos, meta: META_DIARIA_ACERTOS } }, 400);
      }
    }
    /* O COLECIONADOR É CONFERIDO AQUI TAMBÉM, com a régua do Express (`progressoNoServidor`): os
       pré-requisitos dos eventos, gravados no banco. Até 27/09 os dois lados creditavam 100 Seeds
       e 120 XP a qualquer pedido — e o acervo do modo sem conta migra para a conta. As outras
       conquistas o efêmero ainda não confere (só o Express), e isto não muda aqui. */
    if (credito.conquista?.id === 'colecionador') {
      const metricas = await perfilEfemero(null);
      const melhorComboPorJogo: Record<string, number> = {};
      for (const e of await db.getAll('exercicios')) {
        if (!e.exerciseKind) continue;
        melhorComboPorJogo[e.exerciseKind] = Math.max(melhorComboPorJogo[e.exerciseKind] ?? 0, e.melhorSequencia ?? 0);
      }
      const ctx: ContextoDeConquistas = {
        metricas, nivel: economiaDeMetricas(metricas).nivel, melhorComboPorJogo,
        eventosVistos: 0, totalDeEventos: 0, idiomas: metricas.idiomas ?? 0, compras: metricas.itensComprados?.length ?? 0,
      };
      const { atual, meta } = progressoNoServidor(credito.conquista, ctx);
      if (atual < meta) {
        return json({ error: 'conquista ainda não cumprida', code: 'conquista_nao_cumprida', codigo: 'conquista_nao_cumprida', detalhes: { atual, meta } }, 400);
      }
    }
    await db.put('creditos', { creditoId, amount: credito.seeds, xp: credito.xp, reason: credito.reason, createdAt: Date.now() });
  }
  const todos = await db.getAll('creditos');
  return json({ jaExistia, seedsCreditadas: todos.reduce((n, c) => n + c.amount, 0), xpCreditado: todos.reduce((n, c) => n + c.xp, 0) });
}
