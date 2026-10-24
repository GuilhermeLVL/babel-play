import { lazy, Suspense } from 'react';

import { FLAG_IA_DE_ESTUDO } from '../../../core/planos';
import { useFlag } from '../../../lib/flags';
import type { VocabCard } from '../../../types';

const CorpoDoResumo = lazy(() => import('./CorpoDoResumo'));

/**
 * "RESUMIR A SESSÃO" NA REVISÃO (planos v4, etapa 2, Task 3): 3 pontos e os cartões com a frase da cena. Este
 * arquivo é só a PORTA, como `ExplicacaoDaFrase`: com a flag `ia_de_estudo` desligada nada é renderizado e o corpo
 * (e o cliente da API) nem é baixado. Quem pode resumir é o servidor (plano ou amostra semanal do Grátis).
 */
export default function ResumoDaSessao(props: {
  sessionId: string;
  /** O idioma de quem estuda: os pontos e os versos dos cartões vêm nele. */
  lang: string;
  /** Leva à tela de Planos. Ausente no perfil protegido. */
  aoConhecer?: () => void;
  /** Os cartões que ENTRARAM no baralho (para a tela atualizar o deck dela). */
  aoAdicionar?: (criados: VocabCard[]) => void;
}) {
  const ligada = useFlag(FLAG_IA_DE_ESTUDO);
  if (!ligada) return null;
  return (
    <Suspense fallback={null}>
      {/* Outra sessão ou outro idioma: outro resumo. */}
      <CorpoDoResumo key={`${props.sessionId}\u0000${props.lang}`} {...props} />
    </Suspense>
  );
}
