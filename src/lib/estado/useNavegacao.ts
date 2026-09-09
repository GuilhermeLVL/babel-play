import { type Dispatch, type SetStateAction,useEffect, useRef, useState } from 'react';

import type { Recording,ViewType } from '../../types';
import { isOnAuthCallback } from '../authCallback';
import { askNavGuard } from '../navGuard';
import { type EstadoDeRota,lerUrlAtual, publicarUrl, type ViewDeRota } from '../rotas';
import type { PracticeSeed } from '../sentences';

export interface DependenciasDaNavegacao {
  activeView: ViewType;
  setActiveView: Dispatch<SetStateAction<ViewType>>;
  selectedRecordingId: string | null;
  setSelectedRecordingId: Dispatch<SetStateAction<string | null>>;
  setResumingRecordingId: Dispatch<SetStateAction<string | null>>;
  recordings: Recording[];
  lojaAba: string | null;
  setLojaAba: Dispatch<SetStateAction<string | null>>;
  setPedindoLogin: (v: boolean) => void;
}

export interface EstadoDaNavegacao {
  analysisSubTab: string;
  setAnalysisSubTab: Dispatch<SetStateAction<string>>;
  liveTranscription: string;
  setLiveTranscription: Dispatch<SetStateAction<string>>;
  isChatOpen: boolean;
  setIsChatOpen: Dispatch<SetStateAction<boolean>>;
  isChatDocked: boolean;
  setIsChatDocked: Dispatch<SetStateAction<boolean>>;
  isChatMaximized: boolean;
  setIsChatMaximized: Dispatch<SetStateAction<boolean>>;
  practiceSeed: PracticeSeed | null;
  setPracticeSeed: Dispatch<SetStateAction<PracticeSeed | null>>;
  navigateTo: (view: string, data?: any) => void;
}

/**
 * Navegação, subestado das telas e o espelho da URL. O `activeView` e a sessão selecionada
 * continuam morando no `App` (a casca renderiza a partir deles) e chegam aqui por parâmetro.
 */
export function useNavegacao(deps: DependenciasDaNavegacao): EstadoDaNavegacao {
  const {
    activeView, setActiveView,
    selectedRecordingId, setSelectedRecordingId, setResumingRecordingId,
    recordings, lojaAba, setLojaAba, setPedindoLogin,
  } = deps;

  const [analysisSubTab, setAnalysisSubTab] = useState<string>('transcript');
  const [liveTranscription, setLiveTranscription] = useState<string>('');

  // iChat layout orchestration state
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [isChatDocked, setIsChatDocked] = useState<boolean>(() => {
    return localStorage.getItem('ichat_docked') === 'true';
  });
  const [isChatMaximized, setIsChatMaximized] = useState<boolean>(false);

  /**
   * SEMENTE DE PRÁTICA — o canal que faz "praticar este trecho" funcionar de qualquer tela.
   *
   * Antes, `navigateTo('study', data)` DESCARTAVA `data` silenciosamente, e `navigateTo('analysis', …)`
   * forçava o subtab de volta a 'transcript'. Ou seja: um deep-link "abra o Shadowing já com ESTA frase"
   * era literalmente impossível. Agora a semente é guardada aqui e desce até o Study.
   */
  const [practiceSeed, setPracticeSeed] = useState<PracticeSeed | null>(null);

  const navigateTo = (view: string, data?: any) => {
    // Sem conta: a porta de entrada é um destino ("Entrar" no menu), e o que exige conta abre o
    // convite em vez de navegar — a tela atual fica como está.
    if (view === 'login') { setPedindoLogin(true); return; }
    // Tela que exige conta NAVEGA normalmente: lá o CartaoDeConvite (inline) explica. O modal
    // fica só para ações (importar, iChat) — navegação abrindo modal era convite demais.
    // A tela atual pode ter trabalho em risco (uma captura em andamento, por exemplo). Ela
    // decide se deixa sair na hora ou se pergunta antes — ver `lib/navGuard`.
    if (askNavGuard(() => doNavigate(view, data))) return;
    doNavigate(view, data);
  };

  const doNavigate = (view: string, data?: any) => {
    if (view === 'study') {
      setActiveView('analysis');
      setAnalysisSubTab('study');
      // A semente vem no `data` (texto selecionado, palavra, exercício-alvo). Antes era jogada fora.
      setPracticeSeed(data?.seed ?? null);
      if (data?.id) setSelectedRecordingId(data.id);
    } else if (view === 'reading') {
      setActiveView('analysis');
      setAnalysisSubTab('reading');
    } else {
      setActiveView(view as ViewType);
      // v3: Personalizar aceita a aba de destino ("progressao" do fim de rodada, "loja" do cadeado).
      if (view === 'loja') setLojaAba(typeof data?.aba === 'string' ? data.aba : null);
      // `capture` com `resumeId` retoma uma sessão existente (Biblioteca → "Retomar
      // Captura"). Sem o id, é uma captura nova — limpar, senão a próxima gravação
      // sobrescreveria a sessão retomada anteriormente.
      if (view === 'capture') {
        setResumingRecordingId(data?.resumeId ?? null);
      }
      if (view === 'analysis') {
        // Só volta ao 'transcript' quando NÃO há um subtab explícito no payload — senão um
        // deep-link para uma aba específica seria sempre anulado.
        setAnalysisSubTab(data?.subTab ?? 'transcript');
        if (data?.id) {
          setSelectedRecordingId(data.id);
        }
      }
      /* "Jogar com ESTA sessão" — o `data` era descartado aqui, então a tela de jogos era a
         única de primeiro nível sem canal de entrada e sempre caía na gravação mais recente.
         Sem `id`, limpa: "Jogar" pelo menu volta a ser o baralho inteiro, como deve ser. */
      if (view === 'play') {
        setSelectedRecordingId(data?.id ?? null);
        /* "Praticar ISTO" chega aqui quando o alvo é um JOGO. Os atalhos do menu de contexto e do
           painel de vocabulário apontavam para os exercícios legados; com eles fora, o destino
           passou a ser o minijogo equivalente, e a semente precisa viajar junto, senão o atalho
           abriria o lobby genérico e escolher uma frase não teria efeito. */
        setPracticeSeed(data?.seed ?? null);
      }
    }
  };

  /* ═══════════════════════════════════════════════════════════════════════
     F10, A URL ESPELHA O ESTADO.

     Aditivo: a máquina de estados acima continua sendo a implementação. Estes três efeitos
     apenas mantêm a barra de endereço em sincronia com ela.

     O que isto conserta, medido na auditoria: recarregar devolvia ao Hub e perdia a sessão
     aberta e a aba; o botão "voltar" do navegador saía do app; nenhuma tela era compartilhável;
     e `Study` não tinha porta (agora tem: `/revisar`).
     ═══════════════════════════════════════════════════════════════════════ */

  /* 1) BOOT — restaura o estado a partir da URL, uma vez. `replaceState` (push=false) para não
        criar uma entrada de histórico que devolveria o usuário para FORA do app no primeiro
        "voltar". */
  const rotaRestaurada = useRef(false);
  useEffect(() => {
    if (rotaRestaurada.current) return;
    rotaRestaurada.current = true;
    if (isOnAuthCallback()) return; // o callback tem dono; não é rota de tela
    const e = lerUrlAtual();
    if (e.view === 'hub' && window.location.pathname === '/') return;
    doNavigate(e.subTab === 'study' ? 'study' : e.view, { id: e.sessionId, subTab: e.subTab, aba: e.lojaTab });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 2) NAVEGAÇÃO → URL. Espelha o estado corrente sempre que ele muda. */
  useEffect(() => {
    if (!rotaRestaurada.current || isOnAuthCallback()) return;
    publicarUrl({
      view: (activeView === 'study' || activeView === 'reading' ? 'analysis' : activeView) as ViewDeRota,
      sessionId: activeView === 'analysis' ? (selectedRecordingId ?? recordings[0]?.id ?? undefined) : undefined,
      subTab: activeView === 'analysis' ? (analysisSubTab as EstadoDeRota['subTab']) : undefined,
      lojaTab: activeView === 'loja' ? ((lojaAba ?? undefined) as EstadoDeRota['lojaTab']) : undefined,
    });
  }, [activeView, selectedRecordingId, recordings, analysisSubTab, lojaAba]);

  /* 3) BOTÃO VOLTAR. Sem isto, "voltar" saía do app — era o beco relatado na auditoria.
        Passa pelo `navGuard`: uma captura em andamento ainda pode pedir confirmação. */
  useEffect(() => {
    const aoVoltar = () => {
      const e = lerUrlAtual();
      navigateTo(e.subTab === 'study' ? 'study' : e.view, { id: e.sessionId, subTab: e.subTab, aba: e.lojaTab });
    };
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
    /* `navigateTo` FICA DE FORA das dependências, de propósito. Ela é recriada a cada render (é
       uma função comum, não um `useCallback`), então incluí-la faria este efeito remover e
       registrar de novo o ouvinte de `popstate` a CADA render — e o que ele precisa é existir uma
       vez, do primeiro render ao último. O que ela lê (`lerUrlAtual`) vem da URL no momento do
       evento, não de uma captura antiga, então não há estado velho para vazar aqui. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    analysisSubTab, setAnalysisSubTab,
    liveTranscription, setLiveTranscription,
    isChatOpen, setIsChatOpen,
    isChatDocked, setIsChatDocked,
    isChatMaximized, setIsChatMaximized,
    practiceSeed, setPracticeSeed,
    navigateTo,
  };
}
