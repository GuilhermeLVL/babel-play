import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type FrameLocator, type Page, type Route, test } from '@playwright/test'

import { iniciarCaptura } from './_captura'
import { abrirTela, clicarRobusto } from './_helpers'

/**
 * O ASSISTENTE AO VIVO na legenda flutuante (Fase C2), com a captura de verdade e as rotas do assistente SIMULADAS
 * (`page.route`): nenhuma chamada de IA sai do teste.
 *
 * A Document PiP é simulada como em `legenda-pip.e2e.ts` (a janela de um iframe do tamanho pedido); o PiP de vídeo, com
 * o pedido de PiP falso e o canvas real. O app roda em self-host (o plano é o `selfhost`, sem teto): o "Grátis" é
 * provado pela recusa do servidor (402 `sem_plano`), que é o que a tela de verdade recebe de um Grátis com cache velho.
 *
 * Prova: o destaque aparece (silencioso), tocar mostra o sentido, "Como respondo?" mostra as sugestões, a recusa de cota
 * tem a frase honesta, a flag desligada esconde tudo o que é pago, o Grátis vê só as palavras acima do nível, e o PiP de
 * vídeo desenha uma glosa curta.
 *
 * Com `ASSIST_SHOTS=<pasta>`, fotografa cada formato, a folha, a aba, os Ajustes e o quadro do vídeo (claro e escuro).
 */
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

const PASTA = process.env.ASSIST_SHOTS
const foto = async (page: Page, nome: string, alvo = '#pip-simulada') => {
  if (!PASTA) return
  mkdirSync(PASTA, { recursive: true })
  await page.waitForTimeout(350)
  await page.locator(alvo).screenshot({ path: join(PASTA, `${nome}.png`) })
}

const FRASES: Array<[string, string]> = [
  ['The report was ambiguous, so we checked it twice.', 'O relatório era ambíguo, então conferimos duas vezes.'],
  ['Break a leg tonight, even if the script is ambiguous!', 'Arrasa hoje à noite, mesmo que o roteiro seja ambíguo!'],
]

const falarTraduzido = (page: Page, pares: Array<[string, string]>) =>
  page.evaluate(
    (ps) =>
      (window as unknown as { __simFalas: (t: string[], f?: string, l?: string, tr?: string[]) => number }).__simFalas(
        ps.map((p) => p[0]),
        undefined,
        'en',
        ps.map((p) => p[1]),
      ),
    pares,
  )

const botaoDasFlutuantes = (page: Page) =>
  page.getByRole('toolbar', { name: 'Controles da captura' }).getByRole('button', { name: 'Legendas flutuantes' })

/** A Document PiP simulada: a janela de um iframe, do tamanho pedido, por cima da página. */
function simularDocumentPiP() {
  const api = {
    window: null as Window | null,
    requestWindow({ width, height }: { width: number; height: number }) {
      const f = document.createElement('iframe')
      f.id = 'pip-simulada'
      f.title = 'PiP simulada'
      f.style.cssText = `position:fixed;left:16px;top:16px;width:${width}px;height:${height}px;border:0;z-index:2147483647;box-shadow:0 0 0 1px #888`
      document.body.appendChild(f)
      const w = f.contentWindow!
      Object.defineProperty(w, 'outerWidth', { configurable: true, get: () => w.innerWidth })
      Object.defineProperty(w, 'outerHeight', { configurable: true, get: () => w.innerHeight })
      ;(w as unknown as { resizeTo: (a: number, b: number) => void }).resizeTo = (a, b) => {
        f.style.width = `${a}px`
        f.style.height = `${b}px`
      }
      ;(w as unknown as { close: () => void }).close = () => {
        if (!f.isConnected) return
        w.dispatchEvent(new Event('pagehide'))
        f.remove()
      }
      api.window = w
      return Promise.resolve(w)
    },
  }
  Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: api })
}

interface Pedidos {
  expressoes: number
  termos: number
  comoRespondo: number
}

/**
 * As rotas do assistente simuladas, a flag e o consentimento de nuvem (o Ajustes → Privacidade de quem já autorizou).
 * `comoRespondo` pode responder com recusa; `expressoes` também.
 */
async function prepararRotas(
  page: Page,
  o: {
    flag: boolean
    expressoes?: (r: Route) => Promise<void>
    comoRespondo?: (r: Route) => Promise<void>
  },
): Promise<Pedidos> {
  const pedidos: Pedidos = { expressoes: 0, termos: 0, comoRespondo: 0 }
  await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: { assistente_ao_vivo: { ligada: o.flag } } } }))
  await page.route('**/api/settings', async (route) => {
    const pedido = route.request()
    const resposta = await route.fetch()
    const s = (await resposta.json().catch(() => ({}))) as Record<string, unknown>
    if (pedido.method() !== 'GET') {
      /* As gravações da janela (aparência) ficam nesta página: o banco de dev não muda. */
      const corpo = (pedido.postDataJSON() ?? {}) as { ui?: unknown }
      return route.fulfill({ json: { ...s, ui: JSON.stringify(corpo.ui ?? {}) } })
    }
    try {
      const ui = typeof s.ui === 'string' ? (JSON.parse(s.ui) as Record<string, unknown>) : {}
      const p = (ui.preferencias ?? {}) as Record<string, unknown>
      p.consentimentos = { ...((p.consentimentos as object) ?? {}), nuvem: true }
      ui.preferencias = p
      s.ui = JSON.stringify(ui)
    } catch {
      /* ui ilegível: fica como veio */
    }
    return route.fulfill({ response: resposta, json: s })
  })
  await page.route('**/api/ai/assistente/expressoes', async (r) => {
    pedidos.expressoes++
    if (o.expressoes) return o.expressoes(r)
    const { frase } = r.request().postDataJSON() as { frase: string }
    const expressoes = /break a leg/i.test(frase)
      ? [{ trecho: 'break a leg', sentido: 'boa sorte (antes de uma apresentação)', tipo: 'idiomatica' }]
      : []
    return r.fulfill({ json: { expressoes, restanteHoje: 180 } })
  })
  await page.route('**/api/ai/assistente/termos', (r) => {
    pedidos.termos++
    return r.fulfill({ json: { termos: [], restanteHoje: 180 } })
  })
  await page.route('**/api/ai/assistente/como-respondo', async (r) => {
    pedidos.comoRespondo++
    if (o.comoRespondo) return o.comoRespondo(r)
    await new Promise((ok) => setTimeout(ok, 900))
    return r.fulfill({
      json: {
        sugestoes: [
          { texto: 'Thanks! I really needed that.', traducao: 'Valeu! Eu precisava disso.', tom: 'informal' },
          { texto: 'Thank you, I will do my best.', traducao: 'Obrigado, vou dar o meu melhor.', tom: 'neutro' },
          { texto: 'I appreciate your support.', traducao: 'Agradeço o seu apoio.', tom: 'formal' },
        ],
        restanteHoje: 179,
      },
    })
  })
  return pedidos
}

const tema = (page: Page, escuro: boolean) =>
  page.evaluate((e) => document.documentElement.classList.toggle('dark', e), escuro)
const mostrarBarra = async (page: Page) => {
  const box = await page.locator('#pip-simulada').boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
}
const esconderBarra = async (page: Page) => {
  await page.mouse.move(1200, 780)
}
const TAMANHOS = {
  jogo: { largura: 720, altura: 110 },
  video: { largura: 600, altura: 170 },
  conversa: { largura: 400, altura: 460 },
  estudo: { largura: 440, altura: 380 },
} as const
async function trocarFormato(page: Page, pip: FrameLocator, valor: keyof typeof TAMANHOS) {
  await mostrarBarra(page)
  await pip.getByRole('combobox', { name: 'Modo da janela' }).selectOption(valor)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const f = document.getElementById('pip-simulada') as HTMLIFrameElement | null
        return f ? { largura: f.clientWidth, altura: f.clientHeight } : null
      }),
    )
    .toEqual(TAMANHOS[valor])
}

/** Abre a captura, fala as frases e abre a janela (no formato Legenda). */
async function abrirComFalas(page: Page) {
  await page.addInitScript(simularDocumentPiP)
  await abrirTela(page, '/capturar')
  /* As flags simuladas no cache antes da janela (a primeira leitura é a do cache). */
  await page.evaluate(async () => {
    for (let i = 0; i < 30 && !localStorage.getItem('babel.flags')?.includes('assistente_ao_vivo'); i++)
      await new Promise((r) => setTimeout(r, 100))
  })
  await tema(page, false)
  await iniciarCaptura(page)
  await clicarRobusto(page, botaoDasFlutuantes(page))
  const pip = page.frameLocator('#pip-simulada')
  await expect(pip.getByRole('region', { name: 'Legendas flutuantes' })).toBeVisible()
  await trocarFormato(page, pip, 'video')
  await esconderBarra(page)
  await falarTraduzido(page, FRASES)
  await expect(pip.locator('.leg-fala.atual .leg-o')).toHaveText(FRASES[1][0], { timeout: 20_000 })
  return pip
}

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'a janela flutuante é do computador (abaixo de 720 px o botão some)')
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
  await page.addInitScript(() => {
    if (sessionStorage.getItem('assist-limpo')) return
    sessionStorage.setItem('assist-limpo', '1')
    for (const k of [
      'babel.legendasFlutuantes',
      'babel.legendasFlutuantes.tamanhos',
      'babel.assistente',
      'babel.flags',
      'theme',
    ])
      localStorage.removeItem(k)
  })
})

test('destaque silencioso, sentido ao tocar, "Como respondo?" com sugestões e a aba Assistente', async ({ page }) => {
  test.slow()
  const pedidos = await prepararRotas(page, { flag: true })
  const pip = await abrirComFalas(page)
  const regiao = pip.getByRole('region', { name: 'Legendas flutuantes' })

  /* O destaque chega sozinho, sem aviso: uma marca na linha, com o sentido no title. */
  const expressao = pip.locator('.leg-fala.atual .leg-marca[data-marca="expressao"]')
  await expect(expressao).toHaveText('Break a leg', { timeout: 10_000 })
  await expect(expressao).toHaveAttribute('title', /boa sorte/)
  await expect(pip.locator('.leg-marca[data-marca="nivel"]').first()).toBeVisible()
  await expect(regiao.locator('.leg-aviso')).toHaveCount(0)
  /* Uma chamada por linha final (a primeira linha, sem sigla, não chama termos). */
  expect(pedidos.expressoes).toBeLessThanOrEqual(2)
  expect(pedidos.termos).toBe(0)

  if (PASTA) {
    for (const escuro of [false, true]) {
      await tema(page, escuro)
      for (const valor of ['jogo', 'video', 'conversa', 'estudo'] as const) {
        await trocarFormato(page, pip, valor)
        await esconderBarra(page)
        await expect(regiao).not.toHaveClass(/com-controles/, { timeout: 5000 })
        const nome = { jogo: 'faixa', video: 'legenda', conversa: 'conversa', estudo: 'estudo' }[valor]
        await foto(page, `${nome}-destaques-${escuro ? 'escuro' : 'claro'}`)
      }
    }
    await tema(page, false)
    await trocarFormato(page, pip, 'video')
    await esconderBarra(page)
  }

  /* Com os controles à vista: a barra, as abas e o botão "Como respondo?" no canto. */
  await mostrarBarra(page)
  await expect(regiao).toHaveClass(/com-controles/)
  await foto(page, 'legenda-com-controles-claro')

  /* A faixa é mínima: marcas, sem o botão. */
  await trocarFormato(page, pip, 'jogo')
  await expect(regiao).toHaveAttribute('data-layout', 'faixa')
  await expect(pip.locator('.leg-marca').first()).toBeVisible()
  await expect(pip.getByRole('button', { name: /Como respondo/ })).toHaveCount(0)
  await trocarFormato(page, pip, 'estudo')

  /* Tocar a expressão: o cartão traz o sentido. */
  await pip.locator('.leg-fala.atual .leg-marca[data-marca="expressao"]').click()
  const cartao = pip.getByRole('dialog', { name: 'Palavra: Break a leg' })
  await expect(cartao).toContainText('boa sorte')
  await expect(cartao).toContainText('Expressão')
  await foto(page, 'estudo-cartao-da-expressao-claro')
  await cartao.getByRole('button', { name: 'Fechar o cartão da palavra' }).click()

  /* "Como respondo?": espera honesta, depois as sugestões com tradução, Copiar e Ouvir. */
  await mostrarBarra(page)
  await pip.getByRole('button', { name: /Como respondo/ }).click()
  const folha = pip.getByRole('dialog', { name: 'Como respondo?' })
  await expect(folha).toContainText('Pensando em respostas…')
  await foto(page, 'como-respondo-carregando-claro')
  await expect(folha.locator('.leg-sugestao')).toHaveCount(3, { timeout: 10_000 })
  await expect(folha).toContainText('Valeu! Eu precisava disso.')
  await expect(folha.getByRole('button', { name: 'Copiar' })).toHaveCount(3)
  await expect(folha.getByRole('button', { name: 'Ouvir' })).toHaveCount(3)
  expect(pedidos.comoRespondo).toBe(1)
  await foto(page, 'como-respondo-claro')
  if (PASTA) {
    await tema(page, true)
    await foto(page, 'como-respondo-escuro')
    await tema(page, false)
  }
  await folha.getByRole('button', { name: 'Fechar as sugestões' }).click()
  await expect(folha).toHaveCount(0)

  /* A aba Assistente: o glossário da sessão, com Salvar. */
  await mostrarBarra(page)
  await pip.getByRole('tab', { name: 'Assistente' }).click()
  const aba = pip.getByTestId('aba-assistente')
  await expect(aba.locator('.leg-glossario-item').first()).toContainText('Break a leg')
  await foto(page, 'aba-assistente-claro')
  if (PASTA) {
    await tema(page, true)
    await foto(page, 'aba-assistente-escuro')
    await tema(page, false)
  }
  await aba.getByRole('button', { name: 'Salvar “Break a leg” no vocabulário' }).click()
  await expect(aba.locator('.leg-glossario-status').first()).not.toHaveText('', { timeout: 15_000 })
})

test('recusa de cota no "Como respondo?": a frase honesta, sem oferta', async ({ page }) => {
  test.slow()
  await prepararRotas(page, {
    flag: true,
    comoRespondo: (r) =>
      r.fulfill({ status: 429, json: { error: 'Limite do dia do assistente', code: 'teto_do_assistente' } }),
  })
  const pip = await abrirComFalas(page)
  await mostrarBarra(page)
  await pip.getByRole('button', { name: /Como respondo/ }).click()
  const folha = pip.getByRole('dialog', { name: 'Como respondo?' })
  await expect(folha).toContainText(
    'Você chegou ao limite de hoje do assistente. Ele volta amanhã; a legenda segue funcionando.',
  )
  await expect(folha).not.toContainText(/plano|R\$|assin/i)
  await foto(page, 'como-respondo-cota-claro')
})

test('flag desligada: nada pago aparece e nenhuma rota do assistente é chamada', async ({ page }) => {
  test.slow()
  const pedidos = await prepararRotas(page, { flag: false })
  const pip = await abrirComFalas(page)
  /* As palavras acima do nível são locais e seguem; expressão, botão e chamadas, não. */
  await expect(pip.locator('.leg-marca[data-marca="nivel"]').first()).toBeVisible()
  await page.waitForTimeout(2000)
  await expect(pip.locator('.leg-marca[data-marca="expressao"]')).toHaveCount(0)
  await mostrarBarra(page)
  await expect(pip.getByRole('button', { name: /Como respondo/ })).toHaveCount(0)
  expect(pedidos).toEqual({ expressoes: 0, termos: 0, comoRespondo: 0 })
})

test('Grátis (o servidor diz sem_plano): só as marcas de nível, sem botão', async ({ page }) => {
  test.slow()
  const pedidos = await prepararRotas(page, {
    flag: true,
    expressoes: (r) => r.fulfill({ status: 402, json: { error: 'Sem plano', code: 'sem_plano' } }),
  })
  const pip = await abrirComFalas(page)
  await expect.poll(() => pedidos.expressoes, { timeout: 10_000 }).toBeGreaterThan(0)
  await mostrarBarra(page)
  await expect(pip.getByRole('button', { name: /Como respondo/ })).toHaveCount(0)
  await expect(pip.locator('.leg-marca[data-marca="expressao"]')).toHaveCount(0)
  await expect(pip.locator('.leg-marca[data-marca="nivel"]').first()).toBeVisible()
  /* Depois da recusa, nenhuma chamada nova. */
  const antes = pedidos.expressoes
  await falarTraduzido(page, [['This deal is a piece of cake, honestly speaking.', 'Esse acordo é moleza.']])
  await page.waitForTimeout(2500)
  expect(pedidos.expressoes).toBe(antes)
  await esconderBarra(page)
  await foto(page, 'gratis-so-nivel-claro')
})

test('Ajustes da captura: a seção Assistente ao vivo', async ({ page }) => {
  test.slow()
  await prepararRotas(page, { flag: true })
  await abrirTela(page, '/capturar')
  await page.evaluate(async () => {
    for (let i = 0; i < 30 && !localStorage.getItem('babel.flags')?.includes('assistente_ao_vivo'); i++)
      await new Promise((r) => setTimeout(r, 100))
  })
  await clicarRobusto(page, page.getByRole('button', { name: 'Ajustes da captura' }).first())
  const secao = page.getByTestId('ajustes-do-assistente')
  await secao.scrollIntoViewIfNeeded()
  await expect(secao.getByRole('switch', { name: 'Correção da minha fala' })).toHaveAttribute('aria-checked', 'false')
  await expect(secao.getByRole('switch', { name: 'Expressões e gírias' })).toBeVisible()
  await expect(secao.getByLabel('Meu nível', { exact: true })).toHaveValue('B1')
  await secao.getByRole('switch', { name: 'Abrir na aba Assistente' }).scrollIntoViewIfNeeded()
  for (const escuro of [false, true]) {
    await tema(page, escuro)
    await foto(page, `ajustes-assistente-${escuro ? 'escuro' : 'claro'}`, 'body')
  }
})

/** O PiP de vídeo simulado (Safari): sem Document PiP; o pedido de PiP é falso, o canvas é real. */
function simularPiPDeVideo() {
  delete (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture
  const w = window as unknown as { __textos: string[]; __videoPiP: HTMLVideoElement | null }
  w.__textos = []
  w.__videoPiP = null
  Object.defineProperty(document, 'pictureInPictureEnabled', { configurable: true, get: () => true })
  const fillText = CanvasRenderingContext2D.prototype.fillText
  CanvasRenderingContext2D.prototype.fillText = function (s: string, x: number, y: number) {
    w.__textos.push(s)
    return fillText.call(this, s, x, y)
  }
  HTMLVideoElement.prototype.requestPictureInPicture = function (this: HTMLVideoElement) {
    w.__videoPiP = this
    Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, get: () => w.__videoPiP })
    return Promise.resolve({ width: 640, height: 180 } as unknown as PictureInPictureWindow)
  }
}

test('PiP de vídeo (só leitura): uma glosa curta embaixo da legenda', async ({ page }) => {
  test.slow()
  const pedidos = await prepararRotas(page, { flag: true })
  await page.addInitScript(simularPiPDeVideo)
  await abrirTela(page, '/capturar')
  await page.evaluate(async () => {
    for (let i = 0; i < 30 && !localStorage.getItem('babel.flags')?.includes('assistente_ao_vivo'); i++)
      await new Promise((r) => setTimeout(r, 100))
  })
  await tema(page, true)
  await iniciarCaptura(page)
  /* A tela inteira sugere a FAIXA (jogo), onde o quadro fica só com o texto. Aqui se prova a glosa do formato Legenda:
     a captura passa a dizer que compartilha uma ABA (é dela que sai o formato sugerido). */
  await page.evaluate(() => {
    const original = MediaStreamTrack.prototype.getSettings
    MediaStreamTrack.prototype.getSettings = function (this: MediaStreamTrack) {
      const s = original.call(this)
      return this.kind === 'video' ? { ...s, displaySurface: 'browser' } : s
    }
  })
  await clicarRobusto(page, botaoDasFlutuantes(page))
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __videoPiP: unknown }).__videoPiP)).toBe(true)
  await falarTraduzido(page, FRASES)
  /* A linha final vai à rota de expressões (só leitura também gasta, então só com a janela aberta). */
  await expect.poll(() => pedidos.expressoes, { timeout: 10_000 }).toBeGreaterThan(0)
  const textos = () => page.evaluate(() => (window as unknown as { __textos: string[] }).__textos.join(' | '))
  await expect.poll(textos, { timeout: 15_000 }).toContain('Break a leg: boa sorte')
  /* Só leitura: nada de "Como respondo?" (nem chamada). */
  expect(pedidos.comoRespondo).toBe(0)
  if (PASTA) {
    mkdirSync(PASTA, { recursive: true })
    for (const escuro of [true, false]) {
      await tema(page, escuro)
      await page.waitForTimeout(600)
      const dado = await page.evaluate(() => {
        const v = (window as unknown as { __videoPiP: HTMLVideoElement }).__videoPiP
        const c = document.createElement('canvas')
        c.width = v.videoWidth || 1280
        c.height = v.videoHeight || 360
        c.getContext('2d')!.drawImage(v, 0, 0)
        return c.toDataURL('image/png')
      })
      writeFileSync(
        join(PASTA, `video-glosa-${escuro ? 'escuro' : 'claro'}.png`),
        Buffer.from(dado.split(',')[1], 'base64'),
      )
    }
  }
})
