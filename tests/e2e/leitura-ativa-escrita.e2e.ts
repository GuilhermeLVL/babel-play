import { expect, type Page, test } from '@playwright/test'

import { postsDeIa, semIaDeVerdade } from '../e2e-publico/_nuance'

/**
 * A ESCRITA DA LEITURA ATIVA (spec `leitura-ativa-escrita`, ux T5/T5b). A flag é ligada pelo teste e a IA é SEMPRE
 * simulada (`page.route('**\/api/ai/escrita')`, depois de `semIaDeVerdade`, que derruba qualquer outro pedido de IA).
 *
 * O app do e2e é o self-host (sem login), que tem retorno sem teto; o Grátis é simulado pela resposta do servidor
 * (403 `sem_plano`), que é o que a tela recebe quando o plano não tem o retorno: ela passa a conferir no aparelho.
 */

const ESCRITA =
  'In the morning I go to the market with my dad. I buy six green apples. I see my friend Ben and his happy dog.'

async function ligarFlag(page: Page) {
  await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: { leitura_ativa: { ligada: true } } } }))
}

/** Lê "At the Market" em silêncio, pula as 3 perguntas e chega à escrita. */
async function chegarNaEscrita(page: Page) {
  await page.goto('/leitura/a1-no-mercado')
  await page.getByRole('radio', { name: /Ler em silêncio/ }).click()
  await page.getByRole('button', { name: 'Começar' }).click()
  await page.getByTestId('terminei').click()
  for (let i = 0; i < 3; i++)
    await page.getByTestId('leitura-ativa-pergunta').getByRole('button', { name: 'Pular' }).click()
  await expect(page.getByTestId('leitura-ativa-escrita')).toBeVisible()
}

test.describe('Leitura ativa: escrita', () => {
  test('plano com retorno: o texto vai à IA simulada e volta com elogio, 3 pontos e um reenvio', async ({ page }) => {
    test.setTimeout(90_000)
    const escapadas = await semIaDeVerdade(page)
    const pedidos: Array<Record<string, unknown>> = []
    await page.route('**/api/ai/escrita', async (r) => {
      const corpo = r.request().postDataJSON() as Record<string, unknown>
      pedidos.push(corpo)
      const segunda = Array.isArray(corpo.anteriores)
      await r.fulfill({
        json: {
          retorno: segunda
            ? { elogio: 'Bem melhor.', pontos: [], resolvidos: ['I go', 'I buy'] }
            : {
                elogio: 'Você contou na ordem certa e usou “morning”.',
                pontos: [
                  { trecho: 'I go', tipo: 'tempoVerbal', dica: 'A história está no passado.', exemplo: 'I went' },
                  { trecho: 'I buy', tipo: 'tempoVerbal', dica: 'De novo o passado.', exemplo: 'I bought' },
                  { trecho: 'I see', tipo: 'tempoVerbal', dica: 'Qual é o passado de see?', exemplo: 'I saw' },
                ],
                resolvidos: [],
              },
        },
      })
    })
    await ligarFlag(page)
    await chegarNaEscrita(page)

    const campo = page.getByRole('textbox')
    await campo.fill('Lia goes to the market with her dad.')
    await expect(page.getByTestId('pedir-retorno')).toBeDisabled()
    await expect(page.getByTestId('limite-da-escrita')).toHaveText('20 palavras ou mais para pedir retorno')

    /* E-mail: nada sai, e o trecho fica sublinhado. */
    await campo.fill(`${ESCRITA} My email is lia@exemplo.com`)
    await page.getByTestId('pedir-retorno').click()
    await expect(page.getByTestId('dado-pessoal')).toContainText('o Frasy não precisa de dados pessoais')
    await expect(page.getByTestId('dado-pessoal').locator('mark')).toHaveText('lia@exemplo.com')
    expect(pedidos).toHaveLength(0)

    await campo.fill(ESCRITA)
    await expect(page.getByText('O texto vai para a IA só para o retorno e não fica guardado.')).toBeVisible()
    await page.getByTestId('pedir-retorno').click()
    const retorno = page.getByTestId('leitura-ativa-retorno')
    await expect(retorno).toContainText('Você contou na ordem certa')
    await expect(retorno.locator('mark[data-ponto]')).toHaveCount(3)
    await expect(retorno).toContainText('Retorno feito por IA. Ela pode errar.')
    expect(pedidos[0]).toEqual({ textoId: 'a1-no-mercado', tarefa: 'reescrever', escrita: ESCRITA })

    await page.getByTestId('corrigir-e-mandar').click()
    await campo.fill(ESCRITA.replace('I go', 'I went').replace('I buy', 'I bought'))
    await page.getByTestId('pedir-retorno').click()
    await expect(retorno).toContainText('Você resolveu 2 de 3. Ótimo trabalho.')
    await expect(page.getByTestId('corrigir-e-mandar')).toHaveCount(0)
    expect(pedidos[1].anteriores).toEqual(['I go', 'I buy', 'I see'])

    await retorno.getByRole('button', { name: 'Seguir para o resumo' }).click()
    await expect(page.getByTestId('leitura-ativa-resumo')).toBeVisible()
    expect(postsDeIa(escapadas)).toEqual([])
  })

  test('sem o retorno no plano (403): confere sozinho no aparelho, sem mais pedidos de IA', async ({ page }) => {
    test.setTimeout(90_000)
    const escapadas = await semIaDeVerdade(page)
    let pedidos = 0
    await page.route('**/api/ai/escrita', (r) => {
      pedidos++
      return r.fulfill({
        status: 403,
        json: { error: 'o retorno com IA faz parte dos planos pagos', code: 'sem_plano' },
      })
    })
    await ligarFlag(page)
    await chegarNaEscrita(page)

    await page.getByRole('textbox').fill(ESCRITA)
    await page.getByTestId('pedir-retorno').click()
    await expect(page.getByTestId('conferir-sozinho')).toBeVisible()
    await expect(page.getByTestId('linha-dos-planos')).toContainText('O retorno com IA faz parte dos planos pagos.')
    await page.getByTestId('conferir-sozinho').click()
    const conferido = page.getByTestId('leitura-ativa-conferido')
    await expect(conferido).toContainText('25 palavras')
    await expect(conferido.locator('[data-usada]')).toContainText(['morning ✓', 'friend ✓', 'happy ✓'])
    expect(pedidos).toBe(1)
    expect(postsDeIa(escapadas)).toEqual([])
  })
})
