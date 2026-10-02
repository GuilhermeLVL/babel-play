import {
  CONQUISTAS,
  type ContextoDeConquistas,
  levelFloor,
  type NivelDaConquista,
  PESOS_SEEDS,
  PILARES_DE_CONQUISTA,
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
import { useMemo, useState } from 'react';

import { conquistasDesbloqueadas, dataDaConquista } from '../../lib/conquistasPosse';
import { useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
import { data, t } from '../../lib/i18n';
import { CATALOGO_DA_LOJA } from '../../lib/loja';
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
 * em `.cartao.conq.<raridade>`. O protótipo desenha três regras e dez conquistas de exemplo; aqui
 * vão TODAS as do core, com o progresso real, agrupadas pelos QUATRO PILARES (recompensas v2, spec
 * 9) com a contagem "feitas/total" de cada um. A secreta mostra só a dica até ser feita.
 */
interface ConquistasProps {
  progress: DerivedProgress;
  ctx: ContextoDeConquistas | null;
}

/* O degrau da série, na cor do badge: bronze neutro, prata raro, ouro de destaque. */
const BADGE_DO_NIVEL: Record<NivelDaConquista, { rotulo: string; classe: string }> = {
  bronze: { rotulo: 'Bronze', classe: 'neu' },
  prata: { rotulo: 'Prata', classe: 'rare' },
  ouro: { rotulo: 'Ouro', classe: 'warn' },
};

/* O ícone de cada regra. O das conquistas mora em `../iconesDaConquista` (é o mesmo no modal de
   resgate e no perfil). Id novo sem ícone cai no genérico. */
const ICONE_DA_REGRA: Record<string, LucideIcon> = {
  sequencia7: Flame,
  palavraSalva: Mic,
  metaDiaria: CalendarCheck,
  nivelDeMaestria: Award,
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
  /* No Meta Quest (telas novas): uma parte por vez (conquistas, como ganhar, como subir), e as conquistas
     filtradas por pilar, no lugar da página comprida. O conteúdo de cada parte é o mesmo. */
  const questNovo = useQuestNovo();
  const [parteQ, setParteQ] = useState<'conquistas' | 'ganhar' | 'nivel'>('conquistas');
  const [pilarQ, setPilarQ] = useState<string>('todos');
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
  const ehFeita = (p: ProgressoDeConquista) => p.conquistada || feitas.has(p.conquista.id);
  const porPilar = PILARES_DE_CONQUISTA.map((pilar) => {
    const itens = lista.filter((p) => p.conquista.pilar === pilar.id);
    return { pilar, itens, feitas: itens.filter(ehFeita).length };
  }).filter((g) => g.itens.length > 0);
  const totalFeitas = lista.filter(ehFeita).length;
  const proximosNiveis = Array.from({ length: 5 }, (_, i) => progress.level + 1 + i);

  /* COMO GANHAR: gerado das REGRAS, nunca redigido à mão. O teto ("até N por dia") vai na
     linha da unidade: é a metade da regra que responde "até quando isso rende". */
  const secaoComoGanhar = (
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
                  {/* Ficha de zero não existe, nem de XP nem de Seeds: a ausência é a informação,
                      e um "+0" parecia um ganho (salvar palavra e maestria não dão XP). */}
                  {(varia || r.xp > 0) && <span className="badge acc">{varia ? 'XP varia' : `+${r.xp} XP`}</span>}
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
  );

  /* ── A CURVA DE NÍVEL ── */
  const secaoDoNivel = (
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
  );

  /* No headset, um pilar por vez (ou todos): a grade é a mesma, só mais curta. */
  const grupos = questNovo && pilarQ !== 'todos' ? porPilar.filter((g) => g.pilar.id === pilarQ) : porPilar;
  const seletorDePilar = questNovo ? (
    <div className="q-abas q-seg qp-secoes" role="group" aria-label={t('Pilares das conquistas')}>
      <button type="button" className="q-aba" aria-pressed={pilarQ === 'todos'} onClick={() => setPilarQ('todos')}>
        {t('Todos')}
        <span className="n">
          {totalFeitas}/{lista.length}
        </span>
      </button>
      {porPilar.map((g) => (
        <button
          key={g.pilar.id}
          type="button"
          className="q-aba"
          aria-pressed={pilarQ === g.pilar.id}
          onClick={() => setPilarQ(g.pilar.id)}
        >
          {t(g.pilar.nome)}
          <span className="n">
            {g.feitas}/{g.itens.length}
          </span>
        </button>
      ))}
    </div>
  ) : null;

  /* ── AS CONQUISTAS, por raridade ── */
  const secaoDasConquistas = (
    <section className="secao">
      <TituloDeSecao
        icone={Award}
        titulo="Conquistas"
        desc={`Conquista não se compra: só fazendo. A meta do dia vale ${PESOS_SEEDS.metaDiaria} Seeds.`}
        direita={
          <span className="mut" style={{ fontSize: 12.5 }}>
            <b style={{ color: 'var(--ink)' }}>{totalFeitas}</b> de {lista.length} feitas
          </span>
        }
      />
      {seletorDePilar}
      {grupos.map(({ pilar, itens, feitas: feitasNoPilar }, k) => (
        <div key={pilar.id}>
          <div className="entre" style={{ margin: k === 0 ? '4px 0 10px' : '20px 0 10px' }}>
            <span className="label-mono">{t(pilar.nome)}</span>
            <span className="mut tn" style={{ fontSize: 12.5 }}>
              <b style={{ color: 'var(--ink)' }}>{feitasNoPilar}</b>/{itens.length}
            </span>
          </div>
          <div className="gauto">
            {itens.map((p) => {
              const { conquista, atual, meta, pct } = p;
              const feita = ehFeita(p);
              const quando = dataDaConquista(conquista.id);
              /* A SECRETA (até três) mostra só a dica vaga até ser feita: nome, meta e prêmio
                 ficam para a hora em que ela aparece. */
              const oculta = !!conquista.secreta && !feita;
              /* O exclusivo que a conquista entrega (no ouro, moldura ou título): a Loja não
                 vende, então é aqui que ele aparece antes de ser seu. */
              const exclusivo = conquista.recompensa.cosmetico
                ? CATALOGO_DA_LOJA.find((i) => i.id === conquista.recompensa.cosmetico)
                : null;
              const valor = feita ? meta : atual;
              const porcento = feita ? 100 : pct;
              const degrau = conquista.nivel ? BADGE_DO_NIVEL[conquista.nivel] : null;
              return (
                <article key={conquista.id} className={`cartao conq ${conquista.raridade}`}>
                  <div className="linha">
                    <IconeEmBloco
                      icone={oculta ? Lock : iconeDaConquista(conquista.id)}
                      tom={oculta ? 'accent' : TOM[conquista.raridade]}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3>{oculta ? t('Conquista secreta') : conquista.nome}</h3>
                      <p>{oculta ? conquista.dica : conquista.desc}</p>
                    </div>
                    {feita ? (
                      <span className="badge ok">
                        <Check aria-hidden /> Feita
                      </span>
                    ) : degrau ? (
                      <span className={`badge ${degrau.classe}`}>{t(degrau.rotulo)}</span>
                    ) : (
                      <Lock aria-hidden style={{ width: 15, height: 15, color: 'var(--ink-muted)' }} />
                    )}
                  </div>
                  {!oculta && (
                    <>
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
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );

  if (questNovo)
    return (
      <div className="qp-pilha" data-testid="conquistas-no-quest">
        <div className="q-abas q-seg qp-secoes" role="group" aria-label={t('Partes dos desafios')}>
          <button
            type="button"
            className="q-aba"
            aria-pressed={parteQ === 'conquistas'}
            onClick={() => setParteQ('conquistas')}
          >
            <Award aria-hidden /> {t('Conquistas')}
            <span className="n">
              {totalFeitas}/{lista.length}
            </span>
          </button>
          <button
            type="button"
            className="q-aba"
            aria-pressed={parteQ === 'ganhar'}
            onClick={() => setParteQ('ganhar')}
          >
            <Coins aria-hidden /> {t('Como ganhar')}
          </button>
          <button type="button" className="q-aba" aria-pressed={parteQ === 'nivel'} onClick={() => setParteQ('nivel')}>
            <TrendingUp aria-hidden /> {t('Como subir de nível')}
          </button>
        </div>
        {parteQ === 'conquistas' ? secaoDasConquistas : parteQ === 'ganhar' ? secaoComoGanhar : secaoDoNivel}
      </div>
    );

  return (
    <>
      {secaoComoGanhar}

      {secaoDoNivel}

      {secaoDasConquistas}
    </>
  );
}
