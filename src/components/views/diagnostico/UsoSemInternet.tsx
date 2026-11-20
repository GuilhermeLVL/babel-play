import { useState } from 'react';

import { t } from '../../../lib/i18n';
import { desligarServiceWorker, swControlando } from '../../../lib/registrarSw';
import { toast } from '../../Toast';

/**
 * USO SEM INTERNET, no Diagnóstico (change `modelos-confiaveis-e-offline`, 4.4): diz se o app já abre sem rede
 * neste navegador (o service worker controla a página) e dá a SAÍDA DE EMERGÊNCIA — desligar o modo offline aqui
 * (desregistra o SW e apaga os caches dele; os modelos baixados ficam). O mesmo que `?sw=desligar` na URL.
 */
export default function UsoSemInternet() {
  const [ativo, setAtivo] = useState(swControlando);
  const [ocupado, setOcupado] = useState(false);
  const desligar = async () => {
    setOcupado(true);
    try {
      await desligarServiceWorker();
      setAtivo(false);
      toast.ok(t('Modo offline desligado neste navegador. Ele volta na próxima abertura do app.'));
    } catch {
      toast.warn(t('Não deu para desligar o modo offline agora.'));
    } finally {
      setOcupado(false);
    }
  };
  return (
    <section className="q-secao" data-testid="diagnostico-offline">
      <header>
        <div>
          <h2>{t('Uso sem internet')}</h2>
        </div>
      </header>
      <p>
        {ativo
          ? t('Este navegador já abre o app sem internet.')
          : t('O app ainda não abre sem internet neste navegador.')}
      </p>
      {ativo && (
        <button type="button" className="q-ctl" disabled={ocupado} onClick={() => void desligar()}>
          {t('Desligar o modo offline neste navegador')}
        </button>
      )}
    </section>
  );
}
