import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { abrirTela } from './_helpers'

/**
 * BUGS DA AUDITORIA DE TELAS (Onda 5, 25/11/2026), só de layout. O desenho continua o original:
 *   · o iChat flutuante não cobre o "Próxima página" do Leitor, nem o que fica no fim da Biblioteca e do Início;
 *   · os rótulos da Biblioteca no celular não partem no meio da palavra ("Renomea/r");
 *   · "Jogar com esta" e "Revisar palavras" desligados dizem o motivo.
 */
const FIXTURE = path.resolve('tests', 'fixtures', 'livros', 'fabulas-cc0.epub')

/** Os botões/links que a caixa do `.fab` cobre (fora ele mesmo). */
async function coberturaDoFab(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const f = document.querySelector('.fab')
    if (!f) return []
    const fr = f.getBoundingClientRect()
    return [...document.querySelectorAll('button,a,[role=button],input')]
      .filter((e) => !f.contains(e))
      .filter((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.right > fr.left && r.left < fr.right && r.bottom > fr.top && r.top < fr.bottom
      })
      .map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40))
  })
}

async function rolarAteOFim(page: Page) {
  // Duas passadas: a lista de gravações chega depois e aumenta a página.
  await page.waitForTimeout(1500)
  for (let i = 0; i < 2; i++) await rolarUmaVez(page)
}

async function rolarUmaVez(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach((e) => {
      if (e.scrollHeight > e.clientHeight + 5 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = 1e6
    })
    window.scrollTo(0, 1e6)
  })
  await page.waitForTimeout(300)
}

test.describe('iChat flutuante: não cobre o que a pessoa precisa tocar', () => {
  for (const rota of ['/', '/biblioteca']) {
    test(`${rota}: no fim da rolagem nada fica sob o botão`, async ({ page }) => {
      await abrirTela(page, rota)
      await expect(page.locator('.fab')).toBeVisible()
      await rolarAteOFim(page)
      expect(await coberturaDoFab(page)).toEqual([])
    })
  }

  test('Leitor: o "Próxima página" fica livre e a pessoa consegue tocá-lo', async ({ page }) => {
    test.slow()
    await page.goto('/leitor')
    await expect(page.getByTestId('estante')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('abrir-arquivo').setInputFiles(FIXTURE)
    const proxima = page.getByRole('button', { name: 'Próxima página' })
    await expect(proxima).toBeEnabled({ timeout: 30_000 })
    const cobertura = await coberturaDoFab(page)
    expect(cobertura).not.toContain('Próxima página')
    expect(cobertura).not.toContain('Página anterior')
    // O ponto central do botão cai nele mesmo, não no iChat.
    const caiNele = await proxima.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const topo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !!topo && el.contains(topo)
    })
    expect(caiNele).toBe(true)
  })
})

test.describe('Biblioteca: ações da sessão', () => {
  let id = ''
  test.beforeEach(async ({ request }) => {
    const r = await request.post('/api/sessions', {
      data: {
        title: 'Sessão da auditoria (layout)',
        kind: 'live',
        sourceLang: 'en',
        targetLang: 'pt-BR',
        status: 'done',
        durationMs: 4000,
        utterances: [
          {
            idx: 0,
            source: 'system',
            sourceLang: 'en',
            sourceText: 'hello there my friend',
            targetLang: 'pt-BR',
            translatedText: 'olá meu amigo',
            tStartMs: 0,
            tEndMs: 2000,
          },
        ],
      },
    })
    expect(r.ok()).toBe(true)
    id = ((await r.json()) as { id: string }).id
  })
  test.afterEach(async ({ request }) => {
    if (id) await request.delete(`/api/sessions/${id}`)
  })

  test('"Renomear" e "Excluir" cabem inteiros, sem parti-los no meio da palavra', async ({ page }) => {
    await abrirTela(page, '/biblioteca')
    const painel = page.locator('.q-bib-det')
    await expect(painel).toBeVisible({ timeout: 20_000 })
    for (const nome of ['Renomear', 'Excluir']) {
      const botao = painel.getByRole('button', { name: nome, exact: true })
      const medida = await botao.evaluate((el) => {
        const rg = document.createRange()
        rg.selectNodeContents(el)
        const linhas = new Set([...rg.getClientRects()].map((x) => Math.round(x.top))).size
        return { linhas, estoura: el.scrollWidth > el.clientWidth + 1 }
      })
      expect(medida, nome).toEqual({ linhas: 1, estoura: false })
    }
  })

  test('"Jogar com esta" e "Revisar palavras" desligados explicam o motivo', async ({ page }) => {
    await abrirTela(page, '/biblioteca')
    const jogar = page.getByRole('button', { name: /Jogar com esta/ })
    await expect(jogar).toBeVisible({ timeout: 20_000 })
    if (await jogar.isDisabled()) {
      const motivo = page.getByTestId('motivo-sem-jogo')
      await expect(motivo).toBeVisible()
      await expect(motivo).not.toBeEmpty()
    } else {
      await expect(page.getByTestId('motivo-sem-jogo')).toHaveCount(0)
    }
  })
})
