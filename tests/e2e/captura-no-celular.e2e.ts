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
 *     Rápido: o tradutor, que ele também usa) — e não mais duas janelas empilhadas com o relógio andando;
 *   · Privado: o microfone abre (getUserMedia + VAD) e só ENTÃO a sessão começa (botão Parar);
 *   · Rápido: a Web Speech (falsa aqui) abre o áudio, a legenda chega, e nenhum segundo
 *     `getUserMedia` é aberto para o medidor;
 *   · Rápido com erro: a ajuda aparece (em vez de "Ouvindo…" calado) e "Trocar para Privado" abre o
 *     microfone num toque;
 *   · Rápido como o Chrome do Android (relato do dono, 2026-09-29: "a legenda duplica" e "a tradução
 *     não funciona"): finais que crescem em índices novos, sem parcial, e o reenvio do último depois
 *     do religar viram UM balão; e, com o tradutor baixando, a fala espera a tradução (sem o
 *     original entre parênteses nem a faixa de falha) e a recebe quando ele fica pronto. O tradutor
 *     é o do navegador, falso (`tradutorFalso`): o opus-mt não baixa aqui (Hugging Face cortado).
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

/** A frase do modo `android`, dita UMA vez (crescendo como o Chrome do Android a entrega). */
const FRASE_ANDROID = 'eu gosto de estudar inglês'

/**
 * Uma Web Speech FALSA (o Chromium do runner não alcança o serviço do Google). `ok`: abre o áudio e
 * entrega uma frase; `erro`: falha com `network`, como o celular sem rede; `android`: a frase chega
 * como o Chrome do Android a manda — cada hipótese que cresce é um FINAL num índice novo, confiança
 * 0, nenhum parcial, e depois do religar o último final vem de novo. Conta os `getUserMedia`.
 */
async function webSpeechFalsa(page: Page, modo: 'ok' | 'erro' | 'android') {
  await page.addInitScript(
    ([m, frase]) => {
      const w = window as unknown as Record<string, unknown>
      w.__getUserMedia = 0
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = (c) => {
        w.__getUserMedia = (w.__getUserMedia as number) + 1
        return original(c)
      }
      type Ev = { error?: string; resultIndex?: number; results?: unknown }
      /** A lista de resultados como o navegador a entrega: `[texto, final]` → `{ length, 0: [...] }`. */
      const lista = (itens: Array<[string, boolean]>) => {
        const r: Record<number, unknown> & { length: number } = { length: itens.length }
        itens.forEach(([t, f], i) => (r[i] = Object.assign([{ transcript: t, confidence: 0 }], { isFinal: f })))
        return r
      }
      let voltas = 0
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
            if (m === 'android') {
              voltas++
              const palavras = frase.split(' ')
              if (voltas === 1) {
                // Finais crescendo, cada um num índice novo; o onend (silêncio) e o religar.
                const passos = [1, 2, palavras.length].map((n) => palavras.slice(0, n).join(' '))
                passos.forEach((_, i) =>
                  setTimeout(
                    () => {
                      const itens = passos.slice(0, i + 1).map((t) => [t, true] as [string, boolean])
                      this.onresult?.({ resultIndex: i, results: lista(itens) })
                    },
                    300 + i * 500,
                  ),
                )
                setTimeout(() => this.onend?.(), 2500)
              } else if (voltas === 2) {
                // A volta nova reenvia o último final.
                setTimeout(() => this.onresult?.({ resultIndex: 0, results: lista([[frase, true]]) }), 400)
              }
              return
            }
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
    },
    [modo, FRASE_ANDROID] as const,
  )
}

/**
 * O tradutor DO NAVEGADOR, falso (a Translator API): o pacote do par "baixa" em ~4 s (com o
 * `downloadprogress`) e então traduz como `[trad] texto`. Enquanto baixa, a cadeia só tem motores
 * carregando — a fala tem de ficar PENDENTE, e não virar o original entre parênteses.
 */
async function tradutorFalso(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    let pronto = false
    w.Translator = {
      availability: async () => (pronto ? 'available' : 'downloadable'),
      create: (o: {
        monitor?: (m: { addEventListener(t: string, f: (e: { loaded: number }) => void): void }) => void
      }) =>
        new Promise((resolver) => {
          const ouvintes: Array<(e: { loaded: number }) => void> = []
          o.monitor?.({ addEventListener: (_t, f) => ouvintes.push(f) })
          let p = 0
          const id = setInterval(() => {
            p += 0.25
            for (const f of ouvintes) f({ loaded: p })
            if (p < 1) return
            clearInterval(id)
            pronto = true
            resolver({ translate: async (t: string) => `[trad] ${t}` })
          }, 1000)
        }),
    }
  })
}

async function abrirCaptura(page: Page) {
  await semCapturaDeTela(page)
  await semEscolhaGuardada(page)
  await page.route(/huggingface\.co|\.hf\.co/, (r) => r.abort())
  /* O Bergamot (pt→en no aparelho, A9b) vem do PRÓPRIO domínio e fica pronto em menos de 1 s: sem
     isto a frase em português seria traduzida por ele na hora, e o teste do tradutor do navegador
     que ainda baixa não teria o que medir. Fora, como o opus-mt do Hub logo acima. */
  await page.route(/\/modelos\/bergamot\/|bergamot-translator-worker/, (r) => r.abort())
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
  // As comemorações de um banco usado entram por cima a qualquer momento: o clique robusto as fecha.
  await clicarRobusto(page, folha.getByRole('button', { name: new RegExp(opcao) }).first())
  await expect(folha.getByTestId('download-da-escolha')).toHaveText(download)
  await clicarRobusto(page, folha.getByRole('button', { name: confirmar }))
  await expect(folha).toBeHidden()
}

test.describe('Captura no celular (Pixel 7, sem getDisplayMedia)', () => {
  test('Privado: a folha diz o tamanho do nosso modelo e a sessão começa com o microfone aberto', async ({ page }) => {
    test.slow()
    await abrirCaptura(page)
    await escolherNaFolha(page, 'Privado', /cerca de \d+ MB/, /Baixar e iniciar/)
    // O microfone abre (getUserMedia + VAD) e só então a sessão existe.
    await expect(parar(page)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('dialog', { name: 'Como transcrever a sua voz?' })).toHaveCount(0)
    await expect(page.getByTestId('ajuda-do-microfone')).toHaveCount(0)
    await expect(page.locator('.cel-aovivo').first()).not.toHaveText('00:00', { timeout: 5_000 })
  })

  test('Rápido: a folha diz o tamanho do tradutor, a legenda chega, e nenhum segundo getUserMedia', async ({
    page,
  }) => {
    test.slow()
    await webSpeechFalsa(page, 'ok')
    await abrirCaptura(page)
    // O celular não tem o tradutor do navegador: o nosso baixa, e a folha diz isso (o Rápido também traduz).
    await escolherNaFolha(page, 'Rápido', /baixa o tradutor, de cerca de \d+ MB/, /Baixar e iniciar/)
    await expect(parar(page)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('bom dia a todos').first()).toBeVisible({ timeout: 10_000 })
    expect(await page.evaluate(() => (window as unknown as { __getUserMedia: number }).__getUserMedia)).toBe(0)
  })

  test('Rápido com erro: a ajuda aparece e "Trocar para Privado" abre o microfone', async ({ page }) => {
    test.slow()
    await webSpeechFalsa(page, 'erro')
    await abrirCaptura(page)
    await escolherNaFolha(page, 'Rápido', /baixa o tradutor/, /Baixar e iniciar/)
    const ajuda = page.getByRole('dialog', { name: 'O modo Rápido precisa de internet' })
    await expect(ajuda).toBeVisible({ timeout: 10_000 })
    // Nada de "Ouvindo…" calado: a sessão não começou.
    await expect(parar(page)).toHaveCount(0)
    await ajuda.getByRole('button', { name: /Trocar para Privado/ }).click()
    await expect(parar(page)).toBeVisible({ timeout: 30_000 })
  })

  test('Rápido como o Chrome do Android: UM balão por fala, e a tradução chega quando o tradutor fica pronto', async ({
    page,
  }) => {
    test.slow()
    await webSpeechFalsa(page, 'android')
    await tradutorFalso(page)
    await abrirCaptura(page)
    // O tradutor do navegador ainda vai baixar ('downloadable'): o nosso conta na folha.
    await escolherNaFolha(page, 'Rápido', /baixa o tradutor/, /Baixar e iniciar/)
    await expect(parar(page)).toBeVisible({ timeout: 15_000 })
    const baloes = page.locator('.fala').filter({ hasText: 'gosto' })
    await expect(baloes.filter({ hasText: FRASE_ANDROID })).toHaveCount(1, { timeout: 10_000 })
    // Enquanto o pacote baixa, a fala ESPERA a tradução: nada de "(original)" nem da faixa de falha.
    await expect(page.getByTestId('traducao-pendente').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`(${FRASE_ANDROID})`)).toHaveCount(0)
    // Pronto o tradutor, a tradução chega ao MESMO balão.
    await expect(baloes.getByText(`[trad] ${FRASE_ANDROID}`)).toBeVisible({ timeout: 15_000 })
    // O reenvio depois do religar não abriu outro balão.
    await expect(baloes).toHaveCount(1)
    await expect(page.getByText(/Tradução indisponível agora/)).toHaveCount(0)
  })
})

/** Foto de conferência, só quando pedida (`FOTOS_DIR`): a maquete aprovada contra a tela de verdade. */
async function foto(page: Page, nome: string) {
  const dir = process.env.FOTOS_DIR
  if (dir) await page.screenshot({ path: `${dir}/celular-${nome}.png` })
}

/**
 * A TELA DO CELULAR (maquete aprovada pelo dono, 2026-09-29): o microfone grande embaixo, as opções
 * numa folha, e gravando a conversa ocupa a tela (a barra de abas some); tocar num balão abre a
 * folha da frase, a palavra abre a folha dela, e a fala tocada mostra os atalhos.
 */
test.describe('Captura no celular: a tela para uma mão só', () => {
  test('pronto: microfone grande, par num controle só e as opções numa folha', async ({ page }) => {
    test.slow()
    await abrirCaptura(page)
    await expect(page.getByTestId('captura-no-celular')).toBeVisible()
    await expect(iniciar(page)).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Trocar os idiomas' }).or(page.locator('span.cel-troca')),
    ).toBeVisible()
    await fecharSobreposicoes(page)
    await foto(page, '1-pronto')
    await clicarRobusto(page, page.getByRole('button', { name: 'Opções da captura' }))
    const opcoes = page.getByRole('dialog', { name: 'Opções da captura' })
    await expect(opcoes).toBeVisible()
    await expect(opcoes.getByRole('button', { name: /Idiomas/ })).toBeVisible()
    await expect(opcoes.getByRole('switch', { name: 'Manter a tela acesa' })).toBeVisible()
    await foto(page, '5-opcoes')
    await page.keyboard.press('Escape')
    await expect(opcoes).toBeHidden()
  })

  test('gravando: a conversa é a tela, e o balão abre a frase e a palavra', async ({ page }) => {
    test.slow()
    await webSpeechFalsa(page, 'ok')
    await abrirCaptura(page)
    await escolherNaFolha(page, 'Rápido', /baixa o tradutor/, /Baixar e iniciar/)
    await expect(parar(page)).toBeVisible({ timeout: 15_000 })
    // A barra de abas do app some enquanto grava; o aviso do bipe (Android) diz de onde vem o som.
    await expect(page.locator('.dock')).toBeHidden()
    await expect(page.getByTestId('aviso-do-bipe')).toBeVisible()
    const frase = 'The weather is supposed to be great this weekend.'
    await page.evaluate(
      (t) => (window as unknown as { __simFalas: (t: string[]) => number }).__simFalas(t),
      ['So what are you planning for the weekend?', frase],
    )
    const balao = page.locator('.fala[data-tocavel]').filter({ hasText: 'supposed' })
    await expect(balao).toBeVisible({ timeout: 10_000 })
    await foto(page, '2-gravando')

    // No rótulo de quem fala: o meio do balão pode ser uma palavra (botão da folha DA PALAVRA).
    await balao.locator('.quem').click()
    const folha = page.getByRole('dialog', { name: 'Ações da frase' })
    await expect(folha).toBeVisible()
    for (const nome of ['Ouvir', 'Ouvir devagar', 'Repetir eu', 'Copiar'])
      await expect(folha.getByRole('button', { name: nome, exact: true })).toBeVisible()
    await foto(page, '3-frase')

    await folha.getByRole('button', { name: 'weather', exact: true }).click()
    const palavra = page.getByRole('dialog', { name: 'Palavra: weather' })
    await expect(palavra).toBeVisible()
    await expect(palavra.getByRole('button', { name: 'Guardar' })).toBeVisible()
    await foto(page, '4-palavra')
    await palavra.getByRole('button', { name: 'Voltar à frase' }).click()
    await expect(page.getByRole('dialog', { name: 'Ações da frase' })).toBeVisible()
    await page.keyboard.press('Escape')

    // A fala tocada fica em foco, com os atalhos de ouvir.
    await expect(balao.getByRole('button', { name: 'Devagar' })).toBeVisible()
    await clicarRobusto(page, parar(page))
    await expect(page.getByRole('dialog', { name: /Encerrar a sessão/ })).toBeVisible()
  })
})
