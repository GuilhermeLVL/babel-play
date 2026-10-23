import { expect, test } from '@playwright/test'

import { violacoesGraves } from './_acessibilidade'
import { iniciarCaptura } from './_captura'
import { abrirTela, clicarRobusto, verSemSobreposicao } from './_helpers'

/**
 * A TELA "Modelos no aparelho" (Ajustes → Processamento): abre, fixa o Equilibrado (o automático
 * desliga e a escolha fica no `localStorage`), volta ao automático, e passa no axe sem violação grave.
 * Os três projetos do Playwright cobrem o celular (375 × 812), o tablet e o computador.
 */
/* A captura (segundo grupo) precisa de microfone e tela falsos; no primeiro, nada muda. */
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--auto-select-desktop-capture-source=Entire screen',
    ],
  },
})

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

test.describe('Modelos no aparelho na Captura', () => {
  /* A CAPTURA RESPEITA O FIXADO (critério da spec): fixar o Equilibrado em Ajustes, abrir Capturar e
     iniciar — a rota desta captura é "escolhido por você (Whisper base)", e o painel "Modelo no
     dispositivo" (chip de estado → "Neste aparelho") diz isso. É o rótulo, e não só o nome do modelo,
     que prova a escolha: no padrão da suíte ("Detectar") o automático também cairia no Whisper base.
     No celular o painel não lista o modelo local (a folha dele não tem a linha), então lá não se vê. */
  test('fixar o Equilibrado em Ajustes: a Captura usa o escolhido', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-375', 'no celular a folha do nível não mostra o modelo local')
    // Nenhum modelo é baixado: o que se confere é a rota que a captura escolheu, não o reconhecimento.
    await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
    await abrirTela(page, '/ajustes')
    await clicarRobusto(page, page.getByRole('tab', { name: /Processamento/ }))
    const painel = page.getByTestId('modelos-no-aparelho')
    const equilibrado = painel.getByRole('listitem', { name: 'Equilibrado' })
    await verSemSobreposicao(page, equilibrado)
    await clicarRobusto(page, equilibrado.getByRole('button', { name: /Usar este|Em uso/ }))
    await expect(equilibrado.getByRole('button', { name: 'Em uso' })).toHaveAttribute('aria-pressed', 'true')

    await abrirTela(page, '/capturar')
    await iniciarCaptura(page)
    await clicarRobusto(page, page.getByRole('button', { name: /Abrir o nível, o modelo/ }))
    await clicarRobusto(page, page.getByRole('button', { name: /Ver o modelo, atualizar ou liberar espaço/ }))
    const dialogo = page.getByRole('dialog', { name: /Modelo no dispositivo/ })
    await expect(dialogo).toBeVisible()
    await expect(dialogo.getByText(/Transcrição \(Whisper base/)).toBeVisible()
    /* O rótulo da rota vai no texto ("Nesta captura: …") ou, com o selo da fala, no `title` dele. */
    await expect.poll(() => dialogo.innerHTML(), { timeout: 15_000 }).toContain('escolhido por você (Whisper base)')

    /* Deixa o automático de volta para os outros projetos e suítes. */
    await page.evaluate(() => localStorage.removeItem('babel.stt.modeloFixo'))
  })
})
