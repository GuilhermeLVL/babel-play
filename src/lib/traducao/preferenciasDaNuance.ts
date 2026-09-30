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

/**
 * O QUE AS PREFERÊNCIAS PÕEM NO "POLIR A SESSÃO" (D5): o registro padrão e as variantes que fogem do
 * padrão. A sessão pode ter as duas direções (pt→en e en→pt), então as variantes vão todas, e o
 * servidor aplica cada uma só à linha cujo destino é o idioma dela. Sem a capacidade, nada.
 */
export interface NuanceDoPolimento {
  registro?: RegistroDaTraducao;
  variantes?: VarianteDaTraducao[];
}

export function nuanceDoPolimento(nuance: PreferenciasDaNuance, temNuance: boolean): NuanceDoPolimento {
  if (!temNuance) return {};
  const variantes = (['pt', 'es'] as const).flatMap((idioma) => {
    const v = nuanceDoPedido(idioma, nuance, true).variante;
    return v ? [v] : [];
  });
  return {
    ...(nuance.registro !== 'automatico' ? { registro: nuance.registro } : {}),
    ...(variantes.length ? { variantes } : {}),
  };
}

/** O mesmo, lido das preferências e do plano de agora. */
export const nuanceDoPolimentoDasPreferencias = (): NuanceDoPolimento =>
  nuanceDoPolimento(lerPreferencias().nuance, getEntitlements().traducaoNuance);
