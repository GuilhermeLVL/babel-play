import { Download } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { idiomaDoKitten } from '../../core/voz/kitten';
import { t } from '../../lib/i18n';
import {
  aoMudarKitten,
  apagarVozKitten,
  baixarVozKitten,
  cancelarDownloadDoKitten,
  downloadDoKitten,
  estadoDoKitten,
  kittenOferecido,
  modeloKittenPronto,
  raizDoKitten,
  verificarArmazenamentoDoKitten,
} from '../../lib/voz/vozKitten';
import { Dialogo } from '../ui';

const mb = (bytes: number) => Math.round(bytes / 1_000_000);

/**
 * A VOZ NATURAL DO KITTEN dentro do `SeletorDeVoz` (flag `voz_kitten`): o tamanho dito ANTES de baixar, baixar (com
 * confirmação acima do teto do perfil), progresso, cancelar e apagar. Nada é baixado sem o toque da pessoa. Sem a flag,
 * sem a raiz dos pesos ou fora dos idiomas do Kitten, não desenha nada.
 */
export default function VozKittenNoSeletor({ idioma, aoFicarPronta }: { idioma: string; aoFicarPronta: () => void }) {
  const estado = useSyncExternalStore(aoMudarKitten, estadoDoKitten);
  const [confirmar, setConfirmar] = useState(false);
  useEffect(() => void verificarArmazenamentoDoKitten(), []);
  const base = idiomaDoKitten(idioma);
  if (!base || !raizDoKitten() || !kittenOferecido()) return null;
  const pronta = modeloKittenPronto(base);
  const { mb: tamanho, confirmar: pedeConfirmar } = downloadDoKitten(base);

  const baixar = async () => {
    if (await baixarVozKitten(base)) aoFicarPronta();
  };

  if (estado.fase === 'baixando' && estado.idioma === base) {
    const total = estado.total || tamanho * 1_000_000;
    return (
      <div className="voz-no-aparelho" data-testid="voz-kitten" data-estado="baixando">
        <progress value={estado.recebidos} max={total} aria-label={t('Baixando a voz natural')} />
        <p className="q-aju-nota" role="status">
          {t('Baixando: {feito} de {total} MB.', { feito: mb(estado.recebidos), total: mb(total) })}
        </p>
        <button type="button" className="btn btn-outline" onClick={cancelarDownloadDoKitten}>
          {t('Cancelar')}
        </button>
      </div>
    );
  }
  if (pronta) {
    return (
      <div className="voz-no-aparelho" data-testid="voz-kitten" data-estado="pronta">
        <p className="q-aju-nota">{t('Voz natural pronta neste aparelho.')}</p>
        <button type="button" className="btn btn-outline" onClick={() => void apagarVozKitten()}>
          {t('Apagar a voz natural')}
        </button>
      </div>
    );
  }
  return (
    <div className="voz-no-aparelho" data-testid="voz-kitten" data-estado="baixar">
      <button
        type="button"
        className="btn btn-outline"
        data-testid="baixar-voz-kitten"
        disabled={estado.fase === 'baixando'}
        onClick={() => (pedeConfirmar ? setConfirmar(true) : void baixar())}
      >
        {t('Baixar ({mb} MB)', { mb: tamanho })}
      </button>
      {estado.fase === 'erro' && (
        <p className="q-aju-nota" role="status">
          {t('Não deu para baixar agora. Você pode tentar de novo: o que já veio fica guardado.')}
        </p>
      )}
      {confirmar && (
        <Dialogo
          icone={Download}
          titulo={t('Baixar a voz natural?')}
          sub={t('São cerca de {mb} MB. Se estiver nos dados móveis, talvez prefira esperar o Wi-Fi.', { mb: tamanho })}
          largura=""
          aoFechar={() => setConfirmar(false)}
        >
          <div className="dlg-pe">
            <button type="button" className="btn btn-outline" data-autofocus onClick={() => setConfirmar(false)}>
              {t('Agora não')}
            </button>
            <button
              type="button"
              className="btn btn-solid"
              onClick={() => {
                setConfirmar(false);
                void baixar();
              }}
            >
              {t('Baixar')}
            </button>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
