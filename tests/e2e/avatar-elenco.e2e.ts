import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { faladas, preparar, terminar } from './_livro'

/**
 * O ELENCO NA NARRAÇÃO DO LEITOR (M5, flag `avatar_elenco`), no app de verdade, com a `speechSynthesis` TROCADA por uma de
 * mentira (4 vozes em inglês; o teste decide quando cada frase "termina"), o catálogo, a ficha e o EPUB respondidos pelo
 * próprio teste. Provado aqui: sem a flag nada aparece; com a flag o painel lista as personagens da ficha, a personagem fala
 * com a voz dela (`voiceName` no motor), a narração fica na voz de sempre, a emoção muda o ritmo/tom, o avatar-narrador
 * aparece com a legenda de quem fala, e desligar o elenco volta a uma voz só. NÃO provado: voz real do aparelho, Safari,
 * Firefox, celular real, timbres.
 *
 * Capturas: `$AVATAR_CAPTURAS` (padrão `tests/e2e/__capturas__/`, fora do git).
 */
const CAPTURAS = process.env.AVATAR_CAPTURAS || path.join(process.cwd(), 'tests', 'e2e', '__capturas__')
mkdirSync(CAPTURAS, { recursive: true })

test.use({
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  },
})

const foto = (page: Page, nome: string) =>
  page.screenshot({ path: path.join(CAPTURAS, `elenco-${test.info().project.name}-${nome}.png`) })

test.describe('Elenco na narração do leitor', () => {
  test('sem a flag, nada do elenco aparece e a narração é a de sempre', async ({ page }) => {
    test.slow()
    await preparar(page, {})
    await page.getByTestId('leitor-ouvir').click()
    await page.getByRole('button', { name: /Voz e modo/ }).click()
    await expect(page.getByTestId('painel-narracao')).toBeVisible()
    await expect(page.getByTestId('painel-elenco')).toHaveCount(0)
    await expect(page.getByTestId('avatar-do-narrador')).toHaveCount(0)
    await expect.poll(async () => (await faladas(page)).length).toBeGreaterThan(0)
    expect((await faladas(page))[0].voz).not.toBe('Teste B')
  })

  test('com a flag: personagens da ficha, voz própria por personagem, emoção no ritmo, avatar com legenda e volta a uma voz só', async ({
    page,
  }) => {
    test.slow()
    await preparar(page, { avatar_elenco: true, avatar_3d: true })
    await page.getByTestId('leitor-ouvir').click()
    await page.getByRole('button', { name: /Voz e modo/ }).click()
    const painel = page.getByTestId('painel-elenco')
    await expect(painel).toBeVisible()

    // Desligado por padrão: uma voz só.
    await expect(page.getByTestId('elenco-resumo')).toContainText('uma voz só')
    await expect(page.getByTestId('avatar-do-narrador')).toHaveCount(0)

    // Teclado: o interruptor é focável e o Espaço liga.
    const ligar = page.getByTestId('elenco-ligar')
    await ligar.focus()
    await page.keyboard.press('Space')
    await expect(ligar).toBeChecked()
    await expect(page.getByTestId('elenco-resumo')).toContainText('2')
    await expect(page.getByLabel('Ana', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Bruno', { exact: true })).toBeVisible()
    await foto(page, 'painel')

    // A narração recomeça com o elenco: percorre as 5 frases (título + 4) anotando voz, ritmo e tom.
    for (let i = 0; i < 6; i++) {
      if ((await faladas(page)).some((f) => f.texto.includes('I am coming now'))) break
      await terminar(page)
      await page.waitForTimeout(150)
    }
    const f = await faladas(page)
    const por = (trecho: string) => f.filter((x) => x.texto.includes(trecho)).at(-1)!
    const ana = por('Come here')
    const bruno = por('I am coming now')
    const narracao = por('The evening settled')
    expect(ana.voz).toMatch(/Teste [A-D]/)
    expect(bruno.voz).toMatch(/Teste [A-D]/)
    expect(ana.voz).not.toBe(bruno.voz)
    // A narração fica na voz da pessoa (a automática), que não é a de nenhuma personagem.
    expect([ana.voz, bruno.voz]).not.toContain(narracao.voz)
    // "sad and lonely": duas pistas, então a emoção muda ritmo e tom da fala da Ana.
    expect(ana.rate).toBeLessThan(narracao.rate)
    expect(ana.pitch).toBeLessThan(narracao.pitch)

    // O avatar-narrador é do botão "Avatar" (só `avatar_3d`); o elenco só dá um rosto a cada personagem.
    await expect(page.getByTestId('avatar-do-narrador')).toHaveCount(0)
    await page.getByTestId('botao-avatar-livro').click()
    // O avatar-narrador aparece, com a legenda de quem fala (sempre em texto).
    const avatar = page.getByTestId('avatar-do-narrador')
    await expect(avatar).toBeVisible()
    await expect(avatar.getByTestId('avatar-do-narrador-legenda')).toContainText(/Narrador|Ana|Bruno/)
    await expect(avatar.getByTestId('avatar-do-narrador-rosto').locator('canvas')).toBeVisible({ timeout: 30_000 })
    await foto(page, 'avatar')

    // Trocar a voz da Ana vale na frase seguinte.
    await page.getByTestId('elenco-avatar').uncheck()
    await expect(page.getByTestId('avatar-do-narrador')).toBeVisible() // sem rosto por personagem, o avatar segue
    await page.getByTestId('elenco-avatar').check()

    // Desligar o elenco: volta a uma voz só (nenhuma frase com voz de personagem).
    await ligar.uncheck()
    await expect(page.getByTestId('elenco-resumo')).toContainText('uma voz só')
    await expect(page.getByTestId('avatar-do-narrador-legenda')).toContainText('Narrador')
    // A frase em curso (a do Bruno) recomeça já na voz do narrador.
    await expect
      .poll(async () => {
        const u = (await faladas(page)).at(-1)!
        return u.texto.includes('I am coming now') ? u.voz : 'ainda-nao'
      })
      .toBe(narracao.voz)
  })

  test('descoberta: botão Elenco, dica da primeira vez, elenco no topo e Experimentar voz', async ({ page }) => {
    test.slow()
    await preparar(page, { avatar_elenco: true })
    const botao = page.getByTestId('leitor-elenco')
    await expect(botao).toBeVisible()
    await expect(botao).toContainText('Elenco')
    await expect(botao).toContainText('2')
    await expect(botao).toHaveAttribute('aria-pressed', 'false')
    const caixa = (await botao.boundingBox())!
    expect(caixa.height).toBeGreaterThanOrEqual(44)
    expect(caixa.width).toBeGreaterThanOrEqual(44)

    // A dica da primeira vez: discreta, com a contagem, sem tirar o livro do lugar.
    const dica = page.getByTestId('dica-elenco')
    await expect(dica).toContainText('2 personagens')
    await page.waitForTimeout(600)
    await foto(page, 'descoberta-dica')

    // Teclado: Tab chega ao botão da dica, Enter abre o painel do elenco, no topo.
    await dica.getByRole('button', { name: 'Escolher as vozes' }).focus()
    await page.keyboard.press('Enter')
    await expect(dica).toHaveCount(0)
    const painel = page.getByTestId('painel-elenco')
    await expect(painel).toBeVisible()
    await expect(page.getByTestId('painel-narracao')).toBeVisible()
    const topoDoElenco = (await painel.boundingBox())!.y
    const topoDaNarracao = (await page.getByTestId('painel-narracao').boundingBox())!.y
    expect(topoDoElenco).toBeLessThan(topoDaNarracao)

    // Ligar o elenco: os seletores aparecem sem rolar demais (dentro da tela).
    await page.getByTestId('elenco-ligar').check()
    await expect(botao).toHaveAttribute('aria-pressed', 'true')
    const viewport = page.viewportSize()!
    const sel = page.getByTestId('elenco-voz-0')
    await expect(sel).toBeVisible()
    expect((await sel.boundingBox())!.y).toBeLessThan(viewport.height)
    await foto(page, 'descoberta-painel')

    // Experimentar voz: fala uma frase de exemplo com a voz escolhida, sem iniciar a narração do livro.
    await sel.selectOption('Teste C')
    await page.getByTestId('elenco-testar-0').click()
    await expect.poll(async () => (await faladas(page)).at(-1)?.texto ?? '').toContain('Ana')
    const amostra = (await faladas(page)).at(-1)!
    expect(amostra.voz).toBe('Teste C')
    expect(amostra.texto).toMatch(/Hello, I am Ana/)
    await foto(page, 'descoberta-experimentar')

    // Fechar e reabrir o livro não mostra a dica de novo (lembrada no aparelho).
    await page.reload()
    await expect(page.locator('[data-testid=leitor][data-estado=pronto]')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('dica-elenco')).toHaveCount(0)
    await expect(botao).toBeVisible()
  })

  test('descoberta: dispensar a dica a esconde e o botão continua', async ({ page }) => {
    test.slow()
    await preparar(page, { avatar_elenco: true })
    await page.getByTestId('dica-elenco').getByRole('button', { name: 'Dispensar a dica' }).click()
    await expect(page.getByTestId('dica-elenco')).toHaveCount(0)
    await expect(page.getByTestId('leitor-elenco')).toBeVisible()
    await expect(page.getByTestId('painel-elenco')).toHaveCount(0)
  })

  test('descoberta: sem a flag não há botão nem dica', async ({ page }) => {
    test.slow()
    await preparar(page, {})
    await expect(page.getByTestId('leitor-elenco')).toHaveCount(0)
    await expect(page.getByTestId('dica-elenco')).toHaveCount(0)
  })

  test('descoberta: livro sem personagens não tem botão e o painel diz que só há o narrador', async ({ page }) => {
    test.slow()
    await preparar(page, { avatar_elenco: true }, { semFicha: true })
    await expect(page.getByTestId('leitor-elenco')).toHaveCount(0)
    await expect(page.getByTestId('dica-elenco')).toHaveCount(0)
    await page.getByTestId('leitor-ouvir').click()
    await page.getByRole('button', { name: /Voz e modo/ }).click()
    await expect(page.getByTestId('elenco-so-narrador')).toContainText('Só há o narrador')
    await page.getByTestId('elenco-so-narrador').scrollIntoViewIfNeeded()
    await foto(page, 'descoberta-so-narrador')
  })
})
