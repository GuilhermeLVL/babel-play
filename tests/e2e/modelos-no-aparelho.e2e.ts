import { expect, test } from '@playwright/test'

import { violacoesGraves } from './_acessibilidade'
import { abrirTela, clicarRobusto, verSemSobreposicao } from './_helpers'

/**
 * A TELA "Modelos no aparelho" (Ajustes → Processamento): abre, fixa o Equilibrado (o automático
 * desliga e a escolha fica no `localStorage`), volta ao automático, e passa no axe sem violação grave.
 * Os três projetos do Playwright cobrem o celular (375 × 812), o tablet e o computador.
 */
test.describe('Modelos no aparelho', () => {
  test('fixar o Equilibrado e voltar ao automático; axe sem violação grave', async ({ page }) => {
    await abrirTela(page, '/ajustes')
    await clicarRobusto(page, page.getByRole('tab', { name: /Processamento/ }))

    const painel = page.getByTestId('modelos-no-aparelho')
    await verSemSobreposicao(page, painel.getByRole('heading', { name: 'Modelos no aparelho' }))

    const auto = painel.getByRole('switch', { name: 'Automático (recomendado)' })
    /* Ponto de partida: o automático (outro projeto pode ter deixado um modelo fixado). */
    if ((await auto.getAttribute('aria-checked')) === 'false') await clicarRobusto(page, auto)
    await expect(auto).toHaveAttribute('aria-checked', 'true')

    const equilibrado = painel.getByRole('listitem', { name: 'Equilibrado' })
    await clicarRobusto(page, equilibrado.getByRole('button', { name: 'Usar este' }))
    await expect(auto).toHaveAttribute('aria-checked', 'false')
    await expect(equilibrado.getByRole('button', { name: 'Em uso' })).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => localStorage.getItem('babel.stt.modeloFixo'))).toBe('whisper-base')

    await clicarRobusto(page, auto)
    await expect(auto).toHaveAttribute('aria-checked', 'true')
    expect(await page.evaluate(() => localStorage.getItem('babel.stt.modeloFixo'))).toBeNull()

    /* Nada rola para o lado (o celular de 375 px incluso). */
    const largura = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(largura, 'a página não pode rolar para o lado').toBeLessThanOrEqual(0)

    expect(await violacoesGraves(page)).toEqual([])
  })
})
