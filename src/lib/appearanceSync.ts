/**
 * ESPELHAMENTO DE APARÊNCIA entre dois documentos (a janela principal → a janela flutuante do
 * overlay, aberta via Document Picture-in-Picture).
 *
 * O BUG QUE ISTO CORRIGE. A sincronia antiga copiava `data-theme` e as classes, e observava
 * apenas `['class','data-theme']`. Só que duas coisas essenciais NÃO moram em atributo nenhum
 * desses — moram no `style` INLINE da raiz:
 *
 *   • as variáveis do tema Customizado — `appearance.ts` faz `root.style.setProperty('--custom-canvas', …)`;
 *   • a escala de fonte (A+/A−) — `App.tsx` faz `documentElement.style.fontSize = …`.
 *
 * Resultado: no tema Customizado a janela flutuante caía para sempre nos valores de reserva (a
 * paleta padrão), e mexer na paleta ao vivo não disparava o observador nem uma vez. Copiar o
 * `style` inteiro seria pior (levaria junto estado transitório de layout), então copiamos o que
 * é APARÊNCIA: as variáveis CSS declaradas e o tamanho da fonte.
 *
 * Está aqui, fora do componente, porque dentro de um `useEffect` isto era intestável — e é
 * exatamente o tipo de regra (quais propriedades atravessam a fronteira) que merece teste.
 */

/** O necessário para reproduzir a aparência de um documento em outro. */
export interface AppearanceSnapshot {
  /** Valor de `data-theme` na raiz ('babel', 'vercel'…). */
  theme: string;
  /** `className` da raiz — carrega a classe `dark`. */
  rootClass: string;
  /** `className` do body — algumas regras (modo desempenho) miram nele. */
  bodyClass: string;
  /** Variáveis CSS declaradas inline na raiz (`--custom-accent` etc.). */
  inlineVars: Record<string, string>;
  /** `style.fontSize` da raiz — a escala de fonte do app. */
  fontSize: string;
}

/** Interface mínima que `readAppearance`/`applyAppearance` precisam — facilita o teste. */
export interface StyledElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  className: string;
  style: {
    length?: number;
    item?(index: number): string;
    getPropertyValue(prop: string): string;
    setProperty(prop: string, value: string): void;
    fontSize: string;
  };
}

/** Lê a aparência atual de um documento. */
export function readAppearance(root: StyledElement, body: StyledElement): AppearanceSnapshot {
  const inlineVars: Record<string, string> = {};
  const total = root.style.length ?? 0;
  for (let i = 0; i < total; i++) {
    const prop = root.style.item?.(i);
    // Só variáveis CSS. Propriedades normais (display, overflow…) são estado de layout da
    // janela de origem e não têm por que atravessar.
    if (prop && prop.startsWith('--')) inlineVars[prop] = root.style.getPropertyValue(prop);
  }
  return {
    theme: root.getAttribute('data-theme') || 'babel',
    rootClass: root.className,
    bodyClass: body.className,
    inlineVars,
    fontSize: root.style.fontSize || '',
  };
}

/** Aplica a aparência lida em outro documento (o da janela flutuante). */
export function applyAppearance(root: StyledElement, body: StyledElement, snap: AppearanceSnapshot): void {
  root.setAttribute('data-theme', snap.theme);
  root.className = snap.rootClass;
  body.className = snap.bodyClass;
  for (const [prop, value] of Object.entries(snap.inlineVars)) {
    root.style.setProperty(prop, value);
  }
  if (snap.fontSize) root.style.fontSize = snap.fontSize;
}

/** Atributos que o observador precisa vigiar para não perder nenhuma das mudanças acima. */
export const APPEARANCE_ATTRS = ['class', 'data-theme', 'style'] as const;
