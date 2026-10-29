import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { abrirPeloMenu, comecarFalando, comFlags, falsos, fase, porToque, semPreferenciasDeAvatar } from './_interprete'

/**
 * AS LACUNAS DO MODO LIBRAS, no app de verdade e SEM microfone (a Web Speech, o tradutor e a voz são os falsos de
 * `_interprete.ts`): o palco das mãos fica SEMPRE à vista com a soletração ligada (mãos em repouso quando não há o que
 * soletrar), soletra o nome e, no modo "soletrar tudo", as palavras; o guia "Alfabeto manual" abre, mostra as letras, o
 * teclado funciona e a lista de poses marcadas é exportável; os dois avisos fixos estão sempre presentes.
 * Rodado em desktop-1280, tablet-768 e mobile-375. NÃO provado aqui: PiP real, Safari, pessoas surdas lendo as poses.
 *
 * Capturas: `$AVATAR_CAPTURAS` (padrão `tests/e2e/__capturas__/`, fora do git).
 */
const CAPTURAS = process.env.AVATAR_CAPTURAS || path.join(process.cwd(), 'tests', 'e2e', '__capturas__')
mkdirSync(CAPTURAS, { recursive: true })

test.use({
  launchOptions: {
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
  permissions: ['microphone'],
})

const AVISO_1 = 'Soletração do alfabeto manual: não é tradução para Libras'
const AVISO_2 = 'Poses de DEMONSTRAÇÃO: ainda NÃO revisadas por pessoas surdas'
const FRASE = 'fale com Conceição amanhã'

const foto = (page: Page, nome: string) =>
  page.screenshot({ path: path.join(CAPTURAS, `lacunas-${test.info().project.name}-${nome}.png`), fullPage: false })

const pronto = (page: Page) => fase(page).getByTestId('avatar-outro').locator('[data-avatar-pronto="true"]').first()

const ligar = (page: Page, extra: Record<string, string> = {}) =>
  page.addInitScript((prefs) => {
    localStorage.setItem('frasy.avatar.interprete.soletrar', '1')
    localStorage.setItem('frasy.avatar.interprete.ritmo', 'rapida')
    for (const [k, v] of Object.entries(prefs)) localStorage.setItem(`frasy.avatar.interprete.${k}`, v)
  }, extra)

async function abrir(page: Page, o: { fala?: string; extra?: Record<string, string> } = {}) {
  await falsos(page, { atrasoDaFalaMs: 9_000, fraseEmPt: o.fala ?? FRASE })
  await porToque(page)
  await comFlags(page, { avatar_3d: true, avatar_sinais: true })
  await ligar(page, o.extra)
  await abrirPeloMenu(page)
  await comecarFalando(page, /Falar em Português/)
  await expect(pronto(page)).toBeVisible({ timeout: 60_000 })
}

async function avisosSempre(escopo: ReturnType<Page['locator']>) {
  await expect(escopo.getByText(AVISO_1).first()).toBeVisible()
  await expect(escopo.getByText(AVISO_2).first()).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await semPreferenciasDeAvatar(page)
})

test.describe('Palco das mãos no Intérprete', () => {
  test('com a soletração ligada o palco aparece de cara, em repouso, com os dois avisos e o estado "Aguardando"', async ({
    page,
  }) => {
    test.slow()
    // a tradução demora: nenhuma fala chegou, então nada para soletrar
    await falsos(page, { atrasoDaTraducaoMs: 90_000, fraseEmPt: FRASE })
    await porToque(page)
    await comFlags(page, { avatar_3d: true, avatar_sinais: true })
    await ligar(page)
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await expect(pronto(page)).toBeVisible({ timeout: 60_000 })

    const palco = fase(page).getByTestId('soletracao-palco')
    await expect(palco).toBeVisible({ timeout: 30_000 })
    await expect(palco).toHaveAttribute('data-palco-estado', 'aguardando')
    // o canvas das mãos está pronto e em câmera "só mãos"
    const mao = palco.locator('[data-sinais-camera="maos"]')
    await expect(mao).toBeVisible({ timeout: 60_000 })
    await expect(palco.locator('[data-sinais-pronto="true"]')).toBeVisible({ timeout: 60_000 })
    const conversa = fase(page).getByTestId('soletracao-na-conversa')
    // no computador a linha está embaixo do idioma; no celular ela mora no topo da metade (forma curta, `title` com a longa)
    await expect(fase(page).getByTestId('soletracao-aguardando')).toHaveText(/^Aguardando um nome/)
    await avisosSempre(conversa)
    // no computador o palco cresce: bem maior que o círculo de antes
    const caixa = await palco.boundingBox()
    if (test.info().project.name === 'desktop-1280') expect(caixa!.width).toBeGreaterThanOrEqual(200)
    expect(caixa!.width).toBeGreaterThanOrEqual(64)
    // sem rolagem lateral
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await foto(page, '1-palco-em-repouso')
  })

  test('soletra o nome próprio: letra atual em negrito e sublinhada, letras feitas marcadas, avisos sempre', async ({
    page,
  }) => {
    test.slow()
    await abrir(page)
    const conversa = fase(page).getByTestId('soletracao-na-conversa')
    const palco = fase(page).getByTestId('soletracao-palco')
    await expect(palco).toHaveAttribute('data-palco-estado', 'soletrando', { timeout: 90_000 })
    await expect(palco.locator('[data-sinais-estado="soletrando"]')).toBeVisible({ timeout: 60_000 })
    await avisosSempre(conversa)
    const emColunas = (await page.locator('[data-layout="computador"]').count()) > 0
    if (emColunas) {
      await expect(conversa.getByTestId('soletracao-rotulo')).toHaveText(/^Soletrando: C(-|…)/, { timeout: 30_000 })
      // a atual é negrito + sublinhada (não só cor) e há letras já feitas e letras que faltam
      const atual = conversa.locator('[data-testid="soletracao-letras"] li[data-estado="atual"]')
      await expect(atual).toHaveCount(1)
      const estilo = await atual.evaluate((e) => {
        const c = getComputedStyle(e)
        return { peso: Number(c.fontWeight), linha: c.textDecorationLine }
      })
      expect(estilo.peso).toBeGreaterThanOrEqual(700)
      expect(estilo.linha).toContain('underline')
      await expect(conversa.getByTestId('soletracao-fila')).toBeVisible()
      await expect(conversa.getByTestId('soletracao-nao-traducao')).toHaveText('Soletração, não tradução')
      await foto(page, '2-soletrando-nome')
      // as letras já feitas aparecem marcadas (esperar a segunda letra)
      await expect(conversa.locator('[data-testid="soletracao-letras"] li[data-estado="feita"]').first()).toBeVisible({
        timeout: 30_000,
      })
    } else {
      await expect(fase(page).getByTestId('soletracao-atual-mini').locator('[data-palavra-atual]')).toHaveText(
        'Conceição',
        { timeout: 30_000 },
      )
      await foto(page, '2-soletrando-nome')
    }
    // a legenda da conversa segue à vista
    await expect(
      fase(page)
        .getByTestId('interprete-outro')
        .locator('.int-traducao', { hasText: '[trad] fale com Conceição amanhã' }),
    ).toBeVisible()
    // termina sozinha e as mãos voltam ao repouso (o palco continua)
    await expect(palco).toHaveAttribute('data-palco-estado', 'aguardando', { timeout: 90_000 })
    await avisosSempre(conversa)
  })

  test('"Soletrar tudo": muda no painel, usa o ritmo e soletra palavras que não são nome', async ({ page }) => {
    test.slow()
    await abrir(page, { fala: 'bom dia a todos' })
    const palco = fase(page).getByTestId('soletracao-palco')
    // no modo "nomes" esta fala não tem o que soletrar
    await expect(fase(page).getByTestId('interprete-outro').getByText('[trad] bom dia a todos')).toBeVisible({
      timeout: 60_000,
    })
    await expect(palco).toHaveAttribute('data-palco-estado', 'aguardando')

    await page.getByTestId('avatares-da-conversa').click()
    const painel = page.getByTestId('painel-dos-avatares')
    await expect(painel.getByTestId('avatar-modo-nomes')).toBeChecked()
    await painel.getByTestId('avatar-modo-tudo').check()
    expect(await page.evaluate(() => localStorage.getItem('frasy.avatar.interprete.soletrarTudo'))).toBe('1')
    await expect(painel.getByTestId('avatar-modo-nota')).toContainText('Soletração, não tradução')
    await expect(painel.getByTestId('avatar-ritmo-rapida')).toBeChecked() // o ritmo vale para os dois modos
    await foto(page, '3-painel-soletrar-tudo')
    await page.keyboard.press('Escape')
  })
})

test.describe('Soletrar tudo, de ponta a ponta', () => {
  test('com "tudo" ligado desde o início: as palavras comuns vão para as mãos e a fila é contada', async ({ page }) => {
    test.slow()
    await abrir(page, { fala: 'bom dia a todos', extra: { soletrarTudo: '1' } })
    const palco = fase(page).getByTestId('soletracao-palco')
    await expect(palco).toHaveAttribute('data-palco-estado', 'soletrando', { timeout: 90_000 })
    const conversa = fase(page).getByTestId('soletracao-na-conversa')
    await avisosSempre(conversa)
    const emColunas = (await page.locator('[data-layout="computador"]').count()) > 0
    if (emColunas) {
      await expect(conversa.getByTestId('soletracao-fila')).toHaveText(/\d+ palavras? na fila/, { timeout: 30_000 })
      await expect(conversa.locator('[data-palavra-atual]')).toHaveText(/^(bom|dia|todos)\b/, { timeout: 30_000 })
    } else {
      await expect(fase(page).getByTestId('soletracao-atual-mini').locator('[data-palavra-atual]')).toHaveText(
        /^(bom|dia|todos)\b/,
        { timeout: 30_000 },
      )
    }
    await foto(page, '4-soletrar-tudo')
    // a voz leu a tradução inteira e a legenda está lá: a soletração não mexe nelas
    const lidas = await page.evaluate(() => (window as unknown as { __lidas: Array<{ texto: string }> }).__lidas)
    expect(lidas.map((l) => l.texto)).toEqual(['[trad] bom dia a todos'])
    await expect(fase(page).getByTestId('interprete-outro').getByText('[trad] bom dia a todos')).toBeVisible()
  })
})

test.describe('Guia "Alfabeto manual"', () => {
  test('abre pela linha do atalho, mostra letras e números, o teclado escolhe e a lista de marcadas se exporta', async ({
    page,
  }) => {
    test.slow()
    await falsos(page, { atrasoDaTraducaoMs: 90_000 })
    await porToque(page)
    await comFlags(page, { avatar_3d: true, avatar_sinais: true })
    await ligar(page)
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await expect(pronto(page)).toBeVisible({ timeout: 60_000 })

    const abrirGuia = page.getByTestId('abrir-guia-do-alfabeto')
    await expect(abrirGuia).toBeVisible({ timeout: 60_000 })
    await abrirGuia.click()
    const guia = page.getByTestId('guia-alfabeto')
    await expect(guia).toBeVisible()
    await expect(guia.getByRole('heading', { name: 'Alfabeto manual' })).toBeVisible()
    await avisosSempre(guia)

    // o automático segue o idioma da outra pessoa (aqui, inglês = ASL); escolhe Libras: A a Z, Ç e 0 a 9
    await expect(guia).toHaveAttribute('data-alfabeto', 'asl')
    await guia.getByTestId('guia-alfabeto-libras').check()
    const grade = guia.getByTestId('guia-grade')
    await expect(grade.getByTestId('guia-tecla-A')).toBeVisible()
    await expect(grade.getByTestId('guia-tecla-Ç')).toBeVisible()
    await expect(grade.getByTestId('guia-tecla-9')).toBeVisible()
    await expect(guia.getByTestId('guia-palco').locator('[data-sinais-pronto="true"]')).toBeVisible({ timeout: 90_000 })

    // teclado: digitar escolhe a letra; as setas andam na grade
    await grade.getByTestId('guia-tecla-A').focus()
    await page.keyboard.press('g')
    await expect(grade.getByTestId('guia-tecla-G')).toHaveAttribute('aria-pressed', 'true')
    await expect(guia.getByTestId('guia-letra-atual')).toContainText('Letra G em Libras')
    await expect(grade.getByTestId('guia-tecla-G')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(grade.getByTestId('guia-tecla-H')).toHaveAttribute('aria-pressed', 'true')
    await foto(page, '5-guia-letra-H')

    // ASL e canhoto
    await guia.getByTestId('guia-alfabeto-asl').check()
    await expect(guia).toHaveAttribute('data-alfabeto', 'asl')
    await expect(grade.getByTestId('guia-tecla-Ç')).toHaveCount(0)
    await guia.getByTestId('guia-espelhar').check()
    expect(await page.evaluate(() => localStorage.getItem('frasy.avatar.interprete.espelhar'))).toBe('1')
    await guia.getByTestId('guia-espelhar').uncheck()

    // marcar a pose como incorreta: lista local, exportável
    await grade.getByTestId('guia-tecla-P').click()
    await guia.getByTestId('guia-marcar').click()
    await expect(guia.getByTestId('guia-marcar')).toHaveAttribute('aria-pressed', 'true')
    await expect(guia.getByTestId('guia-marcadas-resumo')).toContainText('Poses marcadas: 1')
    const guardada = await page.evaluate(() => localStorage.getItem('frasy.avatar.sinais.marcacoes'))
    expect(JSON.parse(guardada!)).toMatchObject([{ alfabeto: 'asl', letra: 'P' }])
    const [baixado] = await Promise.all([page.waitForEvent('download'), guia.getByTestId('guia-exportar').click()])
    expect(baixado.suggestedFilename()).toBe('frasy-poses-marcadas.json')
    const arq = await baixado.createReadStream()
    const chunks: Buffer[] = []
    for await (const c of arq) chunks.push(c as Buffer)
    const json = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      esquema: string
      aviso: string
      itens: unknown[]
    }
    expect(json.esquema).toBe('frasy-poses-marcadas/1')
    expect(json.aviso).toContain('NÃO revisadas por pessoas surdas')
    expect(json.itens).toHaveLength(1)

    // soletrar uma palavra
    await guia.getByTestId('guia-palavra-campo').fill('Ana')
    await guia.getByTestId('guia-palavra-soletrar').click()
    await expect(guia.getByTestId('guia-letra-atual')).toContainText('Soletrando “Ana”')
    await expect(guia.getByTestId('guia-letras').locator('li[data-estado="atual"]')).toHaveCount(1, { timeout: 30_000 })
    await foto(page, '6-guia-soletrando-palavra')
    await avisosSempre(guia)

    // Esc fecha e o foco volta ao botão que abriu
    await page.keyboard.press('Escape')
    await expect(guia).toHaveCount(0)
    await expect(abrirGuia).toBeFocused()
    // sem rolagem lateral
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('cabe na tela: nada passa da largura e os botões têm alvo de 44 px', async ({ page }) => {
    test.slow()
    await falsos(page, { atrasoDaTraducaoMs: 90_000 })
    await porToque(page)
    await comFlags(page, { avatar_3d: true, avatar_sinais: true })
    await ligar(page)
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await expect(pronto(page)).toBeVisible({ timeout: 60_000 })
    await page.getByTestId('abrir-guia-do-alfabeto').click({ timeout: 60_000 })
    const guia = page.getByTestId('guia-alfabeto')
    await expect(guia).toBeVisible()
    await expect(guia.getByTestId('guia-palco').locator('[data-sinais-pronto="true"]')).toBeVisible({ timeout: 90_000 })
    const medidas = await guia.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const teclas = [...el.querySelectorAll<HTMLElement>('.ga-tecla')].map((t) => t.getBoundingClientRect())
      return {
        dentro: r.left >= 0 && r.right <= window.innerWidth + 0.5,
        menorAlvo: Math.min(...teclas.map((t) => Math.min(t.width, t.height))),
        rolaLado: el.scrollWidth > el.clientWidth + 1,
      }
    })
    expect(medidas.dentro).toBe(true)
    expect(medidas.rolaLado).toBe(false)
    expect(medidas.menorAlvo).toBeGreaterThanOrEqual(44)
    await foto(page, '7-guia-tela')
  })

  test('também abre em Perfil > Avatar, com os avisos fixos', async ({ page }) => {
    test.slow()
    await comFlags(page, { avatar_3d: true, avatar_sinais: true })
    await page.goto('/perfil')
    await page.getByRole('tab', { name: 'Avatar' }).click()
    const abrirGuia = page.getByTestId('avatar-abrir-guia')
    await expect(abrirGuia).toBeVisible({ timeout: 30_000 })
    await abrirGuia.click()
    const guia = page.getByTestId('guia-alfabeto')
    await expect(guia).toBeVisible()
    await avisosSempre(guia)
    await expect(guia.getByTestId('guia-grade').getByTestId('guia-tecla-A')).toBeVisible()
    await foto(page, '8-guia-no-perfil')
    await guia.getByTestId('guia-fechar').click()
    await expect(guia).toHaveCount(0)
  })

  test('sem a flag avatar_sinais não há entrada para o guia', async ({ page }) => {
    await comFlags(page, { avatar_3d: true })
    await page.goto('/perfil')
    await page.getByRole('tab', { name: 'Avatar' }).click()
    await expect(page.getByTestId('aba-avatar')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('avatar-abrir-guia')).toHaveCount(0)
  })
})
