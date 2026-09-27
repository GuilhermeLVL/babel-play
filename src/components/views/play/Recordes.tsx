/**
 * MEUS RECORDES + RANKING GLOBAL — `dialogoRecordes()` do protótipo aprovado, sobre dado real.
 *
 * `<dialog class="medio">` com o cabeçalho `.dlg-cab` (troféu), o `.seg` "Meus recordes / Ranking
 * global", três ladrilhos, a tabela `.tabela.compacta` com a mini-arte de cada jogo e o `ol.ranking`
 * com medalhas. Os números vêm de `/api/exercises/recordes` (o mesmo da tela de fim de rodada) e do
 * ranking do servidor (`/api/rank`); os eventos raros, do que este navegador já viu.
 *
 * O estado vazio diz o que significa: sem rodada ainda, ou sem conseguir falar com o servidor.
 */
import { Globe2, Medal, Shield, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { fetchRecordes, type RecordeDoJogo } from '../../../data/api';
import { edicaoEstatica } from '../../../lib/edicaoEstatica';
import { eventosVistos, todosOsEventos } from '../../../lib/eventosDeJogo';
import { t } from '../../../lib/i18n';
import type { AgeProfileType } from '../../../lib/profile';
import { perfilProtegido } from '../../../lib/protecaoDoMenor';
import { JOGOS_COM_RANKING, lerApelido, lerRanking, type LinhaDoRanking } from '../../../lib/ranking';
import Dialogo from '../../ui/Dialogo';
import IconeEmBloco from '../../ui/IconeEmBloco';
import { IconePixel } from './IconesPixel';
import { JOGOS } from './jogos';

function tituloDoJogo(id: string, ageProfile: AgeProfileType): string {
  const j = JOGOS.find((x) => x.id === id);
  return j ? j.titulo[ageProfile].split(':')[0] : id;
}

export default function Recordes({ ageProfile, onFechar }: { ageProfile: AgeProfileType; onFechar: () => void }) {
  const [aba, setAba] = useState<'meus' | 'global'>('meus');
  const [recordes, setRecordes] = useState<RecordeDoJogo[] | null>(null);
  const jogosDoRanking = JOGOS.filter((j) => JOGOS_COM_RANKING.includes(j.id));
  const [jogoGlobal, setJogoGlobal] = useState<string>(JOGOS_COM_RANKING[0]);
  const [ranking, setRanking] = useState<LinhaDoRanking[] | null | 'carregando'>('carregando');

  useEffect(() => {
    void fetchRecordes().then(setRecordes);
  }, []);
  useEffect(() => {
    if (aba !== 'global') return;
    setRanking('carregando');
    void lerRanking(jogoGlobal).then((r) => setRanking(r));
  }, [aba, jogoGlobal]);

  /* Perfil protegido (Fase 4 — ECA Digital): sem ranking público, nem para ver. */
  const protegido = perfilProtegido();
  /* Edição estática: o placar de comunidade mora no servidor, que ela não tem — só os seus. */
  const semRanking = protegido || edicaoEstatica();
  const vistos = eventosVistos().length;
  const totalEventos = todosOsEventos().length;
  const apelido = lerApelido();
  const geral = (recordes ?? []).reduce((m, r) => Math.max(m, r.melhorPontos), 0);
  const rodadas = (recordes ?? []).reduce((s, r) => s + r.rodadas, 0);

  return (
    <Dialogo
      icone={Trophy}
      titulo={t('Recordes')}
      sub={t('Seus melhores resultados e o placar de quem joga o mesmo jogo.')}
      aoFechar={onFechar}
    >
      <div className="dlg-corpo pilha">
        {protegido ? (
          <p className="mut" style={{ fontSize: 12.5 }}>
            <Shield aria-hidden style={{ width: 13, height: 13, verticalAlign: -2 }} />{' '}
            {t('No perfil protegido não há ranking público: os seus recordes ficam só com você.')}
          </p>
        ) : semRanking ? null : (
          <div className="seg" role="radiogroup" aria-label={t('Qual recorde')}>
            {(
              [
                ['meus', t('Meus recordes')],
                ['global', t('Ranking global')],
              ] as const
            ).map(([v, r]) => (
              <button key={v} type="button" role="radio" aria-checked={aba === v} onClick={() => setAba(v)}>
                {r}
              </button>
            ))}
          </div>
        )}

        {aba === 'meus' || semRanking ? (
          <>
            <div className="ladrilhos" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              <div className="cartao ladrilho">
                <span className="label-mono">{t('Melhor placar')}</span>
                <span className="v acc tn">{recordes ? geral : '—'}</span>
              </div>
              <div className="cartao ladrilho">
                <span className="label-mono">{t('Rodadas')}</span>
                <span className="v tn">{recordes ? rodadas : '—'}</span>
              </div>
              <div className="cartao ladrilho">
                <span className="label-mono">{t('Eventos raros')}</span>
                <span className="v tn">{t('{a} de {b}', { a: vistos, b: totalEventos })}</span>
              </div>
            </div>
            {recordes === null ? (
              <div className="cartao esqueleto" style={{ height: 160 }} aria-hidden />
            ) : recordes.length === 0 ? (
              <div className="vazio">
                <IconeEmBloco icone={Trophy} />
                <h3>{t('Nenhuma rodada ainda')}</h3>
                <p>{t('Jogue uma e o seu histórico nasce aqui.')}</p>
              </div>
            ) : (
              <div className="tabela-rola" tabIndex={0} role="region" aria-label={t('Recordes por jogo')}>
                <table className="tabela compacta">
                  <thead>
                    <tr>
                      <th className="label-mono">{t('Jogo')}</th>
                      <th className="label-mono tn">{t('Melhor')}</th>
                      <th className="label-mono tn">{t('Combo')}</th>
                      <th className="label-mono tn">{t('Precisão')}</th>
                      <th className="label-mono tn">{t('Rodadas')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...recordes]
                      .sort((a, b) => b.melhorPontos - a.melhorPontos)
                      .map((r) => (
                        <tr key={r.exerciseKind}>
                          <td>
                            <span className="linha" style={{ gap: 8 }}>
                              <span className="mini-arte" aria-hidden>
                                {JOGOS.some((j) => j.id === r.exerciseKind) && (
                                  <IconePixel id={r.exerciseKind as (typeof JOGOS)[number]['id']} />
                                )}
                              </span>
                              {tituloDoJogo(r.exerciseKind, ageProfile)}
                            </span>
                          </td>
                          <td className="tn">
                            <b>{r.melhorPontos}</b>
                          </td>
                          <td className="tn">{r.melhorCombo ? `×${r.melhorCombo}` : '—'}</td>
                          <td className="tn">{r.precisao != null ? `${r.precisao}%` : '—'}</td>
                          <td className="tn">{r.rodadas}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
            {/* SÓ OS JOGOS QUE ENVIAM PONTUAÇÃO (`JOGOS_COM_RANKING`). Havia um chip por jogo, e os
                oito que nunca enviam abriam um placar vazio para sempre. Com um jogo só, não há o
                que escolher: o nome dele vira o título do placar. */}
            {jogosDoRanking.length > 1 ? (
              <div className="chips" role="radiogroup" aria-label={t('Jogo do ranking')}>
                {jogosDoRanking.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    className="pill"
                    role="radio"
                    aria-checked={jogoGlobal === j.id}
                    onClick={() => setJogoGlobal(j.id)}
                  >
                    {j.titulo[ageProfile].split(':')[0]}
                  </button>
                ))}
              </div>
            ) : (
              <p className="label-mono">{tituloDoJogo(jogoGlobal, ageProfile)}</p>
            )}
            {ranking === 'carregando' ? (
              <div className="cartao esqueleto" style={{ height: 200 }} aria-hidden />
            ) : ranking === null ? (
              <div className="vazio">
                <IconeEmBloco icone={Globe2} />
                <h3>{t('Não deu para carregar o ranking agora')}</h3>
                <p>{t('O top 20 de cada jogo aparece aqui, com o seu apelido. Tente de novo em instantes.')}</p>
              </div>
            ) : ranking.length === 0 ? (
              <div className="vazio">
                <IconeEmBloco icone={Globe2} />
                <h3>{t('Ninguém no placar deste jogo ainda')}</h3>
                <p>{t('Seja a primeira pessoa do placar.')}</p>
              </div>
            ) : (
              <ol className="ranking">
                {ranking.map((l, i) => {
                  const voce = !!apelido && l.apelido === apelido;
                  return (
                    <li key={l.apelido + i} className={voce ? 'voce' : ''}>
                      <span className="pos tn">
                        {i < 3 ? (
                          <span className={`medalha m${i + 1}`} role="img" aria-label={t('{n}º lugar', { n: i + 1 })}>
                            <Medal aria-hidden />
                          </span>
                        ) : (
                          `${i + 1}º`
                        )}
                      </span>
                      <span className="nome">
                        {l.apelido}
                        {voce && <small> {t('(você)')}</small>}
                      </span>
                      <span className="mut tn" style={{ fontSize: 12 }}>
                        combo ×{l.combo}
                      </span>
                      <b className="tn">{l.pontos}</b>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="mut" style={{ fontSize: 12, marginTop: 10 }}>
              <Shield aria-hidden style={{ width: 13, height: 13, verticalAlign: -2 }} />{' '}
              {t('No ranking aparece só o seu apelido.')}
            </p>
          </>
        )}
      </div>
    </Dialogo>
  );
}
