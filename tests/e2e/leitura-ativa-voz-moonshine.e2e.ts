import { expect, type Page, test } from '@playwright/test'

import { abrirTela, clicarRobusto } from './_helpers'

/**
 * A LEITURA EM VOZ ALTA COM O MOONSHINE NO APARELHO (openspec `leitura-ativa-com-moonshine`, 4.1). O navegador NÃO
 * tem `SpeechRecognition` (como o Firefox), as flags `leitura_ativa` e `leitura_voz_local` são ligadas pelo próprio
 * teste (`page.route` em `/api/flags`), o microfone e o AudioWorklet são falsos (`window.__pcm` empurra blocos de PCM)
 * e o worker do modelo é SIMULADO (responde com a frase da vez). Lê "At the Market" pulando "six" e prova: o aviso de
 * download antes de qualquer pedido de microfone, as marcas ("O Frasy não ouviu bem") e que nenhuma requisição leva
 * áudio nem chama rota de IA/STT.
 */

const FRASES_DO_MERCADO = [
  'it is saturday morning',
  'lia and her dad go to the market',
  'the market is big',
  'there is a lot of fruit',
  'lia likes apples',
  // "six" pulada:
  'she picks red apples',
  'her dad takes bread milk and water',
  'then lia sees her friend ben',
  'ben has a small dog',
  'the dog is very happy',
  'lia is happy too',
  'at home lia and her dad eat bread and apples',
  'it is a good morning',
]

async function ligarFlags(page: Page) {
  await page.route('**/api/flags', (r) =>
    r.fulfill({ json: { flags: { leitura_ativa: { ligada: true }, leitura_voz_local: { ligada: true } } } }),
  )
}

/** Sem Web Speech; microfone, AudioContext e worker do modelo falsos. */
async function aparelhoSemWebSpeech(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    w.SpeechRecognition = undefined
    w.webkitSpeechRecognition = undefined
    w.__microfones = 0
    w.__fraseDaVez = ''
    let no: { port: { onmessage: ((e: { data: Float32Array }) => void) | null } } | null = null

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          ;(w.__microfones as number)++
          return { getTracks: () => [{ stop() {} }] }
        },
      },
    })
    class ContextoFalso {
      sampleRate = 16000
      state = 'running'
      audioWorklet = { addModule: async () => {} }
      createMediaStreamSource() {
        return { connect() {} }
      }
      async resume() {}
      async close() {}
    }
    w.AudioContext = ContextoFalso
    w.AudioWorkletNode = class {
      port: { onmessage: ((e: { data: Float32Array }) => void) | null } = { onmessage: null }
      constructor() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- o teste empurra PCM pelo nó que o app criou
        no = this
      }
    }
    const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
    /** Empurra `ms` de áudio (blocos de 100 ms) com amplitude `amp`; `espera` ms reais entre blocos. */
    w.__pcm = async (ms: number, amp: number, espera = 25) => {
      for (let i = 0; i < ms / 100; i++) {
        no?.port.onmessage?.({ data: new Float32Array(1600).fill(amp) })
        await esperar(espera)
      }
    }

    /* O worker do modelo: carrega na hora e responde com a frase da vez. */
    class WorkerFalso {
      onmessage: ((m: { data: Record<string, unknown> }) => void) | null = null
      onerror: ((e: unknown) => void) | null = null
      postMessage(m: Record<string, unknown>) {
        setTimeout(() => {
          if (m.type === 'load') {
            this.onmessage?.({ data: { type: 'progress', progress: 1, label: 'modelo' } })
            this.onmessage?.({ data: { type: 'ready' } })
          } else if (m.type === 'transcribe') {
            /* O texto cresce com o áudio recebido (a fala dura ~2 s): parcial curto = só o começo da frase. */
            const palavras = String(w.__fraseDaVez).split(' ')
            const segundos = (m.pcm as Float32Array).length / 16000
            /* O parcial nunca fecha a frase (só o final fecha): o que sobra da fala depois de uma frase concluída
               pelo parcial seria o RABO dela, que este simulador não sabe transcrever. */
            const teto = m.prioridade === 'parcial' ? palavras.length - 1 : palavras.length
            const quantas = Math.min(teto, Math.ceil((segundos / 2.2) * palavras.length))
            const tx = palavras.slice(0, quantas).join(' ')
            this.onmessage?.({ data: { type: 'result', id: m.id, text: tx } })
          }
        }, 5)
      }
      terminate() {}
      addEventListener() {}
      removeEventListener() {}
    }
    w.Worker = WorkerFalso
  })
}

test.describe('Leitura em voz alta com o Moonshine local', () => {
  test('lê "At the Market" pulando "six" sem Web Speech: aviso de download, marcas e nada de voz na rede', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await ligarFlags(page)
    await aparelhoSemWebSpeech(page)
    const pedidos: Array<{ url: string; corpo: string }> = []
    page.on('request', (r) => pedidos.push({ url: r.url(), corpo: r.postData() ?? '' }))
    await page.route(/huggingface\.co|\.hf\.co/, (r) => r.abort())

    await abrirTela(page, '/leitura')
    const catalogo = page.getByTestId('leitura-ativa-catalogo')
    await clicarRobusto(page, catalogo.locator('[data-texto="a1-no-mercado"]').last())
    await expect(page).toHaveURL(/\/leitura\/a1-no-mercado$/)

    const tela = page.getByTestId('leitura-ativa')
    const modo = tela.getByRole('radio', { name: /Ler em voz alta/ })
    await expect(modo).not.toHaveAttribute('aria-disabled', 'true')
    await modo.click()
    await tela.getByRole('button', { name: 'Começar' }).click()
    /* O aviso (com o tamanho do download) vem ANTES do pedido de microfone. */
    const aviso = page.getByTestId('aviso-do-microfone')
    await expect(aviso).toBeVisible()
    await expect(aviso.getByTestId('aviso-do-download')).toContainText('MB')
    expect(await page.evaluate(() => (window as unknown as { __microfones: number }).__microfones)).toBe(0)
    await aviso.getByRole('button', { name: 'Baixar e ligar o microfone' }).click()
    await expect(page.getByTestId('estado-do-microfone')).toHaveAttribute('data-mic', 'ouvindo', { timeout: 20_000 })

    for (const frase of FRASES_DO_MERCADO) {
      await page.evaluate(async (f) => {
        const w = window as unknown as { __fraseDaVez: string; __pcm(ms: number, amp: number): Promise<void> }
        w.__fraseDaVez = f
        await w.__pcm(300, 0.0005) // silêncio antes (o VAD aprende o ruído)
        await w.__pcm(2000, 0.1) // fala
        await w.__pcm(700, 0.0005) // pausa: fecha o trecho e dispara o final
      }, frase)
    }

    const texto = page.getByTestId('leitura-ativa-texto')
    const six = texto.getByRole('button', { name: 'six', exact: true })
    await expect(six).toHaveAttribute('data-leitura', 'pulada')
    await expect(six).toHaveAttribute('aria-description', 'O Frasy não ouviu bem')
    await expect(texto.getByRole('button', { name: 'red', exact: true })).toHaveAttribute('data-leitura', 'lida')
    await expect(texto.locator('.la-palavra[data-leitura="pulada"]')).toHaveCount(1)
    await expect(page.getByTestId('estado-do-microfone')).toHaveAttribute('data-mic', 'desligado')

    /* Nada da voz sai: nenhum corpo de requisição carrega áudio nem a transcrição, nenhuma rota de IA/STT. */
    for (const p of pedidos) {
      expect(p.url).not.toMatch(/\/api\/(stt|ai|transcri|ia)/)
      expect(p.corpo).not.toContain('saturday morning')
      expect(p.corpo.length).toBeLessThan(100_000)
    }
  })

  test('com a flag desligada, "Ler em voz alta" fica esmaecido e nada é pedido', async ({ page }) => {
    await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: { leitura_ativa: { ligada: true } } } }))
    await aparelhoSemWebSpeech(page)
    await abrirTela(page, '/leitura/a1-no-mercado')
    const modo = page.getByTestId('leitura-ativa').getByRole('radio', { name: /Ler em voz alta/ })
    await expect(modo).toHaveAttribute('aria-disabled', 'true')
    expect(await page.evaluate(() => (window as unknown as { __microfones: number }).__microfones)).toBe(0)
  })
})
