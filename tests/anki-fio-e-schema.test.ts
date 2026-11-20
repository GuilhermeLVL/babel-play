/**
 * O FIO E O SCHEMA FALAM OS MESMOS TETOS (revisão final da Fase 3, R13).
 *
 * `montarNota` nunca corta: o leitor devolve a nota inteira. Se o schema do servidor recusasse algo
 * que o leitor produz, o lote voltava 400 e o import ficava preso em `gravando` no meio. Aqui a
 * propriedade: QUALQUER nota que `montarNota` monte, depois de `notaParaOFio`, passa no
 * `lotesDeNotasSchema` — e o que foi cortado carrega a marca `…[cortado]` onde ela cabe.
 */
import { describe, expect, it } from 'vitest'

import { lotesDeNotasSchema } from '../server/validation'
import { montarNota, TETOS_DA_NOTA } from '../src/core/anki'
import { notaParaOFio } from '../src/data/apiAnki'

const MARCA = '…[cortado]'

function aceita(n: ReturnType<typeof montarNota>) {
  expect(n).not.toBeNull()
  const fio = notaParaOFio(n!)
  const r = lotesDeNotasSchema.safeParse({ notas: [fio] })
  if (!r.success) throw new Error(r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; '))
  return fio as any
}

describe('notaParaOFio × lotesDeNotasSchema', () => {
  it('casos da revisão: verso de 2.600, campo bruto de 21 KB e 120 tags são aceitos', () => {
    aceita(
      montarNota({
        guid: 'a',
        flds: 'word\x1f' + 'definição '.repeat(260),
        tags: '',
        nomesDosCampos: ['Word', 'Meaning'],
      }),
    )
    aceita(
      montarNota({
        guid: 'b',
        flds: 'cat\x1fgato\x1f<div style="x">' + 'a'.repeat(21_000) + '</div>',
        tags: '',
        nomesDosCampos: ['Front', 'Back', 'Notes'],
      }),
    )
    const fio = aceita(
      montarNota({
        guid: 'c',
        flds: 'cat\x1fgato',
        tags: Array.from({ length: 120 }, (_, i) => 't' + i).join(' '),
        nomesDosCampos: ['Front', 'Back'],
      }),
    )
    expect(fio.tags).toHaveLength(120)
  })

  it('entradas extremas: tudo cortado nos tetos, e o payload sempre valida', () => {
    const nomes = Array.from({ length: 80 }, (_, i) => (i === 0 ? 'Front' : i === 1 ? 'Back' : `Extra${i}`))
    const partes = nomes.map((_, i) => `valor ${i}`)
    partes[1] = 'v'.repeat(10_000) // verso de 10 000
    partes[2] = 'b'.repeat(200_000) // campo bruto de 200 KB
    partes[3] = Array.from({ length: 150 }, (_, i) => `{{c${i + 1}::resp${i}}}`).join(' ') // 150 lacunas
    partes[4] = Array.from({ length: 150 }, (_, i) => `[sound:som${i}.mp3]`).join(' ') // 150 sons
    const n = montarNota({
      guid: '',
      flds: partes.join('\x1f'),
      tags: Array.from({ length: 300 }, (_, i) => 'tag' + i).join(' '),
      nomesDosCampos: nomes,
      notetype: 'N'.repeat(500),
    })!
    // A leitura não corta nada: os extremos chegam inteiros até o fio.
    expect(n.verso).toHaveLength(10_000)
    expect(n.tags).toHaveLength(300)
    expect(n.campos).toHaveLength(80)
    expect(n.lacunas!.length).toBe(150)
    expect(n.midia!.sons.length).toBe(150)

    const fio = aceita(n)
    expect(fio.verso).toHaveLength(TETOS_DA_NOTA.verso)
    expect(fio).not.toHaveProperty('guid')
    expect(fio.tags).toHaveLength(TETOS_DA_NOTA.tags)
    expect(fio.campos).toHaveLength(TETOS_DA_NOTA.campos)
    expect(Object.keys(fio.camposBrutos)).toHaveLength(TETOS_DA_NOTA.chavesDeCamposBrutos)
    expect(fio.lacunas).toHaveLength(TETOS_DA_NOTA.lacunas)
    expect(fio.midia.sons).toHaveLength(TETOS_DA_NOTA.midia)
    expect(fio.notetype).toHaveLength(TETOS_DA_NOTA.notetype)
    // Campo bruto cortado: cabe no teto com a marca dentro dele.
    const grande = fio.camposBrutos.Extra2 as string
    expect(grande).toHaveLength(TETOS_DA_NOTA.campoBruto)
    expect(grande.endsWith(MARCA)).toBe(true)
    // O que não foi cortado não leva a marca.
    expect(fio.camposBrutos.Front).toBe('valor 0')
  })

  it('o servidor continua RECUSANDO acima dos tetos (o cliente não é confiável)', () => {
    const base = notaParaOFio(
      montarNota({ guid: 'x', flds: 'cat\x1fgato', tags: '', nomesDosCampos: ['Front', 'Back'] })!,
    )
    const acima = { ...base, verso: 'v'.repeat(TETOS_DA_NOTA.verso + 1) }
    expect(lotesDeNotasSchema.safeParse({ notas: [acima] }).success).toBe(false)
    const brutoAcima = { ...base, camposBrutos: { Front: 'b'.repeat(TETOS_DA_NOTA.campoBruto + 1) } }
    expect(lotesDeNotasSchema.safeParse({ notas: [brutoAcima] }).success).toBe(false)
  })
})
