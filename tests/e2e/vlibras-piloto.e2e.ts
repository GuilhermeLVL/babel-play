import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { abrirTela, assentar } from './_helpers'
import { comFlags, falsos, porToque, pronta, semModelos, semPreferenciasDeAvatar } from './_interprete'
import { preparar as prepararLivro } from './_livro'

/**
 * O PILOTO VLIBRAS (flag `libras_vlibras`, só adultos com aceite), no app de verdade, com o script do governo SIMULADO
 * (`page.route`: nenhuma requisição vai à rede real). Provado, nos três tamanhos: sem a flag nada aparece; com a flag e
 * adulto o botão "Sinais de apoio (VLibras)" (ícone + rótulo, alvo de 44 px) abre a tela de consentimento; "Agora não"
 * não carrega nada; "Aceitar e ativar" cria a PONTE (iframe `sandbox="allow-scripts"`, sem `allow-same-origin`), que pede
 * o script (simulado) e mostra a origem e o aviso fixo; o trecho selecionado vai à ponte; menor (perfil protegido) nunca
 * vê o botão nem faz requisição ao VLibras; revogar fecha a ponte.
 * NÃO provado: o widget real, a rede real, o avatar Unity, Safari/Firefox, celular real (ver `docs/runbooks/avatar.md`).
 * O servidor de teste precisa de `VLIBRAS_ATIVO=1` (o isolamento vira `dip`); aqui a CSP da ponte vai em modo relato.
 * Capturas: `$AVATAR_CAPTURAS` (padrão `tests/e2e/__capturas__/`, fora do git).
 */
const CAPTURAS = process.env.AVATAR_CAPTURAS || path.join(process.cwd(), 'tests', 'e2e', '__capturas__')
mkdirSync(CAPTURAS, { recursive: true })

test.use({ permissions: ['microphone'] })

const foto = (page: Page, nome: string) =>
  page.screenshot({ path: path.join(CAPTURAS, `vlibras-${test.info().project.name}-${nome}.png`) })

/** O script do VLibras de mentira: define o widget e escreve na ponte o que ele "recebeu", sem tocar na rede. */
const SCRIPT_SIMULADO = `
window.VLibras = { Widget: function (o) { window.__rootPath = o.rootPath } }
window.VLibrasWidget = { open: function () {
  var d = document.createElement('div'); d.id = 'vlibras-simulado'; d.textContent = 'VLibras simulado'; document.body.appendChild(d)
} }
document.addEventListener('click', function (e) {
  var el = e.target; if (el && el.id === 'texto') { el.classList.add('vlibras--active'); el.setAttribute('data-traduzido', el.textContent) }
}, true)
`

/** Rastreia o que sai para o VLibras e simula o script. */
async function simularVLibras(page: Page) {
  const pedidos: string[] = []
  await page.route(/^https:\/\/(vlibras\.gov\.br|[a-z0-9-]+\.vlibras\.gov\.br)\//, (r) => {
    const u = r.request().url()
    pedidos.push(u)
    if (u === 'https://vlibras.gov.br/app/vlibras-plugin.js')
      return r.fulfill({ status: 200, contentType: 'text/javascript', body: SCRIPT_SIMULADO })
    return r.abort()
  })
  return pedidos
}

async function preparar(page: Page, flags: Record<string, boolean>, { menor = false } = {}) {
  await semPreferenciasDeAvatar(page)
  await falsos(page)
  await porToque(page)
  await comFlags(page, flags)
  await page.addInitScript((protegido) => {
    try {
      if (sessionStorage.getItem('__vlb')) return
      sessionStorage.setItem('__vlb', '1')
      localStorage.removeItem('frasy.vlibras.consentimento')
      if (protegido) sessionStorage.setItem('frasy.avatar.protegido', '1')
    } catch {
      /* sem armazenamento */
    }
  }, menor)
  return simularVLibras(page)
}

async function aoInterprete(page: Page) {
  await semModelos(page)
  await page.goto('/')
  await expect(page.getByRole('main')).toBeVisible()
  await assentar(page)
  await page
    .getByRole('button', { name: /^Conversar/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/interprete$/, { timeout: 10_000 })
  await expect(pronta(page)).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(700)
}

const botao = (page: Page, onde: string) => page.getByTestId(`sinais-de-apoio-${onde}`)
const ponteDoVLibras = (page: Page) => page.getByTestId('vlibras-ponte').locator('iframe')

test.describe('Piloto VLibras (só adultos, com aceite, serviço externo)', () => {
  test('sem a flag nada aparece: nem botão, nem iframe, nem pedido ao VLibras', async ({ page }) => {
    const pedidos = await preparar(page, {})
    await aoInterprete(page)
    await expect(botao(page, 'interprete')).toHaveCount(0)
    await expect(page.getByTestId('vlibras-consentimento')).toHaveCount(0)
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(pedidos).toEqual([])
    await foto(page, '0-sem-flag')
  })

  test('menor (perfil protegido): com a flag ligada o botão não existe e nada vai ao VLibras', async ({ page }) => {
    const pedidos = await preparar(page, { libras_vlibras: true }, { menor: true })
    await aoInterprete(page)
    await expect(botao(page, 'interprete')).toHaveCount(0)
    await page.waitForTimeout(500)
    expect(pedidos).toEqual([])
    await foto(page, '0b-menor')
  })

  test('adulto: botão com 44 px, consentimento, "Agora não" não carrega, "Aceitar" cria a ponte isolada e mostra o aviso', async ({
    page,
  }) => {
    test.slow()
    const pedidos = await preparar(page, { libras_vlibras: true })
    await aoInterprete(page)

    const b = botao(page, 'interprete')
    await expect(b).toBeVisible()
    await expect(b).toContainText('Sinais de apoio (VLibras)')
    const caixa = (await b.boundingBox())!
    expect(caixa.height).toBeGreaterThanOrEqual(44)
    expect(caixa.width).toBeGreaterThanOrEqual(44)
    await foto(page, '1-botao')

    // O consentimento: o que é, para onde vai o texto, o analytics, o limite.
    await b.click()
    const tela = page.getByTestId('vlibras-consentimento')
    await expect(tela).toBeVisible()
    await expect(tela).toContainText('serviço EXTERNO do governo federal')
    await expect(tela).toContainText('endereço de internet')
    await expect(tela).toContainText('analytics')
    await expect(tela).toContainText('maiores de 18 anos')
    await expect(page.getByTestId('vlibras-aviso-na-tela')).toHaveText(
      'Sinais de apoio via VLibras (serviço do governo federal). Não substitui intérprete de Libras.',
    )
    expect(pedidos).toEqual([])
    await foto(page, '2-consentimento')

    // "Agora não": nada carrega, nada fica guardado.
    await page.getByTestId('vlibras-agora-nao').click()
    await expect(tela).toHaveCount(0)
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(pedidos).toEqual([])
    expect(await page.evaluate(() => localStorage.getItem('frasy.vlibras.consentimento'))).toBeNull()

    // "Aceitar e ativar": a ponte nasce isolada, pede o script (simulado) e mostra origem e aviso.
    await b.click()
    await page.getByTestId('vlibras-aceitar').click()
    const f = ponteDoVLibras(page)
    await expect(f).toHaveCount(1)
    await expect(f).toHaveAttribute('sandbox', 'allow-scripts')
    expect(await f.getAttribute('sandbox')).not.toContain('allow-same-origin')
    await expect(page.getByTestId('vlibras-origem')).toHaveText('VLibras · governo federal')
    await expect(page.getByTestId('vlibras-aviso-fixo')).toHaveText(
      'Sinais de apoio via VLibras (serviço do governo federal). Não substitui intérprete de Libras.',
    )
    const dentro = page.frameLocator('[data-testid=vlibras-ponte] iframe')
    await expect(dentro.locator('#vlibras-simulado')).toHaveText('VLibras simulado', { timeout: 15_000 })
    expect(pedidos).toContain('https://vlibras.gov.br/app/vlibras-plugin.js')
    // Nenhum script do governo no documento do app, e o aceite ficou guardado.
    await expect(page.locator('script[src*="vlibras.gov.br"]')).toHaveCount(0)
    expect(await page.evaluate(() => !!localStorage.getItem('frasy.vlibras.consentimento'))).toBe(true)
    await foto(page, '3-painel')

    // O trecho selecionado vai à ponte e o widget (simulado) o recebe.
    await page.evaluate(() => {
      const p = document.createElement('p')
      p.id = 'trecho-de-teste'
      p.textContent = 'Bom dia, tudo bem?'
      p.style.cssText = 'position:fixed;left:8px;top:8px;background:#fff;color:#000;z-index:1'
      document.body.appendChild(p)
      const r = document.createRange()
      r.selectNodeContents(p)
      const s = window.getSelection()!
      s.removeAllRanges()
      s.addRange(r)
    })
    await page.getByTestId('vlibras-enviar-selecao').click()
    await expect(dentro.locator('#texto')).toHaveText('Bom dia, tudo bem?')
    await expect(dentro.locator('#texto')).toHaveAttribute('data-traduzido', 'Bom dia, tudo bem?', { timeout: 10_000 })

    // Revogar fecha a ponte e apaga o aceite; o botão volta a pedir consentimento.
    await page.getByTestId('vlibras-desativar').click()
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('frasy.vlibras.consentimento'))).toBeNull()
    await b.click()
    await expect(page.getByTestId('vlibras-consentimento')).toBeVisible()
  })

  test('Legendar: o botão aparece atrás do portão e abre o consentimento', async ({ page }) => {
    const pedidos = await preparar(page, { libras_vlibras: true })
    await abrirTela(page, '/capturar')
    await expect(page.getByTestId('iniciar-captura')).toBeVisible({ timeout: 60_000 })
    const b = botao(page, 'legendar')
    await expect(b).toBeVisible()
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await foto(page, '4-legendar')
    await b.click()
    await expect(page.getByTestId('vlibras-consentimento')).toBeVisible()
    await page.getByTestId('vlibras-agora-nao').click()
    expect(pedidos).toEqual([])
  })

  test('Legendar sem a flag: nada aparece', async ({ page }) => {
    await preparar(page, {})
    await abrirTela(page, '/capturar')
    await expect(page.getByTestId('iniciar-captura')).toBeVisible({ timeout: 60_000 })
    await expect(botao(page, 'legendar')).toHaveCount(0)
  })

  test('Livro: o botão aparece ao lado de Ouvir e abre o consentimento; sem a flag, não', async ({ page }) => {
    test.slow()
    const pedidos = await simularVLibras(page)
    await prepararLivro(page, { libras_vlibras: true })
    await expect(botao(page, 'livro')).toBeVisible()
    expect((await botao(page, 'livro').boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await foto(page, '5-livro')
    await botao(page, 'livro').click()
    await expect(page.getByTestId('vlibras-consentimento')).toBeVisible()
    await page.getByTestId('vlibras-agora-nao').click()
    expect(pedidos).toEqual([])
  })

  test('Livro sem a flag: nada aparece', async ({ page }) => {
    test.slow()
    await prepararLivro(page, {})
    await expect(botao(page, 'livro')).toHaveCount(0)
  })
})
