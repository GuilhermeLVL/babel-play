/**
 * O DOWNLOAD DA VOZ NO APARELHO (worker `supertonicLocal.worker.ts`, com OPFS, rede e hash falsos): o que já foi
 * conferido não baixa de novo, o parcial retoma por `Range`, servidor sem `Range` recomeça, e hash errado não vira
 * "pronto".
 */
import { describe, expect, it } from 'vitest'

import { ARQUIVOS_DO_SUPERTONIC, BYTES_DO_SUPERTONIC } from '../src/core/voz/supertonic'
import {
  type ArquivoDaPasta,
  criarWorkerDaVoz,
  type MensagemDaVoz,
  type PastaDaVoz,
} from '../src/gateway/adapters/supertonicLocal.worker'

const ALVO = ARQUIVOS_DO_SUPERTONIC[0] // onnx/tts.json, 8.253 bytes
const NOME = ALVO.caminho.replace(/\//g, '__')

function pastaFalsa() {
  const arquivos = new Map<string, Uint8Array>()
  const marcas = new Map<string, string>()
  /* Todos os outros já conferidos: o teste mexe só no alvo. */
  for (const a of ARQUIVOS_DO_SUPERTONIC.slice(1)) marcas.set(a.caminho.replace(/\//g, '__'), a.sha256)
  const pasta: PastaDaVoz & { arquivos: typeof arquivos; marcas: typeof marcas } = {
    arquivos,
    marcas,
    async abrir(nome): Promise<ArquivoDaPasta> {
      let b = arquivos.get(nome) ?? new Uint8Array(0)
      const salvar = () => arquivos.set(nome, b)
      return {
        tamanho: () => b.length,
        escrever(dados, em) {
          const novo = new Uint8Array(Math.max(b.length, em + dados.length))
          novo.set(b)
          novo.set(dados, em)
          b = novo
          salvar()
        },
        ler: () => b.slice(),
        truncar(n) {
          b = b.slice(0, n)
          salvar()
        },
        fechar() {},
      }
    },
    marca: async (nome) => marcas.get(nome) ?? null,
    marcar: async (nome, sha) => void marcas.set(nome, sha),
    apagarTudo: async () => {
      arquivos.clear()
      marcas.clear()
    },
  }
  return pasta
}

/** Conteúdo "certo" do alvo: todos os bytes 7. O hash falso só bate com ele. */
const certo = () => new Uint8Array(ALVO.bytes).fill(7)
const hashFalso = async (b: Uint8Array) => (b.length === ALVO.bytes && b.every((x) => x === 7) ? ALVO.sha256 : 'errado')

function servidor(o: { aceitaRange: boolean; conteudo?: Uint8Array }) {
  const pedidos: Array<{ url: string; range: string | null }> = []
  const buscar = async (url: string, init: RequestInit) => {
    const range = (init.headers as Record<string, string> | undefined)?.Range ?? null
    pedidos.push({ url, range })
    const tudo = o.conteudo ?? certo()
    const ini = range && o.aceitaRange ? Number(/bytes=(\d+)-/.exec(range)![1]) : 0
    return new Response(tudo.slice(ini), { status: range && o.aceitaRange ? 206 : 200 })
  }
  return { pedidos, buscar }
}

function montar(pasta: PastaDaVoz, buscar: (u: string, i: RequestInit) => Promise<Response>) {
  const msgs: MensagemDaVoz[] = []
  const w = criarWorkerDaVoz({
    buscar,
    abrirPasta: async () => pasta,
    abrirRuntime: async () => {
      throw new Error('sem runtime no teste')
    },
    temWebGpu: async () => false,
    sha256: hashFalso,
    enviar: (m) => msgs.push(m),
    agora: () => 0,
  })
  return { w, msgs }
}

describe('download da voz no aparelho', () => {
  it('baixa só o que falta, confere e marca; o progresso chega ao total', async () => {
    const pasta = pastaFalsa()
    const s = servidor({ aceitaRange: true })
    const { w, msgs } = montar(pasta, s.buscar)
    await w.receber({ tipo: 'baixar', id: 1, raiz: 'http://localhost:3185/assets/' })
    expect(msgs.at(-1)).toEqual({ tipo: 'ok', id: 1 })
    expect(s.pedidos).toEqual([{ url: 'http://localhost:3185/assets/onnx/tts.json', range: null }])
    expect(pasta.marcas.get(NOME)).toBe(ALVO.sha256)
    const progresso = msgs.filter((m) => m.tipo === 'progresso')
    expect(progresso.at(-1)).toMatchObject({ recebidos: BYTES_DO_SUPERTONIC, total: BYTES_DO_SUPERTONIC })
  })

  it('o parcial retoma por Range (206): só os bytes que faltam', async () => {
    const pasta = pastaFalsa()
    pasta.arquivos.set(NOME, certo().slice(0, 5000))
    const s = servidor({ aceitaRange: true })
    const { w, msgs } = montar(pasta, s.buscar)
    await w.receber({ tipo: 'baixar', id: 2, raiz: 'http://x' })
    expect(msgs.at(-1)).toEqual({ tipo: 'ok', id: 2 })
    expect(s.pedidos[0].range).toBe('bytes=5000-')
    expect(pasta.arquivos.get(NOME)!.length).toBe(ALVO.bytes)
  })

  it('servidor que ignora o Range (200): recomeça do zero, sem duplicar', async () => {
    const pasta = pastaFalsa()
    pasta.arquivos.set(NOME, certo().slice(0, 5000))
    const s = servidor({ aceitaRange: false })
    const { w, msgs } = montar(pasta, s.buscar)
    await w.receber({ tipo: 'baixar', id: 3, raiz: 'http://x' })
    expect(msgs.at(-1)).toEqual({ tipo: 'ok', id: 3 })
    expect(pasta.arquivos.get(NOME)!.length).toBe(ALVO.bytes)
  })

  it('sha256 que não confere: erro, arquivo zerado e nada marcado', async () => {
    const pasta = pastaFalsa()
    const s = servidor({ aceitaRange: true, conteudo: new Uint8Array(ALVO.bytes).fill(9) })
    const { w, msgs } = montar(pasta, s.buscar)
    await w.receber({ tipo: 'baixar', id: 4, raiz: 'http://x' })
    expect(msgs.at(-1)).toMatchObject({ tipo: 'erro', id: 4 })
    expect(pasta.marcas.has(NOME)).toBe(false)
    expect(pasta.arquivos.get(NOME)!.length).toBe(0)
  })

  it('arquivo maior que o esperado é recusado', async () => {
    const pasta = pastaFalsa()
    const s = servidor({ aceitaRange: true, conteudo: new Uint8Array(ALVO.bytes + 10).fill(7) })
    const { w, msgs } = montar(pasta, s.buscar)
    await w.receber({ tipo: 'baixar', id: 5, raiz: 'http://x' })
    expect(msgs.at(-1)).toMatchObject({ tipo: 'erro', id: 5 })
  })

  it('carregar sem o modelo conferido falha com o motivo', async () => {
    const pasta = pastaFalsa()
    const { w, msgs } = montar(pasta, servidor({ aceitaRange: true }).buscar)
    await w.receber({ tipo: 'carregar', id: 6, threads: 1, webgpu: false })
    expect(msgs.at(-1)).toMatchObject({ tipo: 'erro', id: 6 })
    expect((msgs.at(-1) as { mensagem: string }).mensagem).toMatch(/não está no aparelho/)
  })
})
