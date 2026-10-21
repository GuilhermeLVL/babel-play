import { useEffect, useState, useSyncExternalStore } from 'react';

import { podeMostrar } from '../../../core/anuncios/politicaDeAnuncio';
import { demonstracaoDeAnuncios, montarPedidoDeAnuncio } from '../../../lib/anuncios/pedido';
import { assinarProvedorDeAnuncios, provedorDeAnuncios } from '../../../lib/anuncios/provedor';
import { consultarAlivio } from '../../../lib/nuvemDeAlivio/consulta';
import EspacoDeAnuncio from '../../anuncios/EspacoDeAnuncio';

const semProvedor = () => null;

/**
 * "GANHE 30 MIN DE NUVEM" NA CAPTURA (espaço `nuvem-30`, premiado; protótipo `PLANTIO.aovivo`,
 * `anuncios-no-gratis-src/anuncios.js:175-182`) — o encaixe. Fica nos avisos da captura PARADA (quem monta é
 * `LiveCapture`, só sem gravação); com a captura rodando a política nega de qualquer jeito.
 *
 * A recompensa soma 30 min à franquia da NUVEM DE ALÍVIO do mês (`server/lib/nuvemDeAlivio.ts`), então o cartão
 * só aparece quando o alívio está DISPONÍVEL para esta conta (`consultarAlivio()`: flag, Grátis, conta, pool e a
 * nuvem global abertos). Sem isso não há o que ganhar, e a spec manda a oferta sumir ("Amostra de nuvem com teto
 * global"). Na DEMONSTRAÇÃO o lugar aparece sem perguntar ao servidor: é para ver onde ele fica.
 *
 * Estado de fábrica: sem provedor, nada, e nenhuma pergunta à rede.
 */
export default function NuvemPremiadaNaCaptura() {
  const provedor = useSyncExternalStore(assinarProvedorDeAnuncios, provedorDeAnuncios, semProvedor);
  const [disponivel, setDisponivel] = useState(false);
  useEffect(() => {
    if (!provedor) return;
    if (demonstracaoDeAnuncios()) {
      setDisponivel(true);
      return;
    }
    /* A política já diz não (plano, perfil, consentimento…): nem se pergunta ao servidor. */
    if (!podeMostrar(montarPedidoDeAnuncio('nuvem-30', 'premiado')).pode) return;
    let vivo = true;
    consultarAlivio().then(
      (a) => vivo && setDisponivel(!!a?.disponivel),
      () => undefined,
    );
    return () => {
      vivo = false;
    };
  }, [provedor]);
  if (!disponivel) return null;
  return <EspacoDeAnuncio espaco="nuvem-30" formato="premiado" />;
}
