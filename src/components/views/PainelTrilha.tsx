import '../../styles/questJogarTelas.css';

import {
  type CefrLevel,
  chaveDaPalavra,
  type DadoTrilha,
  etapaAtual,
  etapasDoNivel,
  nivelSugerido,
  posicaoNaTrilha,
  progressoDasEtapas,
  progressoDaTrilha,
} from '@core';
import { Check, ChevronDown, ChevronUp, GraduationCap } from 'lucide-react';
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { rotuloDaEtapa } from '../../core/learning/trilha';
import { numero, t, tp } from '../../lib/i18n';
import { langLabelNaUI } from '../../lib/languages';
import type { AgeProfileType } from '../../lib/profile';
import type { VocabCard } from '../../types';
import { entrarOQueAbriu, fotoDaTela } from './play/quest/jogosNoQuest';

/**
 * A TRILHA — trazer vocabulário curado para o baralho, por nível.
 *
 * O VAZIO QUE ELA PREENCHE. Tudo neste app nasce do que a pessoa grava, e isso é a maior
 * qualidade dele — mas quem acabou de instalar não tem baralho, e sem baralho não há jogo. Além
 * disso, um vocabulário feito só de captura é enviesado pelo que se assistiu: sobra jargão do
 * vídeo e faltam palavras básicas que nunca apareceram nele.
 *
 * O QUE ACONTECE AO TRAZER. As palavras entram como cartões NORMAIS, com `session_id` do baralho
 * da trilha. Ou seja: ganham agendamento, XP, e todos os seis jogos de graça — e continuam
 * separáveis do que foi capturado, que é o que o seletor de fonte usa.
 *
 * A TRADUÇÃO É O PONTO DELICADO. A lista curada traz palavra e nível, não tradução — e a pista
 * dos jogos É a tradução. Ela vem do MESMO motor que traduz as capturas. Se o motor não estiver
 * disponível, a tela DIZ isso e não traz nada: um cartão sem tradução entra no baralho como lixo,
 * e acabamos de passar um ciclo inteiro tirando lixo de lá.
 */

interface PainelTrilhaProps {
  dado: DadoTrilha;
  deck: VocabCard[];
  ageProfile: AgeProfileType;
  nivel: CefrLevel | undefined;
  onEscolherNivel: (n: CefrLevel) => void;
  /** Idioma nativo de quem joga — decide se existe tradução para esta trilha. */
  nativo: string;
  /** Idiomas nativos para os quais esta trilha tem tradução (vem do índice). */
  paresDeGlosa: string[];
}

export default function PainelTrilha({
  dado,
  deck,
  ageProfile,
  nivel,
  onEscolherNivel,
  nativo,
  paresDeGlosa,
}: PainelTrilhaProps) {
  /**
   * QUANTAS DESTE NÍVEL JÁ ESTÃO NA SUA REVISÃO.
   *
   * Conta só o que veio da trilha e está gravado no banco — ou seja, as palavras que você ERROU e
   * que por isso viraram cartão de revisão espaçada. Antes este número era medido sobre o baralho
   * INTEIRO e dizia "206 de 923 do A1 (22%)" enquanto a rodada entregava 28 cartas: a tela e o
   * jogo falavam de coisas diferentes.
   */
  const jogaveisDaTrilha = useMemo(
    () =>
      new Set(
        /* `daTrilha` — o filtro por `sourceSessionId` nunca casava e este painel anunciava 0% para
         sempre, mesmo para quem já tinha errado dezenas de palavras da trilha. */
        deck.filter((c) => c.daTrilha).map((c) => chaveDaPalavra(c.word)),
      ),
    [deck],
  );

  const progresso = useMemo(() => progressoDaTrilha(dado, jogaveisDaTrilha), [dado, jogaveisDaTrilha]);
  const sugerido = useMemo(() => nivelSugerido(progresso), [progresso]);
  const nivelAtivo = nivel ?? sugerido;

  const doNivel = progresso.find((p) => p.nivel === nivelAtivo);
  const porFrequencia = dado.escala === 'frequencia';
  const rotulo = (n: CefrLevel) => rotuloDaEtapa(n, dado.escala);

  /* A cobertura de tradução é medida no dado, não prometida: numa trilha por frequência ela é
     parcial, e o rodapé precisa dizer o número real. */
  const temTraducao = paresDeGlosa.includes((nativo || '').toLowerCase().split('-')[0]);

  const pctComTraducao = useMemo(() => {
    const pares = Object.values(dado.niveis).flat();
    const com = pares.filter((p) => !!p?.[1]).length;
    return pares.length ? Math.round((com / pares.length) * 100) : 0;
  }, [dado]);

  /* As etapas do nível ativo. Derivadas do MESMO dado embutido — nenhuma ida à rede, e o mesmo
     conjunto `jogaveisDaTrilha` que já responde "o que deste nível está no meu caderno". */
  const etapas = useMemo(
    () => (nivelAtivo ? progressoDasEtapas(etapasDoNivel(dado, nivelAtivo), jogaveisDaTrilha) : []),
    [dado, nivelAtivo, jogaveisDaTrilha],
  );
  const posicao = useMemo(() => posicaoNaTrilha(etapas), [etapas]);
  const etapa = useMemo(() => etapaAtual(etapas) ?? etapas[etapas.length - 1]?.etapa ?? null, [etapas]);

  /* META QUEST (segunda rodada, 01/10/2026): no lobby do headset a trilha é UMA linha (o nível, a
     etapa e quantas palavras), que abre no lugar o painel inteiro: os níveis como alvos grandes com a
     barra de cada um, o caminho dentro do nível e a procedência. Os números são os calculados acima. */
  const [aberto, setAberto] = useState(false);
  /* A trilha abre na própria tela: só o que é novo entra animado (`telas2.js:527-543, 614`). */
  const antesDeAbrir = useRef<Set<string> | null>(null);
  useLayoutEffect(() => {
    if (aberto) entrarOQueAbriu(antesDeAbrir.current);
    antesDeAbrir.current = null;
  }, [aberto]);
  const [etapasAbertas, setEtapasAbertas] = useState(false);
  const doRecorte = (n: CefrLevel) => (porFrequencia ? t('da faixa {n}', { n: rotulo(n) }) : t('do {n}', { n }));
  return (
    <section className="qj-trilha" data-testid="trilha-do-quest">
      <button
        type="button"
        className="q-linha"
        aria-expanded={aberto}
        onClick={() => {
          antesDeAbrir.current = aberto ? null : fotoDaTela();
          setAberto((v) => !v);
        }}
      >
        <span className="q-ic" aria-hidden>
          <GraduationCap />
        </span>
        <span>
          <b>
            {ageProfile === 'kids' ? t('Palavras para aprender') : t('Trilha de vocabulário')}
            {nivelAtivo ? ` · ${rotulo(nivelAtivo)}` : ''}
          </b>
          <small>
            {[
              doNivel && nivelAtivo
                ? t('{n} palavras {recorte} prontas para jogar', {
                    n: numero(doNivel.total),
                    recorte: doRecorte(nivelAtivo),
                  })
                : null,
              posicao ? t('Etapa {atual} de {total}', { atual: posicao.atual, total: posicao.total }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </small>
        </span>
        <span className="q-fim" aria-hidden>
          {aberto ? <ChevronUp /> : <ChevronDown />}
        </span>
      </button>

      {aberto && (
        <div className="q-cartao">
          <p className="qj-nota">
            {porFrequencia
              ? t('Palavras ordenadas por frequência de uso, das mais comuns às mais raras.')
              : ageProfile === 'senior'
                ? t('Palavras escolhidas por nível, para você não depender só do que gravou.')
                : t('Vocabulário curado por nível, o que falta no que você captura.')}
          </p>

          <div className="q-grade qj-niveis" role="radiogroup" aria-label={t('Nível da trilha')}>
            {progresso.map((p) => {
              const ativo = p.nivel === nivelAtivo;
              const completo = p.pct >= 80;
              return (
                <button
                  key={p.nivel}
                  type="button"
                  className="q-tile qj-nivel"
                  role="radio"
                  aria-checked={ativo}
                  onClick={() => onEscolherNivel(p.nivel)}
                >
                  <span className="qj-nivel-topo">
                    <b>{rotulo(p.nivel)}</b>
                    {completo ? (
                      <span className="q-tag">
                        <Check aria-hidden /> {t('feito')}
                      </span>
                    ) : p.nivel === sugerido && !ativo ? (
                      <span className="q-tag">{t('Aqui')}</span>
                    ) : (
                      <span className="q-tag off">{p.pct}%</span>
                    )}
                  </span>
                  <span className="q-barra" aria-hidden>
                    <span style={{ width: `${p.pct}%` }} />
                  </span>
                  <span className="q-d">
                    {t('{ja} de {total} palavras', { ja: numero(p.jaTem), total: numero(p.total) })}
                  </span>
                </button>
              );
            })}
          </div>

          {doNivel && nivelAtivo && (
            <p className="q-texto">
              {t('{n} palavras {recorte} prontas para jogar', {
                n: numero(doNivel.total),
                recorte: doRecorte(nivelAtivo),
              })}
              {doNivel.jaTem > 0 && ` · ${t('{n} já na sua revisão', { n: numero(doNivel.jaTem) })}`}
            </p>
          )}

          {posicao && etapa && (
            <div className="qj-etapas">
              <p className="q-rotulo">
                {t('Etapa {atual} de {total}', { atual: posicao.atual, total: posicao.total })}
                <span> · {etapa.subtitulo}</span>
              </p>
              <ol
                aria-label={t('Progresso {recorte}: etapa {atual} de {total}', {
                  recorte: nivelAtivo ? doRecorte(nivelAtivo) : '',
                  atual: posicao.atual,
                  total: posicao.total,
                })}
              >
                {etapas.map((p) => (
                  <li
                    key={p.etapa.id}
                    data-estado={p.estado}
                    aria-current={p.estado === 'atual' ? 'step' : undefined}
                  />
                ))}
              </ol>
              {/* O nome de cada etapa e quanto dela já está no caderno: no computador é a dica de cada
                    traço ao parar o ponteiro; aqui é uma lista que abre no lugar. */}
              <div className="q-acoes">
                <button
                  type="button"
                  className="q-chip"
                  aria-expanded={etapasAbertas}
                  onClick={() => setEtapasAbertas((v) => !v)}
                >
                  {etapasAbertas ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
                  {etapasAbertas ? t('Esconder as etapas') : tp(etapas.length, 'Ver a etapa', 'Ver as {n} etapas')}
                </button>
              </div>
              {etapasAbertas && (
                <div className="q-tabela-caixa" tabIndex={0} role="region" aria-label={t('Etapas do nível')}>
                  <table className="q-tabela">
                    <thead>
                      <tr>
                        <th>{t('Etapa')}</th>
                        <th>{t('No seu caderno')}</th>
                        <th>{t('Estado')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {etapas.map((p) => (
                        <tr key={p.etapa.id} data-etapa={p.estado}>
                          <td className="qj-item">
                            <b>{p.etapa.nome}</b>
                            {p.etapa.subtitulo && <small>{p.etapa.subtitulo}</small>}
                          </td>
                          <td>{t('{ja} de {total}', { ja: numero(p.jaTem), total: numero(p.total) })}</td>
                          <td>
                            <span
                              className="q-tag"
                              data-tom={p.estado === 'feita' ? 'bom' : p.estado === 'atual' ? 'acento' : 'neu'}
                            >
                              {p.estado === 'feita' ? t('feita') : p.estado === 'atual' ? t('atual') : t('a fazer')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!temTraducao && (
            <div className="q-aviso qj-alerta">
              <span>
                {t('Esta trilha ainda não tem tradução para {idioma}', { idioma: langLabelNaUI(nativo) })}
                {paresDeGlosa.length > 0 &&
                  ` (${t('só para {idiomas}', { idiomas: paresDeGlosa.map(langLabelNaUI).join(', ') })})`}
                .{' '}
                {t(
                  'Você pode praticar a escrita das palavras, mas os jogos de par ficam de fora e nada entra na sua revisão.',
                )}
              </span>
            </div>
          )}

          <p className="qj-nota">
            {porFrequencia
              ? t(
                  'As faixas vêm da frequência das palavras num corpus público, não de níveis do CEFR: a faixa 1 traz as mais comuns. As traduções vêm de dicionários abertos e cobrem {pct}% desta trilha. Sem tradução, a palavra aparece nos jogos de escrita, mas não nos de par.',
                  { pct: pctComTraducao },
                )
              : t(
                  'Nível e tradução vêm de listas públicas curadas, embutidas no app, nada é traduzido na hora. Palavra sem tradução conferida ficou de fora, então os níveis avançados têm menos.',
                )}
          </p>
        </div>
      )}
    </section>
  );
}
