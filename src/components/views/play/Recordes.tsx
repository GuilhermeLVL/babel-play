/**
 * MEUS RECORDES + RANKING GLOBAL — o lugar onde a gamificação "fica".
 *
 * Pontos, combos e bônus só valem alguma coisa se puderem ser REVISITADOS: esta tela mostra, por
 * jogo, o melhor placar, o combo máximo, a precisão e o volume de rodadas (do IndexedDB, via o
 * mesmo `/api/exercises/recordes` que a tela de fim de rodada usa) — e a aba de ranking global
 * (`/api/rank`) com o top da comunidade.
 *
 * O ranking morava numa Pages Function do Cloudflare contra um banco D1, e esta tela dizia "vive
 * na versão publicada" — uma versão que nunca foi publicada. Ele veio para o servidor do app em
 * 07/09, com a edição leve. O estado vazio continua existindo, mas agora ele significa o que
 * qualquer estado vazio significa: não deu para falar com o servidor agora.
 */
import { useEffect, useState } from 'react';
import { X, Zap, Target, Globe2, Medal } from 'lucide-react';
import { fetchRecordes, type RecordeDoJogo } from '../../../data/api';
import { lerRanking, lerApelido, type LinhaDoRanking } from '../../../lib/ranking';
import { eventosVistos, todosOsEventos } from '../../../lib/eventosDeJogo';
import { JOGOS } from './jogos';
import type { AgeProfileType } from '../../../lib/profile';

function tituloDoJogo(id: string, ageProfile: AgeProfileType): string {
  const j = JOGOS.find((x) => x.id === id);
  return j ? j.titulo[ageProfile] : id;
}

export default function Recordes({ ageProfile, onFechar }: { ageProfile: AgeProfileType; onFechar: () => void }) {
  const [aba, setAba] = useState<'meus' | 'global'>('meus');
  const [recordes, setRecordes] = useState<RecordeDoJogo[] | null>(null);
  const [jogoGlobal, setJogoGlobal] = useState('blitz');
  const [ranking, setRanking] = useState<LinhaDoRanking[] | null | 'carregando'>('carregando');

  useEffect(() => { void fetchRecordes().then(setRecordes); }, []);
  useEffect(() => {
    if (aba !== 'global') return;
    setRanking('carregando');
    void lerRanking(jogoGlobal).then((r) => setRanking(r));
  }, [aba, jogoGlobal]);

  const vistos = eventosVistos().length;
  const totalEventos = todosOsEventos().length;
  const apelido = lerApelido();
  const geral = (recordes ?? []).reduce((m, r) => Math.max(m, r.melhorPontos), 0);

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-label="Recordes">
      <div className="card-panel bg-surface w-full max-w-2xl max-h-[85vh] overflow-y-auto custom-scrollbar p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 font-marca font-bold text-xl text-ink">
            <Medal className="w-6 h-6 text-warn" /> Recordes
          </h2>
          <button onClick={onFechar} className="p-2 rounded-lg text-ink-muted hover:bg-surface-hover hover:text-ink cursor-pointer" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 p-1 bg-surface-hover/70 border border-border-subtle rounded-xl mb-5 w-fit">
          <button onClick={() => setAba('meus')} aria-pressed={aba === 'meus'} className={`px-4 py-1.5 rounded-lg text-[12.5px] font-bold cursor-pointer ${aba === 'meus' ? 'bg-accent text-accent-contrast' : 'text-ink-muted hover:text-ink'}`}>Meus recordes</button>
          <button onClick={() => setAba('global')} aria-pressed={aba === 'global'} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12.5px] font-bold cursor-pointer ${aba === 'global' ? 'bg-accent text-accent-contrast' : 'text-ink-muted hover:text-ink'}`}><Globe2 className="w-3.5 h-3.5" /> Ranking global</button>
        </div>

        {aba === 'meus' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="card-panel bg-canvas p-4 text-center">
                <p className="font-display font-black text-3xl text-warn-ink tabular-nums">{geral}</p>
                <p className="text-[11px] text-ink-muted mt-0.5">melhor placar geral</p>
              </div>
              <div className="card-panel bg-canvas p-4 text-center">
                <p className="font-display font-black text-3xl text-accent-ink tabular-nums">{(recordes ?? []).reduce((s, r) => s + r.rodadas, 0)}</p>
                <p className="text-[11px] text-ink-muted mt-0.5">rodadas jogadas</p>
              </div>
              <div className="card-panel bg-canvas p-4 text-center col-span-2 sm:col-span-1">
                <p className="font-display font-black text-3xl text-good tabular-nums">{vistos}/{totalEventos}</p>
                <p className="text-[11px] text-ink-muted mt-0.5">eventos raros vistos</p>
              </div>
            </div>

            {recordes === null ? (
              <div className="h-32 rounded-2xl bg-surface-hover/50 animate-pulse" aria-hidden />
            ) : recordes.length === 0 ? (
              <p className="text-[13px] text-ink-muted text-center py-8">Nenhuma rodada ainda. Jogue uma e o seu histórico nasce aqui.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-start text-[10px] uppercase tracking-wider text-ink-faint border-b border-border-subtle">
                      <th className="py-2 pe-3 font-bold">Jogo</th>
                      <th className="py-2 pe-3 font-bold text-end">Melhor</th>
                      <th className="py-2 pe-3 font-bold text-end"><span className="inline-flex items-center gap-1"><Zap className="w-3 h-3" />combo</span></th>
                      <th className="py-2 pe-3 font-bold text-end"><span className="inline-flex items-center gap-1"><Target className="w-3 h-3" />precisão</span></th>
                      <th className="py-2 font-bold text-end">rodadas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...recordes].sort((a, b) => b.melhorPontos - a.melhorPontos).map((r) => (
                      <tr key={r.exerciseKind} className="border-b border-border-subtle/50">
                        <td className="py-2.5 pe-3 font-bold text-ink">{tituloDoJogo(r.exerciseKind, ageProfile)}</td>
                        <td className="py-2.5 pe-3 text-end font-black text-warn-ink tabular-nums">{r.melhorPontos}</td>
                        <td className="py-2.5 pe-3 text-end tabular-nums text-ink">{r.melhorCombo || '-'}</td>
                        <td className="py-2.5 pe-3 text-end tabular-nums text-ink">{r.precisao != null ? `${r.precisao}%` : '-'}</td>
                        <td className="py-2.5 text-end tabular-nums text-ink-muted">{r.rodadas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {JOGOS.map((j) => (
                <button key={j.id} onClick={() => setJogoGlobal(j.id)} aria-pressed={jogoGlobal === j.id}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer border ${jogoGlobal === j.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'}`}>
                  {j.titulo[ageProfile]}
                </button>
              ))}
            </div>
            {ranking === 'carregando' ? (
              <div className="h-40 rounded-2xl bg-surface-hover/50 animate-pulse" aria-hidden />
            ) : ranking === null ? (
              <div className="text-center py-10 px-6">
                <Globe2 className="w-10 h-10 text-ink-faint mx-auto mb-3" aria-hidden />
                <p className="font-bold text-[14px] text-ink">Não deu para carregar o ranking agora.</p>
                <p className="text-[12.5px] text-ink-muted mt-1.5">O top 20 de cada jogo aparece aqui, com o seu apelido. Tente de novo em instantes.</p>
              </div>
            ) : ranking.length === 0 ? (
              <p className="text-[13px] text-ink-muted text-center py-8">Ninguém enviou pontuação neste jogo ainda. Seja a primeira pessoa do placar!</p>
            ) : (
              <ol className="space-y-1">
                {ranking.map((l, i) => (
                  <li key={l.apelido + i} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${l.apelido === apelido ? 'bg-accent-soft border border-accent/40' : i % 2 === 0 ? 'bg-canvas' : ''}`}>
                    <span className="w-7 text-center font-black tabular-nums text-ink-muted">{i < 3 ? <Medal className={`w-4 h-4 inline ${i === 0 ? 'text-warn' : i === 1 ? 'text-ink-faint' : 'text-accent'}`} /> : i + 1}</span>
                    <span className="flex-1 min-w-0 truncate font-bold text-[13px] text-ink">{l.apelido}{l.apelido === apelido && <span className="text-accent-ink"> (você)</span>}</span>
                    <span className="flex items-center gap-1 text-[12px] text-ink-muted tabular-nums"><Zap className="w-3 h-3" />{l.combo}</span>
                    <span className="font-black text-[14px] text-warn-ink tabular-nums">{l.pontos}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
