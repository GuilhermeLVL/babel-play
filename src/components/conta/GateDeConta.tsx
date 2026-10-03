/**
 * O SOFT GATE — diálogo contextual que aparece na primeira vez que, sem conta, a pessoa tenta algo
 * que precisa de uma (abrir a biblioteca, importar, usar a IA gerenciada…).
 *
 * É o `Dialogo` do app (a mesma casca de "Sua assinatura", das ofertas e dos demais avisos), nos dois
 * desenhos: o do headset só muda as medidas do `<dialog>` (`questBase.css`), não o componente. O Esc,
 * o fundo inerte e o foco preso são do `<dialog>` nativo.
 *
 * Nunca perde o que está na tela: fecha e a pessoa segue onde estava. As três saídas são as do
 * desenho (D10): entrar · criar conta · continuar sem conta.
 */
import { Lock } from 'lucide-react';

import { edicaoEstatica } from '../../lib/edicaoEstatica';
import { t } from '../../lib/i18n';
import Dialogo from '../ui/Dialogo';

interface GateDeContaProps {
  aberto: boolean;
  /** O que motivou o gate, em linguagem de gente ("Importar do YouTube precisa de conta"). */
  motivo: string;
  onFechar: () => void;
  onEntrar: () => void;
}

export default function GateDeConta({ aberto, motivo, onFechar, onEntrar }: GateDeContaProps) {
  if (!aberto) return null;
  /* Edição estática: o mesmo aviso, com a verdade dela — não há conta; o recurso está na versão
     completa. Uma saída só, fechar. */
  const semServidor = edicaoEstatica();

  return (
    <Dialogo
      icone={Lock}
      titulo={semServidor ? t('Disponível na versão completa') : t('Isto precisa de conta')}
      sub={motivo}
      aoFechar={onFechar}
    >
      <div className="dlg-corpo">
        <p className="mut">
          {semServidor
            ? t('Transcrever, traduzir e jogar continuam livres nesta edição, tudo no seu navegador.')
            : t(
                'Transcrever, traduzir e jogar com a sessão atual continuam livres. O que você já fez neste navegador sobe para a conta quando você entrar.',
              )}
        </p>
      </div>
      <div className="dlg-pe">
        {semServidor ? (
          <button type="button" className="btn btn-solid" data-autofocus onClick={onFechar}>
            {t('Entendi')}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-outline" onClick={onFechar}>
              {t('Continuar sem conta')}
            </button>
            <button type="button" className="btn btn-solid" data-autofocus onClick={onEntrar}>
              {t('Entrar ou criar conta')}
            </button>
          </>
        )}
      </div>
    </Dialogo>
  );
}
