import { expect, type Page, test } from '@playwright/test'

import { iniciarCaptura } from './_captura'
import { abrirTela } from './_helpers'

/**
 * A ESCRITA DO CHINÊS NA LEGENDA (mudança `escrita-do-chines`, tarefa 3.1: conferir com `zh-TW` no navegador).
 *
 * O pipeline de fala converte o texto de um trecho em chinês para a escrita da variante escolhida
 * (`src/lib/captura/escritaChinesa.ts`): tradicional para `zh-TW`, simplificada para `zh-CN`, e NUNCA mexe
 * em outro idioma. Aqui a captura começa de verdade (mídia falsa do Chromium), o STT do gateway devolve o
 * texto "do provedor" e a legenda mostra o que o app escolheu escrever. As falas passam por `__simSystem`
 * (o caminho real do trecho: parcial → final → `naEscritaEscolhida`), e não por `__simFalas`, que escreve o
 * estado direto e pularia a conversão. O idioma que o sistema ouve é o ALVO (`targetLanguage`).
 */
test.use({
  locale: 'zh-TW',
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--auto-select-desktop-capture-source=Entire screen',
    ],
  },
})

const SIMPLIFICADO = '我喜欢学习中文。今天天气很好'
const TRADICIONAL = '我喜歡學習中文。今天天氣很好'

test.beforeEach(({ browserName }, info) => {
  test.skip(browserName !== 'chromium', 'o harness de captura usa mídia falsa do Chromium')
  test.skip(info.project.name === 'tablet-768', 'a escrita do chinês não depende de largura intermediária')
})

/** Abre a captura com o idioma ouvido pelo sistema = `alvo`, e o STT do gateway devolvendo `texto` em `lang`. */
async function falarNoSistema(page: Page, alvo: string, texto: string, lang: string) {
  // Nenhum modelo é baixado: o que se mede é a escrita, não o reconhecimento.
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const resposta = await route.fetch()
    const s = (await resposta.json()) as Record<string, unknown>
    const ui = typeof s.ui === 'string' ? (JSON.parse(s.ui) as Record<string, unknown>) : {}
    ui.captureSourceLang = 'pt-BR'
    s.ui = JSON.stringify(ui)
    s.targetLanguage = alvo
    return route.fulfill({ response: resposta, json: s })
  })
  await abrirTela(page, '/capturar')
  await iniciarCaptura(page)
  await page.evaluate(
    async ([t, l]) => {
      const w = window as unknown as {
        __babelGateway: { stt: { transcribePcm: () => Promise<unknown> } }
        __simSystem: (pcm: Float32Array, n: number) => Promise<unknown>
      }
      w.__babelGateway.stt.transcribePcm = async () => ({ text: t, language: l, engine: 'sim' })
      await w.__simSystem(
        new Float32Array(32000).map((_, i) => Math.sin(i / 20) * 0.3),
        1,
      )
    },
    [texto, lang] as const,
  )
}

const legenda = (page: Page) => page.getByTestId('captura-do-prototipo')

test('zh-TW: o provedor devolve simplificado e a legenda mostra tradicional', async ({ page }) => {
  test.slow()
  await falarNoSistema(page, 'zh-TW', SIMPLIFICADO, 'zh')
  await expect(legenda(page).getByText(TRADICIONAL)).toBeVisible({ timeout: 15_000 })
  // Nenhum dos caracteres simplificados que o provedor mandou sobra na tela.
  await expect(legenda(page).getByText(/[欢习气]/)).toHaveCount(0)
})

test('zh-CN: o provedor devolve tradicional e a legenda mostra simplificado', async ({ page }) => {
  test.slow()
  await falarNoSistema(page, 'zh-CN', TRADICIONAL, 'zh')
  await expect(legenda(page).getByText(SIMPLIFICADO)).toBeVisible({ timeout: 15_000 })
  await expect(legenda(page).getByText(/[歡習氣]/)).toHaveCount(0)
})

test('outro idioma passa intacto: japonês com kanji simplificável não vira tradicional em zh-TW', async ({ page }) => {
  test.slow()
  // 学習 tem 学 (simplificado e kanji): a conversão para tradicional o trocaria por 學.
  await falarNoSistema(page, 'zh-TW', '日本語を学習します', 'ja')
  await expect(legenda(page).getByText('日本語を学習します')).toBeVisible({ timeout: 15_000 })
  await expect(legenda(page).getByText(/學/)).toHaveCount(0)
})
