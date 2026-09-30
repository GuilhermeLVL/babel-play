import { CampoLinha, Interruptor } from '../vocab/Dialogo';

/** O que o modo faz quando a PESSOA o liga — e o que o pipeline cumpre: nenhum parcial. */
const TEXTO_DO_MODO =
  'Legenda só no fim de cada frase, sem o refino ao vivo: usa bem menos processador enquanto você joga.';
/** O modo que o aparelho leve liga sozinho guarda UMA prévia por frase (`PRIMEIRO_PARCIAL_DO_AUTOMATICO_MS`). */
const TEXTO_DO_AUTOMATICO =
  'Ligado sozinho neste aparelho: uma prévia no começo de cada frase e a legenda no fim. Ligue ou desligue para escolher.';

/**
 * O "MODO DESEMPENHO (JOGOS)" DOS AJUSTES DA CAPTURA, com o texto que diz a verdade (A6c).
 *
 * O perfil leve liga o modo de fábrica, sem a pessoa escolher, e esse automático guarda uma prévia no
 * começo de cada frase (A6b: a 1ª legenda de 5,0 s voltou para 2,0 s). Com o texto de sempre, a tela
 * prometia "só no fim de cada frase" e mostrava a prévia. Ligado sozinho, o texto conta isso e que o
 * toque é a escolha; escolhido pela pessoa (ligado ou não), volta o de sempre. Literal, como o resto do
 * bloco de ajustes da captura.
 */
export default function ModoDesempenho({
  ligado,
  escolhido,
  aoTrocar,
}: {
  ligado: boolean;
  /** A pessoa mexeu no interruptor (ou havia um ajuste salvo); `false` = o automático do aparelho leve. */
  escolhido: boolean;
  aoTrocar: () => void;
}) {
  return (
    <CampoLinha rotulo="Modo desempenho (jogos)" desc={ligado && !escolhido ? TEXTO_DO_AUTOMATICO : TEXTO_DO_MODO}>
      <Interruptor ligado={ligado} aoTrocar={aoTrocar} rotulo="Modo desempenho" />
    </CampoLinha>
  );
}
