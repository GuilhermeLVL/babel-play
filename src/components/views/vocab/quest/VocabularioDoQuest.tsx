import type { computeTextStats, detectarVozPassiva } from '@core';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AudioLines,
  BarChart2,
  Brain,
  ChartColumn,
  Clock,
  Download,
  Gamepad2,
  MessageSquareWarning,
  Mic,
  MoreHorizontal,
  PartyPopper,
  PieChart as PieChartIcon,
  Plus,
  Target,
  Upload,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

import type { AppMetrics } from '../../../../data/api';
import { numero, t, tp } from '../../../../lib/i18n';
import { Confianca, ehBaixaConfianca, SemDado } from '../../../Honestidade';

/**
 * O VOCABULÁRIO NO META QUEST (segunda rodada do desenho do headset, 01/10/2026).
 *
 * Só apresentação: `Metrics.tsx` continua dono do baralho, das métricas, do catálogo, da gaveta da
 * palavra e dos diálogos; aqui chega tudo pronto e cada toque volta por uma função.
 *
 * O arranjo: o cabeçalho com as três ações do caderno ("+ Palavra", "Trazer do Anki", "Exportar"), as
 * quatro abas de sempre e UM painel por vez. Em "Minhas palavras", o convite da revisão é o único botão
 * principal da tela; as quatro fases viram números grandes; o catálogo vem logo abaixo.
 */

export type AbaDoVocabulario = 'palavras' | 'dashboard' | 'lexical' | 'fluency';

export interface AbaDoQuest {
  id: AbaDoVocabulario;
  rotulo: string;
  Icone: LucideIcon;
}

type EstatisticasDoTexto = ReturnType<typeof computeTextStats>;
type VozPassiva = ReturnType<typeof detectarVozPassiva>;

/** Formata milissegundos em m:ss. */
function minutosESegundos(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** O que o selo de confiança diz na dica do computador, ESCRITO: no headset não há dica ao apontar. */
function NotaDeConfianca({ valor }: { valor: number }) {
  return (
    <p className="qv-nota" data-testid="nota-de-confianca">
      {ehBaixaConfianca(valor)
        ? t('Confiança baixa: o número existe, mas o volume de dados por trás dele ainda é pequeno.')
        : t('Confiança suficiente para o número ser usado como referência.')}
    </p>
  );
}

/** Um número de resumo: o rótulo em cima, o valor grande embaixo, e uma nota quando há o que dizer. */
function Numero({ rotulo, valor, tom, nota }: { rotulo: string; valor: ReactNode; tom?: string; nota?: string }) {
  return (
    <div className="q-num">
      <span className="q-rotulo">{rotulo}</span>
      <b className={tom}>{valor}</b>
      {nota && <span>{nota}</span>}
    </div>
  );
}

export default function VocabularioDoQuest({
  titulo,
  sub,
  infantil,
  abas,
  aba,
  aoTrocarAba,
  aoMostrarMais,
  rotuloDeExportar,
  aoAdicionar,
  aoAnki,
  aoExportar,
  metrics,
  duracaoDaRevisao,
  proximaRodada,
  fases,
  deckCarregado,
  catalogo,
  aoRevisar,
  aoJogar,
  aoCapturar,
  revisoesPorDia,
  minutosHoje,
  totalDePalavras,
  niveis,
  totalDeNiveis,
  temNivelReal,
  coresDosNiveis,
  capturas,
  nomeDoIdioma,
  corpus,
  textStats,
  vozPassiva,
  embutida = false,
  children,
}: {
  titulo: ReactNode;
  /** A frase que explica a tela (a mesma do cabeçalho de sempre). */
  sub: string;
  /** Perfil infantil: "cartas" e "regar" no lugar de "palavras" e "revisar". */
  infantil: boolean;
  abas: AbaDoQuest[];
  aba: AbaDoVocabulario;
  aoTrocarAba: (aba: AbaDoVocabulario) => void;
  /** Nos perfis de quem só quer ver as palavras, as abas de análise ficam atrás de "Mais". */
  aoMostrarMais?: () => void;
  rotuloDeExportar: string;
  aoAdicionar: () => void;
  aoAnki: () => void;
  aoExportar: () => void;
  metrics: AppMetrics | null | undefined;
  /** "uns 4 min" ou "rodada curta": o tempo medido, nunca inventado. */
  duracaoDaRevisao: string;
  proximaRodada: string;
  fases: { total: number; novas: number; aprendendo: number; revisao: number };
  deckCarregado: boolean;
  /** O catálogo ("Todas as palavras"), já montado por quem tem o baralho. */
  catalogo: ReactNode;
  aoRevisar: () => void;
  aoJogar: () => void;
  aoCapturar: () => void;
  revisoesPorDia: Array<{ rotulo: string; n: number }>;
  minutosHoje: number;
  totalDePalavras: number;
  niveis: Array<{ level: string; count: number }>;
  totalDeNiveis: number;
  temNivelReal: boolean;
  coresDosNiveis: string[];
  capturas: number;
  nomeDoIdioma: string;
  corpus: { noAlvo: number; emOutrosIdiomas: number; totalFalas: number };
  textStats: EstatisticasDoTexto;
  vozPassiva: VozPassiva;
  /**
   * DENTRO DA TELA CARTÕES (aba "Palavras", 10/10/2026): sem o palco, o cabeçalho e o convite da
   * revisão, que são da tela de fora (o cabeçalho e a aba "Hoje" dela). Ficam as abas e o painel.
   */
  embutida?: boolean;
  /** Os diálogos da tela (adicionar, exportar, a palavra aberta). */
  children?: ReactNode;
}) {
  const maiorDia = Math.max(1, ...revisoesPorDia.map((d) => d.n));
  const acerto = metrics && (metrics.accuracyConfidence ?? 0) > 0 ? `${Math.round(metrics.accuracy * 100)}%` : '—';
  const ofensiva = metrics?.streakDays ?? 0;

  const minhasPalavras = (
    <>
      {/* O CONVITE DA REVISÃO: só com o que revisar. Sem vencidas, a tela diz que está tudo em dia.
          Dentro de Cartões ele não aparece: é a aba "Hoje" de lá. */}
      {embutida ? null : metrics && metrics.dueToday > 0 ? (
        <div className="q-cartao qv-convite" data-testid="convite-da-revisao">
          <span className="qv-contagem">{numero(metrics.dueToday)}</span>
          <div>
            <h2>{infantil ? t('Cartas prontas para regar') : t('Prontas para revisar')}</h2>
            <p>
              {duracaoDaRevisao}
              {' · '}
              {tp(metrics.newCards, '{n} nova', '{n} novas', { n: numero(metrics.newCards) })}
              {' · '}
              {t('{n} no total', { n: numero(metrics.deckSize) })}
            </p>
          </div>
          <button type="button" className="q-ctl pri" onClick={aoRevisar}>
            <Target aria-hidden /> {infantil ? t('Regar agora') : t('Revisar agora')}
          </button>
        </div>
      ) : metrics && metrics.deckSize > 0 ? (
        <div className="q-aviso" role="note" data-testid="tudo-revisado">
          <span className="qv-aviso-texto">
            <PartyPopper aria-hidden />
            <span>
              <b>{t('Tudo revisado por hoje.')}</b>{' '}
              {proximaRodada ? t('A próxima rodada abre {quando}.', { quando: proximaRodada }) : t('Nada vence agora.')}{' '}
              {t('Que tal um jogo com as mesmas palavras?')}
            </span>
          </span>
          <button type="button" className="q-ctl" onClick={aoJogar}>
            <Gamepad2 aria-hidden /> {t('Abrir Jogar')}
          </button>
        </div>
      ) : null}

      {/* AS QUATRO FASES. Sem zero enquanto o baralho chega: "0" seria um número falso. */}
      <div className="q-grade g4" data-testid="fases-do-baralho">
        {[
          { rotulo: t('Guardadas'), valor: fases.total, tom: undefined },
          { rotulo: t('Novas'), valor: fases.novas, tom: 'acento' },
          { rotulo: t('Aprendendo'), valor: fases.aprendendo, tom: 'aviso' },
          { rotulo: t('Em revisão'), valor: fases.revisao, tom: 'bom' },
        ].map((f) => (
          <Numero key={f.rotulo} rotulo={f.rotulo} valor={deckCarregado ? numero(f.valor) : '—'} tom={f.tom} />
        ))}
      </div>

      {catalogo}
    </>
  );

  const visaoGeral = (
    <>
      <div className="q-cartao">
        <div className="q-secao">
          <header>
            <div>
              <h2>{t('Palavras revisadas por dia')}</h2>
              <p>{t('Últimos 7 dias.')}</p>
            </div>
            <span className="q-ic" aria-hidden>
              <ChartColumn />
            </span>
          </header>
        </div>
        <div
          className="qv-barras"
          role="img"
          aria-label={t('Revisões por dia: {lista}', {
            lista: revisoesPorDia.map((d) => `${d.rotulo} ${d.n}`).join(', '),
          })}
        >
          {revisoesPorDia.map((d, i) => (
            <div key={`${d.rotulo}-${i}`} className="qv-col">
              <b>{d.n}</b>
              <span
                className={`qv-barra ${d.rotulo === 'hoje' ? 'hoje' : ''}`}
                style={{ height: Math.max(4, Math.round((d.n / maiorDia) * 140)) }}
              />
              <small>{d.rotulo}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="q-grade g3">
        <Numero rotulo={t('Acerto')} valor={acerto} />
        <Numero rotulo={t('Minutos hoje')} valor={numero(minutosHoje)} />
        <Numero
          rotulo={t('Ofensiva')}
          valor={tp(ofensiva, '{n} dia', '{n} dias', { n: numero(ofensiva) })}
          tom="aviso"
        />
      </div>
    </>
  );

  const lexical =
    totalDePalavras < 20 ? (
      <div className="q-vazio">
        <span className="q-ic">
          <Brain aria-hidden />
        </span>
        <h2>{t('A inteligência lexical abre com 20 palavras')}</h2>
        <p>
          {t(
            'Ela compara as palavras que você conhece com as mais usadas no idioma e mostra o que falta. Você tem {n}.',
            { n: numero(totalDePalavras) },
          )}
        </p>
        <button type="button" className="q-ctl pri" onClick={aoCapturar}>
          <Mic aria-hidden /> {t('Capturar mais')}
        </button>
      </div>
    ) : (
      <>
        <div className="q-grade g3">
          <Numero rotulo={t('Palavras distintas')} valor={numero(metrics?.uniqueWords ?? 0)} />
          <Numero rotulo={t('Cartões no baralho')} valor={numero(metrics?.deckSize ?? 0)} />
          <Numero rotulo={t('Palavras capturadas')} valor={numero(metrics?.wordsCaptured ?? 0)} />
        </div>
        <div className="q-cartao" data-testid="niveis-do-vocabulario">
          <div className="q-secao">
            <header>
              <div>
                <h2>
                  <PieChartIcon aria-hidden className="qv-no-titulo" /> {t('Distribuição por nível (CEFR)')}
                </h2>
                <p>{t('Estimativa aproximada de nível, não uma classificação exata.')}</p>
              </div>
              {niveis.length > 0 && <Confianca valor={metrics?.levelConfidence ?? 0} estimativa />}
            </header>
          </div>
          {/* Só "N/D" não é uma distribuição: sem nível de verdade, a tela explica em vez de desenhar. */}
          {niveis.length > 0 && <NotaDeConfianca valor={metrics?.levelConfidence ?? 0} />}
          {temNivelReal ? (
            <div className="qv-rosca">
              <div className="qv-rosca-desenho" aria-hidden>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={niveis.map((l) => ({ name: l.level, value: l.count }))}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={104}
                      paddingAngle={2}
                      isAnimationActive={false}
                    >
                      {niveis.map((_, i) => (
                        <Cell key={i} fill={coresDosNiveis[i % coresDosNiveis.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* No headset não há dica ao passar o ponteiro: a legenda diz o número de cada fatia. */}
              <ul className="qv-legenda">
                {niveis.map((l, i) => (
                  <li key={l.level}>
                    <i style={{ backgroundColor: coresDosNiveis[i % coresDosNiveis.length] }} aria-hidden />
                    <span>{l.level}</span>
                    <b>
                      {numero(l.count)}
                      {totalDeNiveis > 0 ? ` · ${Math.round((l.count / totalDeNiveis) * 100)}%` : ''}
                    </b>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <SemDado compacto motivo={t('Sem dados suficientes para estimar a distribuição de níveis.')} />
          )}
        </div>
      </>
    );

  const fluencia = !((metrics?.speakingMs ?? 0) > 0) ? (
    <div className="q-vazio">
      <span className="q-ic">
        <AudioLines aria-hidden />
      </span>
      <h2>{t('Desempenho e fluência precisam de fala sua')}</h2>
      <p>{t('Grave um shadowing ou um karaokê: a nota de pronúncia e o ritmo aparecem aqui.')}</p>
      <button type="button" className="q-ctl pri" onClick={aoJogar}>
        <Gamepad2 aria-hidden /> {t('Ir para Jogar')}
      </button>
    </div>
  ) : (
    <>
      <div className="q-grade g2">
        <div className="q-cartao" data-testid="ritmo-de-fala">
          <div className="q-secao">
            <header>
              <div>
                <h2>
                  <Activity aria-hidden className="qv-no-titulo" /> {t('Ritmo de fala (WPM)')}
                </h2>
              </div>
              {metrics && metrics.wpm > 0 && <Confianca valor={metrics.wpmConfidence} />}
            </header>
          </div>
          {metrics && metrics.wpm > 0 ? (
            <>
              <p className="qv-grande">
                <b>{Math.round(metrics.wpm)}</b> <span>{t('palavras por minuto')}</span>
              </p>
              {/* Zonas: lento (0 a 110), bom (110 a 150), acelerado (150 ou mais); a escala vai até 200. */}
              <div className="qv-zonas" aria-hidden>
                <span className="lento" />
                <span className="bom" />
                <span className="rapido" />
                <i style={{ left: `${Math.min(100, Math.max(0, (metrics.wpm / 200) * 100))}%` }} />
              </div>
              <div className="qv-zonas-rotulos">
                <span>{t('Lento')}</span>
                <span>{t('Nativo / fluido')}</span>
                <span>{t('Acelerado')}</span>
              </div>
              <NotaDeConfianca valor={metrics.wpmConfidence} />
            </>
          ) : (
            <SemDado
              compacto
              motivo={t('Sem dados suficientes. Grave algumas sessões de fala para calcular seu ritmo.')}
            />
          )}
        </div>
        <div className="q-cartao" data-testid="tempo-de-fala">
          <div className="q-secao">
            <header>
              <div>
                <h2>
                  <Clock aria-hidden className="qv-no-titulo" /> {t('Tempo total de fala')}
                </h2>
              </div>
            </header>
          </div>
          <p className="qv-grande">
            <b>{minutosESegundos(metrics?.speakingMs ?? 0)}</b>{' '}
            <span>
              {t('min : seg')} · {tp(capturas, '{n} captura', '{n} capturas')}
            </span>
          </p>
        </div>
      </div>

      <div className="q-cartao">
        <div className="q-secao">
          <header>
            <div>
              <h2>{t('Radar de competências acústicas')}</h2>
              <p>{t('Avaliação multidimensional da fala espontânea.')}</p>
            </div>
          </header>
        </div>
        <SemDado
          compacto
          motivo={t(
            'Avaliar fluência, gramática e pronúncia por dimensão exigiria um modelo de linguagem, que este painel não chama.',
          )}
        />
      </div>

      <div className="q-cartao" data-testid="complexidade">
        <div className="q-secao">
          <header>
            <div>
              <h2>
                <BarChart2 aria-hidden className="qv-no-titulo" /> {t('Complexidade gramatical')}
              </h2>
              <p>
                {t('Estatísticas do texto, sem IA, calculadas sobre as falas em {idioma}, o idioma que você estuda.', {
                  idioma: nomeDoIdioma,
                })}
                {corpus.totalFalas > 0 &&
                  ` ${t('{n} de {total} falas capturadas estão nele.', { n: corpus.noAlvo, total: corpus.totalFalas })}`}
                {corpus.totalFalas > 0 &&
                  corpus.emOutrosIdiomas > 0 &&
                  ` ${tp(corpus.emOutrosIdiomas, '{n} em outro idioma ficou fora.', '{n} em outros idiomas ficaram fora.')}`}
              </p>
            </div>
          </header>
        </div>
        {textStats.wordCount > 0 ? (
          <div className="q-grade g4">
            <Numero rotulo={t('Palavras por frase')} valor={textStats.avgSentenceLength} />
            <Numero
              rotulo={t('Facilidade de leitura (Flesch)')}
              valor={textStats.readingEase != null ? textStats.readingEase : '—'}
              nota={
                textStats.readingEase != null
                  ? undefined
                  : textStats.syllableCount == null
                    ? t('sem régua para {idioma}', { idioma: nomeDoIdioma })
                    : t('precisa de 10 palavras ou mais')
              }
            />
            <Numero
              rotulo={t('Densidade lexical')}
              valor={textStats.lexicalDensityPct != null ? `${textStats.lexicalDensityPct}%` : '—'}
              nota={
                textStats.lexicalDensityPct != null
                  ? undefined
                  : t('sem lista de palavras vazias para {idioma}', { idioma: nomeDoIdioma })
              }
            />
            <Numero rotulo={t('Riqueza lexical (TTR)')} valor={`${Math.round(textStats.typeTokenRatio * 100)}/100`} />
          </div>
        ) : (
          <SemDado
            compacto
            motivo={
              corpus.totalFalas === 0
                ? t('Nenhuma fala capturada ainda, grave ou importe uma sessão para medir complexidade.')
                : t('Nenhuma das falas capturadas está em {idioma}, que é o idioma que você estuda.', {
                    idioma: nomeDoIdioma,
                  })
            }
          />
        )}
      </div>

      <div className="q-cartao" data-testid="voz-passiva">
        <div className="q-secao">
          <header>
            <div>
              <h2>
                <MessageSquareWarning aria-hidden className="qv-no-titulo" /> {t('Uso de voz passiva')}
              </h2>
              <p>
                {t(
                  'Detecção pelo padrão "be + particípio", sem IA. É um indício, não um veredito: perde particípios irregulares fora da lista e pode confundir adjetivos em "-ed" com voz passiva.',
                )}
              </p>
            </div>
          </header>
        </div>
        {vozPassiva == null ? (
          /* Ausência declarada: o padrão é do inglês, e zero ocorrências seria uma afirmação falsa. */
          <SemDado
            compacto
            motivo={t(
              'Não há régua de voz passiva para {idioma}. O padrão "be + particípio" é do inglês, e aplicá-lo a outro idioma devolveria zero como se fosse medida.',
              { idioma: nomeDoIdioma },
            )}
          />
        ) : textStats.wordCount > 0 ? (
          <>
            <p className="qv-grande">
              <b>{vozPassiva.ocorrencias}</b>{' '}
              <span>
                {tp(vozPassiva.ocorrencias, 'ocorrência', 'ocorrências')} ·{' '}
                {t('{n} a cada 100 palavras', { n: vozPassiva.por100Palavras })}
              </span>
            </p>
            {vozPassiva.exemplos.length > 0 && (
              <div className="qv-exemplos">
                {vozPassiva.exemplos.map((ex, i) => (
                  <span key={i} className="q-tag off">
                    {ex}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="q-texto">{t('Sem texto suficiente em {idioma} para detectar.', { idioma: nomeDoIdioma })}</p>
        )}
      </div>

      <div className="q-cartao">
        <div className="q-secao">
          <header>
            <div>
              <h2>{t('Tom da fala')}</h2>
            </div>
          </header>
        </div>
        <SemDado
          compacto
          motivo={t(
            'Classificar tom (confiante, analítico, hesitante) exige análise acústica e prosódica do áudio. O app transcreve, mas não mede altura nem entonação. Nada foi estimado.',
          )}
        />
      </div>
    </>
  );

  const paineis: Record<AbaDoVocabulario, ReactNode> = {
    palavras: minhasPalavras,
    dashboard: visaoGeral,
    lexical,
    fluency: fluencia,
  };

  const abasEPainel = (
    <>
      <div className="q-abas qv-abas">
        <div role="tablist" aria-label={t('Seções do vocabulário')} className="qv-tablist">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              id={`aba-${a.id}`}
              aria-selected={a.id === aba}
              aria-controls={`painel-${a.id}`}
              className="q-aba"
              onClick={() => aoTrocarAba(a.id)}
            >
              <a.Icone aria-hidden /> {a.rotulo}
            </button>
          ))}
        </div>
        {/* "Mais" não é uma aba: não tem painel, só revela as outras. */}
        {aoMostrarMais && (
          <button type="button" className="q-aba" onClick={aoMostrarMais}>
            <MoreHorizontal aria-hidden /> {t('Mais')}
          </button>
        )}
      </div>

      <div className="qv-painel" role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`} data-painel={aba}>
        {paineis[aba]}
      </div>

      {children}
    </>
  );

  if (embutida)
    return (
      <div className="ct-palavras" data-testid="vocabulario-no-quest">
        {abasEPainel}
      </div>
    );

  return (
    <div className="q-palco qv" data-testid="vocabulario-no-quest">
      <header className="q-cab">
        <div>
          <p className="q-sobre">{t('Seu caderno')}</p>
          <h1>{titulo}</h1>
        </div>
        <button type="button" className="q-ctl" onClick={aoAdicionar}>
          <Plus aria-hidden /> {t('Palavra')}
        </button>
        <button type="button" className="q-ctl" onClick={aoAnki}>
          <Upload aria-hidden /> {t('Trazer do Anki')}
        </button>
        <button type="button" className="q-ctl" onClick={aoExportar}>
          <Download aria-hidden /> {rotuloDeExportar}
        </button>
      </header>

      <p className="q-texto qv-sub">{sub}</p>

      {abasEPainel}
    </div>
  );
}
