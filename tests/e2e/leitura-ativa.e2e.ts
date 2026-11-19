import { expect, type Page, test } from '@playwright/test'

import { abrirTela, clicarRobusto } from './_helpers'

/**
 * A LEITURA ATIVA (`/leitura`; openspec `leitura-ativa-textos-simples`, specs `leitura-ativa-voz-alta` e
 * `leitura-ativa-perguntas-e-pratica`). A flag `leitura_ativa` é ligada pelo próprio teste (`page.route` em
 * `/api/flags`), e a fala é SIMULADA do jeito dos outros e2e (`_interprete.ts`): uma `SpeechRecognition` falsa no
 * lugar da do navegador, que aqui também conhece `processLocally` (o reconhecimento no aparelho) e emite parciais
 * que crescem palavra a palavra, como o Chrome. O teste lê "At the Market" inteiro pulando "six" e prova: o destaque
 * avançando, "six" marcada como "O Frasy não ouviu bem" (pontilhado, nunca erro), o microfone só depois do toque, as
 * três perguntas (segunda tentativa, pular, resposta mostrada) e o resumo com a palavra para praticar. E que nada da
 * voz sai: nenhuma requisição leva a transcrição, nenhuma rota de IA/STT é chamada, nada da fala fica guardado.
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

async function ligarFlag(page: Page, ligada: boolean) {
  await page.route('**/api/flags', (r) =>
    r.fulfill({ json: { flags: ligada ? { leitura_ativa: { ligada: true } } : {} } }),
  )
}

/** Uma `SpeechRecognition` falsa com `processLocally`: `window.__falar(frase)` emite os parciais e o final. */
async function reconhecedorFalso(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    type Resultado = { 0: { transcript: string; confidence: number }; isFinal: boolean; length: number }
    const iniciados: Array<{ processLocally: boolean; lang: string }> = []
    w.__iniciados = iniciados
    w.__ativo = null
    class Falso {
      lang = ''
      continuous = false
      interimResults = false
      maxAlternatives = 1
      onresult: ((e: unknown) => void) | null = null
      onerror: ((e: unknown) => void) | null = null
      onend: (() => void) | null = null
      onstart: (() => void) | null = null
      onaudiostart: (() => void) | null = null
      onsoundstart: (() => void) | null = null
      onsoundend: (() => void) | null = null
      resultados: Resultado[] = []
      parado = false
      start() {
        iniciados.push({
          processLocally: (this as unknown as { processLocally: boolean }).processLocally,
          lang: this.lang,
        })
        setTimeout(() => {
          if (this.parado) return
          this.onstart?.()
          this.onaudiostart?.()
          w.__ativo = this
        }, 50)
      }
      emitir(texto: string, final: boolean) {
        const r = Object.assign([{ transcript: texto, confidence: 0.9 }], { isFinal: final }) as unknown as Resultado
        const ultimo = this.resultados[this.resultados.length - 1]
        if (ultimo && !ultimo.isFinal) this.resultados[this.resultados.length - 1] = r
        else this.resultados.push(r)
        const results: Record<string, unknown> = { length: this.resultados.length }
        this.resultados.forEach((x, i) => (results[i] = x))
        this.onresult?.({ resultIndex: 0, results })
      }
      stop() {
        if (this.parado) return
        this.parado = true
        if (w.__ativo === this) w.__ativo = null
        setTimeout(() => this.onend?.(), 0)
      }
      abort() {
        this.stop()
      }
    }
    /* No PROTÓTIPO: é assim que o app pergunta se o navegador reconhece no aparelho (`temReconhecimentoLocal`). */
    Object.defineProperty(Falso.prototype, 'processLocally', { value: false, writable: true, configurable: true })
    w.SpeechRecognition = Falso
    w.webkitSpeechRecognition = Falso
    const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
    w.__falar = async (frase: string) => {
      for (let i = 0; i < 100 && !w.__ativo; i++) await esperar(20)
      const rec = w.__ativo as Falso | null
      if (!rec) throw new Error('nenhum reconhecedor ativo')
      const palavras = frase.split(' ')
      for (let k = 1; k <= palavras.length; k++) {
        rec.emitir(palavras.slice(0, k).join(' '), false)
        await esperar(15)
      }
      rec.emitir(frase, true)
      await esperar(30)
    }
  })
}

test.describe('Leitura ativa', () => {
  test('com a flag desligada, /leitura leva ao início e nada da tela aparece', async ({ page }) => {
    await ligarFlag(page, false)
    await page.goto('/leitura/a1-no-mercado')
    await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
    await expect(page).toHaveURL(/\/(app\/?)?$/, { timeout: 15_000 })
    await expect(page.getByTestId('leitura-ativa')).toHaveCount(0)
    await expect(page.getByTestId('leitura-ativa-catalogo')).toHaveCount(0)
  })

  test('lê "At the Market" em voz alta pulando "six": destaque, marca, perguntas e resumo', async ({ page }) => {
    test.setTimeout(120_000)
    await ligarFlag(page, true)
    await reconhecedorFalso(page)
    const pedidos: Array<{ url: string; corpo: string }> = []
    page.on('request', (r) => pedidos.push({ url: r.url(), corpo: r.postData() ?? '' }))

    await abrirTela(page, '/leitura')
    const catalogo = page.getByTestId('leitura-ativa-catalogo')
    await expect(catalogo.getByRole('heading', { name: 'Leituras', level: 1 })).toBeVisible()
    await clicarRobusto(page, catalogo.locator('[data-texto="a1-no-mercado"]').last())
    await expect(page).toHaveURL(/\/leitura\/a1-no-mercado$/)

    /* Antes de ler: escolhe a voz alta. O aviso vem antes de qualquer reconhecedor ligado. */
    const tela = page.getByTestId('leitura-ativa')
    await tela.getByRole('radio', { name: /Ler em voz alta/ }).click()
    await tela.getByRole('button', { name: 'Começar' }).click()
    const aviso = page.getByTestId('aviso-do-microfone')
    await expect(aviso).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __iniciados: unknown[] }).__iniciados.length)).toBe(0)
    await aviso.getByRole('button', { name: 'Ligar o microfone' }).click()
    await expect(page.getByTestId('estado-do-microfone')).toHaveAttribute('data-mic', 'ouvindo')

    const palavra = (i: number) => page.getByTestId('leitura-ativa-texto').locator(`.la-palavra[data-i="${i}"]`)
    /* O destaque avança: "It" é a atual; lida "it", a atual passa a "is". */
    await expect(palavra(0)).toHaveAttribute('data-leitura', 'atual')
    await page.evaluate(async () => {
      const w = window as unknown as { __ativo: { emitir(t: string, f: boolean): void } | null }
      for (let i = 0; i < 100 && !w.__ativo; i++) await new Promise((r) => setTimeout(r, 20))
      w.__ativo!.emitir('it', false)
    })
    await expect(palavra(0)).toHaveAttribute('data-leitura', 'lida')
    await expect(palavra(1)).toHaveAttribute('data-leitura', 'atual')

    for (const frase of FRASES_DO_MERCADO) {
      await page.evaluate((f) => (window as unknown as { __falar(f: string): Promise<void> }).__falar(f), frase)
    }

    /* "six" ficou "não ouvi bem" (pontilhado neutro, com o texto), e as vizinhas lidas. */
    const six = page.getByTestId('leitura-ativa-texto').getByRole('button', { name: 'six', exact: true })
    await expect(six).toHaveAttribute('data-leitura', 'pulada')
    await expect(six).toHaveAttribute('aria-description', 'O Frasy não ouviu bem')
    await expect(
      page.getByTestId('leitura-ativa-texto').getByRole('button', { name: 'red', exact: true }),
    ).toHaveAttribute('data-leitura', 'lida')
    await expect(page.getByTestId('leitura-ativa-texto').locator('.la-palavra[data-leitura="pulada"]')).toHaveCount(1)
    /* O texto inteiro lido: o microfone desliga sozinho. Todo reconhecedor aberto foi o local, em inglês. */
    await expect(page.getByTestId('estado-do-microfone')).toHaveAttribute('data-mic', 'desligado')
    const iniciados = await page.evaluate(
      () => (window as unknown as { __iniciados: Array<{ processLocally: boolean; lang: string }> }).__iniciados,
    )
    expect(iniciados.length).toBeGreaterThan(1) // uma sessão limpa por frase (o áudio de cada frase é solto)
    for (const r of iniciados) expect(r).toEqual({ processLocally: true, lang: 'en-US' })

    /* Tocar na palavra pulada abre o cartão com "Praticar esta palavra no fim". */
    await six.click()
    await expect(page.getByTestId('praticar-no-fim')).toBeVisible()
    /* O cartão tem fundo de verdade (não se mistura com o texto atrás) e borda. */
    const corDoCartao = await page
      .locator('.cartao-palavra')
      .evaluate((el) => ({ fundo: getComputedStyle(el).backgroundColor, texto: getComputedStyle(el).color }))
    expect(corDoCartao.fundo).not.toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/)
    expect(corDoCartao.fundo).not.toBe(corDoCartao.texto)
    await page.locator('.cartao-palavra').getByRole('button', { name: 'Fechar' }).click()
    await expect(page.getByTestId('praticar-no-fim')).toHaveCount(0)

    /* As três perguntas. */
    await page.getByTestId('terminei').click()
    const pergunta = page.getByTestId('leitura-ativa-pergunta')
    await expect(pergunta.getByRole('heading', { name: 'Where do Lia and her dad go?' })).toBeVisible()
    await expect(pergunta.getByText('Aonde a Lia e o pai dela vão?')).toBeVisible() // Nível 1: bilíngue
    await pergunta.getByRole('button', { name: 'To school' }).click()
    await expect(pergunta.getByText('Quase. Releia o texto e tente de novo.')).toBeVisible()
    await expect(pergunta.getByRole('button', { name: 'To school' })).toHaveCount(0)
    await pergunta.getByRole('button', { name: 'To the market' }).click()
    await expect(pergunta.getByText('Isso!')).toBeVisible()
    await pergunta.getByRole('button', { name: 'Continuar' }).click()

    await expect(pergunta.getByRole('heading', { name: 'What does Lia pick?' })).toBeVisible()
    await pergunta.getByRole('button', { name: 'Pular' }).click()

    await expect(pergunta.getByRole('heading', { name: 'Who has a small dog?' })).toBeVisible()
    await pergunta.getByRole('button', { name: 'Lia', exact: true }).click()
    await pergunta.getByRole('button', { name: "Lia's dad" }).click()
    await expect(pergunta.getByText(/A resposta era: “Ben”\./)).toBeVisible()
    await expect(pergunta).not.toContainText(/errad|errou/i)
    await pergunta.getByRole('button', { name: 'Continuar' }).click()

    /* A escrita vem depois das perguntas; aqui ela é pulada (o e2e dela é `leitura-ativa-escrita.e2e.ts`). */
    await page.getByTestId('leitura-ativa-escrita').getByRole('button', { name: 'Pular' }).click()

    /* O resumo: fatos, sem nota; "six" para praticar, marcada, com o motivo neutro. */
    const resumo = page.getByTestId('leitura-ativa-resumo')
    await expect(resumo.getByText('Texto concluído')).toBeVisible()
    await expect(resumo).toContainText('13 de 13 frases')
    await expect(resumo).toContainText('1 de 3 perguntas')
    await expect(resumo).not.toContainText('%')
    const six2 = resumo.getByTestId('leitura-ativa-praticar').locator('li').filter({ hasText: 'six' })
    await expect(six2).toContainText('O Frasy não ouviu bem')
    await expect(six2.getByRole('checkbox')).toBeChecked()

    /* Nada da voz saiu nem ficou: nenhuma requisição com a transcrição, nenhuma rota de IA/STT, nada guardado. */
    for (const p of pedidos) {
      expect(p.url, p.url).not.toMatch(/\/api\/(ai|stt|transcri)/)
      expect(p.corpo, p.url).not.toMatch(/she picks|picks red apples|saturday morning/i)
    }
    const guardado = await page.evaluate(async () => {
      const ls = Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`)
      const bancos = indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name ?? '') : []
      return { ls, bancos }
    })
    expect(guardado.ls.join('\n')).not.toMatch(/she picks|picks red|saturday morning/i)
    expect(guardado.bancos.join(' ')).not.toMatch(/leitura|audio|voz/i)
    expect(guardado.ls.find((x) => x.startsWith('frasy.leituraAtiva.lidos'))).toContain('a1-no-mercado')
  })
})
