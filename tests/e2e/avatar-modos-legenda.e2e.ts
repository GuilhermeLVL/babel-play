import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { iniciarCaptura } from './_captura'
import { abrirTela } from './_helpers'
import { comFlags, semPreferenciasDeAvatar } from './_interprete'

/**
 * O AVATAR NO MODO LEGENDAR (flag `avatar_3d`), no app de verdade e SEM microfone real: a captura roda com o dispositivo
 * falso do Chromium e as falas vêm da bancada (`window.__simFalas`), como nas outras suítes da captura; a voz é uma
 * `speechSynthesis` de mentira que fala por 2,5 s (para dar tempo de ver o estado "falando"). Provado, nos três tamanhos:
 * sem a flag nada aparece; com ela o botão "Avatar" (ícone + rótulo, 44 px) fica na faixa de controles; a dica da primeira
 * vez é dispensável e lembrada; ligado, a faixa de presença mostra o estado em TEXTO (repouso, ouvindo, lendo em voz alta)
 * e a legenda de texto fica SEMPRE; o painel é o mesmo do Livro; desligar em um toque; a escolha é lembrada; o modo
 * economia tira o avatar. NÃO provado: a janela flutuante em si (o Document PiP não existe no Chromium sem cabeça; o que
 * ela recebe é provado em `tests/avatar-modos-legenda.test.tsx`), a voz real e a boca.
 *
 * Capturas: `$AVATAR_CAPTURAS` (padrão `tests/e2e/__capturas__/`, fora do git).
 */
const CAPTURAS = process.env.AVATAR_CAPTURAS || path.join(process.cwd(), 'tests', 'e2e', '__capturas__')
mkdirSync(CAPTURAS, { recursive: true })

test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--auto-select-desktop-capture-source=Entire screen',
    ],
  },
})

const foto = (page: Page, nome: string) =>
  page.screenshot({ path: path.join(CAPTURAS, `modos-legenda-${test.info().project.name}-${nome}.png`) })

const FRASES: Array<[string, string]> = [
  ['The report was ambiguous, so we checked it twice.', 'O relatório era ambíguo, então conferimos duas vezes.'],
]
const falarTraduzido = (page: Page) =>
  page.evaluate(
    (ps) =>
      (window as unknown as { __simFalas: (t: string[], f?: string, l?: string, tr?: string[]) => number }).__simFalas(
        ps.map((p) => p[0]),
        undefined,
        'en',
        ps.map((p) => p[1]),
      ),
    FRASES,
  )

/** Uma voz que "fala" por 2,5 s e registra o que foi lido. */
function vozDeMentira() {
  const lidas: string[] = []
  let falando = false
  class Utterance {
    text: string
    lang = ''
    rate = 1
    pitch = 1
    volume = 1
    voice: unknown = null
    onstart: (() => void) | null = null
    onend: (() => void) | null = null
    onerror: ((e: unknown) => void) | null = null
    onboundary = null
    constructor(text: string) {
      this.text = text
    }
  }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true })
  const synth = {
    get speaking() {
      return falando
    },
    paused: false,
    pending: false,
    onvoiceschanged: null,
    getVoices: () => [
      { name: 'Teste en', lang: 'en-US', localService: true, default: true, voiceURI: 'Teste en' },
      { name: 'Teste pt', lang: 'pt-BR', localService: true, default: false, voiceURI: 'Teste pt' },
    ],
    addEventListener: () => {},
    removeEventListener: () => {},
    cancel: () => {
      falando = false
    },
    pause: () => {},
    resume: () => {},
    speak: (u: Utterance) => {
      lidas.push(u.text)
      falando = true
      setTimeout(() => u.onstart?.(), 30)
      setTimeout(() => {
        falando = false
        u.onend?.()
      }, 2500)
    },
  }
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
  ;(window as unknown as { __lidas: string[] }).__lidas = lidas
}

test.beforeEach(async ({ page }) => {
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
  await page.route(/\/modelos\/bergamot\/|bergamot-translator-worker/, (r) => r.abort())
  await page.addInitScript(vozDeMentira)
  await semPreferenciasDeAvatar(page)
})

const presenca = (page: Page) => page.getByTestId('presenca-da-legenda')
const botao = (page: Page) => page.getByTestId('botao-avatar-legenda')

test('sem a flag nada aparece na captura', async ({ page }) => {
  test.slow()
  await comFlags(page, {})
  await abrirTela(page, '/capturar')
  await expect(page.getByTestId('iniciar-captura')).toBeVisible({ timeout: 60_000 })
  await foto(page, '0-sem-flag-em-repouso')
  await iniciarCaptura(page)
  await falarTraduzido(page)
  await expect(page.locator('.q-linha-da-fala .q-o').last()).toHaveText(FRASES[0][0], { timeout: 20_000 })
  await expect(botao(page)).toHaveCount(0)
  await expect(presenca(page)).toHaveCount(0)
  await expect(page.getByTestId('dica-avatar-legenda')).toHaveCount(0)
  await foto(page, '0-sem-flag')
})

test('com avatar_3d: botão, dica, presença com estados em texto, legenda sempre, painel, economia, desligar e lembrar', async ({
  page,
}) => {
  test.slow()
  await comFlags(page, { avatar_3d: true })
  await abrirTela(page, '/capturar')
  await expect(page.getByTestId('iniciar-captura')).toBeVisible({ timeout: 60_000 })

  // O botão "Avatar": ícone + rótulo e alvo de 44 px na faixa de controles.
  await expect(botao(page)).toBeVisible()
  await expect(botao(page)).toContainText('Avatar')
  await expect(botao(page)).toHaveAttribute('aria-pressed', 'false')
  const caixa = (await botao(page).boundingBox())!
  expect(caixa.height).toBeGreaterThanOrEqual(44)
  expect(caixa.width).toBeGreaterThanOrEqual(44)
  await expect(presenca(page)).toHaveCount(0)

  // A dica da primeira vez: faixa discreta, sem pop-up; dispensar a esconde e fica lembrada.
  const dica = page.getByTestId('dica-avatar-legenda')
  await expect(dica).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await foto(page, '1-dica')
  await dica.getByRole('button', { name: 'Ligar o avatar' }).click()
  await expect(dica).toHaveCount(0)

  // Ligado antes de gravar: presença em repouso, com o estado em texto.
  await expect(botao(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(presenca(page)).toBeVisible()
  await expect(presenca(page)).toHaveAttribute('data-estado', 'parado')
  await expect(page.getByTestId('avatar-da-legenda-estado')).toHaveText('Em repouso')
  await expect(presenca(page).getByTestId('avatar-do-modo').locator('[data-avatar-pronto="true"]')).toBeVisible({
    timeout: 60_000,
  })

  await foto(page, '1b-ligado-em-repouso')

  // Gravando: ouvindo. A legenda de texto está SEMPRE ali.
  await iniciarCaptura(page)
  await expect(presenca(page)).toHaveAttribute('data-estado', 'ouvindo')
  await expect(page.getByTestId('avatar-da-legenda-estado')).toHaveText('Ouvindo')
  await falarTraduzido(page)
  await expect(page.locator('.q-linha-da-fala .q-o').last()).toHaveText(FRASES[0][0], { timeout: 20_000 })
  await expect(page.locator('.q-linha-da-fala').last()).toContainText('ambíguo')
  await foto(page, '2-ouvindo')

  // Abrir a frase e ouvir: o avatar "fala" (estado em texto) enquanto a voz lê, depois volta a ouvir.
  await page.locator('.q-linha-da-fala').last().click()
  await page.getByRole('button', { name: 'Ouvir', exact: true }).first().click()
  await expect(presenca(page)).toHaveAttribute('data-estado', 'falando')
  await expect(page.getByTestId('avatar-da-legenda-estado')).toHaveText('Lendo em voz alta')
  await foto(page, '3-falando')
  await expect(presenca(page)).toHaveAttribute('data-estado', 'ouvindo', { timeout: 10_000 })

  // O painel é o mesmo do Livro, com a opção da janela flutuante; Esc fecha.
  await page.keyboard.press('Escape')
  await page.getByTestId('ajustes-avatar-legenda').click()
  const painel = page.getByTestId('painel-do-avatar')
  await expect(painel).toBeVisible()
  await expect(page.getByTestId('avm-no-pip')).toBeChecked()
  await expect(page.getByTestId('avm-tamanho-g')).toBeVisible()
  await foto(page, '4-painel')
  await page.getByTestId('avm-quem-outro').check()
  await page.keyboard.press('Escape')
  await expect(painel).toHaveCount(0)
  await expect(presenca(page))
    .toHaveAttribute('data-dono', 'outro')
    .catch(() => {})
  await expect(presenca(page).getByTestId('avatar-do-modo')).toHaveAttribute('data-dono', 'outro')

  // Economia: tira o avatar e a legenda segue.
  await page.getByTestId('ajustes-avatar-legenda').click()
  await page.getByTestId('avm-economia').click()
  await expect(presenca(page)).toHaveCount(0)
  await expect(page.locator('.q-linha-da-fala').last()).toContainText('ambíguo')
  await expect(botao(page)).toHaveAttribute('aria-pressed', 'false')
  await botao(page).click() // um toque traz de volta
  await expect(presenca(page)).toBeVisible()

  // Desligar em um toque e lembrar.
  await botao(page).click()
  await expect(presenca(page)).toHaveCount(0)
  await botao(page).click()
  await expect(presenca(page)).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('iniciar-captura')).toBeVisible({ timeout: 60_000 })
  await expect(botao(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(presenca(page)).toBeVisible()
  await expect(page.getByTestId('dica-avatar-legenda')).toHaveCount(0)
})
