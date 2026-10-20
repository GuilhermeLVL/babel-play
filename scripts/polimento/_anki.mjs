/**
 * O baralho de exemplo do Anki (as quatro notas de `tests/fixtures/baralho-moderno.apkg`) semeado pelo
 * protocolo em lotes (`POST /api/anki/imports`: abrir, notas, fechar). Quem lê o `.apkg` é o navegador; aqui
 * as notas já vêm lidas, como o navegador as manda.
 */
const NOTAS = [
  ['house', 'casa', 'I live in a big house.', ['house', 'casa', 'I live in a big house.']],
  ['water', 'água', 'A glass of water, please.', ['water', 'água', 'A glass of water, please.']],
  ['bread', 'pão', undefined, ['bread', 'pão', '']],
  ['light', 'luz claridade', undefined, ['<b>light</b>', 'luz<br>claridade', '']],
].map(([frente, verso, exemplo, bruto], i) => ({
  guid: `h${i}`,
  notetype: 'Basic',
  campos: ['Frente', 'Verso', 'Frase'],
  camposBrutos: { Frente: bruto[0], Verso: bruto[1], Frase: bruto[2] },
  frente,
  verso,
  ...(exemplo ? { exemplo } : {}),
  tags: [],
}))

export async function semearBaralhoModerno(base) {
  const enviar = async (caminho, corpo) => {
    const r = await fetch(`${base}${caminho}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    })
    if (!r.ok) throw new Error(`POST ${caminho} devolveu ${r.status}`)
    return r.json()
  }
  const { importId } = await enviar('/api/anki/imports', {
    arquivo: 'baralho-moderno.apkg',
    bytes: 1024,
    formato: 'collection.anki21b',
    nomeNoArquivo: null,
    campos: ['Frente', 'Verso', 'Frase'],
    totalNoArquivo: NOTAS.length,
    truncado: false,
    idiomaOrigem: 'en',
    amostra: NOTAS.map((n) => ({ frente: n.frente, verso: n.verso })),
  })
  await enviar(`/api/anki/imports/${importId}/notas`, { notas: NOTAS })
  await enviar(`/api/anki/imports/${importId}/fechar`, {})
}
