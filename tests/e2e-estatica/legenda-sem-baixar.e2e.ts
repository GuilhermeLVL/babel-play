import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { capturaPronta, seloDoModelo } from './_captura'

/**
 * "LEGENDA SEM BAIXAR NADA" NA EDIÇÃO ESTÁTICA (plano "Grátis sem travar", A9a).
 *
 * O desktop fraco (o Chromium do runner não tem adaptador WebGPU: `desktop-sem-gpu`) com o Chrome que
 * transcreve e traduz no aparelho. As duas APIs são FALSAS — o runner não tem o serviço de voz nem os
 * pacotes de idioma: uma Web Speech com `processLocally` e `available()` = 'available', e uma
 * Translator API com o par no disco. O `navigator.webdriver` é desligado para a pergunta
 * `available({processLocally})` ser feita (sob automação o app nem pergunta — o Chromium real cai).
 *
 * O caminho medido: com a detecção automática ligada o selo promete um modelo local; a pessoa escolhe
 * o idioma do vídeo em "Idiomas da sessão" e o selo passa a dizer "Reconhecimento do navegador", sem
 * megabytes; a captura começa e o áudio da aba vai ao reconhecedor do navegador; a legenda chega
 * traduzida pelo nativo. E, do começo ao fim, NENHUM byte de Whisper nem de opus-mt: nem os pesos do
 * Hub, nem os workers deles.
 *
 * DESENHO NOVO (09/10/2026). A faixa da oferta ("Legenda sem baixar nada: escolha o idioma do vídeo",
 * `legenda-sem-baixar`), com o idioma a um toque, não existe na tela nova: o idioma se escolhe no
 * diálogo "Idiomas da sessão", aberto pelo chip do par no topo. A garantia (idioma escolhido → o
 * navegador transcreve e traduz, nada nosso baixa) é a mesma; o que saiu foi o convite na tela.
 */
const PASTA = process.env.SCREENSHOTS_ESTATICA || path.join('test-results', 'estatica', 'legenda-sem-baixar')
mkdirSync(PASTA, { recursive: true })

const FALA = 'hello everyone and welcome to today class'
const TRADUCAO = 'olá a todos e bem-vindos à aula de hoje'

async function apisNativasFalsas(page: Page) {
  await page.addInitScript(
    ([fala, traducao]) => {
      try {
        localStorage.setItem('babel_tour_blitz', '1')
      } catch {
        /* storage bloqueado */
      }
      const w = window as unknown as Record<string, unknown>
      // Sob automação o app não pergunta `available({processLocally})` (derruba o Chromium real).
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true })

      type Ev = { error?: string; resultIndex?: number; results?: unknown }
      const lista = (itens: Array<[string, boolean]>) => {
        const r: Record<number, unknown> & { length: number } = { length: itens.length }
        itens.forEach(([t, f], i) => (r[i] = Object.assign([{ transcript: t, confidence: 0.9 }], { isFinal: f })))
        return r
      }
      const registro: Array<{ lang: string; processLocally: boolean; comTrilha: boolean }> = []
      w.__reconhecedores = registro
      class ReconhecedorFalso {
        static available(o: { langs: string[]; processLocally: boolean }) {
          const ok = o.processLocally && o.langs.every((l) => /^(en|pt)/i.test(l))
          return Promise.resolve(ok ? 'available' : 'unavailable')
        }
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
        start(trilha?: unknown) {
          const self = this as unknown as { processLocally: boolean }
          registro.push({
            lang: this.lang,
            processLocally: self.processLocally,
            comTrilha: trilha instanceof MediaStreamTrack,
          })
          setTimeout(() => {
            this.onstart?.()
            this.onaudiostart?.()
            // Como o desktop entrega: um interino e depois o final (compromete na hora).
            setTimeout(
              () =>
                this.onresult?.({ resultIndex: 0, results: lista([[fala.split(' ').slice(0, 3).join(' '), false]]) }),
              300,
            )
            setTimeout(() => this.onresult?.({ resultIndex: 0, results: lista([[fala, true]]) }), 700)
          }, 200)
        }
        stop() {}
        abort() {}
      }
      // A propriedade no PROTÓTIPO é como o app reconhece o Chrome com `processLocally`.
      Object.defineProperty(ReconhecedorFalso.prototype, 'processLocally', { value: false, writable: true })
      w.SpeechRecognition = ReconhecedorFalso
      w.webkitSpeechRecognition = ReconhecedorFalso

      w.Translator = {
        availability: async () => 'available',
        create: async () => ({ translate: async () => traducao }),
      }

      /* A tela compartilhada com áudio: um tom (o áudio da "aba") e um quadro de vídeo. Criado dentro
         do clique, como o seletor do navegador. */
      navigator.mediaDevices.getDisplayMedia = async () => {
        const ctx = new AudioContext()
        const tom = ctx.createOscillator()
        const destino = ctx.createMediaStreamDestination()
        tom.connect(destino)
        tom.start()
        const tela = document.createElement('canvas')
        tela.width = 64
        tela.height = 64
        tela.getContext('2d')?.fillRect(0, 0, 64, 64)
        const video = tela.captureStream(5).getVideoTracks()
        return new MediaStream([...video, ...destino.stream.getAudioTracks()])
      }
    },
    [FALA, TRADUCAO] as const,
  )
}

/** Fecha comemorações e avisos que a primeira visita dispara. */
async function fecharDialogos(page: Page) {
  for (let i = 0; i < 6; i++) {
    const aberto = page.locator('dialog[open]')
    if (!(await aberto.count())) {
      await page.waitForTimeout(300)
      if (!(await aberto.count())) return
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
}

test('desktop fraco: com o idioma do vídeo escolhido a legenda vem do navegador, sem Whisper nem opus-mt', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'o caminho é do computador (o celular não tem o áudio do sistema)')

  /* O que NÃO pode sair: os pesos do Hub (Whisper, Moonshine, opus-mt) e os workers deles. O Hub fica
     bloqueado (o runner não baixa nada), e cada pedido é anotado. */
  const proibidos: string[] = []
  page.on('request', (r) => {
    const u = r.url()
    if (/huggingface\.co\/.+\/resolve\//.test(u) || /\/assets\/(whisperWorker|mtWorker)-/.test(u)) proibidos.push(u)
  })
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
  await apisNativasFalsas(page)

  await page.goto('/capturar')
  const semGpu = await page.evaluate(async () => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    return !gpu || !(await gpu.requestAdapter().catch(() => null))
  })
  test.skip(!semGpu, 'este navegador tem adaptador WebGPU: não é o desktop fraco')
  await capturaPronta(page)
  await fecharDialogos(page)

  // A detecção automática vem ligada: o selo promete um modelo local, com o tamanho.
  const selo = seloDoModelo(page)
  await expect(selo).toContainText(/modelo local · \d+ MB/i, { timeout: 15_000 })
  await page.screenshot({ path: path.join(PASTA, `detectar-${info.project.name}.png`), fullPage: true })

  // O idioma do vídeo, escolhido em "Idiomas da sessão": a detecção desliga e o selo não promete mais um download.
  await page
    .getByTestId('captura-do-prototipo')
    .getByRole('button', { name: /^Detectar/ })
    .click()
  const idiomas = page.getByRole('dialog', { name: 'Idiomas da sessão' })
  await idiomas.getByRole('button', { name: /Idioma do conteúdo/ }).click()
  await idiomas.getByRole('option', { name: 'English (US)' }).click()
  await idiomas.getByRole('button', { name: 'Usar estes idiomas' }).click()
  await expect(idiomas).toBeHidden()
  await expect(selo).toContainText(/reconhecimento do navegador/i)
  await expect(selo).not.toContainText(/MB/)

  // Iniciar: o áudio da aba vai ao reconhecedor do navegador, no aparelho, com o idioma escolhido.
  await page.getByTestId('iniciar-captura').click()
  await expect(page.getByTestId('encerrar-captura')).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __reconhecedores: unknown[] }).__reconhecedores), {
      timeout: 20_000,
    })
    .toContainEqual({ lang: 'en-US', processLocally: true, comTrilha: true })

  // A legenda chega, traduzida pelo tradutor do navegador; gravando, o selo segue dizendo quem ouve.
  await expect(page.getByText(FALA).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(TRADUCAO).first()).toBeVisible({ timeout: 20_000 })
  await expect(selo).toContainText(/reconhecimento do navegador/i)
  await page.screenshot({ path: path.join(PASTA, `legenda-${info.project.name}.png`), fullPage: true })

  // Um respiro para a preparação em segundo plano terminar: nada de Whisper nem de opus-mt.
  await page.waitForTimeout(3000)
  expect(proibidos, 'baixou modelo de transcrição ou de tradução').toEqual([])
})
