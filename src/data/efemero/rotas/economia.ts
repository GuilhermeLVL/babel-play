/**
 * ESPELHO SEM CONTA — Seeds, presença e o baú de fim de rodada.
 *
 * Metade de `src/data/rotas/economia.ts`. O caminho HTTP destas três rotas é de métrica, mas o
 * domínio é a economia: quem decide o preço, o valor e a idempotência é `core/economiaAutoridade`,
 * e é ele que precisa bater com o Express. O cliente faz exatamente o mesmo corte.
 *
 * Rotas: POST `/api/metrics/seeds/gastar`, POST `/api/metrics/seeds/creditar`,
 * POST `/api/metrics/presenca`.
 *
 * `/api/billing/*` (créditos comprados com dinheiro, passe) NÃO tem espelho — justificado em
 * `tests/contratos/rotas-espelhadas`: moeda paga nasce e morre no servidor.
 */
import { abrirStore } from '../store';
import { diaLocal, sequencias } from '../../../core/learning/economia';
import { economiaDeMetricas } from '../../../core/learning/xp';
import {
  valorDoCredito, autorizarGasto, ehRecusa,
  roundIdDoDrop, itensSorteaveisNoDrop, sortearItemDoDrop, valorDoDrop,
} from '../../../core/economiaAutoridade';
import { json, lerJson, num, str } from '../servidor';
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
async function creditarDrop(creditoId: string, roundId: string): Promise<Response> {
  const db = await abrirStore();
  const exercicios = await db.getAll('exercicios');
  if (!exercicios.some((e) => e.roundId === roundId)) {
    return json({ error: 'rodada inexistente para este drop', code: 'rodada_inexistente', codigo: 'rodada_inexistente', detalhes: { roundId } }, 400);
  }

  const creditos = await db.getAll('creditos');
  const totais = (linhas: typeof creditos) => ({
    seedsCreditadas: linhas.reduce((n, c) => n + c.amount, 0),
    xpCreditado: linhas.reduce((n, c) => n + c.xp, 0),
  });

  const jaAberto = creditos.find((c) => c.creditoId === creditoId);
  if (jaAberto) {
    return json({ jaExistia: true, item: jaAberto.reason.slice('drop:'.length), ...totais(creditos) });
  }

  const jaPossui = new Set<string>();
  for (const g of await db.getAll('gastos')) {
    if (g.reason.startsWith('loja:')) jaPossui.add(g.reason.slice('loja:'.length));
  }
  for (const c of creditos) {
    if (c.reason.startsWith('drop:')) jaPossui.add(c.reason.slice('drop:'.length));
  }

  const sorteado = sortearItemDoDrop(Math.random(), itensSorteaveisNoDrop(jaPossui));
  if (!sorteado) return json({ jaExistia: false, item: null, ...totais(creditos) });

  const credito = valorDoDrop(creditoId, sorteado.id);
  if (ehRecusa(credito)) return json({ error: credito.erro, code: 'drop_invalido', codigo: 'drop_invalido' }, 400);

  await db.put('creditos', {
    creditoId: credito.creditoId, amount: credito.seeds, xp: credito.xp, reason: credito.reason, createdAt: Date.now(),
  });
  return json({ jaExistia: false, item: sorteado.id, ...totais(await db.getAll('creditos')) });
}

export async function creditarSeeds(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const creditoId = str(p.creditoId);
  if (!creditoId) return json({ error: 'creditoId é obrigatório', code: 'credito_desconhecido' }, 400);

  /* A família de drop desvia antes de `valorDoCredito`, exatamente como no Express: o valor de um
     baú depende do item sorteado, que não está no id. */
  const roundIdDeDrop = roundIdDoDrop(creditoId);
  if (roundIdDeDrop) return creditarDrop(creditoId, roundIdDeDrop);

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
    await db.put('creditos', { creditoId, amount: credito.seeds, xp: credito.xp, reason: credito.reason, createdAt: Date.now() });
  }
  const todos = await db.getAll('creditos');
  return json({ jaExistia, seedsCreditadas: todos.reduce((n, c) => n + c.amount, 0), xpCreditado: todos.reduce((n, c) => n + c.xp, 0) });
}
