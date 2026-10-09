import { useEffect, useState } from 'react';

import { type Notificacao, notificacoes, ouvirNotificacoes } from '../../lib/notificacoes';
import { usePreferencias } from '../../lib/preferencias';

/**
 * A lista viva da central, já filtrada pelas preferências: o tipo de aviso desligado em Ajustes →
 * Notificações (canal "no app") some do sino e da contagem.
 */
export function useListaDeNotificacoes(): Notificacao[] {
  const [lista, setLista] = useState(notificacoes);
  useEffect(() => ouvirNotificacoes(setLista), []);
  const { avisos } = usePreferencias();
  return lista.filter((n) => n.tipo === 'sessao' || !n.tipo || avisos[n.tipo]?.app !== false);
}
