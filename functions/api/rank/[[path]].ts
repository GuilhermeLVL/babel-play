/**
 * RANKING GLOBAL — Pages Function + D1.
 *
 * Sem conta e sem dado pessoal: uma linha é (jogo, apelido, pontos, combo, quando). As guardas
 * são as de um placar de fliperama, não de um banco: teto de pontos por jogo (mandar 10 milhões
 * não entra), apelido saneado, 1 envio por minuto por IP. Quem quiser trapacear consegue — como
 * em todo placar público sem conta — e o teto garante que a trapaça não quebre a tabela.
 *
 * Setup (uma vez, na promoção para produção):
 *   npx wrangler d1 create babel-rank
 *   npx wrangler d1 execute babel-rank --file=functions/schema-rank.sql --remote
 *   e no painel do Pages: Settings → Functions → D1 bindings → RANK_DB = babel-rank
 */
interface Env { RANK_DB?: D1Database }

type D1Database = {
  prepare(sql: string): {
    bind(...v: unknown[]): {
      all<T = unknown>(): Promise<{ results: T[] }>
      run(): Promise<unknown>
      first<T = unknown>(): Promise<T | null>
    }
  }
}

const JOGOS = new Set(['blitz', 'memory', 'wordsearch', 'termo', 'scramble', 'karaoke', 'escuta', 'ditado', 'conectores'])
/** Teto de pontos plausível por rodada — acima disso é trapaça e não entra. */
const TETO_PONTOS = 5_000
const TETO_COMBO = 200

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

function sanearApelido(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null
  const limpo = bruto.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 20)
  return limpo.length >= 3 ? limpo : null
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const db = env.RANK_DB
  if (!db) return json({ error: 'ranking ainda não configurado neste ambiente', codigo: 'RANK_INDISPONIVEL' }, 503)

  const url = new URL(request.url)
  const jogo = url.pathname.split('/').filter(Boolean).pop() ?? ''
  if (!JOGOS.has(jogo)) return json({ error: 'jogo desconhecido' }, 404)

  if (request.method === 'GET') {
    const limite = Math.min(50, Math.max(1, Number(url.searchParams.get('limite') ?? 20) || 20))
    const { results } = await db
      .prepare('SELECT apelido, pontos, combo, criado_em AS quando FROM rank WHERE jogo = ?1 ORDER BY pontos DESC, criado_em ASC LIMIT ?2')
      .bind(jogo, limite)
      .all()
    return json({ linhas: results })
  }

  if (request.method === 'POST') {
    let corpo: Record<string, unknown> = {}
    try { corpo = (await request.json()) as Record<string, unknown> } catch { return json({ error: 'JSON inválido' }, 400) }
    const apelido = sanearApelido(corpo.apelido)
    const pontos = Math.round(Number(corpo.pontos))
    const combo = Math.round(Number(corpo.combo))
    if (!apelido) return json({ error: 'apelido inválido (3–20 caracteres)' }, 400)
    if (!Number.isFinite(pontos) || pontos <= 0 || pontos > TETO_PONTOS) return json({ error: 'pontuação fora do plausível' }, 400)
    if (!Number.isFinite(combo) || combo < 0 || combo > TETO_COMBO) return json({ error: 'combo fora do plausível' }, 400)

    // 1 envio por minuto por IP: o suficiente contra flood; um placar sem conta não merece mais burocracia.
    const ip = request.headers.get('CF-Connecting-IP') ?? 'desconhecido'
    const agora = Date.now()
    const recente = await db
      .prepare('SELECT criado_em FROM rank WHERE ip = ?1 ORDER BY criado_em DESC LIMIT 1')
      .bind(ip)
      .first<{ criado_em: number }>()
    if (recente && agora - recente.criado_em < 60_000) return json({ error: 'aguarde um minuto entre envios' }, 429)

    // Uma linha por apelido+jogo: só a MELHOR pontuação fica (o placar é de recordes, não de tentativas).
    const atual = await db
      .prepare('SELECT id, pontos FROM rank WHERE jogo = ?1 AND apelido = ?2')
      .bind(jogo, apelido)
      .first<{ id: number; pontos: number }>()
    if (atual && atual.pontos >= pontos) return json({ ok: true, manteve: true })
    if (atual) {
      await db.prepare('UPDATE rank SET pontos = ?1, combo = ?2, criado_em = ?3, ip = ?4 WHERE id = ?5')
        .bind(pontos, combo, agora, ip, atual.id).run()
    } else {
      await db.prepare('INSERT INTO rank (jogo, apelido, pontos, combo, criado_em, ip) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
        .bind(jogo, apelido, pontos, combo, agora, ip).run()
    }
    return json({ ok: true })
  }

  return json({ error: 'método não suportado' }, 405)
}
