import { t } from '../../../lib/i18n';

/**
 * O RÓTULO "Voz sintetizada" (AI Act art. 50; spec de audiolivros G5): aparece sempre que a frase sai do áudio
 * pré-gerado do catálogo. Não se dispensa: é informação, não aviso. `role="status"` para o leitor de tela anunciar uma
 * vez quando o áudio gravado começa (a barra não muda a cada frase).
 */
export default function ChipVozSintetizada() {
  const rotulo = t('Voz sintetizada');
  return (
    <span className="leitor-chip-voz-sintetizada" role="status" aria-label={rotulo} data-testid="chip-voz-sintetizada">
      {rotulo}
    </span>
  );
}
