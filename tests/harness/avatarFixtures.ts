/**
 * FIXTURES DO IMPORTADOR DE AVATAR, geradas byte a byte por código (nenhum binário opaco no repositório).
 * Porte de `gerar-fixtures.mjs` (ramo `proto/avatar-libras-fontes`). Usadas pelos testes do core e do componente.
 */
import { deflateSync } from 'node:zlib'

import { type Bytes, type Json, lerGlb, montarGlb } from '../../src/core/avatar/importador/glb'

let tabelaCrc: Uint32Array | null = null
function crc32(dados: Uint8Array): number {
  if (!tabelaCrc) {
    tabelaCrc = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      tabelaCrc[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (const b of dados) c = tabelaCrc[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function junta(...partes: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of partes) {
    out.set(p, o)
    o += p.length
  }
  return out
}
const u32 = (n: number) => Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0))

function blocoPng(tipo: string, dados: Uint8Array): Uint8Array {
  const t = latin1(tipo)
  return junta(u32(dados.length), t, dados, u32(crc32(junta(t, dados))))
}
function ihdr(w: number, h: number): Uint8Array {
  const d = new Uint8Array(13)
  d.set(u32(w), 0)
  d.set(u32(h), 4)
  d[8] = 8
  d[9] = 6
  return blocoPng('IHDR', d)
}
const ASSINATURA_PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** PNG de verdade (cor sólida): o navegador o decodificaria. */
export function pngSolido(w: number, h: number, rgba = [200, 120, 80, 255]): Uint8Array {
  const linha = new Uint8Array(1 + w * 4)
  for (let x = 0; x < w; x++) linha.set(rgba, 1 + x * 4)
  const cru = new Uint8Array(linha.length * h)
  for (let y = 0; y < h; y++) cru.set(linha, y * linha.length)
  return junta(
    ASSINATURA_PNG,
    ihdr(w, h),
    blocoPng('IDAT', deflateSync(cru, { level: 9 })),
    blocoPng('IEND', new Uint8Array(0)),
  )
}

/** "PNG" que só declara as dimensões no cabeçalho: poucos bytes, mas decodificar custaria gigabytes. */
export function pngBomba(w: number, h: number): Uint8Array {
  return junta(
    ASSINATURA_PNG,
    ihdr(w, h),
    blocoPng('IDAT', deflateSync(Uint8Array.from([0]))),
    blocoPng('IEND', new Uint8Array(0)),
  )
}

const alinhar = (n: number) => (4 - (n % 4)) % 4

export interface OpcoesDoGlb {
  triangulos?: number
  imagens?: Uint8Array[]
  extensoes?: Json
  extensionsRequired?: string[]
  extensionsUsed?: string[]
  imagensUri?: string[]
  contagemFalsa?: number
  nosExtras?: Json[]
  materiais?: Array<{ name: string }> | number
  ajustar?: (json: Json & { buffers: Json[]; scenes: Array<{ nodes: number[] }>; materials: Json[] }) => void
}

/** GLB com dados reais (passa no validador da Khronos), a menos que `contagemFalsa` seja usada. */
export function construirGlb(opcoes: OpcoesDoGlb = {}): Bytes {
  const {
    triangulos = 1,
    imagens = [],
    extensoes,
    extensionsRequired,
    extensionsUsed,
    imagensUri,
    contagemFalsa,
  } = opcoes
  const nosExtras = opcoes.nosExtras ?? []
  const nomesDeMaterial = Array.isArray(opcoes.materiais)
    ? opcoes.materiais.map((m) => m.name)
    : Array.from({ length: opcoes.materiais ?? 1 }, (_, i) => `mat${i}`)
  const V = Math.min(64, Math.max(3, triangulos * 3))
  const pos = new Float32Array(V * 3)
  const uv = new Float32Array(V * 2)
  for (let i = 0; i < V; i++) {
    pos.set([(i % 8) * 0.1, Math.floor(i / 8) * 0.1, 0], i * 3)
    uv.set([(i % 8) / 8, Math.floor(i / 8) / 8], i * 2)
  }
  const nIdx = triangulos * 3
  const idx = new Uint16Array(nIdx)
  for (let t = 0; t < triangulos; t++) {
    idx[t * 3] = (t * 3) % V
    idx[t * 3 + 1] = (t * 3 + 1) % V
    idx[t * 3 + 2] = (t * 3 + 2) % V
  }
  const partes: Uint8Array[] = []
  const vistas: Json[] = []
  let pos0 = 0
  const addVista = (u8: Uint8Array, alvo?: number) => {
    const pad = alinhar(pos0)
    if (pad) {
      partes.push(new Uint8Array(pad))
      pos0 += pad
    }
    vistas.push({ buffer: 0, byteOffset: pos0, byteLength: u8.byteLength, ...(alvo ? { target: alvo } : {}) })
    partes.push(u8)
    pos0 += u8.byteLength
    return vistas.length - 1
  }
  const vPos = addVista(new Uint8Array(pos.buffer), 34962)
  const vUv = addVista(new Uint8Array(uv.buffer), 34962)
  const vIdx = addVista(new Uint8Array(idx.buffer), 34963)
  const imgs = imagens.map((b) => ({ bufferView: addVista(b) }))
  const bin = new Uint8Array(pos0 + alinhar(pos0))
  let o = 0
  for (const p of partes) {
    bin.set(p, o)
    o += p.byteLength
  }
  const maxs = [-Infinity, -Infinity, 0]
  for (let i = 0; i < V; i++) {
    maxs[0] = Math.max(maxs[0], Math.fround(pos[i * 3]))
    maxs[1] = Math.max(maxs[1], Math.fround(pos[i * 3 + 1]))
  }
  const json = {
    asset: { version: '2.0', generator: 'frasy-fixtures' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'malha', mesh: 0 }, ...nosExtras],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    materials: nomesDeMaterial.map((name, i) => ({
      name,
      pbrMetallicRoughness: {
        baseColorFactor: [0.8, 0.5, 0.4, 1],
        ...(imgs.length && i === 0 ? { baseColorTexture: { index: 0 } } : {}),
      },
    })) as Json[],
    accessors: [
      { bufferView: vPos, componentType: 5126, count: V, type: 'VEC3', min: [0, 0, 0], max: maxs },
      { bufferView: vUv, componentType: 5126, count: V, type: 'VEC2' },
      { bufferView: vIdx, componentType: 5123, count: contagemFalsa ?? nIdx, type: 'SCALAR' },
    ],
    bufferViews: vistas,
    buffers: [{ byteLength: bin.byteLength }] as Json[],
  } as Json & {
    buffers: Json[]
    scenes: Array<{ nodes: number[] }>
    materials: Json[]
    images?: Json[]
    textures?: Json[]
  }
  if (imgs.length) {
    json.images = imgs.map((im) => ({ ...im, mimeType: 'image/png' }))
    json.textures = imgs.map((_, i) => ({ source: i }))
  }
  if (imagensUri) {
    json.images = imagensUri.map((uri) => ({ uri }))
    json.textures = imagensUri.map((_, i) => ({ source: i }))
    ;(json.materials[0] as { pbrMetallicRoughness: Json }).pbrMetallicRoughness.baseColorTexture = { index: 0 }
  }
  if (extensoes) json.extensions = extensoes
  if (extensionsUsed) json.extensionsUsed = extensionsUsed
  if (extensionsRequired) json.extensionsRequired = extensionsRequired
  opcoes.ajustar?.(json)
  return montarGlb(json, bin)
}

const DEDOS_VRM1 = [
  'ThumbMetacarpal',
  'ThumbProximal',
  'ThumbDistal',
  'IndexProximal',
  'IndexIntermediate',
  'IndexDistal',
  'MiddleProximal',
  'MiddleIntermediate',
  'MiddleDistal',
  'RingProximal',
  'RingIntermediate',
  'RingDistal',
  'LittleProximal',
  'LittleIntermediate',
  'LittleDistal',
]
const CORPO_VRM1 = [
  'hips',
  'spine',
  'head',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
]

function humanoidVrm1() {
  const nomes = [...CORPO_VRM1, ...['left', 'right'].flatMap((l) => DEDOS_VRM1.map((d) => l + d))]
  const nosOssos = nomes.map((name, i) => ({
    name,
    ...(i === 0 ? { children: nomes.slice(1).map((_, k) => k + 3) } : {}),
  }))
  const humanBones: Record<string, { node: number }> = {}
  nomes.forEach((n, i) => (humanBones[n] = { node: i + 2 }))
  return { humanBones, nosOssos }
}

/** Nomes de material à moda do VRoid Studio: o recolorido por pele, cabelo e olhos reconhece estes. */
export const MATERIAIS_VROID = [{ name: 'Face_Skin' }, { name: 'Body_Skin' }, { name: 'Hair' }, { name: 'EyeIris' }]

export function vrm1(meta: Json, opcoes: OpcoesDoGlb = {}): Bytes {
  const h = humanoidVrm1()
  return construirGlb({
    ...opcoes,
    nosExtras: [{ name: 'raiz', children: [2] }, ...h.nosOssos],
    ajustar: (j) => {
      j.scenes[0].nodes = [0, 1]
      opcoes.ajustar?.(j)
    },
    extensoes: { VRMC_vrm: { specVersion: '1.0', meta, humanoid: { humanBones: h.humanBones } } },
    extensionsUsed: ['VRMC_vrm'],
  })
}

export const META1_BASE: Json = {
  name: 'Modelo de teste',
  version: '1.0',
  authors: ['Autora Teste'],
  licenseUrl: 'https://vrm.dev/licenses/1.0/',
  avatarPermission: 'everyone',
  commercialUsage: 'corporation',
  creditNotation: 'required',
  allowRedistribution: false,
  modification: 'allowModificationRedistributionProhibited',
  allowExcessivelyViolentUsage: false,
  allowExcessivelySexualUsage: false,
  allowAntisocialOrHateUsage: false,
}
export const META0_LIBERADO: Json = {
  title: 'Modelo de teste 0.x',
  version: '1.0',
  author: 'Autor Teste',
  contactInformation: 'contato@exemplo.invalid',
  allowedUserName: 'Everyone',
  violentUssageName: 'Disallow',
  sexualUssageName: 'Disallow',
  commercialUssageName: 'Allow',
  licenseName: 'CC_BY',
}
const vrm0 = (meta: Json | null) =>
  construirGlb({
    extensoes: { VRM: { specVersion: '0.0', ...(meta ? { meta } : {}), humanoid: { humanBones: [] } } },
    extensionsUsed: ['VRM'],
  })

/** GLB válido cujo bloco JSON tem `len` não múltiplo de 4 (sem preenchimento) e o binário logo depois. */
function glbJsonSemPadding(): Bytes {
  const { json, bin } = lerGlb(construirGlb())
  const texto = JSON.stringify(json)
  const extra = (1 - (new TextEncoder().encode(texto).length % 4) + 4) % 4
  const jb = new TextEncoder().encode(texto + ' '.repeat(extra))
  const b = bin ?? new Uint8Array(0)
  const out = new Uint8Array(12 + 8 + jb.length + 8 + b.length)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, out.length, true)
  dv.setUint32(12, jb.length, true)
  dv.setUint32(16, 0x4e4f534a, true)
  out.set(jb, 20)
  const p = 20 + jb.length
  dv.setUint32(p, b.length, true)
  dv.setUint32(p + 4, 0x004e4942, true)
  out.set(b, p + 8)
  return out
}

/** Um VRM 1.0 liberado, com materiais nomeados à moda do VRoid (para o recolorido). */
export function vrm1Vroid(): Bytes {
  return vrm1(META1_BASE, { materiais: MATERIAIS_VROID })
}

export function gerarTodas(): Map<string, Bytes> {
  const f = new Map<string, Bytes>()
  f.set('glb-valido-pequeno.glb', construirGlb())
  f.set('glb-json-sem-padding.glb', glbJsonSemPadding())
  {
    const c = new Uint8Array(construirGlb())
    new DataView(c.buffer).setUint32(12, c.length, true) // o bloco JSON declara mais que o arquivo
    f.set('hostil-chunk-passa-do-fim.glb', c)
  }
  f.set('glb-malha-25k.glb', construirGlb({ triangulos: 25000 }))
  f.set('vrm0-liberado.vrm', vrm0(META0_LIBERADO))
  f.set(
    'vrm0-restritivo.vrm',
    vrm0({
      ...META0_LIBERADO,
      title: 'Restritivo',
      sexualUssageName: 'Allow',
      violentUssageName: 'Allow',
      licenseName: 'Other',
      otherLicenseUrl: 'https://exemplo.invalid/licenca',
    }),
  )
  f.set('vrm0-sem-meta.vrm', vrm0(null))
  f.set('vrm1-liberado.vrm', vrm1(META1_BASE))
  f.set('vrm1-sexual-permitido.vrm', vrm1({ ...META1_BASE, allowExcessivelySexualUsage: true }))
  f.set('vrm1-so-autor.vrm', vrm1({ ...META1_BASE, avatarPermission: 'onlyAuthor' }))
  f.set(
    'vrm1-proibe-modificar-tex2048.vrm',
    vrm1({ ...META1_BASE, modification: 'prohibited' }, { imagens: [pngSolido(2048, 2048)] }),
  )
  f.set('glb-textura-2048.glb', construirGlb({ imagens: [pngSolido(2048, 2048)] }))
  f.set(
    'hostil-uri-externa.glb',
    construirGlb({
      imagensUri: ['https://exemplo.invalid/tex.png'],
      ajustar: (j) => j.buffers.push({ byteLength: 100, uri: 'file:///etc/passwd' }),
    }),
  )
  f.set(
    'hostil-extensao-desconhecida.glb',
    construirGlb({ extensionsUsed: ['FRASY_extensao_hostil'], extensionsRequired: ['FRASY_extensao_hostil'] }),
  )
  f.set('hostil-malha-enorme.glb', construirGlb({ contagemFalsa: 3 * 300000 }))
  f.set('hostil-textura-gigante.glb', construirGlb({ imagens: [pngBomba(20000, 20000)] }))
  f.set('hostil-nao-e-glb.glb', new Uint8Array(pngSolido(8, 8)))
  const grande = new Uint8Array(15 * 1024 * 1024 + 1)
  grande.set([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0])
  f.set('hostil-maior-que-15mb.glb', grande)
  return f
}
