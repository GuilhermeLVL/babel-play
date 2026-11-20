/**
 * O TESTE DE 3 DIAS DO PREMIUM, SEM CARTÃO (C6 da change `planos-v2`; padrão do dono: começa com UM
 * toque, nunca cobra sozinho).
 *
 * O QUE ELE É: 3 dias com os entitlements do Premium (`resolverPlano`, em `entitlements.ts`), sem
 * cartão, sem Asaas, sem renovação. No fim a conta volta ao Grátis sozinha — não há o que cancelar.
 * Na admissão da nuvem o teste é GRÁTIS (`planoDeAdmissao(..., teste = true)`): a capacidade de quem
 * paga não encolhe por causa de quem está testando.
 *
 * UM POR PESSOA, E NÃO POR CONTA. A conta tem a linha dela (`testes_premium`), que sai com a exclusão;
 * a PESSOA tem a marca (`marcas_de_teste`): o HMAC do e-mail normalizado com a chave de hash do
 * servidor. A marca não tem `user_id` e sobrevive à exclusão — apagar a conta e criar outra com o
 * mesmo e-mail não renova o teste. O e-mail em si nunca é guardado nem logado: vira HMAC na hora.
 *
 * O MENOR (perfil protegido) não inicia sozinho: o RESPONSÁVEL vinculado ativa pela conta dele, com o
 * mesmo `paraUsuario` do checkout. A marca, então, é a do e-mail do responsável — noutro espaço
 * (`responsavel`), para não gastar o teste da própria conta dele: um teste por responsável para as
 * contas vinculadas a ele (o e-mail do menor não chega ao servidor nesse pedido).
 *
 * RETENÇÃO DA MARCA: 730 dias, com poda diária (job `podaDasMarcasDeTeste`). Depois disso a mesma
 * pessoa pode testar de novo — dois anos cobrem o abuso que a marca existe para impedir, e guardar
 * mais seria guardar sem finalidade (LGPD art. 15). Documentado em `docs/lgpd/ropa.csv` (T12).
 *
 * Trocar a `SECRET_KEY` do servidor troca a chave do HMAC: as marcas antigas deixam de casar e o
 * teste fica disponível de novo para todo mundo. É o preço aceito de não guardar o e-mail.
 *
 * O FREIO CONTRA A FÁBRICA DE CONTAS (change `teste-de-3-dias`). Sem cartão, o abuso é criar e-mails, não
 * cartões. Além da marca, o início do teste exige: (1) o e-mail CONFIRMADO no Supabase (`emailConfirmado`,
 * Admin API — não basta o painel ter o "Confirm email" ligado: o servidor confere); (2) um e-mail que não seja
 * de caixa descartável (`dominiosDescartaveis.ts`); (3) no máximo `TESTES_PREMIUM_POR_IP_DIA` testes
 * começados pelo mesmo IP pseudonimizado no dia (`reservarTesteDoIp`, reserva atômica).
 */
import { createHmac } from 'node:crypto'

import type { Request } from 'express'
import { ipKeyGenerator } from 'express-rate-limit'

import {
  DIAS_DO_TESTE_PREMIUM,
  ehPlanoPago,
  normalizarPlano,
  PLANO_DO_TESTE,
  type PlanoPago,
} from '../../src/core/planos'
import { type TestePremium, testesPremiumRepo } from '../db/repositories/testesPremium'
import { usageCountersRepo } from '../db/repositories/usageCounters'
import { asUserId, type UserId } from './authContext'
import { adminDoSupabase, testesPremiumPorIpNoDia } from './config'
import { memoDoRequest } from './contextoDeConvidado'
import { emailDescartavel } from './dominiosDescartaveis'
import { log } from './logger'

const DIA_MS = 86_400_000

/** Quanto tempo a marca do e-mail fica guardada depois do início do teste. */
export const DIAS_DE_RETENCAO_DA_MARCA = 730

export const DURACAO_DO_TESTE_MS = DIAS_DO_TESTE_PREMIUM * DIA_MS

/** De onde vem o e-mail da marca: a própria conta, ou o responsável que ativou para o menor. */
export type OrigemDaMarca = 'conta' | 'responsavel'

const DOMINIOS_DO_GMAIL = new Set(['gmail.com', 'googlemail.com'])

/**
 * O E-MAIL COMO UMA PESSOA SÓ. Sem isto, `Fulano@Gmail.com`, `fulano+teste@gmail.com` e
 * `fu.la.no@googlemail.com` — a MESMA caixa de entrada — seriam três testes. Caixa baixa e espaços
 * fora sempre; a etiqueta `+…` sai em qualquer domínio (é o jeito mais comum de "criar outro e-mail"
 * sem criar); os pontos só saem no Gmail, onde o provedor os ignora — noutros domínios o ponto pode
 * ser outra pessoa. `null` = não parece e-mail.
 */
export function normalizarEmailDaMarca(email: string): string | null {
  const e = email.trim().toLowerCase()
  const arroba = e.lastIndexOf('@')
  if (arroba <= 0 || arroba === e.length - 1) return null
  let local = e.slice(0, arroba)
  let dominio = e.slice(arroba + 1)
  const mais = local.indexOf('+')
  if (mais > 0) local = local.slice(0, mais)
  if (DOMINIOS_DO_GMAIL.has(dominio)) {
    local = local.replaceAll('.', '')
    dominio = 'gmail.com'
  }
  return local ? `${local}@${dominio}` : null
}

let chaveDeHash: string | null = null
async function chave(): Promise<string> {
  // Import tardio, como em `convidado.ts`: carregar este módulo não decide quando a chave é lida.
  chaveDeHash ??= (await import('../crypto')).obterChaveDeHash()
  return chaveDeHash
}

/** A marca do teste: HMAC-SHA256 (hex) do e-mail normalizado, com versão e origem no texto. */
export async function marcaDoTeste(email: string, origem: OrigemDaMarca): Promise<string | null> {
  const normal = normalizarEmailDaMarca(email)
  if (!normal) return null
  return createHmac('sha256', await chave())
    .update(`babel-play:teste-premium:v1:${origem}:${normal}`)
    .digest('hex')
}

/**
 * O PLANO QUE ESTE TESTE DÁ (planos v4): o gravado no início (`planoDoTeste(flag)` avaliado em
 * `POST /api/billing/teste`). Quem começou no Premium segue no Premium até o fim, mesmo com a v4 ligada
 * depois. O teste de antes da migração 0008 (`plano` nulo), ou com um valor fora da matriz, é o Premium.
 */
export function planoDoTesteGravado(t: Pick<TestePremium, 'plano'>): PlanoPago {
  const plano = normalizarPlano(t.plano)
  return ehPlanoPago(plano) ? plano : PLANO_DO_TESTE
}

/** O teste vale AGORA? (Começou e ainda não terminou.) */
export function testeAtivo(t: TestePremium | null, agora = Date.now()): t is TestePremium {
  return !!t && t.iniciadoEm <= agora && agora < t.terminaEm
}

/**
 * A linha do teste da conta, lida UMA vez por requisição (`memoDoRequest`; auditoria de desempenho
 * do servidor de 10/10/2026, A11b): em `GET /api/billing/status` o plano e a situação do teste
 * perguntavam a mesma linha, cada um por conta própria. Só LEITURA de exibição e de plano: quem
 * COMEÇA o teste (`POST /api/billing/teste`) lê do repositório, antes e depois de gravar.
 */
function testeDaConta(userId: UserId): Promise<TestePremium | null> {
  return memoDoRequest(userId, 'teste_da_conta', () => testesPremiumRepo.doUsuario(userId))
}

/** O teste ATIVO da conta, ou `null` (nunca testou, ou já venceu). */
export async function testeAtivoDe(userId: UserId, agora = Date.now()): Promise<TestePremium | null> {
  const t = await testeDaConta(userId)
  return testeAtivo(t, agora) ? t : null
}

/** Por que a conta não pode começar o teste agora. */
export type MotivoSemTeste =
  | 'selfhost'
  | 'convidado'
  | 'idade_nao_informada'
  | 'perfil_protegido'
  | 'ja_assinante'
  | 'sem_email'
  | 'email_descartavel'
  | 'marca_usada'

/**
 * O que a tela de Planos (C7) precisa saber do teste desta conta. `plano` (planos v4): o plano do teste —
 * o GRAVADO, em `ativo`/`usado`; o que ele daria se começasse agora, em `disponivel`/`indisponivel`.
 */
export type SituacaoDoTeste =
  | { estado: 'disponivel'; dias: number; plano: PlanoPago }
  | { estado: 'ativo' | 'usado'; dias: number; plano: PlanoPago; iniciadoEm: number; terminaEm: number }
  | { estado: 'indisponivel'; dias: number; plano: PlanoPago; motivo: MotivoSemTeste }

/**
 * A SITUAÇÃO DO TESTE para a própria conta — a mesma régua que `POST /api/billing/teste` aplica, na
 * mesma ordem, para a tela não oferecer o que o servidor recusaria. `jaAssinou`: a conta tem (ou teve)
 * o Premium pago; `idade`: o que `ehAdultoDeclarado` respondeu; `planoAgora`: `planoDoTeste(flag)` deste pedido.
 */
export async function situacaoDoTeste(
  userId: UserId,
  ctx: {
    email: string | null
    jaAssinou: boolean
    idade: { adulto: boolean; informado: boolean }
    planoAgora: PlanoPago
  },
  agora = Date.now(),
): Promise<SituacaoDoTeste> {
  const dias = DIAS_DO_TESTE_PREMIUM
  const t = await testeDaConta(userId)
  if (t)
    return {
      estado: testeAtivo(t, agora) ? 'ativo' : 'usado',
      dias,
      plano: planoDoTesteGravado(t),
      iniciadoEm: t.iniciadoEm,
      terminaEm: t.terminaEm,
    }
  const plano = ctx.planoAgora
  const semTeste = (motivo: MotivoSemTeste): SituacaoDoTeste => ({ estado: 'indisponivel', dias, plano, motivo })
  if (ctx.jaAssinou) return semTeste('ja_assinante')
  if (!ctx.idade.informado) return semTeste('idade_nao_informada')
  if (!ctx.idade.adulto) return semTeste('perfil_protegido')
  const marca = ctx.email ? await marcaDoTeste(ctx.email, 'conta') : null
  if (!marca) return semTeste('sem_email')
  if (ctx.email && emailDescartavel(ctx.email)) return semTeste('email_descartavel')
  if (await testesPremiumRepo.marcaExiste(marca)) return semTeste('marca_usada')
  return { estado: 'disponivel', dias, plano }
}

/** A retenção: apaga as marcas com mais de `DIAS_DE_RETENCAO_DA_MARCA` dias. Devolve quantas saíram. */
export async function podarMarcasDeTeste(agora = Date.now()): Promise<number> {
  return testesPremiumRepo.podarMarcas(agora - DIAS_DE_RETENCAO_DA_MARCA * DIA_MS)
}

/* ───────────────────────── o freio contra a fábrica de contas (change `teste-de-3-dias`) ───────────────────────── */

/** "O e-mail desta conta está confirmado?" — injetável para o teste. `'desconhecido'` = sem Admin API configurada. */
type ConsultaDeEmailConfirmado = (userId: UserId) => Promise<boolean | 'desconhecido'>

/**
 * Pergunta à Admin API do Supabase (`GET /auth/v1/admin/users/:id`, campo `email_confirmed_at`) — a mesma consulta
 * de `aal.ts`. Só no INÍCIO do teste, que é raro: não entra no `/status`, que o checkout sonda a cada 5 s. O JWT não
 * serve de prova: o `email_verified` dele mora no `user_metadata`, que a própria pessoa pode editar. Lança quando a
 * API responde erro (quem chama falha FECHADO: sem confirmação, sem teste).
 */
const consultarEmailConfirmadoNoSupabase: ConsultaDeEmailConfirmado = async (userId) => {
  const admin = adminDoSupabase()
  if (!admin) return 'desconhecido'
  const r = await fetch(`${admin.base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: { apikey: admin.chave, authorization: `Bearer ${admin.chave}` },
    signal: AbortSignal.timeout(5_000),
  })
  if (!r.ok) throw new Error(`admin users ${r.status}`)
  const corpo = (await r.json()) as { email_confirmed_at?: string | null }
  return typeof corpo.email_confirmed_at === 'string' && corpo.email_confirmed_at.length > 0
}

let consultaDeEmail: ConsultaDeEmailConfirmado = consultarEmailConfirmadoNoSupabase
/** Para os testes: troca a consulta (`null` volta à real). */
export function _definirConsultaDeEmailConfirmado(fn: ConsultaDeEmailConfirmado | null): void {
  consultaDeEmail = fn ?? consultarEmailConfirmadoNoSupabase
}

let avisouSemAdmin = false
/**
 * O e-mail da conta está confirmado? Sem Admin API (self-host, dev) a resposta é `true` com um aviso no log: aí o
 * freio é o "Confirm email" do painel do Supabase, e o inventário de configuração já acusa a chave ausente.
 */
export async function emailConfirmado(userId: UserId): Promise<boolean> {
  const r = await consultaDeEmail(userId)
  if (r !== 'desconhecido') return r
  if (!avisouSemAdmin) {
    avisouSemAdmin = true
    log('warn', {
      event: 'teste_sem_admin_do_supabase',
      error: 'SUPABASE_SERVICE_ROLE_KEY ausente: o servidor não confere se o e-mail do teste está confirmado',
    })
  }
  return true
}

/** O balde dos testes começados por IP, em `usage_counters` (a janela é o dia UTC, `AAAA-MM-DD`). */
export const METRIC_TESTES_POR_IP = 'teste_premium:ip'

const diaUtc = (agora: number): string => new Date(agora).toISOString().slice(0, 10)

/**
 * A chave do IP, PSEUDONIMIZADA como a do convidado (`ipPseudonimo`, em `convidado.ts`): HMAC com a chave do servidor
 * e o dia, IPv6 agrupado por prefixo (`ipKeyGenerator`). Não volta ao IP e muda todo dia.
 */
async function chaveDoIp(req: Pick<Request, 'ip'>, agora: number): Promise<UserId> {
  const ip = ipKeyGenerator(req.ip ?? '')
  const h = createHmac('sha256', await chave())
    .update(`babel-play:teste-premium-ip:v1:${diaUtc(agora)}:${ip}`)
    .digest('hex')
    .slice(0, 32)
  return asUserId(`ip:${h}`)
}

/** A vaga reservada de um teste por IP: `liberar` devolve a vaga quando o teste acaba não começando. */
export interface VagaDeTesteDoIp {
  liberar: () => Promise<void>
}

/**
 * RESERVA, numa instrução só, a vaga deste IP no dia (`usageCountersRepo.reserve`: soma só se ainda cabe no teto, o
 * mesmo padrão das cotas). Ler e depois contar deixava uma rajada simultânea do mesmo IP passar do teto (TOCTOU,
 * revisão de segurança do PR #130). `null` = o IP já está no teto. Com o teto em 0 (desligado), a vaga é de graça e
 * não conta. Quem reserva e não chega a COMEÇAR o teste (marca na corrida, `ja_existia`, erro) chama `liberar`.
 */
export async function reservarTesteDoIp(req: Pick<Request, 'ip'>, agora = Date.now()): Promise<VagaDeTesteDoIp | null> {
  const teto = testesPremiumPorIpNoDia()
  if (teto <= 0) return { liberar: async () => {} }
  const dia = diaUtc(agora)
  const chaveIp = await chaveDoIp(req, agora)
  if (!(await usageCountersRepo.reserve(chaveIp, METRIC_TESTES_POR_IP, dia, teto))) return null
  /* Poda dos dias passados: best-effort, fora do caminho da resposta. */
  await usageCountersRepo.prune(METRIC_TESTES_POR_IP, dia).catch(() => {})
  let liberada = false
  return {
    liberar: async () => {
      if (liberada) return
      liberada = true
      await usageCountersRepo.refund(chaveIp, METRIC_TESTES_POR_IP, dia)
    },
  }
}
