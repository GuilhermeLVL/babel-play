/**
 * UM PONTO SÓ DE APLICAÇÃO DA LEGENDA SEGURA (change `legenda-segura-para-menores`, tarefa 2.2).
 *
 * O setter cru das falas (`setSpeechSegmentsCru`) só pode aparecer na declaração do estado e no envoltório
 * `comLegendaSegura`. Se alguém o passar ao pipeline, à tradução ou a um efeito, um caminho de texto escapa da política
 * e a legenda volta a mostrar o termo. E nenhum outro estado de falas pode nascer fora de `LiveCapture.tsx`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const RAIZ = join(__dirname, '..')
const TELA = join(RAIZ, 'src/components/views/LiveCapture.tsx')

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) return arquivos(caminho)
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : []
  })
}

/** O código sem comentários (o nome do setter pode ser citado num comentário). */
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('legenda segura: o setter cru não sai da tela', () => {
  it('o setter cru aparece só na declaração e no envoltório', () => {
    const codigo = semComentarios(readFileSync(TELA, 'utf8'))
    const usos = codigo.match(/\bsetSpeechSegmentsCru\b/g) ?? []
    expect(usos).toHaveLength(2)
    expect(codigo).toMatch(/const \[speechSegments, setSpeechSegmentsCru\] = useState<SpeechSegment\[\]>/)
    expect(codigo).toMatch(/comLegendaSegura\(\s*setSpeechSegmentsCru\b/)
  })

  it('nenhum outro estado de falas nasce fora de LiveCapture.tsx', () => {
    const fora = arquivos(join(RAIZ, 'src')).filter(
      (f) => f !== TELA && /useState<SpeechSegment\[\]>/.test(readFileSync(f, 'utf8')),
    )
    expect(fora).toEqual([])
  })
})
