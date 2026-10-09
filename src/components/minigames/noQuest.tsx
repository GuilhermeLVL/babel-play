/**
 * OS JOGOS NO META QUEST: o que os dezoito têm em comum por dentro da rodada.
 *
 * O palco (`.palco-jogo`) já recebe de `styles/questJogar.css` o alvo mínimo, o placar e as respostas
 * grandes. Aqui fica o que é de cada tabuleiro (`styles/questJogos.css`, importado por este módulo: só
 * carrega com um jogo) e as duas perguntas que os jogos fazem ao aparelho:
 *
 *   · `useSemTecladoFisico()`: quem escreve é o teclado do sistema (o campo não rouba o foco, o relógio
 *     de quem digita apontando é mais folgado, a tela diz onde tocar para o teclado subir).
 *   · há voz para o idioma DESTE texto? (`useVozNoJogo`, `falarNoJogo`). O Quest não tem voz própria; a
 *     do site lê seis idiomas com a nuvem ligada (`lib/voz/haVoz.ts`). Sem voz, o botão de ouvir não
 *     aparece e o jogo mostra o texto.
 *
 * Só apresentação: nenhuma regra de jogo, pontuação ou relógio passa por aqui.
 */
import '../../styles/questJogos.css';

import { VolumeX } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import { perfilDoDispositivo } from '../../lib/dispositivo/perfil';
import { recursosDoAparelho } from '../../lib/dispositivo/recursos';
import { noHeadset } from '../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../lib/i18n';
import { langLabelNaUI } from '../../lib/languages';
import { falar, type SpeakOptions } from '../../lib/tts';
import { haVozPara } from '../../lib/voz/haVoz';
import { aoMudarIdiomasDaVozDoQuest } from '../../lib/voz/vozDoQuest';

/**
 * SEM teclado físico por perto (o headset): quem escreve é o teclado do sistema, que sobe quando a pessoa
 * toca no campo. No computador é falso: lá se digita como sempre.
 */
export function useSemTecladoFisico(): boolean {
  return !recursosDoAparelho(perfilDoDispositivo()).tecladoFisico;
}

/**
 * Um texto neste idioma pode ser lido em voz alta AGORA? Fora do Quest responde sempre que sim: ali o
 * botão de ouvir aparece como sempre apareceu, e quem avisa da voz que falta é o próprio `falar`.
 */
export function useVozNoJogo(idioma: string | undefined): boolean {
  const noQuest = noHeadset();
  const [, refazer] = useState(0);
  useEffect(() => {
    if (!noQuest) return;
    // A lista de idiomas da voz do site chega depois (um GET): a resposta pode mudar com a tela aberta.
    return aoMudarIdiomasDaVozDoQuest(() => refazer((n) => n + 1));
  }, [noQuest]);
  return !noQuest || (!!idioma && haVozPara(idioma));
}

/**
 * `falar` para os jogos. No Quest, sem voz para o idioma, não toca nem o bipe que anuncia a fala: um
 * bipe seguido de silêncio parece defeito. Fora do Quest é o `falar` de sempre.
 */
export function falarNoJogo(texto: string, idioma: string, opts: Omit<SpeakOptions, 'lang'> = {}): boolean {
  if (noHeadset() && !haVozPara(idioma)) return false;
  return falar(texto, idioma, opts);
}

/** O nome do idioma para a frase "sem voz em …". Sem código, a frase fica genérica. */
const nomeDoIdioma = (idioma: string | undefined): string => (idioma ? langLabelNaUI(idioma) : '');

/**
 * A LINHA QUE DIZ POR QUE NÃO HÁ SOM. Entra no lugar do botão de ouvir, com o que fazer a seguir.
 * `children` troca a frase quando o jogo tem algo mais exato a dizer.
 */
export function SemVozNoQuest({ idioma, children }: { idioma?: string; children?: ReactNode }) {
  const nome = nomeDoIdioma(idioma);
  return (
    <p className="qj-sem-voz" role="note">
      <VolumeX aria-hidden />
      <span>
        {children ??
          (nome
            ? t('Sem voz de leitura em {idioma} neste aparelho.', { idioma: nome })
            : t('Sem voz de leitura neste aparelho.'))}
      </span>
    </p>
  );
}
