#!/usr/bin/env node
/**
 * TODA ROTA DO SERVIDOR TEM QUEM A CHAME — ou um motivo escrito.
 *
 * `tests/contratos/rotas-espelhadas.test.ts` faz a pergunta de um lado: toda rota que o CLIENTE
 * chama existe no modo sem conta? Este script faz a pergunta do outro: toda rota que o SERVIDOR
 * registra tem alguém chamando? As duas juntas fecham o cerco — foi assim que
 * `POST /api/ai/llm/chat/completions` apareceu como órfã na auditoria de 2026-09-07 (achado A52).
 *
 *   node scripts/testes/rotas-sem-consumidor.mjs           # falha se sobrar rota sem chamador
 *   node scripts/testes/rotas-sem-consumidor.mjs --tabela
 *
 * Onde se procura o chamador: `src/**` (o funil `src/data/api.ts`, o gateway, as telas),
 * `scripts/**`, `tests/**` e os workflows. Uma rota chamada só por teste NÃO conta como viva —
 * conta como suspeita, e aparece marcada assim.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

/**
 * Rotas sem chamador em `src/`, cada uma com a razão. Uma entrada aqui é DECISÃO, não pendência —
 * e a distinção que importa: nenhuma delas é código que sobrou, todas são capacidade de servidor
 * pronta e testada cuja tela nunca foi feita (ou foi removida). Apagá-las destruiria trabalho e
 * transformaria uma lacuna de produto em lacuna de servidor; deixá-las mudas repetiria o achado
 * A52 da auditoria de 2026-09-07. Ficam nomeadas, e a próxima rota órfã derruba o CI.
 */
const CHAMADOR_EXTERNO = {
  'DELETE /api/ai/credentials/:id':
    'LACUNA DE PRODUTO: `src/data/api.ts` tem `listCredentials` e `createCredential`, e nenhuma função de apagar — quem cola uma chave de IA não consegue removê-la pela interface. O servidor está pronto e coberto (`tests/caracterizacao/ia.test.ts`: 200 e 404). Falta o botão',
  'GET /api/vocab/distribuicao-dificuldade':
    'LACUNA DE PRODUTO: a distribuição por faixa de dificuldade não tem tela. O dado passou a existir quando `recalcularDificuldade` ganhou gatilho na rodada (change `schema-sem-tabela-orfa`); antes disso `difficulty_score` era NULL em 100% dos cartões e a rota não teria o que mostrar',
  'GET /api/vocab/:id/ocorrencias':
    'LACUNA DE PRODUTO: a linha do tempo de "onde eu vi esta palavra" existe no servidor e no repositório (`vocabRepo.ocorrencias`, coberto por `z4-fio-completo`), e nenhuma tela a abre',
  'GET /api/anki/imports/:id':
    'a importação de hoje é síncrona: o cliente recebe o resumo na resposta do POST e não tem o que acompanhar. O ledger existe para a importação assíncrona que as changes `motor-anki-*` planejam',
  'POST /api/ai/llm/chat/completions':
    'o adapter do navegador (`src/gateway/adapters/openaiCompatible.ts:41`) fala direto com o provedor, montando `baseUrl + /chat/completions` com a URL DELE. Esta rota é o caminho que usa o segredo guardado e cifrado no servidor (`x-credential-id`) — o navegador não tem a chave para fazer o mesmo. Achado A52 da auditoria de 2026-09-07, mantido pela mesma razão que está escrita em `tests/contratos/rotas-espelhadas.test.ts`',
  'GET /api/sessions/:id/capa':
    'a Biblioteca renderiza `rec.imageUrl` direto (`Library.tsx:729`), que é a `data:` URI guardada em `meta`. Esta rota serve a mesma capa como binário, para a lista não carregar megabytes de base64 — a otimização existe e ninguém a chamou ainda',
  'POST /api/billing/webhook/asaas': 'o Asaas chama, não o nosso código (autenticação própria por token)',
  'GET /api/health': 'probe de deploy e o vigia `uptime.yml`',
  'GET /api/ready':
    'probe de PRONTIDAO do deploy: `HEALTHCHECK` do `Dockerfile` e `healthcheck` do `docker-compose.yml` apontam para ela desde a Fase 5. Nenhum dos dois e varrido por este script (ele le `.ts/.tsx/.mjs/.js/.yml/.yaml` em src/scripts/tests/.github, e o compose fica na raiz)',
  'GET /metrics':
    'scrape do Prometheus — quem chama e o coletor, nao o nosso codigo, como no webhook do Asaas. Este script a marca como "viva" por acidente: o padrao `/metrics` casa com as fontes que chamam `/api/metrics`, que e a rota de NEGOCIO e nao tem relacao com esta',
  'GET /api/admin/users': 'console de administração — operação manual por `curl`/navegador com token de admin',
  'GET /api/admin/users/:id': 'idem',
  'PATCH /api/admin/users/:id': 'idem',
  'PATCH /api/admin/users/:id/plan': 'idem',
  'POST /api/admin/armazenamento/reconciliar':
    'cron externo (documentado em `docs/deploy.md`) — a reconciliação oportunista no `/entitlements` cobre o resto',
  'GET /api/admin/erros': 'idem, operação manual',
  'GET /api/admin/resumo': 'idem',
  'GET /api/admin/billing/pendentes': 'idem',
  'POST /api/admin/billing/reprocessar/:id': 'idem',
}

const PREFIXOS = {
  /*
   * `server/http/app.ts` ENTROU NA LISTA na Fase 5, e o motivo e um furo medido.
   *
   * A lista so conhecia `server/routes/*.ts` e `server/audio/loopback.ts`. Rota registrada DIRETO
   * no app — `app.get('/api/health', ...)`, e agora `/api/ready` e `/metrics` — era invisivel ao
   * portao: ele contava 85 rotas e passava, com tres delas fora do censo. `/api/health` so nao
   * sumia porque estava empurrada a mao no fim de `rotasDoServidor()`, o que e a mesma coisa que
   * nao ter portao para ela. O prefixo e vazio porque em `app.ts` o caminho ja e absoluto.
   */
  'server/http/app.ts': '',
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
  const juntar = (prefixo, caminho) => (prefixo + (caminho === '/' ? '' : caminho)).replace(/\/+$/, '') || prefixo
  for (const [arquivo, prefixo] of Object.entries(PREFIXOS)) {
    for (const m of readFileSync(arquivo, 'utf8').matchAll(
      /\b\w+\.(get|post|patch|put|delete)\(\s*['"]([^'"]+)['"]/g,
    )) {
      rotas.push({ metodo: m[1].toUpperCase(), caminho: juntar(prefixo, m[2]), arquivo })
    }
  }
  const billing = readFileSync('server/routes/billing.ts', 'utf8')
  for (const m of billing.matchAll(/\b(\w+)\.(get|post|patch|put|delete)\(\s*['"]([^'"]+)['"]/g)) {
    const webhook = m[1] === 'asaasWebhookRouter' || (m[3] === '/' && m[2] === 'post')
    rotas.push({
      metodo: m[2].toUpperCase(),
      caminho: juntar(webhook ? '/api/billing/webhook/asaas' : '/api/billing', m[3]),
      arquivo: 'server/routes/billing.ts',
    })
  }
  const vistos = new Set()
  return rotas.filter((r) => {
    const k = `${r.metodo} ${r.caminho}`
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}

const EXT = new Set(['.ts', '.tsx', '.mjs', '.js', '.yml', '.yaml'])
function arquivosDe(raiz, fora = []) {
  const saida = []
  const andar = (dir) => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome)
      if (fora.some((f) => p.replace(/\\/g, '/').includes(f))) continue
      const st = statSync(p)
      if (st.isDirectory()) andar(p)
      else if (EXT.has(extname(nome))) saida.push(p)
    }
  }
  andar(raiz)
  return saida
}

/** Onde um caminho `/api/x/:id` pode aparecer: literal, com template, ou montado por concatenação. */
function padraoDaRota(caminho) {
  const partes = caminho
    .split('/')
    .filter(Boolean)
    .map((seg) => (seg.startsWith(':') ? '[^/`\'"\\s]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  return new RegExp('/' + partes.join('/'))
}

const rotas = rotasDoServidor()
const fontes = [
  ...arquivosDe('src'),
  /* `scripts/testes` fica de fora: este arquivo cita todas as rotas na lista de justificativas, e
     lendo a si mesmo ele daria TODA rota como viva — o gate passaria sempre, que é o pior defeito
     possível num gate. */
  ...arquivosDe('scripts', ['scripts/testes']),
  ...arquivosDe('tests', ['tests/caracterizacao']),
  ...arquivosDe('.github'),
].map((f) => [f, readFileSync(f, 'utf8')])

const tabela = rotas.map((r) => {
  const padrao = padraoDaRota(r.caminho)
  const chamadores = fontes.filter(([, s]) => padrao.test(s)).map(([f]) => f.replace(/\\/g, '/'))
  const produto = chamadores.filter((f) => f.startsWith('src/') || f.startsWith('scripts/'))
  const chave = `${r.metodo} ${r.caminho}`
  return {
    ...r,
    chave,
    produto,
    soTeste: produto.length === 0 && chamadores.length > 0,
    motivo: CHAMADOR_EXTERNO[chave],
  }
})

if (process.argv.includes('--tabela')) {
  console.log('| rota | chamadores no produto | estado |\n|---|---|---|')
  for (const l of tabela) {
    const estado = l.produto.length ? 'viva' : l.motivo ? 'chamador externo' : l.soTeste ? 'SÓ TESTE' : 'ÓRFÃ'
    console.log(
      `| ${l.chave} | ${l.produto.slice(0, 3).join(', ') || '—'} | ${estado}${l.motivo ? ` — ${l.motivo}` : ''} |`,
    )
  }
}

const orfas = tabela.filter((l) => !l.produto.length && !l.motivo && !l.soTeste)
const soTeste = tabela.filter((l) => !l.produto.length && !l.motivo && l.soTeste)
console.log(
  `\nrotas: ${rotas.length} · vivas: ${tabela.filter((l) => l.produto.length).length} · chamador externo: ${tabela.filter((l) => !l.produto.length && l.motivo).length} · só teste: ${soTeste.length} · órfãs: ${orfas.length}`,
)
for (const l of soTeste) console.log(`  SÓ TESTE  ${l.chave}  (${l.arquivo})`)
for (const l of orfas) console.log(`  ÓRFÃ      ${l.chave}  (${l.arquivo})`)
process.exit(orfas.length ? 1 : 0)
