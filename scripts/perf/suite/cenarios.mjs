/**
 * OS FLUXOS DA SUÍTE DE CARGA — um usuário virtual (VU) faz o que o cliente faz, no ritmo de uma
 * pessoa, e não uma conexão martelando uma rota.
 *
 * DOIS PERFIS de VU (a hipótese da tabela de capacidade da Fase 2, §3):
 *   estudo   (70%) escolhe um fluxo pela mistura ponderada `MISTURA_DE_ESTUDO`, executa, e PENSA
 *            (exponencial de média `pensarS`, cortada em [2, 40] s);
 *   captura  (30%) a cada 4–8 s manda uma fala ao STT e a tradução ao MT, como a legenda ao vivo; com
 *            5% de chance por ciclo encerra a captura (salva a sessão e sobe o áudio).
 *            Recebendo 429/503 da nuvem, PAUSA a nuvem pelo `Retry-After` — é o que o cliente faz
 *            (`fase2-escala.md` §7, item 4) — e nesse intervalo o motor local trabalha sem servidor.
 *
 * Cada requisição vira uma AMOSTRA `{ fluxo, etapa, classe, ms, status, codigo, sobreProvedorMs,
 * t }`. A CLASSE é a do SLO (`slo.json`): leitura, gravacao, upload, ia.
 */
import { randomBytes } from 'node:crypto'
import http from 'node:http'

import { seguradoPeloProvedor } from './provedor-falso.mjs'

export const MISTURA_DE_ESTUDO = [
  ['navegacao', 40],
  ['revisao', 25],
  ['rodada', 15],
  ['loja', 5],
  ['sessao', 15],
]
export const FRACAO_CAPTURA = 0.3

/** Status que NÃO são erro para cada etapa. 429/503 da nuvem e do semáforo de upload são degradação. */
const ESPERADO = {
  settings: [200],
  sessions: [200],
  vocab: [200, 304],
  profile: [200],
  'para-jogo': [200],
  review: [200],
  rodada: [200],
  gastar: [200],
  'salvar-sessao': [200],
  audio: [200],
  stt: [200],
  mt: [200],
}
const DEGRADACAO = new Set(['nuvem_ocupada', 'upload_ocupado', 'provedor_em_disjuntor'])

/** Classifica uma resposta: 'ok' | 'degradacao' | 'erro'. Pura, para o teste. */
export function classificar(etapa, status, codigo) {
  if (ESPERADO[etapa]?.includes(status)) return 'ok'
  if ((status === 429 || status === 503) && DEGRADACAO.has(codigo)) return 'degradacao'
  return 'erro'
}

/** Escolha ponderada determinística a partir de um número em [0, 1). */
export function escolherPonderado(mistura, u) {
  const total = mistura.reduce((a, [, p]) => a + p, 0)
  let x = u * total
  for (const [nome, p] of mistura) {
    if ((x -= p) < 0) return nome
  }
  return mistura.at(-1)[0]
}

/** Gerador determinístico (mulberry32): cada VU tem a sua sequência, reprodutível. */
export function rng(semente) {
  let s = semente >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** WAV PCM 16 bits mono 16 kHz — o que o cliente manda (`src/gateway/audio/wav.ts`). */
export function wav(segundos = 4, taxa = 16_000) {
  const n = segundos * taxa
  const b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + n * 2, 4)
  b.write('WAVE', 8)
  b.write('fmt ', 12)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(taxa, 24)
  b.writeUInt32LE(taxa * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((i / taxa) * 2 * Math.PI * 220) * 6000), 44 + i * 2)
  return b
}

/** Um "webm" de `bytes`: cabeçalho EBML (os magic bytes que o servidor confere) e o resto aleatório. */
export function webm(bytes = 200 * 1024) {
  const b = randomBytes(bytes)
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(b, 0)
  return b
}

const WAV_4S = wav(4)
const WEBM_200K = webm()

/**
 * Uma requisição HTTP/1.1 com keep-alive, lendo o corpo inteiro. Nunca lança: erro de socket e
 * timeout voltam como `status: 0`, com o `code` do erro.
 *
 * REPETE UMA VEZ, e só num caso: ECONNRESET/EPIPE num socket REAPROVEITADO do keep-alive
 * (`req.reusedSocket`). É a corrida clássica entre o servidor fechar a conexão ociosa (o Node fecha
 * em 5 s) e o cliente reusá-la no mesmo instante; o navegador repete sozinho nesse caso, e a
 * documentação do Node recomenda o mesmo. O tempo medido inclui a tentativa perdida, e o número de
 * repetições vai no resultado (`repetiu`).
 */
export function requisitar(agente, base, opcoes, t0 = performance.now(), jaRepetiu = false) {
  const { method, path, headers = {}, body, timeoutMs = 30_000, lerCorpo = false } = opcoes
  return new Promise((resolve) => {
    const url = new URL(path, base)
    const corpo = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(body)
    const req = http.request(
      {
        agent: agente,
        host: url.hostname,
        port: url.port,
        method,
        path: url.pathname + url.search,
        headers: corpo ? { ...headers, 'content-length': corpo.length } : headers,
      },
      (res) => {
        const pedaços = []
        res.on('data', (c) => lerCorpo && pedaços.push(c))
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            ms: performance.now() - t0,
            corpo: lerCorpo ? Buffer.concat(pedaços).toString('utf8') : null,
          }),
        )
        res.on('error', () => resolve({ status: 0, ms: performance.now() - t0, erro: 'resposta' }))
      },
    )
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')))
    req.on('error', (e) => {
      if (!jaRepetiu && req.reusedSocket && (e.code === 'ECONNRESET' || e.code === 'EPIPE')) {
        requisitar(agente, base, opcoes, t0, true).then((r) => resolve({ ...r, repetiu: true }))
        return
      }
      resolve({ status: 0, ms: performance.now() - t0, erro: e.message === 'timeout' ? 'timeout' : e.code || 'socket' })
    })
    if (corpo) req.write(corpo)
    req.end()
  })
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const codigoDe = (corpo) => {
  try {
    return JSON.parse(corpo)?.code ?? null
  } catch {
    return null
  }
}

/**
 * Um usuário virtual. `ctx`: { base, token, ip, usuario, cartoes, pensarS, amostrar(amostra),
 * ativo() } — `amostrar` recebe cada requisição; `ativo()` diz se ainda é para continuar.
 */
export class UsuarioVirtual {
  constructor(indice, ctx) {
    this.i = indice
    this.ctx = ctx
    this.rnd = rng(0x5eed + indice * 7919)
    this.perfil = this.rnd() < FRACAO_CAPTURA ? 'captura' : 'estudo'
    this.agente = new http.Agent({ keepAlive: true, maxSockets: 2 })
    this.etag = null
    this.pausaAte = { stt: 0, mt: 0 }
    this.seq = 0
  }

  cabecalhos(extra = {}) {
    return {
      authorization: `Bearer ${this.ctx.token}`,
      ...(this.ctx.ip ? { 'x-forwarded-for': this.ctx.ip } : {}),
      ...extra,
    }
  }

  async pedir(fluxo, etapa, classe, opcoes) {
    const r = await requisitar(this.agente, this.ctx.base, {
      ...opcoes,
      headers: this.cabecalhos(opcoes.headers),
      lerCorpo: true,
    })
    const codigo = r.status >= 400 ? codigoDe(r.corpo) : null
    let sobreProvedorMs = null
    if (classe === 'ia') {
      if (r.status === 200) {
        let texto = null
        try {
          texto = JSON.parse(r.corpo)?.text
        } catch {}
        const segurado = seguradoPeloProvedor(texto)
        sobreProvedorMs = segurado === null ? null : Math.max(0, r.ms - segurado)
      } else if (r.status === 429 || r.status === 503) sobreProvedorMs = r.ms
    }
    this.ctx.amostrar({
      fluxo,
      etapa,
      classe,
      ms: r.ms,
      status: r.status,
      codigo,
      erro: r.erro,
      resultado: classificar(etapa, r.status, codigo),
      repetiu: !!r.repetiu,
      sobreProvedorMs,
      t: Date.now(),
    })
    return { ...r, codigo }
  }

  pensar() {
    const media = this.ctx.pensarS * 1000
    return Math.min(40_000, Math.max(2_000, -Math.log(1 - this.rnd()) * media))
  }

  cartao() {
    return `c-${this.ctx.usuario}-${Math.floor(this.rnd() * this.ctx.cartoes)}`
  }

  async correr() {
    // Entrada escalonada: ninguém abre o app no mesmo milissegundo.
    await dormir(this.rnd() * this.ctx.rampaMs)
    while (this.ctx.ativo()) {
      if (this.perfil === 'captura') await this.cicloDeCaptura()
      else {
        await this.fluxoDeEstudo(escolherPonderado(MISTURA_DE_ESTUDO, this.rnd()))
        await dormir(this.pensar())
      }
    }
    this.agente.destroy()
  }

  async fluxoDeEstudo(fluxo) {
    switch (fluxo) {
      case 'navegacao': {
        const tela = this.rnd()
        if (tela < 0.5) {
          await this.pedir(fluxo, 'settings', 'leitura', { method: 'GET', path: '/api/settings' })
          await this.pedir(fluxo, 'profile', 'leitura', { method: 'GET', path: '/api/metrics/profile' })
          await this.lerBaralho(fluxo)
        } else if (tela < 0.75) {
          await this.pedir(fluxo, 'sessions', 'leitura', { method: 'GET', path: '/api/sessions' })
        } else await this.lerBaralho(fluxo)
        return
      }
      case 'revisao':
        await this.pedir(fluxo, 'review', 'gravacao', {
          method: 'POST',
          path: `/api/vocab/${this.cartao()}/review`,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ grade: 1 + Math.floor(this.rnd() * 4) }),
        })
        return
      case 'rodada': {
        const sel = await this.pedir(fluxo, 'para-jogo', 'leitura', {
          method: 'GET',
          path: '/api/vocab/para-jogo?limite=10&estrategia=equilibrado',
        })
        let ids = []
        try {
          const j = JSON.parse(sel.corpo)
          const lista = Array.isArray(j) ? j : (j.itens ?? j.cartoes ?? j.cards ?? [])
          ids = lista.map((x) => x?.id ?? x?.cardId ?? x?.card?.id).filter(Boolean)
        } catch {}
        if (!ids.length) ids = [this.cartao(), this.cartao(), this.cartao()]
        await dormir(5_000 + this.rnd() * 10_000) // jogando
        if (!this.ctx.ativo()) return
        const roundId = `perf-${this.i}-${++this.seq}-${Date.now()}`
        await this.pedir(fluxo, 'rodada', 'gravacao', {
          method: 'POST',
          path: '/api/exercises/rodada',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            roundId,
            exerciseKind: 'memory',
            origem: 'baralho',
            score: 80,
            melhorSequencia: 3,
            itens: ids.slice(0, 10).map((cardId, k) => ({
              cardId,
              itemRef: cardId,
              correct: k % 3 ? 1 : 0,
              attempts: 1,
              ms: 1500,
              kind: 'memory',
            })),
          }),
        })
        return
      }
      case 'loja':
        await this.pedir(fluxo, 'gastar', 'gravacao', {
          method: 'POST',
          path: '/api/metrics/seeds/gastar',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            spendId: `perf-${this.i}-${++this.seq}-${Date.now()}`,
            amount: 40,
            reason: 'pular-rodada',
          }),
        })
        return
      case 'sessao':
        await this.salvarSessao(fluxo, 20)
        return
    }
  }

  async lerBaralho(fluxo) {
    const r = await this.pedir(fluxo, 'vocab', 'leitura', {
      method: 'GET',
      path: '/api/vocab',
      headers: this.etag ? { 'if-none-match': this.etag } : {},
    })
    if (r.status === 200 && r.headers?.etag) this.etag = r.headers.etag
  }

  async salvarSessao(fluxo, falas) {
    const t = Date.now()
    const r = await this.pedir(fluxo, 'salvar-sessao', 'gravacao', {
      method: 'POST',
      path: '/api/sessions',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: `Captura ${this.i}-${this.seq}`,
        kind: 'live',
        sourceLang: 'en',
        targetLang: 'pt',
        status: 'done',
        durationMs: falas * 5000,
        origemLocalId: `perf-${this.i}-${++this.seq}-${t}`,
        utterances: Array.from({ length: falas }, (_, k) => ({
          idx: k,
          source: 'mic',
          sourceLang: 'en',
          sourceText: `we can meet tomorrow morning to review the plan ${k}`,
          targetLang: 'pt',
          translatedText: `podemos nos encontrar amanhã cedo ${k}`,
          engine: 'whisper',
          tStartMs: k * 5000,
          tEndMs: k * 5000 + 4200,
        })),
      }),
    })
    try {
      return r.status === 200 ? JSON.parse(r.corpo).id : null
    } catch {
      return null
    }
  }

  async cicloDeCaptura() {
    const inicio = Date.now()
    /* STT e MT PAUSAM SEPARADOS, como no cliente: com a nuvem de STT ocupada o Whisper local
       transcreve, e a fala transcrita localmente ainda vai ao MT de nuvem. */
    if (Date.now() >= this.pausaAte.stt) {
      const stt = await this.pedir('ia', 'stt', 'ia', {
        method: 'POST',
        path: '/api/ai/stt',
        headers: { 'content-type': 'audio/wav', 'x-language': 'en' },
        body: WAV_4S,
      })
      this.pausarSeRecusou('stt', stt)
    }
    if (Date.now() >= this.pausaAte.mt && this.ctx.ativo()) {
      const mt = await this.pedir('ia', 'mt', 'ia', {
        method: 'POST',
        path: '/api/ai/mt',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: `we can meet tomorrow morning ${this.i} ${++this.seq} ${Date.now()}`,
          src: 'en',
          tgt: 'pt',
          falada: true,
        }),
      })
      this.pausarSeRecusou('mt', mt)
    }
    if (this.rnd() < 0.05 && this.ctx.ativo()) {
      const id = await this.salvarSessao('upload', 30)
      if (id)
        await this.pedir('upload', 'audio', 'upload', {
          method: 'POST',
          path: `/api/sessions/${encodeURIComponent(id)}/audio`,
          headers: { 'content-type': 'audio/webm' },
          body: WEBM_200K,
        })
    }
    const ciclo = 4_000 + this.rnd() * 4_000
    await dormir(Math.max(0, ciclo - (Date.now() - inicio)))
  }

  pausarSeRecusou(servico, r) {
    if (r.status === 429 || r.status === 503 || r.status === 402) {
      const s = Number(r.headers?.['retry-after'])
      this.pausaAte[servico] = Date.now() + (Number.isFinite(s) && s > 0 ? s * 1000 : 60_000)
    }
  }
}
