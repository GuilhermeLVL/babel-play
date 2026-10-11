import { expect, type Locator, type Page } from '@playwright/test'

/**
 * O QUE AS SUÍTES DIVIDEM, no desenho que virou o único (09/10/2026).
 *
 * A casca é o trilho de ícones (`nav.q-trilho`): Início, Capturar, Intérprete, Biblioteca, Cartões,
 * Jogar, Buscar e "Mais" (navegação de 10/10/2026). Abaixo de 720 px ele vira uma barra de cinco
 * destinos (Início, Praticar, Capturar, Intérprete, Mais): "Praticar" abre a última das duas telas
 * de praticar (Cartões de início, `localStorage['babel.praticar']`), e no alto das duas há as abas
 * `abas-de-praticar` ("Cartões" e "Jogos") para ir de uma à outra; o Jogar não tem botão próprio na
 * barra, e a Biblioteca vira o primeiro ladrilho do "Mais". O painel "Mais" (`.q-mais`, o diálogo
 * "Mais destinos") traz, em todo aparelho, Estatísticas, Personalizar, Ajustes, o perfil, a ajuda,
 * Sobre e Planos — e, no pé, o tema claro/escuro, o som dos toques e o Modo desempenho. O
 * Vocabulário deixou de ser destino: é a aba "Palavras" da tela Cartões (`/cartoes/palavras`).
 *
 * O Jogar abre no lobby (`data-testid="lobby-do-quest"`), direto: a sala da primeira visita saiu em
 * 10/10/2026. O CONTEÚDO das palavras é um só para o app inteiro e troca-se na FICHA do cabeçalho
 * (`.fs-ficha`, a mesma da Biblioteca e dos Cartões), que abre o catálogo "Escolher o conteúdo"
 * (`dialog.fx-catalogo`). O que não é escolher conteúdo mora em "Buscar e organizar": o recorte das
 * palavras na seção "Buscar e filtrar"; "Gerenciar baralhos" e "Praticar outro idioma" (a sala,
 * `.qj-sala`) na seção "Opções".
 */

/** O trilho (ou a barra de cinco, no celular): é a mesma `nav`. */
export const trilho = (page: Page) => page.locator('nav.q-trilho')

/** A janela está na largura da barra de cinco (até 720 px)? Os projetos são 375, 768 e 1280. */
export const naBarraDeCinco = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 720

/** As abas "Cartões" e "Jogos" no alto das duas telas de praticar (só existem na barra de cinco). */
export const abasDePraticar = (page: Page) => page.getByTestId('abas-de-praticar')

/** A tela Cartões (`/cartoes`), com o estado do dia em `data-ct-hoje`. */
export const telaDeCartoes = (page: Page) => page.getByTestId('cartoes')

/** Uma aba da tela Cartões: Hoje ou Palavras. */
export const abaDeCartoes = (page: Page, nome: string | RegExp) =>
  page.getByRole('tablist', { name: 'Seções de Cartões' }).getByRole('tab', { name: nome })

/** O lobby do Jogar. */
export const lobby = (page: Page) => page.getByTestId('lobby-do-quest')

/** A sala "O que você vai praticar": só abre por "Praticar outro idioma", em Opções. */
export const salaDeEscolha = (page: Page) => page.locator('.qj-sala')

/** O catálogo "Escolher o conteúdo", aberto pela ficha do cabeçalho. */
export const painelDaFonte = (page: Page) => page.locator('dialog.fx-catalogo')

/** A ficha de conteúdo do cabeçalho do lobby: o botão que diz o conteúdo em uso e abre o catálogo. */
export const chipDaFonte = (page: Page) => lobby(page).locator('.fs-ficha [data-fs="abrir"]')

/** O "x" da ficha: volta para "Tudo" em um toque (só existe com outro conteúdo escolhido). */
export const voltarParaTudo = (page: Page) => lobby(page).locator('.fs-ficha [data-fs="tudo"]')

/**
 * DEVOLVE "TUDO" AO FIM DE UM TESTE, sem nunca falhar por isso. O conteúdo escolhido é da CONTA (o servidor
 * o guarda): o que um teste escolhe a suíte seguinte herdaria. Fecha o que estiver por cima e toca no "x".
 */
export async function devolverTudo(page: Page): Promise<void> {
  for (
    let i = 0;
    i < 3 &&
    (await page
      .locator('dialog[open]')
      .count()
      .catch(() => 0));
    i++
  ) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(300)
  }
  const x = voltarParaTudo(page)
  if (await x.isVisible().catch(() => false)) await x.click({ timeout: 3000 }).catch(() => {})
}

/**
 * Fecha o que pode estar por cima da tela: as recompensas (conquista, baú, nível — um diálogo por vez,
 * cada um animando com atraso, botão "Resgatar e continuar" ou "Continuar") e a sala da primeira
 * visita ao Jogar ("Fechar sem mudar nada"). Chamado mais de uma vez de propósito: a fila de
 * recompensas chega depois do primeiro `<main>` visível.
 */
export async function fecharSobreposicoes(page: Page) {
  const recompensa = page
    .getByRole('dialog')
    .getByRole('button', { name: /^(Resgatar e continuar|Continuar)$/ })
    .first()
  for (let i = 0; i < 40; i++) {
    if (!(await recompensa.isVisible().catch(() => false))) break
    await recompensa.click({ force: true, timeout: 2000 }).catch(() => {})
    await page.waitForTimeout(250)
  }
  /* O CLIQUE PRECISA DE PRAZO: uma recompensa pode estar POR CIMA deste botão, e um `click()` sem
     prazo espera a interceptação sumir até o teste inteiro estourar. Com prazo curto e a falha
     engolida, quem chama tenta de novo (o laço de `irParaPraticar`). */
  const fecharSala = salaDeEscolha(page).getByRole('button', { name: 'Fechar sem mudar nada' })
  if (await fecharSala.isVisible().catch(() => false)) {
    await fecharSala.click({ timeout: 2000 }).catch(() => {})
  }
}

/**
 * Clica robusto às recompensas que continuam surgindo: tenta clicar e, se um diálogo interceptar,
 * fecha as sobreposições e tenta de novo, em vez de martelar o mesmo clique por 30 s.
 */
export async function clicarRobusto(page: Page, locator: Locator) {
  for (let i = 0; i < 10; i++) {
    try {
      await locator.click({ timeout: 3000 })
      return
    } catch {
      await fecharSobreposicoes(page)
      await page.waitForTimeout(200)
    }
  }
  await locator.click()
}

/**
 * AS RECOMPENSAS CHEGAM DEPOIS DO `<main>`. Navegador novo = posse local vazia: as conquistas que o
 * banco já cumpre são reavaliadas, creditadas e entram na fila — métricas, créditos e o pedaço do
 * diálogo, tudo assíncrono. Fechar logo após o `<main>` corria contra isso: a recompensa abria no meio
 * do teste, por cima do que ele ia tocar (e um diálogo modal por cima deixa o de baixo inerte: nem o
 * `getByRole` o enxerga). A rede quieta marca o fim dessa cadeia; aí fecha-se o que ela enfileirou.
 * O prazo é curto e a falha é engolida: uma tela que nunca aquieta a rede não pode travar o teste.
 */
export async function assentar(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  await fecharSobreposicoes(page)
}

/** Abre uma rota, espera o `<main>` e fecha as recompensas da chegada. */
export async function abrirTela(page: Page, caminho: string) {
  await page.goto(caminho)
  await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
  await assentar(page)
}

/**
 * Espera `alvo` ficar à vista fechando as recompensas que abrirem por cima no caminho. Para o que o
 * teste acabou de abrir (uma folha, um diálogo): uma recompensa que chega depois o cobre e o torna
 * inerte, e a espera simples falharia por um motivo que não é da tela testada.
 */
export async function verSemSobreposicao(page: Page, alvo: Locator, ms = 15_000) {
  await expect(async () => {
    await fecharSobreposicoes(page)
    await expect(alvo).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: ms })
}

/**
 * Abre o Jogar até o lobby estar livre: a sala da primeira visita e as recompensas entram em momentos
 * diferentes do primeiro `<main>` visível, então repete até a grade aparecer sem nada por cima.
 */
export async function irParaPraticar(page: Page, rota = '/jogar') {
  await page.goto(rota)
  await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
  await assentar(page)
  const grade = page.locator('#grade-de-jogos')
  for (let i = 0; i < 30; i++) {
    await fecharSobreposicoes(page)
    const livre =
      (await grade.isVisible().catch(() => false)) &&
      !(await salaDeEscolha(page)
        .isVisible()
        .catch(() => false))
    if (livre) break
    await page.waitForTimeout(400)
  }
  /* Se o lobby não veio, a mensagem diz o que a tela mostrava: "não apareceu" sozinho não distingue
     uma tela de erro de um carregamento que não terminou. */
  const mostrava = (
    await page
      .getByRole('main')
      .innerText()
      .catch(() => '')
  )
    .replace(/\s+/g, ' ')
    .slice(0, 200)
  await expect(lobby(page), `o lobby do Jogar não apareceu; a tela mostrava: "${mostrava}"`).toBeVisible()
  await expect(salaDeEscolha(page)).toBeHidden()
  /* O CONTEÚDO ESCOLHIDO É DA CONTA: o que outra suíte escolheu (um baralho, a trilha de outro idioma) viria
     junto. Quem entra sem dizer o conteúdo no endereço parte de "Tudo". */
  if (!rota.includes('?')) await devolverTudo(page)
}

/**
 * O BOTÃO APARECE DEPOIS DO DADO CHEGAR, e é isso que separa um pulo honesto de um teste decorativo:
 * espera de verdade antes de dizer que não há.
 */
export async function apareceEmAte(alvo: Locator, ms = 5000): Promise<boolean> {
  return alvo
    .waitFor({ state: 'visible', timeout: ms })
    .then(() => true)
    .catch(() => false)
}

/**
 * QUEM DECIDE SE HÁ BARALHO É O SERVIDOR, não a ausência de um botão na tela: um pulo que diz "não há
 * baralho" quando a chamada falhou esconde um defeito atrás de uma justificativa tranquilizadora.
 */
export async function baralhosNoServidor(page: Page): Promise<{ quantos: number; porque: string }> {
  const r = await page.request.get('/api/anki/decks').catch((e) => ({ erro: String(e) }) as never)
  if (!('ok' in r)) return { quantos: 0, porque: `a chamada a /api/anki/decks falhou: ${(r as { erro: string }).erro}` }
  if (!r.ok()) return { quantos: 0, porque: `/api/anki/decks respondeu HTTP ${r.status()}` }
  const corpo = await r.text().catch(() => '')
  let decks: unknown
  try {
    decks = JSON.parse(corpo)
  } catch {
    return { quantos: 0, porque: `/api/anki/decks devolveu algo que não é JSON: ${corpo.slice(0, 120)}` }
  }
  if (!Array.isArray(decks)) return { quantos: 0, porque: `/api/anki/decks devolveu ${typeof decks}, não uma lista` }
  return { quantos: decks.length, porque: decks.length ? '' : 'o servidor não tem nenhum baralho importado' }
}

/**
 * ABRE O CATÁLOGO "Escolher o conteúdo" pela ficha do cabeçalho e o devolve. Cada fonte é uma linha
 * (`[data-fx-fonte]`: `tudo`, `dificeis`, `sessao:<id>`, `anki:<id>`, `trilha`); "Usar" escolhe (no celular,
 * a linha inteira).
 */
export async function abrirSeletor(page: Page): Promise<Locator> {
  const painel = painelDaFonte(page)
  if (!(await painel.isVisible().catch(() => false))) {
    const chip = chipDaFonte(page)
    await chip.waitFor({ state: 'visible', timeout: 15_000 })
    await clicarRobusto(page, chip)
  }
  await expect(painel).toBeVisible()
  return painel
}

/** ESCOLHE UMA FONTE NO CATÁLOGO pela chave da linha e espera o catálogo fechar. */
export async function escolherConteudo(page: Page, chave: string): Promise<void> {
  const painel = await abrirSeletor(page)
  const linha = painel.locator(`[data-fx-fonte="${chave}"]`)
  await expect(linha, `o catálogo deveria listar a fonte "${chave}"`).toBeVisible({ timeout: 15_000 })
  if ((await linha.getAttribute('data-em-uso')) === '1') {
    await painel.locator('button.x').click()
  } else if (naBarraDeCinco(page)) {
    await clicarRobusto(page, linha)
  } else {
    await clicarRobusto(page, painel.locator(`.fx-linha-caixa > [data-fx-usar="${chave}"]`))
  }
  await expect(painel).toBeHidden()
}

/**
 * ABRE "BUSCAR E ORGANIZAR" numa seção ("Buscar e filtrar", "Favoritos e ordem" ou "Opções") e devolve o
 * painel. É onde mora o que a gaveta da fonte tinha e o catálogo não cobre.
 */
export async function abrirOrganizar(page: Page, secao: string): Promise<Locator> {
  const painel = page.getByRole('dialog', { name: 'Buscar e organizar' })
  if (!(await painel.isVisible().catch(() => false)))
    await clicarRobusto(page, lobby(page).getByRole('button', { name: 'Buscar e organizar os jogos' }))
  await expect(painel).toBeVisible()
  const aba = painel.getByRole('tab', { name: secao })
  if ((await aba.getAttribute('aria-selected')) !== 'true') await clicarRobusto(page, aba)
  await expect(aba).toHaveAttribute('aria-selected', 'true')
  return painel
}

/**
 * ABRE O PAINEL "MAIS" (o diálogo "Mais destinos") pelo último botão do trilho — ou da barra de cinco,
 * no celular — e o devolve.
 */
export async function abrirMais(page: Page): Promise<Locator> {
  const mais = page.getByRole('dialog', { name: 'Mais destinos' })
  if (!(await mais.isVisible().catch(() => false))) {
    await clicarRobusto(page, trilho(page).locator('.q-mais-botao'))
  }
  await expect(mais).toBeVisible()
  return mais
}

/**
 * VAI AO JOGAR PELO MENU, como a pessoa vai em cada largura: no trilho (computador e tablet) o Jogar
 * tem botão próprio; na barra de cinco do celular ele mora atrás do "Praticar", que abre a última das
 * duas telas de praticar — e, se abrir os Cartões, a aba "Jogos" do alto leva ao Jogar.
 */
export async function irAoJogarPeloMenu(page: Page) {
  if (!naBarraDeCinco(page)) {
    await clicarRobusto(page, trilho(page).locator('.q-item[data-px-rota="play"]'))
  } else {
    await clicarRobusto(page, trilho(page).getByRole('button', { name: 'Praticar', exact: true }))
    await expect(page).toHaveURL(/\/(cartoes|jogar)/, { timeout: 10_000 })
    if (!/\/jogar/.test(new URL(page.url()).pathname)) {
      await clicarRobusto(page, abasDePraticar(page).getByRole('tab', { name: 'Jogos' }))
    }
  }
  await expect(page).toHaveURL(/\/jogar/, { timeout: 10_000 })
}

/**
 * O CELULAR DE VERDADE NÃO TEM `getDisplayMedia`. O `devices['Pixel 7']` do Playwright muda a tela, o
 * toque e o user agent, mas o Chromium por baixo continua com a captura de tela do desktop — e a
 * captura então se comportava como no computador, escondendo do e2e justamente o caminho que falhou
 * no aparelho do dono (2026-09-28). Chamar ANTES do `goto`: o script roda em cada documento.
 */
export async function semCapturaDeTela(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      delete (MediaDevices.prototype as { getDisplayMedia?: unknown }).getDisplayMedia
      delete (navigator.mediaDevices as { getDisplayMedia?: unknown }).getDisplayMedia
    } catch {
      /* sem mediaDevices: já é o caso */
    }
  })
}
