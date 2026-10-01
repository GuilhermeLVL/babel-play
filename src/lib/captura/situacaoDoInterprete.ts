/**
 * O PREPARO DOS DOIS LADOS NA TELA DO INTÉRPRETE, antes de começar a conversa (relato do dono no
 * celular, 2026-09-30). Duas linhas, em palavras simples: como a voz será reconhecida (nos DOIS
 * idiomas) e como a tradução será feita (nos DOIS sentidos) — e quanto baixa, quando baixa.
 *
 * Só leitura da decisão que o toque em "Começar conversa" vai tomar (`motorDoMicrofone.ts`): a tela
 * não promete nada que o toque não cumpra. Pura: a tela passa o que já mediu ao abrir
 * (`usePreparoDoInicio`) e os tamanhos que faltam (`inicioDaCaptura.ts`).
 */
import { t } from '../i18n';
import {
  type EntradaDoMotorDoMic,
  type EscolhaDoMic,
  escolherMotorDoMic,
  precisaPerguntarMotorDoMic,
} from './motorDoMicrofone';

export interface LinhaDoPreparo {
  id: 'voz' | 'traducao';
  rotulo: string;
  detalhe: string;
  /** `pronto`: nada a esperar; `baixa`: baixa ao começar; `escolhe`: a pessoa decide ao começar. */
  estado: 'pronto' | 'baixa' | 'escolhe';
}

export interface EntradaDoPreparoDoInterprete {
  /** A decisão do motor, com o reconhecimento no aparelho dos DOIS idiomas (`noAparelhoNosDois`). */
  motor: EntradaDoMotorDoMic & { escolha: EscolhaDoMic | null; podeInstalarPacote: boolean };
  /** MB que faltam do modelo de voz do app (0 = já está aqui). */
  mbStt: number;
  /** MB que faltam do tradutor do app, dos DOIS sentidos (0 = já está aqui). */
  mbTradutor: number;
  /** O navegador traduz os dois sentidos no aparelho. */
  tradutorNativoNosDois: boolean;
  modoNuvem: boolean;
}

const mb = (n: number) => Math.max(1, Math.round(n));

function linhaDaVoz(e: EntradaDoPreparoDoInterprete): LinhaDoPreparo {
  const rotulo = t('Reconhecer a voz');
  if (precisaPerguntarMotorDoMic(e.motor))
    return { id: 'voz', rotulo, estado: 'escolhe', detalhe: t('Você escolhe ao começar: Rápido ou Privado.') };
  const d = escolherMotorDoMic({ ...e.motor, consentiuNavegador: e.motor.escolha === 'rapido' });
  if (d.motor === 'web-speech-local')
    return { id: 'voz', rotulo, estado: 'pronto', detalhe: t('No aparelho · nada sai do celular') };
  if (d.motor === 'web-speech-nuvem')
    return { id: 'voz', rotulo, estado: 'pronto', detalhe: t('Pelo navegador · modo Rápido') };
  if (d.instalarNoAparelho && e.motor.podeInstalarPacote)
    return { id: 'voz', rotulo, estado: 'baixa', detalhe: t('Pacote de voz do navegador · baixa ao começar') };
  return e.mbStt > 0
    ? { id: 'voz', rotulo, estado: 'baixa', detalhe: t('Modelo do app · {mb} MB a baixar', { mb: mb(e.mbStt) }) }
    : { id: 'voz', rotulo, estado: 'pronto', detalhe: t('Modelo do app · já no aparelho') };
}

function linhaDaTraducao(e: EntradaDoPreparoDoInterprete): LinhaDoPreparo {
  const rotulo = t('Traduzir nos dois sentidos');
  if (e.modoNuvem) return { id: 'traducao', rotulo, estado: 'pronto', detalhe: t('Pela nuvem') };
  if (e.tradutorNativoNosDois)
    return { id: 'traducao', rotulo, estado: 'pronto', detalhe: t('Pelo navegador · no aparelho') };
  return e.mbTradutor > 0
    ? {
        id: 'traducao',
        rotulo,
        estado: 'baixa',
        detalhe: t('Modelo do app · {mb} MB a baixar', { mb: mb(e.mbTradutor) }),
      }
    : { id: 'traducao', rotulo, estado: 'pronto', detalhe: t('Modelo do app · já no aparelho') };
}

export function linhasDoPreparo(e: EntradaDoPreparoDoInterprete): LinhaDoPreparo[] {
  return [linhaDaVoz(e), linhaDaTraducao(e)];
}
