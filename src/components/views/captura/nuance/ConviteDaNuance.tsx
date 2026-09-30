import { Lock, Sparkles } from 'lucide-react';

import { t } from '../../../../lib/i18n';

/**
 * O QUE O GRÁTIS VÊ NO LUGAR DE UM RECURSO DA TRADUÇÃO NUANCE (Fase D) — decisão do dono: o recurso
 * aparece (com cadeado, nunca escondido), o texto é POSITIVO e diz o que o Grátis JÁ tem ("Tradução
 * rápida ao vivo"), e nada de vender "% de qualidade".
 *
 * O CONVITE (`aoConhecer`) é oferta PROMOCIONAL: quem chama não o passa ao perfil protegido (menor, ou
 * idade não declarada no modo público) — ele vê o cadeado e o texto, sem botão de venda. Até o teste
 * de 14 dias existir (C6), o convite leva à tela de Planos.
 */
export default function ConviteDaNuance({ texto, aoConhecer }: { texto: string; aoConhecer?: () => void }) {
  return (
    <div className="nuance-convite" data-testid="convite-da-nuance">
      <p className="folha-def">
        <Lock aria-hidden style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />
        {texto}
      </p>
      <p className="folha-status">{t('Sua legenda já usa a Tradução rápida ao vivo, sem esperar.')}</p>
      {aoConhecer && (
        <button type="button" className="folha-acao" onClick={aoConhecer}>
          <Sparkles aria-hidden /> {t('Conhecer o Premium')}
        </button>
      )}
    </div>
  );
}
