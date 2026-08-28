import { useMemo } from 'react';
import { Trophy, Sprout, Star, Lock, Check, Flame, Info } from 'lucide-react';
import {
  REGRAS, CONQUISTAS, progressoDasConquistas, levelFloor, PESOS_SEEDS,
  type ContextoDeConquistas, type ProgressoDeConquista, type RaridadeDaConquista,
} from '@core';
import { conquistasDesbloqueadas, dataDaConquista } from '../../lib/conquistasPosse';
import { CATALOGO_DA_LOJA, COR_DA_RARIDADE } from '../../lib/loja';
import { emojiDoItem } from '../../lib/galeria/progressao';
import { TEXTOS } from '../../lib/galeria/textos';
import type { DerivedProgress } from '../../lib/progress';

/**
 * CONQUISTAS & RECOMPENSAS — a tela que diz, em números, como se ganha e o que se ganha.
 *
 * O pedido do dono (2026-08-28): "deixar bem claro quantos pontos o usuário vai ganhar, como
 * ganhar, como subir de nível". Então a tabela "Como ganhar" NÃO é redigida aqui: ela é gerada
 * de `REGRAS` (core), a mesma fonte que o cálculo usa. O que está escrito é o que é creditado.
 *
 * UM componente, dois lugares: aba do Perfil (edição completa) e aba da Loja (edição leve, onde
 * o Perfil não existe). Recebe o contexto pronto do App para não montar rede aqui.
 */
interface ConquistasProps {
  progress: DerivedProgress;
  ctx: ContextoDeConquistas | null;
}

const ORDEM: RaridadeDaConquista[] = ['lendario', 'epico', 'raro', 'comum'];

function dataCurta(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function Conquistas({ progress, ctx }: ConquistasProps) {
  const feitas = conquistasDesbloqueadas();
  const lista: ProgressoDeConquista[] = useMemo(() => {
    if (!ctx) return CONQUISTAS.map((conquista) => ({ conquista, atual: 0, meta: conquista.progresso({ metricas: {} as never, nivel: 1, melhorComboPorJogo: {}, eventosVistos: 0, totalDeEventos: 1, idiomas: 0, compras: 0 }).meta, pct: 0, conquistada: false }));
    return progressoDasConquistas(ctx);
  }, [ctx]);
  // A posse local manda: uma conquista creditada continua "feita" mesmo se a métrica cair
  // (ex.: sequência de presença perdida depois do marco).
  const porRaridade = ORDEM.map((r) => ({ r, itens: lista.filter((p) => p.conquista.raridade === r) }));
  const totalFeitas = lista.filter((p) => p.conquistada || feitas.has(p.conquista.id)).length;
  const proximosNiveis = Array.from({ length: 5 }, (_, i) => progress.level + 1 + i);
  const exclusivos = useMemo(
    () => CATALOGO_DA_LOJA.filter((i) => i.exclusivoDe).map((item) => ({ item, prog: lista.find((p) => p.conquista.id === item.exclusivoDe) ?? null })),
    [lista],
  );

  return (
    <div className="space-y-8">
      {/* ── RESUMO ── */}
      <section className="card-panel bg-canvas p-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-warn/15 border border-warn text-warn-ink flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5" aria-hidden />
          </div>
          <div>
            <p className="font-display font-black text-[15px] text-ink leading-tight">{totalFeitas} de {lista.length} conquistas</p>
            <p className="text-[12px] text-ink-muted">cada uma dá Seeds e XP; as raras dão itens que a Loja não vende</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 ml-auto text-[12.5px] tabular-nums">
          <span className="flex items-center gap-1.5 text-ink"><Star className="w-3.5 h-3.5 text-warn fill-warn" aria-hidden /> nível {progress.level}</span>
          <span className="flex items-center gap-1.5 text-good-ink font-bold"><Sprout className="w-3.5 h-3.5" aria-hidden /> {progress.seeds} Seeds</span>
          {progress.streakDays > 0 && <span className="flex items-center gap-1.5 text-ink"><Flame className="w-3.5 h-3.5 text-warn" aria-hidden /> {progress.streakDays} dias seguidos</span>}
        </div>
      </section>

      {/* ── OS EXCLUSIVOS EM DESTAQUE (v3): o que SÓ vem por conquista, com a conquista que abre
          e o progresso dela. A Loja não vende; aqui é o único lugar onde eles aparecem juntos. ── */}
      {exclusivos.length > 0 && (
        <section>
          <p className="label-mono mb-2">Só por conquista</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {exclusivos.map(({ item, prog }) => {
              const feita = !!prog && (prog.conquistada || feitas.has(prog.conquista.id));
              const cor = COR_DA_RARIDADE[item.raridade];
              return (
                <div key={item.id} className={`card-panel border-2 p-4 flex flex-col gap-2 ${cor.borda} ${cor.fundo}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl" aria-hidden>{emojiDoItem(item)}</span>
                    <div className="min-w-0">
                      <p className="font-bold text-[13.5px] text-ink leading-tight truncate">{item.nome}</p>
                      <p className="text-[11px] text-warn-ink font-bold flex items-center gap-1"><Star className="w-3 h-3 fill-warn text-warn" aria-hidden /> Exclusivo</p>
                    </div>
                  </div>
                  {prog && (
                    <>
                      <p className="text-[11.5px] text-ink-muted">{feita ? <span className="text-good-ink font-bold flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {TEXTOS.liberado}</span> : TEXTOS.conquista(prog.conquista.nome)}</p>
                      {!feita && (
                        <div>
                          <div className="flex items-center justify-between text-[10.5px] mb-1 text-ink-muted tabular-nums"><span>{prog.atual} / {prog.meta}</span><span>{prog.pct}%</span></div>
                          <div className="h-1.5 rounded-full bg-canvas border border-border-subtle overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${prog.pct}%` }} /></div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── COMO GANHAR: gerado das REGRAS, nunca redigido à mão ── */}
      <section>
        <p className="label-mono mb-2">Como ganhar Seeds e XP</p>
        <div className="card-panel bg-surface overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-ink-faint border-b border-border-subtle">
                <th className="px-4 py-2.5 font-black">Ação</th>
                <th className="px-3 py-2.5 font-black text-right">XP</th>
                <th className="px-3 py-2.5 font-black text-right">Seeds</th>
                <th className="px-4 py-2.5 font-black hidden sm:table-cell">Limite</th>
              </tr>
            </thead>
            <tbody>
              {REGRAS.map((r) => (
                <tr key={r.id} className="border-b border-border-subtle/60 last:border-0">
                  <td className="px-4 py-2.5 text-ink">
                    <span className="font-semibold">{r.como}</span>
                    <span className="text-ink-faint"> · {r.unidade}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">{r.id === 'conquista' ? 'varia' : `+${r.xp}`}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-good-ink">{r.id === 'conquista' ? 'varia' : r.seeds > 0 ? `+${r.seeds}` : '—'}</td>
                  <td className="px-4 py-2.5 text-ink-faint hidden sm:table-cell">{r.teto ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="flex items-start gap-1.5 text-[11.5px] text-ink-faint mt-2 leading-snug">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          Palavras capturadas dão XP, não Seeds: Seeds vêm do que você FAZ com elas. Marcos de sequência e conquistas nunca são cobrados de volta.
        </p>
      </section>

      {/* ── A CURVA DE NÍVEL ── */}
      <section>
        <p className="label-mono mb-2">Como subir de nível</p>
        <div className="card-panel bg-surface p-4">
          <div className="flex items-center justify-between text-[12px] mb-1.5">
            <span className="font-bold text-ink">Nível {progress.level}</span>
            <span className="text-ink-muted tabular-nums">{progress.xpIntoLevel} / {progress.xpForLevel} XP</span>
          </div>
          <div className="h-2.5 rounded-full bg-canvas border border-border-subtle overflow-hidden mb-3">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress.levelPct}%` }} />
          </div>
          <div className="flex flex-wrap gap-2">
            {proximosNiveis.map((n) => (
              <span key={n} className="px-2.5 py-1 rounded-lg bg-canvas border border-border-subtle text-[11.5px] text-ink-muted tabular-nums">
                Nv. {n} aos <b className="text-ink">{levelFloor(n)}</b> XP
              </span>
            ))}
          </div>
          <p className="text-[11.5px] text-ink-faint mt-2">Cada nível custa 100 XP a mais que o anterior. Nível também dá Seeds: chegar ao 5 e ao 10 são conquistas.</p>
        </div>
      </section>

      {/* ── A GRADE ── */}
      {porRaridade.map(({ r, itens }) => itens.length > 0 && (
        <section key={r}>
          <p className="label-mono mb-2">{COR_DA_RARIDADE[r].rotulo}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {itens.map(({ conquista, atual, meta, pct, conquistada }) => {
              const feita = conquistada || feitas.has(conquista.id);
              const cor = COR_DA_RARIDADE[conquista.raridade];
              const quando = dataDaConquista(conquista.id);
              const exclusivo = conquista.recompensa.cosmetico
                ? CATALOGO_DA_LOJA.find((i) => i.id === conquista.recompensa.cosmetico)
                : null;
              return (
                <div key={conquista.id} className={`card-panel border-2 p-4 flex flex-col gap-2 ${cor.borda} ${feita ? '' : 'opacity-90'}`}>
                  <div className="flex items-start gap-3">
                    <span className={`w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${cor.fundo} ${feita ? '' : 'grayscale'}`} aria-hidden>{conquista.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-bold text-[14px] text-ink leading-tight truncate">{conquista.nome}</h3>
                        {feita
                          ? <span className="shrink-0 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-good-ink"><Check className="w-3.5 h-3.5" aria-hidden /> feita</span>
                          : <Lock className="w-3.5 h-3.5 text-ink-faint shrink-0" aria-hidden />}
                      </div>
                      <p className="text-[12px] text-ink-muted leading-snug mt-0.5">{conquista.desc}</p>
                    </div>
                  </div>
                  {/* Progresso: sempre em número, nunca só a barra. */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-ink-muted tabular-nums">{feita ? meta : atual} / {meta}</span>
                      <span className="text-ink-faint tabular-nums">{feita ? 100 : pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-canvas border border-border-subtle overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${feita ? 'bg-good' : 'bg-accent'}`} style={{ width: `${feita ? 100 : pct}%` }} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] tabular-nums">
                    <span className="flex items-center gap-1 font-bold text-good-ink"><Sprout className="w-3.5 h-3.5" aria-hidden /> +{conquista.recompensa.seeds}</span>
                    {conquista.recompensa.xp > 0 && <span className="text-ink-muted">+{conquista.recompensa.xp} XP</span>}
                    {exclusivo && (
                      <span className="flex items-center gap-1 text-warn-ink font-bold" title="Item exclusivo: a Loja não vende">
                        <Star className="w-3.5 h-3.5 fill-warn text-warn" aria-hidden /> {exclusivo.nome}
                      </span>
                    )}
                    {feita && quando && <span className="ml-auto text-ink-faint">{dataCurta(quando)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="text-center text-[11.5px] text-ink-faint pb-2">
        Presença vale {PESOS_SEEDS.presenca} Seeds por dia, e nada aqui custa dinheiro.
      </p>
    </div>
  );
}
