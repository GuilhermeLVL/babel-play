import { AudioLines, BookMarked, Brain, KeyRound, LayoutGrid, Play } from 'lucide-react';

import type { FalaDaAnalise } from '../../../../lib/analise/tiposDaAnalise';
import { t, tp } from '../../../../lib/i18n';

type SecaoDaVisaoGeral = 'dashboard' | 'lexical' | 'fluency';

/** Um ladrilho do Painel: o mesmo dado que a tela de sempre mostra (ou o motivo de não haver). */
export interface LadrilhoDaSessao {
  id: string;
  rotulo: string;
  valor: string;
  /** A explicação embaixo do número. */
  dica: string;
  /** O tom do número na tela de sempre (`acc`, `good`, `warn` ou vazio). */
  tom: string;
}

const secoesDaVisao = () =>
  [
    { id: 'dashboard', rotulo: t('Painel'), icone: LayoutGrid },
    { id: 'lexical', rotulo: t('Inteligência lexical'), icone: Brain },
    { id: 'fluency', rotulo: t('Fluência'), icone: AudioLines },
  ] as const;

/**
 * A ABA "VISÃO GERAL & MÉTRICAS" NO META QUEST.
 *
 * As três seções da tela de sempre (Painel, Inteligência lexical, Fluência), com os mesmos números:
 * os ladrilhos viram `.q-num` (número grande, nome e a explicação embaixo), as palavras-chave e as
 * palavras dos microdados viram pílulas de 56 px, e cada ocorrência é uma linha inteira que toca o
 * trecho. Documento não tem a seção de fluência, como sempre.
 *
 * Só apresentação: os números chegam prontos da `Analysis` (`useMetricasDaSessao`).
 */
export default function VisaoGeralDoQuest({
  documento,
  secao,
  aoTrocarSecao,
  ladrilhos,
  palavrasChave,
  aoEscolherPalavraChave,
  topologia,
  micro,
  fluencia,
}: {
  documento: boolean;
  secao: SecaoDaVisaoGeral;
  aoTrocarSecao: (secao: SecaoDaVisaoGeral) => void;
  ladrilhos: readonly LadrilhoDaSessao[];
  palavrasChave: readonly string[];
  /** Abre os microdados daquela palavra (leva à seção "Inteligência lexical"). */
  aoEscolherPalavraChave: (palavra: string) => void;
  topologia: { unicas: string; noCaderno: string; frase: string };
  micro: {
    palavras: readonly string[];
    atual: string;
    aoEscolher: (palavra: string) => void;
    ocorrencias: readonly FalaDaAnalise[];
    podeOuvir: (fala: FalaDaAnalise) => boolean;
    aoOuvir: (fala: FalaDaAnalise) => void;
  };
  fluencia: {
    silencio: string;
    vicios: string;
    pausas: string;
    ritmo: ReadonlyArray<{ nome: string; ppm: number; pct: number }>;
  };
}) {
  const secoes = secoesDaVisao().filter((s) => s.id !== 'fluency' || !documento);
  const atual = secao === 'fluency' && documento ? 'dashboard' : secao;

  return (
    <div className="qs-visao" data-testid="visao-geral-do-quest">
      <div className="q-abas q-seg" role="tablist" aria-label={t('Seções da visão geral')}>
        {secoes.map(({ id, rotulo, icone: Icone }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`aba-${id}`}
            className="q-aba"
            aria-selected={atual === id}
            aria-controls={`painel-${id}`}
            onClick={() => aoTrocarSecao(id)}
          >
            <Icone aria-hidden /> {rotulo}
          </button>
        ))}
      </div>

      <div className="qs-secao-da-visao" role="tabpanel" id={`painel-${atual}`} aria-labelledby={`aba-${atual}`}>
        {atual === 'dashboard' && (
          <>
            <div className="q-grade g4 qs-ladrilhos">
              {ladrilhos.map((l) => (
                <div key={l.id} className="q-num" data-ladrilho={l.id}>
                  <span className="q-rotulo">{l.rotulo}</span>
                  <b className={l.tom}>{l.valor}</b>
                  <span>{l.dica}</span>
                </div>
              ))}
            </div>
            <section className="q-secao" aria-label={t('Palavras-chave da sessão')}>
              <header>
                <div>
                  <h2>
                    <KeyRound aria-hidden /> {t('Palavras-chave da sessão')}
                  </h2>
                  {palavrasChave.length > 0 && <p>{t('Toque numa palavra para ver onde ela aparece.')}</p>}
                </div>
              </header>
              {palavrasChave.length > 0 ? (
                <div className="q-acoes">
                  {palavrasChave.map((kw) => (
                    <button key={kw} type="button" className="q-chip" onClick={() => aoEscolherPalavraChave(kw)}>
                      {kw}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="qs-apoio">{t('Sem transcrição real para extrair palavras-chave.')}</p>
              )}
            </section>
          </>
        )}

        {atual === 'lexical' && (
          <div className="q-grade g2 qs-lexical">
            <section className="q-cartao" aria-label={t('Topologia lexical da sessão')}>
              <h2 className="qs-titulo-do-cartao">
                <Brain aria-hidden /> {t('Topologia lexical da sessão')}
              </h2>
              <div className="q-grade g2">
                <div className="q-num">
                  <span className="q-rotulo">{t('Palavras únicas')}</span>
                  <b>{topologia.unicas}</b>
                </div>
                <div className="q-num">
                  <span className="q-rotulo">{t('No seu caderno')}</span>
                  <b className="acc">{topologia.noCaderno}</b>
                </div>
              </div>
              <p className="qs-apoio">{topologia.frase}</p>
            </section>

            <section className="q-cartao" aria-label={t('Microdados lexicais')}>
              <h2 className="qs-titulo-do-cartao">
                <BookMarked aria-hidden /> {t('Microdados lexicais')}
              </h2>
              {micro.palavras.length ? (
                <>
                  <div className="q-acoes" role="group" aria-label={t('Palavra dos microdados')}>
                    {micro.palavras.map((w) => (
                      <button
                        key={w}
                        type="button"
                        className="q-chip"
                        aria-pressed={micro.atual === w}
                        onClick={() => micro.aoEscolher(w)}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                  <div>
                    <h3 className="qs-palavra-do-micro">{micro.atual}</h3>
                    <p className="qs-apoio">
                      {tp(micro.ocorrencias.length, '{n} ocorrência nesta sessão', '{n} ocorrências nesta sessão')}
                    </p>
                  </div>
                  <div className="q-lista">
                    {micro.ocorrencias.map((f) =>
                      micro.podeOuvir(f) ? (
                        <button
                          key={f.index}
                          type="button"
                          className="q-linha qs-ocorrencia"
                          aria-label={
                            f.time
                              ? t('Ouvir o trecho a partir de {tempo}: {frase}', { tempo: f.time, frase: f.original })
                              : t('Ouvir o trecho: {frase}', { frase: f.original })
                          }
                          onClick={() => micro.aoOuvir(f)}
                        >
                          <span className="q-ic">
                            <Play aria-hidden />
                          </span>
                          <span className="qs-frase-da-ocorrencia">{f.original}</span>
                          {f.time && <span className="q-fim">{f.time}</span>}
                        </button>
                      ) : (
                        <div key={f.index} className="q-cartao fundo qs-ocorrencia-muda">
                          <span className="qs-frase-da-ocorrencia">{f.original}</span>
                        </div>
                      ),
                    )}
                  </div>
                </>
              ) : (
                <p className="qs-apoio">
                  {t(
                    'Nenhuma palavra desta sessão no caderno ainda: guarde uma pela transcrição para ver onde ela aparece.',
                  )}
                </p>
              )}
            </section>
          </div>
        )}

        {atual === 'fluency' && (
          <>
            <div className="q-grade g3">
              <div className="q-num">
                <span className="q-rotulo">{t('Silêncio total')}</span>
                <b>{fluencia.silencio}</b>
              </div>
              <div className="q-num">
                <span className="q-rotulo">{t('Vícios de linguagem')}</span>
                <b className="good">{fluencia.vicios}</b>
              </div>
              <div className="q-num">
                <span className="q-rotulo">{t('Pausas longas')}</span>
                <b className="warn">{fluencia.pausas}</b>
              </div>
            </div>
            <section className="q-cartao" aria-label={t('Ritmo por falante')}>
              <h2 className="qs-titulo-do-cartao">
                <AudioLines aria-hidden /> {t('Ritmo por falante')}
              </h2>
              {fluencia.ritmo.length ? (
                <div className="qs-ritmo">
                  {fluencia.ritmo.map((f) => (
                    <div key={f.nome} className="qs-falante">
                      <b>{f.nome}</b>
                      <span className="qs-ppm">{t('{n} palavras/min', { n: f.ppm })}</span>
                      <div
                        className="q-barra"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={f.pct}
                        aria-label={t('Ritmo de {nome}', { nome: f.nome })}
                      >
                        <span style={{ width: `${f.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="qs-apoio">{t('Requer o tempo de cada fala; esta gravação não tem.')}</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
