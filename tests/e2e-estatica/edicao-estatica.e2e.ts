import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

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
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babel_tour_blitz', '1')
    } catch {
      /* storage bloqueado */
    }
  })
})

test('edição estática: telas principais sem /api, sem erro, sem login nem planos', async ({ page }, info) => {
  const coleta = coletar(page)
  const sufixo = info.project.name

  await abrir(page, '/')
  // A primeira visita pode abrir a apresentação: escolhe rodar no aparelho (a única opção aqui).
  const pular = page.getByRole('button', { name: 'Pular apresentação' })
  if (await pular.isVisible().catch(() => false)) {
    await pular.click()
    await expect(page.getByRole('radio', { name: /Usar minha chave/ })).toHaveCount(0)
    await page.getByRole('button', { name: /Começar/ }).click()
    await expect(page.getByRole('main')).toBeVisible()
  }
  await semProibidos(page, 'início')
  await page.screenshot({ path: path.join(PASTA, `inicio-${sufixo}.png`) })

  // O menu da conta: sem "Entrar", sem "Planos", e dizendo o que a edição é.
  const conta = page.getByRole('button', { name: 'Sua conta' }).first()
  // No desktop o avatar está sempre no shell; no celular ele pode morar só no topo compacto.
  if (sufixo.startsWith('desktop')) await expect(conta).toBeVisible()
  if (await conta.isVisible().catch(() => false)) {
    await conta.click()
    const menu = page.getByRole('menu', { name: 'Sua conta' })
    await expect(menu).toBeVisible()
    await expect(menu).toContainText('edição de demonstração')
    await semProibidos(page, 'menu da conta')
    await page.keyboard.press('Escape')
  }

  await abrir(page, '/capturar')
  await semProibidos(page, 'capturar')
  await expect(page.getByText('Autorizar IA de nuvem')).toHaveCount(0)
  await page.screenshot({ path: path.join(PASTA, `capturar-${sufixo}.png`) })

  // Telas que só existem com servidor: o cartão honesto, sem botão de login.
  for (const rota of ['/biblioteca', '/vocabulario', '/plano']) {
    await abrir(page, rota)
    await expect(page.getByTestId('cartao-de-convite'), rota).toContainText('Disponível na versão completa')
    await semProibidos(page, rota)
  }
  await page.screenshot({ path: path.join(PASTA, `versao-completa-${sufixo}.png`) })

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

  await abrir(page, '/jogar')
  await semProibidos(page, 'jogar')
  // As palavras da Trilha vêm embutidas no site (public/trilha): dá para jogar sem ter capturado nada.
  await page.getByRole('radio', { name: /Trilha/ }).click()
  await page.getByRole('button', { name: /Usar estas palavras/ }).click()
  const carta = page
    .locator('#grade-de-jogos')
    .getByRole('button', { name: /^Duelo relâmpago/ })
    .first()
  await expect(carta).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: path.join(PASTA, `jogar-${info.project.name}.png`) })
  await carta.click()

  await expect(page.getByText(/Item 1 de \d+/).first()).toBeVisible({ timeout: 15_000 })
  // Responde qualquer alternativa até a rodada acabar (por item ou pelo relógio de 60 s).
  // Onda 0 (recompensas v2): o Duelo termina no fim comum de todos os jogos.
  const fim = page.getByText(/Rodada concluída/).first()
  const controles =
    /^(Pausar|Recomeçar|Cortar duas.*|Jogar|Início|Capturar|Intérprete|Biblioteca|Vocabulário|Estatísticas|Personalizar|Sobre|Ajustes|)$/
  for (let i = 0; i < 120 && !(await fim.isVisible().catch(() => false)); i++) {
    const opcoes = page.getByRole('main').getByRole('button')
    const textos = await opcoes.allInnerTexts()
    const idx = textos.findIndex((t) => !controles.test(t.replace(/\s+/g, ' ').trim()))
    if (idx >= 0)
      await opcoes
        .nth(idx)
        .click({ timeout: 2000 })
        .catch(() => {})
    await page.waitForTimeout(250)
  }
  await expect(fim).toBeVisible({ timeout: 70_000 })
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
