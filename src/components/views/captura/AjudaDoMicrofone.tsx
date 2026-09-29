import { Cpu, MicOff, RefreshCw } from 'lucide-react';

import type { AjudaDoMic } from '../../../lib/captura/ajudaDoMicrofone';
import { t } from '../../../lib/i18n';
import { Dialogo, fecharDialogoDe } from '../../ui';

/**
 * O MICROFONE NÃO ABRIU — a ajuda com o caminho de volta DAQUELE aparelho (`ajudaDoMicrofone.ts`).
 *
 * Era um toast de 7 s (Privado) ou nada (Rápido: o erro ia só ao console, e a tela seguia em
 * "Ouvindo…"). Agora um diálogo do desenho de sempre: o que houve, os passos numerados (Android:
 * Configurações do site; iPhone: aA ou Ajustes → Safari; Ditado para o reconhecimento de voz) e as
 * saídas — "Tentar de novo" (o toque é um gesto novo: o navegador pode perguntar outra vez) e, quando
 * quem falhou foi o Rápido, "Trocar para Privado" (o nosso modelo, que abre o microfone direto).
 */
export default function AjudaDoMicrofone({
  ajuda,
  aoTentarDeNovo,
  aoTrocarParaPrivado,
  aoFechar,
}: {
  ajuda: AjudaDoMic;
  aoTentarDeNovo: () => void;
  aoTrocarParaPrivado: () => void;
  aoFechar: () => void;
}) {
  return (
    <Dialogo icone={MicOff} tom="warn" titulo={ajuda.titulo} aoFechar={aoFechar}>
      <div className="dlg-corpo pilha" data-testid="ajuda-do-microfone">
        <p>{ajuda.texto}</p>
        {ajuda.passos.length > 0 && (
          <ol className="mut" style={{ fontSize: 13, paddingLeft: 18, listStyle: 'decimal' }}>
            {ajuda.passos.map((p) => (
              <li key={p} style={{ marginTop: 4 }}>
                {p}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="dlg-pe">
        <button type="button" className="btn btn-outline" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
          {t('Fechar')}
        </button>
        {ajuda.trocarParaPrivado && (
          <button type="button" className="btn btn-outline" onClick={aoTrocarParaPrivado}>
            <Cpu aria-hidden /> {t('Trocar para Privado')}
          </button>
        )}
        {ajuda.tentarDeNovo && (
          <button type="button" className="btn btn-solid" onClick={aoTentarDeNovo}>
            <RefreshCw aria-hidden /> {t('Tentar de novo')}
          </button>
        )}
      </div>
    </Dialogo>
  );
}
