import {
  CONQUISTAS,
  type ContextoDeConquistas,
  levelFloor,
  PESOS_SEEDS,
  progressoDasConquistas,
  type ProgressoDeConquista,
  type RaridadeDaConquista,
  REGRAS,
} from '@core';
import type { LucideIcon } from 'lucide-react';
import {
  Award,
  BookOpen,
  Brain,
  CalendarCheck,
  Check,
  Coins,
  Flame,
  Lock,
  Mic,
  Save,
  Sprout,
  Star,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { useMemo } from 'react';

import { conquistasDesbloqueadas, dataDaConquista } from '../../lib/conquistasPosse';
import { data } from '../../lib/i18n';
import { CATALOGO_DA_LOJA, COR_DA_RARIDADE } from '../../lib/loja';
import type { DerivedProgress } from '../../lib/progress';
import { iconeDaConquista } from '../iconesDaConquista';
import { IconeEmBloco, TituloDeSecao, type TomDoIcone } from '../ui';

/**
 * DESAFIOS — como se ganha, como se sobe e o que se conquista, em números.
 *
 * O pedido do dono (2026-08-28): "deixar bem claro quantos pontos o usuário vai ganhar, como
 * ganhar, como subir de nível". Então "Como ganhar" NÃO é redigido aqui: sai de `REGRAS` (core),
 * a mesma fonte que o cálculo usa. O que está escrito é o que é creditado.
 *
 * A MARCAÇÃO É A DO PROTÓTIPO (`T.personalizar`, aba Desafios): três seções com `TituloDeSecao`,
 * as regras em `.g3`, a curva de nível num `.cartao.p5` com `.barra` e `.chips`, e as conquistas
 * em `.cartao.conq.<raridade>` agrupadas por raridade. O protótipo desenha três regras e dez
 * conquistas de exemplo; aqui vão TODAS as do core, com o progresso real.
 */
interface ConquistasProps {
  progress: DerivedProgress;
  ctx: ContextoDeConquistas | null;
}

const ORDEM: RaridadeDaConquista[] = ['lendario', 'epico', 'raro', 'comum'];

/* O ícone de cada regra. O das conquistas mora em `../iconesDaConquista` (é o mesmo no modal de
   resgate e no perfil). Id novo sem ícone cai no genérico. */
const ICONE_DA_REGRA: Record<string, LucideIcon> = {
  presenca: CalendarCheck,
  sequencia7: Flame,
  captura: Mic,
  sessao: Save,
  cartao: BookOpen,
  revisaoCerta: Brain,
  jogoCerto: Target,
  rodadaPerfeita: Star,
  conquista: Trophy,
};
const TOM: Record<RaridadeDaConquista, TomDoIcone> = { lendario: 'warn', epico: 'rare', raro: 'rare', comum: 'accent' };

function dataCurta(ts: number): string {
  return data(new Date(ts), { day: '2-digit', month: 'short' });
}

export default function Conquistas({ progress, ctx }: ConquistasProps) {
  const feitas = conquistasDesbloqueadas();
  const lista: ProgressoDeConquista[] = useMemo(() => {
    if (!ctx)
      return CONQUISTAS.map((conquista) => ({
        conquista,
        atual: 0,
        meta: conquista.progresso({
          metricas: {} as never,
          nivel: 1,
          melhorComboPorJogo: {},
          eventosVistos: 0,
          totalDeEventos: 1,
          idiomas: 0,
          compras: 0,
        }).meta,
        pct: 0,
        conquistada: false,
      }));
    return progressoDasConquistas(ctx);
  }, [ctx]);
  // A posse local manda: uma conquista creditada continua "feita" mesmo se a métrica cair
  // (ex.: sequência de presença perdida depois do marco).
  const porRaridade = ORDEM.map((r) => ({ r, itens: lista.filter((p) => p.conquista.raridade === r) })).filter(
    (g) => g.itens.length > 0,
  );
  const totalFeitas = lista.filter((p) => p.conquistada || feitas.has(p.conquista.id)).length;
  const proximosNiveis = Array.from({ length: 5 }, (_, i) => progress.level + 1 + i);

  return (
    <>
      {/* COMO GANHAR: gerado das REGRAS, nunca redigido à mão. O teto ("até N por dia") vai na
          linha da unidade: é a metade da regra que responde "até quando isso rende". */}
      <section>
        <TituloDeSecao icone={Coins} titulo="Como ganhar Seeds e XP" />
        <div className="g3">
          {REGRAS.map((r) => {
            const varia = r.id === 'conquista';
            return (
              <div key={r.id} className="cartao p5 linha" style={{ alignItems: 'flex-start' }}>
                <IconeEmBloco icone={ICONE_DA_REGRA[r.id] ?? Award} />
                <div>
                  <h3 style={{ fontSize: 14.5, fontWeight: 800 }}>{r.como}</h3>
                  <p className="mut" style={{ fontSize: 12.5 }}>
                    {r.unidade}
                    {r.teto ? ` · ${r.teto}` : ''}
                  </p>
                  <div className="linha" style={{ gap: 6, marginTop: 8 }}>
                    <span className="badge acc">{varia ? 'XP varia' : `+${r.xp} XP`}</span>
                    {/* A regra que dá XP e não dá Seeds não ganha ficha vazia: a ausência é a
                        informação, e um "+0" verde parecia um ganho. */}
                    {(varia || r.seeds > 0) && (
                      <span className="badge ok">
                        <Sprout aria-hidden /> {varia ? 'varia' : `+${r.seeds}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── A CURVA DE NÍVEL ── */}
      <section className="secao">
        <TituloDeSecao icone={TrendingUp} titulo="Como subir de nível" />
        <div className="cartao p5">
          <div className="entre">
            <b style={{ fontFamily: 'var(--font-display)' }}>Nível {progress.level}</b>
            <span className="mut tn" style={{ fontSize: 12.5 }}>
              {progress.xpIntoLevel} / {progress.xpForLevel} XP
            </span>
          </div>
          <div className="barra" style={{ margin: '10px 0 14px' }}>
            <span style={{ width: `${progress.levelPct}%` }} />
          </div>
          <div className="chips">
            {proximosNiveis.map((n) => (
              <span key={n} className="pill" style={{ cursor: 'default' }}>
                Nv. {n} aos <b style={{ color: 'var(--ink)' }}>{levelFloor(n)}</b> XP
              </span>
            ))}
          </div>
          <p className="mut" style={{ fontSize: 12.5, marginTop: 10 }}>
            Cada nível custa 100 XP a mais que o anterior. Chegar ao 5 e ao 10 também são conquistas.
          </p>
        </div>
      </section>

      {/* ── AS CONQUISTAS, por raridade ── */}
      <section className="secao">
        <TituloDeSecao
          icone={Award}
          titulo="Conquistas"
          desc={`Conquista não se compra: só fazendo. Presença vale ${PESOS_SEEDS.presenca} Seeds por dia.`}
          direita={
            <span className="mut" style={{ fontSize: 12.5 }}>
              <b style={{ color: 'var(--ink)' }}>{totalFeitas}</b> de {lista.length} feitas
            </span>
          }
        />
        {porRaridade.map(({ r, itens }, k) => (
          <div key={r}>
            <div className="label-mono" style={{ margin: k === 0 ? '4px 0 10px' : '20px 0 10px' }}>
              {COR_DA_RARIDADE[r].rotulo}
            </div>
            <div className="gauto">
              {itens.map(({ conquista, atual, meta, pct, conquistada }) => {
                const feita = conquistada || feitas.has(conquista.id);
                const quando = dataDaConquista(conquista.id);
                /* O exclusivo que a conquista entrega: a Loja não vende, então é aqui que ele
                   aparece antes de ser seu. */
                const exclusivo = conquista.recompensa.cosmetico
                  ? CATALOGO_DA_LOJA.find((i) => i.id === conquista.recompensa.cosmetico)
                  : null;
                const valor = feita ? meta : atual;
                const porcento = feita ? 100 : pct;
                return (
                  <article key={conquista.id} className={`cartao conq ${conquista.raridade}`}>
                    <div className="linha">
                      <IconeEmBloco icone={iconeDaConquista(conquista.id)} tom={TOM[conquista.raridade]} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3>{conquista.nome}</h3>
                        <p>{conquista.desc}</p>
                      </div>
                      {feita ? (
                        <span className="badge ok">
                          <Check aria-hidden /> Feita
                        </span>
                      ) : (
                        <Lock aria-hidden style={{ width: 15, height: 15, color: 'var(--ink-muted)' }} />
                      )}
                    </div>
                    {/* Progresso: sempre em número, nunca só a barra. */}
                    <div className="entre" style={{ font: '600 11.5px var(--font-mono)', color: 'var(--ink-muted)' }}>
                      <span>
                        {valor} / {meta}
                      </span>
                      <span>{porcento}%</span>
                    </div>
                    <div className={`barra ${feita ? 'good' : ''}`}>
                      <span style={{ width: `${porcento}%` }} />
                    </div>
                    <div className="meta">
                      <Sprout aria-hidden style={{ color: 'var(--good)' }} />
                      <b style={{ color: 'var(--ink)' }}>+{conquista.recompensa.seeds}</b>
                      {conquista.recompensa.xp > 0 && <> · +{conquista.recompensa.xp} XP</>}
                      {exclusivo && (
                        <>
                          {' '}
                          · <Star aria-hidden style={{ color: 'var(--warn)' }} />
                          <b style={{ color: 'var(--warn-ink)' }}>{exclusivo.nome}</b>
                        </>
                      )}
                      {feita && quando && <> · {dataCurta(quando)}</>}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
