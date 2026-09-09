import { useEffect, useState } from 'react';

import { anonimoAceito, motivoDoGate } from '../../components/conta/exigeConta';
import { EVENTO_EXIGE_CONTA } from '../../data/efemero/servidor';
import { temDadosLocais } from '../../data/efemero/store';
import { aoMudarIdentidade,estaAnonimo } from '../identidade';

export interface EstadoDoGateDeConta {
  anonimo: boolean;
  semContaAceito: boolean;
  setSemContaAceito: (v: boolean) => void;
  pedindoLogin: boolean;
  setPedindoLogin: (v: boolean) => void;
  gate: string | null;
  migracao: boolean;
  setMigracao: (v: boolean) => void;
  fecharGate: () => void;
}

/**
 * Acesso SEM conta (soft gate, D10). `anonimo` espelha a identidade; `semContaAceito` lembra a
 * escolha "continuar sem conta"; `pedindoLogin` é a pessoa sem conta pedindo a porta de volta
 * (menu, convite, gate). `gate` é o modal contextual — o que motivou, em linguagem de gente.
 */
export function useGateDeConta(): EstadoDoGateDeConta {
  const [anonimo, setAnonimo] = useState(estaAnonimo);
  const [semContaAceito, setSemContaAceito] = useState(anonimoAceito);
  const [pedindoLogin, setPedindoLogin] = useState(false);
  const [gate, setGate] = useState<string | null>(null);
  const [migracao, setMigracao] = useState(false);
  useEffect(() => aoMudarIdentidade((depois, antes) => {
    setAnonimo(depois === 'anonimo');
    if (depois === 'conta') {
      setPedindoLogin(false); setGate(null);
      // Entrou vindo do modo sem conta, ou entrou com coisas de uma visita anterior neste
      // navegador: oferece subir. Visível, nunca em silêncio.
      if (antes === 'anonimo') setMigracao(true);
      else void temDadosLocais().then((tem) => { if (tem) setMigracao(true); }).catch(() => {});
    }
  }), []);
  // O servidor em memória avisa quando, sem conta, algo pediu uma rota que só existe com conta.
  // UMA vez por visita: depois que a pessoa fecha o convite, as ações seguintes só recebem o 501
  // (cada tela já degrada sozinha). Quem quiser entrar tem o menu da conta e os cartões inline.
  useEffect(() => {
    const h = (ev: Event) => {
      try { if (sessionStorage.getItem('babel.convite_visto') === '1') return; } catch { /* sem sessionStorage */ }
      const rota = (ev as CustomEvent<{ rota: string }>).detail?.rota ?? '';
      setGate(motivoDoGate(rota));
    };
    window.addEventListener(EVENTO_EXIGE_CONTA, h);
    return () => window.removeEventListener(EVENTO_EXIGE_CONTA, h);
  }, []);
  const fecharGate = () => {
    try { sessionStorage.setItem('babel.convite_visto', '1'); } catch { /* best-effort */ }
    setGate(null);
  };

  return { anonimo, semContaAceito, setSemContaAceito, pedindoLogin, setPedindoLogin, gate, migracao, setMigracao, fecharGate };
}
