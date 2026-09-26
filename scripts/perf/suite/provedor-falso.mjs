#!/usr/bin/env node
/**
 * PROVEDOR DE IA FALSO — Groq/OpenAI-compatible, LOCAL, para a suíte de carga (Fase 4).
 *
 *   node scripts/perf/suite/provedor-falso.mjs [--porta=3190] [--stt-ms=400] [--mt-ms=700] [--rpm=20]
 *
 * A suíte NUNCA chama a Groq real: o servidor sob carga recebe `GROQ_BASE_URL` apontando para cá.
 *
 *   POST /openai/v1/audio/transcriptions  segura `--stt-ms` e responde `verbose_json` (Whisper)
 *   POST /openai/v1/chat/completions      segura `--mt-ms` e responde uma tradução com `usage`
 *   GET  /estatisticas                    contagem por rota e status, tempos segurados
 *
 * LIMITE DE TAXA como o da conta grátis: mais de `--rpm` pedidos por rota numa janela deslizante de
 * 60 s recebem 429 NA HORA, com `Retry-After` = segundos até o pedido mais antigo sair da janela.
 * É o que exercita o caminho "o provedor limitou" da admissão (`server/ai/admissao.ts`).
 *
 * O TEMPO SEGURADO VAI NO TEXTO (`⟨falso:<ms>⟩`): o servidor devolve o texto ao cliente, e a suíte
 * subtrai esse número da latência que ela mediu — o que sobra é o custo do NOSSO lado (admissão,
 * cota, proxy), que é o que o SLO de IA cobra. Sem isso a conta usaria o valor nominal e o erro do
 * timer do Windows (até ~15 ms) entraria como custo do servidor.
 */
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d

/** Janela deslizante de 60 s por rota. Pura o bastante para o teste. */
export function criarLimitador(rpm, agora = () => Date.now()) {
  const janelas = new Map()
  return (rota) => {
    const t = agora()
    const j = (janelas.get(rota) ?? []).filter((x) => t - x < 60_000)
    janelas.set(rota, j)
    if (rpm > 0 && j.length >= rpm)
      return { ok: false, retryAfterS: Math.max(1, Math.ceil((j[0] + 60_000 - t) / 1000)) }
    j.push(t)
    return { ok: true }
  }
}

/** Sobe o provedor. Devolve `{ porta, fechar, estatisticas }`. */
export function subirProvedorFalso({ porta = 3190, sttMs = 400, mtMs = 700, rpm = 20, host = '127.0.0.1' } = {}) {
  const limitar = criarLimitador(rpm)
  const est = { stt: {}, mt: {}, seguradoMs: { stt: [], mt: [] } }
  const conta = (rota, status) => (est[rota][status] = (est[rota][status] ?? 0) + 1)
  let seq = 0
  const servidor = createServer((req, res) => {
    const pedaços = []
    req.on('data', (c) => pedaços.push(c))
    req.on('end', () => {
      const rota = req.url?.endsWith('/audio/transcriptions')
        ? 'stt'
        : req.url?.endsWith('/chat/completions')
          ? 'mt'
          : null
      if (req.method === 'GET' && req.url === '/estatisticas') {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(est))
        return
      }
      if (req.method !== 'POST' || !rota) {
        res.statusCode = 404
        res.end()
        return
      }
      const l = limitar(rota)
      if (!l.ok) {
        conta(rota, 429)
        res.statusCode = 429
        res.setHeader('retry-after', String(l.retryAfterS))
        res.setHeader('content-type', 'application/json')
        res.end(
          JSON.stringify({
            error: { message: 'Rate limit reached (falso)', type: 'requests', code: 'rate_limit_exceeded' },
          }),
        )
        return
      }
      const t0 = performance.now()
      const n = ++seq
      setTimeout(
        () => {
          const ms = Math.round(performance.now() - t0)
          est.seguradoMs[rota].push(ms)
          conta(rota, 200)
          res.setHeader('content-type', 'application/json')
          if (rota === 'stt') {
            const text = `we can meet tomorrow morning to review the plan number ${n} ⟨falso:${ms}⟩`
            res.end(
              JSON.stringify({
                task: 'transcribe',
                language: 'english',
                duration: 4,
                text,
                segments: [
                  {
                    id: 0,
                    start: 0,
                    end: 4,
                    text,
                    avg_logprob: -0.2,
                    no_speech_prob: 0.01,
                    compression_ratio: 1.2,
                    temperature: 0,
                  },
                ],
              }),
            )
          } else {
            res.end(
              JSON.stringify({
                id: `falso-${n}`,
                object: 'chat.completion',
                choices: [
                  {
                    index: 0,
                    finish_reason: 'stop',
                    message: { role: 'assistant', content: `podemos nos encontrar amanhã cedo ${n} ⟨falso:${ms}⟩` },
                  },
                ],
                usage: { prompt_tokens: 180, completion_tokens: 24, total_tokens: 204 },
              }),
            )
          }
        },
        rota === 'stt' ? sttMs : mtMs,
      )
    })
  })
  servidor.keepAliveTimeout = 65_000
  return new Promise((ok) =>
    servidor.listen(porta, host, () =>
      ok({ porta, estatisticas: () => est, fechar: () => new Promise((f) => servidor.close(() => f())) }),
    ),
  )
}

/** Lê o tempo que o provedor segurou, de dentro do texto devolvido. `null` se não houver. */
export function seguradoPeloProvedor(texto) {
  const m = /⟨falso:(\d+)⟩/.exec(String(texto ?? ''))
  return m ? Number(m[1]) : null
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const p = await subirProvedorFalso({
    porta: Number(arg('porta', 3190)),
    sttMs: Number(arg('stt-ms', 400)),
    mtMs: Number(arg('mt-ms', 700)),
    rpm: Number(arg('rpm', 20)),
  })
  console.log(`provedor falso em http://127.0.0.1:${p.porta}/openai/v1 (PID ${process.pid})`)
}
