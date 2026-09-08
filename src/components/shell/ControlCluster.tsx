import React from 'react';
import {
  Sun,
  Moon,
  Search } from 'lucide-react';
import type { ThemeType, FonteType } from '../../lib/appearance';
import type { AgeProfileType, MenuPositionType } from './navItems';
import MenuDaConta from './MenuDaConta';
import MenuDeConforto from './MenuDeConforto';

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
  /**
   * Abre a busca global. Mora AQUI, e não na `NavBar`, porque este cluster é a única peça montada
   * pelas quatro posições de menu (topo, esquerda, direita, embaixo) e também pela barra do celular.
   * Pendurar o gatilho na `NavBar` daria busca só a quem deixou o menu no topo.
   */
  onOpenSearch: () => void;
  /** Navega para uma view — o menu da conta leva a "Meu perfil" e a "Ajustes". */
  onChangeView: (view: string) => void;
}

/* O rótulo diz o estado E a ação — inclusive o salto do máximo para o mínimo. */
const ROTULO_DO_CICLO: Record<FontScale, string> = {
  sm: 'Tamanho do texto: pequeno — clique para aumentar',
  md: 'Tamanho do texto: médio — clique para aumentar',
  lg: 'Tamanho do texto: grande — clique para aumentar',
  xl: 'Tamanho do texto: máximo — clique para voltar ao pequeno',
};
const FONT_SCALE_ORDER: FontScale[] = ['sm', 'md', 'lg', 'xl'];

/**
 * Botão utilitário do shell. 36px de alvo (era 28px — abaixo de qualquer mínimo defensável);
 * o perfil sênior sobe para 44px pela regra `.age-senior` do index.css.
 */
function IconButton({
  onClick,
  title,
  active,
  tone,
  children
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  tone?: 'accent' | 'warn' | 'good';
  children: React.ReactNode;
}) {
  const activeTone =
    tone === 'warn'
      ? 'bg-warn-soft text-warn-ink'
      : tone === 'good'
      ? 'bg-good-soft text-good-ink'
      : 'bg-accent-soft text-accent-ink';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
        active ? activeTone : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * CENTRALIZAÇÃO (2026-08-28): o popover de Aparência que vivia aqui (tema, fonte, partículas,
 * perfil, posição, atalho do Estúdio) foi REMOVIDO de vez — estava atrás de uma flag morta e
 * duplicava o que a tela Personalizar faz. O cluster ficou só com os ATALHOS de acessibilidade
 * que precisam estar a um toque em qualquer tela: busca, tamanho do texto, som, animações,
 * desempenho e claro/escuro. Nenhum deles tem um segundo controle em outra tela.
 * As props de aparência continuam no contrato para não quebrar quem monta o cluster.
 */
export default function ControlCluster(props: ControlClusterProps) {
  const {
    darkMode,
    toggleDarkMode,
    fontScale,
    cycleFontScale,
    soundEnabled,
    toggleSound,
    animationsEnabled,
    toggleAnimations,
    performanceMode,
    togglePerformanceMode,
    orientation,
    onOpenSearch,
    onChangeView
  } = props;

  /* O som saiu daqui: o listener delegado (lib/sfxDelegate) já toca `click` em qualquer <button>,
     e `toggleOn`/`toggleOff` nos que declaram `aria-pressed`, que é o caso destes. Manter a
     chamada manual tocaria em dobro. */
  const click = (fn: () => void) => () => { fn(); };

  const scaleIndex = FONT_SCALE_ORDER.indexOf(fontScale);

  return (
    <div
      className={`flex items-center gap-0.5 bg-surface-hover/40 border border-border-subtle/60 p-1 rounded-xl ${
        orientation === 'column' ? 'flex-wrap justify-center w-full' : ''
      }`}
    >
      {/* ── BUSCA GLOBAL ─────────────────────────────────────────────────────────────────────
          Na barra horizontal vira uma pílula larga com o atalho impresso: um ⌘K que ninguém vê não
          é um atalho, é um segredo. No rail vertical o espaço não comporta a pílula, e ela encolhe
          para o mesmo alvo de 36px dos outros controles, o `title` continua ensinando a tecla. */}
      <button
        type="button"
        onClick={() => onOpenSearch()}
        title="Buscar gravação, palavra ou tela (Ctrl+K)"
        aria-label="Buscar gravação, palavra ou tela"
        aria-keyshortcuts="Control+K Meta+K"
        className={`flex items-center gap-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors cursor-pointer shrink-0 ${
          orientation === 'column'
            ? 'w-9 h-9 justify-center'
            : 'h-9 ps-2.5 pe-2 border border-border-subtle/60 bg-surface'
        }`}
      >
        <Search className="w-4 h-4 shrink-0" />
        {orientation === 'row' && (
          <>
            <span className="hidden lg:inline text-[12.5px] font-semibold">Buscar</span>
            <kbd className="hidden xl:inline text-[10px] font-mono border border-border-subtle rounded px-1.5 py-0.5">
              Ctrl K
            </kbd>
          </>
        )}
      </button>

      <div className={orientation === 'column' ? 'hidden' : 'w-px h-5 bg-border-subtle/70 mx-1'} />

      {/* Escala de fonte — o indicador é o próprio "A" mudando de tamanho, não uma sigla a decifrar */}
      {/* UM botão que cicla (spec controle-de-fonte-ciclico): eram três alvos (menos / indicador
          passivo / mais); agora o "A" é o botão E o indicador — cresce com a escala, e no máximo
          o clique volta ao mínimo, dito pelo aria-label. */}
      <button
        type="button"
        onClick={click(cycleFontScale)}
        title={ROTULO_DO_CICLO[fontScale]}
        aria-label={ROTULO_DO_CICLO[fontScale]}
        className="w-9 h-9 rounded-lg text-ink-muted hover:bg-surface-hover hover:text-ink flex items-center justify-center transition-colors cursor-pointer shrink-0"
      >
        <span
          className="font-display font-black select-none leading-none"
          style={{ fontSize: `${11 + scaleIndex * 2}px` }}
          aria-hidden
        >
          A
        </span>
      </button>

      <div className={orientation === 'column' ? 'hidden' : 'w-px h-5 bg-border-subtle/70 mx-1'} />

      {/* Som, animações e desempenho — preferências raras, agrupadas num popover COM RÓTULOS
          (auditoria de UX, 31/08): oito ícones soltos no cabeçalho exigiam decifração; três deles
          a maioria toca uma vez. Ver MenuDeConforto. */}
      <MenuDeConforto
        soundEnabled={soundEnabled}
        toggleSound={toggleSound}
        animationsEnabled={animationsEnabled}
        toggleAnimations={click(toggleAnimations)}
        performanceMode={performanceMode}
        togglePerformanceMode={click(togglePerformanceMode)}
        orientation={orientation}
      />

      {/* O botão do tutor SAIU daqui (auditoria de UX, 31/08): ele e o balão flutuante do iChat
          abriam o MESMO painel com dois nomes diferentes ("BabelBot" aqui, "iChat" lá) — duas
          portas com placas distintas para a mesma sala é atrito puro. O balão flutuante fica,
          porque carrega contexto ("sintonizado com…") e está sempre visível. */}

      {/* Claro / escuro */}
      <IconButton onClick={click(toggleDarkMode)} title={darkMode ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}>
        {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </IconButton>

      {/* ── A CONTA ────────────────────────────────────────────────────────────────────────────
          Último da fileira porque é o item de MAIS ALTO nível: os outros ajustam a tela, este
          responde "quem sou eu e como saio". Mora aqui, e não em `NAV_ITEMS`, porque este cluster
          é a única peça que as quatro posições de menu e a barra do celular compartilham,
          `MobileNav` renderiza a lista de navegação INTEIRA e já está no limite de largura. */}
      <div className={orientation === 'column' ? 'hidden' : 'w-px h-5 bg-border-subtle/70 mx-1'} />
      <MenuDaConta onIr={onChangeView} orientation={orientation} />

    </div>
  );
}
