// Importa SÓ as bandeiras dos idiomas que a app oferece (tree-shaking: cada uma é ~1KB de
// SVG inline; importar o namespace inteiro embarcaria ~250 bandeiras à toa).
import {
  BR, CN,   CZ, DE, DK, ES, FI,
FR, GB, GR, HU, ID, IL, IN, IT, JP, KR, MX, NL, NO, PL, PT, RO, RU, SA, SE, TH,
TR, TW, UA, US, VN, } from 'country-flag-icons/react/3x2';

import { langCountry, langShortLabel } from '../lib/langFlag';

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
