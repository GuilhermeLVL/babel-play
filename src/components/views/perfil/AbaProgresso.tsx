import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceDot } from 'recharts';
import { Loader2, Trophy } from 'lucide-react';
import { fetchDeck } from '../../../data/api';
import { fetchHistoricoDeXp, type HistoricoDeXp } from '../../../data/me';
import { fluenciaDoBaralho, rotuloDeFluencia, RETENCAO_DE_DOMINIO, MIN_CARTOES_POR_FAIXA, type Fluencia } from '@core';
import type { VocabCard } from '../../../types';
import type { DerivedProgress } from '../../../lib/progress';
import type { AgeProfileType } from '../../../lib/profile';
import FaixaDeProgresso from '../../progress/FaixaDeProgresso';
import { Barra, Ladrilho } from '../../ui';
import { Confianca, rotuloDaBase } from '../../Honestidade';

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

export default function AbaProgresso({ progress, ageProfile }: AbaProgressoProps) {
  const [historico, setHistorico] = useState<HistoricoDeXp | null>(null);
  const [baralho, setBaralho] = useState<VocabCard[] | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    void Promise.all([fetchHistoricoDeXp('dia'), fetchDeck()])
      .then(([h, d]) => { if (vivo) { setHistorico(h); setBaralho(d); } })
      .catch(() => { /* cada seção trata a própria ausência */ })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, []);

  const fluencia: Fluencia | null = useMemo(
    () => (baralho ? fluenciaDoBaralho(baralho) : null),
    [baralho],
  );

  const serie = useMemo(() => (historico?.pontos ?? []).map(p => ({
    ...p,
    rotulo: new Date(p.em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
  })), [historico]);

  return (
    <div className="space-y-8">

      <FaixaDeProgresso progress={progress} ageProfile={ageProfile} />

      {/* ── A CURVA ──────────────────────────────────────────────────────────────────────────
          Reconstruída dos carimbos de tempo que já existem (sessões, revisões, itens de jogo) —
          não há tabela de XP e não precisa haver. A ressalva embaixo é obrigatória: mudar os pesos
          reescreveria este gráfico, e fingir um livro-razão que não existe seria pior que a
          limitação. */}
      <section>
        <h2 className="font-display font-bold text-lg text-ink mb-1">Como você chegou até aqui</h2>
        <p className="text-[12.5px] text-ink-muted mb-4 max-w-[64ch]">
          O XP somado dia a dia, com as subidas de nível marcadas.
        </p>

        <div className="card-panel bg-surface p-5">
          {carregando ? (
            <div className="h-56 flex items-center justify-center gap-2 text-ink-muted text-[13px]">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Reconstruindo a sua curva…
            </div>
          ) : serie.length < 2 ? (
            /* Um ponto não é uma curva. Dizer isso é melhor que desenhar uma linha reta que
               parece estagnação. */
            <p className="text-[13px] text-ink-muted py-10 text-center">
              Ainda não há dias suficientes para desenhar uma curva. Grave ou revise em dois dias
              diferentes e ela aparece aqui.
            </p>
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                    <defs>
                      <linearGradient id="curvaXp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: 'var(--ink-muted)' }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--ink-muted)' }} tickLine={false} axisLine={false} width={56} />
                    <Tooltip
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, fontSize: 12 }}
                      labelStyle={{ color: 'var(--ink)' }}
                      formatter={(v: number, nome) => [nome === 'xpAcumulado' ? `${v} XP` : `+${v} XP`, nome === 'xpAcumulado' ? 'total' : 'no dia']}
                    />
                    <Area type="monotone" dataKey="xpAcumulado" stroke="var(--accent)" strokeWidth={2} fill="url(#curvaXp)" />
                    {/* Cada subida de nível vira um ponto — é literalmente o "saí do 1 para o 2". */}
                    {(historico?.marcos ?? []).map(m => {
                      const ponto = serie.find(p => p.em === m.em);
                      return ponto ? (
                        <ReferenceDot key={`${m.em}-${m.nivel}`} x={ponto.rotulo} y={ponto.xpAcumulado} r={4} fill="var(--good)" stroke="var(--surface)" strokeWidth={2} />
                      ) : null;
                    })}
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {(historico?.marcos.length ?? 0) > 0 && (
                <ul className="flex flex-wrap gap-2 mt-4">
                  {historico!.marcos.slice(-6).map(m => (
                    <li key={`${m.em}-${m.nivel}`} className="kpi-pill cursor-default">
                      <Trophy className="w-3 h-3 text-good" aria-hidden />
                      nível {m.nivel} · {new Date(m.em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-[11px] text-ink-faint mt-4 leading-snug max-w-[70ch]">
                Reconstruído a partir das suas gravações, revisões e rodadas — não há um registro
                separado de XP. Se a fórmula de pontos mudar, este gráfico muda junto.
              </p>
            </>
          )}
        </div>
      </section>

      {/* ── FLUÊNCIA ─────────────────────────────────────────────────────────────────────────
          A única saída deste app que é um JUÍZO sobre a pessoa. Por isso a regra vem escrita ao
          lado do rótulo, e a base de cálculo aparece sem ser pedida. */}
      <section>
        <h2 className="font-display font-bold text-lg text-ink mb-1">Onde você está no idioma</h2>
        <p className="text-[12.5px] text-ink-muted mb-4 max-w-[64ch]">
          Medido pelo que você <b>sustenta</b> — a chance de lembrar agora, e não quantas palavras
          você tem guardadas.
        </p>

        <div className="card-panel bg-surface p-5">
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
                  {fluencia.faixas.map(f => (
                    <li key={f.nivel} className="flex items-center gap-3">
                      <span className={`font-display font-black text-[13px] w-7 shrink-0 ${f.sustentada ? 'text-good-ink' : 'text-ink-muted'}`}>
                        {f.nivel}
                      </span>
                      <Barra
                        pct={(f.retencao ?? 0) * 100}
                        tom={f.sustentada ? 'good' : 'warn'}
                        tamanho="fina"
                        rotuloAcessivel={`Retenção do ${f.nivel}`}
                        className="flex-1"
                      />
                      <span className="text-[12px] font-mono tabular-nums w-12 text-right text-ink">
                        {f.retencao === null ? '—' : `${Math.round(f.retencao * 100)}%`}
                      </span>
                      <span className="text-[11px] text-ink-faint w-32 text-right hidden sm:block">
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
                    {fluencia.semNivel.toLocaleString('pt-BR')} palavras ficaram de fora porque não
                    estão na lista de níveis conferidos — elas não foram chutadas para faixa nenhuma.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── O QUE VOCÊ ACUMULOU ─────────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="font-display font-bold text-lg text-ink mb-4">O que você acumulou</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Ladrilho valor={progress.available ? progress.level : null} rotulo="nível atual" tom="accent" />
          <Ladrilho valor={progress.available ? historico?.xpTotal ?? null : null} rotulo="XP no total" />
          <Ladrilho valor={progress.available ? progress.streakDays : null} rotulo="dias seguidos" tom={progress.streakDays > 0 ? 'warn' : 'ink'} />
          <Ladrilho valor={progress.available ? progress.seeds : null} rotulo="seeds" tom="good" nota={`${progress.seedsGanhas} ganhas no total`} />
        </div>
      </section>
    </div>
  );
}
