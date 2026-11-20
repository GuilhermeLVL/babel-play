import React from 'react';

import { t } from '../../../lib/i18n';

/**
 * "Comprei na Amazon, posso trazer?": ajuda curta. Livro do Kindle tem proteção (DRM) e não abre no Frasy;
 * o Frasy não ensina a tirar essa proteção. Só aponta o que abre: arquivo sem proteção ou de domínio público.
 */
export default function AjudaDoKindle() {
  return (
    <details className="q-cartao lv-ajuda" data-testid="ajuda-kindle">
      <summary>{t('Comprei na Amazon, posso trazer?')}</summary>
      <p>
        {t(
          'Livro comprado no Kindle tem proteção (DRM) e não abre no Frasy: é a Amazon quem controla esse arquivo, e não dá para trazê-lo.',
        )}
      </p>
      <p>
        {t(
          'Abrem aqui os arquivos sem proteção: EPUB ou PDF seus, livros de domínio público e os de lojas que vendem sem proteção.',
        )}
      </p>
      <p>
        {t(
          'Quer ler esse livro aqui? Procure a edição de domínio público no catálogo do Frasy ou em uma das fontes do guia acima, ou uma edição sem proteção (DRM-free) em outra loja.',
        )}
      </p>
    </details>
  );
}
