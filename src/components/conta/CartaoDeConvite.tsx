/**
 * O CONVITE no lugar da tela — para quem está sem conta e abriu algo que precisa de uma.
 *
 * Reusa `Vazio` (título · causa · ação), porque é exatamente isso: um estado em que a tela não
 * tem o que mostrar, dito de um jeito sobre o qual se pode agir. A ação principal leva ao login;
 * a secundária devolve para onde dá para usar sem conta.
 */
import { Lock } from 'lucide-react';

import { edicaoEstatica, urlDoAppCompleto } from '../../lib/edicaoEstatica';
import { t } from '../../lib/i18n';
import { Vazio } from '../ui';
import { CONVITE } from './exigeConta';

interface CartaoDeConviteProps {
  view: string;
  onEntrar: () => void;
  onVoltar: () => void;
}

export default function CartaoDeConvite({ view, onEntrar, onVoltar }: CartaoDeConviteProps) {
  /* EDIÇÃO ESTÁTICA (site sem servidor): não há conta a criar. O cartão diz a verdade — isto existe
     na versão completa — e a única saída é voltar para o que funciona aqui. Nada de botão de login
     que levaria a uma porta inexistente. Com `VITE_URL_APP_COMPLETO` no build, a porta existe — em
     outro endereço: o link para criar a conta lá vira a ação principal, e voltar fica em segundo. */
  if (edicaoEstatica()) {
    const appCompleto = urlDoAppCompleto();
    const voltar = { rotulo: t('Voltar ao início'), aoClicar: onVoltar };
    return (
      <div className="flex-1 flex items-center justify-center p-6" data-testid="cartao-de-convite">
        <Vazio
          icone={<Lock className="w-7 h-7" aria-hidden />}
          titulo={t('Disponível na versão completa')}
          explicacao={t(
            'Esta é a edição de demonstração do Babel Play: roda inteira no seu navegador, sem servidor. Esta parte depende de um servidor, e por isso só existe na versão completa.',
          )}
          acao={appCompleto ? { rotulo: t('Criar conta na versão completa'), href: appCompleto } : voltar}
          acaoSecundaria={appCompleto ? voltar : undefined}
          className="max-w-xl w-full"
        />
      </div>
    );
  }
  const c = CONVITE[view] ?? {
    titulo: 'Esta parte precisa de conta',
    explicacao: 'Crie uma conta para guardar seu progresso.',
  };
  /* As frases da tabela estão no catálogo: a tradução é aqui, no ponto de uso. */
  return (
    <div className="flex-1 flex items-center justify-center p-6" data-testid="cartao-de-convite">
      <Vazio
        icone={<Lock className="w-7 h-7" aria-hidden />}
        titulo={t(c.titulo)}
        explicacao={
          <>
            {t(c.explicacao)}
            <br />
            <span className="text-ink-faint">
              {t('O que você já capturou neste navegador sobe para a conta assim que você entrar.')}
            </span>
          </>
        }
        acao={{ rotulo: t('Entrar ou criar conta'), aoClicar: onEntrar }}
        acaoSecundaria={{ rotulo: t('Continuar sem conta'), aoClicar: onVoltar }}
        className="max-w-xl w-full"
      />
    </div>
  );
}
