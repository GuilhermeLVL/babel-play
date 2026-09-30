/** Rota do usuário atual (montada em `/api/me`, atrás do authMiddleware). */
import { Router } from 'express'
import { z } from 'zod'

import { diaNoFuso } from '../../src/core/learning/economia'
import { contaRepo } from '../db/repositories/conta'
import { idadesRepo } from '../db/repositories/idades'
import { perfilRepo } from '../db/repositories/perfil'
import { subscriptionsRepo } from '../db/repositories/subscriptions'
import { usageCountersRepo } from '../db/repositories/usageCounters'
import { usersRepo } from '../db/repositories/users'
import { vinculosRepo } from '../db/repositories/vinculos'
import { asaasConfigurado } from '../lib/asaas'
import { authRequired } from '../lib/auth'
import { adminDoSupabase } from '../lib/config'
import {
  enviadorAtual,
  ErroDeEnvioDoConvite,
  LIMITE_DE_CONVITES_POR_DIA,
  linkDoConvite,
  mostrarLinkNaTela,
  type ResultadoDoEnvio,
} from '../lib/conviteDoResponsavel'
import { encerrarAssinatura } from '../lib/encerramentoDeAssinatura'
import { getEntitlementsForUser, getPlanForUser } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { estadoDeProtecao, mascararEmail, validarNascimento } from '../lib/idade'
import { log } from '../lib/logger'
import { resumoDoAlivio } from '../lib/nuvemDeAlivio'
import { portaoDaNuvem } from '../lib/orcamentoDeIa'
import { responderErro } from '../lib/respostaDeErro'
import { capDeArmazenamento, reconciliarSeVencido, usoDeArmazenamento } from '../lib/storageQuota'
import {
  capForPlan,
  capSegundosDoDia,
  capSegundosParaPlano,
  capTokensDoDia,
  capTokensParaPlano,
  fusoDaCota,
  METRIC_LLM_TOKENS,
  METRIC_LLM_TOKENS_DIA,
  METRIC_MANAGED,
  METRIC_STT_SEGUNDOS,
  METRIC_STT_SEGUNDOS_DIA,
} from '../lib/usageQuota'
import { excluirContaSchema, parseOr400, perfilPatchSchema } from '../validation'
// O store de mídia é um só; importar daqui evita uma segunda resolução de `AUDIO_DIR` que
// poderia divergir da que grava e serve os arquivos.
import { armazenamentoDeMidia } from './sessions'

export const meRouter = Router()

/**
 * QUEM É O USUÁRIO — o dado que a aplicação inteira não tinha.
 *
 * Até aqui, `session.user` do Supabase era tipado como `unknown` no `App.tsx` e nunca saía de lá:
 * nenhuma tela sabia o nome nem o e-mail de quem estava logado, e não havia perfil nenhum. Esta
 * rota é a fonte disso.
 *
 * O E-MAIL VEM DO CLIENTE, não daqui. O middleware de auth retém só o `sub` do JWT e descarta o
 * resto (`server/lib/auth.ts`); fazer o servidor guardar o e-mail exigiria mexer no caminho de
 * autenticação por um dado cosmético. O cliente já tem `session.user.email` em mãos. Por isso
 * `users.email` fica NULL na maioria das contas — está registrado como achado D8 na auditoria.
 */
meRouter.get('/', async (req, res) => {
  try {
    res.json(await perfilRepo.ler(req.userId))
  } catch (err) {
    res.status(500).json({ error: erroDeRota(err, { status: 500, event: 'me_perfil_get_error' }) })
  }
})

/**
 * Grava o perfil. Aceita apenas os campos do próprio usuário.
 *
 * `perfilPatchSchema` é `.strip()`: `role` e `status` são REMOVIDOS do corpo antes de chegar ao
 * repositório. Sem isso, `{"role":"admin"}` num PATCH de perfil seria escalada de privilégio.
 */
meRouter.patch('/', async (req, res) => {
  try {
    const patch = parseOr400(perfilPatchSchema, req.body, res)
    if (!patch) return
    res.json(await perfilRepo.atualizar(req.userId, patch))
  } catch (err) {
    res.status(500).json({ error: erroDeRota(err, { status: 500, event: 'me_perfil_patch_error' }) })
  }
})

/**
 * IDADE E PERFIL PROTEGIDO (Fase 4 — ECA Digital e LGPD art. 14). O cliente pergunta a data de
 * nascimento no primeiro acesso com conta (e na próxima entrada das contas antigas) e lê daqui a
 * faixa, se a conta está protegida e se ela precisa do responsável. A régua é `server/lib/idade.ts`.
 */
meRouter.get('/idade', async (req, res) => {
  try {
    res.json(await estadoDeProtecao(req.userId))
  } catch (err) {
    res.status(500).json({ error: erroDeRota(err, { status: 500, event: 'me_idade_error', requestId: req.requestId }) })
  }
})

/** Declara a data UMA vez. Trocar depois é recusado (409): corrigir é pelo suporte. */
meRouter.put('/idade', async (req, res) => {
  const nascimento = validarNascimento((req.body as { nascimento?: unknown } | undefined)?.nascimento)
  if (!nascimento) {
    responderErro(res, 400, 'data de nascimento inválida (AAAA-MM-DD, no passado)', 'nascimento_invalido')
    return
  }
  try {
    const r = await idadesRepo.declarar(req.userId, nascimento)
    if (r === 'divergente') {
      responderErro(
        res,
        409,
        'a data de nascimento já foi informada; para corrigir, fale com o suporte',
        'nascimento_ja_informado',
      )
      return
    }
    res.json(await estadoDeProtecao(req.userId))
  } catch (err) {
    res.status(500).json({ error: erroDeRota(err, { status: 500, event: 'me_idade_error', requestId: req.requestId }) })
  }
})

/**
 * O MENOR CONVIDA O RESPONSÁVEL (ECA Digital art. 24). Só quem precisa de vínculo (menor de 16)
 * convida. O token vai no link, por e-mail (Resend) quando o servidor tem envio configurado; sem
 * ele, o convite só é registrado e, em desenvolvimento, o link volta na resposta (ver
 * `server/lib/conviteDoResponsavel.ts`).
 *
 * Teto de `LIMITE_DE_CONVITES_POR_DIA` por conta em 24 h (429): o endereço é digitado pelo menor e
 * o remetente é o domínio do app — sem teto, isto seria um canal de spam. Convite cujo e-mail
 * falhou é descartado e não conta.
 */
meRouter.post('/responsavel/convite', async (req, res) => {
  const email = z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(200)
    .safeParse((req.body as { email?: unknown } | undefined)?.email)
  if (!email.success) {
    responderErro(res, 400, 'e-mail do responsável inválido', 'email_invalido')
    return
  }
  try {
    const estado = await estadoDeProtecao(req.userId)
    if (!estado.exigeResponsavel) {
      responderErro(res, 409, 'esta conta não precisa de vínculo com um responsável', 'vinculo_desnecessario')
      return
    }
    if (estado.vinculo.estado === 'aceito' && !estado.restrita) {
      responderErro(res, 409, 'esta conta já está vinculada a um responsável', 'ja_vinculada')
      return
    }
    const agora = Date.now()
    if ((await vinculosRepo.convitesDesde(req.userId, agora - 86_400_000)) >= LIMITE_DE_CONVITES_POR_DIA) {
      res.setHeader('Retry-After', String(3_600))
      responderErro(
        res,
        429,
        `você já enviou ${LIMITE_DE_CONVITES_POR_DIA} convites nas últimas 24 horas; tente de novo amanhã`,
        'limite_de_convites',
      )
      return
    }
    const { id, token, expiraEm } = await vinculosRepo.convidar(req.userId, email.data, agora)
    const link = linkDoConvite(token)
    const perfil = await usersRepo.get(req.userId)
    let envio: ResultadoDoEnvio
    try {
      envio = await enviadorAtual().enviar({
        idDoConvite: id,
        para: email.data,
        link,
        quemConvidou: perfil?.displayName?.trim() || perfil?.email || null,
        exigeConsentimentoEspecifico: estado.exigeConsentimentoEspecifico,
        expiraEm,
      })
    } catch (err) {
      /* O e-mail não saiu: o convite novo some (não conta no limite, não guarda o e-mail de um
         terceiro à toa) e o anterior, se havia, continua valendo. O log leva o tipo da falha já
         redigido — nunca o destinatário. */
      await vinculosRepo.descartar(req.userId, id)
      log('warn', {
        event: 'convite_nao_enviado',
        error: err instanceof ErroDeEnvioDoConvite ? `${err.tipo}: ${err.message}` : String(err),
        requestId: req.requestId,
      })
      responderErro(
        res,
        502,
        'não conseguimos enviar o convite agora; tente de novo em alguns minutos',
        'convite_nao_enviado',
      )
      return
    }
    await vinculosRepo.substituirAnteriores(req.userId, id, agora)
    res.status(201).json({
      enviado: envio.enviado,
      modo: envio.modo,
      expiraEm,
      emailMascarado: mascararEmail(email.data),
      ...(mostrarLinkNaTela() ? { linkDeTeste: link } : {}),
    })
  } catch (err) {
    res
      .status(500)
      .json({ error: erroDeRota(err, { status: 500, event: 'me_convite_error', requestId: req.requestId }) })
  }
})

/**
 * EXPORTAÇÃO dos dados do titular (LGPD art. 18, II/V — F5-03). Um JSON com tudo o que o sistema
 * guarda sobre a pessoa, em formato legível por máquina.
 *
 * Segredos saem como METADADO (label/kind/baseUrl e "existe ou não"): a chave de API nunca deixa
 * o servidor — nem cifrada nem em claro —, senão a portabilidade viraria um endpoint de
 * exfiltração. Os arquivos de áudio entram como NOMES; o binário continua sendo baixado por
 * `GET /api/sessions/:id/audio`.
 */
meRouter.get('/exportar', async (req, res) => {
  try {
    const dados = await contaRepo.exportar(req.userId)
    res.setHeader('Content-Disposition', 'attachment; filename="meus-dados.json"')
    res.setHeader('Cache-Control', 'no-store')
    res.json(dados)
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'me_exportar_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/** O que aconteceu com o vínculo de LOGIN do titular (F9-01). */
interface ResultadoDoVinculo {
  /** `false` = a pessoa ainda consegue entrar e o servidor reprovisiona uma conta vazia. */
  removido: boolean
  motivo?: string
}

/**
 * F9-01 — apagar as 17 tabelas NÃO desfaz o vínculo de login.
 *
 * Quem já tem JWT válido do Supabase reprovisiona uma conta nova e vazia na requisição seguinte
 * (`usersRepo.ensure` no GET de entitlements). O identity provider é a autoridade sobre o vínculo, e
 * a única forma de cortá-lo é a Admin API do Supabase — por `fetch`, porque o servidor não tem
 * `@supabase/supabase-js` e o Dockerfile poda dependências de cliente.
 *
 * Em modo self-host (`AUTH_REQUIRED` desligado) não existe vínculo externo: todo request já é o dono
 * local, e não há nada a remover.
 */
async function removerVinculoDeLogin(sub: string): Promise<ResultadoDoVinculo> {
  if (!authRequired()) return { removido: true }

  // F14-02: a service role key sai do handler. O acessor devolve `null` quando não há
  // configuração, o que obriga este caminho a reportar o motivo ao titular em vez de
  // descobrir a ausência só no `fetch`.
  const admin = adminDoSupabase()
  if (!admin) {
    return { removido: false, motivo: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configuradas no servidor' }
  }
  const { base, chave } = admin
  try {
    const r = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(sub)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${chave}`, apikey: chave },
    })
    // 404 = o usuário já não existe no provedor; o vínculo está desfeito de qualquer forma.
    if (r.ok || r.status === 404) return { removido: true }
    return { removido: false, motivo: `a Admin API do Supabase respondeu ${r.status}` }
  } catch (err) {
    return { removido: false, motivo: String((err as Error)?.message || err).slice(0, 160) }
  }
}

/**
 * EXCLUSÃO da conta (LGPD art. 18, VI — F5-03). Irreversível: DELETE físico em todas as tabelas
 * com dado do titular + remoção dos arquivos de mídia. Exige `{"confirmar": true}` no corpo.
 *
 * A falha ao apagar um ARQUIVO é reportada, nunca engolida — mesma decisão do `DELETE
 * /api/sessions/:id` (P1-9): as linhas SEMPRE saem (o usuário pediu, e o banco é o dado
 * principal), mas responder `ok` com o áudio ainda no disco seria confirmar o que não aconteceu.
 * O relatório por tabela existe para o titular poder conferir o que foi apagado.
 */
meRouter.delete('/', async (req, res) => {
  const body = parseOr400(excluirContaSchema, req.body, res)
  if (!body) return

  /* A COBRANÇA ANTES DOS DADOS (Fase 3 do lançamento). Apagar a conta deixava o Asaas cobrando todo
     mês — e, sem a linha em `subscriptions`, nem o suporte saberia de quem era o cartão. Cancela
     PRIMEIRO pelo mesmo caminho do botão Cancelar (inclusive o arrependimento, se couber); se o
     Asaas não confirmar, NADA é apagado e o titular é avisado para tentar de novo. */
  let assinatura: { cancelada: boolean; arrependimento?: unknown } = { cancelada: false }
  const sub = await subscriptionsRepo.getActive(req.userId)
  if (sub?.providerSubscriptionId) {
    if (!asaasConfigurado()) {
      res.status(503).json({
        error:
          'não consegui cancelar a sua assinatura (cobrança indisponível neste servidor), então nada foi apagado. Fale com o suporte.',
        code: 'assinatura_nao_cancelada',
      })
      return
    }
    try {
      const r = await encerrarAssinatura(req.userId, { requestId: req.requestId })
      assinatura = { cancelada: true, ...(r.arrependimento ? { arrependimento: r.arrependimento } : {}) }
    } catch (err) {
      res.status(502).json({
        error: `não consegui cancelar a sua assinatura no provedor de pagamento, então nada foi apagado — tente de novo em alguns minutos (${erroDeRota(err, { event: 'me_excluir_cancelamento_falhou', requestId: req.requestId })})`,
        code: 'assinatura_nao_cancelada',
      })
      return
    }
  }

  try {
    // Os arquivos ANTES das linhas: depois da exclusão não há mais como saber quais eram.
    const arquivos = await contaRepo.midia(req.userId)
    const falhas: { arquivo: string; erro: string }[] = []
    let apagados = 0
    for (const nome of arquivos) {
      try {
        // O store já ignora "objeto não existe"; chegar ao catch é falha real.
        await armazenamentoDeMidia.remover(nome)
        apagados++
      } catch (err) {
        falhas.push({ arquivo: nome, erro: String((err as Error)?.message || err).slice(0, 160) })
      }
    }

    const relatorio = await contaRepo.excluir(req.userId)
    // O vínculo DEPOIS das linhas: com o login já cortado e as linhas ainda de pé, ninguém
    // conseguiria pedir de novo a exclusão do que sobrou.
    const vinculo = await removerVinculoDeLogin(req.userId)
    log('info', {
      event: vinculo.removido ? 'conta_excluida' : 'conta_excluida_com_vinculo_vivo',
      total: relatorio.totalDeLinhas,
      requestId: req.requestId,
    })

    const login = {
      desvinculado: vinculo.removido,
      ...(vinculo.removido
        ? {}
        : {
            motivo: vinculo.motivo,
            // Doutrina do P1-9: dizer o que NÃO aconteceu, não confirmar o que não ocorreu.
            aviso:
              'os dados foram apagados, mas o login continua válido — ao entrar de novo, uma conta nova e VAZIA será criada com o mesmo acesso',
          }),
    }

    if (falhas.length || !vinculo.removido) {
      const partes = [
        falhas.length ? `${falhas.length} arquivo(s) de mídia não puderam ser apagados` : '',
        vinculo.removido ? '' : `o vínculo de login sobreviveu (${vinculo.motivo})`,
      ].filter(Boolean)
      res.status(500).json({
        ok: false,
        ...relatorio,
        arquivos: { apagados, falhas },
        assinatura,
        login,
        error: `conta excluída, mas ${partes.join(' e ')}`,
      })
      return
    }
    res.json({ ok: true, ...relatorio, arquivos: { apagados, falhas: [] }, login, assinatura })
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, {
        status: 500,
        event: 'me_excluir_conta_error',
        route: req.path,
        requestId: req.requestId,
      }),
    })
  }
})

/**
 * Os entitlements EFETIVOS do usuário, derivados do plano NO SERVIDOR (a autoridade). O cliente usa
 * isto só para pintar a UI (esconder/mostrar, selo "Pro") — NUNCA para decidir acesso. Read-only:
 * não existe rota para o cliente mudar o plano por aqui (isso é do billing, Fatia 6). O enforcement
 * real acontece nos proxies de IA (Fatia 1b), não neste GET.
 */
/**
 * CONSUMO DO MÊS — quanto do plano já foi usado.
 *
 * POR QUE ESTA ROTA EXISTE. Os contadores existiam e ninguém via: a única coisa que a interface
 * mostrava era armazenamento. Um assinante não tinha como saber se estava perto do teto, e
 * descobria o limite ao ser recusado no meio de uma conversa — que é a pior hora possível.
 *
 * Devolve o teto junto do usado, porque número solto não informa nada: "1.200 chamadas" só quer
 * dizer alguma coisa ao lado de "de 12.000". `null` no teto significa SEM teto (self-host), e não
 * "desconhecido" — `Infinity` não sobrevive ao JSON.
 *
 * Read-only e derivado do plano NO SERVIDOR, como `/entitlements`.
 *
 * `hoje` (matriz v2, uso justo): o DIA local da pessoa — janela `AAAA-MM-DD`, o fuso que a define e
 * os contadores do dia com os tetos. `null` para plano sem teto no dia (Grátis, self-host): ali nada é
 * contado por dia, e "0 usado hoje" seria uma mentira.
 */
async function usoDeHoje(userId: import('../lib/authContext').UserId, plano: Parameters<typeof capSegundosDoDia>[0]) {
  const tetoSegundos = capSegundosDoDia(plano)
  const tetoTokens = capTokensDoDia(plano)
  if (!Number.isFinite(tetoSegundos) && !Number.isFinite(tetoTokens)) return null
  const fuso = await fusoDaCota(userId)
  const janela = diaNoFuso(Date.now(), fuso)
  const [segundos, tokens] = await Promise.all([
    usageCountersRepo.get(userId, METRIC_STT_SEGUNDOS_DIA, janela),
    usageCountersRepo.get(userId, METRIC_LLM_TOKENS_DIA, janela),
  ])
  const finito = (n: number): number | null => (Number.isFinite(n) ? n : null)
  return {
    janela,
    fuso,
    segundosDeAudio: { usado: segundos, teto: finito(tetoSegundos) },
    tokensDeLlm: { usado: tokens, teto: finito(tetoTokens) },
  }
}

meRouter.get('/uso', async (req, res) => {
  try {
    const plano = await getPlanForUser(req.userId)
    const janela = new Date().toISOString().slice(0, 7)
    const [chamadas, segundos, tokens, portao, alivio, hoje] = await Promise.all([
      usageCountersRepo.get(req.userId, METRIC_MANAGED, janela),
      usageCountersRepo.get(req.userId, METRIC_STT_SEGUNDOS, janela),
      usageCountersRepo.get(req.userId, METRIC_LLM_TOKENS, janela),
      portaoDaNuvem(),
      /* A NUVEM DE ALÍVIO (A10) só existe para a conta Grátis; para os outros planos (e o convidado,
         que tem o pool dele), `null`. */
      plano === 'free' ? resumoDoAlivio(req) : null,
      usoDeHoje(req.userId, plano),
    ])
    const finito = (n: number): number | null => (Number.isFinite(n) ? n : null)
    res.json({
      plano,
      janela,
      chamadas: { usado: chamadas, teto: finito(capForPlan(plano)) },
      segundosDeAudio: { usado: segundos, teto: finito(capSegundosParaPlano(plano)) },
      // Tokens viraram TETO na Fase 2 do lançamento: reservados antes da chamada, acertados depois.
      tokensDeLlm: { usado: tokens, teto: finito(capTokensParaPlano(plano)) },
      /* O PORTÃO GLOBAL (chave de emergência e orçamento do mês), para a tela dizer POR QUE a nuvem
         não está respondendo. Só o estado e o motivo: o valor em dólares é do operador
         (`GET /api/admin/ia`), não de cada assinante. */
      iaDeNuvem: { disponivel: portao.ok, motivo: portao.motivo ?? null, mensagem: portao.mensagem ?? null },
      /* O que resta da nuvem grátis de aparelho fraco, em segundos de TRANSCRIÇÃO (o menor entre os
         segundos e o dólar que sobram): é o "restam X" da oferta. `disponivel` é o mesmo veredicto da
         porta; o valor em dólar fica com o operador. */
      alivio,
      /* O USO JUSTO DO DIA (matriz v2): o dia local, com os contadores e os tetos; `null` sem teto no dia. */
      hoje,
    })
  } catch (err) {
    res.status(500).json({ error: erroDeRota(err, { status: 500, event: 'me_route_error' }) })
  }
})

meRouter.get('/entitlements', async (req, res) => {
  try {
    // Provisiona a conta no 1º acesso (idempotente) — assim o usuário aparece na gestão admin.
    // O convidado (Fase 7) NÃO vira conta: anônimo não entra na gestão admin nem ganha linha em `users`.
    if (!req.convidado) await usersRepo.ensure(req.userId)
    const [entitlements, plano] = await Promise.all([getEntitlementsForUser(req.userId), getPlanForUser(req.userId)])
    const teto = capDeArmazenamento(plano)
    /*
     * F9-02: aqui é o chamador de `reconciliarArmazenamento`. É a rota por onde todo usuário ativo
     * passa e que já lê o contador — corrigir a divergência exatamente onde o número é mostrado.
     * A varredura só roda se o contador estiver vencido (24h por padrão) e nunca lança.
     * Plano sem teto (selfhost) não contabiliza nada, então não há o que reconciliar.
     */
    const usados = Number.isFinite(teto) ? await reconciliarSeVencido(req.userId) : await usoDeArmazenamento(req.userId)
    // `Infinity` não sobrevive ao JSON (vira null); `null` diz "sem teto" de forma explícita.
    res.json({ ...entitlements, armazenamento: { usados, teto: Number.isFinite(teto) ? teto : null } })
  } catch (err) {
    res.status(500).json({ error: erroDeRota(err, { status: 500, event: 'me_route_error' }) })
  }
})
