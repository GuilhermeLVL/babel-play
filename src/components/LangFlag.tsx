// Importa SÓ as bandeiras dos idiomas que a app oferece (tree-shaking: cada uma é ~1KB de
// SVG inline; importar o namespace inteiro embarcaria ~250 bandeiras à toa).
import {
  BR, PT, US, GB, ES, MX, FR, DE, IT, NL, RU, PL, UA, TR, SE, DK, NO, FI,
  CZ, GR, RO, HU, JP, KR, CN, TW, IN, SA, IL, ID, VN, TH,
} from 'country-flag-icons/react/3x2';
import { langCountry, langShortLabel } from '../lib/langFlag';
import { langLabel } from '../lib/languages';

/*
 * O tipo é `typeof BR` — o `FlagComponent` da própria biblioteca — e NÃO um
 * `ComponentType<SVGProps<SVGSVGElement>>` escrito por nós.
 *
 * As bandeiras declaram props sobre `HTMLElement & SVGElement`, que não é atribuível a
 * `SVGProps<SVGSVGElement>`; anotar o nosso tipo produzia 32 erros de variância (um por bandeira)
 * — invisíveis até `@types/react` ser instalado. Deixar a biblioteca dizer o tipo dela é o certo:
 * `className` e `aria-hidden`, os dois únicos props que usamos, estão em `HTMLAttributes`.
 */
const FLAGS: Record<string, typeof BR> = {
  BR, PT, US, GB, ES, MX, FR, DE, IT, NL, RU, PL, UA, TR, SE, DK, NO, FI,
  CZ, GR, RO, HU, JP, KR, CN, TW, IN, SA, IL, ID, VN, TH,
};

/**
 * Bandeira SVG do idioma (BCP-47 ou curto). SVG e não emoji: o Windows não renderiza
 * emojis de bandeira. Sem bandeira conhecida → chip com o código ('EN'), nunca inventa.
 */
export function LangFlag({ code, className = 'w-4 h-3' }: { code: string; className?: string }) {
  const country = langCountry(code);
  const Flag = country ? FLAGS[country] : undefined;
  if (!Flag) {
    return (
      <span
        aria-hidden
        className={`inline-flex items-center justify-center rounded-[2px] bg-ink-faint/20 text-[7px] font-black leading-none ${className}`}
      >
        {langShortLabel(code)}
      </span>
    );
  }
  return <Flag aria-hidden className={`${className} rounded-[2px] shrink-0 block`} />;
}

/**
 * Chip compacto "bandeira + código" para etiquetar uma FALA com o idioma dela (transcript,
 * overlay, painel Falantes). O rótulo completo vai no title (hover/leitor de tela).
 */
export function LangChip({ code, className = '' }: { code: string; className?: string }) {
  if (!code) return null;
  return (
    <span
      title={langLabel(code)}
      aria-label={`Idioma: ${langLabel(code)}`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-canvas/80 border border-border-subtle text-[8.5px] font-black tracking-wide text-ink-muted ${className}`}
    >
      <LangFlag code={code} className="w-3.5 h-[10px]" />
      {langShortLabel(code)}
    </span>
  );
}
