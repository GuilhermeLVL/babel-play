/**
 * HARNESS DO AVATAR (só desenvolvimento): monta o `AvatarCanvas` fora do app, para o E2E.
 *
 * Abrir: `/tests/e2e/avatar-harness/index.html?fonte=/avatares/dev/milk.vrm&tier=medio&tamanho=256`.
 * `window.__avatarHarness` deixa o teste trocar estado e emoção, desmontar e ler os erros reportados.
 * Não é uma tela do produto: nada daqui entra no build (`index.html` do app é a única entrada do Vite).
 */
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import AvatarCanvas from '../../../src/components/avatar/AvatarCanvas'
import AvatarFalante from '../../../src/components/avatar/AvatarFalante'
import type { PoseDaBoca } from '../../../src/core/avatar/boca'
import type { MedidasDoModelo, ModoDeCamera } from '../../../src/core/avatar/enquadramento'
import { type EmocaoDoAvatar, EMOCOES_DO_AVATAR, type EstadoDoAvatar } from '../../../src/core/avatar/estados'
import { validarReceita } from '../../../src/core/avatar/receita'
import type { TierDoAvatar } from '../../../src/core/avatar/tiers'
import { modeloDaColecao } from '../../../src/data/avatar/colecao'
import { prepararAnalisadorDaVoz } from '../../../src/lib/avatar/amplitude'
import { ligarAvatarAFala, useAvatarFalando } from '../../../src/lib/avatar/fala'
import type { SessaoDeAvatar } from '../../../src/lib/avatar/motor'
import type { SpeakOptions, TtsEngine } from '../../../src/lib/tts'
import { elemento } from '../../../src/lib/voz/elementoDaVoz'

const q = new URLSearchParams(location.search)
const fonte = q.get('fonte') ?? '/avatares/dev/milk.vrm'
const tier = (q.get('tier') ?? 'medio') as TierDoAvatar
const tamanho = Number(q.get('tamanho') ?? 256)
const baseId = q.get('base') ?? 'milk'
/** `catalogo=1`: usa as câmeras calibradas do catálogo (senão o motor mede o arquivo, que é o que calibra). */
const camerasDoCatalogo = q.get('catalogo') === '1' ? (modeloDaColecao(baseId)?.camera ?? null) : undefined

const r = validarReceita({
  versao: 1,
  base: { origem: 'colecao', id: baseId },
  paleta: { pele: 'pele-3', cabelo: 'cabelo-1', olhos: 'olhos-2' },
  pecas: [],
  ajustes: {},
  meta: { nome: q.get('nome') ?? 'Ana Souza', criadoEm: 1_790_000_000_000 },
})
if (!('receita' in r)) throw new Error(r.erros.join('; '))
const receita = r.receita

interface AmostraDaFala {
  t: number
  abertura: number
  vogal: string
  origem: string
  rms: number | null
}

interface Ponte {
  mudar(estado: EstadoDoAvatar, emocao: EmocaoDoAvatar): void
  desmontar(): void
  erros: string[]
  emocoes: readonly string[]
  /** M3 — fala. `nuvem`: toca um WAV sintético pelo elemento compartilhado; `aparelho`: eventos start/boundary/end simulados. */
  falar(modo: 'nuvem' | 'aparelho', texto: string, emocao: EmocaoDoAvatar): Promise<void>
  /** Congela a boca numa pose fixa (capturas determinísticas); `null` volta à fonte real. */
  congelarBoca(pose: PoseDaBoca | null): void
  /** Amostras da fala (uma por quadro) desde o último `limparAmostras`. */
  amostras(): AmostraDaFala[]
  limparAmostras(): void
  falando(): boolean
  /** Mede o custo por quadro do motor aberto. */
  medir(n: number, sincronizarGpu: boolean): { quadros: number; mediaMs: number; p95Ms: number; maxMs: number } | null
  /** Liga uma fonte de boca sintética que se mexe sempre (para medir o custo COM fala sem depender do relógio). */
  bocaSintetica(ligada: boolean): void
  analisadorPronto(): boolean
  volumeDoElemento(): { volume: number; muted: boolean; tocando: boolean }
  /** Quadros já desenhados pelo motor. */
  quadros(): number
  /** M2.1: medidas do modelo (calibragem) e troca de câmera. */
  medidas(): MedidasDoModelo | null
  modo(m: ModoDeCamera): void
  /** Quadro atual: pixels não vazios por borda (0 = nada encosta no limite) e total. */
  bordas(): { total: number; naoVazios: number; naBorda: number } | null
  stats(): { antialias: boolean; pixelRatio: number } | null
}
declare global {
  interface Window {
    __avatarHarness?: Ponte
  }
}

/** WAV mono 16-bit: tom de 180 Hz + harmônicos, modulado a 4 Hz (sílabas), com um silêncio no meio. */
function wavSintetico(segundos: number): Blob {
  const taxa = 22050
  const n = Math.floor(taxa * segundos)
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const txt = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  txt(0, 'RIFF')
  v.setUint32(4, 36 + n * 2, true)
  txt(8, 'WAVE')
  txt(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, taxa, true)
  v.setUint32(28, taxa * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  txt(36, 'data')
  v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    const t = i / taxa
    const silencio = t > segundos * 0.4 && t < segundos * 0.55
    const silabas = Math.max(0, Math.sin(2 * Math.PI * 4 * t)) ** 0.7
    const tom =
      Math.sin(2 * Math.PI * 180 * t) + 0.5 * Math.sin(2 * Math.PI * 360 * t) + 0.25 * Math.sin(2 * Math.PI * 540 * t)
    v.setInt16(44 + i * 2, silencio ? 0 : Math.round(tom * silabas * 0.4 * 32767 * 0.6), true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

const amostras: AmostraDaFala[] = []
let congelada: PoseDaBoca | null = null
let sintetica = false
let sessao: SessaoDeAvatar | null = null
let wavUrl: string | null = null
let timers: number[] = []

/** O motor falso: `nuvem` toca de verdade no elemento compartilhado; `aparelho` só emite os eventos. */
const motorFalso: TtsEngine & { modo: 'nuvem' | 'aparelho' } = {
  modo: 'nuvem',
  speak(texto: string, opts?: SpeakOptions) {
    timers.forEach(clearTimeout)
    timers = []
    if (!opts) return
    if (this.modo === 'nuvem') {
      const el = elemento()
      if (wavUrl) URL.revokeObjectURL(wavUrl)
      wavUrl = URL.createObjectURL(wavSintetico(3))
      el.src = wavUrl
      el.onended = () => opts.onEnd?.()
      el.onerror = () => opts.onError?.()
      el.play().then(
        () => opts.onStart?.(),
        () => opts.onError?.(),
      )
    } else {
      // Fala "do aparelho": start, um boundary por palavra (a cada ~330 ms) e end.
      timers.push(window.setTimeout(() => opts.onStart?.(), 30))
      let i = 0
      for (const m of texto.matchAll(/\S+/g)) {
        const idx = m.index ?? 0
        timers.push(window.setTimeout(() => opts.onBoundary?.(idx), 30 + 330 * ++i))
      }
      timers.push(window.setTimeout(() => opts.onEnd?.(), 30 + 330 * (i + 1)))
    }
  },
  cancel() {
    timers.forEach(clearTimeout)
    timers = []
    elemento().pause()
  },
}

let emocaoAtual: EmocaoDoAvatar = 'neutro'
const ligacao = ligarAvatarAFala(motorFalso, { emocao: () => emocaoAtual, temTom: false })

function amostrar() {
  const p = ligacao.pose()
  if (p)
    amostras.push({ t: performance.now(), abertura: p.abertura, vogal: p.vogal, origem: ligacao.origem(), rms: null })
  requestAnimationFrame(amostrar)
}
requestAnimationFrame(amostrar)

const fonteDaBoca = (t: number): PoseDaBoca | null => {
  if (congelada) return congelada
  if (sintetica)
    return {
      vogal: (['A', 'E', 'I', 'O', 'U'] as const)[Math.floor(t / 120) % 5],
      abertura: 0.5 + 0.5 * Math.sin(t / 60),
      acabou: false,
    }
  return ligacao.pose(t)
}

function Harness() {
  const [estado, setEstado] = useState<EstadoDoAvatar>('parado')
  const [emocao, setEmocao] = useState<EmocaoDoAvatar>('neutro')
  const [montado, setMontado] = useState(true)
  const [modo, setModo] = useState<ModoDeCamera>('corpo')
  const falando = useAvatarFalando(ligacao)
  useEffect(() => {
    window.__avatarHarness = {
      mudar: (e, em) => {
        setEstado(e)
        setEmocao(em)
        emocaoAtual = em
      },
      falar: async (modo, texto, em) => {
        motorFalso.modo = modo
        emocaoAtual = em
        setEmocao(em)
        if (modo === 'nuvem') await prepararAnalisadorDaVoz()
        ligacao.motor.speak(texto, { lang: 'pt-BR' })
      },
      congelarBoca: (p) => {
        congelada = p
      },
      amostras: () => amostras.slice(),
      limparAmostras: () => {
        amostras.length = 0
      },
      falando: () => ligacao.falando(),
      medir: (n, gpu) => sessao?.motor.medirQuadros(n, { sincronizarGpu: gpu }) ?? null,
      bocaSintetica: (l) => {
        sintetica = l
      },
      analisadorPronto: () => ligacao.origem() === 'amplitude',
      volumeDoElemento: () => {
        const el = elemento()
        return { volume: el.volume, muted: el.muted, tocando: !el.paused }
      },
      quadros: () => sessao?.motor.estatisticas().quadros ?? 0,
      medidas: () => sessao?.motor.medirModelo() ?? null,
      modo: (m) => setModo(m),
      stats: () => {
        const e = sessao?.motor.estatisticas()
        return e ? { antialias: e.antialias, pixelRatio: e.pixelRatio } : null
      },
      bordas: () => {
        const c = document.querySelector('canvas')
        if (!c || !sessao) return null
        sessao.motor.amostrarPixels()
        const gl = (c.getContext('webgl2') ?? null) as WebGL2RenderingContext | null
        if (!gl) return null
        const w = gl.drawingBufferWidth
        const h = gl.drawingBufferHeight
        const px = new Uint8Array(w * h * 4)
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
        let naoVazios = 0
        let naBorda = 0
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            if (px[(y * w + x) * 4 + 3] === 0) continue
            naoVazios++
            if (x === 0 || y === 0 || x === w - 1 || y === h - 1) naBorda++
          }
        return { total: w * h, naoVazios, naBorda }
      },
      desmontar: () => setMontado(false),
      erros: window.__avatarHarness?.erros ?? [],
      emocoes: EMOCOES_DO_AVATAR,
    }
  }, [])
  if (!montado) return <p id="desmontado">desmontado</p>
  if (q.get('fala') === '1') {
    return (
      <AvatarFalante
        receita={receita}
        falando={falando || estado === 'falando'}
        emocao={emocao}
        tier={tier}
        tamanho={tamanho}
        fonte={fonte}
        fonteDaBoca={fonteDaBoca}
        aoSessao={(s) => {
          sessao = s
        }}
        anunciar={q.get('anunciar') === '1'}
        aoErro={(m) => window.__avatarHarness?.erros.push(m)}
      />
    )
  }
  return (
    <AvatarCanvas
      receita={receita}
      estado={estado}
      emocao={emocao}
      tier={tier}
      tamanho={tamanho}
      fonte={fonte}
      modo={modo}
      enquadramento={camerasDoCatalogo}
      aoSessao={(s) => {
        sessao = s
      }}
      aoErro={(m) => window.__avatarHarness?.erros.push(m)}
    />
  )
}

window.__avatarHarness = {
  mudar: () => undefined,
  desmontar: () => undefined,
  erros: [],
  emocoes: EMOCOES_DO_AVATAR,
} as unknown as Ponte
createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
