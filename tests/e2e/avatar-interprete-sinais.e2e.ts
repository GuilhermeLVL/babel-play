import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { semCapturaDeTela } from './_helpers'
import { abrirPeloMenu, comecarFalando, comFlags, falsos, fase, porToque, semPreferenciasDeAvatar } from './_interprete'

/**
 * A SOLETRAÇÃO NO INTÉRPRETE (M4b ligado ao M4), no app de verdade, com a Web Speech, o tradutor e a voz FALSOS
 * (`_interprete.ts`). Provado aqui: sem `avatar_sinais` nada aparece; com as duas flags a opção surge (desligada por
 * padrão); o avatar-intérprete soletra o NOME PRÓPRIO da fala traduzida SEM atrasar a legenda nem a voz; os dois avisos
 * fixos estão sempre à vista (painel e conversa) e voltam se alguém os tirar; um modelo sem dedos desabilita a opção com
 * o MOTIVO. Sem requisição externa (o modelo vem de `public/avatares`, e o "sem dedos" é um GLB montado aqui).
 * NÃO provado aqui: Document PiP e PiP de vídeo reais, Safari, celular real, pessoas surdas lendo as poses.
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
  page.screenshot({ path: path.join(CAPTURAS, `interprete-sinais-${test.info().project.name}-${nome}.png`) })

const pronto = (page: Page, lado: 'meu' | 'outro') =>
  fase(page).getByTestId(`avatar-${lado}`).locator('[data-avatar-pronto="true"]').first()

/** Liga a opção antes da página abrir (a preferência é local), com a velocidade rápida para caber no teto. */
const comSoletracaoLigada = (page: Page) =>
  page.addInitScript(() => {
    localStorage.setItem('frasy.avatar.interprete.soletrar', '1')
    localStorage.setItem('frasy.avatar.interprete.ritmo', 'rapida')
  })

/** Um GLB mínimo com os ossos da MÃO (a palma) e nenhum dedo: `suportaSinais` responde `sem_dedos`. */
function glbSemDedos(): Buffer {
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ name: 'raiz', children: [1, 2] }, { name: 'hand_r' }, { name: 'hand_l' }],
    }),
  )
  const preenchido = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)])
  const cab = Buffer.alloc(12)
  cab.writeUInt32LE(0x46546c67, 0)
  cab.writeUInt32LE(2, 4)
  cab.writeUInt32LE(12 + 8 + preenchido.length, 8)
  const trecho = Buffer.alloc(8)
  trecho.writeUInt32LE(preenchido.length, 0)
  trecho.writeUInt32LE(0x4e4f534a, 4)
  return Buffer.concat([cab, trecho, preenchido])
}

/** A Document PiP simulada por um `<iframe>` (mesma simulação de `avatar-interprete-pip.e2e.ts`). */
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

test.beforeEach(async ({ page }) => {
  await semPreferenciasDeAvatar(page)
})

test.describe('Soletração no Intérprete', () => {
  test('sem a flag avatar_sinais, nada aparece: nem a opção, nem os avisos', async ({ page }) => {
    await falsos(page)
    await porToque(page)
    await comFlags(page, { avatar_3d: true })
    await comSoletracaoLigada(page) // mesmo com a preferência guardada
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await expect(pronto(page, 'outro')).toBeVisible({ timeout: 60_000 })
    await page.getByTestId('avatares-da-conversa').click()
    const painel = page.getByTestId('painel-dos-avatares')
    await expect(painel).toBeVisible()
    await expect(painel.getByTestId('avatar-soletrar')).toHaveCount(0)
    await expect(painel.getByTestId('avatar-foco-maos')).toBeDisabled()
    await expect(page.locator('[data-aviso-fixo], [data-testid="soletracao-na-conversa"]')).toHaveCount(0)
    await expect(page.getByText(AVISO_1)).toHaveCount(0)
  })

  test('com as duas flags: a opção aparece desligada; ligar mostra os avisos e as escolhas', async ({ page }) => {
    test.slow()
    await falsos(page, { atrasoDaTraducaoMs: 30_000 })
    await porToque(page)
    await comFlags(page, { avatar_3d: true, avatar_sinais: true })
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await expect(pronto(page, 'outro')).toBeVisible({ timeout: 60_000 })
    await page.getByTestId('avatares-da-conversa').click()
    const painel = page.getByTestId('painel-dos-avatares')
    const opcao = painel.getByTestId('avatar-soletrar')
    await expect(opcao).toBeEnabled({ timeout: 30_000 })
    await expect(opcao).not.toBeChecked() // desligada por padrão
    await expect(painel.getByText('Soletrar nomes e palavras sem sinal')).toBeVisible()
    await expect(painel.getByTestId('avatar-foco-maos')).toBeEnabled()
    // desligada: nenhum aviso nem quadro na conversa
    await expect(page.locator('[data-aviso-fixo]')).toHaveCount(0)

    await opcao.check()
    expect(await page.evaluate(() => localStorage.getItem('frasy.avatar.interprete.soletrar'))).toBe('1')
    // os DOIS avisos fixos no painel e junto ao avatar, e as escolhas (alfabeto, velocidade, canhoto)
    await expect(painel.getByText(AVISO_1)).toBeVisible()
    await expect(painel.getByText(AVISO_2)).toBeVisible()
    await expect(painel.getByTestId('avatar-alfabeto-auto')).toBeChecked()
    await expect(painel.getByTestId('avatar-ritmo-normal')).toBeChecked()
    await expect(painel.getByTestId('avatar-espelhar')).not.toBeChecked()
    await painel.getByTestId('avatar-alfabeto-asl').check()
    await painel.getByTestId('avatar-espelhar').check()
    await painel.getByTestId('avatar-ritmo-lenta').check()
    expect(await page.evaluate(() => localStorage.getItem('frasy.avatar.interprete.alfabeto'))).toBe('asl')
    expect(await page.evaluate(() => localStorage.getItem('frasy.avatar.interprete.espelhar'))).toBe('1')
    await foto(page, '1-painel')
    await painel.getByTestId('avatar-alfabeto-auto').check()
    await page.keyboard.press('Escape')
    const conversa = fase(page).getByTestId('soletracao-na-conversa')
    await expect(conversa).toBeVisible()
    await expect(conversa.getByText(AVISO_1)).toBeVisible()
    await expect(conversa.getByText(AVISO_2)).toBeVisible()

    // Os avisos NÃO saem: apagados ou escondidos por fora, voltam.
    await page.evaluate(() => {
      document.querySelectorAll('[data-testid="soletracao-na-conversa"] [data-aviso-fixo]').forEach((e) => e.remove())
    })
    await expect(conversa.locator('[data-aviso-fixo]')).toHaveCount(2)
    await page.evaluate(() => {
      document
        .querySelectorAll<HTMLElement>('[data-testid="soletracao-na-conversa"] [data-avisos-fixos]')
        .forEach((e) => (e.style.display = 'none'))
    })
    await expect(conversa.getByText(AVISO_2)).toBeVisible()
  })

  test('soletra o nome próprio da fala traduzida sem atrasar a legenda nem a voz', async ({ page }) => {
    test.slow()
    await falsos(page, { atrasoDaFalaMs: 14_000, fraseEmPt: FRASE })
    await porToque(page)
    await comFlags(page, { avatar_3d: true, avatar_sinais: true })
    await comSoletracaoLigada(page)
    // marca o instante em que cada coisa aparece: a legenda, a voz e o quadro das mãos
    await page.addInitScript(() => {
      const t: Record<string, number> = {}
      ;(window as unknown as { __t: Record<string, number> }).__t = t
      const id = setInterval(() => {
        const w = window as unknown as { __lidas?: unknown[] }
        if (!t.legenda && document.body?.innerText.includes('[trad] fale com Conceição')) t.legenda = performance.now()
        if (!t.voz && (w.__lidas?.length ?? 0) > 0) t.voz = performance.now()
        if (!t.palco && document.querySelector('[data-testid="soletracao-palco"]')) t.palco = performance.now()
        if (!t.letra && document.querySelector('[data-sinais-estado="soletrando"]')) t.letra = performance.now()
        if (t.legenda && t.voz && t.palco && t.letra) clearInterval(id)
      }, 15)
    })
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await expect(pronto(page, 'outro')).toBeVisible({ timeout: 60_000 })
    await expect(fase(page).getByTestId('soletracao-na-conversa')).toBeVisible({ timeout: 30_000 })

    // a legenda (a fala e a tradução) está na tela
    const outro = fase(page).getByTestId('interprete-outro')
    const traducao = outro.locator('.int-traducao', { hasText: '[trad] fale com Conceição amanhã' })
    await expect(traducao).toBeVisible({ timeout: 30_000 })

    // as mãos soletram o nome, com a palavra atual destacada e o resto marcado como não soletrado
    const palco = fase(page).getByTestId('soletracao-palco')
    await expect(palco).toBeVisible({ timeout: 30_000 })
    await expect(palco.locator('[data-sinais-estado="soletrando"]')).toBeVisible({ timeout: 60_000 })
    // No computador (colunas) a palavra atual fica embaixo do idioma, com a letra; no celular/frente a frente o texto é
    // compacto e a palavra aparece como mini legenda sobre o quadro das mãos.
    const emColunas = (await page.locator('[data-layout="computador"]').count()) > 0
    if (emColunas) {
      const atual = fase(page).getByTestId('soletracao-atual')
      await expect(atual.locator('[data-palavra-atual]')).toHaveText('Conceição')
      await expect(atual.getByTestId('soletracao-rotulo')).toHaveText(/^Soletrando: /)
      // o nome soletrado NÃO conta como "não soletrado", nem as palavras comuns (a voz e a legenda as levam):
      // só aparece o aviso quando um NOME não coube no teto de tempo
      await expect(atual.getByTestId('soletracao-nao-soletradas')).toHaveCount(0)
    } else {
      await expect(fase(page).getByTestId('soletracao-atual-mini').locator('[data-palavra-atual]')).toHaveText(
        'Conceição',
      )
    }
    // enquanto soletra, a legenda do Intérprete segue à vista
    await expect(traducao).toBeVisible()
    await foto(page, '2-soletrando')

    // a voz acabou muito antes (a fala falsa dura 350 ms); a legenda e a voz vieram ANTES das mãos
    const t = await page.evaluate(() => (window as unknown as { __t: Record<string, number> }).__t)
    expect(t.legenda).toBeGreaterThan(0)
    expect(t.voz).toBeGreaterThan(0)
    expect(t.palco).toBeGreaterThan(0)
    // o palco das mãos já está à vista (em repouso); o que vem DEPOIS da legenda e da voz é a soletração em si
    expect(t.letra).toBeGreaterThan(0)
    expect(t.legenda).toBeLessThanOrEqual(t.letra)
    expect(t.voz).toBeLessThanOrEqual(t.letra)
    // a voz leu a tradução inteira (a soletração não mexe nela)
    const lidas = await page.evaluate(() => (window as unknown as { __lidas: Array<{ texto: string }> }).__lidas)
    expect(lidas.map((l) => l.texto)).toEqual(['[trad] fale com Conceição amanhã'])

    // os avisos continuam durante e depois; termina sozinha e o quadro some
    await expect(fase(page).getByTestId('soletracao-na-conversa').getByText(AVISO_1)).toBeVisible()
    // o palco das mãos continua (agora em repouso, "aguardando"); só a soletração acabou
    await expect(palco).toHaveAttribute('data-palco-estado', 'aguardando', { timeout: 40_000 })
    await expect(fase(page).getByTestId('soletracao-na-conversa').getByText(AVISO_2)).toBeVisible()
    await expect(traducao).toBeVisible()
  })

  test('fala sem nome próprio não soletra nada (mas os avisos seguem)', async ({ page }) => {
    test.slow()
    await falsos(page, { atrasoDaFalaMs: 12_000 })
    await porToque(page)
    await comFlags(page, { avatar_3d: true, avatar_sinais: true })
    await comSoletracaoLigada(page)
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await expect(pronto(page, 'outro')).toBeVisible({ timeout: 60_000 })
    await expect(fase(page).getByTestId('interprete-outro').getByText('[trad] bom dia a todos')).toBeVisible({
      timeout: 30_000,
    })
    // sem nome a soletrar, as mãos ficam em repouso (nada é soletrado) e os avisos seguem
    await expect(fase(page).getByTestId('soletracao-palco')).toHaveAttribute('data-palco-estado', 'aguardando')
    await expect(fase(page).locator('[data-sinais-estado="soletrando"]')).toHaveCount(0)
    await expect(fase(page).getByTestId('soletracao-na-conversa').getByText(AVISO_1)).toBeVisible()
  })

  test('modelo sem dedos: a opção e "só mãos" ficam desabilitadas, com o motivo', async ({ page }) => {
    test.slow()
    await page.route('**/avatares/colecao/bullidan.vrm', (r) =>
      r.fulfill({ status: 200, contentType: 'model/gltf-binary', body: glbSemDedos() }),
    )
    await falsos(page, { atrasoDaTraducaoMs: 30_000 })
    await porToque(page)
    await comFlags(page, { avatar_3d: true, avatar_sinais: true })
    await comSoletracaoLigada(page)
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await page.getByTestId('avatares-da-conversa').click()
    const painel = page.getByTestId('painel-dos-avatares')
    await expect(painel.getByTestId('avatar-soletrar-motivo')).toHaveText('Este avatar não tem dedos articulados.', {
      timeout: 60_000,
    })
    await expect(painel.getByTestId('avatar-soletrar')).toBeDisabled()
    await expect(painel.getByTestId('avatar-soletrar')).not.toBeChecked()
    await expect(painel.getByTestId('avatar-foco-maos')).toBeDisabled()
    await expect(painel.getByTestId('avatar-maos-motivo')).toHaveText('Este avatar não tem dedos articulados.')
    await foto(page, '3-sem-dedos')
    // esconde tudo: sem suporte não há avisos nem quadro na conversa
    await expect(page.locator('[data-aviso-fixo]')).toHaveCount(0)
    await expect(page.getByTestId('soletracao-na-conversa')).toHaveCount(0)
  })
  test('no Document PiP: os dois avisos fixos sempre e, soletrando, as mãos com a palavra atual (layout do PiP intacto)', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop-1280', 'a janela flutuante é do computador')
    test.slow()
    await page.addInitScript(simularDocumentPiP)
    await falsos(page, { atrasoDaFalaMs: 16_000, fraseEmPt: FRASE })
    await porToque(page)
    await comFlags(page, { avatar_3d: true, avatar_sinais: true })
    await comSoletracaoLigada(page)
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await expect(pronto(page, 'outro')).toBeVisible({ timeout: 60_000 })
    await expect(fase(page).getByTestId('soletracao-na-conversa')).toBeVisible({ timeout: 30_000 })

    await page.keyboard.press('Alt+KeyL')
    const pip = page.frameLocator('#pip-simulada')
    await expect(pip.getByRole('region', { name: 'Legendas flutuantes' })).toBeVisible()
    // os avisos fixos estão na janela mesmo sem soletrar nada ainda, e o avatar do PiP é o círculo de sempre
    const avisos = pip.getByTestId('avisos-da-soletracao-no-pip')
    await expect(avisos.getByText(AVISO_1)).toBeVisible()
    await expect(avisos.getByText(AVISO_2)).toBeVisible()
    await expect(pip.getByTestId('avatar-no-pip')).toBeVisible()
    await foto(page, '7-pip-avisos')

    // chega a fala com o nome: as mãos entram no lugar do círculo, com a palavra atual destacada
    const palco = pip.getByTestId('soletracao-no-pip')
    await expect(palco).toBeVisible({ timeout: 60_000 })
    await expect(palco.locator('[data-sinais-estado="soletrando"]')).toBeVisible({ timeout: 60_000 })
    await expect(palco.locator('[data-palavra-atual]')).toHaveText('Conceição')
    // o canvas é do documento do iframe, e a janela continua com a legenda
    expect(
      await page.evaluate(() => {
        const f = document.getElementById('pip-simulada') as HTMLIFrameElement
        const c = f.contentDocument!.querySelector('[data-testid="soletracao-no-pip"] canvas') as HTMLCanvasElement
        return c.ownerDocument === f.contentDocument
      }),
    ).toBe(true)
    await expect(pip.locator('.leg-fala').first()).toBeVisible({ timeout: 20_000 })
    // o layout não estoura: nada passa da largura da janela
    expect(
      await page.evaluate(() => {
        const f = document.getElementById('pip-simulada') as HTMLIFrameElement
        const d = f.contentDocument!.documentElement
        return d.scrollWidth <= f.clientWidth + 1
      }),
    ).toBe(true)
    await foto(page, '8-pip-soletrando')
    // fechar: tudo sai
    await page.keyboard.press('Alt+KeyL')
    await expect(page.locator('#pip-simulada')).toHaveCount(0)
  })
})

test.describe('Celular (390 x 844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'mobile-375', 'o celular de 390 roda uma vez, no projeto móvel')
  })

  test('as metades com a soletração: avisos legíveis, nada estoura, o painel cabe', async ({ page }) => {
    test.slow()
    await semCapturaDeTela(page)
    await falsos(page, { atrasoDaFalaMs: 14_000, fraseEmPt: FRASE })
    await porToque(page)
    await comFlags(page, { avatar_3d: true, avatar_sinais: true })
    await comSoletracaoLigada(page)
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await expect(pronto(page, 'outro')).toBeVisible({ timeout: 60_000 })
    await expect(fase(page).getByTestId('soletracao-na-conversa')).toBeVisible({ timeout: 30_000 })
    await foto(page, '4-celular-avisos')
    await expect(fase(page).getByTestId('soletracao-palco').locator('[data-sinais-estado="soletrando"]')).toBeVisible({
      timeout: 60_000,
    })
    await foto(page, '5-celular-soletrando')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByTestId('avatares-da-conversa').click()
    const painel = page.getByTestId('painel-dos-avatares')
    await expect(painel.getByTestId('avatar-soletrar')).toBeChecked()
    await foto(page, '6-celular-painel')
    const caixa = await painel.locator('.int-folha-corpo').boundingBox()
    expect(caixa!.x).toBeGreaterThanOrEqual(0)
    expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(390)
  })
})
