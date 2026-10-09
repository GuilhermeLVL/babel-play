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
import { numero, t } from '../../../lib/i18n';
import type { AgeProfileType } from '../../../lib/profile';
import { perfilProtegido } from '../../../lib/protecaoDoMenor';
import { JOGOS_COM_RANKING, lerApelido, lerRanking, type LinhaDoRanking } from '../../../lib/ranking';
import MolduraETitulo from '../../perfil/MolduraETitulo';
import { IconePixel } from './IconesPixel';
import { JOGOS } from './jogos';
import { OpcoesDoQuest, PainelDoQuest } from './quest/pecasDoQuest';

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

  /* META QUEST: o mesmo diálogo com as peças do headset. A escolha entre os dois placares, os três
     números, a tabela por jogo e o ranking com a posição escrita (a medalha continua nos três primeiros). */
  return (
    <PainelDoQuest
      largo
      icone={Trophy}
      titulo={t('Recordes')}
      sub={t('Seus melhores resultados e o placar de quem joga o mesmo jogo.')}
      aoFechar={onFechar}
      classe="qj-recordes"
    >
      {protegido ? (
        <p className="qj-nota">
          <Shield aria-hidden /> {t('No perfil protegido não há ranking público: os seus recordes ficam só com você.')}
        </p>
      ) : semRanking ? null : (
        <OpcoesDoQuest
          rotulo={t('Qual recorde')}
          exclusiva
          valor={[aba]}
          aoTrocar={(v) => setAba(v as typeof aba)}
          opcoes={[
            { id: 'meus', rotulo: t('Meus recordes') },
            { id: 'global', rotulo: t('Ranking global') },
          ]}
        />
      )}

      {aba === 'meus' || semRanking ? (
        <>
          <div className="q-grade g3">
            <div className="q-num">
              <b>{recordes ? numero(geral) : '—'}</b>
              <span>{t('Melhor placar')}</span>
            </div>
            <div className="q-num">
              <b>{recordes ? numero(rodadas) : '—'}</b>
              <span>{t('Rodadas')}</span>
            </div>
            <div className="q-num">
              <b>{t('{a} de {b}', { a: vistos, b: totalEventos })}</b>
              <span>{t('Eventos raros')}</span>
            </div>
          </div>
          {recordes === null ? (
            <div className="q-esqueleto qj-esqueleto-tabela" aria-hidden />
          ) : recordes.length === 0 ? (
            <div className="q-vazio">
              <span className="q-ic" aria-hidden>
                <Trophy />
              </span>
              <h3>{t('Nenhuma rodada ainda')}</h3>
              <p>{t('Jogue uma e o seu histórico nasce aqui.')}</p>
            </div>
          ) : (
            <div className="q-tabela-caixa" tabIndex={0} role="region" aria-label={t('Recordes por jogo')}>
              <table className="q-tabela">
                <thead>
                  <tr>
                    <th>{t('Jogo')}</th>
                    <th>{t('Melhor')}</th>
                    <th>{t('Combo')}</th>
                    <th>{t('Precisão')}</th>
                    <th>{t('Rodadas')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...recordes]
                    .sort((a, b) => b.melhorPontos - a.melhorPontos)
                    .map((r) => (
                      <tr key={r.exerciseKind}>
                        <td>
                          <span className="qj-jogo-na-tabela">
                            <span className="mini-arte" aria-hidden>
                              {JOGOS.some((j) => j.id === r.exerciseKind) && (
                                <IconePixel id={r.exerciseKind as (typeof JOGOS)[number]['id']} />
                              )}
                            </span>
                            {tituloDoJogo(r.exerciseKind, ageProfile)}
                          </span>
                        </td>
                        <td>
                          <b>{numero(r.melhorPontos)}</b>
                        </td>
                        <td>{r.melhorCombo ? `×${r.melhorCombo}` : '—'}</td>
                        <td>{r.precisao != null ? `${r.precisao}%` : '—'}</td>
                        <td>{r.rodadas}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          {jogosDoRanking.length > 1 ? (
            <OpcoesDoQuest
              rotulo={t('Jogo do ranking')}
              exclusiva
              valor={[jogoGlobal]}
              aoTrocar={setJogoGlobal}
              opcoes={jogosDoRanking.map((j) => ({ id: j.id, rotulo: t(j.titulo[ageProfile]).split(':')[0] }))}
            />
          ) : (
            <p className="q-rotulo">{tituloDoJogo(jogoGlobal, ageProfile)}</p>
          )}
          {ranking === 'carregando' ? (
            <div className="q-esqueleto qj-esqueleto-tabela" aria-hidden />
          ) : ranking === null ? (
            <div className="q-vazio">
              <span className="q-ic" aria-hidden>
                <Globe2 />
              </span>
              <h3>{t('Não deu para carregar o ranking agora')}</h3>
              <p>{t('O top 20 de cada jogo aparece aqui, com o seu apelido. Tente de novo em instantes.')}</p>
            </div>
          ) : ranking.length === 0 ? (
            <div className="q-vazio">
              <span className="q-ic" aria-hidden>
                <Globe2 />
              </span>
              <h3>{t('Ninguém no placar deste jogo ainda')}</h3>
              <p>{t('Seja a primeira pessoa do placar.')}</p>
            </div>
          ) : (
            <div className="q-tabela-caixa" tabIndex={0} role="region" aria-label={t('Ranking global')}>
              <table className="q-tabela">
                <thead>
                  <tr>
                    <th>{t('Posição')}</th>
                    <th>{t('Apelido')}</th>
                    <th>{t('Combo')}</th>
                    <th>{t('Pontos')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((l, i) => {
                    const voce = !!apelido && l.apelido === apelido;
                    return (
                      <tr key={l.apelido + i} className={voce ? 'qj-voce' : undefined}>
                        <td>
                          <span className="qj-jogo-na-tabela">
                            {i < 3 && <Medal aria-hidden className={`qj-medalha m${i + 1}`} />}
                            {t('{n}º lugar', { n: i + 1 })}
                          </span>
                        </td>
                        <td>
                          {l.apelido}
                          {voce && <small> {t('(você)')}</small>}
                          {voce && (
                            <>
                              {' '}
                              <MolduraETitulo compacto />
                            </>
                          )}
                        </td>
                        <td>×{l.combo}</td>
                        <td>
                          <b>{numero(l.pontos)}</b>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="qj-nota">
            <Shield aria-hidden /> {t('No ranking aparece só o seu apelido.')}
          </p>
        </>
      )}
    </PainelDoQuest>
  );
}
