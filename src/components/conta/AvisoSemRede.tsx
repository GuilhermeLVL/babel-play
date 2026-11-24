import { WifiOff } from 'lucide-react';
import { useState } from 'react';

import { useEstadoSemRede } from '../../lib/captura/useEstadoSemRede';
import { t } from '../../lib/i18n';
import FaixaDeAvisoDoQuest from './quest/FaixaDeAvisoDoQuest';
import { resumoSemRede } from './textosSemRede';

/**
 * AVISO DE SEM INTERNET (change `modo-offline-declarado`): só enquanto `navigator.onLine` é falso, uma faixa
 * que diz o que funciona e o que espera a rede. Sem menu novo; a lista completa está em "Uso sem internet",
 * no Diagnóstico. DISPENSAR vale para a sessão do navegador (`sessionStorage`).
 */
const CHAVE_DA_DISPENSA = 'babel.aviso.sem-rede.dispensado';

function dispensadoNestaSessao(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_DA_DISPENSA) === '1';
  } catch {
    return false;
  }
}

export default function AvisoSemRede() {
  const [dispensado, setDispensado] = useState(dispensadoNestaSessao);
  const { semRede, capacidades } = useEstadoSemRede(!dispensado);
  if (dispensado || !semRede || !capacidades) return null;

  const dispensar = () => {
    try {
      sessionStorage.setItem(CHAVE_DA_DISPENSA, '1');
    } catch {
      /* sem armazenamento, some só até recarregar */
    }
    setDispensado(true);
  };

  return (
    <FaixaDeAvisoDoQuest
      icone={WifiOff}
      noTopo
      testId="aviso-sem-rede"
      texto={resumoSemRede(capacidades)}
      acoes={[]}
      aoDispensar={dispensar}
      rotuloDeDispensar={t('Dispensar aviso')}
    />
  );
}
