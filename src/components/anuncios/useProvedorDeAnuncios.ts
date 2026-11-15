/// <reference types="vite/client" />
import { useEffect, useSyncExternalStore } from 'react';

import { FLAG_ANUNCIOS } from '../../core/anuncios/politicaDeAnuncio';
import { ligarProvedorDeAnuncios } from '../../lib/anuncios/ligar';
import { assinarProvedorDeAnuncios, type ProvedorDeAnuncios, provedorDeAnuncios } from '../../lib/anuncios/provedor';
import { flagLigada } from '../../lib/flagsCache';
import { ligarDemonstracaoDeAnuncios } from './demonstracao/ligar';

/** O evento que `lib/flags.ts` dispara quando as flags mudam. */
const EVENTO_DAS_FLAGS = 'babel_flags_changed';
const semProvedor = () => null;

/**
 * O PROVEDOR DE ANÚNCIOS REGISTRADO, e o pedido para registrá-lo. Todo encaixe que pergunta pelo provedor
 * (`EspacoDeAnuncio`, `NuvemPremiadaNaCaptura`, o intersticial) usa ESTE gancho: antes, só o `EspacoDeAnuncio`
 * registrava, e um encaixe que esperava o provedor para montar o espaço (o `nuvem-30`, na captura aberta direto pelo
 * endereço, sem nenhum outro espaço antes) nunca o via chegar.
 *
 * O real só é pedido com a flag `anuncios` LIGADA (desligada, nem o módulo nem o CSS dele são baixados) e num build
 * com a origem de anúncios. A flag é lida do CACHE (`flagsCache`, sem pedir à rede: o estado de fábrica não pode pedir
 * nada a mais) e de novo quando as flags mudam. A demonstração, só em desenvolvimento e no build de demonstração: a
 * condição é a mesma, LITERAL, de `demonstracao/ligar.ts` (R38). Registrar não mostra nada: a política decide.
 */
export function useProvedorDeAnuncios(): ProvedorDeAnuncios | null {
  const provedor = useSyncExternalStore(assinarProvedorDeAnuncios, provedorDeAnuncios, semProvedor);
  useEffect(() => {
    const tentar = () => {
      void (flagLigada(FLAG_ANUNCIOS) ? ligarProvedorDeAnuncios() : Promise.resolve(false)).then((ligou) => {
        if (!ligou && (import.meta.env.DEV || import.meta.env.VITE_ANUNCIOS_DEMONSTRACAO === '1'))
          void ligarDemonstracaoDeAnuncios();
      });
    };
    tentar();
    window.addEventListener(EVENTO_DAS_FLAGS, tentar);
    return () => window.removeEventListener(EVENTO_DAS_FLAGS, tentar);
  }, []);
  return provedor;
}
