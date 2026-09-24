import { Cloud } from 'lucide-react';

import { useConsentimentoDeNuvem } from '../lib/consentimentoDeNuvem';
import { getEntitlements } from '../lib/entitlements';
import { t } from '../lib/i18n';
import { toast } from './Toast';

/**
 * POR QUE A NUVEM DO SEU PLANO NÃO ESTÁ SENDO USADA — e o botão para autorizar ali mesmo.
 *
 * Sem o consentimento de nuvem (Ajustes → Privacidade), o gateway pula a tradução, a transcrição e o
 * tutor de nuvem (Fase 2 do lançamento). Para quem PAGA por eles isso pareceria defeito do plano;
 * esta faixa diz o motivo e grava o "sim" com data, do mesmo jeito que Ajustes grava. Para quem não
 * tem nuvem no plano, não aparece: rodar no aparelho é o produto, não um aviso.
 */
export default function AvisoDeNuvemSemConsentimento() {
  const { consentiu, autorizar } = useConsentimentoDeNuvem();
  const e = getEntitlements();
  if (consentiu || !(e.managedCloudLlm || e.managedCloudStt)) return null;
  return (
    <div className="aviso-info" role="status" style={{ marginBottom: 12 }}>
      <Cloud aria-hidden />
      <span style={{ flex: 1 }}>
        {t(
          'Seu plano inclui IA de nuvem, mas ela está desligada porque você ainda não autorizou. Enquanto isso, tudo roda no seu aparelho.',
        )}
      </span>
      <button
        type="button"
        className="btn btn-outline peq"
        onClick={() => {
          void autorizar().then((ok) =>
            ok ? toast.ok(t('Autorização registrada')) : toast.warn(t('Não consegui registrar a autorização agora.')),
          );
        }}
      >
        {t('Autorizar IA de nuvem')}
      </button>
    </div>
  );
}
