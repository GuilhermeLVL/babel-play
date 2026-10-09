import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { expect, type Page, test } from '@playwright/test'

import { abrirMais, clicarRobusto, fecharSobreposicoes, trilho } from './_helpers'

/**
 * FUNDAÇÃO (23/09/2026) — o que o shell novo promete e o que as duas telas-molde garantem.
 *
 * - Início e Ajustes sem violação WCAG 2.2 AA séria ou crítica (axe injetado direto: `axe-core`
 *   já é dependência, e o wrapper do Playwright seria um pacote a mais para a mesma coisa).
 * - Nenhuma tela rola de lado, em nenhum dos três tamanhos.
 * - O trilho de ícones leva a todo destino: no computador e no tablet, seis no trilho e o resto no
 *   'Mais'; abaixo de 720 px, a barra de cinco, com Estatísticas e Personalizar também no 'Mais'.
 * - iChat fixo: divide a linha com o conteúdo, a largura muda pela alça e volta a flutuar sozinho
 *   quando a janela fica estreita demais.
 */
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

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

async function violacoesGraves(page: Page) {
  /* Espera as animações de entrada terminarem: no meio de um fade o texto está semitransparente,
     e o axe mede a cor MISTURADA — acusava 4,17:1 num rótulo que, parado, passa com folga. */
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
  await page.addScriptTag({ content: AXE })
  return page.evaluate(async () => {
    type No = { target: string[]; any: { data?: { fgColor?: string; bgColor?: string; contrastRatio?: number } }[] }
    const axe = (
      window as unknown as {
        axe: {
          run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; impact: string; nodes: No[] }[] }>
        }
      }
    ).axe
    /* A marca (logotipo) fica de fora: WCAG 1.4.3 isenta logotipos do contraste mínimo. */
    const r = await axe.run(
      { exclude: [['.font-marca']] },
      {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      },
    )
    return r.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map(
        (v) =>
          `${v.id}: ${v.nodes
            .slice(0, 4)
            .map((n) => {
              const x = n.any[0]?.data
              return (
                n.target.join(' ') + (x?.contrastRatio ? ` (${x.fgColor} sobre ${x.bgColor} = ${x.contrastRatio})` : '')
              )
            })
            .join(' | ')}`,
      )
  })
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

  /* Abaixo de 720 px o trilho é a barra de cinco (Início, Jogar, Capturar, Intérprete, Mais): Estatísticas
     e Personalizar saem dela e passam ao "Mais". Acima, os seis ficam no trilho. */
  const noTrilho: Array<[RegExp, RegExp]> = [
    [/^(Início|Página Inicial)$/, /\/$/],
    // O Jogar antes dos outros: a sala da primeira visita abre por cima, e sair da tela a leva junto.
    [/^(Jogar|Praticar)$/, /\/jogar/],
    [/^(Capturar|Gravar|Gravar Áudio)$/, /\/capturar/],
  ]
  const doisQueMudam: Array<[RegExp, RegExp]> = [
    [/^(Estatísticas|Meu progresso)/, /\/estatisticas/],
    [/^(Personalizar|Meu visual)/, /\/loja/],
  ]
  const soNoMais: Array<[RegExp, RegExp]> = [
    [/^(Biblioteca|Minhas Mídias)/, /\/biblioteca/],
    [/^(Vocabulário|Palavras|Minhas Palavras)/, /\/vocabulario/],
    [/^Sobre/, /\/sobre/],
    [/^Planos/, /\/plano/],
    [/^(Ajustes|Configurações)/, /\/ajustes/],
  ]

  for (const [nome, url] of [...noTrilho, ...(estreito ? [] : doisQueMudam)]) {
    const item = nav.getByRole('button', { name: nome })
    await expect(item, `${nome} deveria estar no trilho`).toBeVisible()
    await clicarRobusto(page, item)
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('main')).toBeVisible()
    await expect(item).toHaveAttribute('aria-current', 'page')
  }
  if (estreito) {
    for (const [nome] of doisQueMudam) await expect(nav.getByRole('button', { name: nome })).toBeHidden()
    await expect(nav.locator('.q-item:visible')).toHaveCount(5)
  }

  for (const [nome, url] of [...(estreito ? doisQueMudam : []), ...soNoMais]) {
    const mais = await abrirMais(page)
    const porta = mais.getByRole('tabpanel', { name: 'Destinos' }).getByRole('button', { name: nome })
    await expect(porta, `${nome} deveria estar no "Mais"`).toBeVisible()
    await porta.click()
    await expect(mais, 'escolher um destino fecha o painel').toBeHidden()
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('main')).toBeVisible()
    // Fora do trilho, quem fica marcado é o "Mais".
    await expect(nav.locator('.q-mais-botao')).toHaveAttribute('aria-current', 'page')
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
  await clicarRobusto(page, nav.getByRole('button', { name: /^Intérprete/ }))
  await expect(page).toHaveURL(/\/interprete/)
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
