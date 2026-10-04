/**
 * AS PORTAS DE EMERGÊNCIA (Fase 3 do plano de lançamento): `CHECKOUT_ENABLED` e `SIGNUP_ENABLED`.
 *
 * Servem para o dia em que algo dá errado — cobrança dobrada, abuso de cadastro, custo fora do
 * controle — e é preciso FECHAR A PORTA sem derrubar o app. As duas nascem LIGADAS (ausente =
 * aberta) e, desligadas, dizem por quê: a tela mostra uma mensagem clara, não um erro genérico.
 *
 * Quem já está dentro NÃO é afetado: o assinante continua com o plano (a venda fecha, o direito
 * não), e a conta existente continua entrando (o cadastro fecha, o login não).
 *
 * O CADASTRO de verdade acontece no Supabase, que o servidor não controla. O que o servidor
 * controla é o PRIMEIRO USO: uma conta que o nosso banco ainda não conhece é recusada com
 * `cadastro_fechado` em qualquer rota, e a tela de login esconde "Criar conta" lendo
 * `GET /api/abertura`. Para fechar de vez, o operador desliga também "Allow new users to sign up"
 * no painel do Supabase (documentado no inventário de `SIGNUP_ENABLED`).
 */
import type { NextFunction, Request, Response } from 'express'

import { usersRepo } from '../db/repositories/users'
import { authRequired } from './auth'
import { anualLigado, cadastroLigado, checkoutLigado } from './config'
import { responderErro } from './respostaDeErro'

export const MENSAGEM_CHECKOUT_DESLIGADO =
  'As assinaturas e compras estão pausadas temporariamente. Quem já assina continua com tudo; tente de novo mais tarde.'
export const MENSAGEM_CADASTRO_FECHADO =
  'O cadastro de contas novas está pausado temporariamente. Você pode continuar usando o app sem conta, no seu aparelho.'
/** `ANUAL_ENABLED=0`: o anual (à vista e 12x) ainda não é vendido; o mensal segue. */
export const MENSAGEM_ANUAL_INDISPONIVEL = 'O plano anual ainda não está à venda. Você pode assinar o mensal.'

/**
 * O que a tela de login e a de planos precisam saber antes de oferecer a porta. Público. `anual` diz
 * se o plano anual está à venda (`ANUAL_ENABLED`): desligado, a tela mostra só o mensal.
 */
export function estadoDaAbertura(): { cadastro: boolean; checkout: boolean; anual: boolean } {
  return { cadastro: cadastroLigado(), checkout: checkoutLigado(), anual: anualLigado() }
}

export function abertura(_req: Request, res: Response): void {
  res.setHeader('Cache-Control', 'no-store')
  res.json(estadoDaAbertura())
}

/** Contas que já sabemos existir — evita um SELECT por request enquanto o cadastro está fechado. */
const conhecidas = new Set<string>()
const TETO_DO_CACHE = 50_000

/**
 * MIDDLEWARE (depois do auth): com o cadastro fechado, só entra quem o banco já conhece. Aberto,
 * não custa nada — nem consulta faz.
 */
export function portaDoCadastro(req: Request, res: Response, next: NextFunction): void {
  if (cadastroLigado() || !authRequired() || !req.userId) {
    next()
    return
  }
  if (conhecidas.has(req.userId)) {
    next()
    return
  }
  usersRepo
    .get(req.userId)
    .then((u) => {
      if (!u) {
        responderErro(res, 403, MENSAGEM_CADASTRO_FECHADO, 'cadastro_fechado')
        return
      }
      if (conhecidas.size < TETO_DO_CACHE) conhecidas.add(req.userId)
      next()
    })
    .catch(next)
}
