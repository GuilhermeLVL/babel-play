import { useState } from 'react';

import { noCelular } from '../../lib/dispositivo/telaNovaDoQuest';
import EspacoDeAnuncio from './EspacoDeAnuncio';

/**
 * A FAIXA ÂNCORA DO CELULAR (espaço `ancora`; protótipo `plantarAncora`, `anuncios-no-gratis-src/anuncios.js:280-317`)
 * — o encaixe. Só no celular, só nas telas de descanso que a montam (Estatísticas e a Biblioteca sem o "Abrir"
 * preso ao pé); nunca na captura, no intérprete ou na rodada (a política nega e nenhuma delas a monta).
 *
 * Tem "×": fechada, não volta nesta sessão (`sessionStorage`), como no nível Médios do protótipo. Quem desenha a
 * faixa (e o respiro do tamanho dela no fim da tela, para ela nunca cobrir a última linha) é o provedor.
 */
const CHAVE_DA_ANCORA_FECHADA = 'babel.anuncios.ancoraFechada';

function fechadaNestaSessao(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_DA_ANCORA_FECHADA) === '1';
  } catch {
    return false;
  }
}

export default function AncoraNoCelular() {
  const [fechada, setFechada] = useState(fechadaNestaSessao);
  if (fechada || !noCelular()) return null;
  return (
    <EspacoDeAnuncio
      espaco="ancora"
      formato="nativo"
      aoFechar={() => {
        try {
          sessionStorage.setItem(CHAVE_DA_ANCORA_FECHADA, '1');
        } catch {
          /* sem storage: fica fechada enquanto a tela estiver aberta */
        }
        setFechada(true);
      }}
    />
  );
}
