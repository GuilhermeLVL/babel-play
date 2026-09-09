#!/usr/bin/env node
/**
 * TODA ROTA DO SERVIDOR TEM UM TESTE DE CARACTERIZAÇÃO — ou um motivo escrito para não ter.
 *
 * Lê as rotas registradas (`router.<verbo>('/caminho')` em `server/routes/*.ts` e
 * `server/audio/loopback.ts`, com o prefixo que `server.ts` monta) e as chamadas feitas pelos
 * testes em `tests/caracterizacao/*.test.ts`. Uma rota sem chamada e sem entrada em
 * `SEM_CARACTERIZACAO` faz o script sair com 1 — é o gate da rede de segurança (Fase 1).
 *
 *   node scripts/testes/rotas-sem-caracterizacao.mjs          # lista e falha se sobrar rota
 *   node scripts/testes/rotas-sem-caracterizacao.mjs --tabela # tabela completa rota x teste
 *
 * A comparação é por PADRÃO: `:id` casa com qualquer segmento, e a query string é ignorada.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Rotas deliberadamente fora: cada uma com o motivo. Uma entrada aqui é decisão, não pendência. */
const SEM_CARACTERIZACAO = {
  'POST /api/import/web':
    'busca de página externa (SSRF); coberto por `tests/integration/audit-s13-image-url.test.ts` e `server/import/web.ts` tem teste próprio de redirecionamento',
  'POST /api/import/document':
    'PDF/DOCX exige fixtures binárias; `.txt` está coberto pela importação Anki e o parser tem teste unitário (`f4-04-tipo-por-conteudo`)',
  'POST /api/import/anki/export': 'exportação inversa; coberta por `tests/integration/anki-rotas.test.ts`',
  'GET /api/audio/loopback/stream':
    'dispositivo da máquina (WASAPI); só existe no self-host e o 403 do modo público está em auth-e-conta',
  'POST /api/billing/comprar':
    'Asaas em sandbox é dependência do dono; `tests/integration/billing-webhook.test.ts` cobre o webhook e a idempotência',
  'GET /api/billing/creditos': 'idem',
  'POST /api/billing/gastar': 'idem',
  'POST /api/billing/creditar-passe': 'idem',
  'POST /api/billing/assinar': 'idem',
  'GET /api/billing/status': 'idem',
  'POST /api/billing/cancelar': 'idem',
  'POST /api/billing/webhook/asaas': 'idem (é o próprio webhook)',
  'GET /api/images/search':
    'proxy do Openverse; `tests/integration/audit-s13-image-url.test.ts` e `images` com cache em memória — Fase 5 troca o cache e escreve o teste HTTP',
  'POST /api/erros-do-cliente':
    'coberto por `tests/integration/erros-do-cliente.test.ts` (quota em memória por processo, item da Fase 5)',
  'GET /api/admin/users/:id':
    'RBAC coberto por `rbac-admin-endpoints.test.ts`; o 403 de usuário comum está em auth-e-conta',
  'PATCH /api/admin/users/:id': 'idem',
  'PATCH /api/admin/users/:id/plan': 'idem',
  'POST /api/admin/armazenamento/reconciliar': 'idem',
  'GET /api/admin/erros': 'idem',
  'GET /api/admin/resumo': 'idem',
  'GET /api/admin/billing/pendentes': 'idem',
  'POST /api/admin/billing/reprocessar/:id': 'idem',
  'GET /api/sessions/:id/capa':
    'capa embutida (data: URI); coberto por `f11-03-capa-mime.test.ts` e `capa-teto.test.ts`',
  'POST /api/sessions/:id/audio':
    'upload binário de áudio (120 MB); coberto por `delete-sessao-audio.test.ts` e `cota-armazenamento.test.ts`',
  'GET /api/sessions/:id/audio': 'idem',
  'POST /api/sessions/utterances/relabel': 'reetiquetagem em lote; coberto por `tests/integration/sessions-*`',
  'PATCH /api/sessions/:id/meta': 'coberto por `audit-s13-image-url.test.ts`',
  'POST /api/vocab/relabel': 'reetiquetagem em lote; coberto por `mt1-tenant-vocab.test.ts`',
  'POST /api/vocab/para-jogo':
    'variante POST para filtro acima de 6 KB; mesma função da GET (`filtro-composicao.test.ts`)',
}

const PREFIXOS = {
  'server/routes/ai.ts': '/api/ai',
  'server/routes/sessions.ts': '/api/sessions',
  'server/routes/import.ts': '/api/import',
  'server/routes/vocab.ts': '/api/vocab',
  'server/routes/anki.ts': '/api/anki',
  'server/routes/metrics.ts': '/api/metrics',
  'server/routes/exercises.ts': '/api/exercises',
  'server/routes/settings.ts': '/api/settings',
  'server/routes/images.ts': '/api/images',
  'server/routes/me.ts': '/api/me',
  'server/routes/admin.ts': '/api/admin',
  'server/routes/erros.ts': '/api/erros-do-cliente',
  'server/routes/rank.ts': '/api/rank',
  'server/routes/health.ts': '/api/health',
  'server/audio/loopback.ts': '/api/audio',
}

function rotasDoServidor() {
  const rotas = []
  for (const [arquivo, prefixo] of Object.entries(PREFIXOS)) {
    const fonte = readFileSync(arquivo, 'utf8')
    for (const m of fonte.matchAll(/\b\w+\.(get|post|patch|put|delete)\(\s*['"]([^'"]+)['"]/g)) {
      const caminho = (prefixo + (m[2] === '/' ? '' : m[2])).replace(/\/+$/, '') || prefixo
      rotas.push({ metodo: m[1].toUpperCase(), caminho, arquivo })
    }
  }
  // billing tem dois routers no mesmo arquivo: o de usuário e o webhook (POST '/')
  const billing = readFileSync('server/routes/billing.ts', 'utf8')
  for (const m of billing.matchAll(/\b(\w+)\.(get|post|patch|put|delete)\(\s*['"]([^'"]+)['"]/g)) {
    const webhook = m[1] === 'asaasWebhookRouter' || (m[3] === '/' && m[2] === 'post')
    const prefixo = webhook ? '/api/billing/webhook/asaas' : '/api/billing'
    const caminho = (prefixo + (m[3] === '/' ? '' : m[3])).replace(/\/+$/, '')
    rotas.push({ metodo: m[2].toUpperCase(), caminho, arquivo: 'server/routes/billing.ts' })
  }
  rotas.push({ metodo: 'GET', caminho: '/api/health', arquivo: 'server.ts' })
  const vistos = new Set()
  return rotas.filter((r) => {
    const k = `${r.metodo} ${r.caminho}`
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}

/** Chamadas nos testes: `s.get('/api/x')`, `s.post(`/api/x/${id}`)`, `chamar('DELETE', '/api/x')`. */
function chamadasDosTestes() {
  const dir = 'tests/caracterizacao'
  const chamadas = []
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.test.ts'))) {
    const fonte = readFileSync(join(dir, f), 'utf8')
    for (const m of fonte.matchAll(/\.(get|post|put|patch|del)\(\s*[`'"](\/api\/[^`'"?]*)/g)) {
      chamadas.push({ metodo: m[1] === 'del' ? 'DELETE' : m[1].toUpperCase(), caminho: m[2], teste: f })
    }
    for (const m of fonte.matchAll(/chamar\(\s*['"](GET|POST|PUT|PATCH|DELETE)['"]\s*,\s*[`'"](\/api\/[^`'"?]*)/g)) {
      chamadas.push({ metodo: m[1], caminho: m[2], teste: f })
    }
  }
  return chamadas
}

function casa(padrao, chamada) {
  const a = padrao.split('/').filter(Boolean)
  const b = chamada.split('/').filter(Boolean)
  if (a.length !== b.length) return false
  return a.every((seg, i) => seg.startsWith(':') || seg === b[i] || /^\$\{/.test(b[i]))
}

const rotas = rotasDoServidor()
const chamadas = chamadasDosTestes()
const tabela = rotas.map((r) => {
  const testes = [
    ...new Set(chamadas.filter((c) => c.metodo === r.metodo && casa(r.caminho, c.caminho)).map((c) => c.teste)),
  ]
  const chave = `${r.metodo} ${r.caminho}`
  return { ...r, chave, testes, motivo: SEM_CARACTERIZACAO[chave] }
})

if (process.argv.includes('--tabela')) {
  console.log('| rota | testes de caracterização | motivo para não ter |\n|---|---|---|')
  for (const l of tabela) console.log(`| ${l.chave} | ${l.testes.join(', ') || '—'} | ${l.motivo ?? ''} |`)
}
const sobrando = tabela.filter((l) => l.testes.length === 0 && !l.motivo)
const justificadasComTeste = tabela.filter((l) => l.testes.length > 0 && l.motivo)
console.log(
  `\nrotas: ${rotas.length} · com teste: ${tabela.filter((l) => l.testes.length).length} · justificadas: ${tabela.filter((l) => !l.testes.length && l.motivo).length} · sobrando: ${sobrando.length}`,
)
for (const l of sobrando) console.log(`  SEM TESTE  ${l.chave}  (${l.arquivo})`)
for (const l of justificadasComTeste)
  console.log(`  aviso: ${l.chave} tem teste E justificativa — remova a justificativa`)
process.exit(sobrando.length ? 1 : 0)
