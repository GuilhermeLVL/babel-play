import { expect, test } from '@playwright/test'

import { perfil, saldoEsperado, semearCartoes } from './_fixtures'
import { abrirTela, fecharSobreposicoes } from './_helpers'

/**
 * AS SEEDS NA LOJA: o saldo que a tela mostra é o que o servidor calcula, e a compra respeita o
 * saldo.
 *
 * O saldo não vem pronto de nenhuma rota — `deriveProgress` faz ganhas − gastas a partir de
 * `GET /api/metrics/profile` (ver `saldoEsperado` em `_fixtures.ts`). É exatamente por isso que
 * vale um e2e: um peso trocado no core, ou um campo que a rota parou de mandar, muda o número da
 * tela sem que nenhum teste unitário de tela ou de rota perceba.
 *
 * A compra é CONDICIONAL ao saldo, e o teste diz qual ramo exercitou: numa conta recém-nascida as
 * Seeds vêm só dos cartões criados (1 por cartão) e não pagam o item mais barato — então o que se
 * prova é a mensagem "Faltam N Seeds" com o N certo. Com saldo, prova-se a compra.
 *
 * NO DESENHO NOVO (09/10/2026) a prateleira é a aba Loja de Personalizar (`/loja/loja`,
 * `LojaDoPrototipo`): a carteira (`carteira-de-seeds`) repete o saldo do cabeçalho
 * (`saldo-de-seeds`), cada peça traz o preço (`[data-preco-seeds]`) e compra-se SEGURANDO o botão
 * ("Segure para comprar"), não com um clique.
 */

test.beforeAll(async () => {
  await semearCartoes()
})

const numeroDe = (t: string | null) => Number((t ?? '').replace(/\D/g, ''))

test.describe('Seeds na Loja', () => {
  test('o saldo da tela é o do servidor, e o item mais barato diz o que falta ou se compra', async ({ page }) => {
    test.slow()
    await abrirTela(page, '/loja/loja')

    const carteira = page.getByTestId('carteira-de-seeds')
    await expect(carteira).toBeVisible({ timeout: 15_000 })
    const lerSaldo = async () => numeroDe(await carteira.locator('.px-saldo').textContent())

    /* O PERFIL É LIDO DEPOIS DE A TELA ABRIR, e com espera: abrir o app avalia conquistas e a meta
       do dia (a recompensa que `fecharSobreposicoes` fecha), e cada crédito muda o saldo. Ler antes
       comparava dois instantes diferentes da mesma conta. */
    let esperado = -1
    await expect
      .poll(
        async () => {
          await fecharSobreposicoes(page)
          esperado = saldoEsperado(await perfil())
          return (await lerSaldo()) === esperado ? 'igual' : `tela ${await lerSaldo()} vs servidor ${esperado}`
        },
        { timeout: 15_000, message: 'o saldo da tela deveria ser o que o perfil do servidor deriva' },
      )
      .toBe('igual')
    expect(esperado).toBeGreaterThanOrEqual(0)
    // O cabeçalho e a carteira dizem o mesmo número.
    expect(numeroDe(await page.getByTestId('saldo-de-seeds').textContent())).toBe(esperado)

    /* O ITEM MAIS BARATO da prateleira de Seeds: o menor número ao lado do broto. */
    const prateleira = page.getByTestId('prateleira-de-seeds')
    const precos = await prateleira.locator('[data-preco-seeds]').allTextContents()
    const valores = precos.map(numeroDe).filter((n) => Number.isFinite(n) && n > 0)
    expect(valores.length, 'a Loja deveria listar itens com preço em Seeds').toBeGreaterThan(0)
    const maisBarato = Math.min(...valores)

    if (esperado >= maisBarato) {
      const comprar = prateleira.getByRole('button', { name: 'Segure para comprar' }).first()
      await expect(comprar).toBeVisible()
      await comprar.scrollIntoViewIfNeeded()
      // Segurar até o fim é a compra; soltar antes desiste.
      await comprar.hover()
      await page.mouse.down()
      await expect.poll(async () => saldoEsperado(await perfil()), { timeout: 15_000 }).toBeLessThan(esperado)
      await page.mouse.up()
      test.info().annotations.push({ type: 'ramo', description: `comprou: saldo ${esperado} >= item de ${maisBarato}` })
    } else {
      const falta = maisBarato - esperado
      await expect(
        prateleira.getByText(`Faltam ${falta} Seeds`, { exact: true }).first(),
        `com ${esperado} Seeds e item de ${maisBarato}, deveria dizer "Faltam ${falta} Seeds"`,
      ).toBeVisible()
      await expect(prateleira.getByRole('button', { name: 'Segure para comprar' })).toHaveCount(0)
      test
        .info()
        .annotations.push({ type: 'ramo', description: `sem saldo: ${esperado} < ${maisBarato}, faltam ${falta}` })
    }
  })
})
