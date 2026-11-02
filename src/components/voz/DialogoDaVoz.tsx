import { AudioLines } from 'lucide-react';

import { t } from '../../lib/i18n';
import { useLangConfig } from '../../lib/langConfig';
import { Dialogo } from '../ui';
import PainelDaVoz from '../views/ajustes/PainelDaVoz';

/**
 * A VOZ, DE QUALQUER TELA — o que o botão "Voz" do trilho abre. O mesmo painel de Ajustes → Idiomas
 * (`PainelDaVoz`): uma linha por idioma com a voz em uso, e o seletor com as amostras ao tocar.
 * Chega por `import()`: só quem abre baixa o painel e o seletor.
 */
export default function DialogoDaVoz({ aoFechar }: { aoFechar: () => void }) {
  const idiomas = useLangConfig();
  return (
    <Dialogo
      icone={AudioLines}
      titulo={t('Voz de leitura')}
      sub={t('Escolha a voz de cada idioma. Ela vale no narrador, no intérprete, nas palavras e nos jogos.')}
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo" data-testid="dialogo-da-voz">
        <PainelDaVoz estudando={idiomas.studying} meu={idiomas.mine} semCabecalho />
      </div>
    </Dialogo>
  );
}
