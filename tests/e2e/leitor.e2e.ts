import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, type Frame, type Page, test } from '@playwright/test'

import { violacoesGraves } from './_acessibilidade'
import { clicarRobusto, fecharSobreposicoes, verSemSobreposicao } from './_helpers'

/**
 * O LEITOR (L2 de Livros & Leitura), de ponta a ponta, com o EPUB de domínio público dos testes
 * (`tests/fixtures/livros/fabulas-cc0.epub`, CC0):
 *
 *   abrir o arquivo do aparelho → paginar → trocar tema e fonte → tocar numa palavra (abre a folha da
 *   palavra) → grifar e anotar → recarregar e continuar no MESMO CFI, com os grifos de volta → exportar
 *   Markdown com os dois.
 *
 * O texto de cada capítulo mora num iframe `blob:` dentro de um shadow root FECHADO do foliate-js: o teste
 * chega nele pela lista de frames do Playwright (que enxerga o iframe) e não por seletor da página.
 */

const FIXTURE = path.resolve('tests', 'fixtures', 'livros', 'fabulas-cc0.epub')

/** O id que o leitor dá ao arquivo: `arq:` + 32 hex do SHA-256 (`src/lib/livros/abrir.ts`). */
const LIVRO_ID = `arq:${createHash('sha256').update(readFileSync(FIXTURE)).digest('hex').slice(0, 32)}`

/**
 * As anotações deste livro no servidor saem antes do teste: o banco do e2e é o mesmo para os três projetos
 * (viewports) e para as rodadas anteriores, e a contagem do teste é a desta rodada.
 */
async function apagarAnotacoesDoServidor(page: Page) {
  const r = await page.request.get(`/api/leitura/anotacoes?livroId=${encodeURIComponent(LIVRO_ID)}`)
  expect(r.ok()).toBe(true)
  for (const a of ((await r.json()) as { anotacoes: Array<{ id: string; apagadoEm: number | null }> }).anotacoes) {
    if (a.apagadoEm == null) await page.request.delete(`/api/leitura/anotacoes/${a.id}`)
  }
}

const leitorPronto = (page: Page) => page.locator('[data-testid=leitor][data-estado=pronto]')

/** O documento do capítulo que tem `texto` (o iframe do foliate-js). */
async function quadroCom(page: Page, texto: string): Promise<Frame> {
  let achado: Frame | undefined
  await expect(async () => {
    for (const f of page.frames()) {
      if (!f.url().startsWith('blob:')) continue
      if (
        await f
          .getByText(texto, { exact: false })
          .count()
          .catch(() => 0)
      ) {
        achado = f
        return
      }
    }
    throw new Error(`nenhum capítulo com "${texto}" ainda`)
  }).toPass({ timeout: 15_000 })
  return achado!
}

/** Seleciona o parágrafo que contém `texto` no documento do livro (como o arrastar do dedo). */
async function selecionarParagrafo(f: Frame, texto: string) {
  await f.evaluate((t) => {
    const p = [...document.querySelectorAll('p')].find((x) => x.textContent?.includes(t))
    if (!p) throw new Error(`sem parágrafo com "${t}"`)
    const r = document.createRange()
    r.selectNodeContents(p)
    const s = getSelection()!
    s.removeAllRanges()
    s.addRange(r)
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  }, texto)
}

const posicaoGuardada = (page: Page, livroId: string) =>
  page.evaluate((id) => JSON.parse(localStorage.getItem(`leitor:posicao:${id}`) ?? 'null'), livroId)

test.describe('Leitor', () => {
  test('abre o EPUB, pagina, muda tema e fonte, toca na palavra, grifa e anota, volta ao mesmo CFI e exporta', async ({
    page,
  }) => {
    test.slow()
    await apagarAnotacoesDoServidor(page)
    await page.goto('/leitor')
    await expect(page.getByTestId('estante')).toBeVisible({ timeout: 30_000 })
    /* Perfil de leitura do zero (outro projeto pode ter deixado tema/fonte). */
    await page.evaluate(() => localStorage.removeItem('leitor:perfil'))
    await page.getByTestId('abrir-arquivo').setInputFiles(FIXTURE)
    await expect(page).toHaveURL(/\/leitor\/arq%3A[0-9a-f]{32}$/)
    const livroId = decodeURIComponent(page.url().split('/leitor/')[1])
    expect(livroId).toBe(LIVRO_ID)
    await expect(leitorPronto(page)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('heading', { level: 1, name: "Aesop's Fables (tiny edition)" })).toBeVisible()
    /* Uma conquista de outra suíte pode abrir por cima (o banco do e2e é compartilhado): fecha antes de tocar. */
    await fecharSobreposicoes(page)

    // ── acessibilidade (ACE07): nada sério nem crítico no axe, no leitor e com os painéis abertos ──
    expect(await violacoesGraves(page, ['[data-testid=leitor]'])).toEqual([])

    // ── paginar (teclado e botão) ──
    const progresso = page.getByTestId('leitor-progresso')
    await quadroCom(page, 'hungry fox')
    const antes = await progresso.textContent()
    await page.getByRole('button', { name: 'Próxima página' }).click()
    await expect(progresso).not.toHaveText(antes ?? '', { timeout: 10_000 })
    await page.getByRole('button', { name: 'Página anterior' }).click()
    await expect(progresso).toHaveText(antes ?? '', { timeout: 10_000 })
    // O teclado também vira (ACE07): → e ←.
    await page.getByRole('button', { name: 'Próxima página' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(progresso).not.toHaveText(antes ?? '', { timeout: 10_000 })
    await page.keyboard.press('ArrowLeft')
    await expect(progresso).toHaveText(antes ?? '', { timeout: 10_000 })

    // ── tema e fonte (o perfil vale para todo livro) ──
    await page.getByRole('button', { name: /Aparência/ }).click()
    const tipografia = page.getByTestId('painel-tipografia')
    await expect(tipografia).toBeVisible()
    await tipografia.getByRole('radio', { name: 'Escuro', exact: true }).check({ force: true })
    await expect(page.getByTestId('leitor')).toHaveAttribute('data-tema', 'escuro')
    await tipografia.getByRole('radio', { name: /Atkinson/ }).check({ force: true })
    const fox = await quadroCom(page, 'hungry fox')
    await expect
      .poll(() => fox.evaluate(() => getComputedStyle(document.body).fontFamily), { timeout: 10_000 })
      .toContain('Atkinson Hyperlegible')
    await expect
      .poll(() => fox.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
      .toBe('rgb(28, 28, 30)')
    expect(await violacoesGraves(page, ['[data-testid=leitor]'])).toEqual([])
    const perfil = await page.evaluate(() => JSON.parse(localStorage.getItem('leitor:perfil') ?? '{}'))
    expect(perfil).toMatchObject({ tema: 'escuro', fonte: 'atkinson' })
    await page.getByRole('button', { name: 'Fechar o painel' }).click()

    // ── tocar numa palavra abre a folha da palavra ──
    await fox
      .getByText('orchard', { exact: false })
      .first()
      .click({ position: { x: 4, y: 6 } })
    const folha = page.getByTestId('folha-da-palavra')
    await expect(folha).toBeVisible({ timeout: 15_000 })
    await page.keyboard.press('Escape')
    await expect(folha).toBeHidden()

    // ── grifar um trecho e anotar outro ──
    await selecionarParagrafo(fox, 'nose in the air')
    const barra = page.getByTestId('barra-da-selecao')
    await expect(barra).toBeVisible()
    await barra.getByRole('button', { name: 'Grifar em amarelo' }).click()
    await expect(barra).toBeHidden()
    await selecionarParagrafo(fox, 'grapes are sour')
    await barra.getByRole('button', { name: 'Nota' }).click()
    await barra.getByLabel('Sua nota sobre o trecho').fill('Fábula da raposa: desdenhar do que não se alcança.')
    await barra.getByRole('button', { name: 'Salvar nota' }).click()
    await expect(page.getByRole('button', { name: /Anotações\s*2/ })).toBeVisible()

    // Uma página adiante, para a posição não ser o começo do livro.
    await page.getByRole('button', { name: 'Próxima página' }).click()
    await expect(progresso).not.toHaveText(antes ?? '', { timeout: 10_000 })
    await expect.poll(async () => (await posicaoGuardada(page, livroId))?.cfi ?? '').toMatch(/^epubcfi\(/)
    const guardada = await posicaoGuardada(page, livroId)
    const ondeEstava = await progresso.textContent()

    // ── recarregar: continua no MESMO CFI, com o tema e as anotações ──
    await page.reload()
    await expect(leitorPronto(page)).toBeVisible({ timeout: 30_000 })
    await fecharSobreposicoes(page)
    await expect(progresso).toHaveText(ondeEstava ?? '', { timeout: 10_000 })
    expect((await posicaoGuardada(page, livroId)).cfi).toBe(guardada.cfi)
    await expect(page.getByTestId('leitor')).toHaveAttribute('data-tema', 'escuro')
    await page.getByRole('button', { name: /Anotações/ }).click()
    const painel = page.getByTestId('painel-anotacoes')
    await expect(painel.getByText('nose in the air', { exact: false })).toBeVisible()
    expect(await violacoesGraves(page, ['[data-testid=leitor]'])).toEqual([])
    await expect(painel.getByText('desdenhar do que não se alcança', { exact: false })).toBeVisible()

    // ── exportar Markdown ──
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      painel.getByRole('button', { name: 'Markdown' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.md$/)
    const md = readFileSync((await download.path())!, 'utf8')
    expect(md).toContain("# Aesop's Fables (tiny edition)")
    expect(md).toContain('> He tried many times until his legs were tired.')
    expect(md).toContain('**Nota:** Fábula da raposa: desdenhar do que não se alcança.')
    expect(md).toMatch(/\[abrir no Frasy\]\(frasy:\/\/livro\/arq%3A[0-9a-f]{32}#epubcfi/)

    // ── sumário e busca no livro (LEI03) ──
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /Sumário/ }).click()
    await expect(
      page.getByRole('navigation', { name: 'Sumário' }).getByRole('button', { name: 'Part Two' }),
    ).toBeVisible()
    await page.getByRole('searchbox', { name: 'Buscar no livro' }).fill('grasshopper')
    await page.getByRole('button', { name: 'Buscar', exact: true }).click()
    await expect(page.getByText(/^\d+ resultados$/)).toBeVisible({ timeout: 15_000 })
    await page.locator('.leitor-resultados .leitor-item').first().click()
    await expect(progresso).toContainText('Part Two', { timeout: 10_000 })

    // Deixa o perfil como estava para os outros projetos.
    await page.evaluate(() => localStorage.removeItem('leitor:perfil'))
  })
})

test.describe('Leitor — PDF', () => {
  /* `fabula-cc0.pdf`: uma página escrita à mão para o teste (CC0), com texto selecionável. */
  test('o PDF abre com a página desenhada e a camada de texto, sem o aviso de escaneado', async ({ page }) => {
    test.slow()
    await page.goto('/leitor')
    await expect(page.getByTestId('estante')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('abrir-arquivo').setInputFiles(path.resolve('tests', 'fixtures', 'livros', 'fabula-cc0.pdf'))
    await expect(leitorPronto(page)).toBeVisible({ timeout: 30_000 })
    await fecharSobreposicoes(page)
    const pagina = await quadroCom(page, 'The fox looked at the grapes.')
    /* Sem `allow-scripts` o `<canvas>` não desenharia: a página é uma imagem, e ela tem de ter pixels. */
    await expect
      .poll(() => pagina.evaluate(() => document.querySelector<HTMLImageElement>('#canvas img')?.naturalWidth ?? 0))
      .toBeGreaterThan(100)
    await expect(page.getByRole('note')).toHaveCount(0)
  })
})

test.describe('Leitor — a Leitura de sempre', () => {
  test('uma sessão de documento abre no leitor pelo "Abrir no leitor", e a Leitura antiga continua lá', async ({
    page,
  }) => {
    test.slow()
    const r = await page.request.post('/api/sessions', {
      data: {
        title: 'Documento para o leitor',
        kind: 'document',
        sourceLang: 'en',
        targetLang: 'pt',
        status: 'done',
        utterances: [
          {
            idx: 0,
            sourceText: 'The north wind and the sun argued about who was stronger.',
            sourceLang: 'en',
            targetLang: 'pt',
          },
          {
            idx: 1,
            sourceText: 'A traveller walked along the road in a warm coat.',
            sourceLang: 'en',
            targetLang: 'pt',
          },
        ],
      },
    })
    expect(r.ok()).toBe(true)
    const { id } = (await r.json()) as { id: string }
    await page.goto(`/sessao/${id}/leitura`)
    await fecharSobreposicoes(page)
    const abrir = page.getByTestId('abrir-no-leitor')
    await verSemSobreposicao(page, abrir, 30_000)
    await clicarRobusto(page, abrir)
    await expect(page).toHaveURL(new RegExp(`/leitor/sessao%3A${id}$`))
    await expect(leitorPronto(page)).toBeVisible({ timeout: 30_000 })
    await quadroCom(page, 'A traveller walked along the road')
    await expect(page.getByRole('heading', { level: 1, name: 'Documento para o leitor' })).toBeVisible()
    // A Leitura de sempre não saiu do lugar.
    await page.goBack()
    await expect(page.getByTestId('abrir-no-leitor')).toBeVisible({ timeout: 30_000 })
    await page.request.delete(`/api/sessions/${id}`)
  })
})
