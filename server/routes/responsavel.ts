/**
 * O LADO DO RESPONSÁVEL (montado em `/api/responsavel`, atrás do auth) — Fase 4 do lançamento.
 *
 * O responsável recebe o link do convite (`/responsavel?token=…`), entra na PRÓPRIA conta (tem de
 * ser adulto declarado) e aceita. Aceitar vincula a conta do menor à dele (ECA Digital art. 24) e,
 * abaixo de 12 anos, registra o consentimento ESPECÍFICO — quem, quando e o texto aceito (LGPD art.
 * 14 §1º). Depois, é ele quem paga pelo menor (`POST /api/billing/assinar` com `paraUsuario`).
 *
 * O TOKEN é de uso único e expira: guardado só como hash, e o aceite é uma instrução condicional
 * (`vinculosRepo.aceitar`). As tentativas recusadas (não adulto, a própria conta, sem o
 * consentimento) NÃO gastam o token — o responsável de verdade ainda consegue aceitar.
 */
import { Router } from 'express'
import { z } from 'zod'

import { idadesRepo } from '../db/repositories/idades'
import { usersRepo } from '../db/repositories/users'
import { vinculosRepo } from '../db/repositories/vinculos'
import { asUserId } from '../lib/authContext'
import { textoParaFaixa, VERSAO_DO_CONSENTIMENTO } from '../lib/consentimentoDoResponsavel'
import { erroDeRota } from '../lib/erroDeRota'
import { ehAdultoDeclarado, faixaEtaria } from '../lib/idade'
import { log } from '../lib/logger'
import { responderErro } from '../lib/respostaDeErro'

export const responsavelRouter = Router()

const tokenSchema = z.string().min(16).max(128)

type Convite = NonNullable<Awaited<ReturnType<typeof vinculosRepo.porToken>>>

/** O convite vale? Responde o erro e devolve `null` quando não. */
async function conviteValido(token: unknown, res: import('express').Response): Promise<Convite | null> {
  const t = tokenSchema.safeParse(token)
  if (!t.success) {
    responderErro(res, 404, 'convite inválido', 'convite_invalido')
    return null
  }
  const c = await vinculosRepo.porToken(t.data)
  if (!c || c.revogadoEm) {
    responderErro(res, 404, 'convite inválido ou substituído por um mais novo', 'convite_invalido')
    return null
  }
  if (c.usadoEm) {
    responderErro(res, 410, 'este convite já foi usado', 'convite_usado')
    return null
  }
  if (c.expiraEm <= Date.now()) {
    responderErro(res, 410, 'este convite expirou; peça um novo', 'convite_expirado')
    return null
  }
  return c
}

/** O que o responsável vê antes de aceitar: de quem é o pedido e o texto que vai aceitar. */
responsavelRouter.get('/convite', async (req, res) => {
  try {
    const c = await conviteValido(req.query.token, res)
    if (!c || !c.userId) return
    const menor = await usersRepo.get(asUserId(c.userId))
    const faixa = faixaEtaria(await idadesRepo.nascimento(asUserId(c.userId)))
    const exigeConsentimentoEspecifico = faixa === 'menor-12'
    res.json({
      nomeDoMenor: menor?.displayName ?? null,
      faixa,
      exigeConsentimentoEspecifico,
      textoDoConsentimento: textoParaFaixa(exigeConsentimentoEspecifico),
      versao: VERSAO_DO_CONSENTIMENTO,
      expiraEm: c.expiraEm,
    })
  } catch (err) {
    res
      .status(500)
      .json({ error: erroDeRota(err, { status: 500, event: 'responsavel_error', requestId: req.requestId }) })
  }
})

const aceiteSchema = z
  .object({
    token: tokenSchema,
    nomeDoResponsavel: z.string().trim().min(2).max(120),
    declaroSerResponsavelLegal: z.literal(true),
    consentimentoEspecifico: z.boolean().optional(),
    versaoDoConsentimento: z.string().max(40).optional(),
  })
  .strip()

responsavelRouter.post('/aceitar', async (req, res) => {
  const p = aceiteSchema.safeParse(req.body ?? {})
  if (!p.success) {
    responderErro(res, 400, 'confirme o nome e que você é o responsável legal', 'aceite_invalido')
    return
  }
  try {
    const c = await conviteValido(p.data.token, res)
    if (!c || !c.userId) return
    const menorId = asUserId(c.userId)

    if (menorId === req.userId) {
      responderErro(res, 403, 'o convite precisa ser aceito pela conta do responsável, não pela sua', 'mesma_conta')
      return
    }
    const quem = await ehAdultoDeclarado(req.userId)
    if (!quem.informado) {
      responderErro(res, 403, 'informe a sua data de nascimento antes de aceitar', 'idade_nao_informada')
      return
    }
    if (!quem.adulto) {
      responderErro(res, 403, 'só um adulto (18 anos ou mais) pode ser o responsável', 'responsavel_nao_adulto')
      return
    }

    const menor = await usersRepo.get(menorId)
    const exigeConsentimentoEspecifico = faixaEtaria(await idadesRepo.nascimento(menorId)) === 'menor-12'
    if (exigeConsentimentoEspecifico) {
      if (p.data.consentimentoEspecifico !== true) {
        responderErro(
          res,
          400,
          'para menores de 12 anos, é preciso marcar o consentimento específico',
          'consentimento_obrigatorio',
        )
        return
      }
      if (p.data.versaoDoConsentimento && p.data.versaoDoConsentimento !== VERSAO_DO_CONSENTIMENTO) {
        responderErro(
          res,
          409,
          'o texto do consentimento mudou; recarregue a página e leia de novo',
          'versao_desatualizada',
        )
        return
      }
    }

    const ok = await vinculosRepo.aceitar(p.data.token, {
      responsavelUserId: req.userId,
      nomeDoResponsavel: p.data.nomeDoResponsavel,
      // O texto gravado é SEMPRE o da faixa: também o vínculo de 12–15 fica registrado com o que foi lido.
      consentimento: { versao: VERSAO_DO_CONSENTIMENTO, texto: textoParaFaixa(exigeConsentimentoEspecifico) },
    })
    if (!ok) {
      responderErro(res, 410, 'este convite acabou de ser usado ou expirou', 'convite_usado')
      return
    }
    log('info', { event: 'responsavel_vinculado', requestId: req.requestId })
    res.json({ ok: true, nomeDoMenor: menor?.displayName ?? null, menorId })
  } catch (err) {
    res
      .status(500)
      .json({ error: erroDeRota(err, { status: 500, event: 'responsavel_error', requestId: req.requestId }) })
  }
})

/** Os menores vinculados a mim — para eu assinar ou comprar por eles. */
responsavelRouter.get('/vinculados', async (req, res) => {
  try {
    const lista = await vinculosRepo.menoresDoResponsavel(req.userId)
    res.json({
      vinculados: lista.map((v) => ({
        menorId: v.menorId,
        nome: v.nome,
        faixa: faixaEtaria(v.nascimento),
        desde: v.desde,
      })),
    })
  } catch (err) {
    res
      .status(500)
      .json({ error: erroDeRota(err, { status: 500, event: 'responsavel_error', requestId: req.requestId }) })
  }
})
