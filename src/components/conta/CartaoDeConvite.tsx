/**
 * O CONVITE no lugar da tela — para quem está sem conta e abriu algo que precisa de uma.
 *
 * Reusa `Vazio` (título · causa · ação), porque é exatamente isso: um estado em que a tela não
 * tem o que mostrar, dito de um jeito sobre o qual se pode agir. A ação principal leva ao login;
 * a secundária devolve para onde dá para usar sem conta.
 */
import { Lock } from 'lucide-react';
import { Vazio } from '../ui';
import { CONVITE } from './exigeConta';

interface CartaoDeConviteProps {
  view: string;
  onEntrar: () => void;
  onVoltar: () => void;
}

export default function CartaoDeConvite({ view, onEntrar, onVoltar }: CartaoDeConviteProps) {
  const c = CONVITE[view] ?? { titulo: 'Esta parte precisa de conta', explicacao: 'Crie uma conta para guardar seu progresso.' };
  return (
    <div className="flex-1 flex items-center justify-center p-6" data-testid="cartao-de-convite">
      <Vazio
        icone={<Lock className="w-7 h-7" aria-hidden />}
        titulo={c.titulo}
        explicacao={
          <>
            {c.explicacao}
            <br />
            <span className="text-ink-faint">O que você já capturou neste navegador sobe para a conta assim que você entrar.</span>
          </>
        }
        acao={{ rotulo: 'Entrar ou criar conta', aoClicar: onEntrar }}
        acaoSecundaria={{ rotulo: 'Continuar sem conta', aoClicar: onVoltar }}
        className="max-w-xl w-full"
      />
    </div>
  );
}
