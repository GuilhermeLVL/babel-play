/**
 * O CONVITE no lugar da tela — para quem está sem conta e abriu algo que precisa de uma.
 *
 * Reusa `Vazio` (título · causa · ação), porque é exatamente isso: um estado em que a tela não
 * tem o que mostrar, dito de um jeito sobre o qual se pode agir. Os dois botões de todo convite:
 * "Criar conta" (principal, abre a porta no cadastro) e "Já tenho conta" (abre na entrada). Com
 * `onVoltar`, um terceiro, discreto, devolve para onde dá para usar sem conta. `inline` é o convite
 * DENTRO de uma tela (uma seção dos Ajustes), sem ocupar a área inteira.
 *
 * Sem `onEntrar`, os botões pedem a porta por evento (`pedirEntrada`): serve a quem está longe do App.
 */
import { Lock } from 'lucide-react';

import { edicaoEstatica, urlDoAppCompleto } from '../../lib/edicaoEstatica';
import { t } from '../../lib/i18n';
import { type ModoDeEntrada, pedirEntrada } from '../../lib/pedirConta';
import { Vazio } from '../ui';
import { CONVITE } from './exigeConta';

interface CartaoDeConviteProps {
  view: string;
  onEntrar?: (modo: ModoDeEntrada) => void;
  onVoltar?: () => void;
  inline?: boolean;
}

export default function CartaoDeConvite({
  view,
  onEntrar = pedirEntrada,
  onVoltar,
  inline = false,
}: CartaoDeConviteProps) {
  const caixa = inline ? 'flex items-center justify-center py-2' : 'flex-1 flex items-center justify-center p-6';
  /* EDIÇÃO ESTÁTICA (site sem servidor): não há conta a criar. O cartão diz a verdade — isto existe
     na versão completa — e a única saída é voltar para o que funciona aqui. Nada de botão de login
     que levaria a uma porta inexistente. Com `VITE_URL_APP_COMPLETO` no build, a porta existe — em
     outro endereço: o link para criar a conta lá vira a ação principal, e voltar fica em segundo. */
  if (edicaoEstatica()) {
    const appCompleto = urlDoAppCompleto();
    const voltar = onVoltar ? { rotulo: t('Voltar ao início'), aoClicar: onVoltar } : undefined;
    return (
      <div className={caixa} data-testid="cartao-de-convite">
        <Vazio
          icone={<Lock className="w-7 h-7" aria-hidden />}
          titulo={t('Disponível na versão completa')}
          explicacao={t(
            'Esta é a edição de demonstração do Frasy: roda inteira no seu navegador, sem servidor. Esta parte depende de um servidor, e por isso só existe na versão completa.',
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
    <div className={`${caixa} flex-col`} data-testid="cartao-de-convite">
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
        acao={{ rotulo: t('Criar conta'), aoClicar: () => onEntrar('signup') }}
        acaoSecundaria={{ rotulo: t('Já tenho conta'), aoClicar: () => onEntrar('login') }}
        className="max-w-xl w-full"
      />
      {onVoltar && (
        <button
          type="button"
          className="mt-1 min-h-[44px] px-3 text-[12.5px] text-ink-muted underline underline-offset-2 hover:text-ink"
          onClick={onVoltar}
        >
          {t('Continuar sem conta')}
        </button>
      )}
    </div>
  );
}
