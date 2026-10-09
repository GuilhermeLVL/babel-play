/**
 * O DESENHO DO APP E O APARELHO.
 *
 * O desenho que nasceu no headset (maquete de 01/10/2026) é o ÚNICO desde 08/10/2026 (decisão do dono:
 * "apague o legado"): vale no computador, no headset, no celular e no tablet, sem chave. O nome do
 * arquivo ficou do tempo em que a tela nova era uma escolha.
 *
 * O que continua aqui é o que pergunta pelo APARELHO (`noHeadset`, `noComputador`, `noCelular`): limite
 * ou recurso de aparelho (teclado, microfone, voz, vibração), nunca o desenho.
 */
import { perfilDoDispositivo, registrarQuemDispensaOModoLeve } from './perfil';

/** O aparelho é um celular ou um tablet (os dois perfis de `perfil.ts` que não são computador nem headset). */
export const noCelular = (): boolean => perfilDoDispositivo().tipo.startsWith('celular');

/** O aparelho é um computador (e não o headset, nem um celular). */
export const noComputador = (): boolean => perfilDoDispositivo().tipo.startsWith('desktop');

/**
 * O aparelho é o HEADSET. Tudo o que é LIMITE OU RECURSO DO APARELHO (sem teclado físico, sem voz
 * própria, sem nota de pronúncia, o raio do controle, a vibração, o relógio mais folgado de um jogo)
 * pergunta por aqui, ou pelo recurso em `recursos.ts`; nunca por `questNovo()`.
 */
export const noHeadset = (): boolean => perfilDoDispositivo().tipo === 'quest';

/**
 * DE SAÍDA: sempre verdadeiro. As chaves de antes (`babel.desenhoNovo`, `babel.quest.telaNova`,
 * `?desenho=`) não são mais lidas. Fica só até as telas de jogos, captura e estudo deixarem de
 * perguntar; depois disso esta função e `useQuestNovo` saem.
 */
export function questNovo(): boolean {
  return true;
}

/* O modo leve só liga pela escolha de quem usa (ver `perfil.ts`). */
registrarQuemDispensaOModoLeve(questNovo);

/** `<html data-quest-novo="true">`: é o que o CSS das telas (`styles/quest*.css`) lê. Chamado no boot. */
export function marcarQuestNovoNoDocumento(): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.questNovo = 'true';
}

/** DE SAÍDA, como `questNovo()`: sempre verdadeiro. */
export function useQuestNovo(): boolean {
  return true;
}

/* A fonte do som, a vibração do controle e a escala da legenda (o que só o headset tem) moram em
   `preferenciasDoQuest.ts`: este arquivo entra no JS inicial, e elas não precisam estar nele. */
