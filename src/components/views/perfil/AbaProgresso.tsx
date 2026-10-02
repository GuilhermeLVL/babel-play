import {
  escalaDe,
  type Fluencia,
  fluenciaDoBaralho,
  MIN_CARTOES_POR_FAIXA,
  RETENCAO_DE_DOMINIO,
  rotuloDeFluencia,
} from '@core';
import { ChartColumn, GraduationCap, Loader2, Table2, TrendingUp, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { fetchDeck } from '../../../data/api';
import { fetchHistoricoDeXp, type HistoricoDeXp } from '../../../data/me';
import { precarregarNiveis } from '../../../data/trilha/carregar';
import { useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import { palavraDeNivel } from '../../../lib/galeria/textos';
import { data, numero, t } from '../../../lib/i18n';
import { baseLang, langLabelNaUI } from '../../../lib/languages';
import type { AgeProfileType } from '../../../lib/profile';
import type { DerivedProgress } from '../../../lib/progress';
import { T } from '../../../lib/T';
import type { VocabCard } from '../../../types';
import { Confianca, rotuloDaBase } from '../../Honestidade';
import { Barra, TituloDeSecao } from '../../ui';
import ConquistasRecentes from './ConquistasRecentes';

/**
 * O PROGRESSO — nível, a curva no tempo, e a fluência estimada.
 *
 * O QUE FALTAVA. O nível aparecia num único lugar (a faixa do Início) e sempre no presente: dava
 * para saber que se está no nível 34 e nunca que se SAIU do 33. Progresso sem trajetória não parece
 * progresso. E o "nível de fluência" simplesmente não existia — o app tinha a moda do CEFR das
 * palavras coletadas (que fala do acervo, não da pessoa) e uma meta declarada em Ajustes.
 *
 * TODOS OS NÚMEROS DESTA TELA SÃO DERIVADOS DE FATOS, e cada um diz sobre o que foi medido. A curva
 * é reconstruída dos carimbos de tempo que o banco já guarda; a fluência sai da retenção FSRS das
 * palavras cujo nível está na lista curada — e declara quantas ficaram de fora.
 */

interface AbaProgressoProps {
  progress: DerivedProgress;
  ageProfile: AgeProfileType;
}

export default function AbaProgresso({ progress }: AbaProgressoProps) {
  const [historico, setHistorico] = useState<HistoricoDeXp | null>(null);
  const [baralho, setBaralho] = useState<VocabCard[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const questNovo = useQuestNovo();
  /* Só no headset: a curva como tabela (o número de cada dia mora na dica do gráfico, que pede hover). */
  const [comoTabela, setComoTabela] = useState(false);

  useEffect(() => {
    let vivo = true;
    void Promise.all([fetchHistoricoDeXp('dia'), fetchDeck()])
      .then(([h, d]) => {
        if (vivo) {
          setHistorico(h);
          setBaralho(d);
        }
      })
      .catch(() => {
        /* cada seção trata a própria ausência */
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * AS LISTAS DE NIVEL DOS IDIOMAS DO BARALHO, carregadas antes de medir.
   *
   * `nivelCefr` so responde por idioma cuja lista foi registrada, e quem registra e
   * `precarregarNiveis`. Esta tela nunca chamava: o baralho de quem estuda japones era medido com
   * a unica lista carregada por padrao (a inglesa), TODA palavra caia em "sem nivel", e a tela
   * dizia "ficaram de fora porque nao estao na lista de niveis conferidos" — verdadeiro por um
   * motivo que a pessoa nao tinha como adivinhar (auditoria de 2026-09-07, achado A39).
   */
  const [niveisProntos, setNiveisProntos] = useState(0);
  const idiomasDoBaralho = useMemo(
    () => [...new Set((baralho ?? []).map((c) => baseLang(c.srcLang ?? '')).filter(Boolean))],
    [baralho],
  );
  useEffect(() => {
    if (!idiomasDoBaralho.length) return;
    let vivo = true;
    void Promise.all(idiomasDoBaralho.map(precarregarNiveis))
      .then(() => {
        if (vivo) setNiveisProntos((n) => n + 1);
      })
      .catch(() => {
        /* sem lista, `nivelCefr` responde ausente — que e a resposta honesta */
      });
    return () => {
      vivo = false;
    };
  }, [idiomasDoBaralho]);

  const fluencia: Fluencia | null = useMemo(
    () => (baralho ? fluenciaDoBaralho(baralho) : null),
    // `niveisProntos` entra de proposito: a fluencia precisa ser recalculada depois que as listas
    // chegam, senao a tela guarda para sempre a medicao feita sem elas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baralho, niveisProntos],
  );

  /** Idiomas do baralho para os quais NAO existe lista de niveis — a tela nomeia quais. */
  const idiomasSemRegua = useMemo(
    () => idiomasDoBaralho.filter((l) => escalaDe(l) === null),
    // Depende das listas carregadas pelo mesmo motivo acima.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idiomasDoBaralho, niveisProntos],
  );

  const serie = useMemo(
    () =>
      (historico?.pontos ?? []).map((p) => ({
        ...p,
        rotulo: data(new Date(p.em), { day: '2-digit', month: 'short' }),
      })),
    [historico],
  );

  /**
   * A CURVA, uma só para as duas telas: muda apenas a letra (a dos eixos e a da dica). No headset o
   * eixo vertical ganha largura para o número maior caber.
   */
  const curva = (letraDoEixo: number, letraDaDica: number) => (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: letraDoEixo > 11 ? 0 : -16 }}>
        <defs>
          <linearGradient id="curvaXp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="rotulo"
          tick={{ fontSize: letraDoEixo, fill: 'var(--ink-muted)' }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: letraDoEixo, fill: 'var(--ink-muted)' }}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 12,
            fontSize: letraDaDica,
          }}
          labelStyle={{ color: 'var(--ink)' }}
          // Sem anotar `v`: o recharts passa `ValueType`, mais largo que `number`,
          // e a interpolação no template continua a mesma.
          formatter={(v, nome) => [
            nome === 'xpAcumulado' ? `${v} XP` : `+${v} XP`,
            nome === 'xpAcumulado' ? 'total' : 'no dia',
          ]}
        />
        <Area type="monotone" dataKey="xpAcumulado" stroke="var(--accent)" strokeWidth={2} fill="url(#curvaXp)" />
        {/* Cada subida de nível vira um ponto — é literalmente o "saí do 1 para o 2". */}
        {(historico?.marcos ?? []).map((m) => {
          const ponto = serie.find((p) => p.em === m.em);
          return ponto ? (
            <ReferenceDot
              key={`${m.em}-${m.nivel}`}
              x={ponto.rotulo}
              y={ponto.xpAcumulado}
              r={letraDoEixo > 11 ? 6 : 4}
              fill="var(--good)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          ) : null;
        })}
      </AreaChart>
    </ResponsiveContainer>
  );

  /* O que você acumulou. Sem métrica, "—": a régua nunca inventa um número. */
  const ladrilhos = [
    [palavraDeNivel(), progress.available ? numero(progress.level) : null, ''],
    ['XP', progress.available && historico ? numero(historico.xpTotal) : null, 'acc'],
    ['Seeds', progress.available ? numero(progress.seeds) : null, 'good'],
    ['Ofensiva', progress.available ? numero(progress.streakDays) : null, 'warn'],
  ] as const;

  /* QUEST: os mesmos quatro números, as conquistas, a curva e a fluência, com a letra do headset. O
     gráfico é o mesmo (só a letra dos eixos cresce); as faixas de fluência ganham a contagem escrita
     em todas as larguras (na tela de sempre ela some no celular). */
  if (questNovo)
    return (
      <>
        <div className="q-grade g4" data-testid="numeros-do-perfil">
          {ladrilhos.map(([rotulo, valor]) => (
            <div key={rotulo} className="q-num">
              <b>{valor ?? '—'}</b>
              <span>{rotulo === 'Ofensiva' ? t('Ofensiva') : rotulo}</span>
            </div>
          ))}
        </div>

        <ConquistasRecentes />

        <section className="q-secao">
          <header>
            <div>
              <h2>{t('Como você chegou até aqui')}</h2>
              <p>{t('O XP somado dia a dia, com as subidas de nível marcadas.')}</p>
            </div>
            {!carregando && serie.length >= 2 && (
              <button
                type="button"
                className="q-ctl"
                aria-pressed={comoTabela}
                onClick={() => setComoTabela((v) => !v)}
              >
                {comoTabela ? <ChartColumn aria-hidden /> : <Table2 aria-hidden />}
                {comoTabela ? t('Ver gráfico') : t('Ver como tabela')}
              </button>
            )}
          </header>
          {carregando ? (
            <div className="qc-espera" role="status">
              <Loader2 aria-hidden /> {t('Reconstruindo a sua curva…')}
            </div>
          ) : serie.length < 2 ? (
            <div className="q-cartao fundo">
              <p className="q-texto">
                {t(
                  'Ainda não há dias suficientes para desenhar uma curva. Grave ou revise em dois dias diferentes e ela aparece aqui.',
                )}
              </p>
            </div>
          ) : (
            <div className="q-cartao">
              {comoTabela ? (
                <div className="q-tabela-caixa qc-no-cartao" tabIndex={0}>
                  <table className="q-tabela" aria-label={t('XP por dia')}>
                    <thead>
                      <tr>
                        <th scope="col">{t('Dia')}</th>
                        <th scope="col">{t('XP do dia')}</th>
                        <th scope="col">{t('Total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...serie].reverse().map((p) => (
                        <tr key={p.em}>
                          <td>{data(new Date(p.em), { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                          <td>+{numero(p.xpNoPeriodo)} XP</td>
                          <td>{numero(p.xpAcumulado)} XP</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="qc-grafico">{curva(14, 16)}</div>
              )}
              {(historico?.marcos.length ?? 0) > 0 && (
                <ul className="qc-marcos" aria-label={t('Subidas de nível')}>
                  {historico!.marcos.slice(-6).map((m) => (
                    <li key={`${m.em}-${m.nivel}`} className="q-tag qc-livre">
                      <Trophy aria-hidden />
                      {palavraDeNivel().toLowerCase()} {m.nivel} ·{' '}
                      {data(new Date(m.em), { day: '2-digit', month: 'short', year: '2-digit' })}
                    </li>
                  ))}
                </ul>
              )}
              <p className="qc-nota">
                {t(
                  'Reconstruído a partir das suas gravações, revisões e rodadas, não há um registro separado de XP. Se a fórmula de pontos mudar, este gráfico muda junto.',
                )}
              </p>
            </div>
          )}
        </section>

        <section className="q-secao">
          <header>
            <div>
              <h2>{t('Onde você está no idioma')}</h2>
              <p>
                <T txt="Medido pelo que você <b>sustenta</b>, a chance de lembrar agora, e não quantas palavras você tem guardadas." />
              </p>
            </div>
          </header>
          {carregando || !fluencia ? (
            <div className="qc-espera" role="status">
              <Loader2 aria-hidden /> {t('Medindo…')}
            </div>
          ) : (
            <div className="q-cartao" data-testid="fluencia-do-perfil">
              <div className="qc-fluencia-topo">
                <b>{rotuloDeFluencia(fluencia)}</b>
                <Confianca valor={fluencia.confianca} estimativa />
              </div>
              <p className="q-texto">{fluencia.motivo}</p>

              {fluencia.faixas.length === 0 ? (
                <p className="qc-nota">{t('Nenhuma das suas palavras está na lista de níveis conferidos ainda.')}</p>
              ) : (
                <ul className="qc-faixas">
                  {fluencia.faixas.map((f) => (
                    <li key={f.nivel} className={f.sustentada ? 'qc-sustenta' : undefined}>
                      <b>{f.nivel}</b>
                      <span
                        className={`q-barra ${f.sustentada ? 'qc-tom-bom' : 'qc-tom-atencao'}`}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round((f.retencao ?? 0) * 100)}
                        aria-label={t('Retenção do {nivel}', { nivel: f.nivel })}
                      >
                        <span style={{ width: `${Math.max(0, Math.min(100, (f.retencao ?? 0) * 100))}%` }} />
                      </span>
                      <span className="qc-pct">{f.retencao === null ? '-' : `${Math.round(f.retencao * 100)}%`}</span>
                      <span className="qc-base">
                        {f.retencao === null
                          ? t('{n} de {min} revisadas', { n: f.medidos, min: MIN_CARTOES_POR_FAIXA })
                          : t('{n} de {total} medidas', { n: f.medidos, total: f.naFaixa })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="qc-rodape">
                <p className="qc-nota">
                  {rotuloDaBase(fluencia.base)} ·{' '}
                  {t('corte de domínio: {pct}%.', { pct: Math.round(RETENCAO_DE_DOMINIO * 100) })}
                </p>
                {fluencia.semNivel > 0 && (
                  <p className="qc-nota">
                    {t(
                      '{n} palavras ficaram de fora porque não estão na lista de níveis conferidos, elas não foram chutadas para faixa nenhuma.',
                      { n: numero(fluencia.semNivel) },
                    )}
                  </p>
                )}
                {idiomasSemRegua.length > 0 && (
                  <p className="qc-nota">
                    {t(
                      'Não há lista de níveis para {idiomas}, então as palavras desse acervo não entram na estimativa de fluência.',
                      { idiomas: idiomasSemRegua.map(langLabelNaUI).join(', ') },
                    )}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      </>
    );

  return (
    <>
      {/* ── O QUE VOCÊ ACUMULOU ── os ladrilhos do protótipo (`.ladrilhos` > `.cartao.ladrilho`).
          Sem métrica, "—": a régua nunca inventa um número. */}
      <div className="ladrilhos">
        {ladrilhos.map(([rotulo, valor, tom]) => (
          <div key={rotulo} className="cartao ladrilho">
            <span className="label-mono">{rotulo}</span>
            <span className={`v ${tom}`}>{valor ?? '—'}</span>
          </div>
        ))}
      </div>

      {/* ── CONQUISTAS RECENTES ── a seção do protótipo, logo abaixo dos ladrilhos. */}
      <ConquistasRecentes />

      {/* ── A CURVA ──────────────────────────────────────────────────────────────────────────
          Reconstruída dos carimbos de tempo que já existem (sessões, revisões, itens de jogo),
          não há tabela de XP e não precisa haver. A ressalva embaixo é obrigatória: mudar os pesos
          reescreveria este gráfico, e fingir um livro-razão que não existe seria pior que a
          limitação. */}
      <section className="secao">
        <TituloDeSecao
          icone={TrendingUp}
          titulo="Como você chegou até aqui"
          desc="O XP somado dia a dia, com as subidas de nível marcadas."
        />

        <div className="cartao p5">
          {carregando ? (
            <div className="h-56 flex items-center justify-center gap-2 text-ink-muted text-[13px]">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Reconstruindo a sua curva…
            </div>
          ) : serie.length < 2 ? (
            /* Um ponto não é uma curva. Dizer isso é melhor que desenhar uma linha reta que
               parece estagnação. */
            <p className="text-[13px] text-ink-muted py-10 text-center">
              Ainda não há dias suficientes para desenhar uma curva. Grave ou revise em dois dias diferentes e ela
              aparece aqui.
            </p>
          ) : (
            <>
              <div className="h-56">{curva(11, 12)}</div>

              {(historico?.marcos.length ?? 0) > 0 && (
                <ul className="chips" style={{ marginTop: 16, listStyle: 'none', padding: 0 }}>
                  {historico!.marcos.slice(-6).map((m) => (
                    <li key={`${m.em}-${m.nivel}`} className="pill">
                      <Trophy aria-hidden style={{ width: 13, height: 13, color: 'var(--good)' }} />
                      {palavraDeNivel().toLowerCase()} {m.nivel} ·{' '}
                      {data(new Date(m.em), { day: '2-digit', month: 'short', year: '2-digit' })}
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-[11px] text-ink-faint mt-4 leading-snug max-w-[70ch]">
                Reconstruído a partir das suas gravações, revisões e rodadas, não há um registro separado de XP. Se a
                fórmula de pontos mudar, este gráfico muda junto.
              </p>
            </>
          )}
        </div>
      </section>

      {/* ── FLUÊNCIA ─────────────────────────────────────────────────────────────────────────
          A única saída deste app que é um JUÍZO sobre a pessoa. Por isso a regra vem escrita ao
          lado do rótulo, e a base de cálculo aparece sem ser pedida. */}
      <section className="secao">
        <TituloDeSecao
          icone={GraduationCap}
          titulo="Onde você está no idioma"
          desc={
            <>
              Medido pelo que você <b>sustenta</b>, a chance de lembrar agora, e não quantas palavras você tem
              guardadas.
            </>
          }
        />

        <div className="cartao p5">
          {carregando || !fluencia ? (
            <div className="h-32 flex items-center justify-center gap-2 text-ink-muted text-[13px]">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Medindo…
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
                <span className="font-display font-black text-2xl text-ink">{rotuloDeFluencia(fluencia)}</span>
                {/* O selo de confiança acende sozinho quando a base é pequena — e ela costuma ser. */}
                <Confianca valor={fluencia.confianca} estimativa />
              </div>
              {/* A REGRA, em uma frase. Sem ela o rótulo é indistinguível de um chute. */}
              <p className="text-[12.5px] text-ink-muted mb-4 max-w-[70ch]">{fluencia.motivo}</p>

              {fluencia.faixas.length === 0 ? (
                <p className="text-[13px] text-ink-muted">
                  Nenhuma das suas palavras está na lista de níveis conferidos ainda.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {fluencia.faixas.map((f) => (
                    <li key={f.nivel} className="flex items-center gap-3">
                      <span
                        className={`font-display font-black text-[13px] w-7 shrink-0 ${f.sustentada ? 'text-good-ink' : 'text-ink-muted'}`}
                      >
                        {f.nivel}
                      </span>
                      <Barra
                        pct={(f.retencao ?? 0) * 100}
                        tom={f.sustentada ? 'good' : 'warn'}
                        tamanho="fina"
                        rotuloAcessivel={`Retenção do ${f.nivel}`}
                        className="flex-1"
                      />
                      <span className="text-[12px] font-mono tabular-nums w-12 text-end text-ink">
                        {f.retencao === null ? '-' : `${Math.round(f.retencao * 100)}%`}
                      </span>
                      <span className="text-[11px] text-ink-faint w-32 text-end hidden sm:block">
                        {/* Sem evidência, diz o que falta — não deixa o traço sem explicação. */}
                        {f.retencao === null
                          ? `${f.medidos} de ${MIN_CARTOES_POR_FAIXA} revisadas`
                          : `${f.medidos} de ${f.naFaixa} medidas`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 pt-4 border-t border-border-subtle space-y-1">
                <p className="text-[11px] text-ink-faint">
                  {rotuloDaBase(fluencia.base)} · corte de domínio: {Math.round(RETENCAO_DE_DOMINIO * 100)}%.
                </p>
                {fluencia.semNivel > 0 && (
                  <p className="text-[11px] text-ink-faint">
                    {numero(fluencia.semNivel)} palavras ficaram de fora porque não estão na lista de níveis conferidos,
                    elas não foram chutadas para faixa nenhuma.
                  </p>
                )}
                {/* NOMEAR O IDIOMA sem régua, em vez de deixar a ausência parecer culpa do acervo. */}
                {idiomasSemRegua.length > 0 && (
                  <p className="text-[11px] text-ink-faint">
                    Não há lista de níveis para {idiomasSemRegua.map(langLabelNaUI).join(', ')}, então as palavras desse
                    acervo não entram na estimativa de fluência.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
