/**
 * O MOTOR DO MICROFONE — qual reconhecedor ouve a SUA voz, decidido pelo que sai do aparelho
 * (harness adaptativo §1.1 e §6; integração de 2026-09-28).
 *
 * POR QUE EXISTE. A Web Speech era o motor PADRÃO do microfone (`micEngine = 'browser'`) e a captura
 * a instanciava direto, por fora do perfil e do gateway. No Chrome, sem `processLocally`, ela manda o
 * áudio aos servidores do Google — até no perfil "Privado/Local 100% offline", sem consentimento
 * nenhum (auditoria de eficiência 2026-09-28, §3; LGPD). O registro de motores passou a exigir o
 * consentimento de nuvem para ela; esta decisão é o que a captura consulta antes de abrir o mic.
 *
 * TRÊS DEGRAUS, do que não sai do aparelho ao que sai:
 *   (a) `web-speech-local` — o navegador reconhece NO aparelho (`available({processLocally})` =
 *       'available'). Grátis, sem download nosso, sem consentimento: nada sai;
 *   (b) `web-speech-nuvem` — a de sempre, SÓ com consentimento de nuvem e NUNCA no perfil Privado;
 *   (c) `whisper` — o Whisper/Moonshine local que já servia a quem não tem Web Speech.
 * Quem escolheu o Whisper no seletor fica nele: a escolha da pessoa vale mais que o padrão.
 *
 * PACOTE A BAIXAR ('downloadable'): `SpeechRecognition.install()` exige ativação do usuário, então só
 * é chamado a partir do clique em "Iniciar"/microfone (`resolverMotorDoMic`, chamado de `startMic`),
 * nunca sozinho — e sem esperar: ESTA sessão usa o degrau seguinte, a próxima já acha o pacote.
 */
import type { Disponibilidade } from '../dispositivo/sonda';

export type MotorDoMicrofone = 'web-speech-local' | 'web-speech-nuvem' | 'whisper';

export type MotivoDoMotorDoMic =
  | 'escolha-whisper'
  | 'sem-web-speech'
  | 'no-aparelho'
  | 'nuvem-consentida'
  | 'perfil-privado'
  | 'sem-consentimento';

export interface EntradaDoMotorDoMic {
  /** O seletor da tela: 'browser' (Web Speech, padrão) ou 'whisper'. */
  preferido: 'browser' | 'whisper';
  /** `SpeechRecognition`/`webkitSpeechRecognition` existe. */
  webSpeechSuportado: boolean;
  /** `available({langs:[idioma do mic], processLocally:true})`; `null` = sem a API ou sem resposta. */
  noAparelho: Disponibilidade | null;
  /** Consentimento de nuvem (Ajustes → Privacidade). */
  consentiuNuvem: boolean;
  /** Perfil de IA ativo: `local-private` promete que nada sai do aparelho. */
  perfilId: string;
}

export interface DecisaoDoMotorDoMic {
  motor: MotorDoMicrofone;
  motivo: MotivoDoMotorDoMic;
  /** Pedir `install()` do pacote do idioma (só a partir de um clique). */
  instalarNoAparelho: boolean;
}

/** O perfil que promete "100% offline". */
export const PERFIL_PRIVADO = 'local-private';

export function escolherMotorDoMic(e: EntradaDoMotorDoMic): DecisaoDoMotorDoMic {
  if (!e.webSpeechSuportado) return { motor: 'whisper', motivo: 'sem-web-speech', instalarNoAparelho: false };
  if (e.preferido === 'whisper') return { motor: 'whisper', motivo: 'escolha-whisper', instalarNoAparelho: false };
  if (e.noAparelho === 'available') return { motor: 'web-speech-local', motivo: 'no-aparelho', instalarNoAparelho: false };
  const instalarNoAparelho = e.noAparelho === 'downloadable';
  if (e.perfilId === PERFIL_PRIVADO) return { motor: 'whisper', motivo: 'perfil-privado', instalarNoAparelho };
  if (e.consentiuNuvem) return { motor: 'web-speech-nuvem', motivo: 'nuvem-consentida', instalarNoAparelho };
  return { motor: 'whisper', motivo: 'sem-consentimento', instalarNoAparelho };
}

/**
 * O que a sonda guardada sabe do idioma do mic (ela mede só pt-BR e en). Serve à ROTA do STT, que
 * precisa saber antes de o mic abrir se o Whisper vai decodificar a sua voz (Moonshine é só inglês).
 */
export function disponibilidadeDaSondaParaIdioma(
  lang: string,
  stt: { ptBR: Disponibilidade | null; en: Disponibilidade | null } | undefined,
): Disponibilidade | null {
  const base = lang.toLowerCase().split('-')[0];
  if (!stt) return null;
  if (base === 'pt') return stt.ptBR;
  if (base === 'en') return stt.en;
  return null;
}

type ComInstalar = { install?: (o: { langs: string[]; processLocally: boolean }) => unknown };

/**
 * A decisão com a pergunta ao navegador AO VIVO (a sonda guardada pode ter até 30 dias; o pacote pode
 * ter sido instalado ontem). Chamada do clique — por isso pode pedir o `install()`. Nunca lança.
 */
export async function resolverMotorDoMic(
  e: Omit<EntradaDoMotorDoMic, 'noAparelho'> & { lang: string; escopo?: unknown },
): Promise<DecisaoDoMotorDoMic> {
  const escopo = e.escopo ?? globalThis;
  let noAparelho: Disponibilidade | null = null;
  if (e.webSpeechSuportado && e.preferido === 'browser') {
    try {
      const { disponibilidadeDoSttNoAparelho } = await import('../dispositivo/sonda');
      noAparelho = await disponibilidadeDoSttNoAparelho(e.lang, escopo);
    } catch {
      noAparelho = null; // sem sonda: segue pelo consentimento
    }
  }
  const decisao = escolherMotorDoMic({ ...e, noAparelho });
  if (decisao.instalarNoAparelho) {
    const s = escopo as { SpeechRecognition?: ComInstalar; webkitSpeechRecognition?: ComInstalar };
    const SR = s.SpeechRecognition ?? s.webkitSpeechRecognition;
    try {
      void Promise.resolve(SR?.install?.({ langs: [e.lang], processLocally: true })).catch(() => {
        /* sem ativação, sem rede, idioma recusado: a próxima sessão pergunta de novo */
      });
    } catch {
      /* `install` que lança síncrono: idem */
    }
  }
  return decisao;
}
