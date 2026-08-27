import React from 'react';
import type { ThemeType } from '../lib/appearance';
import type { ViewType } from '../types';
import type { DerivedProgress } from '../lib/progress';
import NavBar from './shell/NavBar';
import NavRail from './shell/NavRail';
import type { ControlClusterProps, FontScale } from './shell/ControlCluster';
import type { AgeProfileType, MenuPositionType } from './shell/navItems';

export type { AgeProfileType, MenuPositionType } from './shell/navItems';
export type { FontScale } from './shell/ControlCluster';

interface StudioHeaderProps {
  fonte: ControlClusterProps['fonte'];
  setFonte: ControlClusterProps['setFonte'];
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  onOpenStudio: () => void;
  ageProfile: AgeProfileType;
  setAgeProfile: (profile: AgeProfileType) => void;
  onToggleChat: () => void;
  fontScale: FontScale;
  increaseFontScale: () => void;
  decreaseFontScale: () => void;
  activeView: ViewType;
  onChangeView: (view: ViewType) => void;
  menuPosition: MenuPositionType;
  setMenuPosition: (pos: MenuPositionType) => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  animationsEnabled: boolean;
  toggleAnimations: () => void;
  performanceMode: boolean;
  togglePerformanceMode: () => void;
  onOpenSearch: () => void;
  progress: DerivedProgress;
}

/**
 * Casca fina: escolhe a moldura e repassa os controles.
 *
 * Antes, um único componente de 400 linhas tentava ser barra do topo, rodapé E rail vertical
 * via ternários encadeados dentro do `className` — era daí que vinha o acabamento irregular
 * (borda no lado errado, altura que não fechava, popover cortado). A estrutura agora mora em
 * `shell/NavBar` e `shell/NavRail`; aqui só se decide qual delas entra.
 */
export default function StudioHeader({
  theme,
  setTheme,
  darkMode,
  toggleDarkMode,
  onOpenStudio,
  ageProfile,
  setAgeProfile,
  onToggleChat,
  fontScale,
  increaseFontScale,
  decreaseFontScale,
  activeView,
  onChangeView,
  menuPosition,
  setMenuPosition,
  fonte,
  setFonte,
  soundEnabled,
  toggleSound,
  animationsEnabled,
  toggleAnimations,
  performanceMode,
  togglePerformanceMode,
  onOpenSearch,
  progress
}: StudioHeaderProps) {
  const controls: Omit<ControlClusterProps, 'orientation'> = {
    theme,
    setTheme,
    fonte,
    setFonte,
    darkMode,
    toggleDarkMode,
    onOpenStudio,
    ageProfile,
    setAgeProfile,
    onToggleChat,
    fontScale,
    increaseFontScale,
    decreaseFontScale,
    menuPosition,
    setMenuPosition,
    soundEnabled,
    toggleSound,
    animationsEnabled,
    toggleAnimations,
    performanceMode,
    togglePerformanceMode,
    onOpenSearch,
    onChangeView
  };

  if (menuPosition === 'left' || menuPosition === 'right') {
    return (
      <NavRail
        activeView={activeView}
        onChangeView={onChangeView}
        ageProfile={ageProfile}
        progress={progress}
        side={menuPosition}
        controls={controls}
      />
    );
  }

  return (
    <NavBar
      activeView={activeView}
      onChangeView={onChangeView}
      ageProfile={ageProfile}
      progress={progress}
      edge={menuPosition}
      controls={controls}
    />
  );
}
