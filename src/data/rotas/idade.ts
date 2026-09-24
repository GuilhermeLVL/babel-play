/**
 * IDADE, RESPONSÁVEL E PORTAS DE EMERGÊNCIA — as chamadas (Fases 3 e 4 do lançamento).
 *
 * SÓ EXISTEM COM CONTA: a idade, o vínculo e o consentimento moram no servidor
 * (`server/lib/idade.ts`, `server/routes/responsavel.ts`); sem conta não há o que espelhar, e o
 * perfil sem conta já é o protegido (`lib/protecaoDoMenor.ts`). `tests/contratos/rotas-espelhadas.test.ts`
 * registra o motivo.
 *
 * O erro volta com o `code` do servidor, porque a tela decide o texto por ele (`convite_expirado`,
 * `consentimento_obrigatorio`, `menor_nao_compra`…).
 */
import { definirProtecao, type EstadoDeProtecao, type FaixaEtaria } from '../../lib/protecaoDoMenor'
import { apiFetch, lerErro } from '../funil'

export interface Falha {
  ok: false
  status: number
  error: string
  code?: string
}

/** Guarda de tipo (o projeto não roda em `strict`, então `!r.ok` não estreita a união). */
export function ehFalha(r: { ok: boolean }): r is Falha {
  return r.ok === false
}

async function falha(r: Response): Promise<Falha> {
  const e = await lerErro(r)
  return { ok: false, status: e.status, error: e.error, code: e.code }
}
const semRede = (): Falha => ({ ok: false, status: 0, error: 'não consegui falar com o servidor' })

/** Busca o estado de proteção e o publica para as telas e o funil. `null` = não deu para saber. */
export async function carregarProtecao(): Promise<EstadoDeProtecao | null> {
  try {
    const r = await apiFetch('/api/me/idade')
    if (!r.ok) {
      definirProtecao(null)
      return null
    }
    const e = (await r.json()) as EstadoDeProtecao
    definirProtecao(e)
    return e
  } catch {
    definirProtecao(null)
    return null
  }
}

export async function declararNascimento(nascimento: string): Promise<{ ok: true; estado: EstadoDeProtecao } | Falha> {
  try {
    const r = await apiFetch('/api/me/idade', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nascimento }),
    })
    if (!r.ok) return falha(r)
    const estado = (await r.json()) as EstadoDeProtecao
    definirProtecao(estado)
    return { ok: true, estado }
  } catch {
    return semRede()
  }
}

export interface ConviteEnviado {
  ok: true
  enviado: boolean
  expiraEm: number
  emailMascarado: string
  /** Só em desenvolvimento/testes, enquanto o envio de e-mail não existe. */
  linkDeTeste?: string
}

export async function convidarResponsavel(email: string): Promise<ConviteEnviado | Falha> {
  try {
    const r = await apiFetch('/api/me/responsavel/convite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!r.ok) return falha(r)
    const corpo = (await r.json()) as Omit<ConviteEnviado, 'ok'>
    return { ok: true, ...corpo }
  } catch {
    return semRede()
  }
}

export interface ConviteParaAceitar {
  ok: true
  nomeDoMenor: string | null
  faixa: FaixaEtaria | null
  exigeConsentimentoEspecifico: boolean
  textoDoConsentimento: string
  versao: string
  expiraEm: number
}

export async function verConvite(token: string): Promise<ConviteParaAceitar | Falha> {
  try {
    const r = await apiFetch(`/api/responsavel/convite?token=${encodeURIComponent(token)}`)
    if (!r.ok) return falha(r)
    return { ok: true, ...((await r.json()) as Omit<ConviteParaAceitar, 'ok'>) }
  } catch {
    return semRede()
  }
}

export async function aceitarConvite(dados: {
  token: string
  nomeDoResponsavel: string
  consentimentoEspecifico?: boolean
  versaoDoConsentimento?: string
}): Promise<{ ok: true; nomeDoMenor: string | null; menorId: string } | Falha> {
  try {
    const r = await apiFetch('/api/responsavel/aceitar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...dados, declaroSerResponsavelLegal: true }),
    })
    if (!r.ok) return falha(r)
    return { ok: true, ...((await r.json()) as { nomeDoMenor: string | null; menorId: string }) }
  } catch {
    return semRede()
  }
}

/**
 * As PORTAS DE EMERGÊNCIA (`CHECKOUT_ENABLED`, `SIGNUP_ENABLED`). Pública e lida ANTES de haver
 * sessão (a tela de login), por isso fora do funil — que, sem conta, responderia pelo servidor em
 * memória, e ele não sabe das chaves do servidor de verdade. Falha = abertas (o servidor ainda
 * recusa se estiverem fechadas; a tela só deixaria de avisar antes).
 */
export async function lerAbertura(): Promise<{ cadastro: boolean; checkout: boolean }> {
  try {
    // ast-grep-ignore: fetch-fora-do-funil — rota pública lida antes de existir sessão (ver acima).
    const r = await fetch('/api/abertura', { headers: { accept: 'application/json' } })
    if (!r.ok) return { cadastro: true, checkout: true }
    const c = (await r.json()) as { cadastro?: unknown; checkout?: unknown }
    return { cadastro: c.cadastro !== false, checkout: c.checkout !== false }
  } catch {
    return { cadastro: true, checkout: true }
  }
}
