import { abrirAjustarNivel, type TrechoParaAjuste } from './PainelAjustarNivel';

/**
 * O botão "Ajustar nível" do balão da tradução (flag `ia_ajustar_nivel`): com a flag desligada devolve `undefined`
 * (o balão nem desenha o botão); ligada, devolve a ação que abre o painel da fatia D no parágrafo do trecho.
 */
export function aoAjustarNivelDoBalao(flagLigada: boolean, trecho: TrechoParaAjuste): (() => void) | undefined {
  if (!flagLigada) return undefined;
  return () => abrirAjustarNivel({ ...trecho, paragrafo: trecho.paragrafo || trecho.frase }, 'paragrafo');
}
