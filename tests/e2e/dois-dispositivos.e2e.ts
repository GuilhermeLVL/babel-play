import { test, expect, type Browser } from '@playwright/test';
import { fecharSobreposicoes } from './_helpers';
import { semearCartoes, perfil, saldoEsperado, rodadaPerfeitaViaApi, gastarSeedsViaApi, type CartaoNoServidor } from './_fixtures';

/**
 * A MESMA CONTA EM DOIS APARELHOS: o saldo e um so, e duas compras ao mesmo tempo nao o furam.
 *
 * Dois `browser.newContext()` sao dois navegadores sem storage em comum batendo no mesmo
 * usuario self-host. O contexto A ganha Seeds (uma rodada perfeita, pela mesma rota
 * `POST /api/exercises/rodada` que os jogos usam); o contexto B recarrega a Loja e ve o saldo
 * novo — que e o que "o servidor e a fonte" quer dizer na pratica.
 *
 * Depois, A e B tentam comprar AO MESMO TEMPO dois itens cujo preco somado passa do saldo. O
 * servidor confere o saldo antes (`402 saldo_insuficiente`) e, na corrida, o `INSERT` com teto
 * (`seedSpendsRepo.debitar`) barra o segundo — a auditoria de 01/09 fechou o furo em que "o unico
 * guarda era o botao desabilitado na tela". O que se afirma: no maximo uma compra passa quando
 * as duas nao cabem, o saldo final nunca fica negativo, e e o mesmo nas duas telas e no perfil.
 *
 * Roda com `--repeat-each=3`: uma corrida que passa uma vez nao prova nada.
 */

/**
 * Pares de itens da prateleira de Seeds (`CATALOGO_DA_LOJA`, precos de 08/09). Cada repeticao
 * usa um par DIFERENTE: o gasto e idempotente por `spendId`, e o servidor ja recusa comprar de
 * novo o que a conta possui — um par repetido esvaziaria a corrida.
 */
const PARES: Array<[{ id: string; preco: number }, { id: string; preco: number }]> = [
  [{ id: 'gal-cat-esportes', preco: 40 }, { id: 'gal-cat-patos', preco: 40 }],
  [{ id: 'cur-pata', preco: 45 }, { id: 'part-pixel', preco: 45 }],
  [{ id: 'cur-cafe', preco: 50 }, { id: 'cur-mira', preco: 50 }],
  [{ id: 'cur-tinteiro', preco: 50 }, { id: 'gal-cat-festa', preco: 50 }],
];

let cartoes: CartaoNoServidor[] = [];

test.beforeAll(async () => {
  cartoes = await semearCartoes();
});

async function saldoNaLoja(browser: Browser, viewport: { width: number; height: number } | null) {
  const ctx = await browser.newContext({ viewport: viewport ?? undefined });
  const page = await ctx.newPage();
  await page.goto('/loja/itens');
  await expect(page.getByRole('main')).toBeVisible();
  await fecharSobreposicoes(page);
  const cartaoSeeds = page.locator('p').filter({ has: page.getByText('Seeds', { exact: true }) }).first();
  await expect(cartaoSeeds).toBeVisible({ timeout: 15_000 });
  const ler = async () => Number(((await cartaoSeeds.locator('b').first().textContent()) ?? '').replace(/\D/g, ''));
  return { ctx, page, cartaoSeeds, ler };
}

test.describe('Dois dispositivos, uma conta', () => {
  test('o saldo ganho num aparelho aparece no outro, e a compra simultanea nao deixa saldo negativo', async ({ browser, viewport }) => {
    test.slow();
    /* Cada repeticao gasta itens DIFERENTES: o spendId e idempotente por item, e um item ja
       comprado voltaria `jaExistia` sem cobrar — o que esvaziaria a corrida. */
    const rodada = test.info().repeatEachIndex;
    const jaComprados = new Set((await perfil()).itensComprados ?? []);
    /* O par desta repeticao: o primeiro ainda nao comprado, a partir do indice da repeticao. Os
       tres projetos (viewports) passam por aqui no mesmo banco, entao "repeticao" nao basta. */
    const par = [...PARES.slice(rodada % PARES.length), ...PARES].find(([a, b]) => !jaComprados.has(a.id) && !jaComprados.has(b.id));
    test.skip(!par, 'todos os pares de itens desta suite ja foram comprados neste banco');
    const [itemA, itemB] = par!;

    // Contexto B abre a Loja ANTES de A ganhar: e o "outro aparelho" que precisa ver a mudanca.
    const B = await saldoNaLoja(browser, viewport);
    const saldoInicialB = await B.ler();
    expect(saldoInicialB).toBe(saldoEsperado(await perfil()));

    // Contexto A: uma rodada perfeita com 8 itens (8 Seeds de acerto + 5 de rodada perfeita).
    const A = await saldoNaLoja(browser, viewport);
    await rodadaPerfeitaViaApi(cartoes.slice(0, 8), 'memory');
    const depoisDaRodada = saldoEsperado(await perfil());
    expect(depoisDaRodada, 'a rodada deveria ter rendido Seeds').toBeGreaterThan(saldoInicialB);

    /* CONTRA O SERVIDOR VIVO: reabrir a tela avalia conquistas ("Cliente", "rodada perfeita"...)
       e cada uma credita Seeds — o saldo sobe DEPOIS do instantaneo `depoisDaRodada` sem que A
       tenha feito mais nada. O que se afirma e que B converge para o que o perfil diz, e que isso
       e mais do que B via antes. */
    const telaIgualAoServidor = (ler: () => Promise<number>) => async () => {
      const servidor = saldoEsperado(await perfil());
      const tela = await ler();
      return tela === servidor ? 'igual' : `tela ${tela} vs servidor ${servidor}`;
    };
    await B.page.reload();
    await expect(B.page.getByRole('main')).toBeVisible();
    await fecharSobreposicoes(B.page);
    await expect.poll(telaIgualAoServidor(B.ler), { timeout: 10_000, message: 'B deveria ver o saldo ganho por A' }).toBe('igual');
    expect(await B.ler(), 'B deveria ver mais Seeds do que antes da rodada de A').toBeGreaterThan(saldoInicialB);
    await A.page.reload();
    await expect(A.page.getByRole('main')).toBeVisible();
    await fecharSobreposicoes(A.page);
    await expect.poll(telaIgualAoServidor(A.ler), { timeout: 10_000 }).toBe('igual');

    /* GARANTE A CONDICAO DA CORRIDA: os dois precos somados tem de passar do saldo, mas pelo
       menos um deles tem de caber — senao a corrida e trivial (as duas recusam de saida). Com um
       saldo pequeno demais, ganha-se mais uma rodada; com um saldo grande demais (repeticoes
       anteriores), a compra dupla ainda e valida, so nao e uma corrida. O teste registra qual foi. */
    let saldo = depoisDaRodada;
    const maisCaro = Math.max(itemA.preco, itemB.preco);
    for (let i = 0; i < 6 && saldo < maisCaro; i++) {
      await rodadaPerfeitaViaApi(cartoes.slice(0, 8), 'memory');
      saldo = saldoEsperado(await perfil());
    }
    expect(saldo, 'nao consegui juntar Seeds para uma compra').toBeGreaterThanOrEqual(maisCaro);
    const cabemAsDuas = saldo >= itemA.preco + itemB.preco;
    test.info().annotations.push({ type: 'corrida', description: `saldo ${saldo}; itens ${itemA.id} (${itemA.preco}) + ${itemB.id} (${itemB.preco}); ${cabemAsDuas ? 'cabem as duas' : 'so cabe uma'}` });

    /* O RETRATO DE ANTES, e nao so o saldo: a compra faz a tela avaliar conquistas, e uma
       conquista credita Seeds por `POST /seeds/creditar` no MEIO da corrida. Sem separar as duas
       parcelas, o saldo final parece "errado" por 20 quando o que houve foi um credito legitimo
       (medido: esperado 19, veio 39, na primeira compra da conta). O que e exato e o GASTO. */
    const antes = await perfil();
    const saldoAntes = saldoEsperado(antes);
    const [ra, rb] = await Promise.all([
      gastarSeedsViaApi({ spendId: `e2e-${rodada}-a-${itemA.id}`, amount: itemA.preco, reason: `loja:${itemA.id}` }),
      gastarSeedsViaApi({ spendId: `e2e-${rodada}-b-${itemB.id}`, amount: itemB.preco, reason: `loja:${itemB.id}` }),
    ]);
    const passaram = [ra, rb].filter((r) => r.status === 200).length;
    const recusadas = [ra, rb].filter((r) => r.status === 402).length;
    expect(passaram + recusadas, `respostas inesperadas: ${JSON.stringify([ra, rb])}`).toBe(2);
    if (cabemAsDuas) expect(passaram).toBe(2);
    else expect(passaram, 'com saldo para uma so, exatamente uma compra deveria passar').toBe(1);

    const p = await perfil();
    const final = saldoEsperado(p);
    expect(final).toBeGreaterThanOrEqual(0);
    const gastoAgora = (ra.status === 200 ? itemA.preco : 0) + (rb.status === 200 ? itemB.preco : 0);
    /* O gasto e EXATO: o servidor debitou exatamente o preco do que aceitou, nem um Seed a mais. */
    expect(p.seedsGastas - antes.seedsGastas, 'o debito tem de ser exatamente o preco do que passou').toBe(gastoAgora);
    /* O SALDO FECHA CONTRA O RETRATO IMEDIATAMENTE ANTERIOR A CORRIDA, e nao contra o `saldo`
       lido la em cima: entre os dois ha recarregamento de pagina, e recarregar a Loja faz o app
       creditar o que a tela avalia (medido: +20 Seeds entre as duas leituras, com `seedsCreditadas`
       inalterado — a parcela veio de `seedsGanhasDeEventos`). Comparar com o valor velho tornava o
       teste intermitente e escondia o que importa: o servidor debita exatamente o preco do que
       aceitou. A anotacao guarda os campos que mudaram, para uma mudanca de economia aparecer no
       relatorio em vez de virar ruido. */
    const delta: Record<string, number> = {};
    for (const k of Object.keys(p) as Array<keyof typeof p>) {
      const dep = p[k]; const ant = antes[k];
      if (typeof dep === 'number' && typeof ant === 'number' && dep !== ant) delta[String(k)] = dep - ant;
    }
    test.info().annotations.push({ type: 'saldo', description: `antes ${saldoAntes}, gasto ${gastoAgora}, final ${final}; campos que mudaram: ${JSON.stringify(delta)}` });
    const creditoNoMeio = (p.seedsCreditadas ?? 0) - (antes.seedsCreditadas ?? 0);
    expect(creditoNoMeio, 'credito nunca e negativo').toBeGreaterThanOrEqual(0);
    expect(final, 'saldo final = saldo de antes da corrida − gasto + credito recebido no meio').toBe(saldoAntes - gastoAgora + creditoNoMeio);
    expect(p.seedsGastas).toBeGreaterThan(0);

    /* CONTRA O SERVIDOR VIVO, nao contra o instantaneo `final`: reabrir a Loja avalia conquistas
       (a primeira compra credita Seeds, por `POST /seeds/creditar`), e o saldo muda DEPOIS da
       compra sem que nenhuma compra tenha acontecido. O que se afirma e que as duas telas
       convergem para o que o perfil diz naquele instante — e que ele nunca cai abaixo de zero. */
    for (const ctx of [A, B]) {
      await ctx.page.reload();
      await expect(ctx.page.getByRole('main')).toBeVisible();
      await fecharSobreposicoes(ctx.page);
      await expect.poll(telaIgualAoServidor(ctx.ler), { timeout: 10_000, message: 'as duas telas deveriam mostrar o saldo do servidor' }).toBe('igual');
    }
    expect(saldoEsperado(await perfil())).toBeGreaterThanOrEqual(final);
    await A.ctx.close();
    await B.ctx.close();
  });
});
