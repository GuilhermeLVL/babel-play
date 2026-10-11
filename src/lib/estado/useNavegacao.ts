import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';

import type { Recording, ViewType } from '../../types';
import { clearAuthCallbackUrl, isOnAuthCallback } from '../authCallback';
import { edicaoEstatica } from '../edicaoEstatica';
import { aoMudarIdentidade } from '../identidade';
import { consumirIntencao } from '../intencaoDeLogin';
import { askNavGuard } from '../navGuard';
import { lembrarPlanoDoCheckout } from '../planoDoCheckout';
import { trocarDeTela } from '../polimento/telas';
import { lerRecorteDaPratica, lerRecorteDoJogar, type RecorteDaPratica, type RecorteDoJogar } from '../revisao/pratica';
import {
  type AbaDeCartoes,
  ABAS_DE_CARTOES,
  estadoDaIntencao,
  type EstadoDeRota,
  irParaSubTelaDePlanos,
  lerUrlAtual,
  publicarUrl,
  type ViewDeRota,
} from '../rotas';
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
  practiceSeed: PracticeSeed | null;
  setPracticeSeed: Dispatch<SetStateAction<PracticeSeed | null>>;
  /** O recorte do "Jogo rápido" das práticas, a caminho do Jogar. */
  recorteDoJogar: RecorteDoJogar | null;
  setRecorteDoJogar: Dispatch<SetStateAction<RecorteDoJogar | null>>;
  /** A aba aberta da tela Cartões (`/cartoes/<aba>`). */
  cartoesAba: AbaDeCartoes;
  setCartoesAba: Dispatch<SetStateAction<AbaDeCartoes>>;
  /** A rodada de revisão aberta dentro de Cartões (`/cartoes/estudar`), ou `null`. */
  estudo: EstudoAberto | null;
  navigateTo: (view: string, data?: any) => void;
}

/** O que a rodada de revisão recebeu de quem a abriu. */
export interface EstudoAberto {
  /** A sessão que recorta a rodada ("Revisar as palavras desta sessão"); sem ela, o baralho todo. */
  sessionId: string | null;
  /** "Só 10 agora". */
  limite?: number;
  /** "Mais 5 novas": só palavras nunca vistas. */
  soNovas?: boolean;
  /** "Praticar de outro jeito": a tela abre com a folha das práticas sobre este recorte, sem rodada. */
  praticar?: RecorteDaPratica;
}

/**
 * Navegação, subestado das telas e o espelho da URL. O `activeView` e a sessão selecionada
 * continuam morando no `App` (a casca renderiza a partir deles) e chegam aqui por parâmetro.
 */
export function useNavegacao(deps: DependenciasDaNavegacao): EstadoDaNavegacao {
  const {
    activeView,
    setActiveView,
    selectedRecordingId,
    setSelectedRecordingId,
    setResumingRecordingId,
    recordings,
    lojaAba,
    setLojaAba,
    setPedindoLogin,
  } = deps;

  const [analysisSubTab, setAnalysisSubTab] = useState<string>('transcript');
  const [liveTranscription, setLiveTranscription] = useState<string>('');

  // iChat layout orchestration state
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [isChatDocked, setIsChatDocked] = useState<boolean>(() => {
    return localStorage.getItem('ichat_docked') === 'true';
  });

  /**
   * SEMENTE DE PRÁTICA — o canal que faz "praticar este trecho" funcionar de qualquer tela.
   *
   * Antes, `navigateTo('study', data)` DESCARTAVA `data` silenciosamente, e `navigateTo('analysis', …)`
   * forçava o subtab de volta a 'transcript'. Ou seja: um deep-link "abra o Shadowing já com ESTA frase"
   * era literalmente impossível. Agora a semente é guardada aqui e desce até o Study.
   */
  const [practiceSeed, setPracticeSeed] = useState<PracticeSeed | null>(null);
  const [recorteDoJogar, setRecorteDoJogar] = useState<RecorteDoJogar | null>(null);

  /* CARTÕES (10/10/2026): a aba aberta e a rodada de revisão, que passou a morar na tela. */
  const [cartoesAba, setCartoesAba] = useState<AbaDeCartoes>('hoje');
  const [estudo, setEstudo] = useState<EstudoAberto | null>(null);

  const navigateTo = (view: string, data?: any) => {
    // Sem conta: a porta de entrada é um destino ("Entrar" no menu), e o que exige conta abre o
    // convite em vez de navegar — a tela atual fica como está.
    if (view === 'login') {
      // Edição estática: não há login. Nenhum botão leva aqui; se algo levar, não faz nada.
      if (edicaoEstatica()) return;
      setPedindoLogin(true);
      return;
    }
    // Tela que exige conta NAVEGA normalmente: lá o CartaoDeConvite (inline) explica. O modal
    // fica só para ações (importar, iChat) — navegação abrindo modal era convite demais.
    // A tela atual pode ter trabalho em risco (uma captura em andamento, por exemplo). Ela
    // decide se deixa sair na hora ou se pergunta antes — ver `lib/navGuard`.
    if (askNavGuard(() => doNavigate(view, data))) return;
    doNavigate(view, data);
  };

  /* A troca passa pela camada de polimento: a tela de antes sai antes de a nova entrar. Fora do
     desenho novo (ou com as animações desligadas) ela chama `aplicar` na hora. */
  const doNavigate = (view: string, data?: any) => {
    /* A revisão e o Vocabulário moram em Cartões: é o item do menu que acende no toque. */
    const destino = view === 'study' || view === 'metrics' ? 'cartoes' : view === 'reading' ? 'analysis' : view;
    trocarDeTela(destino, activeView, () => aplicarNavegacao(view, data));
  };

  const aplicarNavegacao = (view: string, data?: any) => {
    if (view === 'study') {
      /* A REVISÃO ABRE DENTRO DE CARTÕES. Antes ela era uma pseudo-aba da sessão: sem gravação
         nenhuma a tela dizia "Nenhuma sessão ainda", e sem `id` a rodada ficava presa à sessão mais
         recente. Agora o recorte só existe quando alguém pede (`data.id`). */
      setActiveView('cartoes');
      setEstudo({
        sessionId: data?.id ?? null,
        limite: typeof data?.limite === 'number' ? data.limite : undefined,
        soNovas: data?.soNovas === true ? true : undefined,
        praticar: lerRecorteDaPratica(data?.praticar),
      });
      // A semente vem no `data` (texto selecionado, palavra, exercício-alvo). Antes era jogada fora.
      setPracticeSeed(data?.seed ?? null);
    } else if (view === 'cartoes' || view === 'metrics') {
      /* `metrics` era a tela Vocabulário: virou a aba "Palavras" de Cartões. Quem ainda navega pelo
         nome antigo (a busca, a folha da palavra) chega ao catálogo. */
      setActiveView('cartoes');
      setEstudo(null);
      const aba = view === 'metrics' ? 'palavras' : data?.aba;
      setCartoesAba((ABAS_DE_CARTOES as readonly string[]).includes(aba) ? (aba as AbaDeCartoes) : 'hoje');
    } else if (view === 'reading') {
      setActiveView('analysis');
      setAnalysisSubTab('reading');
    } else {
      setActiveView(view as ViewType);
      // v3: Personalizar aceita a aba de destino ("progressao" do fim de rodada, "loja" do cadeado).
      if (view === 'loja') setLojaAba(typeof data?.aba === 'string' ? data.aba : null);
      // Planos tem sub-telas (checkout, confirmação, cancelamento) que não são views: o menu
      // leva à tela principal, e o "voltar" do navegador à sub-tela que estava na URL.
      if (view === 'planos') irParaSubTelaDePlanos(data?.planosTela ?? null);
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
        /* O "Jogo rápido" das práticas: a rodada abre só com as palavras do recorte (`lib/revisao/pratica`). */
        setRecorteDoJogar(lerRecorteDoJogar(data?.recorte));
      }
    }
  };

  /** Um estado de rota (URL, intenção de login) vira navegação — o mesmo mapa do boot e do voltar. */
  const irParaEstado = (e: EstadoDeRota, via: (view: string, data?: any) => void = doNavigate) =>
    via(e.subTab === 'study' || (e.view === 'cartoes' && e.estudando) ? 'study' : e.view, {
      id: e.sessionId,
      subTab: e.subTab,
      aba: e.view === 'cartoes' ? e.cartoesAba : e.lojaTab,
      planosTela: e.planosTela,
    });

  /* ═══════════════════════════════════════════════════════════════════════
     O LOGIN TERMINA ONDE A PESSOA IA (funil de venda, 2026-09-29 — `lib/intencaoDeLogin`).

     Três jeitos de terminar um login, um lugar só para a volta:
       · mesma aba (e-mail e senha, ou o convidado que converte): a identidade vai de `anonimo` a
         `conta`;
       · o Google e o link de confirmação do e-mail voltam em `/auth/callback`, numa carga nova (às
         vezes numa ABA nova): a identidade vai de `carregando` a `conta`, e a página nasceu no
         callback.
     Recarregar já logado (`carregando` → `conta` fora do callback) NÃO consome: a pessoa está onde
     a URL diz, e uma intenção esquecida não pode sequestrar a tela.
     ═══════════════════════════════════════════════════════════════════════ */
  const nasceuNoCallback = useRef(isOnAuthCallback());
  useEffect(
    () =>
      aoMudarIdentidade((depois, antes) => {
        if (depois !== 'conta') return;
        const terminouLogin = antes === 'anonimo' || nasceuNoCallback.current;
        nasceuNoCallback.current = false;
        if (!terminouLogin) return;
        const intencao = consumirIntencao();
        if (!intencao) return;
        lembrarPlanoDoCheckout(intencao.plano); // "assinar o Premium" abre o checkout no Premium
        // Os tokens do callback não ficam no histórico: a barra volta a `/` ANTES de a navegação
        // empurrar a rota da intenção (o "voltar" nunca devolve ao `/auth/callback#…`).
        clearAuthCallbackUrl();
        irParaEstado(estadoDaIntencao(intencao.rota));
      }),
    // `irParaEstado` só usa setters estáveis e funções de módulo — ver a nota do efeito do "voltar".
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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
    irParaEstado(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 2) NAVEGAÇÃO → URL. Espelha o estado corrente sempre que ele muda. */
  useEffect(() => {
    if (!rotaRestaurada.current || isOnAuthCallback()) return;
    publicarUrl({
      view: (activeView === 'study' || activeView === 'reading' ? 'analysis' : activeView) as ViewDeRota,
      sessionId:
        activeView === 'analysis'
          ? (selectedRecordingId ?? recordings[0]?.id ?? undefined)
          : activeView === 'cartoes'
            ? (estudo?.sessionId ?? undefined)
            : undefined,
      subTab: activeView === 'analysis' ? (analysisSubTab as EstadoDeRota['subTab']) : undefined,
      lojaTab: activeView === 'loja' ? ((lojaAba ?? undefined) as EstadoDeRota['lojaTab']) : undefined,
      cartoesAba: activeView === 'cartoes' && !estudo ? cartoesAba : undefined,
      estudando: activeView === 'cartoes' && !!estudo,
    });
  }, [activeView, selectedRecordingId, recordings, analysisSubTab, lojaAba, cartoesAba, estudo]);

  /* 3) BOTÃO VOLTAR. Sem isto, "voltar" saía do app — era o beco relatado na auditoria.
        Passa pelo `navGuard`: uma captura em andamento ainda pode pedir confirmação. */
  useEffect(() => {
    const aoVoltar = () => irParaEstado(lerUrlAtual(), navigateTo);
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
    analysisSubTab,
    setAnalysisSubTab,
    liveTranscription,
    setLiveTranscription,
    isChatOpen,
    setIsChatOpen,
    isChatDocked,
    setIsChatDocked,
    practiceSeed,
    setPracticeSeed,
    recorteDoJogar,
    setRecorteDoJogar,
    cartoesAba,
    setCartoesAba,
    estudo,
    navigateTo,
  };
}
