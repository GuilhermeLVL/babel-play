import { devices, expect, type Page, test } from '@playwright/test'

import { clicarRobusto, fecharSobreposicoes, semCapturaDeTela } from './_helpers'

/**
 * A CAPTURA NO CELULAR, COMO O CELULAR É (relato do dono, 2026-09-28: "no celular não consegui
 * capturar áudio nenhum, nem microfone nem áudio do sistema").
 *
 * O que o e2e escondia: o `devices['Pixel 7']` mantém o `getDisplayMedia` do desktop, então a tela
 * se comportava como no computador. Aqui ele é removido (`semCapturaDeTela`) e o microfone é o falso
 * do Chromium (`--use-fake-device-for-media-stream`, permissão já dada). O que se prova:
 *   · UMA folha antes da sessão, com o download do que a escolha baixa (Privado: o nosso modelo;
 *     Rápido: nada) — e não mais duas janelas empilhadas com o relógio andando;
 *   · Privado: o microfone abre (getUserMedia + VAD) e só ENTÃO a sessão começa (botão Parar);
 *   · Rápido: a Web Speech (falsa aqui) abre o áudio, a legenda chega, e nenhum segundo
 *     `getUserMedia` é aberto para o medidor;
 *   · Rápido com erro: a ajuda aparece (em vez de "Ouvindo…" calado) e "Trocar para Privado" abre o
 *     microfone num toque.
 * Os modelos NÃO baixam: os pedidos ao Hugging Face são cortados (a captura abre sem eles; a legenda
 * do Privado não é o objeto deste teste, a abertura do microfone é). A escolha "Rápido ou Privado"
 * é zerada na leitura das preferências e não vai ao banco (a suíte divide um banco só).
 *
 * WebKit (o iPhone) fica de fora: o navegador não está instalado no runner e baixá-lo não foi
 * aprovado. É o próximo passo — o `resume()` do contexto no clique é exatamente o que ele verifica.
 */
const { defaultBrowserType: _navegador, ...pixel7 } = devices['Pixel 7']
test.use({
  ...pixel7,
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
})

test.beforeEach(() => {
  test.skip(test.info().project.name !== 'mobile-375', 'o celular emulado roda uma vez, no projeto móvel')
})

/** A escolha do microfone volta a "nunca respondeu" nesta página, e as gravações de ajuste ficam nela. */
async function semEscolhaGuardada(page: Page) {
  let ultimo: Record<string, unknown> = {}
  await page.route('**/api/settings', async (route) => {
    const pedido = route.request()
    if (pedido.method() === 'GET') {
      const resposta = await route.fetch()
      const s = (await resposta.json().catch(() => ({}))) as Record<string, unknown>
      try {
        const ui = typeof s.ui === 'string' ? (JSON.parse(s.ui) as Record<string, unknown>) : {}
        const p = ui.preferencias as Record<string, unknown> | undefined
        if (p) {
          p.micEscolhido = false
          p.consentimentos = { ...(p.consentimentos as object), reconhecimentoDoNavegador: false }
          p.registroDeConsentimentos = ((p.registroDeConsentimentos as Array<{ chave?: string }>) ?? []).filter(
            (r) => r.chave !== 'reconhecimentoDoNavegador',
          )
        }
        s.ui = JSON.stringify(ui)
      } catch {
        /* ui ilegível: fica como veio */
      }
      ultimo = s
      return route.fulfill({ response: resposta, json: s })
    }
    const corpo = (pedido.postDataJSON() ?? {}) as { ui?: unknown }
    return route.fulfill({ json: { ...ultimo, ui: JSON.stringify(corpo.ui ?? {}) } })
  })
}

/**
 * Uma Web Speech FALSA (o Chromium do runner não alcança o serviço do Google). `ok`: abre o áudio e
 * entrega uma frase; `erro`: falha com `network`, como o celular sem rede. Conta os `getUserMedia`.
 */
async function webSpeechFalsa(page: Page, modo: 'ok' | 'erro') {
  await page.addInitScript((m) => {
    const w = window as unknown as Record<string, unknown>
    w.__getUserMedia = 0
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = (c) => {
      w.__getUserMedia = (w.__getUserMedia as number) + 1
      return original(c)
    }
    type Ev = { error?: string; resultIndex?: number; results?: unknown }
    class Falso {
      lang = ''
      continuous = false
      interimResults = false
      maxAlternatives = 1
      onresult: ((e: Ev) => void) | null = null
      onerror: ((e: Ev) => void) | null = null
      onend: (() => void) | null = null
      onstart: (() => void) | null = null
      onaudiostart: (() => void) | null = null
      onsoundstart: (() => void) | null = null
      onsoundend: (() => void) | null = null
      start() {
        setTimeout(() => {
          this.onstart?.()
          if (m === 'erro') {
            this.onerror?.({ error: 'network' })
            this.onend?.()
            return
          }
          this.onaudiostart?.()
          this.onsoundstart?.()
          setTimeout(() => {
            const r = Object.assign([{ transcript: 'bom dia a todos', confidence: 0.9 }], { isFinal: true })
            this.onresult?.({ resultIndex: 0, results: { length: 1, 0: r } })
          }, 400)
        }, 300)
      }
      stop() {}
      abort() {}
    }
    w.SpeechRecognition = Falso
    w.webkitSpeechRecognition = Falso
  }, modo)
}

async function abrirCaptura(page: Page) {
  await semCapturaDeTela(page)
  await semEscolhaGuardada(page)
  await page.route(/huggingface\.co|\.hf\.co/, (r) => r.abort())
  await page.goto('/capturar')
  await expect(page.getByRole('main')).toBeVisible()
  await fecharSobreposicoes(page)
  await expect(page.getByTestId('aviso-sem-audio-do-sistema')).toContainText('No celular')
}

const iniciar = (page: Page) =>
  page.getByRole('button', { name: /Iniciar a gravação de áudio|Iniciar captura|Começar a gravar/ })
const parar = (page: Page) => page.getByRole('button', { name: /Parar captura|Parar gravação|Parar e salvar/ })

async function escolherNaFolha(page: Page, opcao: 'Rápido' | 'Privado', download: RegExp, confirmar: RegExp) {
  await clicarRobusto(page, iniciar(page))
  const folha = page.getByRole('dialog', { name: 'Como transcrever a sua voz?' })
  await expect(folha).toBeVisible()
  // UMA janela, antes da sessão: nada de relógio andando nem de "Parar" por baixo dela.
  await expect(page.locator('dialog[open]')).toHaveCount(1)
  await expect(parar(page)).toHaveCount(0)
  await folha.getByRole('button', { name: new RegExp(opcao) }).first().click()
  await expect(folha.getByTestId('download-da-escolha')).toHaveText(download)
  await folha.getByRole('button', { name: confirmar }).click()
  await expect(folha).toBeHidden()
}

test.describe('Captura no celular (Pixel 7, sem getDisplayMedia)', () => {
  test('Privado: a folha diz o tamanho do nosso modelo e a sessão começa com o microfone aberto', async ({
    page,
  }) => {
    test.slow()
    await abrirCaptura(page)
    await escolherNaFolha(page, 'Privado', /cerca de \d+ MB/, /Baixar e iniciar/)
    // O microfone abre (getUserMedia + VAD) e só então a sessão existe.
    await expect(parar(page)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('dialog', { name: 'Como transcrever a sua voz?' })).toHaveCount(0)
    await expect(page.getByTestId('ajuda-do-microfone')).toHaveCount(0)
    await expect(page.locator('.relogio').first()).not.toHaveText('00:00', { timeout: 5_000 })
  })

  test('Rápido: nada a baixar, a legenda chega, e nenhum segundo getUserMedia', async ({ page }) => {
    test.slow()
    await webSpeechFalsa(page, 'ok')
    await abrirCaptura(page)
    await escolherNaFolha(page, 'Rápido', /Nada a baixar/, /^Iniciar$/)
    await expect(parar(page)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('bom dia a todos').first()).toBeVisible({ timeout: 10_000 })
    expect(await page.evaluate(() => (window as unknown as { __getUserMedia: number }).__getUserMedia)).toBe(0)
  })

  test('Rápido com erro: a ajuda aparece e "Trocar para Privado" abre o microfone', async ({ page }) => {
    test.slow()
    await webSpeechFalsa(page, 'erro')
    await abrirCaptura(page)
    await escolherNaFolha(page, 'Rápido', /Nada a baixar/, /^Iniciar$/)
    const ajuda = page.getByRole('dialog', { name: 'O modo Rápido precisa de internet' })
    await expect(ajuda).toBeVisible({ timeout: 10_000 })
    // Nada de "Ouvindo…" calado: a sessão não começou.
    await expect(parar(page)).toHaveCount(0)
    await ajuda.getByRole('button', { name: /Trocar para Privado/ }).click()
    await expect(parar(page)).toBeVisible({ timeout: 30_000 })
  })
})
