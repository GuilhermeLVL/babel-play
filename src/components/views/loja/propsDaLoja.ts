import type { ContextoDeConquistas } from '@core';

import type { FonteType, ThemeType } from '../../../lib/appearance';
import type { ContextoDeEquipar } from '../../../lib/galeria/equipar';
import type { DerivedProgress } from '../../../lib/progress';
import type { AgeProfileType, MenuPositionType } from '../../shell/navItems';

/** As props de Personalizar (`Loja.tsx`), nas duas versões — a clássica e a das recompensas v2. */
export interface LojaProps {
  progress: DerivedProgress;
  theme: ThemeType;
  /** `semCirculo`: a troca sem o círculo (o tema já está pintado pela prévia). */
  setTheme: (t: ThemeType, opcoes?: { semCirculo?: boolean }) => void;
  fonte: FonteType;
  setFonte: (f: FonteType) => void;
  menuPosition: MenuPositionType;
  setMenuPosition: (p: MenuPositionType) => void;
  onOpenStudio: () => void;
  /** Contexto das conquistas (montado no App), para a aba "Desafios" desta tela. */
  ctxConquistas: ContextoDeConquistas | null;
  /** Perfil de exibição — editado na aba Meu visual (único dono desde 2026-08-28). */
  ageProfile: AgeProfileType;
  setAgeProfile: (p: AgeProfileType) => void;
  /** v3: aba de destino ao abrir ("progressao" do fim de rodada). */
  abaInicial?: string | null;
  /** Espelha a aba na URL (ux-v2 §1.6): o App publica `/loja/<área>` a cada troca. */
  aoTrocarDeAba?: (aba: string) => void;
  /** v3: o contexto único de equipar (App). Opcional só para os testes de tela. */
  equiparCtx?: ContextoDeEquipar;
  /** Leva à porta de entrada. Ausente = self-host, onde não há conta. */
  onEntrar?: () => void;
}
