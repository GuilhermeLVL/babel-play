/**
 * O RESUMO DO PREPARO NA FAIXA DO MEIO do modo intérprete. O preparo dos dois lados — o pacote de voz
 * do navegador, o modelo de fala do app, o tradutor dos DOIS sentidos — já vive no estado da captura
 * (`ModelPrepState`, com a barra detalhada que está por baixo da tela). Aqui sai só o que cabe na
 * faixa: uma frase e, quando há, uma porcentagem.
 *
 * A ORDEM é a do que IMPEDE de falar: sem o reconhecimento, ninguém é ouvido; sem a tradução, a fala
 * fica no original. Por isso a voz vem primeiro, e a tradução por último.
 */
import type { ModelPrepState } from '../../components/ModelPrepPanel';
import { t } from '../i18n';

export interface ResumoDoPreparo {
  texto: string;
  /** 0–100; `null` = sem porcentagem (o pacote do navegador não a informa). */
  pct: number | null;
}

const pendente = (p: number | null | undefined) => p !== undefined && (p === null || p < 1);
const pct = (p: number | null | undefined) => (p == null ? null : Math.round(Math.min(p, 1) * 100));

export function resumoDoPreparo(s: ModelPrepState | null): ResumoDoPreparo | null {
  if (!s) return null;
  if (s.error) return { texto: t('Não foi possível preparar o modelo. Saia e tente de novo.'), pct: null };
  if (pendente(s.nativos?.voz)) return { texto: t('Preparando o reconhecimento de voz…'), pct: null };
  if (s.whisper !== null && pendente(s.whisper))
    return { texto: t('Preparando o modelo de voz…'), pct: pct(s.whisper) };
  if (s.mt !== null && pendente(s.mt)) return { texto: t('Preparando a tradução…'), pct: pct(s.mt) };
  if (pendente(s.nativos?.tradutor)) return { texto: t('Preparando a tradução…'), pct: pct(s.nativos?.tradutor) };
  return null;
}
