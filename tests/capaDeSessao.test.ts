/**
 * C7 — A CAPA SAI DE DENTRO DA LISTAGEM.
 *
 * Medido em `GET /api/sessions` sobre o banco real: das 70 sessões, DUAS têm capa, e elas
 * respondiam por 1.045 KiB dos 1.074 KiB da resposta — 97% do payload era imagem, e a maior
 * sozinha tinha 991 KiB. Isso trafegava a cada carga de página, era o maior recurso depois da
 * correção de compressão, e não comprimia: base64 de imagem já é conteúdo comprimido.
 *
 * O diagnóstico só apareceu porque a medição registrou o peso POR CAMPO. "O LCP está ruim" não
 * levaria a lugar nenhum; "1.045 dos 1.074 KiB estão em `meta.imageUrl`" leva direto.
 *
 * A imagem continua exatamente onde estava no banco. O que muda é o caminho de entrega — e com
 * ele o cache, que data-URI não tem.
 */
import { describe, it, expect } from 'vitest'
import { lerCapaEmbutida, ehCapaEmbutida, aliviarMeta, aliviarListagem } from '../server/lib/capaDeSessao'

/** PNG 1×1 transparente — o menor data-URI de imagem válido. */
const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('reconhecer a capa embutida', () => {
  it('decodifica um data-URI de imagem', () => {
    const c = lerCapaEmbutida(PNG_1X1)
    expect(c).not.toBeNull()
    expect(c!.mime).toBe('image/png')
    expect(c!.bytes.length).toBeGreaterThan(0)
    // Assinatura PNG: os bytes precisam ser a imagem, não a string base64.
    expect(c!.bytes.subarray(1, 4).toString('latin1')).toBe('PNG')
  })

  it('URL externa NÃO é capa embutida — já é leve e tem cache', () => {
    expect(ehCapaEmbutida('https://exemplo.com/capa.jpg')).toBe(false)
    expect(lerCapaEmbutida('https://exemplo.com/capa.jpg')).toBeNull()
  })

  it('ignora o que não é string ou não é imagem', () => {
    for (const v of [null, undefined, 42, {}, '', 'data:text/plain;base64,YWJj']) {
      expect(ehCapaEmbutida(v)).toBe(false)
    }
  })
})

describe('aliviar a listagem', () => {
  const metaCom = JSON.stringify({ imageUrl: PNG_1X1, pinned: true, audioFile: 'a.webm' })

  it('troca a capa embutida por uma URL servida', () => {
    const saida = JSON.parse(aliviarMeta(metaCom, 'sessao-1') as string)
    expect(saida.imageUrl).toBe('/api/sessions/sessao-1/capa')
  })

  it('PRESERVA os demais campos do meta — a capa é a única coisa que muda', () => {
    const saida = JSON.parse(aliviarMeta(metaCom, 'sessao-1') as string)
    expect(saida.pinned).toBe(true)
    expect(saida.audioFile).toBe('a.webm')
  })

  it('a resposta encolhe na ordem de grandeza do problema', () => {
    const antes = Buffer.byteLength(metaCom)
    const depois = Buffer.byteLength(aliviarMeta(metaCom, 'sessao-1') as string)
    expect(depois).toBeLessThan(antes / 2)
  })

  it('não mexe em URL externa nem em sessão sem capa', () => {
    const externa = JSON.stringify({ imageUrl: 'https://exemplo.com/c.jpg' })
    const semCapa = JSON.stringify({ pinned: false })
    expect(aliviarMeta(externa, 's')).toBe(externa)
    expect(aliviarMeta(semCapa, 's')).toBe(semCapa)
  })

  it('meta ilegível passa intacto em vez de derrubar a listagem', () => {
    expect(aliviarMeta('{isto não é json', 's')).toBe('{isto não é json')
    expect(aliviarMeta(null, 's')).toBe(null)
  })

  it('processa a listagem inteira e usa o id de CADA linha', () => {
    const linhas = [
      { id: 'a', meta: metaCom },
      { id: 'b', meta: JSON.stringify({ pinned: true }) },
      { id: 'c', meta: metaCom },
    ]
    const saida = aliviarListagem(linhas)
    expect(JSON.parse(saida[0].meta).imageUrl).toBe('/api/sessions/a/capa')
    expect(JSON.parse(saida[2].meta).imageUrl).toBe('/api/sessions/c/capa')
    expect(saida[1].meta).toBe(linhas[1].meta)
  })

  it('nenhum data-URI sobrevive à listagem — é a garantia que importa', () => {
    const saida = aliviarListagem([{ id: 'a', meta: metaCom }, { id: 'b', meta: metaCom }])
    expect(JSON.stringify(saida)).not.toContain('data:image')
  })
})
