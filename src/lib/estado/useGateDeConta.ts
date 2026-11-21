import { useCallback, useEffect, useState } from 'react';

import { anonimoAceito, motivoDoGate } from '../../components/conta/exigeConta';
/* `nucleo` e não `servidor`: o evento é uma constante da folha; importar o roteador puxaria o
   servidor em memória inteiro para o chunk de entrada (ver `data/funil.ts`). */
import { EVENTO_EXIGE_CONTA } from '../../data/efemero/nucleo';
import { aoMudarIdentidade, estaAnonimo, estadoDeIdentidade } from '../identidade';
import { guardarIntencao, lerIntencao } from '../intencaoDeLogin';
import { EVENTO_PEDIR_ENTRADA, type ModoDeEntrada } from '../pedirConta';

/** O `idb` e o store do modo sem conta só descem quando alguém entra — e só para esta pergunta. */
const temDadosLocais = () => import('../../data/efemero/store').then((m) => m.temDadosLocais());

export interface EstadoDoGateDeConta {
  anonimo: boolean;
  semContaAceito: boolean;
  setSemContaAceito: (v: boolean) => void;
  /** A porta pedida: `'signup'` abre o Login em "Criar conta"; `'login'`, em "Entrar". */
  pedindoLogin: false | ModoDeEntrada;
  /** `true` é o pedido genérico (abre em "Entrar"), como sempre foi. */
  setPedindoLogin: (v: boolean | ModoDeEntrada) => void;
  gate: string | null;
  migracao: boolean;
  setMigracao: (v: boolean) => void;
  fecharGate: () => void;
}

/**
 * Quanto tempo uma intenção ESPECÍFICA vale contra o pedido genérico que vem logo atrás dela. O
 * Checkout guarda `/plano/assinar` e em seguida pede o login pelo mesmo caminho de todo mundo; sem
 * esta janela, o pedido genérico trocaria a volta ao pagamento pela tela atual.
 */
export const JANELA_DA_INTENCAO_ESPECIFICA_MS = 5_000;

/**
 * O PEDIDO GENÉRICO DE LOGIN guarda o lugar atual (menu "Entrar ou criar conta", GateDeConta,
 * CartaoDeConvite, "Criar conta" da captura): quem entra volta para onde estava. Quem sabe mais
 * (o Checkout) guarda antes a própria intenção, e ela é respeitada.
 */
export function lembrarDeOndeVeio(agora: number = Date.now()): void {
  const recente = lerIntencao(agora);
  if (recente && agora - recente.criadaEm < JANELA_DA_INTENCAO_ESPECIFICA_MS) return;
  guardarIntencao({ rota: window.location.pathname + window.location.search }, agora);
}

export interface OpcoesDoGateDeConta {
  /**
   * A migração espera (o checkout em andamento — ver `useEmCheckout`). O pedido não se perde: o
   * modal abre quando a espera acaba.
   */
  adiarMigracao?: boolean;
}

/**
 * Acesso SEM conta (soft gate, D10). `anonimo` espelha a identidade; `semContaAceito` lembra a
 * escolha "continuar sem conta"; `pedindoLogin` é a pessoa sem conta pedindo a porta de volta
 * (menu, convite, gate). `gate` é o modal contextual — o que motivou, em linguagem de gente.
 */
export function useGateDeConta({ adiarMigracao = false }: OpcoesDoGateDeConta = {}): EstadoDoGateDeConta {
  const [anonimo, setAnonimo] = useState(estaAnonimo);
  const [semContaAceito, setSemContaAceito] = useState(anonimoAceito);
  const [pedindoLogin, setPedindoLoginDeFato] = useState<false | ModoDeEntrada>(false);
  const setPedindoLogin = useCallback((v: boolean | ModoDeEntrada) => {
    /* Com sessão, não há porta a pedir: o pedido ficaria pendurado (a porta mostra o app) e voltaria como
       "Criar conta" depois de um SIGNED_OUT, com uma intenção velha guardada. */
    if (v && estadoDeIdentidade() === 'conta') return;
    if (v) lembrarDeOndeVeio();
    setPedindoLoginDeFato(v === true ? 'login' : v);
  }, []);
  const [gate, setGate] = useState<string | null>(null);
  const [migracaoPendente, setMigracao] = useState(false);
  useEffect(
    () =>
      aoMudarIdentidade((depois) => {
        setAnonimo(depois === 'anonimo');
        if (depois === 'conta') {
          setPedindoLoginDeFato(false);
          setGate(null);
          // Entrou com coisas deste navegador (do modo sem conta ou de uma visita anterior): oferece
          // subir. Visível, nunca em silêncio — e só quando HÁ o que subir: o teste de ponta a ponta
          // viu o modal abrir com "0 sessão e 0 cartão", o que é ruído no meio do funil.
          void temDadosLocais()
            .then((tem) => {
              if (tem) setMigracao(true);
            })
            .catch(() => {});
        }
      }),
    [],
  );
  // O servidor em memória avisa quando, sem conta, algo pediu uma rota que só existe com conta.
  // UMA vez por visita: depois que a pessoa fecha o convite, as ações seguintes só recebem o 501
  // (cada tela já degrada sozinha). O CLIQUE explícito (`pedirConta`, `explicito: true`) abre sempre:
  // quem tocou num botão que precisa de conta merece a resposta, não um botão morto.
  useEffect(() => {
    const h = (ev: Event) => {
      const detalhe = (ev as CustomEvent<{ rota?: string; explicito?: boolean }>).detail;
      if (!detalhe?.explicito) {
        try {
          if (sessionStorage.getItem('babel.convite_visto') === '1') return;
        } catch {
          /* sem sessionStorage */
        }
      }
      setGate(motivoDoGate(detalhe?.rota ?? ''));
    };
    window.addEventListener(EVENTO_EXIGE_CONTA, h);
    return () => window.removeEventListener(EVENTO_EXIGE_CONTA, h);
  }, []);
  // Os botões "Criar conta" e "Já tenho conta" de qualquer convite (`pedirEntrada`).
  useEffect(() => {
    const h = (ev: Event) => {
      if (!estaAnonimo()) return;
      const modo = (ev as CustomEvent<{ modo?: ModoDeEntrada }>).detail?.modo;
      setGate(null);
      setPedindoLogin(modo === 'signup' ? 'signup' : 'login');
    };
    window.addEventListener(EVENTO_PEDIR_ENTRADA, h);
    return () => window.removeEventListener(EVENTO_PEDIR_ENTRADA, h);
  }, [setPedindoLogin]);
  const fecharGate = () => {
    try {
      sessionStorage.setItem('babel.convite_visto', '1');
    } catch {
      /* best-effort */
    }
    setGate(null);
  };

  return {
    anonimo,
    semContaAceito,
    setSemContaAceito,
    pedindoLogin,
    setPedindoLogin,
    gate,
    migracao: migracaoPendente && !adiarMigracao,
    setMigracao,
    fecharGate,
  };
}
