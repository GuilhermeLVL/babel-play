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

/**
 * A FAIXA DO INTÉRPRETE quando falta a voz do idioma (CONV-06, auditoria de 17/11/2026): a instrução de instalar a voz
 * ("Este aparelho não tem voz em inglês… Gerenciar vozes") é o que a pessoa precisa fazer, e ficava escondida pelo
 * progresso do pacote do tradutor em 2 s. Ela vence o PROGRESSO do preparo; o ERRO do preparo continua vencendo.
 */
export function avisoComAVozPrimeiro(
  prep: ModelPrepState | null | undefined,
  avisoDaVoz: string | null | undefined,
): string | null {
  if (prep?.error) return prep.error;
  /* Só disputa com o PROGRESSO: sem preparo em curso, a faixa segue a ordem de sempre da tela (prática, cadeado, voz…). */
  const progresso = avisoDoPreparo(prep);
  return progresso ? avisoDaVoz || progresso : null;
}
