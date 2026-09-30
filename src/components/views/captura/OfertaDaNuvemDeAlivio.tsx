import { Cloud } from 'lucide-react';
import { useState } from 'react';

import type { MotivoDaOfertaDeAlivio } from '../../../core/nuvemDeAlivio';
import { useConsentimentoDeNuvem } from '../../../lib/consentimentoDeNuvem';
import { t } from '../../../lib/i18n';
import { aceitarAlivio, dispensarAlivio } from '../../../lib/nuvemDeAlivio/estado';
import { duracaoLegivel } from '../../../lib/uso';
import { toast } from '../../Toast';

/**
 * A NUVEM GRÁTIS PARA APARELHO FRACO (A10 do plano "Grátis sem travar"): 3 h/mês de transcrição na
 * nuvem para a conta Grátis cujo aparelho não aguenta o modelo local. A captura só monta esta faixa
 * quando o aparelho pede (perfil leve, sem GPU real, ou o regulador no chão da escada/travamento) e o
 * servidor diz que a franquia está disponível (`lib/nuvemDeAlivio/consulta.ts`).
 *
 * É ALÍVIO, NÃO VENDA: o texto diz o que acontece com o áudio e quanto resta, e mais nada — sem
 * plano, sem preço. O toque grava o consentimento de nuvem pelo mecanismo de sempre (Ajustes →
 * Privacidade, com data) quando ele ainda não foi dado; só então o alívio é aceito, e vale para esta
 * aba. "Agora não" some com a oferta até a próxima sessão. Carregada por `lazy()`: a faixa só existe
 * no aparelho que precisa dela.
 */
export default function OfertaDaNuvemDeAlivio({
  motivo,
  restanteSegundos,
  aoAceitar,
  aoFechar,
}: {
  motivo: MotivoDaOfertaDeAlivio;
  restanteSegundos: number;
  aoAceitar: () => void;
  aoFechar: () => void;
}) {
  const { consentiu, autorizar } = useConsentimentoDeNuvem();
  const [ligando, setLigando] = useState(false);

  const usar = async () => {
    setLigando(true);
    try {
      if (!consentiu && !(await autorizar())) {
        toast.warn(t('Não consegui registrar a autorização agora.'));
        return;
      }
      aceitarAlivio();
      toast.ok(t('Nuvem grátis ligada nesta sessão'));
      aoAceitar();
    } finally {
      setLigando(false);
    }
  };

  return (
    <div className="aviso-info" role="status" data-testid="oferta-da-nuvem-de-alivio" style={{ marginBottom: 12 }}>
      <Cloud aria-hidden />
      <span style={{ flex: 1 }}>
        {motivo === 'travamento'
          ? t('O aparelho não está dando conta da legenda.')
          : t('Este aparelho pode ficar lento com a legenda feita nele.')}{' '}
        {t('Com a nuvem grátis, o áudio das falas é transcrito no servidor e o aparelho fica leve.')}
      </span>
      <button type="button" className="btn btn-solid peq" disabled={ligando} onClick={() => void usar()}>
        {t('Usar a nuvem grátis (restam {tempo})', { tempo: duracaoLegivel(restanteSegundos) })}
      </button>
      <button
        type="button"
        className="btn btn-outline peq"
        onClick={() => {
          dispensarAlivio();
          aoFechar();
        }}
      >
        {t('Agora não')}
      </button>
    </div>
  );
}
