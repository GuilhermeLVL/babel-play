/**
 * ENQUADRAMENTO E COLEÇÃO (M2.1): a câmera de cada modelo mantém o corpo inteiro (braços abertos) e o rosto dentro
 * do quadro, com margem; só os modelos que passam são sorteados; e cada arquivo da coleção bate com o que o
 * `LICENSES.md` diz dele (SHA-256, autor, CC0).
 *
 * As medidas do catálogo vêm de `scripts/avatar/calibrar-colecao.ts` (lidas do próprio `.vrm` no motor). O teste do
 * motor em Chromium de verdade (pixels que tocam a borda) está em `tests/e2e/avatar-enquadramento.e2e.ts`.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { mapearMateriais } from '../src/core/avatar/aparencia'
import { receitaNova } from '../src/core/avatar/edicao'
import {
  alturaDoRostoNoQuadro,
  CABECA_MAXIMA_NO_QUADRO,
  caixaCabeNoQuadro,
  camerasAutomaticas,
  type CamerasDoModelo,
  enquadrarCaixa,
  fovDe,
  MARGEM_DO_QUADRO,
  MARGEM_DO_ROSTO,
  type MedidasDoModelo,
  ocupacaoDoQuadro,
  passaNoEnquadramento,
  posicaoDaCabecaNoQuadro,
  projetarCaixa,
  ROSTO_MINIMO_NO_QUADRO,
} from '../src/core/avatar/enquadramento'
import { avaliarLicenca } from '../src/core/avatar/licencaVrm'
import { sugerirModelo } from '../src/core/avatar/sugestao'
import { COLECAO_CURADA, COLECAO_SUGERIVEL, modeloDaColecao } from '../src/data/avatar/colecao'
import { fonteDaReceita, urlDoModeloDaColecao } from '../src/lib/avatar/fontes'

const RAIZ = path.resolve(__dirname, '..')
const PASTA = path.join(RAIZ, 'public', 'avatares', 'colecao')

/** Nomes de material lidos do JSON do GLB de cada arquivo (a regra de `suporta` é pelo nome). */
function materiaisDoArquivo(arquivo: string): string[] {
  const b = readFileSync(arquivo)
  const tamanho = b.readUInt32LE(12)
  const json = JSON.parse(b.subarray(20, 20 + tamanho).toString('utf8')) as { materials?: Array<{ name?: string }> }
  return (json.materials ?? []).map((m) => m.name ?? '')
}
function metaDoArquivo(arquivo: string): Record<string, string> {
  const b = readFileSync(arquivo)
  const tamanho = b.readUInt32LE(12)
  const json = JSON.parse(b.subarray(20, 20 + tamanho).toString('utf8')) as {
    extensions?: { VRM?: { meta?: Record<string, string> } }
  }
  return json.extensions?.VRM?.meta ?? {}
}

describe('enquadramento: matemática pura', () => {
  const caixa = { min: [-1, 0, -0.2] as const, max: [1, 1.8, 0.2] as const }

  it('enquadrarCaixa devolve uma câmera em que a caixa cabe, com a margem', () => {
    const cam = enquadrarCaixa(caixa)
    expect(caixaCabeNoQuadro(caixa, cam)).toBe(true)
    const p = projetarCaixa(caixa, cam)!
    // A maior dimensão encosta na margem (é a menor distância que serve), nunca passa dela.
    expect(Math.max(Math.abs(p.minX), Math.abs(p.maxX), Math.abs(p.minY), Math.abs(p.maxY))).toBeCloseTo(
      1 - MARGEM_DO_QUADRO,
      1,
    )
  })

  it('chegar mais perto corta: a caixa deixa de caber', () => {
    const cam = enquadrarCaixa(caixa)
    expect(caixaCabeNoQuadro(caixa, { ...cam, distancia: cam.distancia * 0.8 })).toBe(false)
  })

  it('um canto atrás da câmera nunca "cabe"', () => {
    expect(caixaCabeNoQuadro(caixa, { alvo: [0, 0.9, 0], distancia: 0.1 })).toBe(false)
    expect(projetarCaixa(caixa, { alvo: [0, 0.9, 0], distancia: 0.1 })).toBeNull()
  })

  it('quadro mais estreito exige mais distância', () => {
    const quadrado = enquadrarCaixa(caixa, { aspecto: 1 })
    const estreito = enquadrarCaixa(caixa, { aspecto: 0.6 })
    expect(estreito.distancia).toBeGreaterThan(quadrado.distancia)
    expect(caixaCabeNoQuadro(caixa, estreito, 0.6)).toBe(true)
  })

  it('o teste de enquadramento reprova corte e corpo minúsculo, e aprova o calibrado', () => {
    const medidas: MedidasDoModelo = { caixa, caixaDoRosto: { min: [-0.3, 1.3, -0.2], max: [0.3, 1.8, 0.2] } }
    const boas = camerasAutomaticas(medidas)
    expect(passaNoEnquadramento(medidas, boas).passa).toBe(true)
    const cortada: CamerasDoModelo = { ...boas, corpo: { ...boas.corpo, distancia: boas.corpo.distancia * 0.7 } }
    expect(passaNoEnquadramento(medidas, cortada)).toEqual({ passa: false, motivo: 'corpo cortado' })
    const longe: CamerasDoModelo = { ...boas, corpo: { ...boas.corpo, distancia: boas.corpo.distancia * 3 } }
    expect(passaNoEnquadramento(medidas, longe)).toEqual({ passa: false, motivo: 'corpo pequeno demais' })
    const rostoMinusculo: CamerasDoModelo = { ...boas, rosto: { ...boas.rosto, distancia: boas.rosto.distancia * 3 } }
    expect(passaNoEnquadramento(medidas, rostoMinusculo)).toEqual({ passa: false, motivo: 'rosto pequeno demais' })
    const rostoCortado: CamerasDoModelo = { ...boas, rosto: { ...boas.rosto, distancia: boas.rosto.distancia * 0.6 } }
    expect(passaNoEnquadramento(medidas, rostoCortado)).toEqual({ passa: false, motivo: 'rosto cortado' })
  })
})

describe('coleção: enquadramento calibrado por modelo', () => {
  it('tem os 6 modelos CC0 e nenhum da Quaternius', () => {
    expect(COLECAO_CURADA.map((m) => m.id).sort()).toEqual(
      [
        '100avatars-r1-devil',
        '100avatars-r1-dinokid',
        '100avatars-r2-coolbunny',
        '100avatars-r2-coolhydrant',
        'bullidan',
        'milk',
      ].sort(),
    )
    for (const m of COLECAO_CURADA) {
      expect(`${m.id} ${m.nome} ${m.autor} ${m.credito} ${m.fonteUrl}`.toLowerCase()).not.toContain('quaternius')
    }
  })

  for (const m of COLECAO_CURADA) {
    describe(m.id, () => {
      it('o corpo inteiro (braços abertos) cabe no quadro, com margem, e ocupa o quadro', () => {
        expect(caixaCabeNoQuadro(m.medidas.caixa, m.camera.corpo)).toBe(true)
        expect(ocupacaoDoQuadro(m.medidas.caixa, m.camera.corpo)).toBeGreaterThan(0.6)
      })

      it('o rosto (olhos ao queixo, ou a cabeça sem olhos) ocupa >= 45% da altura do quadro, centrado, sem cortar o topo', () => {
        const cam = m.camera.rosto
        const rosto = alturaDoRostoNoQuadro(m.medidas, cam)!
        expect(rosto).toBeGreaterThanOrEqual(ROSTO_MINIMO_NO_QUADRO)
        const cabeca = posicaoDaCabecaNoQuadro(m.medidas, cam)!
        // Não corta: a cabeça inteira cabe com margem, e não passa do teto (nem encosta na borda de cima).
        expect(caixaCabeNoQuadro(m.medidas.caixaDoRosto, cam, 1, MARGEM_DO_ROSTO / 2)).toBe(true)
        expect(cabeca.altura).toBeLessThanOrEqual(CABECA_MAXIMA_NO_QUADRO)
        expect(cabeca.largura).toBeLessThanOrEqual(CABECA_MAXIMA_NO_QUADRO)
        // Centrada: o centro da cabeça cai a menos de 5% do centro do quadro.
        expect(Math.abs(cabeca.centroX)).toBeLessThan(0.05)
        expect(Math.abs(cabeca.centroY)).toBeLessThan(0.05)
        // E o quadro mostra a cabeça, não o busto com os braços: ela é bem mais estreita que o corpo.
        expect(m.medidas.caixaDoRosto.max[0] - m.medidas.caixaDoRosto.min[0]).toBeLessThan(
          (m.medidas.caixa.max[0] - m.medidas.caixa.min[0]) / 2,
        )
      })

      it('passa no teste de enquadramento (por isso pode ser sorteado)', () => {
        expect(passaNoEnquadramento(m.medidas, m.camera)).toEqual({ passa: true })
        expect(COLECAO_SUGERIVEL.map((x) => x.id)).toContain(m.id)
      })

      it('a câmera do catálogo é a que as medidas pedem (calibração em dia)', () => {
        const esperada = enquadrarCaixa(m.medidas.caixa)
        expect(m.camera.corpo.distancia).toBeCloseTo(esperada.distancia, 2)
        expect(m.camera.corpo.alvo[1]).toBeCloseTo(esperada.alvo[1], 2)
        const rosto = enquadrarCaixa(m.medidas.caixaDoRosto, { margem: MARGEM_DO_ROSTO })
        if (m.rotuloEmY === undefined) {
          expect(m.camera.rosto.distancia).toBeCloseTo(rosto.distancia, 2)
          expect(m.camera.rosto.alvo[1]).toBeCloseTo(rosto.alvo[1], 2)
        }
      })

      it('com rótulo no corpo, o quadro do rosto não mostra nem um pedaço dele (defeito 5)', () => {
        if (m.rotuloEmY === undefined) return
        const t = Math.tan((fovDe(m.camera.rosto) * Math.PI) / 360)
        // o rótulo está na frente do corpo: a borda de baixo do quadro é medida na profundidade da frente
        const profundidade = m.camera.rosto.distancia - (m.medidas.caixaDoRosto.max[2] - m.camera.rosto.alvo[2])
        const base = m.camera.rosto.alvo[1] - profundidade * t
        expect(base).toBeGreaterThanOrEqual(m.rotuloEmY)
      })

      it('o rosto fica acima do meio do corpo (é o alto do modelo, não os pés)', () => {
        expect(m.camera.rosto.alvo[1]).toBeGreaterThan(m.camera.corpo.alvo[1])
      })
    })
  }

  it('Bullidan (cabeça em cone alta) fica inteiro, do topo do cone aos pés', () => {
    const b = modeloDaColecao('bullidan')!
    const p = projetarCaixa(b.medidas.caixa, b.camera.corpo)!
    expect(p.maxY).toBeLessThanOrEqual(1 - MARGEM_DO_QUADRO)
    expect(p.minY).toBeGreaterThanOrEqual(-(1 - MARGEM_DO_QUADRO))
    expect(b.medidas.caixa.max[1]).toBeGreaterThan(2) // o cone alto é o topo da caixa
  })

  it('um modelo que NÃO passa no enquadramento não é sorteado', () => {
    const cortado = {
      ...COLECAO_CURADA[0],
      id: 'cortado',
      camera: { ...COLECAO_CURADA[0].camera, corpo: { alvo: [0, 0.8, 0], distancia: 1 } as const },
    }
    expect(passaNoEnquadramento(cortado.medidas, cortado.camera).passa).toBe(false)
    const sorteados = new Set<string>()
    const elegiveis = [...COLECAO_SUGERIVEL, cortado].filter(
      (m) => m.id !== 'cortado' || passaNoEnquadramento(m.medidas, m.camera).passa,
    )
    for (let i = 0; i < 200; i++) sorteados.add(sugerirModelo(elegiveis, false, () => i / 200)!.id)
    expect(sorteados.has('cortado')).toBe(false)
    expect(sorteados.size).toBe(COLECAO_SUGERIVEL.length)
  })

  it('"Escolher para mim" alcança os 6 modelos e evita repetir o atual', () => {
    const vistos = new Set<string>()
    for (let i = 0; i < 120; i++) vistos.add(sugerirModelo(COLECAO_SUGERIVEL, false, () => i / 120)!.id)
    expect(vistos.size).toBe(6)
    for (let i = 0; i < 30; i++)
      expect(sugerirModelo(COLECAO_SUGERIVEL, true, () => i / 30, 'milk')!.id).not.toBe('milk')
  })
})

describe('coleção: arquivos, licença e crédito', () => {
  const licencas = readFileSync(path.join(PASTA, 'LICENSES.md'), 'utf8')

  for (const m of COLECAO_CURADA) {
    describe(m.id, () => {
      const arquivo = path.join(PASTA, `${m.id}.vrm`)

      it('o arquivo existe em public/avatares/colecao (vai para o dist)', () => {
        expect(existsSync(arquivo)).toBe(true)
      })

      it('o SHA-256 do arquivo é o que o LICENSES.md registra', () => {
        const sha = createHash('sha256').update(readFileSync(arquivo)).digest('hex')
        expect(licencas).toContain(sha)
        expect(licencas).toContain(`${m.id}.vrm`)
      })

      it('o meta do VRM diz CC0 e o registro também (as duas camadas concordam)', () => {
        const meta = metaDoArquivo(arquivo)
        expect(meta.licenseName).toBe('CC0')
        expect(m.licenca).toContain('CC0')
        expect(meta.author?.replace(/\s/g, '').toLowerCase()).toBe('polygonalmind')
        // Os metas dizem "Allow" para tudo (é o padrão do exportador): só valem por serem da coleção curada.
        expect(avaliarLicenca(meta, 'menor', 'colecao').decisao).toBe('aceita')
      })

      it('o crédito é literal: nome, número do registro, autor e licença', () => {
        expect(m.credito).toContain(m.nome)
        expect(m.credito).toContain('Polygonal Mind')
        expect(m.credito).toContain('CC0 1.0')
        expect(m.credito).toMatch(/100Avatars R[12], nº \d{3}/)
      })

      it('`suporta` bate com os materiais do arquivo (textura única "assada": nada recolorível)', () => {
        const nomes = materiaisDoArquivo(arquivo)
        expect(nomes.length).toBeGreaterThan(0)
        const mapa = mapearMateriais(nomes)
        expect(m.suporta).toEqual({
          pele: mapa.pele.length > 0,
          cabelo: mapa.cabelo.length > 0,
          olhos: mapa.olhos.length > 0,
        })
      })

      it('cabe no teto do tier fraco (20 mil triângulos) e do arquivo (15 MB)', () => {
        expect(m.triangulos).toBeLessThanOrEqual(20_000)
        expect(readFileSync(arquivo).byteLength).toBeLessThan(15 * 1024 * 1024)
      })
    })
  }

  it('o LICENSES.md cita CC0, o registro de origem e o R2 (VITE_AVATARES_URL)', () => {
    expect(licencas).toMatch(/CC0/)
    expect(licencas).toContain('ToxSam/open-source-avatars')
    expect(licencas).toContain('VITE_AVATARES_URL')
    expect(licencas.toLowerCase()).toContain('nada da quaternius')
  })
})

describe('coleção: de onde vem o arquivo (VITE_AVATARES_URL)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('sem a variável, do próprio domínio em /avatares/colecao/ (inclusive em desenvolvimento)', async () => {
    vi.stubEnv('VITE_AVATARES_URL', '')
    for (const m of COLECAO_CURADA) {
      expect(urlDoModeloDaColecao(m.id)).toBe(`/avatares/colecao/${m.id}.vrm`)
      expect(await fonteDaReceita(receitaNova({ origem: 'colecao', id: m.id }, '', 1))).toBe(
        `/avatares/colecao/${m.id}.vrm`,
      )
    }
  })

  it('com a variável, do bucket (barra final ignorada)', async () => {
    vi.stubEnv('VITE_AVATARES_URL', 'https://avatares.frasy.com.br/')
    expect(urlDoModeloDaColecao('milk')).toBe('https://avatares.frasy.com.br/colecao/milk.vrm')
    expect(await fonteDaReceita(receitaNova({ origem: 'colecao', id: 'bullidan' }, '', 1))).toBe(
      'https://avatares.frasy.com.br/colecao/bullidan.vrm',
    )
  })
})
