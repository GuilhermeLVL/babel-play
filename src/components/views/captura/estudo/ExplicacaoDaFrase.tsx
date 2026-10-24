import { lazy, Suspense } from 'react';

import { FLAG_IA_DE_ESTUDO } from '../../../../core/planos';
import { useFlag } from '../../../../lib/flags';
import type { FalaDaExplicacao } from './CorpoDaExplicacao';

const CorpoDaExplicacao = lazy(() => import('./CorpoDaExplicacao'));

/**
 * A SEÇÃO "EXPLICAR ESTA FRASE" (planos v4, etapa 2), na folha da frase do celular e no diálogo do
 * computador. Este arquivo é só a PORTA: com a flag `ia_de_estudo` desligada nada é renderizado e o
 * corpo (e o cliente da API) nem é baixado. A flag só decide se a seção aparece; quem pode explicar é o
 * servidor (plano ou amostra do Grátis).
 */
export default function ExplicacaoDaFrase(props: {
  fala: FalaDaExplicacao;
  /** O idioma da tradução: a explicação é escrita nele. */
  destino: string;
  /** As falas anteriores (≤ 3). */
  contexto?: ReadonlyArray<string>;
  /** Leva à tela de Planos. Ausente no perfil protegido. */
  aoConhecer?: () => void;
}) {
  const ligada = useFlag(FLAG_IA_DE_ESTUDO);
  if (!ligada) return null;
  return (
    <Suspense fallback={null}>
      <CorpoDaExplicacao key={props.fala.texto} {...props} />
    </Suspense>
  );
}
