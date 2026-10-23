import { expect, type Page, test } from '@playwright/test'

import { violacoesGraves } from './_acessibilidade'
import { abasDePraticar, abrirMais, clicarRobusto, fecharSobreposicoes, trilho } from './_helpers'

/**
 * FUNDAÇÃO (23/09/2026) — o que o shell novo promete e o que as duas telas-molde garantem.
 *
 * - Início e Ajustes sem violação WCAG 2.2 AA séria ou crítica (`_acessibilidade.ts`: `axe-core`
 *   já é dependência, e o wrapper do Playwright seria um pacote a mais para a mesma coisa).
 * - Nenhuma tela rola de lado, em nenhum dos três tamanhos.
 * - O trilho de ícones leva a todo destino: no computador e no tablet, oito no trilho (Início,
 *   Capturar, Intérprete, Cartões, Jogar, Biblioteca, Progresso, Planos) e o resto no 'Mais'; abaixo de
 *   720 px, a barra de cinco (Início, Cartões, Capturar, Jogar, Mais), com Intérprete, Biblioteca e
 *   Progresso também no 'Mais'.
 * - iChat fixo: divide a linha com o conteúdo, a largura muda pela alça e volta a flutuar sozinho
 *   quando a janela fica estreita demais.
 */
async function abrir(page: Page, caminho = '/') {
  await page.goto(caminho)
  await expect(page.getByRole('main')).toBeVisible()
  /* O MODAL DE RESGATE CHEGA DEPOIS DO `<main>`. Contexto novo = posse local vazia: as conquistas
     que o banco já cumpre (as das sessões e cartões que outros testes gravaram — a sessão demo
     do banco novo não conta desde 30/09) são reavaliadas, creditadas e entram na fila — métricas, créditos e o chunk do modal, tudo
     assíncrono. Fechar logo após o `<main>` corria contra isso: o diálogo abria no meio do teste,
     roubava o foco (as setas da alça do iChat iam para o "Resgatar") e barrava o hover do menu.
     A rede quieta marca o fim dessa cadeia; aí fecha-se o que ela enfileirou. */
  await page.waitForLoadState('networkidle')
  await fecharSobreposicoes(page)
  await expect(page.locator('dialog[open]')).toHaveCount(0)
}

const semRolagemLateral = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

for (const [nome, caminho] of [
  ['Início', '/'],
  ['Ajustes', '/ajustes'],
] as const) {
  test(`${nome}: um h1, sem violação grave de acessibilidade e sem rolagem lateral`, async ({ page }) => {
    await abrir(page, caminho)
    await expect(page.locator('h1')).toHaveCount(1)
    expect(await violacoesGraves(page)).toEqual([])
    expect(await semRolagemLateral(page)).toBe(true)
  })
}

/**
 * O TRILHO (`nav.q-trilho`, `TrilhoDoQuest`) é a única navegação do app. No lugar do menu lateral que
 * recolhia (por botão e por Ctrl+B, `babel.rail_collapsed`) — que saiu com o desenho de antes —, o que
 * a casca promete agora é: todo destino tem porta, em qualquer largura, e a porta leva à tela.
 */
test('o trilho leva a todo destino: os do trilho direto, o resto pelo "Mais"', async ({ page }) => {
  test.slow()
  await abrir(page)
  const estreito = (page.viewportSize()?.width ?? 0) < 720
  const nav = trilho(page)
  await expect(nav).toBeVisible()

  /* A NAVEGAÇÃO DE 22/10/2026 (R40). No computador e no tablet o trilho tem oito destinos: Início,
     Capturar, Intérprete, Cartões, Jogar, Biblioteca, Progresso e Planos. Abaixo de 720 px ele é a barra
     de cinco (Início, Cartões, Capturar, Jogar, Mais): Intérprete, Biblioteca e Progresso passam ao
     "Mais" e Planos fica na faixa "Planos e Premium" dele. Personalizar mora no "Mais" em todo aparelho. */
  const noTrilho: Array<[RegExp, RegExp]> = [
    [/^(Início|Página Inicial)$/, /\/$/],
    // O Jogar antes dos outros: a sala da primeira visita abre por cima, e sair da tela a leva junto.
    [/^(Jogar|Praticar)$/, /\/jogar/],
    [/^(Capturar|Gravar|Gravar Áudio)$/, /\/capturar/],
    [/^Cartões$/, /\/cartoes$/],
  ]
  /** Só no trilho acima de 720 px; na barra de cinco, cada um vai para o "Mais". */
  const interprete: [RegExp, RegExp] = [/^Intérprete/, /\/interprete/]
  const biblioteca: [RegExp, RegExp] = [/^(Biblioteca|Minhas Mídias)/, /\/biblioteca/]
  const progresso: [RegExp, RegExp] = [/^(Progresso|Meu progresso)/, /\/estatisticas/]
  const planos: [RegExp, RegExp] = [/^(Planos|Planos e preços)/, /\/plano/]
  const soNoMais: Array<[RegExp, RegExp]> = [
    [/^(Personalizar|Meu visual)/, /\/loja/],
    [/^Sobre/, /\/sobre/],
    [/^(Ajustes|Configurações)/, /\/ajustes/],
  ]

  for (const [nome, url] of [...noTrilho, ...(estreito ? [] : [biblioteca, progresso, planos])]) {
    const item = nav.getByRole('button', { name: nome })
    await expect(item, `${nome} deveria estar no trilho`).toBeVisible()
    await clicarRobusto(page, item)
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('main')).toBeVisible()
    await expect(item).toHaveAttribute('aria-current', 'page')
  }
  if (estreito) {
    for (const nome of [interprete[0], biblioteca[0], progresso[0], planos[0]])
      await expect(nav.getByRole('button', { name: nome })).toHaveCount(0)
    await expect(nav.locator('.q-item:visible')).toHaveCount(5)
    await clicarRobusto(page, nav.getByRole('button', { name: 'Cartões', exact: true }))
    await expect(page).toHaveURL(/\/cartoes$/)
    /* A TELA, e não só o endereço: a URL muda antes de a troca de tela terminar, e o "Mais" fecha
       sozinho em toda troca. Abri-lo no meio dela deixava o teste procurando um painel que já saiu. */
    await expect(page.getByTestId('cartoes')).toBeVisible()
    await clicarRobusto(page, abasDePraticar(page).getByRole('tab', { name: 'Jogos' }))
    await expect(page).toHaveURL(/\/jogar/)
    /* A sala e as recompensas do Jogar engolem o primeiro toque: fecha e repete até a troca acontecer. */
    await expect(async () => {
      await fecharSobreposicoes(page)
      await clicarRobusto(page, abasDePraticar(page).getByRole('tab', { name: 'Cartões' }))
      await expect(page).toHaveURL(/\/cartoes$/, { timeout: 2500 })
    }).toPass({ timeout: 20_000 })
    await expect(page.getByTestId('cartoes')).toBeVisible()
  } else {
    // Acima de 720 px cada tela tem o seu item no trilho, e as abas de praticar não existem.
    await expect(abasDePraticar(page)).toHaveCount(0)
    for (const nome of [/^(Personalizar|Meu visual)/])
      await expect(nav.getByRole('button', { name: nome }), `${nome} saiu do trilho`).toHaveCount(0)
    /* O "Mais" não repete o que o trilho já tem: nem Progresso, nem Biblioteca, nem o ladrilho de Planos. */
    const mais = await abrirMais(page)
    const destinos = mais.getByRole('tabpanel', { name: 'Destinos' })
    for (const [nome] of [interprete, biblioteca, progresso, planos])
      await expect(destinos.getByRole('button', { name: nome }), `${nome} só no trilho`).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(mais).toBeHidden()
  }

  for (const [nome, url] of [...(estreito ? [biblioteca, progresso] : []), ...soNoMais]) {
    const mais = await abrirMais(page)
    const porta = mais.getByRole('tabpanel', { name: 'Destinos' }).getByRole('button', { name: nome })
    await expect(porta, `${nome} deveria estar no "Mais"`).toBeVisible()
    await porta.click()
    await expect(mais, 'escolher um destino fecha o painel').toBeHidden()
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('main')).toBeVisible()
    /* Fora do trilho, quem fica marcado é o "Mais" — exceto Ajustes acima de 720 px: desde 23/10/2026 ele
       tem botão próprio no pé do trilho (engrenagem), e é esse que fica marcado. A porta pelo "Mais"
       continua valendo e é a que este laço acabou de usar; a garantia (todo destino alcançável) é a mesma. */
    const ajustesNoPe = !estreito && /Ajustes/.test(String(nome))
    await expect(nav.locator(ajustesNoPe ? '.q-ajustes-botao' : '.q-mais-botao')).toHaveAttribute(
      'aria-current',
      'page',
    )
  }
  if (!estreito) {
    // E o botão Ajustes do pé também leva à tela, direto.
    await clicarRobusto(page, nav.getByTestId('ajustes-no-trilho'))
    await expect(page).toHaveURL(/\/ajustes/)
    await expect(nav.getByTestId('ajustes-no-trilho')).toHaveAttribute('aria-current', 'page')
  }

  // A faixa "Planos e Premium" do "Mais" segue levando aos planos, sem ladrilho repetido.
  if (estreito) {
    const mais = await abrirMais(page)
    await mais.getByTestId('planos-no-mais').click()
    await expect(page).toHaveURL(planos[1])
  }

  // O pé do "Mais" guarda os três ajustes rápidos, e Esc fecha o painel.
  const mais = await abrirMais(page)
  await expect(mais.getByRole('button', { name: /^Tema (claro|escuro)$/ })).toBeVisible()
  await expect(mais.getByRole('button', { name: /^Som dos toques: (ligado|desligado)$/ })).toBeVisible()
  await expect(mais.getByTestId('modo-desempenho-no-mais')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(mais).toBeHidden()
  expect(await semRolagemLateral(page)).toBe(true)

  /* O INTÉRPRETE, por último: ele abre direto na conversa frente a frente, que ocupa a tela INTEIRA —
     o trilho sai de cena, e a saída é o "Sair do modo intérprete" da própria tela, que devolve o menu. */
  if (estreito) {
    const maisInterprete = await abrirMais(page)
    await maisInterprete.getByTestId('planos-no-mais').waitFor()
    await maisInterprete
      .getByRole('tabpanel', { name: 'Destinos' })
      .getByRole('button', { name: interprete[0] })
      .click()
  } else {
    await clicarRobusto(page, nav.getByRole('button', { name: interprete[0] }))
  }
  await expect(page).toHaveURL(interprete[1])
  await expect(page.getByTestId('conversa-pronta')).toBeVisible({ timeout: 15_000 })
  await clicarRobusto(page, page.getByRole('button', { name: 'Sair do modo intérprete' }))
  await expect(page.getByTestId('conversa-pronta')).toHaveCount(0)
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('button', { name: /^(Início|Página Inicial)$/ })).toBeVisible()
})

test.describe('shell de tela grande', () => {
  test.beforeEach(({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 768, 'o iChat fixo é de tela grande')
  })

  test('iChat fixo divide a linha, muda de largura e volta a flutuar em janela estreita', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.addInitScript(() => {
      localStorage.setItem('ichat_docked', 'true')
      localStorage.setItem('ichat_largura', '400')
    })
    await abrir(page)
    await clicarRobusto(page, page.getByRole('button', { name: 'Abrir o iChat' }))

    const alca = page.getByRole('separator', { name: 'Largura do iChat' })
    await expect(alca).toBeVisible()
    const principal = page.getByRole('main')
    const antes = (await principal.boundingBox())!.width

    await alca.focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(alca).toHaveAttribute('aria-valuenow', '432')
    await expect.poll(async () => (await principal.boundingBox())!.width).toBeLessThan(antes)
    expect(await semRolagemLateral(page)).toBe(true)

    // Janela estreita: 800 − rail − 432 deixaria o conteúdo abaixo de 440 px → o chat flutua,
    // e a escolha de fixar continua marcada (o botão segue oferecendo "Soltar", como no protótipo).
    await page.setViewportSize({ width: 800, height: 800 })
    await expect(alca).toBeHidden()
    await expect(page.getByRole('button', { name: 'Soltar o iChat (janela flutuante)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(await semRolagemLateral(page)).toBe(true)

    // Com espaço de novo, a escolha de fixar volta sozinha.
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(alca).toBeVisible()
  })
})
