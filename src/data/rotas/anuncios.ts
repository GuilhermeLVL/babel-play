/**
 * O PREMIADO NO SERVIDOR — as chamadas (Task 5 do estado 3; versão mínima da Task 4, a reconciliar no merge).
 *
 * Não existe verificação do Google no servidor (SSV) para anúncio premiado na web: o servidor abre uma
 * EXIBIÇÃO antes do anúncio (`iniciar`) e credita uma vez, com teto por pessoa e global, quando o app
 * avisa que a página de anúncios mandou `recompensa` (`concluir`). Só com conta.
 */
import type { EspacoDeAnuncio } from '../../core/anuncios/politicaDeAnuncio';
import { apiFetch, lerErro } from '../funil';

/** Abre uma exibição do premiado. Lança se o servidor recusar (flag desligada, teto do dia, perfil protegido). */
export async function iniciarPremiado(espaco: EspacoDeAnuncio): Promise<{ exibicaoId: string }> {
  const r = await apiFetch('/api/anuncios/premiado/iniciar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ espaco }),
  });
  if (!r.ok) throw new Error((await lerErro(r)).code ?? 'premiado_recusado');
  const corpo = (await r.json()) as { exibicaoId?: unknown };
  if (typeof corpo.exibicaoId !== 'string' || !corpo.exibicaoId) throw new Error('premiado_sem_exibicao');
  return { exibicaoId: corpo.exibicaoId };
}

/** Pede o crédito da exibição (idempotente no servidor). Lança se o servidor recusar. */
export async function concluirPremiado(exibicaoId: string): Promise<void> {
  const r = await apiFetch('/api/anuncios/premiado/concluir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exibicaoId }),
  });
  if (!r.ok) throw new Error((await lerErro(r)).code ?? 'premiado_recusado');
}
