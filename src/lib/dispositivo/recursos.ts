/**
 * O QUE ESTE APARELHO TEM — a tabela única que as telas consultam.
 *
 * Cada tela testava por conta própria (uma olhava `speechSynthesis`, outra o perfil, outra a largura), e
 * o resultado era botão que falha: "Ouvir" num headset sem voz de leitura, atalhos de teclado onde não
 * há teclado, microfone e som do sistema juntos onde o sistema emudece um deles (levantamento de
 * 01/10/2026). Aqui o perfil (`perfil.ts`) e os testes de API viram UMA resposta. Recurso ausente some
 * ou vira aviso curto; nunca um botão que não faz nada.
 *
 * Pura (o perfil e o escopo entram por parâmetro) e sem importar nada do app: `perfil.ts` a usa para
 * marcar o `<html>` antes do primeiro render.
 */
/* O que este módulo lê do perfil. Declarado aqui, e não importado de `perfil.ts`, porque `perfil.ts`
   importa este arquivo: o import de volta fechava um ciclo que a verificação de ciclos acusa. */
interface PerfilLido {
  tipo: string;
  capturaDoSistema: boolean;
}

export interface RecursosDoAparelho {
  /**
   * O APARELHO tem voz de leitura que toca: os botões "Ouvir", o narrador e a voz do intérprete falam.
   * No Quest a API `speechSynthesis` existe e não traz voz nenhuma (o app mandava ler e nada tocava,
   * 01/10/2026): ali só conta se a lista de vozes tiver alguma. A voz do site (`lib/voz/vozDoQuest.ts`)
   * é outra coisa e entra por cima disto.
   */
  vozDeLeitura: boolean;
  /** O reconhecimento de voz do navegador (Web Speech) existe e funciona aqui. No Quest, não. */
  reconhecimentoDoNavegador: boolean;
  /** Janela sempre no topo (Document Picture-in-Picture): as Legendas flutuantes de verdade. */
  janelaFlutuante: boolean;
  /** O som do sistema entra (compartilhamento de tela). */
  somDoSistema: boolean;
  /**
   * Microfone e som do sistema AO MESMO TEMPO. No Quest também: o silêncio medido em 01/10/2026 era o
   * microfone desligado nas configurações do headset do dono, não o compartilhamento.
   */
  micJuntoComOSistema: boolean;
  /** Há teclado físico por perto: atalhos fazem sentido. */
  tecladoFisico: boolean;
  /** A captura enxuta (poucos controles grandes) em vez da tela do computador. */
  capturaEnxuta: boolean;
}

type Escopo = {
  speechSynthesis?: { getVoices?: () => unknown[] } | null;
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
};

/** No Quest, a API sem vozes não fala. Fora dele a lista chega atrasada (`voiceschanged`): vale a API. */
function temVozQueToca(g: Escopo, quest: boolean): boolean {
  if (g.speechSynthesis == null) return false;
  if (!quest) return true;
  try {
    return (g.speechSynthesis.getVoices?.() ?? []).length > 0;
  } catch {
    return false;
  }
}

export function recursosDoAparelho(perfil: PerfilLido, escopo: unknown = globalThis): RecursosDoAparelho {
  const g = (escopo ?? {}) as Escopo & Record<string, unknown>;
  const quest = perfil.tipo === 'quest';
  const celular = perfil.tipo.startsWith('celular');
  return {
    vozDeLeitura: temVozQueToca(g, quest),
    reconhecimentoDoNavegador: !quest && !!(g.SpeechRecognition || g.webkitSpeechRecognition),
    janelaFlutuante: 'documentPictureInPicture' in g,
    somDoSistema: perfil.capturaDoSistema,
    micJuntoComOSistema: perfil.capturaDoSistema,
    tecladoFisico: !quest && !celular,
    capturaEnxuta: quest || celular,
  };
}
