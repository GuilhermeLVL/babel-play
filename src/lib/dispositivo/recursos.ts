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
import type { PerfilDoDispositivo } from './perfil';

export interface RecursosDoAparelho {
  /** `speechSynthesis` existe: os botões "Ouvir", o narrador e a voz do intérprete falam. */
  vozDeLeitura: boolean;
  /** O reconhecimento de voz do navegador (Web Speech) existe e funciona aqui. No Quest, não. */
  reconhecimentoDoNavegador: boolean;
  /** Janela sempre no topo (Document Picture-in-Picture): as Legendas flutuantes de verdade. */
  janelaFlutuante: boolean;
  /** O som do sistema entra (compartilhamento de tela). */
  somDoSistema: boolean;
  /** Microfone e som do sistema AO MESMO TEMPO. No Quest o sistema emudece o microfone. */
  micJuntoComOSistema: boolean;
  /** Há teclado físico por perto: atalhos fazem sentido. */
  tecladoFisico: boolean;
  /** A captura enxuta (poucos controles grandes) em vez da tela do computador. */
  capturaEnxuta: boolean;
}

type Escopo = { speechSynthesis?: unknown; SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };

export function recursosDoAparelho(
  perfil: Pick<PerfilDoDispositivo, 'tipo' | 'capturaDoSistema'>,
  escopo: unknown = globalThis,
): RecursosDoAparelho {
  const g = (escopo ?? {}) as Escopo & Record<string, unknown>;
  const quest = perfil.tipo === 'quest';
  const celular = perfil.tipo.startsWith('celular');
  return {
    vozDeLeitura: g.speechSynthesis != null,
    reconhecimentoDoNavegador: !quest && !!(g.SpeechRecognition || g.webkitSpeechRecognition),
    janelaFlutuante: 'documentPictureInPicture' in g,
    somDoSistema: perfil.capturaDoSistema,
    micJuntoComOSistema: perfil.capturaDoSistema && !quest,
    tecladoFisico: !quest && !celular,
    capturaEnxuta: quest || celular,
  };
}
