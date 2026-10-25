import { useId, useState } from 'react';

import { t } from '../../lib/i18n';
import { mudarConsentimento } from '../../lib/preferencias';
import { toast } from '../Toast';

/** O evento que avisa os espaços de que a resposta mudou (`detail: { aceito }`). */
export const EVENTO_DO_CONSENTIMENTO_DE_ANUNCIOS = 'babel:consentimento-anuncios';

/**
 * O CONSENTIMENTO DE ANÚNCIOS (spec `anuncios-no-gratis`; Task 4 do estado 3) — uma folha só, com o que é
 * mostrado, que não é personalizado, o que é coletado, e "Aceitar" / "Agora não".
 *
 * Grava `consentimentos.anuncios` com data (`mudarConsentimento`), e "Agora não" também é resposta (fica
 * registrada como `false`): o espaço não pergunta de novo, e a pessoa muda quando quiser em Ajustes →
 * Privacidade. Vale para o perfil protegido também (decisão do dono, 25/10/2026): o menor vê anúncio COMUM, sempre
 * não personalizado e com o tratamento de idade do Google, e responde aqui como todo mundo (LGPD art. 14: o "sim"
 * é só para VER, nunca para personalizar; ver `core/anuncios/politicaDeAnuncio.ts`). O premiado continua só
 * para adultos (a política nega antes de pedir). Abre em
 * dois lugares: Ajustes → Privacidade (`AnunciosNosAjustes`) e o primeiro espaço elegível
 * (`EspacoDeAnuncio`, só com o provedor real e a flag ligada).
 *
 * Texto pela skill `copy-br-etica`: fato e saída, sem pressão e sem culpa.
 */
export default function ConsentimentoDeAnuncios({ aoResponder }: { aoResponder?: (aceito: boolean) => void }) {
  const titulo = useId();
  const [gravando, setGravando] = useState(false);

  const responder = async (aceito: boolean) => {
    setGravando(true);
    const ok = await mudarConsentimento('anuncios', aceito);
    setGravando(false);
    if (!ok) {
      toast.warn(t('Não consegui registrar a sua resposta. Verifique a conexão e tente de novo.'));
      return;
    }
    window.dispatchEvent(new CustomEvent(EVENTO_DO_CONSENTIMENTO_DE_ANUNCIOS, { detail: { aceito } }));
    aoResponder?.(aceito);
  };

  return (
    <section className="q-cartao consentimento-de-anuncios" role="region" aria-labelledby={titulo}>
      <h3 id={titulo}>{t('Anúncios no plano Grátis')}</h3>
      <p>
        {t(
          'Para o plano Grátis continuar grátis, mostramos alguns anúncios em lugares fixos do app, sempre com a marca "Patrocinado". Nunca durante uma gravação, uma rodada de jogo ou o intérprete.',
        )}
      </p>
      <p>
        {t(
          'Os anúncios não são personalizados: não usamos o que você estuda nem o seu histórico para escolhê-los, e o Google recebe a marcação de público infantil.',
        )}
      </p>
      <p>
        <b>{t('O que é coletado')}</b>{' '}
        {t(
          'A rede de anúncios do Google recebe o endereço de internet do seu aparelho, o navegador e o idioma, só para mostrar e contar o anúncio. Não enviamos seu nome, seu e-mail nem o que você estuda.',
        )}
      </p>
      <p>{t('O anúncio com recompensa é só para maiores de 18 anos.')}</p>
      <p>
        {t(
          'Anúncio com recompensa só se você escolher ver. Você pode mudar esta resposta quando quiser em Ajustes → Privacidade, e os planos pagos não têm anúncios.',
        )}
      </p>
      <div className="q-acoes">
        <button type="button" className="q-ctl pri" disabled={gravando} onClick={() => void responder(true)}>
          {t('Aceitar')}
        </button>
        <button type="button" className="q-ctl" disabled={gravando} onClick={() => void responder(false)}>
          {t('Agora não')}
        </button>
      </div>
    </section>
  );
}
