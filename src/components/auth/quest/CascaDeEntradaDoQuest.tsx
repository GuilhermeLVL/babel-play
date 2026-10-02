import '../../../styles/questEntrada.css';

import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import { t } from '../../../lib/i18n';
import { T } from '../../../lib/T';
import type { AuthHero } from '../AuthShell';

/**
 * A CASCA DAS TELAS DE ANTES DO APP NO META QUEST: entrar, criar conta, recuperar e redefinir a senha,
 * o segundo fator, a pergunta de idade e o aceite do responsável.
 *
 * A mesma divisão de `AuthShell` (a marca de um lado, o formulário do outro), nas medidas do headset.
 * Estas telas montam ANTES do trilho, que é quem traz `quest.css`: o CSS delas é `questEntrada.css`,
 * com as próprias peças (`.qen-*`). `semMarca` dá uma coluna só, com o conteúdo num cartão ao centro
 * (a pergunta de idade e o aceite do responsável, que nas telas de sempre também não têm o painel).
 *
 * Só apresentação: quem monta a casca é a tela de sempre, com o estado e os efeitos dela.
 */
export default function CascaDeEntradaDoQuest({
  hero,
  semMarca = false,
  testId = 'entrada-do-quest',
  children,
}: {
  hero?: AuthHero;
  semMarca?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div className={semMarca ? 'qen qen-uma' : 'qen'} data-testid={testId}>
      {!semMarca && (
        <aside className="qen-marca">
          <p className="qen-logo">Babel Play</p>
          <div className="qen-heroi">
            <h2>{hero?.title ?? <T txt="Capture.<br>Traduza.<br>Aprenda." />}</h2>
            <p className="qen-frase">
              {hero?.subtitle ?? t('Vídeos, reuniões, podcasts: cada conversa vira prática de idioma, no seu ritmo.')}
            </p>
          </div>
          <p className="qen-pe">
            <ShieldCheck aria-hidden /> {t('Sua conta, seus dados, isolados e seguros.')}
          </p>
        </aside>
      )}
      <main className="qen-miolo">
        <div className="qen-caixa">{children}</div>
      </main>
    </div>
  );
}
