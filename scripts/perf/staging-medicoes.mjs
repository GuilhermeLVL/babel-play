#!/usr/bin/env node
/**
 * MEDIÇÕES DE STAGING (Fase 4): quatro números do plano medidos contra o Worker publicado.
 *   STAGING_URL=... SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/perf/staging-medicoes.mjs
 *
 * Passos (a tabela Markdown sai no stdout; nada de segredo é impresso):
 *   0. usuário de teste no Supabase Auth (admin API) + login por senha → JWT; apagado no `finally`;
 *      declara a data de nascimento (PUT /api/me/idade), sem a qual a nuvem responde `idade_nao_informada`;
 *   1. scrypt frio: 20 × GET /api/me em sequência (1ª, 2ª, mediana, p95, colos distintos pelo `cf-ray`);
 *   2. admissão p95: 50 × POST /api/ai/stt em paralelo com corpo VAZIO (a porta de admissão roda antes do
 *      corpo; depois dela o núcleo recusa 400 "corpo de áudio vazio" antes de qualquer provedor: zero custo);
 *   3. upload de 100 MB em /api/sessions/:id/audio, conferido com `Range: bytes=0-1023` → 206;
 *   4. POST /api/import/web duas vezes seguidas (efeito do cache de DoH por isolate).
 *
 * Sai com 1 se algum passo falhar por erro HTTP/rede inesperado; sai 0 mesmo com critério reprovado
 * (quem lê a tabela decide). Cada requisição tem 10 s, exceto o upload (10 min).
 */
import { randomBytes, randomFillSync } from 'node:crypto'

import { apagarUsuario, chamar, entrar, json, prepararUsuario, trecho } from './_supabase-usuario.mjs'

const EMAIL = 'medicoes-staging@frasy-teste.dev'
const TEMPO_UPLOAD_MS = 10 * 60_000
/* 100 MB decimais: o limite de corpo da zona da Cloudflare (planos Free/Pro) é 100 MB, e o teto do app
   (`LIMITE_DO_AUDIO` em server/routes/sessions.ts) é 120 MiB, então 100_000_000 bytes passa nos dois. */
const BYTES_UPLOAD = Number(process.env.BYTES_UPLOAD || 100_000_000) // menor numa rede lenta (a tabela diz quanto foi)
const PAGINA_WIKI = 'https://pt.wikipedia.org/wiki/L%C3%ADngua_portuguesa'

const env = (nome) => {
  const v = process.env[nome]
  if (!v) throw new Error(`variável de ambiente ausente: ${nome}`)
  return v
}

const ms = (n) => `${Math.round(n)} ms`

function percentil(valores, p) {
  const o = [...valores].sort((a, b) => a - b)
  return o[Math.max(0, Math.ceil(p * o.length) - 1)]
}

const mediana = (valores) => percentil(valores, 0.5)

/* ───────────────────────── Medições ───────────────────────── */

async function medirScrypt(base, auth) {
  const tempos = []
  const colos = new Set()
  for (let i = 0; i < 20; i++) {
    const r = await chamar(`${base}/api/me`, { headers: auth })
    if (r.status !== 200) throw new Error(`GET /api/me #${i + 1}: ${r.status} ${trecho(r.corpo)}`)
    tempos.push(r.dt)
    const colo = r.ray?.split('-')[1]
    if (colo) colos.add(colo)
  }
  return { tempos, colos: colos.size }
}

/* A porta de admissão (`portaDoStt`, server/ai/sttProxy.ts) roda ANTES do `express.raw()` e antes de
   ler o corpo; passando por ela, o núcleo (server/ai/nucleo/transcrever.ts) responde 400 "corpo de áudio
   vazio" sem tocar no provedor. Por isso o corpo é vazio. Se a conta de teste não tiver STT gerenciado, a
   resposta é 402/501/503 (também sem provedor): o p95 então mede a porta, mas a admissão em si só é
   exercitada nos 400 (e nos 429 `nuvem_ocupada`). */
async function medirAdmissao(base, auth) {
  const chamadas = Array.from({ length: 50 }, () =>
    chamar(`${base}/api/ai/stt`, { method: 'POST', headers: { ...auth, 'content-type': 'audio/wav' } }),
  )
  const rs = await Promise.all(chamadas)
  const status = {}
  for (const r of rs) status[r.status] = (status[r.status] ?? 0) + 1
  // 0 = rede/timeout; 401/403 = auth/idade quebrada; 5xx exceto 503 (portão fechado, esperado) = defeito.
  const inesperados = rs.filter(
    (r) => r.status === 0 || r.status === 401 || r.status === 403 || (r.status >= 500 && r.status !== 503),
  )
  return { tempos: rs.map((r) => r.dt), status, inesperados }
}

async function medirUpload(base, auth) {
  const criada = await chamar(`${base}/api/sessions`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'medicao-staging',
      kind: 'medicao',
      sourceLang: 'en',
      targetLang: 'pt',
      status: 'done',
    }),
  })
  const id = json(criada.corpo)?.id
  if (criada.status !== 200 || !id) throw new Error(`POST /api/sessions: ${criada.status} ${trecho(criada.corpo)}`)
  try {
    // Cabeça WAV válida ("RIFF....WAVE"): o servidor decide o tipo pelos magic bytes (F4-04); o resto é aleatório.
    const corpo = Buffer.allocUnsafe(BYTES_UPLOAD)
    randomFillSync(corpo)
    corpo.write('RIFF', 0, 'ascii')
    corpo.writeUInt32LE(BYTES_UPLOAD - 8, 4)
    corpo.write('WAVE', 8, 'ascii')
    const up = await chamar(
      `${base}/api/sessions/${id}/audio`,
      { method: 'POST', headers: { ...auth, 'content-type': 'audio/wav' }, body: corpo },
      TEMPO_UPLOAD_MS,
    )
    const segundos = up.dt / 1000
    const mbs = BYTES_UPLOAD / 1e6 / segundos
    if (up.status !== 200) {
      // 413/507 são respostas de regra (teto/cota): não são erro de infraestrutura, mas o upload não concluiu.
      const regra = up.status === 413 || up.status === 507
      return { ok: false, regra, detalhe: `${up.status} ${trecho(up.corpo)}`, segundos, mbs }
    }
    const faixa = await chamar(`${base}/api/sessions/${id}/audio`, { headers: { ...auth, Range: 'bytes=0-1023' } })
    return { ok: true, segundos, mbs, range: faixa.status }
  } finally {
    const d = await chamar(`${base}/api/sessions/${id}`, { method: 'DELETE', headers: auth })
    if (d.status !== 200) console.error(`aviso: DELETE da sessão ${id} devolveu ${d.status}`)
  }
}

async function medirImportacao(base, auth) {
  const r = []
  for (let i = 0; i < 2; i++) {
    r.push(
      await chamar(
        `${base}/api/import/web`,
        {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({ url: PAGINA_WIKI }),
        },
        30_000,
      ),
    )
  }
  return r
}

/* ───────────────────────── Principal ───────────────────────── */

async function principal() {
  const base = env('STAGING_URL').replace(/\/+$/, '')
  const supa = env('SUPABASE_URL').replace(/\/+$/, '')
  const anon = env('SUPABASE_ANON_KEY')
  const admin = env('SUPABASE_SERVICE_ROLE_KEY')

  const senha = randomBytes(24).toString('base64url')
  const linhas = []
  const falhas = []
  let userId = null

  try {
    userId = await prepararUsuario(supa, admin, EMAIL, senha)
    if (!userId) throw new Error('Supabase não devolveu o id do usuário de teste')
    const token = await entrar(supa, anon, EMAIL, senha)
    const auth = { Authorization: `Bearer ${token}` }

    // Maioridade: PUT /api/me/idade { nascimento: 'AAAA-MM-DD' } (server/routes/me.ts); repetir a mesma data é aceito.
    const idade = await chamar(`${base}/api/me/idade`, {
      method: 'PUT',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ nascimento: '1990-01-01' }),
    })
    if (idade.status !== 200) throw new Error(`PUT /api/me/idade: ${idade.status} ${trecho(idade.corpo)}`)

    // 1. scrypt frio. A 1ª inclui o boot do isolate (scrypt da SECRET_KEY); o CPU real só aparece no painel do Worker.
    try {
      const s = await medirScrypt(base, auth)
      const [t1, t2] = s.tempos
      linhas.push([
        'scrypt frio (GET /api/me, 20 em sequência)',
        `1ª ${ms(t1)}; 2ª ${ms(t2)}; mediana ${ms(mediana(s.tempos))}; p95 ${ms(percentil(s.tempos, 0.95))}; ${s.colos} colo(s)`,
        `1ª < 250 ms: ${t1 < 250 ? 'ok' : 'REPROVADO'}`,
      ])
    } catch (e) {
      falhas.push(e.message)
      linhas.push(['scrypt frio', `erro: ${e.message}`, '1ª < 250 ms'])
    }

    // 2. admissão p95.
    try {
      const a = await medirAdmissao(base, auth)
      const p95 = percentil(a.tempos, 0.95)
      const st = Object.entries(a.status)
        .map(([k, v]) => `${k}×${v}`)
        .join(' ')
      linhas.push([
        'admissão STT (50 paralelas, corpo vazio)',
        `p50 ${ms(percentil(a.tempos, 0.5))}; p95 ${ms(p95)}; status ${st}`,
        `p95 < 250 ms: ${p95 < 250 ? 'ok' : 'REPROVADO'}`,
      ])
      if (a.inesperados.length)
        falhas.push(
          `admissão: ${a.inesperados.length} respostas inesperadas (${[...new Set(a.inesperados.map((r) => r.status))].join(', ')})`,
        )
    } catch (e) {
      falhas.push(e.message)
      linhas.push(['admissão STT', `erro: ${e.message}`, 'p95 < 250 ms'])
    }

    // 3. upload.
    try {
      const u = await medirUpload(base, auth)
      if (u.ok) {
        linhas.push([
          `upload de ${BYTES_UPLOAD / 1e6} MB`,
          `concluído em ${u.segundos.toFixed(1)} s (${u.mbs.toFixed(1)} MB/s); Range 0-1023 → ${u.range}`,
          `upload concluído e Range 206: ${u.range === 206 ? 'ok' : 'REPROVADO'}`,
        ])
        if (u.range !== 206) falhas.push(`GET Range devolveu ${u.range}, esperado 206`)
      } else {
        linhas.push([`upload de ${BYTES_UPLOAD / 1e6} MB`, `não concluiu: ${u.detalhe}`, 'upload concluído: REPROVADO'])
        if (!u.regra) falhas.push(`upload: ${u.detalhe}`)
      }
    } catch (e) {
      falhas.push(e.message)
      linhas.push(['upload', `erro: ${e.message}`, 'upload concluído'])
    }

    // 4. importação web: a 2ª deve aproveitar o cache de DoH (60 s) se cair no MESMO isolate; isolates diferentes anulam o ganho.
    try {
      const [a, b] = await medirImportacao(base, auth)
      const bom = (r) => r.status === 200
      if (!bom(a) || !bom(b)) {
        falhas.push(`import/web: ${a.status} e ${b.status} (${trecho(a.status === 200 ? b.corpo : a.corpo)})`)
        linhas.push(['importação web ×2', `status ${a.status} e ${b.status}`, 'ganho de DoH em ms'])
      } else {
        const ganho = a.dt - b.dt
        linhas.push([
          'importação web ×2 (cache de DoH)',
          `1ª ${ms(a.dt)}; 2ª ${ms(b.dt)}; ganho ${ms(ganho)} (isolates diferentes anulam o ganho)`,
          'ganho de DoH em ms (informativo)',
        ])
      }
    } catch (e) {
      falhas.push(e.message)
      linhas.push(['importação web', `erro: ${e.message}`, 'ganho de DoH em ms'])
    }
  } catch (e) {
    falhas.push(e.message)
  } finally {
    if (userId) {
      const st = await apagarUsuario(supa, admin, userId)
      if (st < 200 || st >= 300) console.error(`aviso: não consegui apagar o usuário de teste (${st})`)
    }
  }

  console.log('| Medição | Resultado | Critério |')
  console.log('| --- | --- | --- |')
  for (const l of linhas) console.log(`| ${l.map((c) => String(c).replace(/\|/g, '/')).join(' | ')} |`)
  if (falhas.length) {
    console.error(`\nFALHAS (${falhas.length}):`)
    for (const f of falhas) console.error(`- ${f}`)
    process.exit(1)
  }
}

principal().catch((e) => {
  console.error(`erro: ${e?.message ?? e}`)
  process.exit(1)
})
