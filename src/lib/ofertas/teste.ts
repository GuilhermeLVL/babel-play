/**
 * QUEM PODE TESTAR — o que o motor de ofertas sabe do teste de 14 dias do Premium (C8).
 *
 * A autoridade é o servidor: `GET /api/billing/status` → `teste.estado` (`disponivel`, `ativo`,
 * `usado`, `indisponivel`). Guardado no aparelho por 1 hora, como a cota (`cota.ts`): a tela de Planos
 * e o checkout já perguntam o status (`carregarStatusDeBilling` lembra a resposta), e o host pergunta
 * por conta própria só com a lembrança vencida.
 *
 * SEM RESPOSTA, NÃO SE SABE — e o motor sugere o Premium, não o teste: prometer "teste 14 dias grátis"
 * a quem já testou seria mentir. Falha de rede também não promete nada.
 */
import { apiFetch } from '../../data/api';

export const VALIDADE_DA_SITUACAO_DO_TESTE_MS = 60 * 60_000;

const CHAVE = 'babel.ofertas.teste';

/** Guarda a situação que o servidor mandou (ou a ausência dela, que também é resposta). */
export function lembrarSituacaoDoTeste(estado: string | undefined, agora = Date.now()): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ em: agora, estado: estado ?? null }));
  } catch {
    /* sem storage: o motor sugere o Premium */
  }
}

function lida(agora: number): { estado: string | null } | null {
  try {
    const c = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as { em?: unknown; estado?: unknown } | null;
    if (!c || typeof c.em !== 'number' || agora - c.em >= VALIDADE_DA_SITUACAO_DO_TESTE_MS) return null;
    return { estado: typeof c.estado === 'string' ? c.estado : null };
  } catch {
    return null;
  }
}

/** O servidor disse, há menos de 1 hora, que esta conta pode começar o teste. */
export function podeTestarConhecido(agora = Date.now()): boolean {
  return lida(agora)?.estado === 'disponivel';
}

/** Pergunta ao servidor quando a lembrança venceu. Falha é silenciosa (fica "não se sabe"). */
export async function verificarTeste(agora = Date.now()): Promise<void> {
  if (lida(agora)) return;
  try {
    const r = await apiFetch('/api/billing/status');
    if (!r.ok) return;
    const corpo = (await r.json()) as { teste?: { estado?: string } };
    lembrarSituacaoDoTeste(corpo.teste?.estado, agora);
  } catch {
    /* idem */
  }
}
