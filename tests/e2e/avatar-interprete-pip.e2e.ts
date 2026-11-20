import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { ladoDoAvatarNoQuadro } from '../../src/core/legendas/janelaFlutuante'
import { DIMENSOES_DO_QUADRO, retanguloDoAvatar } from '../../src/lib/legendas/legendaEmVideo'
import { abrirPeloMenu, comecarFalando, comFlags, falsos, fase, porToque, semPreferenciasDeAvatar } from './_interprete'

/**
 * O AVATAR NA LEGENDA FLUTUANTE (M4), com o Intérprete aberto e Alt+L.
 *
 * O que é FALSO: a janela do Document PiP é a de um `<iframe>` (mesma simulação de `legenda-pip.e2e.ts`: a janela de
 * verdade não se fotografa em headless) e o PiP de vídeo é o `<video>` que o app já cria, com `requestPictureInPicture`
 * simulado. O que é REAL: o app monta o avatar por portal DENTRO do documento do iframe (canvas, WebGL e laço de quadros
 * dele), a ponte copia o canvas WebGL oculto para o canvas 2D que vira o vídeo, e tudo é descartado ao fechar.
 * NÃO provado: Document PiP de verdade (janela nativa), Safari e Firefox reais.
 */
const CAPTURAS = process.env.AVATAR_CAPTURAS || path.join(process.cwd(), 'tests', 'e2e', '__capturas__')
mkdirSync(CAPTURAS, { recursive: true })

test.use({
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  },
  permissions: ['microphone'],
})
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'a janela flutuante é do computador')
  test.slow()
  await semPreferenciasDeAvatar(page)
})

const foto = (page: Page, nome: string) => page.screenshot({ path: path.join(CAPTURAS, `interprete-pip-${nome}.png`) })

/** A Document PiP simulada: o iframe do tamanho pedido, com o `pagehide` ao fechar. */
function simularDocumentPiP() {
  const api = {
    requestWindow({ width, height }: { width: number; height: number }) {
      const f = document.createElement('iframe')
      f.id = 'pip-simulada'
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
      return Promise.resolve(w)
    },
  }
  Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: api })
}

/** O PiP de vídeo simulado (Safari): sem Document PiP; o pedido de PiP é falso e o vídeo é o do app. */
function simularPiPDeVideo() {
  delete (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture
  const w = window as unknown as { __videoPiP: HTMLVideoElement | null }
  w.__videoPiP = null
  Object.defineProperty(document, 'pictureInPictureEnabled', { configurable: true, get: () => true })
  HTMLVideoElement.prototype.requestPictureInPicture = function (this: HTMLVideoElement) {
    w.__videoPiP = this
    Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, get: () => w.__videoPiP })
    this.dispatchEvent(new Event('enterpictureinpicture'))
    return Promise.resolve({ width: 720, height: 960 } as unknown as PictureInPictureWindow)
  }
  document.exitPictureInPicture = () => {
    const v = w.__videoPiP
    w.__videoPiP = null
    v?.dispatchEvent(new Event('leavepictureinpicture'))
    return Promise.resolve()
  }
}

async function prepararInterprete(page: Page, atrasoDaTraducaoMs = 600) {
  await falsos(page, { atrasoDaTraducaoMs })
  await porToque(page)
  await comFlags(page, { avatar_3d: true })
  await abrirPeloMenu(page)
  await comecarFalando(page, /Falar em Português/)
  await expect(fase(page).getByTestId('avatar-meu').locator('[data-avatar-pronto="true"]')).toBeVisible({
    timeout: 60_000,
  })
}

test.describe('Avatar no Document PiP (janela simulada por iframe)', () => {
  test('renderer novo DENTRO da janela, estados que acompanham a conversa, dispose ao fechar e a página segue com o dela', async ({
    page,
  }) => {
    await page.addInitScript(simularDocumentPiP)
    await prepararInterprete(page)

    await page.keyboard.press('Alt+KeyL')
    const pip = page.frameLocator('#pip-simulada')
    await expect(pip.getByRole('region', { name: 'Legendas flutuantes' })).toBeVisible()
    const avatarNoPip = pip.getByTestId('avatar-no-pip')
    await expect(avatarNoPip).toBeVisible()
    await expect(avatarNoPip.locator('[data-avatar-pronto="true"]')).toBeVisible({ timeout: 60_000 })

    // O canvas é do documento do iframe (renderer NOVO, não o da página movido), e a página mantém os dela.
    const info = await page.evaluate(() => {
      const f = document.getElementById('pip-simulada') as HTMLIFrameElement
      const c = f.contentDocument!.querySelector('[data-testid="avatar-no-pip"] canvas') as HTMLCanvasElement
      ;(window as unknown as { __canvasDoPip: HTMLCanvasElement }).__canvasDoPip = c
      return {
        doIframe: c.ownerDocument === f.contentDocument,
        daPagina: document.querySelectorAll('[data-testid^="avatar-"] canvas').length,
      }
    })
    expect(info.doIframe).toBe(true)
    expect(info.daPagina).toBe(2)
    await foto(page, '1-document-pip')

    // O texto da legenda continua presente ao lado do avatar.
    await expect(pip.locator('.leg-fala').first()).toBeVisible({ timeout: 20_000 })

    // O avatar do PiP segue a conversa: o do meu lado fala/pensa enquanto a tradução vem.
    const estados = new Set<string>()
    const fim = Date.now() + 12_000
    while (Date.now() < fim) {
      const e = await avatarNoPip.locator('[data-avatar-estado]').getAttribute('data-avatar-estado')
      if (e) estados.add(e)
      if (estados.has('pensando') && estados.size >= 2) break
      await page.waitForTimeout(100)
    }
    expect([...estados].some((e) => e === 'pensando' || e === 'ouvindo' || e === 'falando')).toBe(true)

    // Guarda de webglcontextlost: perder o contexto da janela NÃO derruba nada, e o avatar volta ou cai na foto/iniciais.
    const erros: string[] = []
    page.on('pageerror', (e) => erros.push(e.message))
    await page.evaluate(() => {
      const c = (window as unknown as { __canvasDoPip: HTMLCanvasElement }).__canvasDoPip
      const gl = c.getContext('webgl2')
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    })
    await expect(pip.getByRole('region', { name: 'Legendas flutuantes' })).toBeVisible()
    await expect(avatarNoPip.locator('[data-avatar-fallback="contexto_perdido"]')).toBeVisible({ timeout: 10_000 })
    expect(erros).toEqual([])

    // Fechar: o iframe sai, o canvas da janela é descartado (contexto perdido de propósito) e a página segue com o dela.
    await page.keyboard.press('Alt+KeyL')
    await expect(page.locator('#pip-simulada')).toHaveCount(0)
    const depois = await page.evaluate(() => {
      const c = (window as unknown as { __canvasDoPip: HTMLCanvasElement }).__canvasDoPip
      return { conectado: c.isConnected }
    })
    expect(depois.conectado).toBe(false)
    await expect(fase(page).getByTestId('avatar-meu').locator('[data-avatar-pronto="true"]')).toBeVisible()
    await expect(fase(page).getByTestId('avatar-outro').locator('[data-avatar-pronto="true"]')).toBeVisible()
  })

  test('sem a flag o PiP é o de sempre: nenhum avatar, nenhum envoltório', async ({ page }) => {
    await page.addInitScript(simularDocumentPiP)
    await falsos(page)
    await porToque(page)
    await comFlags(page, {})
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await page.keyboard.press('Alt+KeyL')
    const pip = page.frameLocator('#pip-simulada')
    await expect(pip.getByRole('region', { name: 'Legendas flutuantes' })).toBeVisible()
    await expect(pip.locator('[data-pip-com-avatar], [data-testid="avatar-no-pip"], canvas')).toHaveCount(0)
  })
})

test.describe('Avatar no PiP de vídeo (Safari simulado)', () => {
  test('a ponte copia o canvas WebGL oculto para o quadro do vídeo, e a legenda segue desenhada', async ({ page }) => {
    await page.addInitScript(simularPiPDeVideo)
    await prepararInterprete(page)

    await page.keyboard.press('Alt+KeyL')
    await expect.poll(() => page.evaluate(() => !!(window as unknown as { __videoPiP: unknown }).__videoPiP)).toBe(true)
    const ponte = page.getByTestId('avatar-ponte-do-video')
    await expect(ponte).toBeAttached()
    await expect(ponte.locator('[data-avatar-pronto="true"]')).toBeAttached({ timeout: 60_000 })
    // O canvas WebGL da ponte está fora da tela.
    const caixa = await ponte.boundingBox()
    expect(caixa!.x).toBeLessThan(0)

    const circulo = retanguloDoAvatar({
      formato: 'conversa',
      avatar: { lado: ladoDoAvatarNoQuadro('conversa', DIMENSOES_DO_QUADRO.conversa) },
    })
    // O quadro do vídeo tem o avatar: a região do círculo (conversa: centrado no alto) não é um fundo liso.
    await expect
      .poll(
        () =>
          page.evaluate(async (r) => {
            const v = (window as unknown as { __videoPiP: HTMLVideoElement }).__videoPiP
            const c = document.createElement('canvas')
            c.width = v.videoWidth || 720
            c.height = v.videoHeight || 960
            c.getContext('2d')!.drawImage(v, 0, 0)
            // O miolo do círculo do avatar (a região quadrada inscrita), onde o fundo liso não passa de 1-2 cores.
            const m = Math.round(r.lado * 0.15)
            const d = c.getContext('2d')!.getImageData(r.x + m, r.y + m, r.lado - 2 * m, r.lado - 2 * m).data
            const unicas = new Set<number>()
            for (let i = 0; i < d.length; i += 4 * 17) unicas.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])
            return unicas.size
          }, circulo),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(8)
    await page.evaluate(() => {
      const v = (window as unknown as { __videoPiP: HTMLVideoElement }).__videoPiP
      const c = document.createElement('canvas')
      c.width = v.videoWidth || 720
      c.height = v.videoHeight || 960
      c.getContext('2d')!.drawImage(v, 0, 0)
      ;(window as unknown as { __quadro: string }).__quadro = c.toDataURL('image/png')
    })
    const dado = await page.evaluate(() => (window as unknown as { __quadro: string }).__quadro)
    const { writeFileSync } = await import('node:fs')
    writeFileSync(path.join(CAPTURAS, 'interprete-pip-2-video-quadro.png'), Buffer.from(dado.split(',')[1], 'base64'))

    // Fechar o PiP de vídeo remove a ponte.
    await page.keyboard.press('Alt+KeyL')
    await expect(ponte).toHaveCount(0)
  })
})
