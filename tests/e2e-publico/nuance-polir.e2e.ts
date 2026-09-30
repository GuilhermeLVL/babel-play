/**
 * D7 (Fase D) — "POLIR A TRADUÇÃO DA SESSÃO" NO COMPUTADOR, ponta a ponta.
 *
 * Roda com `playwright.publico.config.ts`: login de verdade no Supabase falso, sessão e falas de
 * verdade no servidor do app (semeadas pela API), e a IA SIMULADA na página (`_nuance.ts`) — nenhum
 * POST de IA sai. O que se prova, na Análise:
 *
 *   1. Premium: "Polir a tradução da sessão" percorre os blocos (40 falas cada) com o progresso
 *      ("Polindo o bloco 1 de 3…" e a barra); cancelar espera o bloco em curso, que é aplicado; retomar
 *      continua do bloco seguinte — o polido não é pedido de novo; no fim, "Original | Polida" alterna
 *      a tradução exibida, e a original nunca some;
 *   2. Grátis: o mesmo botão, com cadeado, abre o texto positivo e "Conhecer o Premium", que leva à
 *      tela de Planos (`/plano`) — e nenhum pedido de IA sai.
 *
 *   npx playwright test -c playwright.publico.config.ts nuance-polir
 */
import { expect, type Page, test } from '@playwright/test'

import { autorizarNuvemSePedir, chegarEm, clicar, entrar, postsDeIa, semIaDeVerdade } from './_nuance'

interface FalaGuardada {
  id: string
  idx: number
  translatedText: string
}

/** Uma sessão de `n` falas, criada pela API com o token do navegador; devolve o id e as falas. */
async function semearSessao(page: Page, authorization: string, n: number) {
  const title = `Aula para polir ${Date.now()}`
  const criada = await page.request.post('/api/sessions', {
    headers: { authorization },
    data: {
      title,
      kind: 'live',
      sourceLang: 'en',
      targetLang: 'pt',
      utterances: Array.from({ length: n }, (_, i) => ({
        idx: i,
        sourceLang: 'en',
        targetLang: 'pt',
        speakerName: 'Ana',
        sourceText: `sentence number ${i}`,
        translatedText: `frase número ${i}`,
        tStartMs: i * 2000,
        tEndMs: i * 2000 + 1500,
      })),
    },
  })
  expect(criada.ok(), await criada.text()).toBe(true)
  const { id } = (await criada.json()) as { id: string }
  const lida = await page.request.get(`/api/sessions/${id}`, { headers: { authorization } })
  const falas = ((await lida.json()) as { utterances: FalaGuardada[] }).utterances.sort((a, b) => a.idx - b.idx)
  return { id, falas, titulo: title }
}

/** Foto de conferência, só quando pedida (`FOTOS_DIR`), como no e2e da captura no celular. */
async function foto(page: Page, nome: string) {
  const dir = process.env.FOTOS_DIR
  if (dir) await page.screenshot({ path: `${dir}/polir-${nome}.png` })
}

/**
 * Abre a sessão PELA BIBLIOTECA, como a pessoa abre. (Abrir `/sessao/<id>` direto numa aba nova
 * derruba a Análise enquanto a lista de gravações ainda está vazia — defeito anterior a este teste,
 * registrado à parte.)
 */
async function abrirSessao(page: Page, titulo: string) {
  await page.goto('/biblioteca')
  const cartao = page.getByRole('article', { name: `Abrir ${titulo}` })
  await chegarEm(page, cartao)
  await clicar(page, cartao)
  await chegarEm(page, page.getByRole('region', { name: 'Transcrição da sessão' }))
  await expect(page.locator('.fala-s .trad').first()).toHaveText('frase número 0', { timeout: 30_000 })
}

test('Premium: polir com progresso, cancelar, retomar e alternar original e polida', async ({ page }) => {
  test.slow()
  const escapadas = await semIaDeVerdade(page)
  const authorization = await entrar(page, { premium: true })
  const { id, falas, titulo } = await semearSessao(page, authorization, 85) // 3 blocos: 40, 40 e 5

  /* O servidor de IA simulado: polia o bloco pedido. O bloco 0 fica SEGURO até o teste soltar, para
     dar tempo de ver o progresso e cancelar no meio dele. */
  const pedidos: number[] = []
  let soltarBloco0!: () => void
  const bloco0 = new Promise<void>((r) => (soltarBloco0 = r))
  await page.route('**/api/ai/mt/polir', async (route) => {
    const corpo = route.request().postDataJSON() as { sessionId: string; bloco: number }
    expect(corpo.sessionId).toBe(id)
    pedidos.push(corpo.bloco)
    if (corpo.bloco === 0) await bloco0
    const doBloco = falas.slice(corpo.bloco * 40, corpo.bloco * 40 + 40)
    await route.fulfill({
      json: {
        bloco: corpo.bloco,
        blocos: 3,
        polidas: doBloco.map((f) => ({ id: f.id, traducaoPolida: `Polida: ${f.translatedText}` })),
        pendentes: 0,
        jaPolido: false,
      },
    })
  })

  await abrirSessao(page, titulo)
  const polir = page.getByTestId('polir-sessao')
  await autorizarNuvemSePedir(page, polir)
  await clicar(page, polir.getByRole('button', { name: /Polir a tradução da sessão/ }))

  // Progresso por bloco.
  await expect(polir.getByRole('status')).toHaveText(/Polindo o bloco 1 de 3/, { timeout: 15_000 })
  await expect(polir.getByRole('progressbar', { name: 'Progresso do polimento' })).toHaveAttribute('aria-valuenow', '0')

  await foto(page, '1-polindo')

  // Cancelar espera o bloco em curso (já foi ao provedor) e não pede o próximo.
  await clicar(page, polir.getByRole('button', { name: /Cancelar/ }))
  await expect(polir.getByRole('status')).toHaveText(/Cancelando depois deste bloco/)
  soltarBloco0()
  await expect(polir.getByRole('status')).toHaveText(/Polimento pausado: 1 de 3 blocos/, { timeout: 15_000 })
  expect(pedidos).toEqual([0])
  // O bloco que chegou já aparece polido; o que não foi polido segue com a original.
  const traducoes = page.locator('.fala-s .trad')
  await expect(traducoes.nth(0)).toHaveText('Polida: frase número 0')
  await expect(traducoes.nth(40)).toHaveText('frase número 40')

  // Retomar continua do bloco 1: o 0 não é pedido de novo.
  await clicar(page, polir.getByRole('button', { name: /Retomar o polimento/ }))
  await expect(polir.getByRole('status')).toHaveText(/Tradução polida com o contexto da sessão/, { timeout: 30_000 })
  expect(pedidos).toEqual([0, 1, 2])
  await expect(traducoes.nth(84)).toHaveText('Polida: frase número 84')

  // Original | Polida alterna a tradução exibida; a original continua lá.
  const versao = polir.getByRole('group', { name: 'Tradução exibida' })
  await clicar(page, versao.getByRole('button', { name: 'Original' }))
  await expect(traducoes.nth(0)).toHaveText('frase número 0')
  await expect(page.locator('.fala-s .trad[data-polida]')).toHaveCount(0)
  await clicar(page, versao.getByRole('button', { name: 'Polida' }))
  await expect(traducoes.nth(0)).toHaveText('Polida: frase número 0')
  await expect(page.locator('.fala-s .trad[data-polida]')).toHaveCount(85)
  await foto(page, '2-polida')

  expect(postsDeIa(escapadas), 'nenhum pedido de IA pode sair sem simulação').toEqual([])
})

test('Grátis: o botão com cadeado abre o texto positivo e o convite, sem pedido de IA', async ({ page }) => {
  test.slow()
  const escapadas = await semIaDeVerdade(page)
  const authorization = await entrar(page, { premium: false })
  const { titulo } = await semearSessao(page, authorization, 3)

  await abrirSessao(page, titulo)
  const polir = page.getByTestId('polir-sessao')
  const botao = polir.getByRole('button', { name: /Polir a tradução da sessão/ })
  await expect(botao).toHaveAttribute('aria-expanded', 'false')
  await clicar(page, botao)
  const convite = polir.getByTestId('convite-do-polimento')
  await foto(page, '3-gratis')
  await expect(convite).toContainText('Tradução Nuance do Premium')
  await expect(convite).toContainText('Tradução rápida ao vivo')
  await expect(convite).not.toContainText(/%|qualidade/i)
  await clicar(page, convite.getByRole('button', { name: /Conhecer o Premium/ }))
  // O caminho de sempre para os Planos (a tela está sendo refeita em outra frente; o endereço fica).
  await expect(page).toHaveURL(/\/plano(\/|$)/, { timeout: 15_000 })
  expect(postsDeIa(escapadas)).toEqual([])
})
