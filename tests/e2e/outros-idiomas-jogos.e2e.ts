import { expect, type Page, test } from '@playwright/test'

import { botaoEncerrar, botaoIniciar, falar } from './_captura'
import { abrirTela, clicarRobusto, irParaPraticar, lobby, semCapturaDeTela } from './_helpers'
import { cartaoDoJogo, cartasDaMemoria, chegarAoFim, entrarNoJogo, palco, semExplicacao, voltarAoLobby } from './_jogos'

/**
 * OS JOGOS E A LEGENDA EM OUTROS IDIOMAS (auditoria de 10/10/2026,
 * `docs/auditoria/2026-10-10-outros-idiomas.md`).
 *
 * O RELATO DO DONO: nos minijogos em mandarim, "as palavras, as frases usadas não estavam fazendo
 * sentido, estavam meio confusas e embaralhadas". Aqui o app abre a TRILHA de cada idioma (o que um
 * usuário novo recebe, sem nada no caderno) e se confere, na tela:
 *   · os jogos de PALAVRA que valem em qualquer escrita abrem, com as palavras NA ESCRITA do idioma
 *     (nenhuma de outro idioma na mesma rodada) e a pista em português;
 *   · a Memória vai até o fim da rodada;
 *   · os jogos de LETRAS (grade, teclado) NÃO são oferecidos em chinês e em árabe.
 * E, na captura, que uma fala em chinês e uma em árabe aparecem escritas, sem estourar a tela.
 *
 * O que NÃO se prova: se cada glosa é a acepção certa (é um dado, medido no relatório).
 */

interface Idioma {
  base: string
  nome: string
  /** A escrita das palavras deste idioma. */
  escrita: RegExp
  /** Letras de OUTRAS escritas que não podem aparecer numa palavra deste idioma. */
  estranha: RegExp
  latino: boolean
}

const IDIOMAS: Idioma[] = [
  {
    base: 'es',
    nome: 'espanhol',
    escrita: /\p{Script=Latin}/u,
    estranha: /[\p{Script=Han}\p{Script=Arabic}\p{Script=Cyrillic}]/u,
    latino: true,
  },
  {
    base: 'zh',
    nome: 'mandarim',
    escrita: /\p{Script=Han}/u,
    estranha: /[\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Hangul}]/u,
    latino: false,
  },
  {
    base: 'ar',
    nome: 'árabe',
    escrita: /\p{Script=Arabic}/u,
    estranha: /[\p{Script=Han}\p{Script=Cyrillic}\p{Script=Hangul}]/u,
    latino: false,
  },
]

const DE_QUALQUER_ESCRITA = ['memory', 'blitz', 'karuta', 'koffer'] as const
const DE_LETRAS = ['wordsearch', 'termo', 'choseong', 'tenis', 'bao', 'shiritori'] as const

async function abrirTrilha(page: Page, base: string) {
  await semExplicacao(page, [...DE_QUALQUER_ESCRITA])
  await irParaPraticar(page, `/jogar?fonte=trilha&idioma=${base}`)
  /* O link vira o conteúdo escolhido: a ficha do cabeçalho diz "Trilha", e a grade tem jogo pronto. */
  await expect(lobby(page).locator('.fs-ficha [data-fs="abrir"]')).toContainText('Trilha', { timeout: 20_000 })
  await expect(lobby(page).locator('#grade-de-jogos > .q-grade .q-tile').first()).toBeVisible({ timeout: 20_000 })
}

/** Sai da rodada no meio: o "Jogar" do cabeçalho pergunta antes. */
async function sairDaRodada(page: Page) {
  await clicarRobusto(page, page.getByRole('main').getByRole('button', { name: 'Jogar', exact: true }))
  const sair = page.getByRole('dialog').filter({ hasText: 'Sair sem terminar?' })
  await clicarRobusto(page, sair.getByRole('button', { name: 'Sair da rodada' }))
  await expect(page.locator('#grade-de-jogos')).toBeVisible({ timeout: 15_000 })
}

test.describe('Jogos na Trilha de outros idiomas', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop-1280', 'uma vez, no projeto de desktop')
  })

  for (const idioma of IDIOMAS) {
    test(`${idioma.nome}: Memória até o fim, com as palavras na escrita do idioma`, async ({ page }) => {
      test.slow()
      await abrirTrilha(page, idioma.base)
      await entrarNoJogo(page, 'memory')

      const cartas = cartasDaMemoria(page)
      await expect(cartas.first()).toBeVisible()
      const mesa = await cartas.evaluateAll((els) =>
        els.map((el) => ({ texto: el.getAttribute('data-texto') ?? '', par: el.getAttribute('data-par') ?? '' })),
      )
      expect(mesa.length % 2).toBe(0)
      expect(mesa.length).toBeGreaterThanOrEqual(8)

      const pares = new Map<string, number[]>()
      mesa.forEach((c, i) => pares.set(c.par, [...(pares.get(c.par) ?? []), i]))
      for (const [par, indices] of pares) {
        expect(indices, `o par ${par} tem duas cartas`).toHaveLength(2)
        const textos = indices.map((i) => mesa[i].texto.trim())
        for (const t of textos) expect(t, 'carta sem texto').not.toBe('')
        // Uma carta é a palavra, na escrita do idioma; nenhuma traz letra de outro idioma estudado.
        expect(
          textos.some((t) => idioma.escrita.test(t)),
          `par sem palavra em ${idioma.nome}: ${textos.join(' / ')}`,
        ).toBe(true)
        for (const t of textos) expect(idioma.estranha.test(t), `escrita de outro idioma em "${t}"`).toBe(false)
        // Fora do alfabeto latino dá para ver que as duas cartas não são a mesma língua: palavra e tradução.
        if (!idioma.latino)
          expect(
            textos.some((t) => !idioma.escrita.test(t)),
            `par sem tradução: ${textos.join(' / ')}`,
          ).toBe(true)
      }

      for (const indices of pares.values()) {
        await cartas.nth(indices[0]).click()
        await cartas.nth(indices[1]).click()
        await expect(cartas.nth(indices[1])).toHaveClass(/(^| )par( |$)/, { timeout: 5000 })
      }
      const fim = await chegarAoFim(page, 'memory')
      await expect(fim.locator('.fim-numeros').getByText(`${pares.size} de ${pares.size}`)).toBeVisible()
      await voltarAoLobby(page)
    })

    test(`${idioma.nome}: Duelo, Karuta e Mala abrem com alternativas só deste idioma`, async ({ page }) => {
      test.slow()
      await abrirTrilha(page, idioma.base)
      for (const jogo of ['blitz', 'karuta', 'koffer'] as const) {
        await entrarNoJogo(page, jogo)
        const opcoes = palco(page).locator('[data-op]')
        await expect(opcoes.first(), `${jogo} em ${idioma.nome} deveria mostrar alternativas`).toBeVisible({
          timeout: 15_000,
        })
        const textos = (await opcoes.evaluateAll((els) => els.map((el) => el.getAttribute('data-op') ?? ''))).filter(
          Boolean,
        )
        expect(textos.length, `${jogo}: alternativas`).toBeGreaterThanOrEqual(2)
        for (const t of textos) {
          expect(idioma.escrita.test(t), `${jogo}: "${t}" não está na escrita do ${idioma.nome}`).toBe(true)
          expect(idioma.estranha.test(t), `${jogo}: "${t}" traz escrita de outro idioma`).toBe(false)
        }
        expect(new Set(textos).size, `${jogo}: alternativas repetidas`).toBe(textos.length)
        await sairDaRodada(page)
      }
    })
  }

  for (const idioma of IDIOMAS.filter((i) => !i.latino)) {
    test(`${idioma.nome}: os jogos de letras não são oferecidos`, async ({ page }) => {
      test.slow()
      await abrirTrilha(page, idioma.base)
      for (const jogo of DE_QUALQUER_ESCRITA) await expect(cartaoDoJogo(page, jogo)).toBeEnabled()
      for (const jogo of DE_LETRAS) {
        const cartao = cartaoDoJogo(page, jogo)
        if ((await cartao.count()) === 0) continue // fora da grade: não oferecido
        await expect(cartao, `${jogo} não deveria abrir em ${idioma.nome}`).toBeDisabled()
      }
    })

    /* O MOTIVO NA CARTA: o núcleo devolve `alfabeto-nao-suportado` para os seis jogos, e a carta diz
       isso (`notaDoJogo`, em `src/components/views/Play.tsx`) em vez de "faltam N palavras", que
       mandava a pessoa juntar palavras que nunca abririam o jogo. */
    test(`${idioma.nome}: a carta do jogo de letras diz que o jogo não escreve este alfabeto`, async ({ page }) => {
      await abrirTrilha(page, idioma.base)
      for (const jogo of DE_LETRAS) {
        const cartao = cartaoDoJogo(page, jogo)
        if ((await cartao.count()) === 0) continue
        await expect(cartao).toContainText(/alfabeto|escrita/i)
        await expect(cartao).not.toContainText(/faltam \d+/i)
      }
    })
  }
})

test.describe('Captura: a fala em outra escrita aparece na tela', () => {
  const CHINES = '大家早上好，今天我们一起学习中文。'
  const ARABE = 'صباح الخير للجميع، اليوم نتعلم العربية معا.'

  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'mobile-375', 'uma vez, no celular (a tela mais estreita)')
  })

  /**
   * A captura começa pelo microfone "Rápido" com um reconhecedor que abre e não ouve nada: as falas
   * entram pela bancada da tela (`window.__simFalas`), sem transcrição nem tradução de verdade.
   */
  async function comecarCaptura(page: Page) {
    await semCapturaDeTela(page)
    await page.addInitScript(() => {
      class Mudo {
        lang = ''
        continuous = false
        interimResults = false
        onstart: (() => void) | null = null
        onaudiostart: (() => void) | null = null
        onend: (() => void) | null = null
        start() {
          setTimeout(() => {
            this.onstart?.()
            this.onaudiostart?.()
          }, 100)
        }
        stop() {
          setTimeout(() => this.onend?.(), 0)
        }
        abort() {
          this.stop()
        }
      }
      const w = window as unknown as Record<string, unknown>
      w.SpeechRecognition = Mudo
      w.webkitSpeechRecognition = Mudo
    })
    await page.route(/huggingface\.co|\.hf\.co/, (r) => r.abort())
    await page.route(/\/modelos\/bergamot\/|bergamot-translator-worker/, (r) => r.abort())
    await abrirTela(page, '/capturar')
    await clicarRobusto(page, botaoIniciar(page))
    const folha = page.getByRole('dialog', { name: 'Como transcrever a sua voz?' })
    if (await folha.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await clicarRobusto(page, folha.getByRole('button', { name: /Rápido/ }).first())
      await clicarRobusto(page, folha.getByRole('button', { name: /Baixar e iniciar|^Iniciar$|Continuar/ }))
      await expect(folha).toBeHidden()
    }
    await expect(botaoEncerrar(page)).toBeVisible({ timeout: 20_000 })
  }

  /** A captura de tela para o relatório, depois de a entrada da folha e da fala assentar. */
  async function foto(page: Page, nome: string) {
    await page.waitForTimeout(900)
    await page.screenshot({ path: test.info().outputPath(`${nome}.png`) })
  }

  test('chinês e árabe: o texto aparece inteiro e não estoura a largura da tela', async ({ page }) => {
    test.slow()
    await comecarCaptura(page)
    await falar(page, [CHINES, ARABE])

    const tela = page.getByTestId('captura-do-prototipo')
    for (const texto of [CHINES, ARABE]) {
      const fala = tela.getByText(texto, { exact: false }).first()
      await expect(fala, `a fala "${texto}" deveria estar escrita na tela`).toBeVisible({ timeout: 10_000 })
      const caixa = await fala.boundingBox()
      const largura = page.viewportSize()!.width
      expect(caixa!.x, 'o texto começa dentro da tela').toBeGreaterThanOrEqual(0)
      expect(caixa!.x + caixa!.width, 'o texto termina dentro da tela').toBeLessThanOrEqual(largura + 1)
    }
  })

  /* Todo texto de fala leva `dir` ao lado do `lang` (`direcaoDoTexto`): o árabe sai da direita para a
     esquerda, com a pontuação do lado certo, e alinha pelo começo da escrita dele. */
  test('árabe na legenda da captura sai da direita para a esquerda', async ({ page }) => {
    test.slow()
    await comecarCaptura(page)
    // Uma fala em inglês antes: a régua do que NÃO muda (esquerda para a direita, colada à esquerda).
    await falar(page, ['Good morning, everyone.'])
    await falar(page, [ARABE], 'ar')
    const tela = page.getByTestId('captura-do-prototipo')
    const fala = tela.getByText(ARABE, { exact: false }).first()
    await expect(fala).toBeVisible({ timeout: 10_000 })
    expect(await fala.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl')
    await foto(page, 'arabe-na-legenda')

    /* O texto encosta na borda DIREITA da coluna da fala, e o inglês segue encostado na esquerda. */
    const bordas = (texto: string) =>
      tela
        .getByText(texto, { exact: false })
        .first()
        .evaluate((el) => {
          const faixa = document.createRange()
          faixa.selectNodeContents(el)
          const r = faixa.getBoundingClientRect()
          const c = el.closest('.q-fala')!.getBoundingClientRect()
          return { esquerda: r.left - c.left, direita: c.right - r.right, direcao: getComputedStyle(el).direction }
        })
    const arabe = await bordas(ARABE)
    expect(arabe.direita, 'o árabe encosta na direita').toBeLessThan(12)
    const ingles = await bordas('Good morning, everyone.')
    expect(ingles.direcao).toBe('ltr')
    expect(ingles.esquerda, 'o inglês segue encostado na esquerda').toBeLessThan(12)

    // Na folha da frase, a mesma direção.
    await clicarRobusto(page, fala.locator('xpath=ancestor::button[1]'))
    const folha = page.getByRole('dialog', { name: 'Ações', exact: true })
    await expect(folha).toBeVisible()
    expect(await folha.locator('.folha-frase').evaluate((el) => getComputedStyle(el).direction)).toBe('rtl')
    await foto(page, 'arabe-na-folha')
  })

  /* Em chinês não há espaço entre as palavras: a divisão por espaço entregava a frase inteira como UMA
     palavra. A folha da frase passa a ter um botão por palavra (`palavrasDoPedaco`, pelo segmentador do
     navegador), e o toque abre a folha DAQUELA palavra. */
  test('chinês: tocar numa palavra da frase abre a palavra, e não a frase inteira', async ({ page }) => {
    test.slow()
    await comecarCaptura(page)
    await falar(page, [CHINES], 'zh')
    const tela = page.getByTestId('captura-do-prototipo')
    const fala = tela.getByText(CHINES, { exact: false }).first()
    await expect(fala).toBeVisible({ timeout: 10_000 })
    await clicarRobusto(page, fala.locator('xpath=ancestor::button[1]'))
    const folha = page.getByRole('dialog', { name: 'Ações', exact: true })
    await expect(folha).toBeVisible()

    const palavras = folha.locator('.folha-palavras button')
    await expect(palavras.first()).toBeVisible()
    const textos = (await palavras.allTextContents()).map((p) => p.trim())
    expect(textos.length, `palavras da frase: ${textos.join(' | ')}`).toBeGreaterThan(4)
    expect(textos).toContain('中文')
    expect(textos, 'a frase inteira não é uma palavra').not.toContain(CHINES)
    for (const p of textos) expect(p, `"${p}" traz pontuação`).not.toMatch(/[，。]/)
    await foto(page, 'chines-palavras-da-frase')

    await clicarRobusto(page, palavras.filter({ hasText: /^中文$/ }))
    await expect(page.getByRole('dialog', { name: 'Palavra: 中文' })).toBeVisible()
    await foto(page, 'chines-folha-da-palavra')
  })
})
