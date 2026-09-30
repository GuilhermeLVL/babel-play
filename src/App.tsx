import React, { Suspense, useEffect, useState } from 'react';

import LayoutEditorToolbar from './components/LayoutEditorToolbar';
import PracticeMenu from './components/PracticeMenu';
import Hub from './components/views/Hub'; // tela inicial, eager p/ primeiro paint instantâneo
// CODE-SPLITTING: as demais views e overlays pesados carregam SOB DEMANDA. Antes, tudo caía num único
// bundle de arranque (~1,9 MB) — incluindo o onnxruntime-web/VAD (Captura), o recharts (Métricas) e o
// gateway/offlineTranscribe (Análise/Biblioteca), pesos que só importam quando você abre aquela tela.
// Agora cada view puxa o seu chunk quando aberta → app leve e dinâmica.
import { lazyComRecarga } from './lib/lazyComRecarga';
const LiveCapture = lazyComRecarga(() => import('./components/views/LiveCapture'));
const Library = lazyComRecarga(() => import('./components/views/Library'));
const Analysis = lazyComRecarga(() => import('./components/views/Analysis'));
const Settings = lazyComRecarga(() => import('./components/views/Settings'));
const Metrics = lazyComRecarga(() => import('./components/views/Metrics'));
const Play = lazyComRecarga(() => import('./components/views/Play'));
const IChat = lazyComRecarga(() => import('./components/IChat'));
const LayoutStudio = lazyComRecarga(() => import('./components/LayoutStudio'));
const Perfil = lazyComRecarga(() => import('./components/views/Perfil'));
const Planos = lazyComRecarga(() => import('./components/views/Planos'));
const Sobre = lazyComRecarga(() => import('./components/views/Sobre'));
const Estatisticas = lazyComRecarga(() => import('./components/views/Estatisticas'));
const Ajuda = lazyComRecarga(() => import('./components/views/Ajuda'));
const NaoEncontrado = lazyComRecarga(() => import('./components/views/NaoEncontrado'));
const Loja = lazyComRecarga(() => import('./components/views/Loja'));
/* O modal de resgate: só quando há recompensa na fila (a fila em si mora em `lib/filaDeRecompensas`).
   O chunk é PEDIDO NO ARRANQUE (efeito abaixo), fora do JS inicial: sob demanda pura, o download só
   começava quando a fila enchia, e o modal abria atrasado pelo tempo do chunk — já com a pessoa
   mexendo na tela, roubando o foco do que ela fazia (e2e `fundacao`: as setas da alça do iChat caíam
   no "Resgatar", o hover do menu esbarrava no diálogo). Pedido em paralelo com as métricas, ele chega
   pronto quando a fila enche, como no import estático de antes. */
const carregarRecompensaDesbloqueada = () => import('./components/RecompensaDesbloqueada');
const RecompensaDesbloqueada = lazyComRecarga(carregarRecompensaDesbloqueada);
const Login = lazyComRecarga(() => import('./components/Login'));
const ResetPassword = lazyComRecarga(() => import('./components/auth/ResetPassword'));
const DesafioSegundoFator = lazyComRecarga(() => import('./components/auth/DesafioSegundoFator'));
// O tour de boas-vindas só existe para quem AINDA não passou por ele (`onboarded === false`) —
// para todo mundo mais era peso morto no arranque (25 kB de fonte no chunk de entrada). Enquanto
// `onboarded` é `null` a tela já mostrava "Carregando…", então o fallback do Suspense abaixo é a
// mesma pintura que o usuário via antes: nada muda na tela, só o momento do download.
const Onboarding = lazyComRecarga(() => import('./components/Onboarding'));
// Fase 4: o aceite do responsável só existe para quem abriu o link do convite.
const AceiteDoResponsavel = lazyComRecarga(() => import('./components/conta/AceiteDoResponsavel'));
// O aviso de pagamento atrasado só existe para quem tem conta: carregado junto, levava o módulo
// inteiro da assinatura para o JS de arranque de todo mundo (orçamento do bundle, 30/09/2026).
const AvisoDePagamentoAtrasado = lazyComRecarga(() => import('./components/conta/AvisoDePagamentoAtrasado'));
// Pelo mesmo motivo: o aviso do responsável só existe para perfil protegido, e a migração só abre
// quando há dados no aparelho para subir depois de um login.
const AvisoDoResponsavel = lazyComRecarga(() => import('./components/conta/AvisoDoResponsavel'));
const ModalDeMigracao = lazyComRecarga(() => import('./components/conta/ModalDeMigracao'));
import BuscaGlobal from './components/BuscaGlobal';
import CartaoDeConvite from './components/conta/CartaoDeConvite';
import { aceitarAnonimo, exigeConta, porta } from './components/conta/exigeConta';
import GateDeConta from './components/conta/GateDeConta';
import PerguntaDeIdade from './components/conta/PerguntaDeIdade';
import FloatingScoreLayer from './components/FloatingScoreLayer';
import IndicadorDeSalvamento from './components/IndicadorDeSalvamento';
import HostDeOfertas from './components/ofertas/HostDeOfertas';
import ParticleCanvas from './components/ParticleCanvas';
import MobileNav from './components/shell/MobileNav';
import MobileTopBar from './components/shell/MobileTopBar';
import StudioHeader from './components/StudioHeader';
import Toaster from './components/Toast';
import { carregarProtecao, fetchSessions } from './data/api';
import { lerTokenDoConvite } from './lib/conviteNaUrl';
import { edicaoEstatica } from './lib/edicaoEstatica';
import { carregarEntitlements } from './lib/entitlements';
import { useAparencia, useHidratacaoDeAjustes } from './lib/estado/useAparencia';
import { useEmCheckout } from './lib/estado/useEmCheckout';
import { useGateDeConta } from './lib/estado/useGateDeConta';
import { useMetricas } from './lib/estado/useMetricas';
import { useNavegacao } from './lib/estado/useNavegacao';
import { notificarSessaoSalva, useNotificacoes } from './lib/estado/useNotificacoes';
import { useRecompensas } from './lib/estado/useRecompensas';
/* ESTADO POR DOMÍNIO — cada bloco que o App concentrava virou um hook em `lib/estado`. A ORDEM
   das chamadas abaixo é a ordem em que os efeitos rodavam antes da divisão, e é por isso que os
   hooks são chamados exatamente onde o bloco original estava. */
import { useSessaoSupabase } from './lib/estado/useSessaoSupabase';
import { tirarDaFila } from './lib/filaDeRecompensas';
import { equiparItem } from './lib/galeria/equipar';
import { useIdiomaDaInterfaceEscolhido } from './lib/langConfig';
import { dispararOferta } from './lib/ofertas/eventos';
import {
  aoMudarProtecao,
  armarProtecao,
  definirProtecao,
  estadoDaProtecao,
  type EstadoDeProtecao,
} from './lib/protecaoDoMenor';
import { play } from './lib/soundFx';
import { authRequired } from './lib/supabase';
import { Recording, ViewType } from './types';

export default function App() {
  /* A interface acompanha "meu idioma" do perfil — um lugar só, no topo, para não haver tela que
     troque e tela que não. Ver `useIdiomaDaInterfaceEscolhido`. */
  useIdiomaDaInterfaceEscolhido();

  const [activeView, setActiveView] = useState<ViewType>('hub');
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const [resumingRecordingId, setResumingRecordingId] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  const { session, recovery, setRecovery, processingCallback, segundoFatorPendente, reconferirSegundoFator } =
    useSessaoSupabase();

  /* No checkout (`/plano/assinar`, `/plano/assinado`) nada sobe por cima nem toma a tela: a
     migração e a pergunta da idade esperam a pessoa sair dali (funil de venda, 2026-09-29). */
  const emCheckout = useEmCheckout(activeView);

  const {
    anonimo,
    semContaAceito,
    setSemContaAceito,
    pedindoLogin,
    setPedindoLogin,
    gate,
    migracao,
    setMigracao,
    fecharGate,
  } = useGateDeConta({ adiarMigracao: emCheckout });

  const {
    theme,
    setTheme,
    fonte,
    setFonte,
    darkMode,
    toggleDarkMode,
    isStudioOpen,
    setIsStudioOpen,
    buscaAberta,
    setBuscaAberta,
    ageProfile,
    setAgeProfile,
    menuPosition,
    setMenuPosition,
    soundEnabled,
    toggleSound,
    animationsEnabled,
    toggleAnimations,
    performanceMode,
    togglePerformanceMode,
    fontScale,
    setFontScale,
    cycleFontScale,
    setThemeState,
    setFonteState,
    setDarkMode,
    setAgeProfileState,
  } = useAparencia();

  useEffect(() => {
    void carregarRecompensaDesbloqueada().catch(() => undefined);
  }, []);

  // Entitlements: o servidor decide o plano; o cliente só cacheia para pintar. Recarrega quando a
  // sessão muda (login/logout), que é quando a resposta pode mudar.
  useEffect(() => {
    if (authRequired && !session) return;
    void carregarEntitlements();
  }, [session]);

  /* PERFIL PROTEGIDO (Fase 4 — ECA Digital, LGPD art. 14). No modo público, a proteção nasce
     "armada": o funil espera a primeira resposta de `/api/me/idade` antes de mandar dados para a
     nuvem, para que a conta de menor sem responsável não escreva no servidor nem por um instante.
     A chave é o id do usuário, e não o objeto da sessão, que muda a cada renovação de token. */
  const [protecao, setProtecao] = useState<EstadoDeProtecao | null>(() => {
    if (authRequired) armarProtecao();
    return null;
  });
  useEffect(() => aoMudarProtecao(() => setProtecao(estadoDaProtecao())), []);
  const idDaConta = (session as { user?: { id?: string } } | null | undefined)?.user?.id ?? null;
  useEffect(() => {
    if (!authRequired || session === undefined) return;
    if (!idDaConta) {
      definirProtecao(null);
      return;
    }
    armarProtecao();
    void carregarProtecao();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idDaConta, session === undefined]);
  const [tokenDoConvite, setTokenDoConvite] = useState<string | null>(lerTokenDoConvite);

  // Fase 2: carrega as sessões reais do backend (substitui o mockData seed). Recarrega quando a
  // conta passa a (ou deixa de) depender do responsável: os dados trocam entre nuvem e aparelho.
  const restrita = !!protecao?.restrita;
  useEffect(() => {
    fetchSessions()
      .then(setRecordings)
      .catch(() => setRecordings([]));
  }, [restrita]);

  const { metrics, recordes, progress, missoes, setVersaoDasMetricas } = useMetricas(recordings.length);

  const { ctxConquistas, filaDeRecompensas, setFilaDeRecompensas, lojaAba, setLojaAba, abrirEstudio, equiparCtx } =
    useRecompensas({
      metrics,
      recordes,
      progress,
      setVersaoDasMetricas,
      setTheme,
      setFonte,
      setMenuPosition,
      setIsStudioOpen,
    });

  // O sino: os fatos que o app já produz viram notificação (ver lib/estado/useNotificacoes).
  useNotificacoes({ metrics, progress, filaDeRecompensas, missoes });

  useHidratacaoDeAjustes({ setThemeState, setDarkMode, setFonteState, setAgeProfileState, setOnboarded });

  const {
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
    navigateTo,
  } = useNavegacao({
    activeView,
    setActiveView,
    selectedRecordingId,
    setSelectedRecordingId,
    setResumingRecordingId,
    recordings,
    lojaAba,
    setLojaAba,
    setPedindoLogin,
  });

  /* A ABA DE AJUSTES pedida por um atalho do shell: "Som, animações e desempenho" (rodapé do menu)
     abre Aparência; a engrenagem do sino abre Notificações. Zera antes de repor, para pedir a mesma
     aba de novo reabri-la mesmo que a pessoa tenha trocado de aba no meio; e zera ao sair de
     Ajustes, para a próxima entrada pelo menu cair na aba padrão. */
  const [abaDosAjustes, setAbaDosAjustes] = useState<string | null>(null);
  useEffect(() => {
    if (activeView !== 'settings') setAbaDosAjustes(null);
  }, [activeView]);
  const irPeloShell = (view: string, data?: Record<string, string>) => {
    if (view === 'settings' && data?.aba) {
      const aba = data.aba;
      setAbaDosAjustes(null);
      window.setTimeout(() => setAbaDosAjustes(aba), 0);
    }
    navigateTo(view, data);
  };

  /**
   * `shouldRedirect=false` = "salvar e continuar na tela" (o usuário segue capturando).
   * O UPSERT importa: uma sessão retomada volta com o MESMO id, então um prepend cego
   * a duplicaria na Biblioteca.
   */
  const handleSaveRecording = (recording: Recording, shouldRedirect: boolean = true) => {
    setRecordings((prev) =>
      prev.some((r) => r.id === recording.id)
        ? prev.map((r) => (r.id === recording.id ? recording : r))
        : [recording, ...prev],
    );
    setSelectedRecordingId(recording.id);
    setResumingRecordingId(null);
    notificarSessaoSalva(recording);
    // Salvar uma sessão é a conclusão mais concreta da app — é o momento que merece o acorde.
    play('success');
    /* Fim de sessão de estudo (Fase 8): DEPOIS de salvar, nunca durante a captura. O host decide se
       aparece alguma coisa (flag, frequência, 3 minutos de sessão, uma por sessão). */
    dispararOferta('fim_de_sessao', { origem: 'captura' });
    if (shouldRedirect) {
      // Sem conta a análise não existe; o destino natural é jogar com o que acabou de ser gravado.
      if (anonimo) {
        setActiveView('play');
        return;
      }
      setAnalysisSubTab('transcript');
      setActiveView('analysis');
    }
  };

  const selectedRecording = recordings.find((r) => r.id === selectedRecordingId) || recordings[0];

  // Map sub tabs like reading and study to distinct views for precise iChat context matching
  const mappedActiveViewForChat =
    activeView === 'analysis'
      ? ((analysisSubTab === 'study' ? 'study' : analysisSubTab === 'reading' ? 'reading' : 'analysis') as ViewType)
      : activeView;

  // Item aceso no menu (protótipo): a sessão vive na Biblioteca; a revisão, no Vocabulário.
  const viewDoMenu: ViewType =
    activeView === 'analysis' ? (analysisSubTab === 'study' ? 'metrics' : 'library') : activeView;

  // Marco 1: OAuth/recuperação voltando em /auth/callback — aguarda o supabase-js processar a URL.
  if (authRequired && processingCallback) {
    return (
      <div className="flex h-tela w-full items-center justify-center bg-canvas text-ink-muted text-sm">
        Concluindo login…
      </div>
    );
  }
  // Marco 1: porta de login. Só no modo público (authRequired); no local é pulada inteira.
  if (authRequired && session === undefined) {
    return (
      <div className="flex h-tela w-full items-center justify-center bg-canvas text-ink-muted text-sm">Carregando…</div>
    );
  }
  if (authRequired && recovery) {
    return (
      <Suspense
        fallback={
          <div className="flex h-tela w-full items-center justify-center bg-canvas text-ink-muted text-sm">
            Carregando…
          </div>
        }
      >
        <ResetPassword onDone={() => setRecovery(false)} />
        <Toaster />
      </Suspense>
    );
  }
  /* Fase 6 — 2FA de verdade: com app autenticador ativo, a sessão de senha/Google é aal1 e o servidor
     recusa as rotas sensíveis. O código é pedido aqui, logo depois do login. */
  if (authRequired && session && segundoFatorPendente) {
    return (
      <Suspense
        fallback={
          <div className="flex h-tela w-full items-center justify-center bg-canvas text-ink-muted text-sm">
            Carregando…
          </div>
        }
      >
        <DesafioSegundoFator onConcluido={reconferirSegundoFator} />
        <Toaster />
      </Suspense>
    );
  }
  if (porta({ authRequired, temSessao: !!session, anonimoAceito: semContaAceito, pedindoLogin }) === 'login') {
    return (
      <Suspense
        fallback={
          <div className="flex h-tela w-full items-center justify-center bg-canvas text-ink-muted text-sm">
            Carregando…
          </div>
        }
      >
        <Login
          onContinuarSemConta={() => {
            aceitarAnonimo();
            setSemContaAceito(true);
            setPedindoLogin(false);
          }}
        />
        <Toaster />
      </Suspense>
    );
  }

  /* A IDADE antes de tudo o que é da conta: sem ela o app não sabe qual perfil aplicar. No
     checkout, não: o próprio Checkout pergunta no formulário, e esta tela inteira o derrubaria. */
  if (authRequired && idDaConta && protecao && !protecao.nascimentoInformado && !emCheckout) {
    return (
      <>
        <PerguntaDeIdade aoConcluir={() => void carregarProtecao()} />
        <Toaster />
      </>
    );
  }
  /* O LINK DO CONVITE aberto pelo responsável (guardado durante o login). */
  if (authRequired && idDaConta && tokenDoConvite) {
    return (
      <Suspense
        fallback={
          <div className="flex h-tela w-full items-center justify-center bg-canvas text-ink-muted text-sm">
            Carregando…
          </div>
        }
      >
        <AceiteDoResponsavel token={tokenDoConvite} aoSair={() => setTokenDoConvite(null)} />
        <Toaster />
      </Suspense>
    );
  }

  if (onboarded === null) {
    return (
      <div className="flex h-tela w-full items-center justify-center bg-canvas text-ink-muted text-sm">Carregando…</div>
    );
  }
  if (onboarded === false) {
    return (
      <Suspense
        fallback={
          <div className="flex h-tela w-full items-center justify-center bg-canvas text-ink-muted text-sm">
            Carregando…
          </div>
        }
      >
        <Onboarding onComplete={() => setOnboarded(true)} />
        <Toaster />
      </Suspense>
    );
  }

  const shell = (
    <StudioHeader
      theme={theme}
      setTheme={setTheme}
      fonte={fonte}
      setFonte={setFonte}
      nivel={progress.available ? progress.level : 99}
      darkMode={darkMode}
      toggleDarkMode={toggleDarkMode}
      onOpenStudio={abrirEstudio}
      ageProfile={ageProfile}
      setAgeProfile={setAgeProfile}
      fontScale={fontScale}
      cycleFontScale={cycleFontScale}
      activeView={viewDoMenu}
      onChangeView={irPeloShell}
      menuPosition={menuPosition}
      setMenuPosition={setMenuPosition}
      soundEnabled={soundEnabled}
      toggleSound={toggleSound}
      animationsEnabled={animationsEnabled}
      toggleAnimations={toggleAnimations}
      performanceMode={performanceMode}
      togglePerformanceMode={togglePerformanceMode}
      onOpenSearch={() => setBuscaAberta(true)}
      progress={progress}
    />
  );

  const mobileControls = {
    theme,
    setTheme,
    darkMode,
    toggleDarkMode,
    onOpenStudio: abrirEstudio,
    ageProfile,
    setAgeProfile,
    fontScale,
    cycleFontScale,
    menuPosition,
    setMenuPosition,
    fonte,
    setFonte,
    nivel: progress.available ? progress.level : 99,
    soundEnabled,
    toggleSound,
    animationsEnabled,
    toggleAnimations,
    performanceMode,
    togglePerformanceMode,
    onOpenSearch: () => setBuscaAberta(true),
    onChangeView: irPeloShell,
  };

  /**
   * LAYOUT DO SHELL — uma coluna explícita, sem `flex-col-reverse`/`flex-row-reverse`.
   *
   * O reverse invertia a ordem VISUAL mas não a de tabulação, e ainda brigava com o `order-last`
   * espalhado nos filhos. Aqui a posição do menu decide onde o elemento é RENDERIZADO, então o
   * DOM, a leitura por teclado e o leitor de tela contam a mesma história.
   */
  return (
    // `h-dvh`: com 100vh a raiz cinza (bg-surface) ficava maior que a viewport dinamica e o
    // overflow-hidden cortava o rodape, a "faixa cinza" que escondia conteudo na Captura.
    <div data-raiz-do-app className="@container/app flex flex-col h-tela w-full bg-canvas overflow-hidden relative">
      {/* Barra do topo: a de desktop quando a preferência é "topo"; senão, só a do celular. */}
      {menuPosition === 'top' ? shell : <MobileTopBar progress={progress} controls={mobileControls} />}

      <div className="flex-1 flex min-h-0 w-full">
        {menuPosition === 'left' && shell}

        <main
          className={`@container/conteudo flex-1 min-w-0 flex flex-col h-full relative overflow-hidden bg-canvas age-${ageProfile}`}
        >
          {/* O AMBIENTE fica fora do perfil sênior de propósito: movimento contínuo de fundo é
              exatamente o que atrapalha quem já tem dificuldade de leitura. As RAJADAS continuam
              para os três, são curtas e confirmam uma ação que a pessoa acabou de fazer. */}
          {/* MODO LEVE (`reduzirEfeitos()`, que é o `performanceMode`, ligado sozinho no Quest e no
              celular fraco): o componente nem monta. Ele já devolvia `null` inativo; não montar deixa
              explícito aqui que partícula não existe no modo leve (o Quest é limitado por fill-rate,
              diretriz da Meta). O agente de telas cuida do resto dos efeitos. */}
          {!performanceMode && (
            <ParticleCanvas
              enabled={animationsEnabled}
              performanceMode={performanceMode}
              theme={theme}
              darkMode={darkMode}
              /* Ambiente para TODOS os perfis (dono, 2026-08-27): na leve o padrão é sênior e
                 ninguém via partícula nenhuma — quebrava a imersão. Os interruptores de animação
                 e o Modo Desempenho continuam mandando. */
              ambient
            />
          )}
          {/* Os números que sobem ("+10", "×3") — camada própria, no topo da árvore, para não
              serem cortados pelo `overflow` de nenhum container de jogo. */}
          <FloatingScoreLayer />
          {/* O salvamento da captura continua fora da tela: o selo diz isso a quem saiu dela. */}
          <IndicadorDeSalvamento naCaptura={activeView === 'capture'} aoVerCaptura={() => navigateTo('capture')} />
          <LayoutEditorToolbar />
          {protecao?.restrita && activeView === 'hub' && (
            <Suspense fallback={null}>
              <AvisoDoResponsavel estado={protecao} />
            </Suspense>
          )}
          {/* A assinatura com pagamento atrasado (past_due), em qualquer tela menos Planos, onde já está. */}
          {activeView !== 'planos' && !anonimo && !edicaoEstatica() && (
            <Suspense fallback={null}>
              <AvisoDePagamentoAtrasado />
            </Suspense>
          )}
          <Suspense
            fallback={<div className="flex-1 flex items-center justify-center text-ink-muted text-sm">Carregando…</div>}
          >
            {/* Na edição estática, Estatísticas roda inteira no servidor em memória e a tela abaixo
                já monta sem conta — o cartão por cima dela só contradiria o que aparece. */}
            {anonimo && exigeConta(activeView) && !(edicaoEstatica() && activeView === 'estatisticas') && (
              <CartaoDeConvite
                view={activeView}
                onEntrar={() => setPedindoLogin(true)}
                onVoltar={() => setActiveView('hub')}
              />
            )}
            {activeView === 'hub' && (
              <Hub
                onChangeView={navigateTo}
                recordings={recordings}
                ageProfile={ageProfile}
                progress={progress}
                metrics={metrics}
                missoes={missoes}
              />
            )}
            {activeView === 'capture' && (
              <LiveCapture
                onSave={handleSaveRecording}
                onTranscriptChange={setLiveTranscription}
                resumingRecordingId={resumingRecordingId}
                recordings={recordings}
                onRecordingsChange={setRecordings}
                onChangeView={navigateTo}
                onEntrar={() => setPedindoLogin(true)}
                ageProfile={ageProfile}
              />
            )}
            {activeView === 'library' && !anonimo && (
              <Library
                onChangeView={navigateTo}
                recordings={recordings}
                onRecordingsChange={setRecordings}
                ageProfile={ageProfile}
              />
            )}
            {/* `selectedRecordingId` e NÃO `selectedRecording`: este último cai na gravação mais
              recente quando não há id, e o filtro de sessão ligaria sozinho sem ninguém pedir. */}
            {activeView === 'play' && (
              <Play
                onChangeView={navigateTo}
                ageProfile={ageProfile}
                progress={progress}
                metrics={metrics}
                recording={selectedRecordingId ? selectedRecording : null}
                seed={practiceSeed}
                soundEnabled={soundEnabled}
                toggleSound={toggleSound}
              />
            )}
            {activeView === 'analysis' && !anonimo && (
              <Analysis
                onChangeView={navigateTo}
                recording={selectedRecording}
                allRecordings={recordings}
                subTab={analysisSubTab}
                onSubTabChange={setAnalysisSubTab}
                practiceSeed={practiceSeed}
                onSeedConsumed={() => setPracticeSeed(null)}
                ageProfile={ageProfile}
                /* A aba "Jogos" da sessão monta o mesmo lobby do `<Play>` acima; os números têm de vir
                 da MESMA fonte, senão nível/ofensiva apareceriam diferentes nas duas telas. */
                progress={progress}
                metrics={metrics}
              />
            )}
            {activeView === 'metrics' && !anonimo && (
              <Metrics recordings={recordings} onChangeView={navigateTo} ageProfile={ageProfile} metrics={metrics} />
            )}

            {activeView === 'profile' && !anonimo && <Perfil progress={progress} ageProfile={ageProfile} />}
            {/* Plano e consumo. Diferente do Perfil, aparece TAMBÉM sem conta: é justamente
              quem não tem conta que precisa saber o que um plano daria. */}
            {/* Edição estática (sem servidor): não há plano a assinar. Quem chega por URL (/plano)
                vê o mesmo cartão honesto das telas que só existem na versão completa. */}
            {activeView === 'planos' &&
              (edicaoEstatica() ? (
                <CartaoDeConvite
                  view="planos"
                  onEntrar={() => setActiveView('hub')}
                  onVoltar={() => setActiveView('hub')}
                />
              ) : (
                <Planos onEntrar={() => navigateTo('login')} />
              ))}
            {activeView === 'estatisticas' && (
              <Estatisticas metrics={metrics} onChangeView={(v) => navigateTo(v as ViewType)} />
            )}
            {activeView === 'ajuda' && <Ajuda />}
            {activeView === 'naoencontrado' && (
              <NaoEncontrado onChangeView={(v) => navigateTo(v as ViewType)} onBuscar={() => setBuscaAberta(true)} />
            )}
            {activeView === 'sobre' && <Sobre onVerPlanos={(v) => navigateTo(v)} />}
            {activeView === 'loja' && (
              <Loja
                ctxConquistas={ctxConquistas}
                progress={progress}
                theme={theme}
                setTheme={setTheme}
                fonte={fonte}
                setFonte={setFonte}
                menuPosition={menuPosition}
                setMenuPosition={setMenuPosition}
                onOpenStudio={abrirEstudio}
                ageProfile={ageProfile}
                setAgeProfile={setAgeProfile}
                abaInicial={lojaAba}
                onEntrar={() => setPedindoLogin(true)}
                aoTrocarDeAba={setLojaAba}
                equiparCtx={equiparCtx}
              />
            )}
            {/* v3: recompensa entregue na hora — em qualquer tela, esperando a rodada fechar. O modal
                vem sob demanda (só existe com fila), num Suspense próprio: carregar o chunk dele não
                pode trocar a tela inteira pelo fallback. */}
            {filaDeRecompensas.length > 0 && (
              <Suspense fallback={null}>
                <RecompensaDesbloqueada
                  fila={filaDeRecompensas}
                  onEquipar={(item) => equiparItem(item, equiparCtx)}
                  onFechar={(r) => {
                    setFilaDeRecompensas((f) => tirarDaFila(f, r));
                    /* Conquista relevante (Fase 8): a oferta vem DEPOIS da celebração fechar, nunca sobre
                       ela — e o host ainda espera se houver outra recompensa na fila (diálogo aberto). */
                    if (r.tipo === 'conquista') dispararOferta('conquista', { id: r.id });
                  }}
                  onVerPersonalizar={() => navigateTo('loja', { aba: 'personalizar' })}
                />
              </Suspense>
            )}
            {activeView === 'settings' && (
              <Settings
                theme={theme}
                darkMode={darkMode}
                onOpenStudio={abrirEstudio}
                onReplayTour={() => setOnboarded(false)}
                onAbrirSobre={() => setActiveView('sobre')}
                onChangeView={navigateTo}
                /* Claro/escuro de Ajustes → Aparência pelo MESMO dono da preferência (o toggle
                   persiste; o setter cru de estado não gravaria). */
                setDarkMode={(escuro) => {
                  if (escuro !== darkMode) toggleDarkMode();
                }}
                abaInicial={abaDosAjustes}
                /* Era 99 enquanto as métricas não chegavam: um clique rápido nos Ajustes abria tudo
                 como nível 99. Sem métrica, nível 1 — a régua nunca é generosa por engano. */
                nivel={progress.available ? progress.level : 1}
                ageProfile={ageProfile}
                setAgeProfile={setAgeProfile}
                menuPosition={menuPosition}
                setMenuPosition={setMenuPosition}
                fontScale={fontScale}
                setFontScale={setFontScale}
                soundEnabled={soundEnabled}
                toggleSound={toggleSound}
                animationsEnabled={animationsEnabled}
                toggleAnimations={toggleAnimations}
                performanceMode={performanceMode}
                togglePerformanceMode={togglePerformanceMode}
              />
            )}
          </Suspense>
        </main>

        {/* Menu de prática GLOBAL: selecione texto em qualquer tela → botão direito → praticar.
          É o que elimina o maior atrito da app, antes, para praticar um trecho, o usuário tinha de
          sair da tela, achar a Central de Exercícios (que nem view de primeiro nível era) e ainda
          assim o exercício rodava num texto fixo, não no dele. Agora o conteúdo vai até o exercício. */}
        <GateDeConta
          aberto={gate !== null}
          motivo={gate ?? ''}
          onFechar={fecharGate}
          onEntrar={() => {
            fecharGate();
            setPedindoLogin(true);
          }}
        />
        {migracao && (
          <Suspense fallback={null}>
            <ModalDeMigracao
              aberto={migracao}
              onFechar={() => setMigracao(false)}
              onMigrou={() => {
                fetchSessions()
                  .then(setRecordings)
                  .catch(() => {});
                void carregarEntitlements();
              }}
            />
          </Suspense>
        )}

        <PracticeMenu onChangeView={navigateTo} sessionId={selectedRecording?.id} />

        {/* Overlays globais (chat + estúdio de layout) — lazy: não pesam no primeiro paint. */}
        <Suspense fallback={null}>
          {/* Global iChat assistant with layout capabilities. O tutor é IA de NUVEM (`/api/tutor`):
              na edição estática, sem servidor, ele não monta — melhor ausente que um botão que só
              responde "não deu". */}
          {!edicaoEstatica() && (
            <IChat
              activeView={mappedActiveViewForChat}
              selectedRecording={selectedRecording}
              liveTranscription={liveTranscription}
              onChangeView={navigateTo}
              isOpen={isChatOpen}
              setIsOpen={setIsChatOpen}
              isDocked={isChatDocked}
              setIsDocked={(docked) => {
                setIsChatDocked(docked);
                localStorage.setItem('ichat_docked', docked ? 'true' : 'false');
              }}
              practiceSeed={practiceSeed?.text}
              recordings={recordings}
              metrics={metrics}
              ageProfile={ageProfile}
            />
          )}

          {isStudioOpen && (
            <LayoutStudio
              isOpen={isStudioOpen}
              onClose={() => setIsStudioOpen(false)}
              theme={theme}
              setTheme={setTheme}
              darkMode={darkMode}
              toggleDarkMode={toggleDarkMode}
              nivel={progress.available ? progress.level : 1}
              saldo={progress.available ? progress.seeds : 0}
            />
          )}
        </Suspense>

        {/* O rail da direita fica DEPOIS do chat acoplado, para encostar de fato na borda da tela. */}
        {menuPosition === 'right' && shell}
      </div>

      {menuPosition === 'bottom' && shell}

      {/* Dock do celular — sempre presente abaixo de `md`, seja qual for a posição escolhida
          para a tela grande. Sem ela a app ficava literalmente sem navegação no telefone. */}
      <MobileNav activeView={viewDoMenu} onChangeView={navigateTo} ageProfile={ageProfile} />

      {/* Busca global (Ctrl/⌘+K). Renderizada AQUI, na raiz, e não dentro do shell: as quatro
          posições de menu montam shells diferentes, e um diálogo que muda de dono conforme a
          posição escolhida seria quatro comportamentos para manter. O gatilho visual mora no
          `ControlCluster`, que é a peça que todas elas compartilham. */}
      <BuscaGlobal
        aberta={buscaAberta}
        aoFechar={() => setBuscaAberta(false)}
        recordings={recordings}
        aoNavegar={navigateTo}
        vencidasAgora={metrics?.dueToday ?? null}
        escuro={darkMode}
        aoAlternarTema={toggleDarkMode}
        perfil={ageProfile}
      />

      {/* Host único dos avisos e das confirmações. Sem ele, `toast()` e `askConfirm()` não têm onde
          aparecer, e os erros voltam a ser invisíveis, que é o bug que eles existem para corrigir. */}
      <Toaster />

      {/* Host único das ofertas de planos (Fase 8): banner, aviso de cota e modal, um por vez, nunca
          sobre captura, rodada ou outra celebração. Ver `components/ofertas/HostDeOfertas`. */}
      {/* Edição estática: não há plano nem conta a oferecer — o host nem monta. */}
      {!edicaoEstatica() && (
        <HostDeOfertas aoEntrar={() => setPedindoLogin(true)} aoVerPlanos={() => navigateTo('planos')} />
      )}
    </div>
  );
}
