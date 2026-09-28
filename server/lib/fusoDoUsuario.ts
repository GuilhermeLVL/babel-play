/**
 * O FUSO DO USUÁRIO NO SERVIDOR (revisão de 27/09 das recompensas v2, P1).
 *
 * O dia da meta, as missões, a ofensiva e o teto do baú são do dia LOCAL de quem joga. Até aqui o
 * fuso vinha em cada pedido e valia o que viesse: trocar de fuso a cada chamada inventava um dia
 * novo — mais três baús, outra meta. Agora o fuso é GRAVADO no primeiro uso (`estado_da_conta`) e
 * só muda uma vez a cada 24 h; a régua é `decidirFuso`, do core, a mesma do espelho sem conta.
 */
import { CARENCIA_DO_FUSO_MS, decidirFuso, FUSO_PADRAO, fusoOuPadrao } from '../../src/core/learning/economia'
import { estadoDaContaRepo } from '../db/repositories/estadoDaConta'
import type { UserId } from './authContext'

/** O fuso que vale para quem pediu; grava o pedido quando `decidirFuso` manda (primeiro uso ou carência vencida). */
export async function fusoDoUsuario(userId: UserId, pedido: string | null | undefined): Promise<string> {
  const agora = Date.now()
  const { fuso, gravar } = decidirFuso(await estadoDaContaRepo.fusoGravado(userId), pedido, agora)
  if (!gravar) return fuso
  if (await estadoDaContaRepo.gravarFuso(userId, gravar.fuso, gravar.desde, CARENCIA_DO_FUSO_MS)) return gravar.fuso
  /* Outro pedido gravou antes (corrida): vale o que ficou no banco. */
  return fusoGravado(userId)
}

/** Só leitura: o fuso gravado, ou o padrão. É o que o perfil (ofensiva, marcos) usa. */
export async function fusoGravado(userId: UserId): Promise<string> {
  const { fuso } = await estadoDaContaRepo.fusoGravado(userId)
  return fuso ? fusoOuPadrao(fuso) : FUSO_PADRAO
}
