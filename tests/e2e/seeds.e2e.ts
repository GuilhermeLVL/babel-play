import { test, expect } from '@playwright/test';
import { fecharSobreposicoes, clicarRobusto } from './_helpers';
import { semearCartoes, perfil, saldoEsperado } from './_fixtures';

/**
 * AS SEEDS NA LOJA: o saldo que a tela mostra e o que o servidor calcula, e a compra respeita o
 * saldo.
 *
 * O saldo nao vem pronto de nenhuma rota — `deriveProgress` faz ganhas − gastas a partir de
 * `GET /api/metrics/profile` (ver `saldoEsperado` em `_fixtures.ts`). E exatamente por isso que
 * vale um e2e: um peso trocado no core, ou um campo que a rota parou de mandar, muda o numero da
 * tela sem que nenhum teste unitario de tela ou de rota perceba.
 *
 * A compra e CONDICIONAL ao saldo, e o teste diz qual ramo exercitou: numa conta recem-nascida as
 * Seeds vem so dos cartoes criados (1 por cartao) e nao pagam o item mais barato (40) — entao o
 * que se prova e a mensagem "Faltam N Seeds" com o N certo. Com saldo, prova-se a compra.
 */

test.beforeAll(async () => {
  await semearCartoes();
});

test.describe('Seeds na Loja', () => {
  test('o saldo da tela e o do servidor, e o item mais barato diz o que falta ou se compra', async ({ page }) => {
    test.slow();
    await page.goto('/loja/itens');
    await expect(page.getByRole('main')).toBeVisible();
    await fecharSobreposicoes(page);

    /* O cartao "Seeds" das duas moedas, com o saldo em <b> ao lado do nome. */
    const cartaoSeeds = page.locator('p').filter({ has: page.getByText('Seeds', { exact: true }) }).first();
    await expect(cartaoSeeds).toBeVisible({ timeout: 15_000 });
    const lerSaldo = async () => Number(((await cartaoSeeds.locator('b').first().textContent()) ?? '').replace(/\D/g, ''));

    /* O PERFIL E LIDO DEPOIS DE A TELA ABRIR, e com espera: abrir o app credita a presenca do dia
       e avalia conquistas (o dialogo de recompensa que `fecharSobreposicoes` fecha), e cada
       credito muda o saldo. Ler antes comparava dois instantes diferentes da mesma conta. */
    let esperado = -1;
    await expect.poll(async () => {
      esperado = saldoEsperado(await perfil());
      return (await lerSaldo()) === esperado ? 'igual' : `tela ${await lerSaldo()} vs servidor ${esperado}`;
    }, { timeout: 10_000, message: 'o saldo da tela deveria ser o que o perfil do servidor deriva' }).toBe('igual');
    expect(esperado).toBeGreaterThanOrEqual(0);

    /* O ITEM MAIS BARATO da prateleira de Seeds: o menor numero ao lado do broto. */
    const precos = await page.locator('span.text-good.tabular-nums').allTextContents();
    const valores = precos.map((t) => Number(t.replace(/\D/g, ''))).filter((n) => Number.isFinite(n) && n > 0);
    expect(valores.length, 'a Loja deveria listar itens com preco em Seeds').toBeGreaterThan(0);
    const maisBarato = Math.min(...valores);

    if (esperado >= maisBarato) {
      const comprar = page.getByRole('button', { name: 'Comprar com Seeds' }).first();
      await expect(comprar).toBeVisible();
      await clicarRobusto(page, comprar);
      await expect.poll(async () => saldoEsperado(await perfil()), { timeout: 10_000 }).toBeLessThan(esperado);
      test.info().annotations.push({ type: 'ramo', description: `comprou: saldo ${esperado} >= item de ${maisBarato}` });
    } else {
      const falta = maisBarato - esperado;
      await expect(
        page.getByText(`Faltam ${falta} Seeds`, { exact: true }).first(),
        `com ${esperado} Seeds e item de ${maisBarato}, deveria dizer "Faltam ${falta} Seeds"`,
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Comprar com Seeds' })).toHaveCount(0);
      test.info().annotations.push({ type: 'ramo', description: `sem saldo: ${esperado} < ${maisBarato}, faltam ${falta}` });
    }
  });
});
