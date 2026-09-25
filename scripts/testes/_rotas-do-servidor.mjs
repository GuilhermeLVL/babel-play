/**
 * O CENSO DAS ROTAS DO SERVIDOR — extraído de `rotas-sem-consumidor.mjs` (Fase 6 da auditoria de
 * prontidão) para que dois portões contem as MESMAS rotas: o de consumidor (toda rota tem quem a
 * chame) e o de contrato (`contrato-api.mjs`: nenhuma rota some sem depreciação). Uma lista em cada
 * lugar é como um portão passa a ver uma rota que o outro não vê.
 *
 * Lê o código-fonte (não sobe o app): `<router>.get|post|patch|put|delete('<caminho>'` em cada
 * arquivo de `PREFIXOS`, com o prefixo de montagem, mais os dois routers de `billing.ts`.
 * O nome começa com `_` porque é biblioteca, não portão: não roda sozinho.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export const PREFIXOS = {
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

export function rotasDoServidor() {
  const rotas = []
  const juntar = (prefixo, caminho) => (prefixo + (caminho === '/' ? '' : caminho)).replace(/\/+$/, '') || prefixo
  for (const [arquivo, prefixo] of Object.entries(PREFIXOS)) {
    for (const m of readFileSync(path.join(RAIZ, arquivo), 'utf8').matchAll(
      /\b\w+\.(get|post|patch|put|delete)\(\s*['"]([^'"]+)['"]/g,
    )) {
      rotas.push({ metodo: m[1].toUpperCase(), caminho: juntar(prefixo, m[2]), arquivo })
    }
  }
  const billing = readFileSync(path.join(RAIZ, 'server/routes/billing.ts'), 'utf8')
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
