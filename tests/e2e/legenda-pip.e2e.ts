import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type FrameLocator, type Page, test } from '@playwright/test'

import { iniciarCaptura } from './_captura'
import { abrirTela, clicarRobusto } from './_helpers'

/**
 * A PiP INTELIGENTE com a captura de verdade, nos dois caminhos que ficam por cima de outros apps:
 *
 *  1. DOCUMENT PiP (Chrome/Edge), SIMULADA: a janela de verdade não se fotografa em headless, então
 *     `documentPictureInPicture.requestWindow` devolve a janela de um `<iframe>` do tamanho pedido
 *     (com `resizeTo` e `close` que mexem no iframe). O app não sabe a diferença: copia os estilos,
 *     monta o conteúdo por portal e mede a janela. Prova: abre no gesto, no tamanho do formato;
 *     redimensionar muda o layout; trocar o formato redimensiona; tocar uma palavra e salvar.
 *  2. PiP DE VÍDEO (Safari), SIMULADO: sem Document PiP, o botão desenha a legenda num canvas e pede
 *     o PiP do vídeo (`requestPictureInPicture` é falso, o canvas e o `captureStream` são reais).
 *     Prova: só redesenha quando muda; a pausa e o "próxima" da Media Session; sair para de desenhar.
 *
 * Com `PIP_SHOTS=<pasta>`, fotografa cada formato no claro e no escuro, e o quadro do vídeo.
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

const FRASES: Array<[string, string]> = [
  ['Did you see the final round last night?', 'Você viu a rodada final ontem à noite?'],
  ['Yeah, the last goal was absolutely unbelievable.', 'Sim, o último gol foi inacreditável.'],
  ['We should watch the next match together.', 'A gente devia assistir ao próximo jogo junto.'],
  ['Bring snacks, I will take care of the drinks.', 'Traga petiscos, eu cuido das bebidas.'],
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

const PASTA = process.env.PIP_SHOTS
const foto = async (page: Page, nome: string) => {
  if (!PASTA) return
  mkdirSync(PASTA, { recursive: true })
  await page.waitForTimeout(350) // a barra termina de sumir (ou de aparecer)
  await page.locator('#pip-simulada').screenshot({ path: join(PASTA, `${nome}.png`) })
}

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
      /* Sem moldura: o tamanho interno é o externo. */
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
      ;(window as unknown as { __pipPedidos: unknown[] }).__pipPedidos.push({ width, height })
      return Promise.resolve(w)
    },
  }
  ;(window as unknown as { __pipPedidos: unknown[] }).__pipPedidos = []
  Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: api })
}

const tamanhoDoIframe = (page: Page) =>
  page.evaluate(() => {
    const f = document.getElementById('pip-simulada') as HTMLIFrameElement | null
    return f ? { largura: f.clientWidth, altura: f.clientHeight } : null
  })
const redimensionar = (page: Page, largura: number, altura: number) =>
  page.evaluate(
    ([l, a]) => {
      const f = document.getElementById('pip-simulada') as HTMLIFrameElement
      f.style.width = `${l}px`
      f.style.height = `${a}px`
    },
    [largura, altura] as const,
  )
const mostrarBarra = async (page: Page) => {
  const box = await page.locator('#pip-simulada').boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height - 8)
}
const esconderBarra = async (page: Page) => {
  await page.mouse.move(1200, 780)
}
const tema = (page: Page, escuro: boolean) =>
  page.evaluate((e) => document.documentElement.classList.toggle('dark', e), escuro)

const TAMANHOS = {
  jogo: { largura: 720, altura: 110 },
  video: { largura: 600, altura: 170 },
  conversa: { largura: 400, altura: 460 },
  estudo: { largura: 440, altura: 380 },
} as const

async function trocarFormato(page: Page, pip: FrameLocator, valor: keyof typeof TAMANHOS) {
  await mostrarBarra(page)
  await pip.getByRole('combobox', { name: 'Modo da janela' }).selectOption(valor)
  await expect.poll(() => tamanhoDoIframe(page)).toEqual(TAMANHOS[valor])
}

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'a janela flutuante é do computador (abaixo de 720 px o botão some)')
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
  /* Cada execução começa do padrão da janela (fundo, formato, tamanhos). */
  await page.addInitScript(() => {
    if (sessionStorage.getItem('pip-limpo')) return
    sessionStorage.setItem('pip-limpo', '1')
    for (const k of ['babel.legendasFlutuantes', 'babel.legendasFlutuantes.tamanhos', 'theme'])
      localStorage.removeItem(k)
  })
})

test('Document PiP: abre no gesto, adapta ao tamanho, troca o formato e salva uma palavra', async ({ page }) => {
  test.slow()
  await page.addInitScript(simularDocumentPiP)
  await abrirTela(page, '/capturar')
  await tema(page, false)
  await iniciarCaptura(page)
  await falarTraduzido(page, FRASES)

  await clicarRobusto(page, botaoDasFlutuantes(page))
  const pip = page.frameLocator('#pip-simulada')
  const regiao = pip.getByRole('region', { name: 'Legendas flutuantes' })
  await expect(regiao).toBeVisible()
  /* Pedida UMA vez, no tamanho do formato sugerido. */
  expect(await page.evaluate(() => (window as unknown as { __pipPedidos: unknown[] }).__pipPedidos.length)).toBe(1)
  const sugerido = (await pip.getByRole('combobox', { name: 'Modo da janela' }).inputValue()) as keyof typeof TAMANHOS
  expect(await tamanhoDoIframe(page)).toEqual(TAMANHOS[sugerido])
  await expect(pip.locator('.leg-fala.atual .leg-o')).toHaveText(FRASES[3][0], { timeout: 20_000 })

  /* Limpa: sem mexer, a barra some; ao passar o mouse, volta. */
  await esconderBarra(page)
  await expect(regiao).not.toHaveClass(/com-controles/, { timeout: 5000 })
  await mostrarBarra(page)
  await expect(regiao).toHaveClass(/com-controles/)

  /* Redimensionar muda o layout de verdade. */
  await redimensionar(page, 420, 480)
  await expect(regiao).toHaveAttribute('data-layout', 'conversa')
  await redimensionar(page, 700, 110)
  await expect(regiao).toHaveAttribute('data-layout', 'faixa')

  /* Trocar o formato redimensiona a janela (é um clique: o navegador deixa). */
  await trocarFormato(page, pip, 'video')
  await expect(regiao).toHaveAttribute('data-layout', 'legenda')
  await trocarFormato(page, pip, 'conversa')
  await expect(regiao).toHaveAttribute('data-layout', 'conversa')
  await expect(pip.locator('.leg-fala')).toHaveCount(4)

  /* Fotos: cada formato, claro e escuro, só o texto (a barra escondida). */
  if (PASTA) {
    for (const escuro of [false, true]) {
      await tema(page, escuro)
      for (const valor of ['jogo', 'video', 'conversa'] as const) {
        await trocarFormato(page, pip, valor)
        await esconderBarra(page)
        await expect(regiao).not.toHaveClass(/com-controles/, { timeout: 5000 })
        const nome = { jogo: 'faixa', video: 'legenda', conversa: 'conversa' }[valor]
        await foto(page, `${nome}-${escuro ? 'escuro' : 'claro'}`)
      }
    }
    await tema(page, false)
    await trocarFormato(page, pip, 'video')
    await mostrarBarra(page)
    await foto(page, 'legenda-claro-com-controles')
  }

  /* Estudo: tocar uma palavra abre o cartão encaixado; salvar ficha de verdade. */
  await trocarFormato(page, pip, 'estudo')
  await expect(regiao).toHaveAttribute('data-layout', 'estudo')
  await expect(pip.getByText('Toque numa palavra para ver o significado, ouvir e salvar.')).toBeVisible()
  await pip.locator('.leg-fala.atual [data-palavra="drinks"]').click()
  const cartao = pip.getByRole('dialog', { name: 'Palavra: drinks' })
  await expect(cartao).toBeVisible()
  await cartao.getByRole('button', { name: 'Salvar no vocabulário' }).click()
  /* O aviso do salvar (o cartão também tem o `status` da nota, no histórico da palavra). */
  await expect(cartao.locator('.leg-cartao-status')).toHaveText(/^"drinks" /, { timeout: 15_000 })
  if (PASTA) {
    for (const escuro of [false, true]) {
      await tema(page, escuro)
      await esconderBarra(page)
      await foto(page, `estudo-${escuro ? 'escuro' : 'claro'}`)
    }
    await tema(page, false)
  }

  /* O tamanho que a pessoa deixou fica guardado por formato. */
  await redimensionar(page, 470, 400)
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('babel.legendasFlutuantes.tamanhos') || '{}').estudo),
    )
    .toEqual({ largura: 470, altura: 400 })

  /* Fechar pela janela: o iframe sai e o botão volta a "abrir". */
  await mostrarBarra(page)
  await pip.getByRole('button', { name: 'Fechar as legendas flutuantes' }).click()
  await expect(page.locator('#pip-simulada')).toHaveCount(0)
  await expect(page.getByTestId('encerrar-captura')).toBeVisible()

  /* Alt+L reabre, no último tamanho do formato sugerido. */
  await page.keyboard.press('Alt+KeyL')
  await expect(page.locator('#pip-simulada')).toHaveCount(1)
  await page.keyboard.press('Alt+KeyL')
  await expect(page.locator('#pip-simulada')).toHaveCount(0)
})

/** O PiP de vídeo simulado: sem Document PiP; o pedido de PiP e a Media Session são falsos. */
function simularPiPDeVideo() {
  delete (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture
  const w = window as unknown as {
    __pinturas: number
    __textos: string[]
    __tratadores: Record<string, (() => void) | null>
    __videoPiP: HTMLVideoElement | null
  }
  w.__pinturas = 0
  w.__textos = []
  w.__tratadores = {}
  w.__videoPiP = null
  Object.defineProperty(document, 'pictureInPictureEnabled', { configurable: true, get: () => true })
  const fillRect = CanvasRenderingContext2D.prototype.fillRect
  CanvasRenderingContext2D.prototype.fillRect = function (...a: [number, number, number, number]) {
    if (a[0] === 0 && a[1] === 0) w.__pinturas++
    return fillRect.apply(this, a)
  }
  const fillText = CanvasRenderingContext2D.prototype.fillText
  CanvasRenderingContext2D.prototype.fillText = function (s: string, x: number, y: number) {
    w.__textos.push(s)
    return fillText.call(this, s, x, y)
  }
  HTMLVideoElement.prototype.requestPictureInPicture = function (this: HTMLVideoElement) {
    w.__videoPiP = this
    Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, get: () => w.__videoPiP })
    this.dispatchEvent(new Event('enterpictureinpicture'))
    return Promise.resolve({ width: 640, height: 180 } as unknown as PictureInPictureWindow)
  }
  document.exitPictureInPicture = () => {
    const v = w.__videoPiP
    w.__videoPiP = null
    v?.dispatchEvent(new Event('leavepictureinpicture'))
    return Promise.resolve()
  }
  const ms = navigator.mediaSession
  ms.setActionHandler = (acao: MediaSessionAction, f: MediaSessionActionHandler | null) => {
    w.__tratadores[acao] = f as (() => void) | null
  }
}

test('PiP de vídeo (Safari): desenha só quando muda, pausa e salva pela Media Session, e para ao sair', async ({
  page,
}) => {
  test.slow()
  await page.addInitScript(simularPiPDeVideo)
  await abrirTela(page, '/capturar')
  await tema(page, true)
  await iniciarCaptura(page)
  await falarTraduzido(page, FRASES.slice(0, 2))

  const botao = botaoDasFlutuantes(page)
  await expect(botao).toHaveAttribute('title', /só para ler/)
  await clicarRobusto(page, botao)
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __videoPiP: unknown }).__videoPiP)).toBe(true)
  expect(
    await page.evaluate(
      () => (window as unknown as { __videoPiP: HTMLVideoElement }).__videoPiP.srcObject instanceof MediaStream,
    ),
  ).toBe(true)
  /* O painel dentro da página NÃO abre junto. */
  await expect(page.locator('#leg-flut')).toHaveCount(0)

  /* O canvas quebra a frase em linhas: confere o texto desenhado inteiro, junto. */
  const textos = () => page.evaluate(() => (window as unknown as { __textos: string[] }).__textos.join(' '))
  const pinturas = () => page.evaluate(() => (window as unknown as { __pinturas: number }).__pinturas)
  await expect.poll(textos, { timeout: 10_000 }).toContain(FRASES[1][0])

  /* Nada muda → nada é pintado (sem laço). */
  const antes = await pinturas()
  await page.waitForTimeout(1500)
  expect(await pinturas(), 'sem fala nova, o canvas não é repintado').toBe(antes)

  /* Fala nova → um quadro novo. */
  await falarTraduzido(page, [FRASES[2]])
  await expect.poll(textos, { timeout: 10_000 }).toContain(FRASES[2][0])
  expect(await pinturas()).toBeGreaterThan(antes)
  if (PASTA) {
    mkdirSync(PASTA, { recursive: true })
    const dado = await page.evaluate(() => {
      const c = document.createElement('canvas')
      const v = (window as unknown as { __videoPiP: HTMLVideoElement }).__videoPiP
      c.width = v.videoWidth || 1280
      c.height = v.videoHeight || 360
      c.getContext('2d')!.drawImage(v, 0, 0)
      return c.toDataURL('image/png')
    })
    writeFileSync(join(PASTA, 'video-quadro.png'), Buffer.from(dado.split(',')[1], 'base64'))
  }

  /* Media Session (Chrome): play/pausa e próxima registrados; pausar desenha o selo. */
  const tratadores = await page.evaluate(() =>
    Object.entries((window as unknown as { __tratadores: Record<string, unknown> }).__tratadores)
      .filter(([, f]) => !!f)
      .map(([k]) => k)
      .sort(),
  )
  expect(tratadores).toEqual(['nexttrack', 'pause', 'play'])
  await page.evaluate(() => (window as unknown as { __tratadores: Record<string, () => void> }).__tratadores.pause())
  await expect.poll(textos).toContain('❚❚ Pausada')
  await page.evaluate(() => (window as unknown as { __tratadores: Record<string, () => void> }).__tratadores.play())

  /* Safari: o botão da janelinha pausa o próprio VÍDEO. A legenda congela (a fala nova espera), e não
     se desenha selo nenhum: o quadro parado nem o mostraria, quem mostra a pausa é o botão nativo. */
  const extra: [string, string] = ['Who is bringing the chairs?', 'Quem traz as cadeiras?']
  await page.evaluate(() => {
    ;(window as unknown as { __textos: string[] }).__textos.length = 0
    ;(window as unknown as { __videoPiP: HTMLVideoElement }).__videoPiP.pause()
  })
  await falarTraduzido(page, [extra])
  await page.waitForTimeout(1500)
  expect(await textos()).not.toContain(extra[0])
  expect(await textos()).not.toContain('Pausada')
  await page.evaluate(() => void (window as unknown as { __videoPiP: HTMLVideoElement }).__videoPiP.play())
  await expect.poll(textos, { timeout: 10_000 }).toContain(extra[0])

  /* "Próxima" salva a última frase: o fichamento responde na página (entrou, repetida ou recusada). */
  await page.evaluate(() =>
    (window as unknown as { __tratadores: Record<string, () => void> }).__tratadores.nexttrack(),
  )
  await expect(page.getByText(`"${extra[0]}"`, { exact: false }).first()).toBeVisible({ timeout: 15_000 })

  /* Sair do PiP: tratadores soltos, e nada mais é pintado. */
  await page.evaluate(() => document.exitPictureInPicture())
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __tratadores: Record<string, unknown> }).__tratadores.pause),
    )
    .toBeNull()
  const depois = await pinturas()
  await falarTraduzido(page, [FRASES[3]])
  await page.waitForTimeout(2500)
  expect(await pinturas(), 'fora do PiP, o canvas não é pintado').toBe(depois)
  await expect(botao).toHaveAttribute('aria-pressed', 'false')
})
