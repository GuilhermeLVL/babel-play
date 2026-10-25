/**
 * AS FRASES DO ASSISTENTE AO VIVO (Fase C2), num lugar só — pela skill `copy-br-etica`: cada recusa diz o fato e o que
 * continua funcionando, sem preço, sem urgência e SEM OFERTA DE PLANO (nunca no instante da recusa, e nunca para o perfil
 * protegido). "Como respondo?" é ajuda de idioma: nada de "oculto", "ninguém vê" ou "entrevista".
 */
import type { CefrLevel } from '../../../../core/learning/contract';
import type { FalhaDoAssistente } from '../../../../data/apiDoAssistente';
import { diaQueACotaVolta } from '../../../../lib/diaQueACotaVolta';
import { t } from '../../../../lib/i18n';

/** A frase de cada recusa do "Como respondo?". */
export function fraseDaFalhaDoAssistente(m: FalhaDoAssistente, protegido: boolean): string {
  switch (m) {
    case 'sem_plano':
      return protegido
        ? t('As sugestões de resposta não estão disponíveis nesta conta.')
        : t('As sugestões de resposta não estão disponíveis nesta conta. A legenda e as palavras seguem funcionando.');
    case 'cota_do_mes':
      return t('Você usou o assistente deste mês; ele volta no dia {data}. A legenda segue funcionando.', {
        data: diaQueACotaVolta(),
      });
    case 'uso_justo':
      return t('Você chegou ao limite de hoje do assistente. Ele volta amanhã; a legenda segue funcionando.');
    case 'nuvem_ocupada':
      return t('A nuvem está ocupada agora. Tente de novo em instantes.');
    case 'sem_conta':
      return t('Entre na sua conta para pedir sugestões de resposta.');
    case 'fora':
      return t('O assistente não está disponível agora. A legenda segue funcionando.');
    case 'invalido':
      return t('Não deu para pedir sugestões para esta frase.');
    default:
      return t('Não deu para pedir sugestões agora. Tente de novo em instantes.');
  }
}

/**
 * A nota discreta da aba Assistente quando as glosas AUTOMÁTICAS param por cota (nada de aviso por cima da legenda: as
 * marcas só deixam de aparecer, e a aba conta por quê). `null` = nada a dizer.
 */
export function notaDasGlosasAutomaticas(m: FalhaDoAssistente | null): string | null {
  if (m === 'uso_justo') return t('Os destaques de hoje acabaram e voltam amanhã. As palavras acima do nível seguem.');
  if (m === 'cota_do_mes')
    return t('Os destaques deste mês acabaram e voltam no dia {data}. As palavras acima do nível seguem.', {
      data: diaQueACotaVolta(),
    });
  return null;
}

/** O rótulo curto de uma palavra acima do nível ("B2", ou "menos comum" na escala de frequência). */
export function rotuloDoNivel(nivel: CefrLevel | null | undefined, escala: string | undefined): string {
  if (escala === 'frequencia') return t('Menos comum');
  return nivel ? t('Acima do seu nível · {nivel}', { nivel }) : t('Acima do seu nível');
}

export const rotuloDoTipo = (tipo: 'expressao' | 'termo' | 'nivel'): string =>
  tipo === 'expressao' ? t('Expressão') : tipo === 'termo' ? t('Termo') : t('Palavra');
