/**
 * HARNESS DO AVATAR (só desenvolvimento): monta o `AvatarCanvas` fora do app, para o E2E.
 *
 * Abrir: `/tests/e2e/avatar-harness/index.html?fonte=/avatares/dev/milk.vrm&tier=medio&tamanho=256`.
 * `window.__avatarHarness` deixa o teste trocar estado e emoção, desmontar e ler os erros reportados.
 * Não é uma tela do produto: nada daqui entra no build (`index.html` do app é a única entrada do Vite).
 */
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import AvatarCanvas from '../../../src/components/avatar/AvatarCanvas'
import AvatarFalante from '../../../src/components/avatar/AvatarFalante'
import AvatarSinalizante from '../../../src/components/avatar/AvatarSinalizante'
import type { PoseDaBoca } from '../../../src/core/avatar/boca'
import type { MedidasDoModelo, ModoDeCamera } from '../../../src/core/avatar/enquadramento'
import { type EmocaoDoAvatar, EMOCOES_DO_AVATAR, type EstadoDoAvatar } from '../../../src/core/avatar/estados'
import { validarReceita } from '../../../src/core/avatar/receita'
import type { Lingua, Sequencia } from '../../../src/core/avatar/sinais/tipos'
import type { TierDoAvatar } from '../../../src/core/avatar/tiers'
import { modeloDaColecao } from '../../../src/data/avatar/colecao'
import { prepararAnalisadorDaVoz } from '../../../src/lib/avatar/amplitude'
import { ligarAvatarAFala, useAvatarFalando } from '../../../src/lib/avatar/fala'
import type { ControleDeMaos, ResultadoDeIndependencia } from '../../../src/lib/avatar/maos'
import type { SessaoDeAvatar } from '../../../src/lib/avatar/motor'
import type { SpeakOptions, TtsEngine } from '../../../src/lib/tts'
import { elemento } from '../../../src/lib/voz/elementoDaVoz'

const q = new URLSearchParams(location.search)
const fonte = q.get('fonte') ?? '/avatares/dev/milk.vrm'
const tier = (q.get('tier') ?? 'medio') as TierDoAvatar
const tamanho = Number(q.get('tamanho') ?? 256)
const baseId = q.get('base') ?? 'milk'
/** `catalogo=1`: usa as câmeras calibradas do catálogo (senão o motor mede o arquivo, que é o que calibra). */
/** `pecas=a,b`: ids do Estúdio ligados na cena; `modo=rosto`: começa na câmera do rosto. */
const pecasDaCena = (q.get('pecas') ?? '').split(',').filter(Boolean)
const modoInicial: ModoDeCamera = q.get('modo') === 'rosto' ? 'rosto' : 'corpo'
let montadasDaCena: string[] = []
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
  /** M2.2: ids das peças que o motor JÁ montou (esperar por isto, não por tempo). */
  pecasMontadas(): string[]
  /** M2.1: medidas do modelo (calibragem) e troca de câmera. */
  medidas(): MedidasDoModelo | null
  modo(m: ModoDeCamera): void
  /** Quadro atual: pixels não vazios por borda (0 = nada encosta no limite) e total. */
  bordas(): {
    total: number
    naoVazios: number
    naBorda: number
    topo: number
    base: number
    lados: number
    /** Caixa dos pixels não vazios, em frações do quadro (0..1, y de cima para baixo). */
    caixa: { x0: number; x1: number; y0: number; y1: number }
  } | null
  stats(): { antialias: boolean; pixelRatio: number } | null
  /** M4b: soletração (`?sinais=1`). */
  sinais?: {
    sequencia(): Sequencia | null
    controle(): ControleDeMaos | null
    /** Verificador de independência dos dedos nas duas mãos (a pose do avatar fica neutra no fim). */
    testeDedos(): Promise<{ R: ResultadoDeIndependencia; L: ResultadoDeIndependencia } | null>
    /** Remove os avisos fixos do DOM (para provar que voltam). */
    removerAvisos(): void
    /** Esconde os avisos por estilo e esvazia o texto (adulteração). */
    adulterarAvisos(): void
    naoSuportou(): string | null
    palavraAtual(): string | null
    terminou(): boolean
    letrasVistas(): string
    erros: string[]
  }
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

/** M4b: o avatar que soletra, com botões. `?sinais=1&alfabeto=libras&texto=Conceição&cam=maos&contraste=1&espelhar=1&vel=1`. */
function PainelSinais() {
  const [texto, setTexto] = useState(q.get('texto') ?? 'Conceição')
  const [alfabeto, setAlfabeto] = useState<Lingua>(q.get('alfabeto') === 'asl' ? 'asl' : 'libras')
  const [vel, setVel] = useState(Number(q.get('vel') ?? 1))
  const [espelhar, setEspelhar] = useState(q.get('espelhar') === '1')
  const [cam, setCam] = useState<'corpo' | 'maos'>(q.get('cam') === 'maos' ? 'maos' : 'corpo')
  const [contraste, setContraste] = useState(q.get('contraste') === '1')
  const [rep, setRep] = useState(0)
  const [fim, setFim] = useState(false)
  const [semSuporte, setSemSuporte] = useState<string | null>(null)
  const info = useRef<{ controle: ControleDeMaos; sequencia: Sequencia } | null>(null)
  const atual = useRef<string | null>(null)
  const vistas = useRef('')
  const erros = useRef<string[]>([])
  useEffect(() => {
    const aoErro = (e: ErrorEvent) => erros.current.push(e.message)
    window.addEventListener('error', aoErro)
    return () => window.removeEventListener('error', aoErro)
  }, [])
  useEffect(() => {
    const ponte = window.__avatarHarness
    if (!ponte) return
    ponte.sinais = {
      sequencia: () => info.current?.sequencia ?? null,
      controle: () => info.current?.controle ?? null,
      testeDedos: async () => {
        if (!info.current) return null
        const { medirIndependenciaDosDedos } = await import('../../../src/lib/avatar/maos')
        const c = info.current.controle
        return { R: medirIndependenciaDosDedos(c, 'R'), L: medirIndependenciaDosDedos(c, 'L') }
      },
      removerAvisos: () => document.querySelector('[data-avisos-fixos]')?.remove(),
      adulterarAvisos: () => {
        for (const el of document.querySelectorAll<HTMLElement>('[data-aviso-fixo]')) {
          el.style.display = 'none'
          el.textContent = ''
        }
      },
      naoSuportou: () => semSuporte,
      palavraAtual: () => atual.current,
      terminou: () => fim,
      letrasVistas: () => vistas.current,
      erros: erros.current,
    }
  })
  const iniciar = (t: string, a: Lingua) => {
    setTexto(t)
    setAlfabeto(a)
    setFim(false)
    vistas.current = ''
    setRep((n) => n + 1)
  }
  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        <button onClick={() => iniciar('Conceição', 'libras')}>Soletrar Conceição (Libras)</button>
        <button onClick={() => iniciar('Conceição', 'asl')}>Soletrar Conceição (ASL)</button>
        <button onClick={() => iniciar('Hoje Maria viu Zé e João', alfabeto)}>Frase com nomes</button>
        <button onClick={() => iniciar(texto, alfabeto)}>Repetir</button>
        <button onClick={() => setEspelhar((v) => !v)} aria-pressed={espelhar}>
          Canhoto
        </button>
        <button onClick={() => setCam((c) => (c === 'maos' ? 'corpo' : 'maos'))} aria-pressed={cam === 'maos'}>
          Só mãos
        </button>
        <button onClick={() => setContraste((v) => !v)} aria-pressed={contraste}>
          Alto contraste
        </button>
        <select aria-label="velocidade" value={vel} onChange={(e) => setVel(Number(e.target.value))}>
          {[0.5, 1, 1.5, 2].map((v) => (
            <option key={v} value={v}>
              {v}x
            </option>
          ))}
        </select>
      </div>
      <input
        aria-label="texto"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          setFim(false)
        }}
        style={{ width: '100%', marginBottom: 8 }}
      />
      <AvatarSinalizante
        texto={texto}
        alfabeto={alfabeto}
        receita={receita}
        tier={tier}
        fonte={fonte}
        velocidade={vel}
        espelhar={espelhar}
        camera={cam}
        altoContraste={contraste}
        tamanho={Math.min(tamanho, Math.max(200, window.innerWidth - 40))}
        repetir={rep}
        pausado={q.get('pausado') === '1'}
        soletrarUmaLetra={q.get('uma') === '1'}
        tempoFixoMs={q.get('t') ? Number(q.get('t')) : undefined}
        tetoMs={q.get('teto') ? Number(q.get('teto')) : 30_000}
        anunciar={q.get('anunciar') === '1'}
        aoPalavra={(i) => {
          atual.current = info.current?.sequencia.palavras[i]?.texto ?? null
        }}
        aoFim={() => setFim(true)}
        aoNaoSuportar={setSemSuporte}
        aoErro={(m) => window.__avatarHarness?.erros.push(String(m))}
        aoPronto={(i) => {
          info.current = i
          const base = i.sequencia.passos.map((p) => p.letra).join('')
          vistas.current = base
        }}
      />
    </div>
  )
}

function Harness() {
  const [estado, setEstado] = useState<EstadoDoAvatar>('parado')
  const [emocao, setEmocao] = useState<EmocaoDoAvatar>('neutro')
  const [montado, setMontado] = useState(true)
  const [modo, setModo] = useState<ModoDeCamera>(modoInicial)
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
      pecasMontadas: () => montadasDaCena.slice(),
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
        let topo = 0
        let base = 0
        let lados = 0
        let x0 = w
        let x1 = -1
        let y0 = h
        let y1 = -1
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            if (px[(y * w + x) * 4 + 3] === 0) continue
            naoVazios++
            x0 = Math.min(x0, x)
            x1 = Math.max(x1, x)
            y0 = Math.min(y0, y)
            y1 = Math.max(y1, y)
            // A origem do `readPixels` é o canto de BAIXO: y === 0 é a base do quadro.
            if (y === h - 1) topo++
            if (y === 0) base++
            if (x === 0 || x === w - 1) lados++
            if (x === 0 || y === 0 || x === w - 1 || y === h - 1) naBorda++
          }
        return {
          total: w * h,
          naoVazios,
          naBorda,
          topo,
          base,
          lados,
          // y do readPixels é de baixo para cima: inverte para "de cima para baixo".
          caixa: { x0: x0 / w, x1: (x1 + 1) / w, y0: (h - 1 - y1) / h, y1: (h - y0) / h },
        }
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
      {...(pecasDaCena.length ? { pecas: { ids: pecasDaCena, cores: {} } } : {})}
      aoPecas={(r) => {
        montadasDaCena = r.montadas
      }}
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
  <StrictMode>{q.get('sinais') === '1' ? <PainelSinais /> : <Harness />}</StrictMode>,
)
