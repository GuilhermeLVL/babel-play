/**
 * O AVISO DO PREPARO NA TELA DO INTÉRPRETE — o que o painel de preparo da captura diz, numa linha só.
 *
 * O intérprete cobre a captura inteira, e o painel de preparo (`ModelPrepPanel`) ficava por baixo: o
 * tradutor do outro sentido baixando, o pacote de voz do navegador instalando, o erro do modelo — nada
 * disso aparecia, e a primeira frase do outro lado parecia não ter sido ouvida (relato do dono, 30/09).
 * Aqui o mesmo estado vira a frase da faixa do meio. Puro: a tela só desenha o texto.
 */
import type { ModelPrepState } from '../../components/ModelPrepPanel';
import { t } from '../i18n';

const pct = (p: number) => `${Math.max(0, Math.min(99, Math.round(p * 100)))}%`;

/** A linha do preparo, ou `null` quando não há nada a esperar. O erro vence; depois, a voz; depois, a tradução. */
export function avisoDoPreparo(prep: ModelPrepState | null | undefined): string | null {
  if (!prep) return null;
  if (prep.error) return prep.error;
  const voz = prep.nativos?.voz;
  if (voz !== undefined)
    return typeof voz === 'number'
      ? t('Instalando o reconhecimento de voz · {p}', { p: pct(voz) })
      : t('Instalando o reconhecimento de voz…');
  if (prep.whisper !== null && prep.whisper < 1)
    return t('Baixando o reconhecimento de voz · {p}', { p: pct(prep.whisper) });
  const tradutor = prep.nativos?.tradutor;
  if (tradutor !== undefined)
    return typeof tradutor === 'number'
      ? t('Instalando o tradutor · {p}', { p: pct(tradutor) })
      : t('Instalando o tradutor…');
  if (prep.mt !== null && prep.mt < 1) return t('Preparando a tradução dos dois lados · {p}', { p: pct(prep.mt) });
  return null;
}
