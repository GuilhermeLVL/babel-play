/**
 * O INÍCIO DA CAPTURA — UMA folha antes de a sessão existir, e só quando há o que decidir (relato do
 * dono no celular, 2026-09-28).
 *
 * O QUE ERA. Duas janelas empilhadas, e a segunda com a sessão já "rodando": primeiro "Baixar os
 * modelos… cerca de 193 MB" (o Whisper do áudio do SISTEMA mais o opus-mt, contados até no celular,
 * que não tem áudio do sistema, e antes de saber qual motor ouviria a voz); depois do "Baixar e
 * iniciar" o relógio andava e a tela dizia "Ouvindo… Pode falar" com o microfone FECHADO, esperando
 * a segunda, "Como transcrever a sua voz?" — que prometia 80 MB a quem acabara de aceitar 193. E o
 * "Agora não" dela escolhia o Privado calado, com download.
 *
 * O QUE É. `planejarInicio` decide, com o que a tela já sabe ao abrir (cache dos modelos, a sonda do
 * navegador, a escolha guardada), se o toque em Iniciar começa JÁ ou abre a folha. A folha junta a
 * pergunta do motor (quando ela muda algo, `precisaPerguntarMotorDoMic`) e a confirmação do download
 * com o tamanho do que a escolha baixa DE VERDADE: o Rápido não baixa nada para a sua voz; o Privado
 * baixa o nosso modelo (ou o pacote do próprio navegador, quando ele o instala). "Agora não" cancela
 * o início — nunca escolhe pela pessoa. Puro: a tela passa os números.
 */
import { type EntradaDoMotorDoMic, type EscolhaDoMic, escolherMotorDoMic, precisaPerguntarMotorDoMic } from './motorDoMicrofone';

/** Quem vai ouvir a sua voz, previsto antes do clique. `pacote`: o reconhecimento do navegador, a instalar. */
export type MotorPrevistoDoMic = 'navegador' | 'pacote' | 'whisper';

export function motorPrevistoDoMic(
  e: EntradaDoMotorDoMic & { escolha: EscolhaDoMic | null; podeInstalarPacote: boolean },
): MotorPrevistoDoMic {
  const d = escolherMotorDoMic({ ...e, consentiuNavegador: e.escolha === 'rapido' });
  if (d.motor !== 'whisper') return 'navegador';
  return d.instalarNoAparelho && e.podeInstalarPacote ? 'pacote' : 'whisper';
}

export interface EntradaDoInicio {
  micEnabled: boolean;
  systemEnabled: boolean;
  /** O que decide o motor do microfone (a sonda `noAparelho` já medida ao abrir a tela). */
  motor: EntradaDoMotorDoMic & { escolha: EscolhaDoMic | null; podeInstalarPacote: boolean };
  /** MB que FALTA baixar do modelo de transcrição (0 = já no aparelho). */
  mbStt: number;
  /** MB que falta do tradutor local (0 = já está aqui). Entra no Rápido também: ele traduz. */
  mbTradutor: number;
  /** Pedir confirmação acima disto (`perfilDoAparelho.confirmarDownloadAcimaDeMb`); `null` = nunca. */
  limiteDeDownloadMb: number | null;
  downloadJaConfirmado: boolean;
  /** Modo nuvem: nada baixa para começar. */
  modoNuvem: boolean;
}

export type PassoDoInicio =
  | { tipo: 'iniciar' }
  | {
      tipo: 'folha';
      /** Mostrar "Rápido ou Privado?" (senão, só a confirmação do download). */
      perguntarMotor: boolean;
      /** O Privado desta folha é o pacote do navegador (a instalar), não o nosso modelo. */
      pacoteDoNavegador: boolean;
      /** O que baixa se a voz for ao Privado (o nosso modelo + o que o resto da captura pede). */
      mbSePrivado: number;
      /** O que baixa se a voz for ao Rápido (só o que o resto da captura pede: sistema, tradutor). */
      mbSeRapido: number;
      /** O que baixa com o motor já decidido (a folha sem a pergunta). */
      mb: number;
      /** A parte do tradutor nesses números (a folha diz "o tradutor" quando é só ele). */
      mbTradutor: number;
    };

/** O download da captura com a voz num motor ou no outro. O modelo de transcrição é UM para as duas fontes. */
function mbCom(e: EntradaDoInicio, micNoWhisper: boolean): number {
  const precisaStt = e.systemEnabled || (e.micEnabled && micNoWhisper);
  return (precisaStt ? e.mbStt : 0) + e.mbTradutor;
}

export function planejarInicio(e: EntradaDoInicio): PassoDoInicio {
  const perguntarMotor = e.micEnabled && precisaPerguntarMotorDoMic(e.motor);
  const semEscolha = { ...e.motor, escolha: 'privado' as const };
  const previstoPrivado = motorPrevistoDoMic(semEscolha);
  const mbSePrivado = e.modoNuvem ? 0 : mbCom(e, previstoPrivado === 'whisper');
  const mbSeRapido = e.modoNuvem ? 0 : mbCom(e, false);
  const previsto = e.micEnabled ? motorPrevistoDoMic(e.motor) : 'navegador';
  const mb = e.modoNuvem ? 0 : mbCom(e, previsto === 'whisper');
  const pacoteDoNavegador = previstoPrivado === 'pacote';
  const mbTradutor = e.modoNuvem ? 0 : e.mbTradutor;
  if (perguntarMotor)
    return { tipo: 'folha', perguntarMotor, pacoteDoNavegador, mbSePrivado, mbSeRapido, mb, mbTradutor };
  const limite = e.limiteDeDownloadMb;
  if (limite !== null && !e.downloadJaConfirmado && !e.modoNuvem && mb > 0 && mb > limite)
    return { tipo: 'folha', perguntarMotor: false, pacoteDoNavegador, mbSePrivado, mbSeRapido, mb, mbTradutor };
  return { tipo: 'iniciar' };
}
