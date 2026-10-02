/**
 * "HÁ VOZ PARA ESTE IDIOMA, AQUI?" — a pergunta que um botão de ouvir faz antes de aparecer.
 *
 * Duas fontes: a voz do APARELHO (`recursos.ts`; no Quest, nenhuma) e a voz do SITE (`vozDoQuest.ts`,
 * com a nuvem ligada, nos idiomas que ela lê). Um botão que só o CSS escondia (`data-precisa="voz"`)
 * some no aparelho sem voz mesmo quando o site saberia ler aquele idioma; quem conhece o idioma do
 * texto pergunta aqui e decide.
 *
 * E o motor: no aparelho sem voz, `speak()` (`tts.ts`) passa a ir à voz do site quando ela está ligada.
 * Com ela desligada, ou no idioma que ela não lê, nada muda.
 */
import { perfilDoDispositivo } from '../dispositivo/perfil';
import { recursosDoAparelho } from '../dispositivo/recursos';
import { nuvemDoQuestExiste } from '../nuvemDoQuest';
import { nativeTts, setTtsEngine, type TtsEngine } from '../tts';
import { vozDoQuest, vozDoQuestAtiva, vozDoQuestFala } from './vozDoQuest';

/** O aparelho tem voz de leitura própria (a `speechSynthesis` com vozes). */
export function aparelhoTemVoz(): boolean {
  return recursosDoAparelho(perfilDoDispositivo()).vozDeLeitura;
}

/** Um texto neste idioma pode ser lido em voz alta agora? (aceita `en` ou `en-US`) */
export function haVozPara(idioma: string): boolean {
  if (aparelhoTemVoz()) return true;
  return vozDoQuestAtiva() && vozDoQuestFala(idioma);
}

/** Há ALGUMA voz aqui, para algum idioma? (a do aparelho, ou a do site ligada) */
export function haAlgumaVoz(): boolean {
  return aparelhoTemVoz() || vozDoQuestAtiva();
}

/**
 * No aparelho sem voz onde a nuvem do site existe, o motor do app vira um roteador: com a nuvem ligada,
 * a voz do site; senão, o de sempre. Decidido a cada fala, porque o consentimento muda sem recarregar.
 */
export function instalarVozDoSite(): boolean {
  if (aparelhoTemVoz() || !nuvemDoQuestExiste()) return false;
  const motor = (): TtsEngine => (vozDoQuestAtiva() ? vozDoQuest() : nativeTts);
  setTtsEngine({
    speak: (texto, opcoes) => motor().speak(texto, opcoes),
    cancel: () => {
      vozDoQuest().cancel();
      nativeTts.cancel();
    },
    isSpeaking: () => motor().isSpeaking?.() ?? false,
    isPaused: () => false,
  });
  return true;
}
