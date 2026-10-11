import { expect, type Page, test } from '@playwright/test'

import { botaoEncerrar, falar, iniciarCaptura } from './_captura'
import { abrirTela, clicarRobusto, fecharSobreposicoes, irParaPraticar, lobby, verSemSobreposicao } from './_helpers'

/**
 * AS TELAS ENXUTAS NO NAVEGADOR DE VERDADE (protótipo `telas-enxutas`, 10/10/2026): Capturar e Jogar com
 * menos coisas à vista, no computador e no celular, e CADA FUNÇÃO DE ANTES AINDA ALCANÇÁVEL.
 *
 *  - Capturar: uma fileira em cima (idioma, chip de estado, microfone, ajustes); a folha do chip guarda a
 *    escolha do nível, a linha do modelo e a "Ajuda da captura"; a ajuda também mora no cabeçalho do
 *    painel de ajustes; A− e A+ só com texto na tela; gravando, o PAUSAR ao lado do Encerrar.
 *  - O Pausar é a pausa de verdade das fontes (`pausarFontes`/`retomarFontes`, `salvarSessao.ts`): o
 *    relógio da captura para e volta a andar. Aqui a captura começa com a mídia falsa do Chromium.
 *  - Jogar (10/10/2026): o cabeçalho é o título e a ficha de conteúdo; a "Sugestão para hoje" saiu; "Sortear" é
 *    um botão pequeno ao lado de "Buscar e organizar". O texto de antes dizia: "Começar" é o único botão cheio;
 *    "Sortear um jogo", "Por que este?" e "Outra sugestão" são
 *    links do cartão; "Buscar e organizar" abre UM painel com as três seções; no celular nada rola de lado.
 */
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--auto-select-desktop-capture-source=Entire screen',
    ],
  },
})

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name === 'tablet-768', 'a arrumação tem duas formas: a larga e a do celular')
  // Nenhum modelo de fala/tradução é baixado: as falas entram prontas (`window.__simFalas`).
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
})

const estreita = (page: Page) => (page.viewportSize()?.width ?? 0) < 720
const tela = (page: Page) => page.getByTestId('captura-do-prototipo')
const chip = (page: Page) => page.getByTestId('chip-de-estado')
const folha = (page: Page) => page.getByTestId('como-isto-funciona')
const relogio = (page: Page) => tela(page).locator('.q-tempo .tn')

async function abrirFolha(page: Page) {
  await clicarRobusto(page, chip(page))
  await verSemSobreposicao(page, folha(page))
  return folha(page)
}

test('Capturar pronta: uma fileira em cima, e a folha do chip guarda o nível, o modelo e a ajuda', async ({ page }) => {
  test.slow()
  await abrirTela(page, '/capturar')
  await expect(page.getByTestId('iniciar-captura')).toBeVisible({ timeout: 60_000 })
  await fecharSobreposicoes(page)

  // Em cima: o idioma, o chip de estado, o microfone e os ajustes. Nada de seletor, modelo, marca ou ajuda.
  const topo = tela(page).locator('.px-vivo-topo')
  await expect(topo.locator('button:visible')).toHaveCount(4)
  await expect(chip(page)).toBeVisible()
  await expect(tela(page).getByRole('radiogroup', { name: 'Nível de serviço' })).toHaveCount(0)
  await expect(tela(page).getByRole('button', { name: 'Ajuda', exact: true })).toHaveCount(0)
  // Embaixo: sem texto na tela não há A− nem A+, e o atalho de idioma repetido saiu.
  const faixa = page.getByRole('toolbar', { name: 'Controles da captura' })
  await expect(faixa.getByRole('button', { name: /a letra$/ })).toHaveCount(0)
  await expect(faixa.getByRole('button', { name: 'Idiomas da sessão' })).toHaveCount(0)
  await expect(faixa.locator('button:visible')).toHaveCount(estreita(page) ? 1 : 2)
  // No celular o chip de estado cabe numa linha, abaixo do idioma, e nada rola de lado.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  )

  // A folha: a escolha do nível, a ajuda e, no computador, a linha do modelo.
  const como = await abrirFolha(page)
  await expect(como.getByText('Escolha o nível')).toBeVisible()
  await expect(como.getByRole('radio', { name: /No aparelho/ })).toBeVisible()
  const ajuda = como.getByRole('button', { name: /Ajuda da captura/ })
  await expect(ajuda).toBeVisible()
  await ajuda.click()
  await expect(folha(page)).toBeHidden()
  const guia = page.getByRole('dialog', { name: 'Guia rápido' })
  await verSemSobreposicao(page, guia)
  await page.keyboard.press('Escape')
  await expect(guia).toBeHidden()

  // A ajuda também mora no cabeçalho do painel de ajustes.
  await clicarRobusto(page, tela(page).getByRole('button', { name: 'Ajustes da captura' }))
  const ajustes = page.getByRole('dialog', { name: 'Dispositivos e modelos de IA' })
  await verSemSobreposicao(page, ajustes)
  await ajustes.getByRole('button', { name: 'Ajuda da captura' }).click()
  // O guia abre por cima do painel de ajustes, que continua aberto por baixo (como no protótipo).
  await expect(guia).toBeVisible()
  await expect(ajustes).toBeAttached()
})

test('Capturar gravando: A− e A+ aparecem com o texto, e o Pausar para o relógio de verdade', async ({ page }) => {
  test.slow()
  await abrirTela(page, '/capturar')
  await iniciarCaptura(page)
  await falar(page, ['Hello there, how are you doing today?', 'I was thinking about going to the beach.'])

  const faixa = page.getByRole('toolbar', { name: 'Controles da captura' })
  await expect(faixa.getByRole('button', { name: 'Aumentar a letra' })).toBeVisible()
  await expect(chip(page)).toContainText('Legendando')

  // O Pausar fica logo depois do Encerrar.
  const pausar = page.getByTestId('pausar-captura')
  await expect(pausar).toBeVisible()
  await expect(pausar).toHaveAttribute('aria-pressed', 'false')
  expect(await pausar.evaluate((b) => b.previousElementSibling?.getAttribute('data-testid'))).toBe('encerrar-captura')

  // Gravando, o relógio anda.
  const antes = await relogio(page).textContent()
  await expect.poll(() => relogio(page).textContent(), { timeout: 8000 }).not.toBe(antes)

  // Pausada: o chip diz, o relógio para, e o que já foi legendado continua na tela.
  await clicarRobusto(page, pausar)
  await expect(pausar).toHaveAttribute('aria-pressed', 'true')
  await expect(pausar).toHaveAccessibleName('Retomar a captura')
  await expect(chip(page)).toContainText('Pausado · nada está sendo ouvido')
  const parado = await relogio(page).textContent()
  await page.waitForTimeout(2600)
  expect(await relogio(page).textContent()).toBe(parado)
  await expect(page.getByText('Hello there, how are you doing today?').first()).toBeVisible()

  // Retomada: o relógio volta a andar, com a mesma captura (o Encerrar continua lá).
  await clicarRobusto(page, pausar)
  await expect(pausar).toHaveAttribute('aria-pressed', 'false')
  await expect(chip(page)).toContainText('Legendando')
  await expect.poll(() => relogio(page).textContent(), { timeout: 8000 }).not.toBe(parado)
  await expect(botaoEncerrar(page)).toBeVisible()

  // Pausar e depois Encerrar: o diálogo abre, e "Continuar gravando" retoma.
  await clicarRobusto(page, pausar)
  await expect(pausar).toHaveAttribute('aria-pressed', 'true')
  await clicarRobusto(page, botaoEncerrar(page))
  const encerrar = page.getByRole('dialog', { name: /Encerrar a sessão/ })
  await expect(encerrar).toBeVisible()
  await encerrar.getByRole('button', { name: 'Continuar gravando' }).click()
  await expect(encerrar).toBeHidden()
  await expect(pausar).toHaveAttribute('aria-pressed', 'false')

  // Fim: descarta, para não deixar sessão no banco.
  await clicarRobusto(page, botaoEncerrar(page))
  await expect(encerrar).toBeVisible()
  await encerrar.getByRole('button', { name: 'Descartar' }).click()
  const confirmar = page.getByRole('dialog', { name: 'Descartar esta captura?' })
  await confirmar.getByRole('button', { name: 'Descartar' }).click()
  await expect(page.getByTestId('pausar-captura')).toHaveCount(0)
  await expect(botaoEncerrar(page)).toHaveCount(0)
})

test('Jogar: a ficha de conteúdo no cabeçalho, "Sortear" pequeno e "Buscar e organizar" com as três seções', async ({
  page,
}) => {
  test.slow()
  await irParaPraticar(page)
  const tela = lobby(page)

  // Nada de "Partida rápida" nem dos três chips: um controle só, e nada rola de lado.
  await expect(tela.getByRole('button', { name: 'Partida rápida' })).toHaveCount(0)
  for (const antigo of ['Buscar e filtrar', 'Favoritos e ordem', 'Opções'])
    await expect(tela.getByRole('button', { name: antigo, exact: true })).toHaveCount(0)
  const organizar = tela.getByRole('button', { name: 'Buscar e organizar os jogos' })
  await expect(organizar).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  )
  const cortados = await tela.evaluate((t) => {
    const limite = t.getBoundingClientRect().right + 1
    return [...t.querySelectorAll('.q-cab button, .qj-ferramentas button, .fx-aviso button')].filter(
      (b) => b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().right > limite,
    ).length
  })
  expect(cortados, 'nenhum controle fica fora da tela, de lado').toBe(0)

  /* O CABEÇALHO (10/10/2026): o título e a ficha de conteúdo, a mesma da Biblioteca e dos Cartões. A
     "Sugestão para hoje" saiu do Jogar, com "Por que este?" e "Outra sugestão". */
  const ficha = tela.locator('header.q-cab.fs-cab .fs-ficha [data-fs="abrir"]')
  await expect(ficha).toBeVisible()
  await expect(ficha).toHaveAttribute('aria-haspopup', 'dialog')
  await expect(tela.locator('.qj-sugestao')).toHaveCount(0)
  for (const antigo of ['Começar', 'Por que este?', 'Outra sugestão'])
    await expect(tela.getByRole('button', { name: antigo, exact: true })).toHaveCount(0)
  /* A ficha é um alvo de toque inteiro (44 px ou mais). */
  expect((await ficha.boundingBox())!.height).toBeGreaterThanOrEqual(44)

  /* "Sortear" sobrevive pequeno, ao lado de "Buscar e organizar", só onde cabe (fora do celular). */
  const sortear = tela.getByRole('button', { name: 'Sortear um jogo' })
  if ((page.viewportSize()?.width ?? 1280) > 720) {
    await expect(sortear).toBeVisible()
    await expect(sortear).toHaveClass(/fx-sortear/)
  } else {
    await expect(sortear).toBeHidden()
  }

  /* Sem a flag `anuncios` (o estado de fábrica) não há faixa de anúncio: a grade vem logo depois das abas,
     e as abas logo depois do cabeçalho (ou do aviso do estado, quando há). */
  await expect(tela.locator('.fx-anuncio, [data-ad]')).toHaveCount(0)

  /* A ficha abre o catálogo "Escolher o conteúdo", e fechar devolve o foco a ela. */
  await clicarRobusto(page, ficha)
  const catalogo = page.locator('dialog.fx-catalogo')
  await verSemSobreposicao(page, catalogo)
  await expect(catalogo.locator('[data-fx-fonte="tudo"]')).toBeVisible({ timeout: 15_000 })
  await catalogo.locator('button.x').click()
  await expect(catalogo).toBeHidden()
  await expect(ficha).toBeFocused()

  // Um painel, três seções: o miolo de cada uma é o do painel de antes.
  await clicarRobusto(page, organizar)
  const painel = page.getByRole('dialog', { name: 'Buscar e organizar' })
  await verSemSobreposicao(page, painel)
  await expect(painel.getByRole('tab')).toHaveCount(3)
  await expect(painel.getByRole('tab', { name: 'Buscar e filtrar' })).toHaveAttribute('aria-selected', 'true')
  const busca = painel.getByRole('searchbox', { name: 'Buscar jogo' })
  await expect(busca).toBeVisible()
  await expect(painel.getByRole('radiogroup', { name: 'Filtrar por habilidade' })).toBeVisible()

  await painel.getByRole('tab', { name: 'Favoritos e ordem' }).click()
  await expect(painel.locator('.qj-ordem > li').first()).toBeVisible()
  await expect(painel.getByRole('button', { name: /^Favoritar: / }).first()).toBeVisible()
  await expect(painel.getByRole('button', { name: /^Como se joga: / }).first()).toBeVisible()
  await expect(painel.getByRole('button', { name: 'Pronto' })).toBeVisible()

  await painel.getByRole('tab', { name: 'Opções' }).click()
  await expect(painel.getByRole('switch', { name: /Prévia antes de começar|Ver antes de jogar/ })).toBeVisible()
  await expect(painel.getByRole('button', { name: /Recordes/ })).toBeVisible()
  await expect(painel.getByRole('button', { name: /Mapa do conteúdo/ })).toBeVisible()
  await expect(painel.getByRole('button', { name: /Tela de sempre/ })).toBeVisible()
  await expect(page.locator('dialog[open]')).toHaveCount(1)

  // A busca filtra a grade de verdade, e o aviso do filtro oferece limpar.
  await painel.getByRole('tab', { name: 'Buscar e filtrar' }).click()
  await busca.fill('zzzz-nenhum-jogo')
  await painel.getByRole('button', { name: /^Ver \d+ jogos?$/ }).click()
  await expect(painel).toBeHidden()
  const aviso = tela.locator('[data-filtro]')
  await expect(aviso).toContainText('zzzz-nenhum-jogo')
  await aviso.getByRole('button', { name: 'Limpar filtros e busca' }).click()
  await expect(aviso).toHaveCount(0)
})
