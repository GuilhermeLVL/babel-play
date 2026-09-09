import { useEffect, useState } from 'react';

import { useCommandPalette } from '../../components/CommandPalette';
import type { AgeProfileType, FontScale,MenuPositionType } from '../../components/StudioHeader';
import { fetchSettings,patchUiSettings } from '../../data/api';
import { CREDENTIAL_KEY, MODE_KEY,PROFILE_KEY } from '../../gateway/activeProfile';
import type { FonteType,ThemeType } from '../appearance';
import { ativarLiberacaoTotal, liberadoTudo } from '../desbloqueios';
import { estaAnonimo } from '../identidade';
import { isAgeProfile, readAgeProfile, readStoredEnum, readStoredValue } from '../profile';
import { instalarRastroDoMouse } from '../rastroDoMouse';
import { installSfxDelegate } from '../sfxDelegate';
import { setSoundMuted } from '../soundFx';
import { hydrateTheme, persistTheme,readDarkMode, readFonte, readTheme } from '../theme';

const MENU_POSITION_KEY = 'babel.menu_position';
const MENU_POSITIONS: readonly MenuPositionType[] = ['top', 'bottom', 'left', 'right'];

export interface EstadoDaAparencia {
  theme: ThemeType;
  setTheme: (next: ThemeType) => void;
  fonte: FonteType;
  setFonte: (next: FonteType) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  isStudioOpen: boolean;
  setIsStudioOpen: (v: boolean) => void;
  buscaAberta: boolean;
  setBuscaAberta: (v: boolean) => void;
  ageProfile: AgeProfileType;
  setAgeProfile: (profile: AgeProfileType) => void;
  menuPosition: MenuPositionType;
  setMenuPosition: (pos: MenuPositionType) => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  animationsEnabled: boolean;
  toggleAnimations: () => void;
  performanceMode: boolean;
  togglePerformanceMode: () => void;
  fontScale: FontScale;
  setFontScale: (next: FontScale) => void;
  cycleFontScale: () => void;
  /** Setters crus — só para a hidratação das settings de UI, que aplica o que veio do servidor. */
  setThemeState: (v: ThemeType) => void;
  setFonteState: (v: FonteType) => void;
  setDarkMode: (v: boolean) => void;
  setAgeProfileState: (v: AgeProfileType) => void;
}

/**
 * Aparência: tema, fonte, escala de texto, som, animações, modo desempenho, posição do menu e
 * perfil de idade. Um bloco só, na mesma ordem em que os efeitos rodavam dentro do `App`.
 */
export function useAparencia(): EstadoDaAparencia {
  const [theme, setThemeState] = useState<ThemeType>(readTheme);
  const [fonte, setFonteState] = useState<FonteType>(readFonte);
  const [darkMode, setDarkMode] = useState<boolean>(readDarkMode);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  /* O atalho vem do hook; o botão do shell escreve no mesmo estado. Enquanto o Study estiver
     montado ele assume o Ctrl+K (pilha LIFO em `useCommandPalette`) e este fica quieto. */
  const [buscaAberta, setBuscaAberta] = useCommandPalette();
  const [ageProfile, setAgeProfileState] = useState<AgeProfileType>(readAgeProfile);

  const [menuPosition, setMenuPositionState] = useState<MenuPositionType>(
    () => readStoredEnum(MENU_POSITION_KEY, MENU_POSITIONS, 'top')
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
    /* O default acompanha o perfil padrão (sênior / Leitura ampliada): 'lg'. O boot direto em
       senior não passa por `setAgeProfile`, então a sugestão de fonte de lá não roda — o padrão
       precisa nascer certo aqui. Preferência gravada continua vencendo. */
    () => readStoredEnum('babel.font_scale', FONT_SCALE_ORDER, 'lg')
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
    /**
     * O ZOOM PRECISA SER LEGÍVEL PELO CSS — e sem isto o A± estourava a altura do app inteiro.
     *
     * `zoom` no `body` escala o pixel CSS, mas as unidades de VIEWPORT (`dvh`/`vh`/`vw`) continuam
     * resolvendo contra a janela real e só DEPOIS são multiplicadas pelo zoom. A casca usava
     * `h-dvh`: a 1,3 ela virava 130% da janela. Medido no Termo, a 1,5 numa janela de 893px, o
     * painel tinha 1250px — e o teclado, que é o último filho, simplesmente ficava fora da tela.
     *
     * Publicar a escala como variável deixa o CSS dividir de volta (ver `.h-tela` em index.css).
     * Fica no `documentElement`, que está FORA do subarvore com zoom: assim o valor lido é o
     * número puro, e não um número já escalado.
     */
    document.documentElement.style.setProperty('--zoom-a', scaleMap[fontScale]);
  }, [fontScale]);

  const setFontScale = (next: FontScale) => {
    setFontScaleState(next);
    localStorage.setItem('babel.font_scale', next);
  };

  /**
   * UM botão que CICLA (pedido do dono, 31/08): clique avança a escala e, na máxima, volta à
   * mínima. Substitui o trio (menos / indicador / mais) — menos alvos no cabeçalho, e o próprio
   * "A" crescendo mostra onde se está. O salto xl->sm é anunciado pelo aria-label do botão.
   */
  const cycleFontScale = () => {
    const idx = FONT_SCALE_ORDER.indexOf(fontScale);
    setFontScale(FONT_SCALE_ORDER[(idx + 1) % FONT_SCALE_ORDER.length]);
  };

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
    /* SÓ EM DESENVOLVIMENTO (2026-08-28): na versão publicada este atalho era um jeito de burlar
       níveis, Seeds e conquistas. Em produção o objeto e o parâmetro `?liberar` não existem. */
    const env = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
    if (!env?.DEV) return;
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

  return {
    theme, setTheme, fonte, setFonte, darkMode, toggleDarkMode,
    isStudioOpen, setIsStudioOpen, buscaAberta, setBuscaAberta,
    ageProfile, setAgeProfile, menuPosition, setMenuPosition,
    soundEnabled, toggleSound, animationsEnabled, toggleAnimations,
    performanceMode, togglePerformanceMode, fontScale, setFontScale, cycleFontScale,
    setThemeState, setFonteState, setDarkMode, setAgeProfileState,
  };
}

export interface AlvosDaHidratacao {
  setThemeState: (v: ThemeType) => void;
  setDarkMode: (v: boolean) => void;
  setFonteState: (v: FonteType) => void;
  setAgeProfileState: (v: AgeProfileType) => void;
  setOnboarded: (v: boolean) => void;
}

/**
 * Hidratação das settings de UI vindas do servidor. Vive aqui, junto da aparência, mas continua
 * sendo uma chamada separada no `App`: o efeito precisa rodar na MESMA posição de antes (depois
 * das recompensas, antes da navegação), e um hook chamado no lugar certo é o que garante isso.
 */
export function useHidratacaoDeAjustes(alvos: AlvosDaHidratacao): void {
  const { setThemeState, setDarkMode, setFonteState, setAgeProfileState, setOnboarded } = alvos;
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
        setOnboarded(estaAnonimo() ? true : !!ui?.onboarded);
      })
      .catch(() => setOnboarded(true)); // se settings falhar, não trava o app
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
