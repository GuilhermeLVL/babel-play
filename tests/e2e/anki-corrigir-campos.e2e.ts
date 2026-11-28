import { expect, test } from '@playwright/test'

import { BASE } from './_fixtures'
import { abrirOrganizar, clicarRobusto, irParaPraticar } from './_helpers'

/**
 * "Corrigir campos" (openspec `motor-anki-mapeador`, tarefa 5.4), atrás da flag `anki_mapeador` (ligada aqui pela
 * resposta de `GET /api/flags`): um baralho foi lido com o campo errado (a frente era o número), a pessoa abre o Mapeador
 * na aba Gerenciar, troca os papéis e o aviso diz quantas notas mudaram, sem reimportar nada.
 */

const NOME = 'Baralho de campos trocados'

async function semearBaralhoLidoErrado() {
  const enviar = async (caminho: string, corpo: unknown) => {
    const r = await fetch(`${BASE}${caminho}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    })
    if (!r.ok) throw new Error(`POST ${caminho} devolveu ${r.status}: ${(await r.text()).slice(0, 200)}`)
    return (await r.json()) as { importId: string; deckId: string }
  }
  const campos = ['Num', 'Word', 'Meaning']
  const pares = [
    ['ledger', 'livro-razão'],
    ['orbit', 'órbita'],
    ['harbor', 'porto'],
  ]
  // Lidas com o par errado (número e palavra): a régua recusa as três.
  const notas = pares.map(([word, meaning], i) => ({
    guid: `corrigir-${i}`,
    notetype: 'Vocab',
    campos,
    camposBrutos: { Num: String(i + 1), Word: word, Meaning: meaning },
    frente: String(i + 1),
    verso: word,
    tags: [],
  }))
  const { importId, deckId } = await enviar('/api/anki/imports', {
    arquivo: `${NOME}.apkg`,
    bytes: 1024,
    formato: 'collection.anki21b',
    nomeNoArquivo: NOME,
    baralhos: [NOME],
    campos,
    totalNoArquivo: notas.length,
    truncado: false,
    idiomaOrigem: 'en',
    idiomaAlvo: 'pt',
    amostra: notas.map((n) => ({ frente: n.frente, verso: n.verso })),
  })
  await enviar(`/api/anki/imports/${importId}/notas`, { notas })
  await enviar(`/api/anki/imports/${importId}/fechar`, {})
  return deckId
}

test('Gerenciar → Corrigir campos: troca os papéis e o aviso diz quantas notas mudaram', async ({ page }) => {
  test.slow()
  const deckId = await semearBaralhoLidoErrado()
  await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: { anki_mapeador: { ligada: true } } } }))

  await irParaPraticar(page)
  const painel = await abrirOrganizar(page, 'Opções')
  await clicarRobusto(page, painel.getByRole('button', { name: /Gerenciar baralhos/ }))
  const lista = page.getByRole('tabpanel', { name: /^Gerenciar/ })
  const cartao = lista.locator('section.baralho', { hasText: NOME })
  await clicarRobusto(page, cartao.getByRole('button', { name: 'Corrigir campos' }))

  const mapeador = page.getByTestId('anki-mapeador')
  await expect(mapeador).toBeVisible()
  // Os campos REAIS do baralho, não "palavra/tradução/frase" genéricos.
  for (const nome of ['Num', 'Word', 'Meaning']) await expect(mapeador.getByText(nome, { exact: true })).toBeVisible()

  await mapeador.getByLabel('Papel do campo Num').selectOption('nenhum')
  await mapeador.getByLabel('Papel do campo Word').selectOption('palavra')
  await mapeador.getByLabel('Papel do campo Meaning').selectOption('significado')
  await clicarRobusto(page, mapeador.getByRole('button', { name: 'Aplicar correção' }))

  await expect(page.getByText(/3 notas foram corrigidas em/)).toBeVisible({ timeout: 15_000 })
  await expect(mapeador).toBeHidden()

  // No servidor: as três notas agora são "palavra = tradução" e a régua as aceita.
  const notas = (await (await fetch(`${BASE}/api/anki/decks/${deckId}/notas?limite=50`)).json()) as {
    itens: Array<{ frente: string; verso: string; motivoDescarte: string | null }>
  }
  expect(notas.itens.map((n) => n.frente).sort()).toEqual(['harbor', 'ledger', 'orbit'])
  expect(notas.itens.every((n) => n.motivoDescarte === null)).toBe(true)
})
