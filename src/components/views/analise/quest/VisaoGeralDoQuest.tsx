import { t } from '../../../../lib/i18n';

type SecaoDaVisaoGeral = 'dashboard' | 'lexical' | 'fluency';

const secoesDaVisao = () =>
  [
    { id: 'dashboard', rotulo: t('Painel') },
    { id: 'lexical', rotulo: t('Inteligência lexical') },
    { id: 'fluency', rotulo: t('Fluência') },
  ] as const;

/**
 * A ABA "VISÃO GERAL & MÉTRICAS" DO DESENHO NOVO — a marcação do quarto painel de
 * `PAINEIS_DA_SESSAO` (`telas3.js:83-93`): os segmentos Painel, Inteligência lexical e Fluência; os
 * cartões de número, a nuvem de palavras, os microdados e o ritmo por falante.
 *
 * Os números são os desta gravação (`useMetricasDaSessao`, na `Analysis`); a forma é a do protótipo.
 * Documento não tem a seção de fluência, como sempre.
 */
export default function VisaoGeralDoQuest({
  documento,
  secao,
  aoTrocarSecao,
  painel,
  palavrasChave,
  nuvem,
  micro,
  fluencia,
}: {
  documento: boolean;
  secao: SecaoDaVisaoGeral;
  aoTrocarSecao: (secao: SecaoDaVisaoGeral) => void;
  /** Os quatro cartões do Painel: rótulo e valor (`telas3.js:85`). */
  painel: ReadonlyArray<readonly [rotulo: string, valor: string]>;
  palavrasChave: readonly string[];
  /** As palavras da nuvem (`telas3.js:87`). */
  nuvem: readonly string[];
  /** Os microdados: a palavra, a tradução dela e quantas vezes aparece na sessão (`telas3.js:88`). */
  micro: ReadonlyArray<{ palavra: string; glosa: string; vezes: number }>;
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
      <div className="q-abas q-seg px-abas-visao" role="group" aria-label={t('Visão')}>
        {secoes.map(({ id, rotulo }) => (
          <button
            key={id}
            type="button"
            role="radio"
            className="q-aba"
            aria-checked={atual === id}
            data-px-visao={id}
            onClick={() => aoTrocarSecao(id)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {atual === 'dashboard' && (
        <>
          <div className="q-grade g4 qs-ladrilhos">
            {painel.map(([rotulo, valor]) => (
              <div key={rotulo} className="q-cartao q-num">
                <span className="q-rotulo">{rotulo}</span>
                <b>{valor}</b>
              </div>
            ))}
          </div>
          <section className="q-cartao">
            <p className="qs-titulo-do-cartao q-rotulo">{t('Palavras-chave da sessão')}</p>
            {palavrasChave.length > 0 ? (
              <div className="q-acoes">
                {palavrasChave.map((kw) => (
                  <span key={kw} className="q-chip">
                    {kw}
                  </span>
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
          <section className="q-cartao">
            <p className="qs-titulo-do-cartao q-rotulo">{t('Topologia lexical da sessão')}</p>
            {nuvem.length > 0 ? (
              <div className="px-nuvem">
                {nuvem.map((p, i) => (
                  /* `telas3.js:87`: o tamanho da palavra vem da posição dela, de 14 a 29 px. Vai numa
                     variável (e não em `font-size` na linha) para o piso de texto do headset
                     (`questBase.css`) não trocar 14 por 16. */
                  <span key={p} style={{ ['--px-tam' as string]: `${14 + ((i * 7) % 16)}px` }}>
                    {p}
                  </span>
                ))}
              </div>
            ) : (
              <p className="qs-apoio">{t('Sem transcrição ainda: as contas aparecem quando houver texto.')}</p>
            )}
          </section>
          <section className="q-cartao">
            <p className="qs-titulo-do-cartao q-rotulo">{t('Microdados lexicais')}</p>
            {micro.length > 0 ? (
              <div className="q-lista">
                {micro.map((m) => (
                  <div key={m.palavra} className="q-linha qs-ocorrencia">
                    <span>
                      <b className="qs-palavra-do-micro">{m.palavra}</b>
                      <small>{m.glosa}</small>
                    </span>
                    <span className="q-fim">{m.vezes}×</span>
                  </div>
                ))}
              </div>
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
            {(
              [
                [t('Silêncio total'), fluencia.silencio],
                [t('Vícios de linguagem'), fluencia.vicios],
                [t('Pausas longas'), fluencia.pausas],
              ] as const
            ).map(([rotulo, valor]) => (
              <div key={rotulo} className="q-cartao q-num">
                <span className="q-rotulo">{rotulo}</span>
                <b>{valor}</b>
              </div>
            ))}
          </div>
          <section className="q-cartao qs-ritmo">
            <p className="qs-titulo-do-cartao q-rotulo">{t('Ritmo por falante')}</p>
            {fluencia.ritmo.length ? (
              fluencia.ritmo.map((f) => (
                <div key={f.nome} className="qs-falante">
                  <b>{f.nome}</b>
                  <span className="q-barra">
                    <span style={{ width: `${f.pct}%` }} />
                  </span>
                  <span className="qs-ppm tn">{t('{n} ppm', { n: f.ppm })}</span>
                </div>
              ))
            ) : (
              <p className="qs-apoio">{t('Requer o tempo de cada fala; esta gravação não tem.')}</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
