/**
 * A POLÍTICA DA LEGENDA SEGURA DE AGORA (change `legenda-segura-para-menores`): o perfil (`perfilProtegido()`, que é
 * verdadeiro para menor de 18, idade não declarada e sem conta; falso no self-host e para o adulto declarado) e a opção
 * do adulto em Ajustes. A regra mora no núcleo (`politicaDaLegenda` em `core/moderacao/legendaSegura.ts`).
 */
import { type PoliticaDaLegenda, politicaDaLegenda } from '@core/moderacao/legendaSegura';

import { lerPreferencias } from './preferencias';
import { perfilProtegido } from './protecaoDoMenor';

export function politicaDaLegendaAtual(): PoliticaDaLegenda {
  return politicaDaLegenda({ protegido: perfilProtegido(), opcaoDoAdulto: lerPreferencias().legendaSegura });
}
