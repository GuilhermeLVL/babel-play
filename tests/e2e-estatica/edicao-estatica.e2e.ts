import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { abrirLobbyDaTrilha, cartaoDoJogo, chegarAoFim, entrarNoJogo, palco, semExplicacao, terminou } from './_jogos'

/**
 * A EDIÇÃO ESTÁTICA DE PONTA A PONTA, contra o `dist/` servido como o Cloudflare Pages serve.
 *
 * O que ela prova, e o que a build antiga quebrava:
 *  - NENHUMA requisição a `/api` sai da página — no Pages, `/api/*` devolve o `index.html` (200) e
 *    as telas quebravam lendo HTML como JSON;
 *  - nenhum erro no console nem exceção de página em nenhuma das telas principais;
 *  - nada de login, criar conta ou planos à vista — onde a tela não existe sem servidor, o cartão
 *    diz que ela está na versão completa;
 *  - dá para jogar uma rodada inteira sem microfone (Duelo relâmpago com as palavras da Trilha,
 *    que vêm embutidas em `public/`), e ela fica gravada no navegador (IndexedDB `babel-local`).
 *
 * DESENHO NOVO (09/10/2026). O menu é o trilho de ícones (a barra de cinco destinos no celular); o que
 * o menu da conta dizia ("edição de demonstração", sem "Entrar" nem "Planos") mora agora no painel
 * "Mais". O Duelo se joga no tabuleiro novo (`.opcoes-blitz`) e termina em `casca/FimDaRodada`.
 *
 * AVISOS BENIGNOS (não são erro, e por isso não entram na conta): o `warning` do Chrome "The
 * AudioContext was not allowed to start" — política de autoplay; os efeitos sonoros criam o
 * contexto antes do primeiro gesto e ele é retomado no clique. Nenhum `error` é tolerado.
 */

const PASTA = process.env.SCREENSHOTS_ESTATICA || path.join('test-results', 'estatica')
mkdirSync(PASTA, { recursive: true })

/** Botões/links que NÃO podem existir numa edição sem servidor. */
const PROIBIDO = /(?<!\p{L})(entrar|criar conta|crie uma conta|planos|assinar|assine|comprar créditos)(?!\p{L})/iu

interface Coleta {
  apis: string[]
  erros: string[]
}

function coletar(page: Page): Coleta {
  const c: Coleta = { apis: [], erros: [] }
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/api')) c.apis.push(`${r.method()} ${u.pathname}`)
  })
  page.on('console', (m) => {
    if (m.type() === 'error') c.erros.push(m.text())
  })
  page.on('pageerror', (e) => c.erros.push(`pageerror: ${e.message}`))
  return c
}

async function semProibidos(page: Page, onde: string) {
  const alvos = page.locator('button:visible, a:visible, [role="menuitem"]:visible')
  const nomes = (await alvos.evaluateAll((els) =>
    els.map((el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim()),
  )) as string[]
  const achados = nomes.filter((n) => PROIBIDO.test(n))
  expect(achados, `${onde}: controles de conta/planos à vista`).toEqual([])
}

async function abrir(page: Page, rota: string) {
  await page.goto(rota)
  await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Carregando…').first()).toBeHidden({ timeout: 20_000 })
  await page.waitForTimeout(600)
}

test.beforeEach(async ({ page }) => {
  await semExplicacao(page, ['blitz'])
})

test('edição estática: telas principais sem /api, sem erro, sem login nem planos', async ({ page }, info) => {
  const coleta = coletar(page)
  const sufixo = info.project.name

  await abrir(page, '/')
  // A primeira visita pode abrir a apresentação: escolhe rodar no aparelho (a única opção aqui).
  const pular = page.getByRole('button', { name: 'Pular apresentação' })
  if (await pular.isVisible().catch(() => false)) {
    await pular.click()
    await expect(page.getByRole('radio', { name: /Usar minha chave/ })).toHaveCount(0) // o passo da IA não existe mais
    await page.getByRole('button', { name: /Começar/ }).click()
    await expect(page.getByRole('main')).toBeVisible()
  }
  await semProibidos(page, 'início')
  await page.screenshot({ path: path.join(PASTA, `inicio-${sufixo}.png`) })

  // O painel "Mais" (o que o menu da conta era): sem "Entrar", sem "Planos", e dizendo o que a edição é.
  await page.locator('.q-trilho .q-mais-botao').click()
  const mais = page.getByRole('dialog', { name: 'Mais destinos' })
  await expect(mais).toBeVisible()
  await expect(mais.getByTestId('conta-no-quest')).toContainText('edição de demonstração')
  await expect(mais.getByTestId('planos-no-mais')).toHaveCount(0)
  await semProibidos(page, 'painel Mais')
  await page.screenshot({ path: path.join(PASTA, `mais-${sufixo}.png`) })
  await mais.getByRole('button', { name: 'Fechar' }).click()
  await expect(mais).toBeHidden()

  await abrir(page, '/capturar')
  await semProibidos(page, 'capturar')
  await expect(page.getByText('Autorizar IA de nuvem')).toHaveCount(0)
  await page.screenshot({ path: path.join(PASTA, `capturar-${sufixo}.png`) })

  // Telas que só existem com servidor: o cartão honesto, sem botão de login.
  // A rodada de revisão (`/revisar`, hoje `/cartoes/estudar`) continua entre elas.
  for (const rota of ['/biblioteca', '/revisar', '/plano']) {
    await abrir(page, rota)
    await expect(page.getByTestId('cartao-de-convite'), rota).toContainText('Disponível na versão completa')
    await semProibidos(page, rota)
  }
  await page.screenshot({ path: path.join(PASTA, `versao-completa-${sufixo}.png`) })

  /* CARTÕES ABRE TAMBÉM SEM SERVIDOR, no estado vazio (navegação de 10/10/2026): a tela explica como os
     cartões nascem, não oferece o "+ Palavra" (que gravaria na conta) e não pede nada a `/api`. O
     Vocabulário, que aqui era um cartão de "versão completa", virou a aba "Palavras" dela. */
  await abrir(page, '/cartoes')
  const cartoes = page.getByTestId('cartoes')
  await expect(cartoes).toHaveAttribute('data-ct-hoje', 'vazio')
  await expect(cartoes.getByRole('heading', { name: 'Seus cartões aparecem aqui' })).toBeVisible()
  await expect(cartoes.locator('header.q-cab').getByRole('button', { name: 'Palavra' })).toHaveCount(0)
  await expect(page.getByTestId('cartao-de-convite')).toHaveCount(0)
  await semProibidos(page, '/cartoes')
  await page.screenshot({ path: path.join(PASTA, `cartoes-${sufixo}.png`) })
  /* As abas que saíram (Baralhos, Trazer e levar) caem em /cartoes; a Memória é tela de dentro, com voltar. */
  for (const rota of ['/cartoes/baralhos', '/cartoes/trazer']) {
    await abrir(page, rota)
    await expect(page, rota).toHaveURL(/\/cartoes$/)
    await expect(cartoes.getByRole('tab', { name: /^Hoje/ }), rota).toHaveAttribute('aria-selected', 'true')
    await semProibidos(page, rota)
  }
  await abrir(page, '/cartoes/memoria')
  await expect(cartoes.getByRole('heading', { level: 1, name: 'Memória' })).toBeVisible()
  await expect(cartoes.getByRole('button', { name: 'Voltar para Cartões' })).toBeVisible()
  await semProibidos(page, '/cartoes/memoria')
  // O endereço de antes do Vocabulário abre a aba "Palavras", com o caderno vazio.
  await abrir(page, '/vocabulario')
  await expect(page).toHaveURL(/\/cartoes\/palavras$/)
  await expect(cartoes.getByRole('tab', { name: /^Palavras/ })).toHaveAttribute('aria-selected', 'true')
  await expect(cartoes.getByRole('heading', { name: 'Seu caderno está vazio' })).toBeVisible()
  await semProibidos(page, '/vocabulario')

  await abrir(page, '/estatisticas')
  await expect(page.getByRole('heading', { name: 'Estatísticas' }).first()).toBeVisible()
  await expect(page.getByTestId('cartao-de-convite')).toHaveCount(0)
  await semProibidos(page, 'estatísticas')

  for (const rota of ['/ajustes', '/personalizar', '/sobre', '/ajuda']) {
    await abrir(page, rota)
    await semProibidos(page, rota)
  }
  // Ajustes → Processamento: só "Rodar no seu aparelho".
  await abrir(page, '/ajustes')
  await page.getByRole('tab', { name: 'Processamento' }).click()
  await expect(page.getByText('Rodar no seu aparelho')).toBeVisible()
  await expect(page.getByText('Usar a sua chave (nuvem)')).toHaveCount(0)
  await page.screenshot({ path: path.join(PASTA, `ajustes-${sufixo}.png`) })

  expect(coleta.apis, 'requisições a /api').toEqual([])
  expect(coleta.erros, 'erros no console').toEqual([])
})

test('edição estática: uma rodada inteira sem microfone, gravada no navegador', async ({ page }, info) => {
  const coleta = coletar(page)

  // As palavras da Trilha vêm embutidas no site (public/trilha): dá para jogar sem ter capturado nada.
  await abrirLobbyDaTrilha(page)
  await semProibidos(page, 'jogar')
  await expect(cartaoDoJogo(page, 'blitz')).toContainText('Duelo relâmpago')
  await page.screenshot({ path: path.join(PASTA, `jogar-${info.project.name}.png`) })
  await entrarNoJogo(page, 'blitz')

  // Responde a primeira alternativa de pé até a rodada acabar (por item ou pelo relógio de 60 s).
  const alternativas = palco(page).locator('.opcoes-blitz button:enabled')
  await expect(alternativas.first()).toBeVisible({ timeout: 15_000 })
  for (let i = 0; i < 120 && !(await terminou(page)); i++) {
    await alternativas
      .first()
      .click({ timeout: 2000 })
      .catch(() => {})
    await page.waitForTimeout(250)
  }
  const fim = await chegarAoFim(page, 'blitz', 70_000)
  await expect(fim).toContainText('Rodada concluída')
  // Sem servidor não há ranking de comunidade: o envio nem é oferecido.
  await expect(page.getByText('Ranking global')).toHaveCount(0)

  // A rodada ficou no IndexedDB do navegador (o "servidor" desta edição).
  const gravadas = await page.evaluate(
    () =>
      new Promise<number>((ok) => {
        const req = indexedDB.open('babel-local')
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('exercicios')) return ok(0)
          const conta = db.transaction('exercicios').objectStore('exercicios').count()
          conta.onsuccess = () => ok(conta.result)
          conta.onerror = () => ok(-1)
        }
        req.onerror = () => ok(-1)
      }),
  )
  expect(gravadas, 'respostas da rodada gravadas no IndexedDB').toBeGreaterThan(0)

  expect(coleta.apis, 'requisições a /api').toEqual([])
  expect(coleta.erros, 'erros no console').toEqual([])
})
