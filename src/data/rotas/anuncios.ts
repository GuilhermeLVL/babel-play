/**
 * O ANÚNCIO PREMIADO — as chamadas da recompensa (`server/routes/anuncios.ts`, spec `anuncios-no-gratis`).
 *
 * Um aperto de mão em dois passos, porque na web não há verificação servidor a servidor da rede de anúncios:
 *   1. o provedor chama `iniciarPremiado(espaco)` ANTES de mostrar o premiado e guarda o `exibicaoId`;
 *   2. a página do anúncio avisa o fim (por `postMessage`), e o espaço chama `concluirPremiado(exibicaoId)`
 *      (`aoRecompensar` de `EspacoDeAnuncio`). O servidor credita uma vez só; repetir responde `jaCreditado`.
 *
 * SÓ EXISTEM COM CONTA: sem conta o perfil é o protegido e não vê anúncio (`tests/contratos/rotas-espelhadas.test.ts`
 * registra o motivo). O erro volta com o `code` do servidor (`teto_do_dia`, `perfil_protegido`,
 * `anuncios_desligados`, `exibicao_expirada`, `exibicao_desconhecida`).
 */
import type { EspacoPremiado, RecompensaDoPremiado } from '../../core/anuncios/premiado'
import { apiFetch, lerErro } from '../funil'
import type { Falha } from './idade'

/**
 * O que o servidor creditou, achatado: `tipo` da recompensa (`seeds`, `nuvem`, `tema-24h`, `ajuda`) com os campos
 * dela (`seeds`, `segundos`, `ateEm`), o espaço e se já tinha sido creditada antes (`jaCreditado`).
 */
export type PremiadoConcluido = RecompensaDoPremiado & { jaCreditado: boolean; espaco: EspacoPremiado }

async function falha(r: Response): Promise<Falha> {
  const e = await lerErro(r)
  return { ok: false, status: e.status, error: e.error, code: e.code }
}
const semRede = (): Falha => ({ ok: false, status: 0, error: 'não consegui falar com o servidor' })

/** Abre uma exibição premiada no servidor. Só depois de `ok` o provedor mostra o anúncio. */
export async function iniciarPremiado(espaco: EspacoPremiado): Promise<{ ok: true; exibicaoId: string } | Falha> {
  try {
    const r = await apiFetch('/api/anuncios/premiado/iniciar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ espaco }),
    })
    if (!r.ok) return falha(r)
    const { exibicaoId } = (await r.json()) as { exibicaoId: string }
    return { ok: true, exibicaoId }
  } catch {
    return semRede()
  }
}

/** Avisa o servidor que a exibição terminou; ele credita a recompensa (uma vez só). */
export async function concluirPremiado(exibicaoId: string): Promise<({ ok: true } & PremiadoConcluido) | Falha> {
  try {
    const r = await apiFetch('/api/anuncios/premiado/concluir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exibicaoId }),
    })
    if (!r.ok) return falha(r)
    const c = (await r.json()) as { jaCreditado: boolean; espaco: EspacoPremiado; recompensa: RecompensaDoPremiado }
    return { ok: true, ...c.recompensa, jaCreditado: c.jaCreditado, espaco: c.espaco }
  } catch {
    return semRede()
  }
}
