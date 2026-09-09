import React, { useState, useEffect, Suspense } from 'react';
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
const Loja = lazyComRecarga(() => import('./components/views/Loja'));
const Login = lazyComRecarga(() => import('./components/Login'));
const ResetPassword = lazyComRecarga(() => import('./components/auth/ResetPassword'));
// O tour de boas-vindas só existe para quem AINDA não passou por ele (`onboarded === false`) —
// para todo mundo mais era peso morto no arranque (25 kB de fonte no chunk de entrada). Enquanto
// `onboarded` é `null` a tela já mostrava "Carregando…", então o fallback do Suspense abaixo é a
// mesma pintura que o usuário via antes: nada muda na tela, só o momento do download.
const Onboarding = lazyComRecarga(() => import('./components/Onboarding'));
import { ViewType, Recording } from './types';
import FloatingScoreLayer from './components/FloatingScoreLayer';
import BuscaGlobal from './components/BuscaGlobal';
import { fetchSessions } from './data/api';
import Toaster from './components/Toast';
import { authRequired } from './lib/supabase';
import { carregarEntitlements } from './lib/entitlements';
import { aceitarAnonimo, exigeConta, porta } from './components/conta/exigeConta';
import CartaoDeConvite from './components/conta/CartaoDeConvite';
import GateDeConta from './components/conta/GateDeConta';
import ModalDeMigracao from './components/conta/ModalDeMigracao';

import StudioHeader from './components/StudioHeader';
import MobileNav from './components/shell/MobileNav';
import MobileTopBar from './components/shell/MobileTopBar';
import ParticleCanvas from './components/ParticleCanvas';
import { useIdiomaDaInterfaceEscolhido } from './lib/langConfig';
import { play } from './lib/soundFx';
import { equiparItem } from './lib/galeria/equipar';
import RecompensaDesbloqueada from './components/RecompensaDesbloqueada';

/* ESTADO POR DOMÍNIO — cada bloco que o App concentrava virou um hook em `lib/estado`. A ORDEM
   das chamadas abaixo é a ordem em que os efeitos rodavam antes da divisão, e é por isso que os
   hooks são chamados exatamente onde o bloco original estava. */
import { useSessaoSupabase } from './lib/estado/useSessaoSupabase';
import { useGateDeConta } from './lib/estado/useGateDeConta';
import { useAparencia, useHidratacaoDeAjustes } from './lib/estado/useAparencia';
import { useMetricas } from './lib/estado/useMetricas';
import { useRecompensas } from './lib/estado/useRecompensas';
import { useNavegacao } from './lib/estado/useNavegacao';

export default function App() {
  /* A interface acompanha "meu idioma" do perfil — um lugar só, no topo, para não haver tela que
     troque e tela que não. Ver `useIdiomaDaInterfaceEscolhido`. */
  useIdiomaDaInterfaceEscolhido();

  const [activeView, setActiveView] = useState<ViewType>('hub');
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const [resumingRecordingId, setResumingRecordingId] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  const { session, recovery, setRecovery, processingCallback } = useSessaoSupabase();

  const {
    anonimo, semContaAceito, setSemContaAceito, pedindoLogin, setPedindoLogin,
    gate, migracao, setMigracao, fecharGate,
  } = useGateDeConta();

  const {
    theme, setTheme, fonte, setFonte, darkMode, toggleDarkMode,
    isStudioOpen, setIsStudioOpen, buscaAberta, setBuscaAberta,
    ageProfile, setAgeProfile, menuPosition, setMenuPosition,
    soundEnabled, toggleSound, animationsEnabled, toggleAnimations,
    performanceMode, togglePerformanceMode, fontScale, setFontScale, cycleFontScale,
    setThemeState, setFonteState, setDarkMode, setAgeProfileState,
  } = useAparencia();

  // Entitlements: o servidor decide o plano; o cliente só cacheia para pintar. Recarrega quando a
  // sessão muda (login/logout), que é quando a resposta pode mudar.
  useEffect(() => {
    if (authRequired && !session) return;
    void carregarEntitlements();
  }, [session]);

  // Fase 2: carrega as sessões reais do backend (substitui o mockData seed).
  useEffect(() => {
    fetchSessions()
      .then(setRecordings)
      .catch(() => setRecordings([]));
  }, []);

  const { metrics, recordes, progress, setVersaoDasMetricas } = useMetricas(recordings.length);

  const {
    ctxConquistas, filaDeRecompensas, setFilaDeRecompensas,
    lojaAba, setLojaAba, abrirEstudio, equiparCtx,
  } = useRecompensas({
    metrics, recordes, progress, setVersaoDasMetricas,
    setTheme, setFonte, setMenuPosition, setIsStudioOpen,
  });

  useHidratacaoDeAjustes({ setThemeState, setDarkMode, setFonteState, setAgeProfileState, setOnboarded });

  const {
    analysisSubTab, setAnalysisSubTab,
    liveTranscription, setLiveTranscription,
    isChatOpen, setIsChatOpen,
    isChatDocked, setIsChatDocked,
    isChatMaximized, setIsChatMaximized,
    practiceSeed, setPracticeSeed,
    navigateTo,
  } = useNavegacao({
    activeView, setActiveView,
    selectedRecordingId, setSelectedRecordingId, setResumingRecordingId,
    recordings, lojaAba, setLojaAba, setPedindoLogin,
  });

  /**
   * `shouldRedirect=false` = "salvar e continuar na tela" (o usuário segue capturando).
   * O UPSERT importa: uma sessão retomada volta com o MESMO id, então um prepend cego
   * a duplicaria na Biblioteca.
   */
  const handleSaveRecording = (recording: Recording, shouldRedirect: boolean = true) => {
    setRecordings(prev =>
      prev.some(r => r.id === recording.id)
        ? prev.map(r => (r.id === recording.id ? recording : r))
        : [recording, ...prev]
    );
    setSelectedRecordingId(recording.id);
    setResumingRecordingId(null);
    // Salvar uma sessão é a conclusão mais concreta da app — é o momento que merece o acorde.
    play('success');
    if (shouldRedirect) {
      // Sem conta a análise não existe; o destino natural é jogar com o que acabou de ser gravado.
      if (anonimo) { setActiveView('play'); return; }
      setAnalysisSubTab('transcript');
      setActiveView('analysis');
    }
  };

  const selectedRecording = recordings.find(r => r.id === selectedRecordingId) || recordings[0];

  // Map sub tabs like reading and study to distinct views for precise iChat context matching
  const mappedActiveViewForChat = activeView === 'analysis'
    ? (analysisSubTab === 'study' ? 'study' : analysisSubTab === 'reading' ? 'reading' : 'analysis') as ViewType
    : activeView;

  // Marco 1: OAuth/recuperação voltando em /auth/callback — aguarda o supabase-js processar a URL.
  if (authRequired && processingCallback) {
    return <div className="flex h-tela w-full items-center justify-center bg-canvas text-ink-muted text-sm">Concluindo login…</div>;
  }
  // Marco 1: porta de login. Só no modo público (authRequired); no local é pulada inteira.
  if (authRequired && session === undefined) {
    return <div className="flex h-tela w-full items-center justify-center bg-canvas text-ink-muted text-sm">Carregando…</div>;
  }
  if (authRequired && recovery) {
    return (
      <Suspense fallback={<div className="flex h-tela w-full items-center justify-center bg-canvas text-ink-muted text-sm">Carregando…</div>}>
        <ResetPassword onDone={() => setRecovery(false)} />
        <Toaster />
      </Suspense>
    );
  }
  if (porta({ authRequired, temSessao: !!session, anonimoAceito: semContaAceito, pedindoLogin }) === 'login') {
    return (
      <Suspense fallback={<div className="flex h-tela w-full items-center justify-center bg-canvas text-ink-muted text-sm">Carregando…</div>}>
        <Login onContinuarSemConta={() => { aceitarAnonimo(); setSemContaAceito(true); setPedindoLogin(false); }} />
        <Toaster />
      </Suspense>
    );
  }

  if (onboarded === null) {
    return <div className="flex h-tela w-full items-center justify-center bg-canvas text-ink-muted text-sm">Carregando…</div>;
  }
  if (onboarded === false) {
    return (
      <Suspense fallback={<div className="flex h-tela w-full items-center justify-center bg-canvas text-ink-muted text-sm">Carregando…</div>}>
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
      activeView={activeView}
      onChangeView={navigateTo}
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
    theme, setTheme, darkMode, toggleDarkMode,
    onOpenStudio: abrirEstudio,
    ageProfile, setAgeProfile,
    fontScale, cycleFontScale,
    menuPosition, setMenuPosition,
    fonte, setFonte,
    nivel: progress.available ? progress.level : 99,
    soundEnabled, toggleSound,
    animationsEnabled, toggleAnimations,
    performanceMode, togglePerformanceMode,
    onOpenSearch: () => setBuscaAberta(true),
    onChangeView: navigateTo
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
    <div className="flex flex-col h-tela w-full bg-surface overflow-hidden relative">
      {/* Barra do topo: a de desktop quando a preferência é "topo"; senão, só a do celular. */}
      {menuPosition === 'top' ? shell : <MobileTopBar progress={progress} controls={mobileControls} />}

      <div className="flex-1 flex min-h-0 w-full">
        {menuPosition === 'left' && shell}

        <main className={`flex-1 min-w-0 flex flex-col h-full relative overflow-hidden bg-canvas age-${ageProfile}`}>
          {/* O AMBIENTE fica fora do perfil sênior de propósito: movimento contínuo de fundo é
              exatamente o que atrapalha quem já tem dificuldade de leitura. As RAJADAS continuam
              para os três, são curtas e confirmam uma ação que a pessoa acabou de fazer. */}
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
          {/* Os números que sobem ("+10", "×3") — camada própria, no topo da árvore, para não
              serem cortados pelo `overflow` de nenhum container de jogo. */}
          <FloatingScoreLayer />
        <LayoutEditorToolbar />
        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-ink-muted text-sm">Carregando…</div>}>
          {anonimo && exigeConta(activeView) && (
            <CartaoDeConvite view={activeView} onEntrar={() => setPedindoLogin(true)} onVoltar={() => setActiveView('hub')} />
          )}
          {activeView === 'hub' && (
            <Hub onChangeView={navigateTo} recordings={recordings} ageProfile={ageProfile} progress={progress} metrics={metrics} />
          )}
          {activeView === 'capture' && (
            <LiveCapture
              onSave={handleSaveRecording}
              onTranscriptChange={setLiveTranscription}
              resumingRecordingId={resumingRecordingId}
              recordings={recordings}
              onChangeView={navigateTo}
              ageProfile={ageProfile}
            />
          )}
          {activeView === 'library' && !anonimo && (
            <Library onChangeView={navigateTo} recordings={recordings} onRecordingsChange={setRecordings} ageProfile={ageProfile} />
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
          {activeView === 'metrics' && !anonimo && <Metrics recordings={recordings} onChangeView={navigateTo} ageProfile={ageProfile} metrics={metrics} />}

          {activeView === 'profile' && !anonimo && <Perfil progress={progress} ageProfile={ageProfile} />}
          {/* Plano e consumo. Diferente do Perfil, aparece TAMBÉM sem conta: é justamente
              quem não tem conta que precisa saber o que um plano daria. */}
          {activeView === 'planos' && <Planos />}
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
          {/* v3: recompensa entregue na hora — em qualquer tela, esperando a rodada fechar. */}
          <RecompensaDesbloqueada
            fila={filaDeRecompensas}
            onEquipar={(item) => equiparItem(item, equiparCtx)}
            onFechar={() => setFilaDeRecompensas((f) => f.slice(1))}
            onVerPersonalizar={() => navigateTo('loja', { aba: 'personalizar' })}
          />
          {activeView === 'settings' && (
            <Settings
              theme={theme}
              darkMode={darkMode}
              onOpenStudio={abrirEstudio}
              onReplayTour={() => setOnboarded(false)}
              onAbrirSobre={() => setActiveView('sobre')}
              onChangeView={navigateTo}
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
      <GateDeConta aberto={gate !== null} motivo={gate ?? ''} onFechar={fecharGate} onEntrar={() => { fecharGate(); setPedindoLogin(true); }} />
      <ModalDeMigracao
        aberto={migracao}
        onFechar={() => setMigracao(false)}
        onMigrou={() => { fetchSessions().then(setRecordings).catch(() => {}); void carregarEntitlements(); }}
      />

      <PracticeMenu
        onChangeView={navigateTo}
        sessionId={selectedRecording?.id}
      />

      {/* Overlays globais (chat + estúdio de layout) — lazy: não pesam no primeiro paint. */}
      <Suspense fallback={null}>
        {/* Global iChat assistant with layout capabilities */}
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
          isMaximized={isChatMaximized}
          setIsMaximized={setIsChatMaximized}
          practiceSeed={practiceSeed?.text}
          recordings={recordings}
          ageProfile={ageProfile}
        />

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
      <MobileNav activeView={activeView} onChangeView={navigateTo} ageProfile={ageProfile} />

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
      />

      {/* Host único dos avisos e das confirmações. Sem ele, `toast()` e `askConfirm()` não têm onde
          aparecer, e os erros voltam a ser invisíveis, que é o bug que eles existem para corrigir. */}
      <Toaster />
    </div>
  );
}
