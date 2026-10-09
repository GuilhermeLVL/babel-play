/**
 * D7 (Fase D) — O QUE O GRÁTIS VÊ DA TRADUÇÃO NUANCE NA SESSÃO, ponta a ponta.
 *
 * Roda com `playwright.publico.config.ts`: login de verdade no Supabase falso, sessão e falas de
 * verdade no servidor do app (semeadas pela API), e a IA SIMULADA na página (`_nuance.ts`) — nenhum
 * pedido de IA sai. A conta é a de verdade do servidor (Grátis): nada aqui pinta o plano.
 *
 * O que se prova, na Sessão do desenho novo (`views/analise/quest/*`), pela folha da frase
 * (`FolhasDoPrototipo`):
 *
 *   tocar numa fala abre a folha; a Nuance aparece com CADEADO, o texto positivo ("Sua legenda já usa
 *   a Tradução rápida ao vivo") e "Conhecer o Premium", que leva à tela de Planos (`/plano`); os botões
 *   de verdade da Nuance (Formal, Informal, Outras formas) não existem para o Grátis; e nenhum pedido
 *   de tradução por IA sai.
 *
 * ESTE ARQUIVO ERA `nuance-polir.e2e.ts`. O painel "Polir a tradução da sessão"
 * (`views/analise/PolirSessao.tsx`) não tem mais tela que o abra desde que o desenho novo virou o único
 * (09/10/2026), então os dois testes de navegador dele saíram: o do Premium (progresso por bloco,
 * cancelar, retomar, "Original | Polida") ficou SEM cobertura de navegador, só com a de componente
 * (`tests/polirSessao.test.tsx`); o do Grátis (cadeado, texto positivo, convite, nenhum pedido de IA)
 * continua aqui, na porta que o desenho novo tem: a folha da frase.
 *
 *   npx playwright test -c playwright.publico.config.ts nuance-gratis
 */
import { expect, type Page, test } from '@playwright/test'

import { chegarEm, clicar, entrar, postsDeIa, semIaDeVerdade } from './_nuance'

/** Uma sessão de `n` falas, criada pela API com o token do navegador; devolve o título dela. */
async function semearSessao(page: Page, authorization: string, n: number) {
  const title = `Aula da folha ${Date.now()}`
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
  return title
}

/** Foto de conferência, só quando pedida (`FOTOS_DIR`), como no e2e da captura no celular. */
async function foto(page: Page, nome: string) {
  const dir = process.env.FOTOS_DIR
  if (dir) await page.screenshot({ path: `${dir}/nuance-${nome}.png` })
}

/**
 * Abre a sessão PELA BIBLIOTECA, como a pessoa abre: acha a gravação pelo título (o banco do e2e é
 * reaproveitado e a lista tem páginas), escolhe a linha e toca em "Abrir" no cartão da selecionada.
 */
async function abrirSessao(page: Page, titulo: string) {
  await page.goto('/biblioteca')
  const busca = page.getByLabel('Buscar por título')
  await chegarEm(page, busca)
  await busca.fill(titulo)
  const linha = page.getByRole('group', { name: 'Gravações' }).locator('.q-linha').filter({ hasText: titulo })
  await clicar(page, linha)
  const selecionada = page.getByRole('region', { name: 'Gravação selecionada' })
  await expect(selecionada.getByRole('heading', { name: titulo })).toBeVisible()
  await clicar(page, selecionada.getByRole('button', { name: 'Abrir', exact: true }))
  await chegarEm(page, page.getByRole('group', { name: 'Transcrição da sessão' }))
  await expect(page.locator('.qs-fala .qs-t').first()).toHaveText('frase número 0', { timeout: 30_000 })
}

test('Grátis: na folha da frase a Nuance tem cadeado, texto positivo e o convite, sem pedido de IA', async ({
  page,
}) => {
  test.slow()
  const escapadas = await semIaDeVerdade(page)
  const authorization = await entrar(page, { premium: false })
  const titulo = await semearSessao(page, authorization, 3)

  await abrirSessao(page, titulo)
  await clicar(page, page.locator('.qs-fala .qs-fala-texto').first())
  const folha = page.getByRole('dialog', { name: 'Ações', exact: true })
  await expect(folha).toBeVisible()
  await expect(folha.locator('.folha-frase')).toHaveText('sentence number 0')

  // O cadeado e o texto positivo, sem número nem comparação de qualidade.
  const nuance = folha.locator('.px-nuance')
  await expect(nuance).toBeVisible()
  await foto(page, 'gratis')
  await expect(nuance.locator('b')).toHaveText('Outras formas de dizer')
  await expect(nuance.locator('b svg.lucide-lock')).toBeVisible()
  await expect(nuance).toContainText('Sua legenda já usa a Tradução rápida ao vivo')
  await expect(nuance).not.toContainText(/%|qualidade/i)

  // A Nuance de verdade não monta para o Grátis: nada que peça tradução à nuvem.
  await expect(folha.getByRole('region', { name: 'Tradução Nuance' })).toHaveCount(0)
  await expect(folha.getByRole('button', { name: /^(Formal|Informal|Outras formas)$/ })).toHaveCount(0)

  // O convite leva aos Planos.
  await clicar(page, nuance.getByRole('button', { name: /Conhecer o Premium/ }))
  await expect(page).toHaveURL(/\/plano(\/|$)/, { timeout: 15_000 })
  await expect(folha).toBeHidden()

  expect(postsDeIa(escapadas), 'nenhum pedido de IA pode sair').toEqual([])
  expect(
    escapadas.filter((e) => e.includes('/api/ai/mt')),
    'nem consulta à tradução por IA',
  ).toEqual([])
})
