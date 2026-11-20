/**
 * O IMPORTADOR DO "TRAGA O SEU" (core): os 26 casos do protótipo `testar.mjs` (ramo `proto/avatar-libras-fontes`) e
 * os 3 de cabeçalho de imagem, com espiões que provam que uma recusa hostil NÃO decodifica textura.
 */
import * as khronos from 'gltf-validator'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { lerGlb, montarGlb } from '../src/core/avatar/importador/glb'
import { lerDimensoesDaImagem } from '../src/core/avatar/importador/imagem'
import {
  type Decisao,
  type GanchosDePreparo,
  type OpcoesDeValidacao,
  prepararAvatar,
  tierMinimoParaTriangulos,
  validarAvatar,
} from '../src/core/avatar/importador/validar'
import { gerarTodas, pngSolido } from './harness/avatarFixtures'

const validador = khronos as unknown as NonNullable<OpcoesDeValidacao['validador']>

// Qualquer caminho de decodificação de imagem que o pipeline tocasse seria contado aqui.
const espiao = { reduzir: 0, createImageBitmap: 0, offscreen: 0, image: 0 }
const originais: Record<string, unknown> = {}
beforeAll(() => {
  const g = globalThis as unknown as Record<string, unknown>
  for (const k of ['createImageBitmap', 'OffscreenCanvas', 'Image']) originais[k] = g[k]
  g.createImageBitmap = () => {
    espiao.createImageBitmap++
    throw new Error('decodificação proibida')
  }
  g.OffscreenCanvas = class {
    constructor() {
      espiao.offscreen++
      throw new Error('decodificação proibida')
    }
  }
  g.Image = class {
    constructor() {
      espiao.image++
      throw new Error('decodificação proibida')
    }
  }
})
afterAll(() => {
  const g = globalThis as unknown as Record<string, unknown>
  for (const [k, v] of Object.entries(originais)) {
    if (v === undefined) delete g[k]
    else g[k] = v
  }
})
const total = () => espiao.reduzir + espiao.createImageBitmap + espiao.offscreen + espiao.image
const ganchos: GanchosDePreparo = {
  reduzirImagem: async (_b, _m, l, a) => {
    espiao.reduzir++
    return { bytes: pngSolido(l, a), mimeType: 'image/png' }
  },
}

const fix = gerarTodas()

type Caso = [string, 'adulto' | 'menor', boolean, 'desktop' | 'fraco', Decisao, string, boolean?]
// [fixture, perfil, direitos, aparelho, decisão esperada, código de recusa esperado, hostil?]
const casos: Caso[] = [
  ['glb-valido-pequeno.glb', 'adulto', false, 'desktop', 'precisa_confirmar', ''],
  ['glb-valido-pequeno.glb', 'adulto', true, 'desktop', 'aceito', ''],
  ['glb-valido-pequeno.glb', 'menor', true, 'desktop', 'recusado', 'licenca_nao_declarada'],
  ['vrm0-liberado.vrm', 'menor', false, 'desktop', 'aceito', ''],
  ['vrm0-restritivo.vrm', 'adulto', false, 'desktop', 'aceito', ''],
  ['vrm0-restritivo.vrm', 'menor', false, 'desktop', 'recusado', 'uso_sexual'],
  ['vrm0-sem-meta.vrm', 'adulto', false, 'desktop', 'precisa_confirmar', ''],
  ['vrm0-sem-meta.vrm', 'menor', true, 'desktop', 'recusado', 'licenca_nao_declarada'],
  ['vrm1-liberado.vrm', 'menor', false, 'desktop', 'aceito', ''],
  ['vrm1-sexual-permitido.vrm', 'menor', false, 'desktop', 'recusado', 'uso_sexual'],
  ['vrm1-sexual-permitido.vrm', 'adulto', false, 'desktop', 'aceito', ''],
  ['vrm1-so-autor.vrm', 'adulto', false, 'desktop', 'precisa_confirmar', ''],
  ['vrm1-so-autor.vrm', 'menor', false, 'desktop', 'recusado', 'uso_restrito'],
  ['vrm1-proibe-modificar-tex2048.vrm', 'adulto', false, 'desktop', 'recusado', 'modificacao_proibida'],
  ['glb-textura-2048.glb', 'adulto', true, 'desktop', 'aceito', ''],
  ['glb-json-sem-padding.glb', 'adulto', true, 'desktop', 'aceito', ''],
  ['glb-json-sem-padding.glb', 'adulto', false, 'desktop', 'precisa_confirmar', ''],
  ['glb-malha-25k.glb', 'adulto', true, 'desktop', 'aceito', ''],
  ['glb-malha-25k.glb', 'adulto', true, 'fraco', 'recusado', 'tier_fraco'],
  ['hostil-uri-externa.glb', 'adulto', true, 'desktop', 'recusado', 'uri_externa', true],
  ['hostil-extensao-desconhecida.glb', 'adulto', true, 'desktop', 'recusado', 'extensao_desconhecida', true],
  ['hostil-malha-enorme.glb', 'adulto', true, 'desktop', 'recusado', 'triangulos', true],
  ['hostil-textura-gigante.glb', 'adulto', true, 'desktop', 'recusado', 'textura_bomba', true],
  ['hostil-maior-que-15mb.glb', 'adulto', true, 'desktop', 'recusado', 'arquivo_grande', true],
  ['hostil-chunk-passa-do-fim.glb', 'adulto', true, 'desktop', 'recusado', 'chunk_fora', true],
  ['hostil-nao-e-glb.glb', 'adulto', true, 'desktop', 'recusado', 'sem_magic', true],
]

describe('validarAvatar: os 26 casos do protótipo', () => {
  it.each(casos)(
    '%s (%s, direitos=%s, %s) -> %s %s',
    async (nome, perfil, direitos, aparelho, esperada, codigo, hostil) => {
      const bytes = fix.get(nome) as Uint8Array
      const antes = total()
      const op: OpcoesDeValidacao = {
        protegido: perfil === 'menor',
        tier: aparelho === 'fraco' ? 'fraco' : 'forte',
        direitosConfirmados: direitos,
        validador,
      }
      const r = await validarAvatar(bytes, op)
      expect(total() - antes, 'a validação não decodifica imagem').toBe(0)
      expect(r.decisao).toBe(esperada)
      if (codigo) expect(r.recusas.map((x) => x.codigo)).toContain(codigo)
      const rodou = r.etapas.some((e) => e.id === 'validador_khronos')
      // O hostil para ANTES do validador; o resto tem de ter passado por ele.
      if (hostil) expect(rodou).toBe(false)
      else if (r.decisao !== 'recusado') expect(rodou).toBe(true)

      if (r.decisao === 'recusado') {
        await expect(prepararAvatar(bytes, r, ganchos)).rejects.toMatchObject({ codigo: 'recusado' })
        expect(total() - antes, 'recusado nunca chega a decodificar').toBe(0)
      } else if (r.decisao === 'aceito') {
        const p = await prepararAvatar(bytes, r, ganchos, { ...op })
        expect(p.reduzidas).toBe(r.reducoes.length)
        if (p.reduzidas) {
          const t = p.relatorio.texturas[0]
          expect(Math.max(t.largura, t.altura)).toBe(1024)
        }
      } else {
        await expect(prepararAvatar(bytes, r, ganchos)).rejects.toMatchObject({ codigo: 'sem_confirmacao' })
      }
    },
  )

  it('só as texturas realmente grandes e aceitas chegam ao gancho de redução', () => {
    // 2 fixtures com textura 2048 aceitas pelo teste acima (a que proíbe modificar é recusada antes).
    expect(espiao.reduzir).toBe(1)
    expect(espiao.createImageBitmap + espiao.offscreen + espiao.image).toBe(0)
  })
})

describe('cabeçalhos de imagem (sem decodificar)', () => {
  it('PNG (IHDR)', () => {
    expect(lerDimensoesDaImagem(pngSolido(37, 19))).toMatchObject({ formato: 'png', largura: 37, altura: 19 })
  })
  it('JPEG (SOF0)', () => {
    // prettier-ignore
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x03, 0x00, 0x04, 0x00, 1, 1, 0x11, 0])
    expect(lerDimensoesDaImagem(jpeg)).toMatchObject({ formato: 'jpeg', largura: 1024, altura: 768 })
  })
  it('WebP (VP8X)', () => {
    const webp = new Uint8Array(30)
    webp.set([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0,
    ])
    webp.set([0xff, 0x07, 0x00], 24)
    webp.set([0xff, 0x03, 0x00], 27)
    expect(lerDimensoesDaImagem(webp)).toMatchObject({ formato: 'webp', largura: 2048, altura: 1024 })
  })
  it('lixo ou curto devolve null', () => {
    expect(lerDimensoesDaImagem(new Uint8Array(0))).toBeNull()
    expect(lerDimensoesDaImagem(Uint8Array.from([1, 2, 3, 4, 5]))).toBeNull()
  })
})

describe('detalhes que o protótipo também garantia', () => {
  it('GLB_CHUNK_LENGTH_UNALIGNED vira aviso (o three.js lê esse arquivo), não recusa', async () => {
    const r = await validarAvatar(fix.get('glb-json-sem-padding.glb') as Uint8Array, {
      protegido: false,
      direitosConfirmados: true,
      validador,
    })
    expect(r.decisao).toBe('aceito')
    expect(r.avisos.map((a) => a.codigo)).toContain('bloco_desalinhado')
  })

  it('sem o validador a etapa é pulada com aviso (nunca CDN)', async () => {
    const r = await validarAvatar(fix.get('glb-valido-pequeno.glb') as Uint8Array, {
      protegido: false,
      direitosConfirmados: true,
    })
    expect(r.avisos.map((a) => a.codigo)).toContain('validador_ausente')
  })

  it('o validador nunca baixa recurso externo', async () => {
    let pedido: string | null = null
    const espia = {
      validateBytes: async (_b: Uint8Array, o: { externalResourceFunction: (u: string) => Promise<Uint8Array> }) => {
        await o.externalResourceFunction('https://exemplo.invalid/x.bin').catch((e: Error) => (pedido = e.message))
        return {}
      },
    }
    await validarAvatar(fix.get('glb-valido-pequeno.glb') as Uint8Array, { protegido: false, validador: espia })
    expect(pedido).toMatch(/bloqueado/)
  })

  it('protegido ausente, nulo ou não booleano vale como menor (falha fechada)', async () => {
    const b = fix.get('glb-valido-pequeno.glb') as Uint8Array
    for (const p of [undefined, null, 0, 'false'] as unknown[]) {
      const r = await validarAvatar(b, { protegido: p as boolean, direitosConfirmados: true, validador })
      expect(r.perfil).toBe('menor')
      expect(r.decisao).toBe('recusado')
    }
  })

  it('o ranking e o tier mínimo do app saem dos triângulos', async () => {
    const r = await validarAvatar(fix.get('glb-malha-25k.glb') as Uint8Array, {
      protegido: false,
      direitosConfirmados: true,
      validador,
    })
    expect(r.ranking?.rotulo).toBe('medio')
    expect(r.ranking?.fraco).toBe(false)
    expect(tierMinimoParaTriangulos(25_000)).toBe('medio')
    expect(tierMinimoParaTriangulos(19_000)).toBe('fraco')
    expect(tierMinimoParaTriangulos(60_000)).toBe('forte')
    expect(tierMinimoParaTriangulos(80_000)).toBeNull()
  })

  it('o crédito do VRM sai limpo (sem controle nem inversão de texto)', async () => {
    const { vrm1, META1_BASE } = await import('./harness/avatarFixtures')
    const r = await validarAvatar(
      vrm1({ ...META1_BASE, name: 'Nome‮oculto\u0000', authors: ['Ana', 'B'.repeat(500)] }),
      { protegido: false, direitosConfirmados: true, validador },
    )
    expect(r.credito?.titulo).toBe('Nome oculto')
    expect(r.credito?.autores[0]).toBe('Ana')
    expect(r.credito?.autores[1].length).toBe(80)
  })

  it('UTF-8 inválido no JSON é recusado sem lançar', async () => {
    const { json, bin } = lerGlb(fix.get('glb-valido-pequeno.glb') as Uint8Array)
    const bom = montarGlb(json, bin)
    const ruim = new Uint8Array(bom)
    // o JSON começa em 20: troca um byte do texto por 0xff
    ruim[24] = 0xff
    const r = await validarAvatar(ruim, { protegido: false, validador })
    expect(r.decisao).toBe('recusado')
    expect(r.recusas[0].codigo).toBe('json_utf8')
  })

  it('o crédito e a ordem do round-trip de GLB se mantêm (montar -> ler)', () => {
    const { json, bin } = lerGlb(fix.get('glb-valido-pequeno.glb') as Uint8Array)
    const de_novo = lerGlb(montarGlb(json, bin))
    expect(de_novo.json).toEqual(json)
    expect(de_novo.bin?.length).toBeGreaterThan(0)
  })
})

describe('espiões', () => {
  it('nenhuma validação chamou decodificador do navegador', () => {
    vi.useRealTimers()
    expect(espiao.createImageBitmap).toBe(0)
    expect(espiao.offscreen).toBe(0)
    expect(espiao.image).toBe(0)
  })
})
