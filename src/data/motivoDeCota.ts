/**
 * AS RECUSAS DE COTA, NUM LUGAR SÓ — o mapeamento que a IA de estudo (`apiDoEstudo.ts`) já fazia certo e que a
 * Nuance (`apiDaNuance.ts`) não fazia: lá o 402 da cota do mês virava "faz parte da Tradução Nuance" (um convite
 * para quem JÁ tem a Nuance) e todo 429 virava "nuvem ocupada", inclusive o uso justo do dia.
 *
 * O servidor decide pelo `code`, nunca pelo texto:
 *   - 402 `quota_exceeded` / `cota_do_mes` / `teto_usd_da_conta` → a cota do MÊS acabou (volta no dia 1º);
 *   - 429 `uso_justo_do_dia` → o uso justo de HOJE acabou (volta amanhã); o 429 `teto_do_assistente` (o teto do dia
 *     do assistente ao vivo) é o mesmo caso;
 *   - 402 `quota_exceeded` com `detalhes.escopo: 'ip'` (os convidados da mesma rede, `server/lib/convidado.ts`) →
 *     também é o limite de HOJE: aquela cota é DIÁRIA, e "volta no dia 1º" seria mentira;
 *   - outro 429 (`nuvem_ocupada`, limite do provedor) → a nuvem está ocupada AGORA (tente em instantes).
 * Nenhum dos três é oferta: quem decide mostrar Planos é a tela, e nunca no instante da recusa (`copy-br-etica`).
 */

export type FalhaDeCota = 'cota_do_mes' | 'uso_justo' | 'nuvem_ocupada';

/** A recusa de cota que a resposta descreve, ou `null` quando não é de cota. */
export function motivoDeCota(
  status: number,
  code: string | undefined,
  detalhes?: Record<string, unknown>,
): FalhaDeCota | null {
  if (code === 'quota_exceeded' && detalhes?.escopo === 'ip') return 'uso_justo';
  /* `cota_do_assistente`: a subcota de tokens do assistente ao vivo (`assistenteTokensMes`) acabou — volta no dia 1º. */
  if (
    code === 'cota_do_mes' ||
    code === 'quota_exceeded' ||
    code === 'teto_usd_da_conta' ||
    code === 'cota_do_assistente'
  )
    return 'cota_do_mes';
  /* O teto do DIA do assistente ao vivo (`assistenteDia`, 429 `teto_do_assistente`): também volta amanhã. */
  if (code === 'uso_justo_do_dia' || code === 'teto_do_assistente') return 'uso_justo';
  if (status === 429) return 'nuvem_ocupada';
  return null;
}
