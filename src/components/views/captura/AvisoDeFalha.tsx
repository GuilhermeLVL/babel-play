import { TriangleAlert } from 'lucide-react';

import type { TipoDeAcao } from '../../../core/falhas/mensagemDeFalha';
import type { FalhaNaTela } from '../../../lib/falhas/falhaNaTela';
import { t } from '../../../lib/i18n';

/**
 * A FALHA QUE IMPEDIU A CAPTURA DE COMEÇAR, junto ao Iniciar (DISP-04, change `modelos-confiaveis-e-offline`).
 *
 * Antes, o erro era um toast que sumia em 7 s e a tela voltava a "Pronto para legendar" sem rastro. Este
 * aviso fica até a PRÓXIMA tentativa (quem o tira é o início seguinte, em `fontesDeAudio.ts`, ou o "Fechar"),
 * em pt-BR e com a ação certa. O detalhe técnico só aparece em dev e no self-host (`falhaNaTela.ts`).
 */
export default function AvisoDeFalha({
  falha,
  aoAgir,
  aoFechar,
}: {
  falha: FalhaNaTela;
  aoAgir: (acao: TipoDeAcao) => void;
  aoFechar: () => void;
}) {
  return (
    <div
      className="aviso-info warn"
      role="alert"
      data-testid="aviso-de-falha"
      data-falha={falha.tipo}
      style={{ margin: '10px 16px 0' }}
    >
      <TriangleAlert aria-hidden />
      <span style={{ flex: 1 }}>
        {t(falha.texto)}
        {falha.detalhe && <small style={{ display: 'block', opacity: 0.75 }}>{falha.detalhe}</small>}
      </span>
      <button type="button" className="btn btn-solid peq" onClick={() => aoAgir(falha.acao.tipo)}>
        {t(falha.acao.rotulo)}
      </button>
      <button type="button" className="btn btn-outline peq" onClick={aoFechar}>
        {t('Fechar')}
      </button>
    </div>
  );
}
