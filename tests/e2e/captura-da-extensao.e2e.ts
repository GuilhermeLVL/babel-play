import { expect, test } from '@playwright/test'

import { abrirTela } from './_helpers'

/**
 * CAPTURA PELA EXTENSÃO (flag `captura_da_extensao`, openspec `captura-em-um-clique` 3.1 a 3.3). A extensão de verdade
 * (`extensao/`) é simulada por `window.postMessage`, no formato do contrato: o que se prova é a TELA (o estado "Extensão
 * conectada" / "Sem extensão: usar o seletor"), a conferência de origem e que, sem `?fonte=extensao` ou sem a flag, nada
 * muda. O áudio pelo grafo WebAudio e o Chrome/Edge reais ficam para o aparelho real [R] (tarefas 1.4 e 2.3).
 */

const ligar = (page: import('@playwright/test').Page, ligada: boolean) =>
  page.route('**/api/flags', (r) =>
    r.fulfill({ json: { flags: ligada ? { captura_da_extensao: { ligada: true } } : {} } }),
  )

/** Conta os ouvintes de `message` que a página registra (a prova de "sem listener"). */
async function contarOuvintes(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __ouvintes: number; __pedidos: unknown[] }
    w.__ouvintes = 0
    w.__pedidos = []
    const original = window.addEventListener.bind(window)
    window.addEventListener = ((tipo: string, ...resto: unknown[]) => {
      if (tipo === 'message') w.__ouvintes++
      return (original as (...a: unknown[]) => void)(tipo, ...resto)
    }) as typeof window.addEventListener
    /* A "ponte": ouve o `pedir` que a página posta para si mesma. */
    original('message', (e: MessageEvent) => {
      if (e.data?.fonte === 'frasy-app') w.__pedidos.push(e.data)
    })
  })
}

const pedidosDaPagina = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __pedidos: Array<{ tipo: string }> }).__pedidos.map((p) => p.tipo))

const postarDaExtensao = (page: import('@playwright/test').Page, mensagem: Record<string, unknown>) =>
  page.evaluate((m) => window.postMessage(m, window.location.origin), mensagem)

const PRONTA = { fonte: 'frasy-extensao', versao: 1, tipo: 'pronta', sr: 16000, amostrasPorQuadro: 1600 }

test.describe('Captura pela extensão', () => {
  test.beforeEach(async ({ page: _p }, info) => {
    test.skip(info.project.name !== 'desktop-1280', 'a extensão é de Chrome e Edge no computador')
  })

  test('com a flag e ?fonte=extensao, pede o áudio e mostra "Extensão conectada" quando ela responde', async ({
    page,
  }) => {
    test.slow()
    await ligar(page, true)
    await contarOuvintes(page)
    await abrirTela(page, '/capturar?fonte=extensao')
    await expect.poll(() => pedidosDaPagina(page), { timeout: 20_000 }).toContain('pedir')
    await postarDaExtensao(page, PRONTA)
    await expect(page.getByTestId('extensao-estado')).toContainText('Extensão conectada', { timeout: 10_000 })
  })

  test('mensagem de outra origem não conecta', async ({ page }) => {
    test.slow()
    await ligar(page, true)
    await contarOuvintes(page)
    await abrirTela(page, '/capturar?fonte=extensao')
    await expect.poll(() => pedidosDaPagina(page), { timeout: 20_000 }).toContain('pedir')
    /* O ouvinte confere `event.origin`: uma mensagem com origem de outro site é ignorada. */
    await page.evaluate((m) => {
      window.dispatchEvent(new MessageEvent('message', { data: m, origin: 'https://evil.example', source: window }))
    }, PRONTA)
    await expect(page.getByTestId('extensao-estado')).not.toContainText('Extensão conectada')
  })

  test('sem extensão respondendo, cai no seletor: "Sem extensão: usar o seletor"', async ({ page }) => {
    test.slow()
    await ligar(page, true)
    await contarOuvintes(page)
    await abrirTela(page, '/capturar?fonte=extensao')
    await expect(page.getByTestId('extensao-estado')).toContainText('Sem extensão: usar o seletor', { timeout: 15_000 })
    /* O fluxo de sempre segue: o Iniciar continua lá para o seletor do navegador. */
    await expect(page.getByTestId('iniciar-captura')).toBeVisible()
  })

  test('sem ?fonte=extensao nada muda: nenhum pedido, nenhum estado', async ({ page }) => {
    test.slow()
    await ligar(page, true)
    await contarOuvintes(page)
    await abrirTela(page, '/capturar')
    await page.waitForTimeout(2500)
    expect(await pedidosDaPagina(page)).toEqual([])
    await expect(page.getByTestId('extensao-estado')).toHaveCount(0)
  })

  test('com ?fonte=extensao mas a flag desligada, nada muda', async ({ page }) => {
    test.slow()
    await ligar(page, false)
    await contarOuvintes(page)
    await abrirTela(page, '/capturar?fonte=extensao')
    await page.waitForTimeout(2500)
    expect(await pedidosDaPagina(page)).toEqual([])
    await expect(page.getByTestId('extensao-estado')).toHaveCount(0)
  })
})
