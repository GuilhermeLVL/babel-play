/** Rota do usuário atual (montada em `/api/me`, atrás do authMiddleware). */
import { Router } from 'express'
import { getEntitlementsForUser, getPlanForUser } from '../lib/entitlements'
import { usoDeArmazenamento, capDeArmazenamento, reconciliarSeVencido } from '../lib/storageQuota'
import { authRequired } from '../lib/auth'
import { adminDoSupabase } from '../lib/config'
import { usersRepo } from '../db/repositories/users'
import { perfilRepo } from '../db/repositories/perfil'
import { contaRepo } from '../db/repositories/conta'
import { perfilPatchSchema, excluirContaSchema, parseOr400 } from '../validation'
import { erroDeRota } from '../lib/erroDeRota'
import { log } from '../lib/logger'
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
    res.status(500).json({ error: erroDeRota(err, { event: 'me_perfil_get_error' }) })
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
    res.status(500).json({ error: erroDeRota(err, { event: 'me_perfil_patch_error' }) })
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
    res.status(500).json({ error: erroDeRota(err, { event: 'me_exportar_error', route: req.path, requestId: req.requestId }) })
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
      ...(vinculo.removido ? {} : {
        motivo: vinculo.motivo,
        // Doutrina do P1-9: dizer o que NÃO aconteceu, não confirmar o que não ocorreu.
        aviso: 'os dados foram apagados, mas o login continua válido — ao entrar de novo, uma conta nova e VAZIA será criada com o mesmo acesso',
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
        login,
        error: `conta excluída, mas ${partes.join(' e ')}`,
      })
      return
    }
    res.json({ ok: true, ...relatorio, arquivos: { apagados, falhas: [] }, login })
  } catch (err) {
    res.status(500).json({ error: erroDeRota(err, { event: 'me_excluir_conta_error', route: req.path, requestId: req.requestId }) })
  }
})

/**
 * Os entitlements EFETIVOS do usuário, derivados do plano NO SERVIDOR (a autoridade). O cliente usa
 * isto só para pintar a UI (esconder/mostrar, selo "Pro") — NUNCA para decidir acesso. Read-only:
 * não existe rota para o cliente mudar o plano por aqui (isso é do billing, Fatia 6). O enforcement
 * real acontece nos proxies de IA (Fatia 1b), não neste GET.
 */
meRouter.get('/entitlements', async (req, res) => {
  try {
    // Provisiona a conta no 1º acesso (idempotente) — assim o usuário aparece na gestão admin.
    await usersRepo.ensure(req.userId)
    const [entitlements, plano] = await Promise.all([
      getEntitlementsForUser(req.userId),
      getPlanForUser(req.userId),
    ])
    const teto = capDeArmazenamento(plano)
    /*
     * F9-02: aqui é o chamador de `reconciliarArmazenamento`. É a rota por onde todo usuário ativo
     * passa e que já lê o contador — corrigir a divergência exatamente onde o número é mostrado.
     * A varredura só roda se o contador estiver vencido (24h por padrão) e nunca lança.
     * Plano sem teto (selfhost) não contabiliza nada, então não há o que reconciliar.
     */
    const usados = Number.isFinite(teto)
      ? await reconciliarSeVencido(req.userId)
      : await usoDeArmazenamento(req.userId)
    // `Infinity` não sobrevive ao JSON (vira null); `null` diz "sem teto" de forma explícita.
    res.json({ ...entitlements, armazenamento: { usados, teto: Number.isFinite(teto) ? teto : null } })
  } catch (err) {
    res.status(500).json({ error: erroDeRota(err, { event: 'me_route_error' }) })
  }
})
