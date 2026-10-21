import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

import { podeMostrar } from '../../core/anuncios/politicaDeAnuncio';
import { montarPedidoDeAnuncio } from '../../lib/anuncios/pedido';
import { provedorDeAnuncios } from '../../lib/anuncios/provedor';
import EspacoDeAnuncio from './EspacoDeAnuncio';

/**
 * O INTERSTICIAL ENTRE RODADAS (espaço `intersticial`; protótipo `abrirIntersticial`/`mostrar`,
 * `anuncios-no-gratis-src/anuncios.js:633-728`) — o encaixe.
 *
 * Ele fica ENTRE duas rodadas: quem encaixa (`FimDaRodada`) passa por `entre(seguir)` a ação que leva à
 * próxima ("Próximo jogo", "Jogar de novo"). Se a política deixa e há provedor, o anúncio abre por cima e a
 * ação só acontece quando a pessoa o fecha ("Continuar", "×", Esc ou o toque fora); senão, a ação acontece
 * na hora, como se o espaço não existisse. Nunca no meio de uma rodada, da captura ou do intérprete (a
 * política nega: "tela ocupada"), e no máximo um a cada cinco minutos: quem grava a hora em que ele
 * apareceu é `EspacoDeAnuncio` (`babel.anuncios.ultimoIntersticial`), e a política a lê.
 *
 * Nunca prende a pessoa: se o provedor não desenhou nada (negou, não veio), ela segue no mesmo quadro.
 */

/** O intersticial pode abrir AGORA? Mesma pergunta que `EspacoDeAnuncio` faz, feita antes de segurar a ação. */
export function intersticialCabe(): boolean {
  const provedor = provedorDeAnuncios();
  if (!provedor || provedor.disponivel?.() === false) return false;
  return podeMostrar(montarPedidoDeAnuncio('intersticial', 'intersticial')).pode;
}

export function useIntersticial(): { entre: (seguir: () => void) => void; tela: ReactNode } {
  const [pendente, setPendente] = useState<{ seguir: () => void } | null>(null);
  const caixa = useRef<HTMLSpanElement>(null);
  /* A ação segurada mora num ref: fechar duas vezes (o "×" e o Esc) não a roda duas vezes. */
  const segurada = useRef<(() => void) | null>(null);
  const [fechar] = useState(() => () => {
    const seguir = segurada.current;
    if (!seguir) return;
    segurada.current = null;
    setPendente(null);
    seguir();
  });

  /* O provedor não desenhou nada: a pessoa segue sem esperar. */
  useLayoutEffect(() => {
    if (pendente && caixa.current && !caixa.current.firstChild) fechar();
  }, [pendente, fechar]);

  const entre = (seguir: () => void) => {
    if (segurada.current) return;
    if (!intersticialCabe()) {
      seguir();
      return;
    }
    segurada.current = seguir;
    setPendente({ seguir });
  };

  const tela = pendente ? (
    <span ref={caixa} style={{ display: 'contents' }}>
      <EspacoDeAnuncio espaco="intersticial" formato="intersticial" aoFechar={fechar} />
    </span>
  ) : null;
  return { entre, tela };
}
