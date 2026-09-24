import { Moon, Search, SlidersHorizontal } from 'lucide-react';

import type { FonteType, ThemeType } from '../../lib/appearance';
import { t } from '../../lib/i18n';
import CentralDeNotificacoes from './CentralDeNotificacoes';
import MenuDaConta from './MenuDaConta';
import type { AgeProfileType, MenuPositionType } from './navItems';

export type FontScale = 'sm' | 'md' | 'lg' | 'xl';

export interface ControlClusterProps {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  onOpenStudio: () => void;
  ageProfile: AgeProfileType;
  setAgeProfile: (profile: AgeProfileType) => void;
  fontScale: FontScale;
  cycleFontScale: () => void;
  menuPosition: MenuPositionType;
  setMenuPosition: (pos: MenuPositionType) => void;
  fonte: FonteType;
  setFonte: (f: FonteType) => void;
  /** Nível do jogador (deriveProgress) — aparência é recompensa: o que falta fica com cadeado. */
  nivel: number;
  soundEnabled: boolean;
  toggleSound: () => void;
  animationsEnabled: boolean;
  toggleAnimations: () => void;
  performanceMode: boolean;
  togglePerformanceMode: () => void;
  /** `column` empilha os controles no rail vertical; `row` é a barra horizontal. */
  orientation: 'row' | 'column';
  /** Abre a busca global (Ctrl/⌘+K). */
  onOpenSearch: () => void;
  /** Navega para uma view — conta, notificações e o atalho de aparência levam a telas. */
  onChangeView: (view: string, data?: Record<string, string>) => void;
  /** Celular (protótipo, `.topo-movel`): sino, busca, claro/escuro e conta. */
  enxuto?: boolean;
}

/**
 * Abre Ajustes JÁ na aba Aparência — o `data-ir="ajustes" data-aba-alvo="aparencia"` do protótipo.
 * A tela de Ajustes carrega sob demanda e guarda a aba no próprio estado; o atalho espera a aba
 * existir e a seleciona pelo mesmo controle que a pessoa usaria.
 */
function abrirAjustesNaAparencia(onChangeView: ControlClusterProps['onChangeView']) {
  onChangeView('settings');
  const t0 = Date.now();
  const tentar = () => {
    const aba = document.getElementById('aba-aparencia');
    if (aba) {
      if (aba.getAttribute('aria-selected') !== 'true') aba.click();
      return;
    }
    if (Date.now() - t0 < 4000) window.setTimeout(tentar, 60);
  };
  window.setTimeout(tentar, 0);
}

/**
 * O RODAPÉ DO MENU — `.cluster` do protótipo aprovado (`montarShell`): busca, sino de notificações,
 * "Som, animações e desempenho" (atalho para Ajustes → Aparência), claro/escuro e a conta. No
 * celular (`enxuto`, a `.topo-movel`), o sino vem primeiro e o atalho de aparência sai.
 *
 * O tamanho do texto saiu daqui como no protótipo: ele mora em Ajustes → Aparência.
 */
export default function ControlCluster(props: ControlClusterProps) {
  const { darkMode, toggleDarkMode, onOpenSearch, onChangeView, enxuto = false } = props;

  const busca = (
    <button
      type="button"
      onClick={() => onOpenSearch()}
      aria-label={t('Buscar gravação, palavra ou tela (Ctrl+K)')}
      title={t('Buscar gravação, palavra ou tela (Ctrl+K)')}
      aria-keyshortcuts="Control+K Meta+K"
    >
      <Search aria-hidden />
    </button>
  );
  const sino = <CentralDeNotificacoes onIr={onChangeView} />;
  /* O rótulo diz a AÇÃO: `Settings` aciona este botão pelo `title` para trocar claro/escuro sem
     ter um segundo dono da preferência. */
  const rotuloEscuro = darkMode ? t('Mudar para o modo claro') : t('Mudar para o modo escuro');
  const escuro = (
    <button type="button" onClick={toggleDarkMode} aria-label={rotuloEscuro} title={rotuloEscuro}>
      <Moon aria-hidden />
    </button>
  );
  const conta = <MenuDaConta onIr={onChangeView} />;

  if (enxuto)
    return (
      <div className="cluster">
        {sino}
        {busca}
        {escuro}
        {conta}
      </div>
    );

  return (
    <div className="cluster">
      {busca}
      {sino}
      <button
        type="button"
        onClick={() => abrirAjustesNaAparencia(onChangeView)}
        aria-label={t('Som, animações e desempenho')}
        title={t('Som, animações e desempenho')}
      >
        <SlidersHorizontal aria-hidden />
      </button>
      {escuro}
      {conta}
    </div>
  );
}
