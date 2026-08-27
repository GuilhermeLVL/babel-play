import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react';
import { EDICAO_LEVE } from './lib/edicao';
import OnboardingLeve from './components/OnboardingLeve';
import LayoutEditorToolbar from './components/LayoutEditorToolbar';
import PracticeMenu from './components/PracticeMenu';
import Hub from './components/views/Hub'; // tela inicial, eager p/ primeiro paint instantâneo

// CODE-SPLITTING: as demais views e overlays pesados carregam SOB DEMANDA. Antes, tudo caía num único
// bundle de arranque (~1,9 MB) — incluindo o onnxruntime-web/VAD (Captura), o recharts (Métricas) e o
// gateway/offlineTranscribe (Análise/Biblioteca), pesos que só importam quando você abre aquela tela.
// Agora cada view puxa o seu chunk quando aberta → app leve e dinâmica.
const LiveCapture = lazy(() => import('./components/views/LiveCapture'));
const Library = lazy(() => import('./components/views/Library'));
const Analysis = lazy(() => import('./components/views/Analysis'));
const Settings = lazy(() => import('./components/views/Settings'));
const Metrics = lazy(() => import('./components/views/Metrics'));
const Play = lazy(() => import('./components/views/Play'));
const IChat = lazy(() => import('./components/IChat'));
const LayoutStudio = lazy(() => import('./components/LayoutStudio'));
const Perfil = lazy(() => import('./components/views/Perfil'));
const Sobre = lazy(() => import('./components/views/Sobre'));
const Loja = lazy(() => import('./components/views/Loja'));
const Login = lazy(() => import('./components/Login'));
const ResetPassword = lazy(() => import('./components/auth/ResetPassword'));
// O tour de boas-vindas só existe para quem AINDA não passou por ele (`onboarded === false`) —
// para todo mundo mais era peso morto no arranque (25 kB de fonte no chunk de entrada). Enquanto
// `onboarded` é `null` a tela já mostrava "Carregando…", então o fallback do Suspense abaixo é a
// mesma pintura que o usuário via antes: nada muda na tela, só o momento do download.
const Onboarding = lazy(() => import('./components/Onboarding'));
import { ViewType, Recording } from './types';
import { askNavGuard } from './lib/navGuard';
import FloatingScoreLayer from './components/FloatingScoreLayer';
import BuscaGlobal from './components/BuscaGlobal';
import { useCommandPalette } from './components/CommandPalette';
import type { PracticeSeed } from './lib/sentences';
import { fetchSessions, fetchSettings, fetchMetrics, patchUiSettings, type AppMetrics } from './data/api';
import Toaster, { toast } from './components/Toast';
import { PROFILE_KEY, CREDENTIAL_KEY, MODE_KEY } from './gateway/activeProfile';
import type { ThemeType, FonteType } from './lib/appearance';
import { readTheme, readDarkMode, readFonte, hydrateTheme, persistTheme } from './lib/theme';
import { carregarSupabase, authRequired } from './lib/supabase';
import { carregarEntitlements, limparEntitlements } from './lib/entitlements';
import { armarIdentidade, definirIdentidade, estaAnonimo, aoMudarIdentidade } from './lib/identidade';
import { EVENTO_EXIGE_CONTA } from './data/efemero/servidor';
import { aceitarAnonimo, anonimoAceito, exigeConta, motivoDoGate, porta } from './components/conta/exigeConta';
import CartaoDeConvite from './components/conta/CartaoDeConvite';
import GateDeConta from './components/conta/GateDeConta';
import ModalDeMigracao from './components/conta/ModalDeMigracao';
import { temDadosLocais } from './data/efemero/store';

import StudioHeader, { type AgeProfileType, type MenuPositionType, type FontScale } from './components/StudioHeader';
import MobileNav from './components/shell/MobileNav';
import MobileTopBar from './components/shell/MobileTopBar';
import ParticleCanvas from './components/ParticleCanvas';
import { setSoundMuted, play } from './lib/soundFx';
import { installSfxDelegate } from './lib/sfxDelegate';
import { instalarRastroDoMouse } from './lib/rastroDoMouse';
import { deriveProgress } from './lib/progress';
import { recompensasDoNivel, rotuloDaRecompensa, ativarLiberacaoTotal, liberadoTudo } from './lib/desbloqueios';
import { comemorar } from './lib/juice';
import { isAgeProfile, readAgeProfile, readStoredEnum, readStoredValue } from './lib/profile';
import { emitBurst } from './lib/effects';
import { isOnAuthCallback, clearAuthCallbackUrl } from './lib/authCallback';
import { lerUrlAtual, publicarUrl, type ViewDeRota, type EstadoDeRota } from './lib/rotas';

const MENU_POSITION_KEY = 'babel.menu_position';
const MENU_POSITIONS: readonly MenuPositionType[] = ['top', 'bottom', 'left', 'right'];

export default function App() {
  const [activeView, setActiveView] = useState<ViewType>('hub');
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const [resumingRecordingId, setResumingRecordingId] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  // Marco 1: sessão Supabase — só relevante no modo público (authRequired). No local fica null.
  const [session, setSession] = useState<{ user?: unknown } | null | undefined>(authRequired ? undefined : null);
  // Marco 1: fluxo de recuperação. O link do e-mail dispara PASSWORD_RECOVERY (com sessão temporária);
  // enquanto ativo, a tela de redefinir senha tem precedência sobre a porta de login e o app.
  const [recovery, setRecovery] = useState(false);
  // OAuth/recuperação voltam em /auth/callback: mostra um spinner até a sessão resolver e limpa a URL.
  const [processingCallback, setProcessingCallback] = useState(authRequired && isOnAuthCallback());
  /**
   * O pacote do Supabase agora chega por `import()` (ver lib/supabase — ele era 96% código não
   * executado no arranque de quem não usa login). Isso custa um `await` aqui, porque
   * `onAuthStateChange` não pode mais ser chamado na hora.
   *
   * A TELA NÃO MUDA: enquanto `session` é `undefined` o App já pintava "Carregando…" — a espera
   * pelo `getSession()`, que é uma ida ao servidor. Agora essa mesma espera cobre também o
   * download do pacote, que acontece antes e é a parte curta. Nada de piscada de login: o gate
   * `session === undefined` é testado ANTES do `!session` que monta a porta de login.
   *
   * `vivo` cobre a desmontagem no meio da carga, e a inscrição é desfeita mesmo que ela chegue
   * depois — senão um StrictMode em desenvolvimento deixaria um listener órfão por montagem.
   */
  useEffect(() => {
    if (!authRequired) return;
    armarIdentidade();
    let vivo = true;
    let inscricao: { unsubscribe: () => void } | null = null;
    // Sem resposta do Supabase a identidade é `anonimo`, não `carregando`: ficar carregando para
    // sempre deixaria todo `apiFetch` pendurado.
    const semSessao = () => { if (vivo) { setSession(null); definirIdentidade('anonimo'); } };
    void (async () => {
      try {
        const sb = await carregarSupabase();
        if (!sb || !vivo) { if (!sb) semSessao(); return; }
        sb.auth.getSession().then(({ data }) => {
          if (!vivo) return;
          setSession(data.session);
          definirIdentidade(data.session ? 'conta' : 'anonimo');
          clearAuthCallbackUrl();
          setProcessingCallback(false);
        }).catch(semSessao);
        const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
          if (event === 'PASSWORD_RECOVERY') setRecovery(true);
          setSession(s);
          if (s) definirIdentidade('conta');
          else if (event === 'SIGNED_OUT') { definirIdentidade('anonimo'); limparEntitlements(); }
        });
        if (!vivo) { sub.subscription.unsubscribe(); return; }
        inscricao = sub.subscription;
      } catch {
        semSessao();
      }
    })();
    return () => { vivo = false; inscricao?.unsubscribe(); };
  }, []);

  /**
   * Acesso SEM conta (soft gate, D10). `anonimo` espelha a identidade; `semContaAceito` lembra a
   * escolha "continuar sem conta"; `pedindoLogin` é a pessoa sem conta pedindo a porta de volta
   * (menu, convite, gate). `gate` é o modal contextual — o que motivou, em linguagem de gente.
   */
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
    if (EDICAO_LEVE) return;
    window.addEventListener(EVENTO_EXIGE_CONTA, h);
    return () => window.removeEventListener(EVENTO_EXIGE_CONTA, h);
  }, []);
  const fecharGate = () => {
    try { sessionStorage.setItem('babel.convite_visto', '1'); } catch { /* best-effort */ }
    setGate(null);
  };

  const [theme, setThemeState] = useState<ThemeType>(readTheme);
  const [fonte, setFonteState] = useState<FonteType>(readFonte);
  const [darkMode, setDarkMode] = useState<boolean>(readDarkMode);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  /* O atalho vem do hook; o botão do shell escreve no mesmo estado. Enquanto o Study estiver
     montado ele assume o Ctrl+K (pilha LIFO em `useCommandPalette`) e este fica quieto. */
  const [buscaAberta, setBuscaAberta] = useCommandPalette();
  const [ageProfile, setAgeProfileState] = useState<AgeProfileType>(readAgeProfile);

  const [menuPosition, setMenuPositionState] = useState<MenuPositionType>(
    () => readStoredEnum(MENU_POSITION_KEY, MENU_POSITIONS, EDICAO_LEVE ? 'left' : 'top')
  );
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    return readStoredValue('babel.sound_enabled') !== 'false';
  });
  /**
   * ANIMAÇÕES — a preferência do sistema define o PADRÃO; a sua escolha explícita vence.
   *
   * Antes o `prefers-reduced-motion` do sistema vetava tudo por dentro do `ParticleCanvas`, mesmo
   * com o botão do app mostrando "ativado". A interface prometia efeitos e não entregava, sem
   * recurso nenhum. Agora: se nada está guardado, respeitamos o sistema (é a atitude correta na
   * primeira execução); se o usuário mexeu no interruptor, ele está nos dizendo diretamente o que
   * quer — e isso tem precedência sobre uma inferência do sistema operacional.
   */
  const [animationsEnabled, setAnimationsEnabledState] = useState<boolean>(() => {
    const guardado = readStoredValue('babel.animations_enabled');
    if (guardado === 'true') return true;
    if (guardado === 'false') return false;
    return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  });
  const [performanceMode, setPerformanceModeState] = useState<boolean>(() => {
    return readStoredValue('babel.performance_mode') === 'true';
  });

  const FONT_SCALE_ORDER: FontScale[] = ['sm', 'md', 'lg', 'xl'];
  const [fontScale, setFontScaleState] = useState<FontScale>(
    () => readStoredEnum('babel.font_scale', FONT_SCALE_ORDER, 'md')
  );

  /**
   * ESCALA DE TEXTO — UM mecanismo, não dois.
   *
   * A versão anterior mexia no `documentElement.style.fontSize` E aplicava `.font-scale-xl`
   * (`font-size: 1.3em !important`) no <main>. As duas se multiplicavam: no XL o texto saía a
   * 1,75× e, somado ao `.age-senior { font-size: 18px }`, virava a "fonte gigante" que quebrava
   * o layout. Aqui fica só a raiz — todo `rem` da app acompanha, e uma vez só.
   */
  useEffect(() => {
    /* Trocar o font-size da raiz só escala o que é `rem` — e boa parte da app usa utilitários em
       PX (`text-[13px]`), que ficavam do mesmo tamanho: o A+/A- "não funcionava" (reclamação real,
       2026-08-27). `zoom` escala o pixel CSS inteiro (px, rem, ícones, espaçamentos juntos) e é
       suportado pelos navegadores que o app já exige (Chrome/Edge; Firefox 126+). */
    const scaleMap: Record<FontScale, string> = {
      sm: '0.94',
      md: '1',
      lg: '1.15',
      xl: '1.3',
    };
    document.documentElement.style.fontSize = '100%';
    (document.body.style as unknown as { zoom: string }).zoom = scaleMap[fontScale];
  }, [fontScale]);

  const setFontScale = (next: FontScale) => {
    setFontScaleState(next);
    localStorage.setItem('babel.font_scale', next);
  };

  const stepFontScale = (delta: 1 | -1) => {
    const idx = FONT_SCALE_ORDER.indexOf(fontScale);
    const next = FONT_SCALE_ORDER[Math.min(FONT_SCALE_ORDER.length - 1, Math.max(0, idx + delta))];
    if (next !== fontScale) setFontScale(next);
  };

  const increaseFontScale = () => stepFontScale(1);
  const decreaseFontScale = () => stepFontScale(-1);

  const setAgeProfile = (profile: AgeProfileType) => {
    setAgeProfileState(profile);
    localStorage.setItem('babel.age_profile', profile);
    void patchUiSettings({ ageProfile: profile });
    // O perfil SUGERE uma escala confortável, mas só quando o usuário ainda não escolheu a dele.
    // Antes, trocar de perfil zerava a escolha explícita de quem tinha acabado de ajustar o A+/A-.
    if (!readStoredValue('babel.font_scale')) {
      setFontScaleState(profile === 'senior' ? 'lg' : 'md');
    }
  };

  const setMenuPosition = (pos: MenuPositionType) => {
    setMenuPositionState(pos);
    localStorage.setItem(MENU_POSITION_KEY, pos);
  };

  const toggleSound = () => {
    setSoundEnabledState(prev => {
      const next = !prev;
      localStorage.setItem('babel.sound_enabled', String(next));
      setSoundMuted(!next);
      return next;
    });
  };

  const toggleAnimations = () => {
    setAnimationsEnabledState(prev => {
      const next = !prev;
      localStorage.setItem('babel.animations_enabled', String(next));
      return next;
    });
  };

  const togglePerformanceMode = () => {
    setPerformanceModeState(prev => {
      const next = !prev;
      localStorage.setItem('babel.performance_mode', String(next));
      return next;
    });
  };

  /**
   * As duas classes que o CSS observa. `performance-mode` corta sombras compostas, desfoques e
   * gradientes decorativos; `animations-off` corta o movimento. São independentes de propósito:
   * quem tem enjoo de movimento não quer necessariamente uma app feia, e quem tem um PC fraco
   * não perde nada em manter uma transição de 150ms.
   */
  useEffect(() => {
    document.body.classList.toggle('performance-mode', performanceMode);
  }, [performanceMode]);

  /**
   * DUAS classes, não uma. `animations-off` corta o movimento quando o usuário desliga;
   * `animations-on` é o que autoriza o CSS a IGNORAR o `prefers-reduced-motion` do sistema
   * (ver o bloco da media query em index.css). Sem a segunda, quem tem "reduzir movimento" no
   * Windows não conseguia reativar as transições nem pedindo.
   */
  useEffect(() => {
    document.body.classList.toggle('animations-off', !animationsEnabled);
    document.body.classList.toggle('animations-on', animationsEnabled);
  }, [animationsEnabled]);

  // Recuo inferior para os elementos `fixed` quando a barra fica no rodapé (ver index.css).
  useEffect(() => {
    document.body.classList.toggle('shell-bar-bottom', menuPosition === 'bottom');
  }, [menuPosition]);

  useEffect(() => {
    setSoundMuted(!soundEnabled);
  }, [soundEnabled]);

  /**
   * Som em TODA a app, de um lugar só. O listener deduz o efeito da semântica que cada elemento
   * já declara (`aria-pressed`, `aria-expanded`, `role`…) — ver lib/sfxDelegate para o porquê de
   * não ter sido botão por botão. Respeita o mute pelo `setSoundMuted` acima.
   */
  useEffect(() => installSfxDelegate(), []);
  // Rastro do mouse (item de loja): listeners globais uma vez; o estilo é lido a cada evento.
  useEffect(() => instalarRastroDoMouse(), []);

  /* LIBERACAO TOTAL para demonstracao: `window.babel.liberarTudo()` (ou `.travarTudo()`) no
     console, ou abrir com `?liberar=1`. So destrava cosmeticos (temas/posicoes/estudio). */
  useEffect(() => {
    (window as unknown as { babel?: unknown }).babel = {
      liberarTudo: () => { ativarLiberacaoTotal(true); location.reload(); },
      travarTudo: () => { ativarLiberacaoTotal(false); location.reload(); },
      liberado: () => liberadoTudo(),
    };
    if (new URLSearchParams(location.search).get('liberar') === '1') ativarLiberacaoTotal(true);
  }, []);

  const setTheme = (next: ThemeType) => {
    setThemeState(next);
    persistTheme({ theme: next });
  };
  const setFonte = (next: FonteType) => {
    setFonteState(next);
    persistTheme({ fonte: next });
  };
  const toggleDarkMode = () => {
    setDarkMode(prev => {
      const next = !prev;
      persistTheme({ darkMode: next });
      return next;
    });
  };

  // Entitlements: o servidor decide o plano; o cliente só cacheia para pintar. Recarrega quando a
  // sessão muda (login/logout), que é quando a resposta pode mudar.
  useEffect(() => {
    if (EDICAO_LEVE || (authRequired && !session)) return;
    void carregarEntitlements();
  }, [session]);

  // Fase 2: carrega as sessões reais do backend (substitui o mockData seed).
  useEffect(() => {
    fetchSessions()
      .then(setRecordings)
      .catch(() => setRecordings([]));
  }, []);

  /**
   * MÉTRICAS DO PERFIL — carregadas UMA vez, aqui, e distribuídas por prop.
   * O StudioHeader chamava `fetchMetrics()` por conta própria em paralelo ao Hub: duas
   * requisições para o mesmo endpoint e, quando ela falhava, um número inventado na tela.
   * Recarrega quando a lista de sessões muda, que é quando o dado de fato envelhece.
   */
  const [metrics, setMetrics] = useState<AppMetrics | null>(null);
  useEffect(() => {
    let alive = true;
    fetchMetrics()
      .then((m) => { if (alive) setMetrics(m); })
      .catch(() => { if (alive) setMetrics(null); });
    return () => { alive = false; };
  }, [recordings.length]);

  const progress = useMemo(() => deriveProgress(metrics), [metrics]);

  /* SUBIU DE NÍVEL → festa + o que destravou. O último nível visto fica no navegador; na primeira
     visita só registra (ninguém "sobe" para o nível atual). Aparência é recompensa (desbloqueios). */
  useEffect(() => {
    if (!progress.available) return;
    let visto = 0;
    try { visto = Number(localStorage.getItem('babel.nivel_visto')) || 0; } catch { /* sem storage */ }
    if (visto === 0) { try { localStorage.setItem('babel.nivel_visto', String(progress.level)); } catch { /* idem */ } return; }
    if (progress.level > visto) {
      try { localStorage.setItem('babel.nivel_visto', String(progress.level)); } catch { /* idem */ }
      comemorar('subiuNivel', null, { tremer: true });
      const novidades: string[] = [];
      for (let n = visto + 1; n <= progress.level; n++) for (const r of recompensasDoNivel(n)) novidades.push(rotuloDaRecompensa(r));
      toast.ok(novidades.length > 0
        ? `Nível ${progress.level}! Você destravou: ${novidades.join(', ')}.`
        : `Nível ${progress.level}! Continue jogando — o próximo desbloqueio vem aí.`);
    }
  }, [progress.available, progress.level]);

  /**
   * SUBIDA DE NÍVEL — o único momento que a app comemora com força.
   *
   * Detectado comparando o nível derivado entre atualizações de métrica (ver lib/progress). O
   * `useRef` guarda o nível ANTERIOR: sem ele, a primeira carga dispararia a comemoração para
   * quem já estava no nível 27 há meses.
   */
  const prevLevelRef = useRef<number | null>(null);
  useEffect(() => {
    if (!progress.available) return;
    const anterior = prevLevelRef.current;
    prevLevelRef.current = progress.level;
    if (anterior !== null && progress.level > anterior) {
      play('levelUp');
      emitBurst(window.innerWidth / 2, window.innerHeight * 0.35, 'levelUp');
    }
  }, [progress.available, progress.level]);

  // Onboarding: lê a escolha do usuário (settings.ui) e espelha no localStorage para
  // o gateway (getActiveProfile) refletir provedor/credencial já no primeiro build.
  // O mesmo blob carrega a aparência — o servidor é a cópia durável.
  useEffect(() => {
    fetchSettings()
      .then((s) => {
        let ui: any;
        try { ui = s?.ui ? JSON.parse(s.ui) : null; } catch { ui = null; }
        if (s?.activeProfileId) localStorage.setItem(PROFILE_KEY, s.activeProfileId);
        if (ui?.credentialId) localStorage.setItem(CREDENTIAL_KEY, ui.credentialId);
        else localStorage.removeItem(CREDENTIAL_KEY);
        if (ui?.providerMode) localStorage.setItem(MODE_KEY, ui.providerMode);
        // Perfil de exibição — o servidor é a cópia durável. Antes ele só existia no localStorage:
        // quem configurava a app para um filho ou para um pai perdia a escolha na outra máquina.
        if (isAgeProfile(ui?.ageProfile)) {
          setAgeProfileState(ui.ageProfile);
          localStorage.setItem('babel.age_profile', ui.ageProfile);
        }
        const applied = hydrateTheme(ui);
        setThemeState(applied.theme);
        setDarkMode(applied.darkMode);
        setFonteState(applied.fonte);
        // Sem conta não há onboarding: ele configura credenciais e perfil, que são da conta.
        setOnboarded(EDICAO_LEVE ? !!ui?.onboarded : estaAnonimo() ? true : !!ui?.onboarded);
      })
      .catch(() => setOnboarded(true)); // se settings falhar, não trava o app
  }, []);
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
    doNavigate(e.subTab === 'study' ? 'study' : e.view, { id: e.sessionId, subTab: e.subTab });
  }, []);

  /* 2) NAVEGAÇÃO → URL. Espelha o estado corrente sempre que ele muda. */
  useEffect(() => {
    if (!rotaRestaurada.current || isOnAuthCallback()) return;
    publicarUrl({
      view: (activeView === 'study' || activeView === 'reading' ? 'analysis' : activeView) as ViewDeRota,
      sessionId: activeView === 'analysis' ? (selectedRecordingId ?? recordings[0]?.id ?? undefined) : undefined,
      subTab: activeView === 'analysis' ? (analysisSubTab as EstadoDeRota['subTab']) : undefined,
    });
  }, [activeView, selectedRecordingId, recordings, analysisSubTab]);

  /* 3) BOTÃO VOLTAR. Sem isto, "voltar" saía do app — era o beco relatado na auditoria.
        Passa pelo `navGuard`: uma captura em andamento ainda pode pedir confirmação. */
  useEffect(() => {
    const aoVoltar = () => {
      const e = lerUrlAtual();
      navigateTo(e.subTab === 'study' ? 'study' : e.view, { id: e.sessionId, subTab: e.subTab });
    };
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, []);

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
    return <div className="flex h-screen w-full items-center justify-center bg-canvas text-ink-muted text-sm">Concluindo login…</div>;
  }
  // Marco 1: porta de login. Só no modo público (authRequired); no local é pulada inteira.
  if (authRequired && session === undefined) {
    return <div className="flex h-screen w-full items-center justify-center bg-canvas text-ink-muted text-sm">Carregando…</div>;
  }
  if (authRequired && recovery) {
    return (
      <Suspense fallback={<div className="flex h-screen w-full items-center justify-center bg-canvas text-ink-muted text-sm">Carregando…</div>}>
        <ResetPassword onDone={() => setRecovery(false)} />
        <Toaster />
      </Suspense>
    );
  }
  if (porta({ authRequired, temSessao: !!session, anonimoAceito: semContaAceito, pedindoLogin }) === 'login') {
    return (
      <Suspense fallback={<div className="flex h-screen w-full items-center justify-center bg-canvas text-ink-muted text-sm">Carregando…</div>}>
        <Login onContinuarSemConta={() => { aceitarAnonimo(); setSemContaAceito(true); setPedindoLogin(false); }} />
        <Toaster />
      </Suspense>
    );
  }

  if (onboarded === null) {
    return <div className="flex h-screen w-full items-center justify-center bg-canvas text-ink-muted text-sm">Carregando…</div>;
  }
  if (onboarded === false) {
    return (
      <Suspense fallback={<div className="flex h-screen w-full items-center justify-center bg-canvas text-ink-muted text-sm">Carregando…</div>}>
        {EDICAO_LEVE ? <OnboardingLeve onComplete={() => setOnboarded(true)} /> : <Onboarding onComplete={() => setOnboarded(true)} />}
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
      onOpenStudio={() => setIsStudioOpen(true)}
      ageProfile={ageProfile}
      setAgeProfile={setAgeProfile}
      onToggleChat={() => setIsChatOpen((prev) => !prev)}
      fontScale={fontScale}
      increaseFontScale={increaseFontScale}
      decreaseFontScale={decreaseFontScale}
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
    onOpenStudio: () => setIsStudioOpen(true),
    ageProfile, setAgeProfile,
    onToggleChat: () => setIsChatOpen((prev) => !prev),
    fontScale, increaseFontScale, decreaseFontScale,
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
    <div className="flex flex-col h-dvh w-full bg-surface overflow-hidden relative">
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
          {!EDICAO_LEVE && anonimo && exigeConta(activeView) && (
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
          {activeView === 'library' && (EDICAO_LEVE || !anonimo) && (
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
          {activeView === 'analysis' && (EDICAO_LEVE || !anonimo) && (
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
          {activeView === 'metrics' && (EDICAO_LEVE || !anonimo) && <Metrics recordings={recordings} onChangeView={navigateTo} ageProfile={ageProfile} />}

          {activeView === 'profile' && !anonimo && <Perfil progress={progress} ageProfile={ageProfile} />}
          {activeView === 'sobre' && <Sobre />}
          {activeView === 'loja' && (
            <Loja
              progress={progress}
              theme={theme}
              setTheme={setTheme}
              fonte={fonte}
              setFonte={setFonte}
              menuPosition={menuPosition}
              setMenuPosition={setMenuPosition}
              onOpenStudio={() => setIsStudioOpen(true)}
            />
          )}
          {activeView === 'settings' && (
            <Settings
              theme={theme}
              darkMode={darkMode}
              onOpenStudio={() => setIsStudioOpen(true)}
              onReplayTour={() => setOnboarded(false)}
              onAbrirSobre={() => setActiveView('sobre')}
              nivel={progress.available ? progress.level : 99}
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
      {!EDICAO_LEVE && <GateDeConta aberto={gate !== null} motivo={gate ?? ''} onFechar={fecharGate} onEntrar={() => { fecharGate(); setPedindoLogin(true); }} />}
      {!EDICAO_LEVE && <ModalDeMigracao
        aberto={migracao}
        onFechar={() => setMigracao(false)}
        onMigrou={() => { fetchSessions().then(setRecordings).catch(() => {}); void carregarEntitlements(); }}
      />}

      <PracticeMenu
        onChangeView={navigateTo}
        sessionId={selectedRecording?.id}
      />

      {/* Overlays globais (chat + estúdio de layout) — lazy: não pesam no primeiro paint. */}
      <Suspense fallback={null}>
        {/* Global iChat assistant with layout capabilities */}
        {/* Tutor iChat depende de /api/gemini/chat: fora da edição leve. */}
        {!EDICAO_LEVE && <IChat
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
        />}

        {isStudioOpen && (
          <LayoutStudio
            isOpen={isStudioOpen}
            onClose={() => setIsStudioOpen(false)}
            theme={theme}
            setTheme={setTheme}
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
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
