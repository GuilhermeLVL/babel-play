import AvatarSinalizante, { type AvatarSinalizanteProps } from './AvatarSinalizante';

/**
 * O PALCO DA SOLETRAÇÃO: o `AvatarSinalizante` com os avisos fixos por fora (quem monta os mostra sempre). Existe só
 * para que o resto da soletração (dados do alfabeto, motor de ossos, `three`) seja um chunk baixado sob demanda, quando
 * há um nome a soletrar.
 */
export default function PalcoDaSoletracao({
  soNomesProprios = true,
  ...props
}: Omit<AvatarSinalizanteProps, 'avisosPorFora'>) {
  return <AvatarSinalizante {...props} avisosPorFora soNomesProprios={soNomesProprios} />;
}
