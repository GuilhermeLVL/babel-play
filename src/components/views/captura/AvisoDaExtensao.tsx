import { Info } from 'lucide-react';

import type { EstadoDaExtensao } from '../../../lib/captura/daExtensao';
import { t } from '../../../lib/i18n';

/**
 * O ESTADO DA EXTENSÃO NA CAPTURA (openspec `captura-em-um-clique` 3.2; flag `captura_da_extensao`, página aberta em
 * `?fonte=extensao`). "Extensão conectada" quando ela respondeu; "Sem extensão: usar o seletor" quando não respondeu (a
 * captura cai no seletor do navegador, o `getDisplayMedia`, como sempre). Texto fixo: nada que a extensão mande é mostrado.
 */
export default function AvisoDaExtensao({ estado }: { estado: EstadoDaExtensao }) {
  const texto =
    estado === 'conectada'
      ? t('Extensão conectada. O som da aba escolhida na extensão entra direto, sem o seletor do navegador.')
      : estado === 'aguardando'
        ? t('Procurando a extensão do Frasy…')
        : estado === 'ausente'
          ? t('Sem extensão: usar o seletor. O navegador vai perguntar qual aba compartilhar.')
          : t('A extensão parou de enviar o som. Toque no ícone dela para retomar, ou use o seletor do navegador.');
  return (
    <div className="aviso-info" role="status" data-testid="extensao-estado" style={{ margin: '10px 16px 0' }}>
      <Info aria-hidden />
      <span>{texto}</span>
    </div>
  );
}
