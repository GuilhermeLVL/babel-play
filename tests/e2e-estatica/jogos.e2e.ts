import { expect, type Page, test } from '@playwright/test'

import {
  abrirJogo,
  abrirLobbyDaTrilha,
  cartaDoTabu,
  chegarAoFim,
  fecharPar,
  JOGOS,
  norm,
  opcaoQueFechaAFrase,
  opcoesDe,
  palavrasDe,
  palco,
  palpitarNoTermo,
  paresDaMemoria,
  pegarNaKaruta,
  REGISTROS,
  semExplicacao,
  terminou,
  textos,
  ultimaFala,
  vozFalsa,
} from './_jogos'

/**
 * OS JOGOS DE PONTA A PONTA NA EDIÇÃO ESTÁTICA (QA dos jogos, 2026-09-26).
 *
 * Cada teste abre um jogo pela Trilha embutida, joga a rodada até o fim de rodada comum
 * (`casca/FimDaRodada`, com "Jogar de novo" e "Voltar aos jogos") e confere o comportamento que o QA
 * consertou:
 *  - Caça-palavras: marcar a palavra por TOQUE (tocar a 1ª e a última letra) no celular e por
 *    TECLADO (Enter nas duas pontas) no desktop — antes, os dois caminhos não marcavam nada;
 *  - Mala: a palavra nova fica à vista com a rodada já andando, e a mala fecha 8 de 8;
 *  - Choseong: quando o tempo acaba, a resposta aparece antes da próxima palavra;
 *  - Tabu: escolher errado mostra a certa antes de trocar de carta;
 *  - Duelo e Karuta: as teclas 1–9 escolhem a alternativa.
 *
 * DESENHO NOVO (09/10/2026). Os tabuleiros são os do protótipo (classes `pj-*`, dentro de
 * `#palco[data-qj=<jogo>]`); o caminho até eles e até o fim está em `_jogos.ts`. O que mudou de
 * comportamento e o teste acompanha:
 *  - a contagem 3-2-1 é só do Duelo; os outros começam direto;
 *  - o Soletrar devolve as letras já certas escritas na fileira (digita-se só o que falta);
 *  - o Choseong aceita as vogais uma tentativa por vez: as certas ficam presas, as erradas saem;
 *  - o Rali devolve sozinho quando a palavra fecha (Enter só devolve antes de completar);
 *  - no Caça-palavras, o que o dicionário não acha sai pelo "Radar" (pisca as duas pontas) no lugar
 *    do antigo "Revelar esta palavra";
 *  - a Frase embaralhada tem a Dica contada (3 por rodada): o teste monta a frase lendo a tradução.
 *
 * DETERMINISMO. As respostas saem do mesmo arquivo que o app baixa (`dist/trilha/en.json`): a pista
 * é a tradução, e o teste procura a palavra que a tem. Os jogos de áudio ganham uma voz FALSA em
 * `speechSynthesis` (duas vozes, en-US e pt-BR) que registra o que foi dito — é assim que o teste
 * "ouve" a Karuta e o Ditado sem depender das vozes da máquina. Os passeios têm teto de voltas e
 * esperas curtas e fixas: nada aqui depende de sorteio do jogo para passar.
 */

test.beforeEach(async ({ page }) => {
  /* Uma leitura de tela que não acha o elemento (a pergunta saiu, o fim chegou) falha logo, em vez de
     segurar o teste até o prazo dele. */
  page.setDefaultTimeout(8000)
  page.setDefaultNavigationTimeout(30_000)
  await semExplicacao(page, JOGOS)
  await vozFalsa(page)
})

/** O rótulo do placar ("3 de 8 palavras"): quantos itens a rodada já fechou. */
const rotulo = (page: Page) => palco(page).locator('.hud [data-pj="rotulo"]')
const feitos = async (page: Page) =>
  Number.parseInt(
    (await rotulo(page)
      .innerText()
      .catch(() => '')) || '0',
    10,
  ) || 0

/** Lê um texto da tela sem esperar por ele: vazio quando o elemento não está lá. */
const ler = (page: Page, seletor: string) =>
  palco(page)
    .locator(seletor)
    .first()
    .innerText({ timeout: 500 })
    .then(
      (t) => t.trim(),
      () => '',
    )

/** Espera a jogada seguinte: a leitura muda (a pergunta nova chegou) ou a rodada acaba. */
async function ateMudar(page: Page, leitura: () => Promise<unknown>, antes: unknown, espera = 8000) {
  await expect
    .poll(async () => (await terminou(page)) || (await leitura()) !== antes, { timeout: espera })
    .toBe(true)
    .catch(() => {})
}

/** Quantas falas a voz falsa já disse. */
const ditas = (page: Page) => page.evaluate(() => (window as unknown as { __falas: unknown[] }).__falas.length)

/* ─────────────────────────── os jogos ─────────────────────────── */

test('Memória: fecha todos os pares', async ({ page }) => {
  await abrirJogo(page, 'memory')
  const { pares, cartas } = await paresDaMemoria(page)
  expect(pares.length * 2, 'todos os pares da mesa identificados').toBe(cartas)
  for (const par of pares) await fecharPar(page, par)
  await chegarAoFim(page, 'memory')
})

test('Caça-palavras: marca por toque (celular) ou por teclado (desktop)', async ({ page }, info) => {
  await abrirJogo(page, 'wordsearch')
  const celulas = palco(page).locator('.grade-caca [data-c]')
  const n = await celulas.count()
  const lado = Math.round(Math.sqrt(n))
  const letras = await textos(celulas)
  const G = (l: number, c: number) => letras[l * lado + c]
  /** Todas as ocorrências da palavra na grade, como [início, fim]; o mesmo traço lido nos dois
   *  sentidos (palíndromo) conta uma vez. */
  const ocorrencias = (w: string) => {
    const W = w
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
    const achadas = new Map<string, readonly [number, number]>()
    if (!W) return []
    for (let l = 0; l < lado; l++)
      for (let c = 0; c < lado; c++)
        for (const [dl, dc] of [
          [0, 1],
          [1, 0],
          [1, 1],
          [-1, 1],
          [0, -1],
          [-1, 0],
          [-1, -1],
          [1, -1],
        ]) {
          let ok = true
          for (let k = 0; k < W.length && ok; k++) {
            const L = l + dl * k
            const C = c + dc * k
            if (L < 0 || C < 0 || L >= lado || C >= lado || G(L, C) !== W[k]) ok = false
          }
          if (!ok) continue
          const [a, b] = [l * lado + c, (l + dl * (W.length - 1)) * lado + c + dc * (W.length - 1)]
          achadas.set(a < b ? `${a}-${b}` : `${b}-${a}`, [a, b] as const)
        }
    return [...achadas.values()]
  }
  /** O traço arrastado da primeira à última letra. */
  const arrastar = async ([de, ate]: readonly [number, number]) => {
    const [ba, bb] = [await celulas.nth(de).boundingBox(), await celulas.nth(ate).boundingBox()]
    await page.mouse.move(ba!.x + ba!.width / 2, ba!.y + ba!.height / 2)
    await page.mouse.down()
    await page.mouse.move(bb!.x + bb!.width / 2, bb!.y + bb!.height / 2, { steps: 8 })
    await page.mouse.up()
  }
  // A pista é o significado (no nível fácil, seguida da inicial da palavra, que não entra na leitura).
  const linhas = palco(page).locator('.pistas li')
  const pistas = await linhas.evaluateAll((lis) =>
    lis.map((li) => (li.querySelector('span')?.firstChild?.textContent ?? '').trim()),
  )
  expect(pistas.length).toBeGreaterThan(0)
  const achadas = () => palco(page).locator('.pistas li.feita').count()
  let primeira = true
  for (const p of pistas) {
    /* A grade é sorteada, e a sequência de letras de uma palavra pode aparecer também POR ACASO no
       preenchimento. O jogo só aceita as pontas de onde a palavra foi COLOCADA; marcar a outra
       ocorrência não conta. A marcação conferida usa só a pista cuja palavra aparece uma vez só na
       grade; as outras tentam cada ocorrência, e o que não casar sai pelo Radar no fim. */
    const todas = palavrasDe(p).flatMap(ocorrencias)
    if (primeira ? todas.length !== 1 : todas.length === 0) continue
    const antes = await achadas()
    if (primeira) {
      const [a, b] = [celulas.nth(todas[0][0]), celulas.nth(todas[0][1])]
      if (info.project.name.startsWith('mobile')) {
        await a.tap()
        await b.tap()
      } else {
        await a.focus()
        await page.keyboard.press('Enter')
        await b.focus()
        await page.keyboard.press('Enter')
      }
      await expect.poll(achadas, { message: 'a primeira palavra deveria ser marcada' }).toBe(antes + 1)
      primeira = false
      continue
    }
    for (const traco of todas) {
      await arrastar(traco)
      await page.waitForTimeout(150)
      if ((await achadas()) > antes) break
    }
  }
  expect(primeira, 'alguma palavra da rodada aparece uma vez só na grade').toBe(false)
  // A primeira pista (pulada enquanto se procurava a de ocorrência única) e as ambíguas: de novo.
  for (let k = 0; k < pistas.length && !(await terminou(page)); k++) {
    if (await linhas.nth(k).evaluate((li) => li.classList.contains('feita'))) continue
    const antes = await achadas()
    for (const traco of palavrasDe(pistas[k]).flatMap(ocorrencias)) {
      await arrastar(traco)
      await page.waitForTimeout(150)
      if ((await achadas()) > antes) break
    }
  }
  // O que não coube no dicionário: o Radar pisca as duas pontas de uma palavra que falta (3 por rodada).
  for (let i = 0; i < 3 && !(await terminou(page)) && (await achadas()) < pistas.length; i++) {
    const radar = palco(page).locator('[data-ajuda="radar"]')
    if (!(await radar.isEnabled().catch(() => false))) break
    await radar.click()
    const pontas = palco(page).locator('.grade-caca [data-c].dica')
    await expect(pontas).toHaveCount(2)
    const [de, ate] = await pontas.evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.c)))
    await arrastar([de, ate])
    await page.waitForTimeout(300)
  }
  await chegarAoFim(page, 'wordsearch')
})

test('Soletrar (Termo): a escada chega ao fim digitando as palavras', async ({ page }) => {
  await abrirJogo(page, 'termo')
  const tentadas = new Set<string>()
  for (let volta = 0; volta < 20 && !(await terminou(page)); volta++) {
    const antes = await feitos(page)
    if (!(await palpitarNoTermo(page, tentadas))) {
      // Sem candidata no dicionário: um palpite qualquer gasta a tentativa e a escada segue.
      const vazias = await palco(page)
        .locator('.tab-termo:not(.resolvido):not(.falhou)')
        .first()
        .locator('.linha-termo.atual .letra:not(.cheia)')
        .count()
        .catch(() => 0)
      if (vazias) {
        await page.keyboard.type('x'.repeat(vazias), { delay: 20 })
        await page.keyboard.press('Enter')
      }
    }
    // O julgamento vira as letras uma a uma; ao fechar o degrau, a escada sobe antes do seguinte.
    await page.waitForTimeout(1200)
    if ((await feitos(page)) > antes) await page.waitForTimeout(1600)
  }
  await chegarAoFim(page, 'termo')
})

test('Duelo: responde pelas teclas 1–4 até o fim', async ({ page }) => {
  await abrirJogo(page, 'blitz')
  const pergunta = palco(page).locator('.blitz-palavra b')
  const alternativas = palco(page).locator('.opcoes-blitz button')
  await expect(alternativas.first()).toBeVisible({ timeout: 15_000 })
  for (let v = 0; v < 40 && !(await terminou(page)); v++) {
    if (
      !(await alternativas
        .first()
        .isEnabled()
        .catch(() => false))
    ) {
      await page.waitForTimeout(200)
      continue
    }
    const cand = palavrasDe(await pergunta.innerText())
    const alts = await opcoesDe(alternativas)
    const i = Math.max(
      0,
      alts.findIndex((a) => cand.includes(a.toLowerCase())),
    )
    const antes = await feitos(page)
    await page.keyboard.press(String(i + 1))
    if (v === 0) await expect.poll(() => feitos(page), { message: 'a tecla escolhe a alternativa' }).toBe(antes + 1)
    await page.waitForTimeout(700)
  }
  await chegarAoFim(page, 'blitz', 70_000)
})

test('Frase embaralhada: monta a frase da tradução até o fim', async ({ page }) => {
  await abrirJogo(page, 'scramble')
  const traducaoNaTela = () => ler(page, '.pj-traducao')
  for (let v = 0; v < 12 && !(await terminou(page)); v++) {
    const naTela = await traducaoNaTela()
    if (!naTela) {
      await page.waitForTimeout(300)
      continue
    }
    const frase = REGISTROS.find((r) => r[3] && norm(r[3]) === norm(naTela))?.[2]
    const banco = palco(page).locator('.pj-pecas .pj-peca:not(.fantasma)')
    for (const palavra of (frase ?? '').split(/\s+/).filter(Boolean)) {
      const peca = banco.filter({ hasText: new RegExp(`^${palavra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first()
      await peca.click({ timeout: 2000 }).catch(() => {})
      await page.waitForTimeout(60)
    }
    const conferir = palco(page).locator('[data-pj="conferir"]')
    if (await conferir.isEnabled().catch(() => false)) await conferir.click()
    // Frase que a Trilha não deu para montar: pular conta erro, e a rodada segue.
    else
      await palco(page)
        .locator('[data-pj="pular"]')
        .click({ timeout: 2000 })
        .catch(() => {})
    await ateMudar(page, traducaoNaTela, naTela)
  }
  await chegarAoFim(page, 'scramble')
})

test('Qual foi?: escolhe a palavra que a voz disse', async ({ page }) => {
  await abrirJogo(page, 'escuta')
  const ops = palco(page).locator('.pj-lista button')
  for (let v = 0; v < 10 && !(await terminou(page)); v++) {
    await expect(ops.first())
      .toBeEnabled({ timeout: 5000 })
      .catch(() => {})
    if (await terminou(page)) break
    const f = await ultimaFala(page)
    const alts = await opcoesDe(ops)
    const i = Math.max(
      0,
      alts.findIndex((a) => a === f?.t),
    )
    await page.keyboard.press(String(i + 1))
    if (v === 0) await expect(ops.nth(i), 'a voz disse a alternativa certa').toHaveClass(/certa/)
    await page.waitForTimeout(1300)
  }
  await chegarAoFim(page, 'escuta')
})

test('Ditado: escreve o que ouviu (caixa e pontuação não contam)', async ({ page }) => {
  await abrirJogo(page, 'ditado')
  const entrada = palco(page).getByLabel('O que você ouviu')
  let ouvidas = 0
  for (let v = 0; v < 12 && !(await terminou(page)); v++) {
    // A fala nova é dita quando chega: só então há o que escrever.
    await expect
      .poll(() => ditas(page), { timeout: 5000 })
      .toBeGreaterThan(ouvidas)
      .catch(() => {})
    if (!(await entrada.isEnabled().catch(() => false)) || (await ditas(page)) <= ouvidas) {
      await page.waitForTimeout(400)
      continue
    }
    ouvidas = await ditas(page)
    const f = await ultimaFala(page)
    const antes = await feitos(page)
    await entrada.fill(`${(f?.t ?? 'x').toUpperCase()}!`)
    await page.keyboard.press('Enter')
    await expect(palco(page).locator('.pj-correcao')).toContainText('100%')
    await ateMudar(page, () => feitos(page), antes)
  }
  await chegarAoFim(page, 'ditado')
})

test('Karaokê: fala, recebe a nota e termina', async ({ page }) => {
  await abrirJogo(page, 'karaoke')
  const falar = palco(page).locator('[data-pj="falar"]')
  for (let v = 0; v < 10 && !(await terminou(page)); v++) {
    if (!(await falar.isVisible().catch(() => false))) break
    await palco(page).locator('[data-pj="ouvir"]').click()
    await page.waitForTimeout(300)
    await falar.click()
    await expect(palco(page).locator('.pj-nota .pj-pct')).toContainText('%', { timeout: 5000 })
    await expect(palco(page).locator('.pj-ouvindo')).toHaveCount(0)
    const seguir = palco(page).locator('[data-pj="pular"]')
    const ultima = /^Terminar/.test((await seguir.innerText()).trim())
    await seguir.click()
    if (ultima) break
    await page.waitForTimeout(400)
  }
  await chegarAoFim(page, 'karaoke')
})

test('Karuta: ouve a pista e golpeia pela tecla', async ({ page }) => {
  await abrirJogo(page, 'karuta')
  const cartas = palco(page).locator('.pj-mesa button')
  let golpes = 0
  for (let v = 0; v < 30 && !(await terminou(page)); v++) {
    if (!(await ultimaFala(page, 'pt'))) {
      await page.waitForTimeout(300)
      continue
    }
    const antes = await feitos(page)
    if (!(await pegarNaKaruta(page))) {
      // Pista fora do dicionário: golpeia a primeira carta ainda na mesa — o erro gasta a carta.
      const livres = await cartas.evaluateAll((els) => els.map((el) => !(el as HTMLButtonElement).disabled))
      await page.keyboard.press(String(Math.max(0, livres.indexOf(true)) + 1))
    } else if (golpes++ === 0) {
      await expect.poll(() => feitos(page), { message: 'a tecla pega a carta' }).toBe(antes + 1)
    }
    await page.waitForTimeout(1100)
  }
  expect(golpes, 'alguma pista foi reconhecida e golpeada').toBeGreaterThan(0)
  await chegarAoFim(page, 'karuta')
})

test('Choseong: quando o tempo acaba, a resposta aparece', async ({ page }) => {
  test.slow()
  await abrirJogo(page, 'choseong')
  const vagas = palco(page).locator('.pj-cho .pj-vaga')
  await expect(vagas.first()).toBeVisible()
  await expect(vagas.first(), 'a vaga da vogal começa vazia').toHaveText('')
  // O tempo da 1ª palavra acaba: as vogais aparecem no lugar delas antes de a próxima palavra chegar.
  const reveladas = palco(page).locator('.pj-cho .pj-vaga.lugar')
  await expect(reveladas.first(), 'o tempo da 1ª palavra acaba e a resposta aparece').toBeVisible({ timeout: 30_000 })
  expect(norm((await textos(reveladas)).join('')), 'as vogais da palavra').toMatch(/^[a-z]+$/)
  /* As outras palavras, uma tentativa por vogal: as certas ficam presas, as erradas saem — em até
     cinco tentativas a palavra fecha. PRAZO, não número de voltas: uma palavra que as cinco vogais
     não fecham gasta o relógio inteiro. */
  const prazo = Date.now() + 200_000
  while (Date.now() < prazo && !(await terminou(page))) {
    const antes = await feitos(page)
    for (const vogal of 'aeiou') {
      const vazias = await palco(page).locator('.pj-cho .pj-vaga:not(.cheia):not(.lugar)').count()
      if (!vazias || (await feitos(page)) !== antes) break
      await page.keyboard.type(vogal.repeat(vazias), { delay: 30 })
      await page.waitForTimeout(750)
    }
    // Até a palavra seguinte chegar (ou o relógio desta acabar).
    await expect
      .poll(async () => (await terminou(page)) || (await feitos(page)) !== antes, { timeout: 20_000 })
      .toBe(true)
      .catch(() => {})
    await page.waitForTimeout(1500)
  }
  await chegarAoFim(page, 'choseong')
})

test('Rali: devolve escrevendo, com caixa e pontuação livres', async ({ page }) => {
  await abrirJogo(page, 'tenis')
  const entrada = palco(page).getByLabel('Sua devolução')
  const voce = async () => Number(await ler(page, '.rl-placar [data-voce]'))
  const tentativas = new Map<string, number>()
  let devolvidas = 0
  for (let v = 0; v < 60 && !(await terminou(page)); v++) {
    const pista = await ler(page, '.rl-pista b')
    const casas = await palco(page).locator('.rl-letras span').count()
    if (!pista || !casas) {
      await page.waitForTimeout(250)
      continue
    }
    /* Antes do saque a quadra não aceita a devolução (o campo volta vazio), e há traduções com mais de
       uma palavra do mesmo tamanho: cada candidata ganha três voltas antes de a seguinte entrar. */
    const n = tentativas.get(pista) ?? 0
    tentativas.set(pista, n + 1)
    const candidatas = palavrasDe(pista).filter((x) => x.length === casas)
    const w = candidatas[Math.floor(n / 3) % Math.max(1, candidatas.length)]
    const antes = await voce()
    if (!w) {
      // Palavra que o dicionário não deu: Enter devolve o que houver, e a bola seguinte vem.
      await entrada.pressSequentially('x').catch(() => {})
      await page.keyboard.press('Enter')
      await ateMudar(page, () => ler(page, '.rl-pista b'), pista, 4000)
      continue
    }
    /* A palavra completa devolve sozinha, com a caixa e a pontuação que vierem: em maiúsculas e com um
       ponto no meio. Tecla a tecla, como quem digita — o campo tem o tamanho da palavra, e um texto
       colado de uma vez seria cortado nele. */
    const W = w.toUpperCase()
    await entrada.pressSequentially(` ${W[0]}.${W.slice(1)}`, { delay: 15 }).catch(() => {})
    const voltou = await expect
      .poll(voce, { timeout: 1200 })
      .toBe(antes + 1)
      .then(
        () => true,
        () => false,
      )
    if (voltou) devolvidas++
    await page.waitForTimeout(500)
  }
  expect(devolvidas, 'alguma bola foi devolvida escrevendo').toBeGreaterThan(0)
  await chegarAoFim(page, 'tenis')
})

test('Mala: a palavra nova fica à vista com a rodada andando, e a mala fecha 8 de 8', async ({ page }) => {
  test.slow()
  await abrirJogo(page, 'koffer')
  const aberta = palco(page).locator('.ml-mala.aberta')
  const naMala = palco(page).locator('.ml-mala .ml-slot.cheio b')
  await expect(aberta, 'a mala abre com a rodada já andando').toBeVisible()
  await expect(naMala.first(), 'a primeira palavra fica à vista').toBeVisible()
  const ordem: string[] = []
  for (let v = 0; v < 400 && !(await terminou(page)); v++) {
    if (await aberta.isVisible().catch(() => false)) {
      const itens = await textos(naMala)
      if (itens.length > ordem.length) ordem.splice(0, ordem.length, ...itens)
      await page.waitForTimeout(250)
      continue
    }
    const passo = (
      await palco(page)
        .locator('.ml-fala')
        .innerText()
        .catch(() => '')
    ).match(/Passo (\d+) de/)
    if (!passo) {
      await page.waitForTimeout(250)
      continue
    }
    const alvo = ordem[Number(passo[1]) - 1]
    expect(alvo, 'a mala nunca pede uma palavra que não foi vista').toBeTruthy()
    /* Na última palavra de um nível a mala reabre: o botão pode travar entre achar e clicar. Aí a
       volta seguinte relê a tela. */
    await palco(page)
      .locator(`.ml-paleta button[data-op="${alvo}"]`)
      .click({ timeout: 1500 })
      .catch(() => {})
    await page.waitForTimeout(200)
  }
  const fim = await chegarAoFim(page, 'koffer')
  await expect(rotulo(page)).toHaveText(/^8 de 8 /)
  await expect(fim.locator('.fim-numeros')).toContainText('8 de 8')
})

test('Bao: semeia os pedaços até o fim', async ({ page }) => {
  await abrirJogo(page, 'bao')
  const covas = palco(page).locator('.pj-covas .pj-cova')
  for (let v = 0; v < 20 && !(await terminou(page)); v++) {
    const antes = await feitos(page)
    const pista = (
      await palco(page)
        .locator('.termo-dica b')
        .innerText()
        .catch(() => '')
    ).trim()
    const pedacos = (await textos(covas)).map((t) => t.toLowerCase())
    /* A pista é a tradução, e há traduções com várias palavras na Trilha ("quarto": bedroom, quarter,
       room). A certa é a que os pedaços montam INTEIRA: contém cada um e tem a soma dos tamanhos. */
    const soma = pedacos.reduce((n, p) => n + p.length, 0)
    const candidatas = palavrasDe(pista).filter((x) => pedacos.every((p) => !p || x.includes(p)))
    let resto = candidatas.find((x) => x.length === soma) ?? candidatas[0] ?? ''
    if (!resto) {
      // Palavra não identificada: semeia a primeira cova livre — o erro esgota a palavra e a rodada segue.
      await covas
        .and(page.locator(':enabled'))
        .first()
        .click({ timeout: 1500 })
        .catch(() => {})
    }
    for (let k = 0; k < 8 && resto; k++) {
      const atual = (await textos(covas)).map((t) => t.toLowerCase())
      const i = atual.findIndex((t) => t && resto.startsWith(t))
      if (i < 0) break
      await covas.nth(i).click()
      resto = resto.slice(atual[i].length)
      await page.waitForTimeout(150)
    }
    // A palavra fechada (ou esgotada) dá lugar à seguinte.
    await expect
      .poll(async () => (await terminou(page)) || (await feitos(page)) !== antes, { timeout: 4000 })
      .toBe(true)
      .catch(() => {})
    await page.waitForTimeout(1100)
  }
  await chegarAoFim(page, 'bao')
})

test('Vitendawili: completa as lacunas pela tecla', async ({ page }) => {
  await abrirJogo(page, 'vitendawili')
  const alternativas = palco(page).locator('.opcoes-blitz button')
  for (let v = 0; v < 30 && !(await terminou(page)); v++) {
    const enigma = palco(page).locator('.pj-enigma')
    if (!(await enigma.isVisible().catch(() => false))) break
    const antes = await feitos(page)
    const alts = await opcoesDe(alternativas)
    const livres = await alternativas.evaluateAll((bs) => bs.map((b) => !(b as HTMLButtonElement).disabled))
    let i = opcaoQueFechaAFrase((await enigma.innerText()).replace(/\s{2,}/g, ' ___ '), alts)
    // Sem identificar, a primeira ainda de pé: errar elimina a opção, e a certa sobra.
    if (i < 0 || !livres[i]) i = Math.max(0, livres.indexOf(true))
    await page.keyboard.press(String(i + 1))
    if (v === 0)
      await expect(alternativas.nth(i), 'a tecla escolhe a alternativa').toHaveClass(/certa|pj-fora/, { timeout: 3000 })
    await expect
      .poll(async () => (await terminou(page)) || (await feitos(page)) !== antes, { timeout: 1500 })
      .toBe(true)
      .catch(() => {})
    await page.waitForTimeout(900)
  }
  await chegarAoFim(page, 'vitendawili')
})

test('Shiritori: encadeia pela última letra e termina no fim comum', async ({ page }) => {
  await abrirJogo(page, 'shiritori')
  const alternativas = palco(page).locator('.opcoes-blitz button')
  for (let v = 0; v < 30 && !(await terminou(page)); v++) {
    const ponta = palco(page).locator('.pj-ponta')
    if (!(await ponta.isVisible().catch(() => false))) {
      await page.waitForTimeout(300)
      continue
    }
    const ultima = norm(await ponta.innerText()).slice(-1)
    const alts = await opcoesDe(alternativas)
    const livres = await alternativas.evaluateAll((bs) => bs.map((b) => !(b as HTMLButtonElement).disabled))
    let i = alts.findIndex((a, k) => livres[k] && norm(a)[0] === ultima)
    if (i < 0) i = Math.max(0, livres.indexOf(true))
    await page.keyboard.press(String(i + 1))
    await page.waitForTimeout(800)
  }
  await expect(page.getByText('Fim da corrente'), 'a tela própria saiu: o fim é o comum').toHaveCount(0)
  await chegarAoFim(page, 'shiritori')
})

test('Cadavre exquis: escreve a frase e confere', async ({ page }) => {
  await abrirJogo(page, 'cadavre')
  const palavras = await textos(palco(page).locator('.pj-quatro .pj-cartao b'))
  expect(palavras).toHaveLength(4)
  await palco(page)
    .getByLabel('Sua frase')
    .fill(`The ${palavras.join(' and ')}.`)
  await palco(page).locator('[data-pj="conferir"]').click()
  await expect(palco(page).locator('.pj-correcao')).toContainText(/palavras usadas:\s*4\/4/)
  await expect(palco(page).locator('.pj-quatro .pj-cartao.usada')).toHaveCount(4)
  await palco(page).locator('[data-pj="continuar"]').click()
  await chegarAoFim(page, 'cadavre')
})

test('Tabu: errar mostra a certa antes da próxima carta', async ({ page }) => {
  await abrirJogo(page, 'taboo')
  const alternativas = palco(page).locator('.opcoes-blitz button')
  /* A certa é a opção que, posta na lacuna, reconstrói a frase da Trilha; o teste escolhe OUTRA —
     errar de propósito sem depender da ordem sorteada das alternativas. */
  const errada = alternativas.and(page.locator('.errada'))
  for (let tentativa = 0; tentativa < 4 && !(await errada.isVisible().catch(() => false)); tentativa++) {
    const { opcoes, certa } = await cartaDoTabu(page)
    // Sem identificar a frase (raro), cada carta tenta uma posição diferente.
    const escolha = certa < 0 ? tentativa % opcoes.length : certa === 0 ? 1 : 0
    await page.keyboard.press(String(escolha + 1))
    await page.waitForTimeout(300)
    if (!(await errada.isVisible().catch(() => false))) await page.waitForTimeout(1500)
  }
  // Com a errada marcada, a certa aparece na mesma carta, antes de a próxima chegar.
  await expect(errada).toHaveCount(1)
  await expect(alternativas.and(page.locator('.certa'))).toHaveCount(1)
  for (let v = 0; v < 20 && !(await terminou(page)); v++) {
    await page.waitForTimeout(1900)
    if (await terminou(page)) break
    await page.keyboard.press('1')
  }
  await chegarAoFim(page, 'taboo')
})

test('Caça-conectores: na Trilha fica em "Precisam de outro material" dizendo o porquê', async ({ page }) => {
  await abrirLobbyDaTrilha(page)
  const presos = page.locator('#grade-de-jogos .qj-presos')
  await expect(presos).toContainText('Precisam de outro material')
  await expect(presos.locator('.q-tile[data-jogo="conectores"]')).toBeDisabled()
  await expect(presos).toContainText('as frases da trilha quase nunca têm conector')
})
