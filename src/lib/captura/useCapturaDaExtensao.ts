/**
 * O GANCHO DA CAPTURA PELA EXTENSÃO (openspec `captura-em-um-clique`, 3.2 e 3.3).
 *
 * Só liga o receptor (`daExtensao.ts`) quando a flag `captura_da_extensao` está ligada E a página abriu com
 * `?fonte=extensao` (lido no boot, `fonteDaAbertura.ts`, porque o roteador apaga a busca). Fora disso o gancho não faz nada: o módulo do receptor nem é baixado (import sob demanda), nenhum
 * ouvinte de `message` existe e o estado devolvido é `null` (a tela não mostra nada). A extensão pede o app com esse
 * parâmetro; quem abre `/capturar` do jeito de sempre não paga nada.
 *
 * O receptor fica numa ref para a captura (`fontesDeAudio.ts`) conferir, ao tocar em Iniciar, se há extensão conectada;
 * se não houver, a captura segue pelo `getDisplayMedia` como hoje.
 */
import { type RefObject, useEffect, useRef, useState } from 'react';

import { FLAG_CAPTURA_DA_EXTENSAO } from '../../core/planos';
import { useFlag } from '../flags';
import type { EstadoDaExtensao, ReceptorDaExtensao } from './daExtensao';
import { ABERTA_PELA_EXTENSAO } from './fonteDaAbertura';

export interface CapturaDaExtensao {
  /** `null` = o recurso não está ativo (sem flag ou sem `?fonte=extensao`): a tela não mostra nada. */
  estado: EstadoDaExtensao | null;
  receptorRef: RefObject<ReceptorDaExtensao | null>;
}

export function useCapturaDaExtensao(): CapturaDaExtensao {
  const flagLigadaAgora = useFlag(FLAG_CAPTURA_DA_EXTENSAO);
  const ativa = flagLigadaAgora && ABERTA_PELA_EXTENSAO;
  const [estado, setEstado] = useState<EstadoDaExtensao | null>(null);
  const receptorRef = useRef<ReceptorDaExtensao | null>(null);

  useEffect(() => {
    if (!ativa) return;
    let cancelado = false;
    let receptor: ReceptorDaExtensao | null = null;
    void import('./daExtensao').then(({ criarReceptor }) => {
      if (cancelado) return;
      receptor = criarReceptor({ janela: window, aoMudarEstado: setEstado });
      receptorRef.current = receptor;
      setEstado(receptor.estado());
      receptor.conectar();
    });
    return () => {
      cancelado = true;
      receptor?.parar();
      receptorRef.current = null;
      setEstado(null);
    };
  }, [ativa]);

  return { estado: ativa ? estado : null, receptorRef };
}
