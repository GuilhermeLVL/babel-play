/**
 * O AVISO DO PREPARO NA TELA DO INTÉRPRETE — o que o painel de preparo da captura diz, numa linha só.
 *
 * O intérprete cobre a captura inteira, e o painel de preparo (`ModelPrepPanel`) ficava por baixo: o
 * tradutor do outro sentido baixando, o pacote de voz do navegador instalando, o erro do modelo — nada
 * disso aparecia, e a primeira frase do outro lado parecia não ter sido ouvida (relato do dono, 30/09).
 * Aqui o mesmo estado vira a frase da faixa do meio. Puro: a tela só desenha o texto.
 */
import type { ModelPrepState } from '../../components/ModelPrepPanel';
import { falhaDaCaptura } from '../falhas/falhaNaTela';
import { t } from '../i18n';

const pct = (p: number) => `${Math.max(0, Math.min(99, Math.round(p * 100)))}%`;

/** A linha do preparo, ou `null` quando não há nada a esperar. O erro vence; depois, a voz; depois, a tradução. */
export function avisoDoPreparo(prep: ModelPrepState | null | undefined): string | null {
  if (!prep) return null;
  // O erro cru ("Failed to fetch", "Worker error") nunca chega à tela: o mapa de falhas (DISP-03).
  if (prep.error) return t(falhaDaCaptura(prep.error).texto);
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
 * O RECONHECIMENTO AINDA NÃO OUVE (conversa-de-verdade, 4.1): o progresso do modelo de transcrição (0..1) enquanto ele
 * baixa ou carrega, ou `null` quando está pronto, falhou ou não há modelo a esperar (a Web Speech, a nuvem). É o que
 * troca o "Ouvindo…" do Intérprete por "Preparando N%": dizer que ouve antes de poder ouvir era mentir (CONV-09).
 */
export function progressoDoReconhecimento(prep: ModelPrepState | null | undefined): number | null {
  if (!prep || prep.error || prep.done || prep.whisper === null) return null;
  return Math.max(0, Math.min(1, prep.whisper));
}

/**
 * O PREPARO ANTES DO PRIMEIRO NÚMERO: entre o toque em "Falar" e o primeiro aviso do download, a preparação ainda lê a
 * rota e o cache, e o `modelPrep` vem vazio (ou só com o tradutor do navegador) — a tela dizia "Ouvindo…" por ~0,2 s (medido na rodada local). Enquanto o
 * modelo desta conversa não está no aparelho e ainda não ficou pronto nesta sessão, o preparo é 0.
 */
export function preparoDoInterprete(
  prep: ModelPrepState | null | undefined,
  o: { esperandoModelo: boolean },
): number | null {
  const p = progressoDoReconhecimento(prep);
  if (p !== null) return p;
  /* Com o painel já aberto por outra peça (o tradutor do navegador instalando) e o número da transcrição ainda vazio. */
  return o.esperandoModelo && !prep?.error && !prep?.done ? 0 : null;
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
