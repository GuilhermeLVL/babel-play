import { MARCADOR } from '@core/moderacao/legendaSegura';
import { Fragment } from 'react';

import { t } from '../../../../lib/i18n';

/**
 * O MARCADOR DA LEGENDA SEGURA NA TELA (change `legenda-segura-para-menores`): o `•••` que ficou no lugar de um termo
 * sensível vira um `span` com rótulo acessível. O leitor de tela diz "palavra ocultada" e que o reconhecimento pode ter
 * entendido errado, em vez de "ponto ponto ponto". O termo nunca chega à tela.
 */
export function MarcadorOcultado() {
  const rotulo = t('Palavra ocultada: o reconhecimento pode ter entendido errado');
  return (
    <span className="palavra-ocultada" role="img" aria-label={rotulo} title={rotulo} data-testid="palavra-ocultada">
      {MARCADOR}
    </span>
  );
}

/** Um texto com os marcadores trocados por `MarcadorOcultado`. Sem marcador, o texto volta como veio. */
export function TextoComOcultas({ texto }: { texto: string }) {
  if (!texto.includes(MARCADOR)) return <>{texto}</>;
  const partes = texto.split(MARCADOR);
  return (
    <>
      {partes.map((parte, i) => (
        <Fragment key={i}>
          {parte}
          {i < partes.length - 1 && <MarcadorOcultado />}
        </Fragment>
      ))}
    </>
  );
}
