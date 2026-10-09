import { expect, type Locator, type Page, test } from '@playwright/test'

import { semearCartoes } from './_fixtures'
import { abrirSeletor, clicarRobusto, irParaPraticar, lobby } from './_helpers'

/**
 * A trilha carrega sob demanda. O modo de falha dessa mudança é SILENCIOSO: a contagem pisca zero,
 * ou um jogo anuncia "sem material" durante o carregamento — mensagem falsa, não só feia. Este teste
 * existe para que isso não passe despercebido.
 *
 * NO DESENHO NOVO (09/10/2026) a fonte troca-se no painel "O que você vai praticar" (chip "Trocar: …"):
 * a faceta "De onde vêm" traz a pílula "Trilha" com a contagem, o pé do painel diz "N no recorte" e o
 * cabeçalho do lobby diz "N palavras prontas" (ou "Nenhuma palavra pronta").
 *
 * As palavras da fixture garantem que há MAIS de uma fonte (as do caderno e a trilha): com uma só, o
 * chip da fonte nem é oferecido.
 */

test.beforeAll(async () => {
  await semearCartoes()
})

/**
 * O app é self-host de usuário único: o idioma praticado é preferência de PERFIL, gravada no
 * servidor, então a sessão anterior decide onde este teste começa. Num idioma sem trilha o curso nem
 * é oferecido, e o teste falharia dizendo que a trilha quebrou. Ele garante o próprio ponto de partida.
 */
async function garantirIdiomaComTrilha(page: Page, painel: Locator): Promise<void> {
  // A faceta é exclusiva, então é um `radiogroup`, não um `group`.
  const ingles = painel.getByRole('radiogroup', { name: 'Idioma' }).getByRole('radio', { name: /inglês/ })
  if ((await ingles.count()) && (await ingles.first().getAttribute('aria-checked')) !== 'true') {
    await clicarRobusto(page, ingles.first())
    await page.waitForTimeout(600)
  }
}

/** A pílula da trilha na faceta "De onde vêm" ("Curso de palavras" no perfil sênior). */
const pilulaDaTrilha = (painel: Locator) =>
  painel.getByRole('group', { name: 'De onde vêm' }).getByRole('button', { name: /Curso de palavras|Trilha/ })

test.describe('Trilha carregada sob demanda', () => {
  test('a contagem do curso nunca passa por zero ao escolher a fonte', async ({ page }) => {
    test.slow()
    await irParaPraticar(page)
    const painel = await abrirSeletor(page)
    await garantirIdiomaComTrilha(page, painel)

    const curso = pilulaDaTrilha(painel)
    await expect(curso).toBeVisible({ timeout: 15_000 })

    // A contagem já tem de estar certa ANTES de clicar: ela vem do índice, não do dado.
    const antes = ((await curso.textContent()) ?? '').replace(/\D/g, '')
    expect(Number(antes), 'o curso deve anunciar o tamanho antes de a trilha carregar').toBeGreaterThan(0)

    /* Amostra as duas contagens enquanto a fonte troca: o "N no recorte" do pé do painel e o
       "N palavras prontas" do lobby. Se em algum quadro uma disser zero, o carregamento está vazando
       para a tela. */
    const zerou: string[] = []
    const amostrar = setInterval(async () => {
      const recorte = await painel
        .locator('.qj-total b')
        .innerText()
        .catch(() => '')
      if (recorte && Number(recorte.replace(/\D/g, '')) === 0) zerou.push(`${recorte} no recorte`)
      const prontas = await lobby(page)
        .locator('.q-cab .q-sobre')
        .innerText()
        .catch(() => '')
      if (/^(0|Nenhuma) /i.test(prontas.trim())) zerou.push(prontas.trim())
    }, 120)

    if ((await curso.getAttribute('aria-pressed')) !== 'true') await clicarRobusto(page, curso)
    await expect(curso).toHaveAttribute('aria-pressed', 'true')
    await page.waitForTimeout(2500)
    clearInterval(amostrar)

    expect(zerou, 'a contagem passou por zero durante o carregamento').toHaveLength(0)
    // E, carregada, a contagem do recorte é pelo menos a da trilha.
    const depois = Number((await painel.locator('.qj-total b').innerText()).replace(/\D/g, ''))
    expect(depois).toBeGreaterThanOrEqual(Number(antes))
  })

  test('nenhum jogo anuncia "sem material" enquanto a trilha carrega', async ({ page }) => {
    test.slow()
    await irParaPraticar(page)
    const painel = await abrirSeletor(page)
    await garantirIdiomaComTrilha(page, painel)

    const curso = pilulaDaTrilha(painel)
    if ((await curso.getAttribute('aria-pressed')) !== 'true') await clicarRobusto(page, curso)
    await expect(curso).toHaveAttribute('aria-pressed', 'true')

    // Logo depois do clique é a janela em que o dado ainda não chegou.
    await page.waitForTimeout(200)
    const durante = await page.locator('body').innerText()
    expect(durante).not.toContain('nenhuma palavra deste recorte serve')
    expect(durante).not.toContain('Nenhum jogo abre só com este material ainda')
    expect(durante).not.toContain('Nenhuma palavra pronta')

    await page.waitForTimeout(2500)
    await clicarRobusto(page, painel.getByRole('button', { name: 'Pronto' }))
    const grade = page.locator('#grade-de-jogos')
    await expect(grade).toBeVisible()
    await expect(grade.locator('.q-tile[data-jogo="memory"]')).toBeEnabled()
    await expect(lobby(page).locator('.q-cab .q-sobre')).toHaveText(/^[\d.]+ palavras prontas$/)
  })
})
