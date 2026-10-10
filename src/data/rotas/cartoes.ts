/**
 * O CLIENTE DA TELA CARTÕES — uma leitura só: `GET /api/vocab/resumo`.
 *
 * A tela precisa de contagens (o que vence agora, por baralho, a previsão, a retenção medida), e
 * pedir o baralho inteiro (`fetchDeck`, 2 MB numa conta grande) só para contar era o custo dela. O
 * servidor conta e devolve poucos KB; o contrato é `core/learning/resumoDosCartoes.ts`.
 *
 * SEM PAR NO MODO SEM CONTA, e a ausência é declarada em `tests/contratos/rotas-espelhadas.test.ts`:
 * a revisão exige conta, então a tela mostra o estado vazio e não chama esta rota.
 */
import type { ResumoDosCartoes } from '../../core/learning/resumoDosCartoes';
import { apiFetch } from '../funil';

/**
 * O ÚLTIMO RESUMO RECEBIDO E O ETag DELE, por começo de dia.
 *
 * O servidor responde 304 sem ler tabela nenhuma quando nada mudou (a versão dos dados da conta) e
 * o minuto é o mesmo ("vence agora" depende do relógio, e o instante da resposta é o começo do
 * minuto). O `If-None-Match` vai explícito, como no baralho (`lerLinhasDoBaralho`): não depende de o
 * cache HTTP do navegador ter guardado a resposta.
 */
let ultimoResumo: { inicioDoDia: number; etag: string; resumo: ResumoDosCartoes } | null = null;

/** O começo do dia local de quem está usando (ms): os dias do resumo contam a partir dele. */
function inicioDeHoje(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * As contagens da tela Cartões, ou `null` se a leitura falhou (rede, servidor, sem conta). Quem
 * chama trata o objeto como somente leitura: é o mesmo que fica guardado para o próximo 304.
 */
export async function lerResumoDosCartoes(inicioDoDia: number = inicioDeHoje()): Promise<ResumoDosCartoes | null> {
  const memo = ultimoResumo && ultimoResumo.inicioDoDia === inicioDoDia ? ultimoResumo : null;
  try {
    const res = await apiFetch(
      `/api/vocab/resumo?inicioDoDia=${inicioDoDia}`,
      memo ? { headers: { 'If-None-Match': memo.etag } } : undefined,
    );
    if (res.status === 304 && memo) return memo.resumo;
    if (!res.ok) return null;
    const resumo = (await res.json()) as ResumoDosCartoes;
    const etag = res.headers?.get?.('etag');
    ultimoResumo = etag ? { inicioDoDia, etag, resumo } : null;
    return resumo;
  } catch {
    return null;
  }
}

/** Zera a memória do resumo (troca de conta, testes). */
export function esquecerResumoDosCartoes(): void {
  ultimoResumo = null;
}
