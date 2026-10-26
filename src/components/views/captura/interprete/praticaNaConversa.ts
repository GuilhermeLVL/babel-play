import { GraduationCap } from 'lucide-react';

import type { CorrecaoNaPratica, PraticaPossivel } from '../../../../core/assistente/praticaDaConversa';
import { t } from '../../../../lib/i18n';
import { langLabelNaUI } from '../../../../lib/languages';
import type { ModoDaFaixa } from './ConversaDoPrototipo';

/**
 * "PRATICAR A CONVERSA" no Intérprete, como a tela pronta e a conversa em curso a recebem da captura. Ausente = a
 * prática não aparece (a flag `assistente_ao_vivo` desligada, ou não há idioma que a pessoa aprende).
 */
export interface PraticaNaConversa {
  /** O idioma que a pessoa aprende (BCP-47): o que a metade dela fala com a prática ligada. */
  idioma: string;
  /** A pessoa ligou a prática (desligada de fábrica e a cada visita). */
  ligada: boolean;
  possivel: PraticaPossivel;
  /** A correção da fala: ligada, falta autorizar a IA de nuvem, ou não está nesta conta (Grátis, convidado). */
  correcao: CorrecaoNaPratica;
  aoMudar: (ligada: boolean) => void;
  /** Autoriza a IA de nuvem (com data, como Ajustes → Privacidade). */
  aoAutorizar: () => void;
}

/** A prática vale agora (ligada e cabe nesta conversa)? */
export const praticandoAgora = (p: PraticaNaConversa | undefined): boolean => !!p?.ligada && p.possivel === 'ok';

/** O botão "Praticar" da faixa: liga e desliga (aria-pressed), ao lado de "Conversa". */
export function modoDaPratica(p: PraticaNaConversa, aoTocar: () => void): ModoDaFaixa {
  return {
    id: 'praticar-conversa',
    icone: GraduationCap,
    rotulo: t('Praticar'),
    rotuloParaLeitor: t('Praticar falando em {idioma}', { idioma: langLabelNaUI(p.idioma) }),
    ligado: praticandoAgora(p),
    aoTocar,
  };
}

/**
 * A linha da faixa com a prática ligada. Pela `copy-br-etica`: o fato e o que segue funcionando, sem oferta de plano
 * (nem no Grátis, nem no perfil protegido).
 */
export function avisoDaPratica(p: PraticaNaConversa | undefined): string | null {
  if (!p || !praticandoAgora(p)) return null;
  const idioma = langLabelNaUI(p.idioma);
  if (p.correcao === 'ligada')
    return t('Praticando em {idioma}: a sua fala ganha uma dica de como soar mais natural.', { idioma });
  if (p.correcao === 'sem_consentimento')
    return t('Praticando em {idioma}. A dica da sua fala usa a IA de nuvem, que você ainda não autorizou.', { idioma });
  return t(
    'Praticando em {idioma}. A dica da sua fala não está disponível nesta conta; a tradução segue funcionando.',
    {
      idioma,
    },
  );
}

/** Tocou em "Praticar" sem o idioma da outra pessoa ("Detectar"): o automático não separa duas pessoas num idioma só. */
export const textoDaPraticaSemIdioma = (): string => t('Para praticar, escolha o idioma da outra pessoa.');

/** Tocou em "Automático" praticando: o toque é o que diz quem falou. */
export const textoDaPraticaNoToque = (): string =>
  t('Na prática, cada um toca em Falar na sua vez: assim o app sabe quem falou.');

/** A dica de começo da metade da pessoa, praticando. */
export const dicaDaPratica = (idioma: string): string =>
  t('Toque em Falar e responda em {idioma}.', { idioma: langLabelNaUI(idioma) });
