import { getEntitlements } from '../entitlements';
import { lerPreferencias, type PreferenciasDaNuance } from '../preferencias';
import type { RegistroDaTraducao, VarianteDaTraducao } from './promptComunicativo';

/**
 * O QUE AS PREFERÊNCIAS DA TRADUÇÃO NUANCE (Ajustes → Idiomas, D6 da Fase D) PÕEM NUM PEDIDO DE
 * TRADUÇÃO ao servidor: o registro padrão e a variante do destino.
 *
 * SÓ O QUE NÃO É O PADRÃO VAI. "Automático", pt-BR e es-419 não mandam nada: o pedido fica igual ao
 * de quem não mexeu nos ajustes, e a legenda ao vivo continua dividindo o cache do servidor com todo
 * mundo que traduz a mesma frase (o registro e a variante entram na chave — `mtProxy.ts`). Sem a
 * capacidade `traducaoNuance`, nada vai: o servidor ignoraria de qualquer jeito.
 */
export interface NuanceDoPedido {
  registro?: RegistroDaTraducao;
  variante?: VarianteDaTraducao;
}

export function nuanceDoPedido(tgt: string, nuance: PreferenciasDaNuance, temNuance: boolean): NuanceDoPedido {
  if (!temNuance) return {};
  const base = tgt.split('-')[0].toLowerCase();
  const variante =
    base === 'pt' && nuance.variantes.pt === 'pt-PT'
      ? 'pt-PT'
      : base === 'es' && nuance.variantes.es === 'es-ES'
        ? 'es-ES'
        : undefined;
  return {
    ...(nuance.registro !== 'automatico' ? { registro: nuance.registro } : {}),
    ...(variante ? { variante } : {}),
  };
}

/** O mesmo, lido das preferências e do plano de agora. */
export const nuanceDasPreferencias = (tgt: string): NuanceDoPedido =>
  nuanceDoPedido(tgt, lerPreferencias().nuance, getEntitlements().traducaoNuance);
