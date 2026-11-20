/**
 * "MEU AVATAR" (M2), núcleo e dados: paleta, aparência, edição da receita com "Desfazer", sugestão por perfil,
 * leitura desconfiada da galeria e integridade do catálogo da coleção e das fontes.
 */
import { describe, expect, it } from 'vitest'

import { escalaDaReceita, mapearMateriais, suporteDaPaleta } from '../src/core/avatar/aparencia'
import {
  aplicar,
  comAjuste,
  comBase,
  comNome,
  comPaleta,
  desfazer,
  estaNoPadrao,
  iniciarHistorico,
  receitaNova,
  restaurarPadrao,
} from '../src/core/avatar/edicao'
import {
  avataresDaColecao,
  COLECOES_DA_GALERIA,
  colecoesAceitas,
  MAX_ITENS_DA_GALERIA,
} from '../src/core/avatar/galeria'
import { novoIdDoModelo } from '../src/core/avatar/importador/identidade'
import { CAMPOS_DA_PALETA, corDaPaleta, ehTokenDaPaleta, escurecerHex, PALETA } from '../src/core/avatar/paleta'
import { validarReceita } from '../src/core/avatar/receita'
import { sugerirModelo } from '../src/core/avatar/sugestao'
import { COLECAO_CURADA, modeloDaColecao } from '../src/data/avatar/colecao'
import { FERRAMENTAS_DE_AVATAR, FONTES_DE_AVATAR } from '../src/data/avatar/fontes'

const base = { origem: 'colecao' as const, id: 'milk' }
const nova = () => receitaNova(base, 'Ana', 1_790_000_000_000)

describe('paleta', () => {
  it('cada campo tem o token "padrao" e ids únicos que a receita aceita', () => {
    for (const campo of CAMPOS_DA_PALETA) {
      const ids = PALETA[campo].map((c) => c.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids[0]).toBe('padrao')
      expect(PALETA[campo][0].hex).toBeNull()
      for (const c of PALETA[campo].slice(1)) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/)
      for (const id of ids) {
        const r = comPaleta(nova(), campo, id)
        expect(validarReceita(r).ok, `${campo}:${id}`).toBe(true)
      }
    }
  })

  it('cobre uma faixa ampla de tons de pele, do muito claro ao muito escuro', () => {
    const pele = PALETA.pele.filter((c) => c.hex)
    expect(pele.length).toBeGreaterThanOrEqual(10)
    const luz = (h: string) => {
      const n = Number.parseInt(h.slice(1), 16)
      return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)
    }
    const l = pele.map((c) => luz(c.hex as string)).sort((a, b) => a - b)
    expect(l[l.length - 1] - l[0]).toBeGreaterThan(150)
  })

  it('token desconhecido é recusado (a receita nunca guarda cor crua)', () => {
    expect(ehTokenDaPaleta('pele', 'claro')).toBe(true)
    expect(ehTokenDaPaleta('pele', '#ff0000')).toBe(false)
    expect(ehTokenDaPaleta('pele', 'loiro')).toBe(false)
    expect(comPaleta(nova(), 'pele', '#ff0000')).toEqual(nova())
    expect(corDaPaleta('cabelo', 'azul')?.hex).toBe('#2f5fd0')
    expect(corDaPaleta('cabelo', 'nada')).toBeNull()
  })

  it('escurece um tom sem sair do formato', () => {
    expect(escurecerHex('#ffffff', 0.5)).toBe('#808080')
    expect(escurecerHex('#000000', 0.5)).toBe('#000000')
  })
})

describe('aparência: o que o modelo permite', () => {
  it('reconhece materiais à moda do VRoid e ignora o que tem cor própria', () => {
    const m = mapearMateriais([
      'Face_Skin',
      'Body_Skin',
      'Hair',
      'HairBack',
      'EyeIris',
      'EyeWhite',
      'EyeHighlight',
      'Face_Eyeline',
      'FaceMouth',
      'Tops_01_CLOTH',
      'Bottoms',
    ])
    expect(m.pele).toEqual([0, 1])
    expect(m.cabelo).toEqual([2, 3])
    expect(m.olhos).toEqual([4])
  })

  it('textura única "assada" (mat_84) não separa nada: o controle é escondido', () => {
    expect(suporteDaPaleta(mapearMateriais(['mat_84']))).toEqual({ pele: false, cabelo: false, olhos: false })
    expect(suporteDaPaleta(mapearMateriais([]))).toEqual({ pele: false, cabelo: false, olhos: false })
  })

  it('a escala final respeita as faixas da receita', () => {
    expect(escalaDaReceita({})).toEqual({ x: 1, y: 1, z: 1 })
    expect(escalaDaReceita({ escala: 1.2, altura: 0.9, largura: 1.1 })).toEqual({
      x: 1.2 * 1.1,
      y: 1.2 * 0.9,
      z: 1.2 * 1.1,
    })
    expect(escalaDaReceita({ escala: 99, altura: -3 })).toEqual({ x: 1.3, y: 1.3 * 0.8, z: 1.3 })
  })
})

describe('edição da receita', () => {
  it('a receita nova é válida e está no padrão', () => {
    const r = nova()
    expect(validarReceita(r).ok).toBe(true)
    expect(estaNoPadrao(r)).toBe(true)
  })

  it('ajuste: prende na faixa, arredonda e o valor 1 some da receita', () => {
    expect(comAjuste(nova(), 'altura', 5).ajustes.altura).toBe(1.2)
    expect(comAjuste(nova(), 'escala', 0).ajustes.escala).toBe(0.7)
    expect(comAjuste(nova(), 'largura', 1.0049).ajustes.largura).toBeUndefined()
    expect(comAjuste(nova(), 'largura', 1.134).ajustes.largura).toBe(1.13)
    expect(comAjuste(nova(), 'altura', Number.NaN)).toEqual(nova())
    const volta = comAjuste(comAjuste(nova(), 'altura', 1.1), 'altura', 1)
    expect(volta.ajustes).toEqual({})
    expect(validarReceita(comAjuste(nova(), 'escala', 1.3)).ok).toBe(true)
  })

  it('nome: apara e limita', () => {
    expect(comNome(nova(), '   Alex   ').meta.nome).toBe('Alex')
    expect(comNome(nova(), 'x'.repeat(100)).meta.nome.length).toBe(40)
  })

  it('trocar de base zera paleta e ajustes (cada modelo é um corpo)', () => {
    const r = comAjuste(comPaleta(nova(), 'pele', 'escuro'), 'altura', 1.1)
    const outro = comBase(r, { origem: 'colecao', id: 'bullidan' })
    expect(outro.base.id).toBe('bullidan')
    expect(estaNoPadrao(outro)).toBe(true)
    expect(outro.meta.nome).toBe('Ana')
  })

  it('desfazer volta um passo por vez e restaurar padrão limpa tudo', () => {
    let h = iniciarHistorico(nova())
    h = aplicar(h, comPaleta(h.atual, 'pele', 'claro'))
    h = aplicar(h, comAjuste(h.atual, 'altura', 1.1))
    expect(h.passado).toHaveLength(2)
    h = desfazer(h)
    expect(h.atual.ajustes.altura).toBeUndefined()
    expect(h.atual.paleta.pele).toBe('claro')
    h = desfazer(h)
    expect(estaNoPadrao(h.atual)).toBe(true)
    expect(desfazer(h)).toBe(h)
    const sujo = aplicar(h, comAjuste(comPaleta(h.atual, 'olhos', 'azul'), 'escala', 1.2))
    expect(estaNoPadrao(restaurarPadrao(sujo.atual))).toBe(true)
  })

  it('mudança nula não suja o histórico e a pilha tem teto', () => {
    const h = iniciarHistorico(nova())
    expect(aplicar(h, nova())).toBe(h)
    let g = h
    for (let i = 0; i < 80; i++) g = aplicar(g, comAjuste(g.atual, 'altura', 0.8 + (i % 40) / 100), 50)
    expect(g.passado.length).toBeLessThanOrEqual(50)
  })
})

describe('sugestão por perfil', () => {
  it('sorteia dentro da coleção e evita repetir o atual quando há outro', () => {
    expect(sugerirModelo(COLECAO_CURADA, false, () => 0)?.id).toBe(COLECAO_CURADA[0].id)
    expect(sugerirModelo(COLECAO_CURADA, false, () => 0.999)?.id).toBe(COLECAO_CURADA[COLECAO_CURADA.length - 1].id)
    expect(sugerirModelo(COLECAO_CURADA, true, () => 0, COLECAO_CURADA[0].id)?.id).not.toBe(COLECAO_CURADA[0].id)
  })

  it('perfil protegido nunca recebe modelo importado; sem itens elegíveis, null; sorteio inválido não quebra', () => {
    const misto = [{ id: 'meu', origem: 'importado' as const }, ...COLECAO_CURADA]
    for (let i = 0; i < 20; i++) expect(sugerirModelo(misto, true, () => i / 20)?.origem).not.toBe('importado')
    expect(sugerirModelo([{ id: 'meu', origem: 'importado' as const }], true, () => 0)).toBeNull()
    expect(sugerirModelo([], false, () => 0)).toBeNull()
    expect(sugerirModelo(COLECAO_CURADA, true, () => Number.NaN)).not.toBeNull()
  })

  it('só "false" exato é adulto: o resto é protegido', () => {
    for (const p of [undefined, null, 0, 'false'] as unknown[]) {
      const m = sugerirModelo([{ id: 'x', origem: 'importado' as const }], p as boolean, () => 0)
      expect(m).toBeNull()
    }
  })
})

describe('id do modelo trazido', () => {
  it('tem o formato que a receita aceita', () => {
    const id = novoIdDoModelo()
    expect(id).toMatch(/^imp-[0-9a-f]{12}$/)
    expect(validarReceita(receitaNova({ origem: 'importado', id }, 'x', 1)).ok).toBe(true)
    expect(novoIdDoModelo(() => Number.NaN)).toBe('imp-000000000000')
    expect(novoIdDoModelo(() => 5)).toBe('imp-ffffffffffff')
  })
})

describe('galeria ao vivo: desconfiar do que o terceiro devolve', () => {
  const projeto = (o: Record<string, unknown> = {}) => ({
    id: '100avatars-r1',
    creator_id: 'Polygonal-Mind',
    is_public: true,
    license: 'CC0',
    storage_type: 'arweave',
    ...o,
  })
  const avatar = (o: Record<string, unknown> = {}) => ({
    name: 'Devil',
    project_id: '100avatars-r1',
    format: 'VRM',
    is_public: true,
    is_draft: false,
    model_file_url: 'https://arweave.net/gfVzs1oH_aPaHVxpQK86HT_rqzyrFPOUKUrDJ30yprs',
    thumbnail_url: 'https://arweave.net/llxwUMPCfar71x4hLTU4f1-pcsYeGDUD4Gxm1dhWaDg',
    metadata: { number: '031' },
    ...o,
  })

  it('só as 3 séries 100Avatars, CC0, do autor certo, públicas e no Arweave', () => {
    expect(colecoesAceitas([projeto(), projeto({ id: '100avatars-r2' }), projeto({ id: '100avatars-r3' })])).toEqual([
      ...COLECOES_DA_GALERIA,
    ])
    const ruins = [
      projeto({ id: 'vipe-heroes-genesis' }),
      projeto({ license: 'CC-BY' }),
      projeto({ creator_id: 'outro' }),
      projeto({ is_public: false }),
      projeto({ storage_type: 'ipfs' }),
      'texto',
      null,
    ]
    expect(colecoesAceitas(ruins)).toEqual([])
    expect(colecoesAceitas({ a: 1 })).toEqual([])
    expect(colecoesAceitas(undefined)).toEqual([])
  })

  it('aceita o item bom e limpa o texto', () => {
    const [i] = avataresDaColecao([avatar({ name: 'Dev‮il\u0000' })], '100avatars-r1')
    expect(i.nome).toBe('Dev il')
    expect(i.numero).toBe('031')
    expect(i.id).toMatch(/^[a-z0-9_-]+$/)
  })

  it('descarta modelo ou miniatura fora do arweave.net, rascunho, não-VRM e coleção trocada', () => {
    const maus = [
      avatar({ model_file_url: 'https://evil.example/m.vrm' }),
      avatar({ model_file_url: 'http://arweave.net/gfVzs1oH_aPaHVxpQK86HT_rqzyrFPOUKUrDJ30yprs' }),
      avatar({ model_file_url: 'https://arweave.net.evil.example/gfVzs1oH_aPaHVxpQK86HT_rqzyrFPOUKUrDJ30yprs' }),
      avatar({ model_file_url: 'https://arweave.net/curto' }),
      avatar({ thumbnail_url: 'https://evil.example/t.gif' }),
      avatar({ thumbnail_url: 'javascript:alert(1)' }),
      avatar({ is_draft: true }),
      avatar({ is_public: false }),
      avatar({ format: 'FBX' }),
      avatar({ project_id: '100avatars-r2' }),
      avatar({ name: '   ' }),
      'x',
      null,
    ]
    expect(avataresDaColecao(maus, '100avatars-r1')).toEqual([])
    expect(avataresDaColecao({ nao: 'lista' }, '100avatars-r1')).toEqual([])
  })

  it('tem teto de itens', () => {
    const muitos = Array.from({ length: MAX_ITENS_DA_GALERIA + 50 }, (_, i) =>
      avatar({ name: `A${i}`, metadata: { number: String(i) } }),
    )
    expect(avataresDaColecao(muitos, '100avatars-r1')).toHaveLength(MAX_ITENS_DA_GALERIA)
  })
})

describe('catálogo da coleção curada', () => {
  it('cada modelo tem licença literal, autor, crédito, fonte https, e a receita dele é válida', () => {
    expect(COLECAO_CURADA.length).toBeGreaterThanOrEqual(2)
    const ids = COLECAO_CURADA.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of COLECAO_CURADA) {
      expect(m.origem).toBe('colecao')
      expect(m.id).toMatch(/^[a-z0-9][a-z0-9_-]*$/)
      expect(m.nome.length).toBeGreaterThan(0)
      expect(m.autor.length).toBeGreaterThan(0)
      expect(m.licenca).toMatch(/CC0|CC-BY|CC BY/i)
      expect(m.credito).toContain(m.autor)
      expect(m.fonteUrl).toMatch(/^https:\/\//)
      expect(Object.keys(m.suporta).sort()).toEqual(['cabelo', 'olhos', 'pele'])
      expect(m.triangulos).toBeGreaterThan(0)
      expect(validarReceita(receitaNova({ origem: 'colecao', id: m.id }, '', 1)).ok).toBe(true)
      expect(modeloDaColecao(m.id)).toBe(m)
    }
    expect(modeloDaColecao('nao-existe')).toBeUndefined()
  })

  it('os modelos 100Avatars têm textura única: não prometem recolorir', () => {
    for (const m of COLECAO_CURADA) expect(m.suporta).toEqual({ pele: false, cabelo: false, olhos: false })
  })
})

describe('fontes de avatar (onde encontrar)', () => {
  it('nada ficou sem fonte: todo cartão tem endereço, termos, licença e oferta', () => {
    const ids = FONTES_DE_AVATAR.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const f of FONTES_DE_AVATAR) {
      expect(f.url, f.id).toMatch(/^https:\/\//)
      expect(f.termosUrl, f.id).toMatch(/^https:\/\//)
      expect(f.nome.length, f.id).toBeGreaterThan(0)
      expect(f.oferece.length, f.id).toBeGreaterThan(5)
      expect(f.licenca.length, f.id).toBeGreaterThan(1)
      expect(typeof f.confirmado).toBe('boolean')
    }
  })

  it('o que a guarda do projeto proíbe como acervo não está nos cartões', () => {
    const ids = FONTES_DE_AVATAR.map((f) => f.id)
    for (const fora of ['mixamo', 'github-vrm', 'toxsam', 'huggingface', 'ready-player-me'])
      expect(ids).not.toContain(fora)
    // As fontes com cautela de licença dizem isso no cartão.
    expect(FONTES_DE_AVATAR.find((f) => f.id === 'quaternius')?.aviso).toBeTruthy()
    expect(FONTES_DE_AVATAR.find((f) => f.id === 'booth')?.aviso).toBeTruthy()
  })

  it('as ferramentas de conversão têm endereço https', () => {
    expect(FERRAMENTAS_DE_AVATAR.map((f) => f.id)).toEqual(expect.arrayContaining(['blender', 'vrm-addon']))
    for (const f of FERRAMENTAS_DE_AVATAR) expect(f.url).toMatch(/^https:\/\//)
  })
})
