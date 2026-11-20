import { expect, test } from '@playwright/test'

import { violacoesGraves } from './_acessibilidade'
import { abrirTela, fecharSobreposicoes, trilho } from './_helpers'

/**
 * GEOMETRIA DO TRILHO (B4/B5, 23/10/2026). Em janelas baixas o "Buscar" e o "Mais", presos ao pé, cobriam
 * "Planos" e "Progresso"; em 1024×600 o "Planos" sumia. Aqui, em todos os tamanhos que o dono usa, nenhum
 * par de itens se sobrepõe, todo item é alcançável (à vista, ou por rolagem DENTRO do trilho) e os Ajustes
 * abrem com um clique e com Ctrl+, (⌘, no Mac).
 *
 * Os tamanhos são trocados dentro do teste: roda só no projeto de 1280, para não repetir três vezes.
 */
const TAMANHOS: Array<[number, number]> = [
  [1440, 900],
  [1280, 800],
  [1280, 720],
  [1024, 768],
  [1024, 600],
  [768, 1024],
  [375, 812],
]

/** As caixas VISÍVEIS (recortadas pela rolagem do trilho) de cada item, e se algo cobre o centro dele. */
async function medir(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav.q-trilho') as HTMLElement
    const itens = [...nav.querySelectorAll<HTMLElement>('.q-item')]
    const rolador = nav.querySelector<HTMLElement>('.q-trilho-topo')
    const corte = rolador?.getBoundingClientRect()
    return itens.map((el) => {
      const r = el.getBoundingClientRect()
      const dentroDoRolador = !!rolador && rolador.contains(el)
      const x = r.left
      const right = r.right
      let y = r.top
      let bottom = r.bottom
      if (dentroDoRolador && corte) {
        y = Math.max(y, corte.top)
        bottom = Math.min(bottom, corte.bottom)
      }
      const cx = (r.left + r.right) / 2
      const cy = (r.top + r.bottom) / 2
      const topo = document.elementFromPoint(cx, cy)
      return {
        nome: el.getAttribute('aria-label') ?? el.textContent ?? '?',
        x,
        y,
        w: Math.max(0, right - x),
        h: Math.max(0, bottom - y),
        cobertoPor: topo && !el.contains(topo) ? (topo.className?.toString() ?? topo.tagName) : null,
        completo: bottom - y >= r.height - 1,
      }
    })
  })
}

test.describe('trilho: geometria', () => {
  test.beforeEach(({ browserName: _ }, info) => {
    test.skip(info.project.name !== 'desktop-1280', 'troca o tamanho sozinho')
  })

  for (const [w, h] of TAMANHOS) {
    test(`${w}×${h}: sem sobreposição e tudo alcançável`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await abrirTela(page, '/')
      await fecharSobreposicoes(page)
      await expect(trilho(page)).toBeVisible()
      await page.waitForTimeout(400) // a medida do compacto assenta

      const itens = await medir(page)
      expect(itens.length).toBeGreaterThanOrEqual(5)

      // Nenhum par se sobrepõe (caixas visíveis, tolerância de 1 px).
      for (let i = 0; i < itens.length; i++) {
        for (let j = i + 1; j < itens.length; j++) {
          const a = itens[i]
          const b = itens[j]
          if (a.w === 0 || a.h === 0 || b.w === 0 || b.h === 0) continue
          const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
          const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
          expect(dx > 1 && dy > 1, `${a.nome} cobre ${b.nome} em ${w}×${h}`).toBe(false)
        }
      }

      // Todo item é alcançável: rolando o trilho ele fica inteiro à vista e nada o cobre.
      for (const [indice, { nome }] of itens.entries()) {
        await trilho(page).locator('.q-item').nth(indice).scrollIntoViewIfNeeded()
        const m = (await medir(page))[indice]
        expect(m, nome).toBeTruthy()
        expect(m!.completo, `${nome} cortado em ${w}×${h}`).toBe(true)
        expect(m!.cobertoPor, `${nome} coberto em ${w}×${h}`).toBeNull()
        expect(m!.h, `${nome} baixo demais`).toBeGreaterThanOrEqual(44)
      }
    })
  }

  for (const [w, h] of [
    [1280, 800],
    [1024, 600],
  ] as Array<[number, number]>) {
    test(`${w}×${h}: Ajustes abre com 1 clique e com Ctrl+,`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await abrirTela(page, '/')
      await fecharSobreposicoes(page)
      const ajustes = trilho(page).getByRole('button', { name: /^Ajustes/ })
      await ajustes.scrollIntoViewIfNeeded()
      await ajustes.click()
      await expect(page).toHaveURL(/\/ajustes/, { timeout: 10_000 })

      await abrirTela(page, '/')
      await fecharSobreposicoes(page)
      await page.keyboard.press('Control+,')
      await expect(page).toHaveURL(/\/ajustes/, { timeout: 10_000 })
    })
  }

  test('1280×800 compacto: todo item tem nome, a dica aparece no foco do teclado, o marcado tem barra', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await abrirTela(page, '/')
    await fecharSobreposicoes(page)
    await page.waitForTimeout(400)
    await expect(trilho(page)).toHaveAttribute('data-compacto', 'true')

    const semNome = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('nav.q-trilho .q-item')]
        .filter((el) => !(el.getAttribute('aria-label') || '').trim())
        .map((el) => el.className),
    )
    expect(semNome, 'itens sem nome acessível').toEqual([])

    // A dica aparece no foco pelo teclado (não só no mouse), com o nome do item.
    await page.keyboard.press('Shift')
    const mais = trilho(page).getByRole('button', { name: 'Mais' })
    await mais.focus()
    await expect(page.locator('.q-dica')).toHaveText('Mais', { timeout: 3000 })
    await page.keyboard.press('Escape')
    await expect(page.locator('.q-dica')).toHaveCount(0)
    const planos = trilho(page).locator('.q-item[data-px-rota="planos"]')
    await page.keyboard.press('Shift')
    await planos.focus()
    await expect(page.locator('.q-dica')).toContainText('Planos', { timeout: 3000 })

    // O item marcado tem a barra ao lado (não depende da cor).
    const larguraDaBarra = await page.evaluate(() => {
      const ativo = document.querySelector('nav.q-trilho .q-item[aria-current="page"]')
      return ativo ? getComputedStyle(ativo, '::before').width : null
    })
    expect(larguraDaBarra).toBe('4px')

    expect(await violacoesGraves(page)).toEqual([])
  })

  /* A JANELA PRECISA ROLAR O GRUPO MAIS QUE UM ITEM. Com oito destinos, 1024×600 rolava 58 px e o Início
     saía da área visível; com o "Ao vivo" juntando Capturar e Intérprete (25/10/2026) são sete, e em
     1024×600 o grupo rola só 6 px (o respiro): nenhum item consegue sair, e não há o que conferir ali.
     1024×520 rola 86 px, a mesma situação que o teste foi escrito para pegar. */
  test('1024×520: a pílula do item ativo some quando ele é rolado para fora do grupo e volta ao rolar de volta', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 520 })
    await abrirTela(page, '/')
    await fecharSobreposicoes(page)
    await page.waitForTimeout(400)
    const estado = () =>
      page.evaluate(() => {
        const nav = document.querySelector('nav.q-trilho') as HTMLElement
        const topo = nav.querySelector<HTMLElement>('.q-trilho-topo')
        const pilula = nav.querySelector<HTMLElement>(':scope > .px-pilula')
        const ativo = nav.querySelector<HTMLElement>('.q-item[aria-current="page"]')
        if (!topo || !pilula || !ativo || !topo.contains(ativo)) return null
        const a = ativo.getBoundingClientRect()
        const t = topo.getBoundingClientRect()
        return {
          /* Rola o bastante para o item ativo sair inteiro da área visível. */
          rola: topo.scrollHeight - topo.clientHeight > a.bottom - t.top,
          dentro: a.top >= t.top - 0.5 && a.bottom <= t.bottom + 0.5,
          opacidade: getComputedStyle(pilula).opacity,
        }
      })
    const antes = await estado()
    test.skip(!antes, 'sem pílula (animações desligadas)')
    expect(antes!.rola, 'neste tamanho o grupo rola o bastante para o item ativo sair').toBe(true)
    expect(antes!.opacidade).toBe('1')
    await page.evaluate(() => {
      const topo = document.querySelector('nav.q-trilho .q-trilho-topo') as HTMLElement
      topo.scrollTop = topo.scrollHeight
    })
    await expect.poll(async () => (await estado())?.dentro).toBe(false)
    await expect.poll(async () => (await estado())?.opacidade).toBe('0')
    await page.evaluate(() => {
      const topo = document.querySelector('nav.q-trilho .q-trilho-topo') as HTMLElement
      topo.scrollTop = 0
    })
    await expect.poll(async () => (await estado())?.opacidade).toBe('1')
  })

  test('Ctrl+, é ignorado enquanto se digita num campo', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await abrirTela(page, '/')
    await fecharSobreposicoes(page)
    await page.evaluate(() => {
      const campo = document.createElement('input')
      campo.id = 'campo-de-teste'
      document.body.appendChild(campo)
      campo.focus()
    })
    await page.keyboard.press('Control+,')
    await page.waitForTimeout(500)
    await expect(page).not.toHaveURL(/\/ajustes/)
  })

  test('375×812: a barra de cinco continua sem Ajustes e sem sobreposição', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await abrirTela(page, '/')
    await fecharSobreposicoes(page)
    await expect(trilho(page).getByRole('button', { name: /^Ajustes/ })).toHaveCount(0)
  })
})
