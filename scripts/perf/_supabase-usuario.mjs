/**
 * Helpers de usuário de teste no Supabase Auth (admin API), compartilhados por
 * `staging-medicoes.mjs` e `staging-usuarios.mjs`. Nada aqui imprime segredo.
 */

const TEMPO_LIMITE_MS = 10_000

/** Primeiros caracteres de um corpo de erro, sem quebras (nunca o token: só respostas do servidor). */
export const trecho = (t) => String(t).replace(/\s+/g, ' ').slice(0, 160)

export const json = (t) => {
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

/** Uma requisição cronometrada; erro de rede/timeout vira status 0. */
export async function chamar(url, init = {}, limiteMs = TEMPO_LIMITE_MS) {
  const t0 = performance.now()
  try {
    const r = await fetch(url, { ...init, signal: globalThis.AbortSignal.timeout(limiteMs) })
    const corpo = await r.text()
    return { status: r.status, corpo, dt: performance.now() - t0, ray: r.headers.get('cf-ray') }
  } catch (e) {
    return { status: 0, corpo: String(e?.message ?? e), dt: performance.now() - t0, ray: null }
  }
}

export function cabecalhosAdmin(chaveAdmin) {
  return { apikey: chaveAdmin, Authorization: `Bearer ${chaveAdmin}`, 'content-type': 'application/json' }
}

/** Cria o usuário (ou, se já existe, reaproveita e troca a senha). Devolve o id. */
export async function prepararUsuario(supa, chaveAdmin, email, senha) {
  const h = cabecalhosAdmin(chaveAdmin)
  const criar = await chamar(`${supa}/auth/v1/admin/users`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ email, password: senha, email_confirm: true }),
  })
  if (criar.status >= 200 && criar.status < 300) return json(criar.corpo)?.id
  const jaExiste = (criar.status === 422 || criar.status === 400) && /already|registered|exists/i.test(criar.corpo)
  if (!jaExiste) throw new Error(`criar usuário: ${criar.status} ${trecho(criar.corpo)}`)

  const achado = await acharUsuario(supa, chaveAdmin, email)
  if (!achado?.id) throw new Error('usuário de teste já existe mas não apareceu na 1ª página da listagem')
  const troca = await chamar(`${supa}/auth/v1/admin/users/${achado.id}`, {
    method: 'PUT',
    headers: h,
    body: JSON.stringify({ password: senha, email_confirm: true }),
  })
  if (troca.status !== 200) throw new Error(`atualizar senha: ${troca.status} ${trecho(troca.corpo)}`)
  return achado.id
}

/** Procura um usuário pelo e-mail na 1ª página (1000) da listagem admin; `undefined` se não achar. */
export async function acharUsuario(supa, chaveAdmin, email) {
  const lista = await chamar(`${supa}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: cabecalhosAdmin(chaveAdmin),
  })
  if (lista.status !== 200) throw new Error(`listar usuários: ${lista.status} ${trecho(lista.corpo)}`)
  return (json(lista.corpo)?.users ?? []).find((u) => u.email === email)
}

/** Apaga o usuário pelo id; devolve o status HTTP. */
export async function apagarUsuario(supa, chaveAdmin, id) {
  const d = await chamar(`${supa}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: cabecalhosAdmin(chaveAdmin),
  })
  return d.status
}

/** Login por senha; devolve o JWT (`access_token`). */
export async function entrar(supa, chaveAnon, email, senha) {
  const r = await chamar(`${supa}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: chaveAnon, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  })
  const token = json(r.corpo)?.access_token
  if (r.status !== 200 || !token)
    throw new Error(`login: ${r.status} ${r.status === 200 ? 'sem access_token' : trecho(r.corpo)}`)
  return token
}
