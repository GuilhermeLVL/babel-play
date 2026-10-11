import '../../../styles/questEstatisticas.css';
import '../../../styles/questInstitucional.css';

import { Brain, CalendarCheck, Flame, Target, TriangleAlert } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';

import { ERROS_DE_DIFICIL, type ResumoDosCartoes } from '../../../core/learning/resumoDosCartoes';
import { diasAPartirDeAmanha, porcentoDeLembradas } from '../../../lib/cartoes/estadoDeHoje';
import { numero, t, tp } from '../../../lib/i18n';
import { anima, MOLA, MOLA_SUAVE, polido, reduz } from '../../../lib/polimento/base';
import { celular } from '../../../lib/polimento/celular';
import { Semana } from './Hoje';
import { CabecaDoCartao, diaCurto, diaEMes, Dica } from './pecas';

/**
 * A MEMÓRIA, TELA DE DENTRO COM VOLTAR — porte de `ctMemoria`, `ctGraficoDeRetencao`, `ctCalendario` e
 * `ctPrevisao7` (`cartoes.js:254-261, 528-622` do protótipo enxuto). Abre pela faixa de estado de "Hoje" e
 * pelo "…" do cabeçalho. São as estatísticas só dos cartões, que estavam espalhadas entre Estatísticas
 * (previsão de 7 dias) e o Vocabulário (revisões por dia), mais o que `review_logs` já guardava e
 * nenhuma tela mostrava (retenção medida, botões usados). Tudo de `GET /api/vocab/resumo`.
 *
 * A SEMANA DA SEQUÊNCIA são os últimos sete dias do calendário de revisões; o número de dias seguidos é
 * a ofensiva do perfil. FORA (o app não mede nem faz): o tempo por dia e por cartão e os congelamentos.
 */

const DIA = 86_400_000;

/** "Os próximos 7 dias": sete barras a partir de amanhã (`ctPrevisao7`, `cartoes.js:254-261`). */
function Previsao7({ resumo }: { resumo: ResumoDosCartoes }) {
  const valores = resumo.previsao.slice(1, 8);
  const dias = diasAPartirDeAmanha(resumo.inicioDoDia, valores.length).map(diaCurto);
  const maior = Math.max(1, ...valores);
  return (
    <section className="q-cartao ct-prev7" data-testid="previsao-dos-proximos-dias">
      <CabecaDoCartao
        titulo={t('Os próximos 7 dias')}
        sub={t('Quantos cartões voltam em cada dia; a barra destacada é amanhã.')}
        extra={<Dica texto={t('Dia sem estudo não vira dívida: o limite de revisões por dia segura a carga.')} />}
      />
      <div
        className="qv-barras"
        role="img"
        aria-label={t('Previsão: {lista}', { lista: valores.map((v, i) => `${dias[i]} ${v}`).join(', ') })}
      >
        {valores.map((v, i) => (
          <div key={i} className="qv-col">
            <b>{v}</b>
            <span
              className={`qv-barra ${i === 0 ? 'hoje' : ''}`}
              style={{ height: Math.max(4, Math.round((v / maior) * 120)) }}
            />
            <small>{dias[i]}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Retenção por semana contra a meta (`ctGraficoDeRetencao`, `cartoes.js:500-516`). */
function GraficoDeRetencao({ resumo, meta }: { resumo: ResumoDosCartoes; meta: number }) {
  const semanas = resumo.retencao.semanas.map(porcentoDeLembradas);
  const medidas = semanas.filter((v): v is number => v !== null);
  const estreito = celular();
  const W = estreito ? 330 : 500;
  const H = estreito ? 210 : 236;
  const m = { e: 46, d: 14, t: 26, b: 30 };
  /* O protótipo começa a escala em 75%. Com uma semana abaixo disso, a escala desce até caber. */
  const piso = Math.min(75, Math.floor((Math.min(meta, ...medidas) - 5) / 10) * 10 + 5);
  const y = (v: number) => m.t + (1 - (v - piso) / (100 - piso)) * (H - m.t - m.b);
  const x = (i: number) => m.e + (i * (W - m.e - m.d)) / (semanas.length - 1);
  const pontos = semanas
    .map((v, i) => (v === null ? null : { i, v, x: x(i), y: y(v) }))
    .filter((p): p is { i: number; v: number; x: number; y: number } => p !== null);
  const traco = pontos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const linhas = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10].filter((v) => v > piso).slice(0, 4);
  const ultimo = pontos[pontos.length - 1];
  /* O começo de cada janela de sete dias; a última termina hoje. */
  const inicioDaSemana = (i: number) => resumo.inicioDoDia - ((semanas.length - 1 - i) * 7 + 6) * DIA;
  const rotulos = semanas.map((_, i) =>
    i === semanas.length - 1
      ? estreito
        ? t('esta')
        : t('esta semana')
      : /* Os mesmos pontos rotulados do protótipo (`cartoes.js:515`): o 1º, o 3º e o 5º; no celular, o 1º e o 5º. */
        (estreito ? [0, 4] : [0, 2, 4]).includes(i)
        ? diaEMes(inicioDaSemana(i))
        : '',
  );
  return (
    <svg
      className="ct-graf"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={t('Retenção real por semana: {lista} por cento. Meta: {meta} por cento.', {
        lista: semanas.map((v) => (v === null ? t('sem revisão') : String(v))).join(', '),
        meta,
      })}
    >
      {linhas.map((v) => (
        <g key={v}>
          <line className="g" x1={m.e} x2={W - m.d} y1={y(v)} y2={y(v)} />
          <text className="e" x={m.e - 8} y={y(v) + 4} textAnchor="end">
            {v}%
          </text>
        </g>
      ))}
      <line className="meta" x1={m.e} x2={W - m.d} y1={y(meta)} y2={y(meta)} />
      <text className="meta-t" x={m.e + 6} y={y(meta) - 8}>
        {t('meta {n}%', { n: meta })}
      </text>
      {pontos.length > 1 && (
        <>
          <polygon
            className="area"
            points={`${pontos[0].x.toFixed(1)},${H - m.b} ${traco} ${ultimo.x.toFixed(1)},${H - m.b}`}
          />
          <polyline className="linha" points={traco} pathLength={1} />
        </>
      )}
      {pontos.map((p) => (
        <circle
          key={p.i}
          className={`pt ${p === ultimo ? 'agora' : ''}`}
          cx={p.x.toFixed(1)}
          cy={p.y.toFixed(1)}
          r={p === ultimo ? 6 : 4}
        />
      ))}
      {ultimo && (
        <text className="v" x={ultimo.x + 4} y={ultimo.y - 14} textAnchor="end">
          {ultimo.v}%
        </text>
      )}
      {rotulos.map((r, i) =>
        r ? (
          <text key={i} className="e" x={x(i)} y={H - 8} textAnchor={i === semanas.length - 1 ? 'end' : 'middle'}>
            {r}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export default function Memoria({
  resumo,
  metaDeRetencao,
  sequencia,
  maiorSequencia,
  aoHoje,
  aoVerDificeis,
}: {
  /** `null` = estado vazio (sem conta, ou nenhum cartão). */
  resumo: ResumoDosCartoes | null;
  metaDeRetencao: number;
  /** A ofensiva do perfil (dias de prática seguidos) e a maior já feita; `null` enquanto não chegam. */
  sequencia: number | null;
  maiorSequencia: number | null;
  /** "Ver como começar": volta para "Hoje". */
  aoHoje: () => void;
  /** "Ver as N difíceis": "Difíceis" vira o conteúdo e a lista de Palavras abre. */
  aoVerDificeis: () => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const semDado = !resumo || resumo.revisoesDeSempre === 0;

  /* A entrada do que é desta aba (`ctEntrada`, `cartoes.js:610-620`). */
  useEffect(() => {
    const el = raiz.current;
    if (!el || semDado || !polido() || reduz()) return;
    el.querySelectorAll('.qv-barras .qv-barra').forEach((x, k) =>
      anima(x, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], {
        d: 760,
        atraso: 320 + k * 60,
        e: MOLA_SUAVE,
      }),
    );
    el.querySelectorAll('.ct-semana li i').forEach((x, k) =>
      anima(x, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { d: 520, atraso: 300 + k * 55, e: MOLA }),
    );
    el.querySelectorAll('.ct-prev30 i').forEach((x, k) =>
      anima(x, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], {
        d: 620,
        atraso: 200 + k * 18,
        e: MOLA_SUAVE,
      }),
    );
    el.querySelectorAll('.ct-cal i').forEach((x, k) =>
      anima(
        x,
        [
          { opacity: 0, transform: 'scale(0.4)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { d: 380, atraso: 160 + Math.floor(k / 7) * 34 },
      ),
    );
    el.querySelectorAll('.ct .q-barra > span, .ct-bh .q-barra > span').forEach((s, k) =>
      anima(s, [{ clipPath: 'inset(0 100% 0 0 round 999px)' }, { clipPath: 'inset(0 0 0 0 round 999px)' }], {
        d: 900,
        atraso: 380 + k * 90,
      }),
    );
    const linha = el.querySelector('.ct-graf .linha');
    if (linha)
      anima(linha, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { d: 1400, atraso: 250, e: 'ease-out' });
    el.querySelectorAll('.ct-graf .pt').forEach((x, k) =>
      anima(x, [{ opacity: 0 }, { opacity: 1 }], { d: 300, atraso: 420 + k * 130, e: 'ease' }),
    );
  }, [semDado]);

  if (semDado || !resumo) {
    return (
      <div className="q-vazio">
        <span className="q-ic">
          <Brain aria-hidden />
        </span>
        <h2>{t('Os números aparecem depois das primeiras revisões')}</h2>
        <p>
          {t('Retenção real contra a meta, previsão de carga, calendário de dias estudados e os botões que você usa.')}
        </p>
        <button type="button" className="q-ctl pri" onClick={aoHoje}>
          <CalendarCheck aria-hidden /> {t('Ver como começar')}
        </button>
      </div>
    );
  }

  const mes = porcentoDeLembradas(resumo.retencao.d30);
  const revisoes30 = resumo.retencao.d30.total;
  const kpis: Array<[ReactNode, string, string, string]> = [
    [
      <Brain key="i" aria-hidden />,
      t('Retenção real'),
      mes === null ? '—' : `${mes}%`,
      t('meta {n}% · últimos 30 dias', { n: metaDeRetencao }),
    ],
    [
      <Target key="i" aria-hidden />,
      t('Revisões'),
      numero(revisoes30),
      t('em 30 dias · {n} por dia', { n: numero(Math.round(revisoes30 / 30)) }),
    ],
    [
      <Flame key="i" aria-hidden />,
      t('Sequência'),
      sequencia === null ? '—' : tp(sequencia, '{n} dia', '{n} dias'),
      maiorSequencia === null ? t('dias de prática seguidos') : t('recorde: {n}', { n: maiorSequencia }),
    ],
    [
      <TriangleAlert key="i" aria-hidden />,
      t('Difíceis'),
      numero(resumo.dificeis),
      t('erradas {n} vezes ou mais', { n: ERROS_DE_DIFICIL }),
    ],
  ];

  /* A previsão de 30 dias, a partir de amanhã. */
  const carga = resumo.previsao.slice(1, 31);
  const maior = Math.max(1, ...carga);
  const media = Math.round(carga.reduce((s, v) => s + v, 0) / Math.max(1, carga.length));
  /* O dia mais cheio é um só: com empate, o primeiro. */
  const diaMaisCheio = carga.indexOf(Math.max(...carga, 0));

  /* O calendário: colunas de domingo a sábado, a última termina hoje. */
  const hojeNaSemana = new Date(resumo.inicioDoDia).getDay();
  const celulas = resumo.calendario.slice(-(11 * 7 + hojeNaSemana + 1));
  const pico = Math.max(1, ...celulas);
  const nivel = (n: number) => (n === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((n / pico) * 4))));
  const diasComRevisao = resumo.calendario.filter((n) => n > 0).length;
  const porDiaDaSemana = Array.from({ length: 7 }, () => 0);
  resumo.calendario.forEach((n, i) => {
    const atras = resumo.calendario.length - 1 - i;
    porDiaDaSemana[(((hojeNaSemana - atras) % 7) + 7) % 7] += n;
  });
  const maisForte = porDiaDaSemana.indexOf(Math.max(...porDiaDaSemana));
  const NOME_DO_DIA = [
    t('domingo'),
    t('segunda-feira'),
    t('terça-feira'),
    t('quarta-feira'),
    t('quinta-feira'),
    t('sexta-feira'),
    t('sábado'),
  ];
  const fatos: Array<[string, string]> = [
    [t('Dias com revisão'), t('{n} de {total}', { n: diasComRevisao, total: resumo.calendario.length })],
    ...(maiorSequencia === null
      ? []
      : ([[t('Maior sequência'), tp(maiorSequencia, '{n} dia', '{n} dias')]] as Array<[string, string]>)),
    [t('Dia mais forte'), NOME_DO_DIA[maisForte]],
  ];

  const botoes: Array<[string, number, string]> = [
    [t('Errei'), resumo.botoes[0], 'e'],
    [t('Difícil'), resumo.botoes[1], 'd'],
    [t('Bom'), resumo.botoes[2], 'b'],
    [t('Fácil'), resumo.botoes[3], 'f'],
  ];
  const totalDeBotoes = botoes.reduce((s, b) => s + b[1], 0);

  const fases: Array<[string, number, string]> = [
    [t('Novas'), resumo.fases.novas, 'nv'],
    [t('Aprendendo'), resumo.fases.aprendendo, 'ap'],
    [t('Jovens'), resumo.fases.jovens, 'jv'],
    [t('Maduras'), resumo.fases.maduras, 'md'],
    [t('Suspensas'), resumo.suspensas, 'sp'],
  ];
  const noCaderno = fases.reduce((s, f) => s + f[1], 0);

  return (
    <div ref={raiz} className="ct-memoria" data-testid="memoria-dos-cartoes">
      <div className="qe-kpis ct-kpis ct-kpis-4">
        {kpis.map(([icone, rotulo, valor, sub]) => (
          <div key={rotulo} className="q-num qe-kpi">
            <span className="q-rotulo">
              {icone} {rotulo}
            </span>
            <b>{valor}</b>
            <span>{sub}</span>
          </div>
        ))}
      </div>
      <div className="q-grade g2 ct-mem-par">
        <section className="q-cartao ct-seq" data-testid="sequencia-da-semana">
          <CabecaDoCartao
            titulo={sequencia === null ? t('Os últimos sete dias') : tp(sequencia, '{n} dia seguido', '{n} dias seguidos')}
            sub={[
              sequencia === null ? '' : t('Dias de prática seguidos.'),
              maiorSequencia === null ? '' : tp(maiorSequencia, 'Recorde: {n} dia.', 'Recorde: {n} dias.'),
            ]
              .filter(Boolean)
              .join(' ')}
            extra={
              <span className="q-ic" aria-hidden="true">
                <Flame />
              </span>
            }
          />
          <Semana resumo={resumo} />
          <p className="qv-nota">{t('Os dias marcados são os que tiveram revisão de cartões.')}</p>
        </section>
        <Previsao7 resumo={resumo} />
      </div>
      <div className="q-grade g2 ct-mem-par">
        <section className="q-cartao ct-mem-ret" data-testid="retencao-contra-a-meta">
          <CabecaDoCartao
            titulo={t('Retenção real contra a meta')}
            sub={t(
              'De cada 100 revisões, quantas você lembrou. “Errei” conta como esquecida; “Difícil”, “Bom” e “Fácil” contam como lembrada.',
            )}
          />
          <div className="qe-grafico">
            <GraficoDeRetencao resumo={resumo} meta={metaDeRetencao} />
          </div>
          <p className="qv-nota">
            {mes === null
              ? t('Sem revisão nos últimos 30 dias.')
              : mes >= metaDeRetencao
                ? t('Dentro da meta nos 30 dias.')
                : tp(
                    metaDeRetencao - mes,
                    '{n} ponto abaixo da meta nos 30 dias.',
                    '{n} pontos abaixo da meta nos 30 dias.',
                  )}{' '}
            {t('A agenda já encurta os intervalos das palavras que você erra.')}
          </p>
        </section>
        <section className="q-cartao ct-mem-prev" data-testid="previsao-de-carga">
          <CabecaDoCartao
            titulo={t('Previsão de carga · 30 dias')}
            sub={t('Quantos cartões voltam em cada dia. Média de {media} por dia; o dia mais cheio tem {maior}.', {
              media: numero(media),
              maior: numero(Math.max(...carga, 0)),
            })}
          />
          <div
            className="ct-prev30"
            role="img"
            aria-label={t('Previsão de revisões para os próximos 30 dias, média de {n} por dia', { n: media })}
          >
            <span className="ct-media" style={{ bottom: `${(media / maior) * 100}%` }} />
            {carga.map((v, i) => (
              <i
                key={i}
                className={v > 0 && i === diaMaisCheio ? 'pico' : ''}
                style={{ ['--h' as string]: `${(v / maior) * 100}%`, ['--i' as string]: i }}
                title={`${i === 0 ? t('amanhã') : t('em {n} dias', { n: i + 1 })}: ${v}`}
              />
            ))}
          </div>
          <div className="ct-prev30-eixo">
            <span>{t('amanhã')}</span>
            <span>{t('em {n} dias', { n: 10 })}</span>
            <span>{t('em {n} dias', { n: 20 })}</span>
            <span>{t('em {n} dias', { n: 30 })}</span>
          </div>
          <p className="qv-nota">{t('A linha tracejada é a média; a barra destacada, o dia mais cheio.')}</p>
        </section>
      </div>
      <section className="q-cartao ct-mem-cal" data-testid="dias-estudados">
        <CabecaDoCartao
          titulo={t('Dias estudados')}
          sub={t('Últimas 12 semanas: {n} dias com revisão. Quanto mais escuro, mais cartões no dia.', {
            n: diasComRevisao,
          })}
          extra={
            <div className="legenda-cal ct-leg-cal">
              <span className="mut">{t('menos')}</span>
              <i className="n0" />
              <i className="n1" />
              <i className="n2" />
              <i className="n3" />
              <i className="n4" />
              <span className="mut">{t('mais')}</span>
            </div>
          }
        />
        <div className="ct-cal-caixa">
          <div className="ct-cal-dias" aria-hidden="true">
            <span>{diaCurto(0)}</span>
            <span>{diaCurto(2)}</span>
            <span>{diaCurto(4)}</span>
            <span>{diaCurto(6)}</span>
          </div>
          <div
            className="ct-cal"
            role="img"
            aria-label={t('Calendário de dias estudados nas últimas 12 semanas: {n} dias com revisão', {
              n: diasComRevisao,
            })}
          >
            {celulas.map((n, i) => {
              const hoje = i === celulas.length - 1;
              const quando = diaEMes(resumo.inicioDoDia - (celulas.length - 1 - i) * DIA);
              return (
                <i
                  key={i}
                  className={hoje && n === 0 ? 'hoje' : `n${nivel(n)}`}
                  title={`${quando}: ${n ? tp(n, '{n} revisão', '{n} revisões') : t('sem revisão')}`}
                />
              );
            })}
          </div>
          <dl className="q-medidas ct-cal-fatos">
            {fatos.map(([k, v]) => (
              <div key={k} className="q-medida">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <div className="q-grade g2 ct-mem-par">
        <section className="q-cartao ct-mem-botoes" data-testid="botoes-usados">
          <CabecaDoCartao
            titulo={t('Botões usados')}
            sub={tp(totalDeBotoes, '{n} resposta em 30 dias.', '{n} respostas em 30 dias.', {
              n: numero(totalDeBotoes),
            })}
          />
          <div className="ct-barras-h">
            {botoes.map(([rotulo, v, classe]) => {
              const pct = totalDeBotoes ? (v / totalDeBotoes) * 100 : 0;
              return (
                <div key={classe} className={`ct-bh ${classe}`}>
                  <span>{rotulo}</span>
                  <span className="q-barra">
                    <span style={{ width: `${pct}%` }} />
                  </span>
                  <b>{Math.round(pct)}%</b>
                  <small>{numero(v)}</small>
                </div>
              );
            })}
          </div>
          <p className="qv-nota">
            {t(
              '“Difícil” é para quando lembrou com esforço. Se não lembrou, o certo é “Errei”: usar “Difícil” no lugar estica demais os intervalos.',
            )}
          </p>
        </section>
        <section className="q-cartao ct-mem-fases" data-testid="cartoes-por-estado">
          <CabecaDoCartao
            titulo={t('Cartões por estado')}
            sub={t('{n} no caderno. Jovem é o cartão em revisão com menos de 21 dias de estabilidade.', {
              n: numero(noCaderno),
            })}
          />
          <div className="ct-pilha-h" role="img" aria-label={fases.map(([r, v]) => `${r} ${v}`).join(', ')}>
            {fases
              .filter(([, v]) => v > 0)
              .map(([r, v, k]) => (
                <i key={k} className={k} style={{ flex: v }} title={`${r}: ${v}`} />
              ))}
          </div>
          <ul className="qv-legenda ct-leg-fases">
            {fases.map(([r, v, k]) => (
              <li key={k}>
                <i className={k} />
                <span>{r}</span>
                <b>
                  {numero(v)} · {noCaderno ? Math.round((v / noCaderno) * 100) : 0}%
                </b>
              </li>
            ))}
          </ul>
          {resumo.dificeis > 0 && (
            <button type="button" className="q-ctl" onClick={aoVerDificeis}>
              <TriangleAlert aria-hidden />{' '}
              {tp(resumo.dificeis, 'Ver a {n} difícil', 'Ver as {n} difíceis', { n: numero(resumo.dificeis) })}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
