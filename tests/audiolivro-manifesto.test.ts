import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  chaveDoCapitulo,
  frasesIntegras,
  hashDasFrases,
  hashDoLivro,
  type ManifestoDeAudio,
  validarManifesto,
} from '../src/core/leitura/audiolivro'

const FRASES_1 = ['Uma noite destas, vindo da cidade para o Engenho Novo,', 'encontrei no trem da Central um rapaz.']
const FRASES_2 = ['Do título.', 'Não consultes dicionários.']

async function manifestoValido(): Promise<ManifestoDeAudio> {
  const h1 = await hashDasFrases(FRASES_1)
  const h2 = await hashDasFrases(FRASES_2)
  return {
    versao: 1,
    livroId: 'pg-55752',
    idioma: 'pt',
    voz: 'F1',
    motor: 'supertonic-3',
    versaoDoMotor: 'supertonic-3@724fb5abbf55',
    versaoDoPreprocessador: '1',
    hashDoTexto: await hashDoLivro([h1, h2, await hashDasFrases([])]),
    capitulos: [
      { nn: 1, duracaoS: 12.5, bytes: 50_000, sha256: 'a'.repeat(64), frases: 2, hashDasFrases: h1 },
      { nn: 2, duracaoS: 4, bytes: 16_000, sha256: 'b'.repeat(64), frases: 2, hashDasFrases: h2 },
      { nn: 3, duracaoS: 0, bytes: 0, sha256: '', frases: 0, hashDasFrases: await hashDasFrases([]) },
    ],
    criadoEm: '2026-11-02T12:00:00.000Z',
    rotulo: 'voz sintetizada',
    licencaDoTexto: 'dominio-publico',
    classificacao: 'livre',
    formato: { codec: 'opus', kbps: 32, canais: 1 },
  }
}

describe('validarManifesto', () => {
  it('aceita um manifesto válido (com capítulo de 0 frases sem bytes)', async () => {
    const m = await manifestoValido()
    const r = validarManifesto(m, 'pg-55752')
    expect(r).toEqual({ ok: true, manifesto: m })
  })

  it('aceita elenco opcional booleano', async () => {
    const m = { ...(await manifestoValido()), elenco: false }
    expect(validarManifesto(m, 'pg-55752').ok).toBe(true)
  })

  it('recusa o que não é objeto', () => {
    const r = validarManifesto(null, 'pg-55752')
    expect(r.ok).toBe(false)
  })

  it('recusa livroId diferente', async () => {
    const r = validarManifesto(await manifestoValido(), 'pg-1')
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('livroId') })
  })

  it('recusa campo desconhecido', async () => {
    const r = validarManifesto({ ...(await manifestoValido()), extra: 1 }, 'pg-55752')
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('campo desconhecido: extra') })
  })

  it('recusa campo desconhecido num capítulo', async () => {
    const m = await manifestoValido()
    const capitulos = [{ ...m.capitulos[0], url: 'x' }, ...m.capitulos.slice(1)]
    const r = validarManifesto({ ...m, capitulos }, 'pg-55752')
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('campo desconhecido: url') })
  })

  it('recusa rotulo diferente', async () => {
    const r = validarManifesto({ ...(await manifestoValido()), rotulo: 'voz humana' }, 'pg-55752')
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('rotulo') })
  })

  it('recusa canais diferente de 1', async () => {
    const m = await manifestoValido()
    const r = validarManifesto({ ...m, formato: { ...m.formato, canais: 2 } }, 'pg-55752')
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('canais') })
  })

  it('recusa versão diferente de 1', async () => {
    const r = validarManifesto({ ...(await manifestoValido()), versao: 2 }, 'pg-55752')
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('versao') })
  })

  it('recusa nn repetido', async () => {
    const m = await manifestoValido()
    const capitulos = [m.capitulos[0], { ...m.capitulos[1], nn: 1 }, m.capitulos[2]]
    const r = validarManifesto({ ...m, capitulos }, 'pg-55752')
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('nn repetido') })
  })

  it('recusa nn fora de ordem', async () => {
    const m = await manifestoValido()
    const capitulos = [m.capitulos[1], m.capitulos[0], m.capitulos[2]]
    const r = validarManifesto({ ...m, capitulos }, 'pg-55752')
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('fora de ordem') })
  })

  it('recusa frases negativo', async () => {
    const m = await manifestoValido()
    const capitulos = [{ ...m.capitulos[0], frases: -1 }, ...m.capitulos.slice(1)]
    const r = validarManifesto({ ...m, capitulos }, 'pg-55752')
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('frases') })
  })

  it('recusa capítulo de 0 frases com bytes', async () => {
    const m = await manifestoValido()
    const capitulos = [...m.capitulos.slice(0, 2), { ...m.capitulos[2], bytes: 10 }]
    const r = validarManifesto({ ...m, capitulos }, 'pg-55752')
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('0 frases') })
  })

  it('recusa hashDoTexto que não bate com os capítulos', async () => {
    const r = validarManifesto({ ...(await manifestoValido()), hashDoTexto: '0'.repeat(16) }, 'pg-55752')
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('hashDoTexto') })
  })

  it('recusa codec desconhecido', async () => {
    const m = await manifestoValido()
    const r = validarManifesto({ ...m, formato: { ...m.formato, codec: 'mp3' } }, 'pg-55752')
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('codec') })
  })
})

describe('validarManifesto: hashDoTexto é conferido de verdade', () => {
  it('a validação síncrona confia num hash precomputado só quando bate', async () => {
    const m = await manifestoValido()
    const outra = await hashDoLivro([m.capitulos[1].hashDasFrases, m.capitulos[0].hashDasFrases])
    expect(outra).not.toBe(m.hashDoTexto)
    expect(validarManifesto({ ...m, hashDoTexto: outra }, 'pg-55752').ok).toBe(false)
  })
})

describe('hashDoLivro', () => {
  it.each([[[]], [['a']], [['0123456789abcdef', 'fedcba9876543210']], [[('x'.repeat(16) + '\n').repeat(40).trim()]]])(
    'é o SHA-256 (16 hex) dos hashes unidos por \\n: %#',
    async (hashes: string[]) => {
      const esperado = createHash('sha256').update(hashes.join('\n')).digest('hex').slice(0, 16)
      expect(await hashDoLivro(hashes)).toBe(esperado)
    },
  )
})

describe('hashDasFrases', () => {
  it('tem 16 hex', async () => {
    expect(await hashDasFrases(FRASES_1)).toMatch(/^[0-9a-f]{16}$/)
  })

  it('ignora diferença de espaços', async () => {
    const espacado = FRASES_1.map((f) => `  ${f.replace(/ /g, '   ')}\n`)
    expect(await hashDasFrases(espacado)).toBe(await hashDasFrases(FRASES_1))
  })

  it('não ignora diferença de acento', async () => {
    expect(await hashDasFrases(['Não consultes'])).not.toBe(await hashDasFrases(['Nao consultes']))
  })
})

describe('frasesIntegras', () => {
  it('true com as mesmas frases', async () => {
    expect(await frasesIntegras(await manifestoValido(), 1, FRASES_1)).toBe(true)
  })

  it('false se uma palavra mudou', async () => {
    const mudou = [FRASES_1[0], FRASES_1[1].replace('rapaz', 'moço')]
    expect(await frasesIntegras(await manifestoValido(), 1, mudou)).toBe(false)
  })

  it('false se duas frases trocaram de lugar', async () => {
    expect(await frasesIntegras(await manifestoValido(), 1, [FRASES_1[1], FRASES_1[0]])).toBe(false)
  })

  it('false se uma frase foi acrescentada', async () => {
    expect(await frasesIntegras(await manifestoValido(), 1, [...FRASES_1, 'Mais uma.'])).toBe(false)
  })

  it('false para capítulo inexistente', async () => {
    expect(await frasesIntegras(await manifestoValido(), 9, FRASES_1)).toBe(false)
  })
})

describe('chaveDoCapitulo', () => {
  it('monta audiolivros/<livroId>/<voz>/<versao>/<nn>.<ext> com nn de 2 dígitos', () => {
    expect(chaveDoCapitulo({ livroId: 'pg-1012', voz: 'v1' }, 2, 3, 'opus')).toBe('audiolivros/pg-1012/v1/2/03.opus')
    expect(chaveDoCapitulo({ livroId: 'pg-1012', voz: 'v1' }, 1, 12, 'json')).toBe('audiolivros/pg-1012/v1/1/12.json')
  })
})
