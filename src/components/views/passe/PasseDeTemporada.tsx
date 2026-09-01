import { useEffect, useMemo, useRef, useState } from 'react';
// Sprout, e não Leaf: é o ícone que TODA a aplicação usa para Seeds (FaixaDeProgresso,
// Conquistas, Loja) — um conceito, um ícone.
import { Check, Coins, Crown, Lock, Sprout, Star, Ticket } from 'lucide-react';
import { COR_DA_RARIDADE, estadoDoItem, type ItemDaLoja } from '../../../lib/loja';
import { emojiDoItem } from '../../../lib/galeria/progressao';
import { equiparItem, equipavel, type ContextoDeEquipar } from '../../../lib/galeria/equipar';
import { passeNivel, premiumDoNivel, slotsDoPasse, slotDestravado, totalPremiumEmCreditos, TEMPORADA_ATUAL, type SlotDoPasse } from '../../../lib/galeria/passe';
import { creditarSeeds } from '../../../data/api';
import { toast } from '../../Toast';
import type { DerivedProgress } from '../../../lib/progress';

/**
 * O PASSE DE TEMPORADA — a lente de 100 níveis sobre a progressão existente (spec
 * personalizar-v4, protótipo aprovado pelo dono em 31/08).
 *
 * O que esta tela NÃO faz: mudar a economia. Slot da década N destrava com nível N do app —
 * o mesmo `estadoDoItem` de sempre confere o cadeado na hora de equipar. O que ela FAZ:
 * responder "o que eu ganho a seguir?" numa trilha só, com os itens REAIS do catálogo
 * (moeda é sobra, não recheio — feedback do dono sobre o protótipo).
 *
 * Seeds de slot são crédito REAL e idempotente (`passe:t1:slot-N` via `creditarSeeds`, o
 * mesmo funil das conquistas): reabrir a tela nunca credita duas vezes — o servidor arbitra.
 */

const CHAVE_CREDITADOS = `babel.passe_${TEMPORADA_ATUAL}_creditados`;

function lerCreditados(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE_CREDITADOS) || '[]') as string[]); } catch { return new Set(); }
}
function marcarCreditado(id: string): void {
  try {
    const s = lerCreditados(); s.add(id);
    localStorage.setItem(CHAVE_CREDITADOS, JSON.stringify([...s]));
  } catch { /* sem storage: o servidor continua idempotente */ }
}

export default function PasseDeTemporada({
  progress, ctxEquipar, equipadoAtual,
}: {
  progress: DerivedProgress;
  ctxEquipar: ContextoDeEquipar;
  equipadoAtual: (item: ItemDaLoja) => boolean;
}) {
  const nivel = progress.available ? progress.level : 1;
  const pct = progress.available ? progress.levelPct : 0;
  const marcador = passeNivel(nivel, pct);
  const slots = useMemo(slotsDoPasse, []);
  // Colunas do trilho: um nível por coluna; década cheia empilha o excedente na coluna do marco.
  const colunas = useMemo(() => {
    const por = new Map<number, SlotDoPasse[]>();
    for (const x of slots) por.set(x.slot, [...(por.get(x.slot) ?? []), x]);
    return Array.from({ length: 100 }, (_, i) => {
      const nv = i + 1;
      return { nivel: nv, decada: Math.ceil(nv / 10), livres: por.get(nv) ?? [] };
    });
  }, [slots]);
  const trilhaRef = useRef<HTMLDivElement | null>(null);
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);
  // Só o que o SERVIDOR confirmou conta como creditado — o cartão nunca afirma "resgatado"
  // por conta própria (auditoria ux-v2 §2.2: o rótulo mentia antes do resultado do crédito).
  const [creditados, setCreditados] = useState<Set<string>>(lerCreditados);

  /**
   * CRÉDITO DOS SLOTS DE SEEDS destravados e ainda não resgatados. O localStorage é só um
   * amortecedor de rede (evita re-pedir a cada mount); quem garante o "uma vez só" é o
   * servidor, idempotente por creditoId — mesmo com storage limpo, nada duplica.
   */
  useEffect(() => {
    if (!progress.available) return;
    const feitos = lerCreditados();
    const pendentes = slots.filter(
      (s): s is Extract<SlotDoPasse, { tipo: 'seeds' }> =>
        s.tipo === 'seeds' && slotDestravado(s, nivel) && !feitos.has(s.creditoId),
    );
    if (pendentes.length === 0) return;
    let vivo = true;
    void (async () => {
      let total = 0;
      for (const s of pendentes) {
        const r = await creditarSeeds({ creditoId: s.creditoId, amount: s.quantidade, reason: `passe:${TEMPORADA_ATUAL}` });
        if (!r) return; // falha de rede: NÃO marca — tenta de novo na próxima visita
        marcarCreditado(s.creditoId);
        if (!r.jaExistia) total += s.quantidade;
      }
      if (vivo) setCreditados(lerCreditados());
      if (vivo && total > 0) toast.ok(`Passe: +${total} Seeds dos níveis que você já alcançou.`);
    })();
    return () => { vivo = false; };
  }, [nivel, progress.available, slots]);

  useEffect(() => {
    // Abre com o marcador à vista.
    document.getElementById(`passe-slot-${marcador}`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [marcador]);

  const aoTocar = (s: SlotDoPasse) => {
    if (!slotDestravado(s, nivel)) {
      toast.warn(`Casas ${s.decada * 10 - 9}–${s.decada * 10} do passe: chegam com o nível ${s.decada} do app. XP de estudo sobe o passe.`);
      return;
    }
    if (s.tipo === 'seeds') {
      if (lerCreditados().has(s.creditoId)) toast.ok(`Cofre da década ${s.decada}: +${s.quantidade} Seeds já creditadas na sua conta.`);
      else toast.ok(`Cofre da década ${s.decada}: +${s.quantidade} Seeds — creditando; se a rede falhar, tentamos de novo na próxima visita.`);
      return;
    }
    if (!equipavel(s.item)) { toast.ok(`${s.item.nome}: capacidade da galeria — use em Meu visual.`); return; }
    if (equiparItem(s.item, ctxEquipar)) { rerender(); toast.ok(`${s.item.nome} equipado.`); }
    else {
      const { motivo } = estadoDoItem(s.item, ctxEquipar.nivel, ctxEquipar.saldo);
      toast.warn(`${s.item.nome}: ${motivo ?? 'ainda trancado'}.`);
    }
  };

  const irPara = (decada: number) => {
    document.getElementById(`passe-slot-${(decada - 1) * 10 + 5}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  return (
    <div className="space-y-4" data-testid="passe-de-temporada">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wider text-accent-ink">
            <Ticket className="w-4 h-4" aria-hidden /> Temporada 1 · Fundação
          </p>
          <p className="text-[12.5px] text-ink-muted mt-1 max-w-[70ch]">
            100 casas com os itens reais do catálogo — a década N é o nível N do app, então nada
            destrava antes nem depois do que já destravava. Você está na <b className="text-ink">casa {marcador}</b> do passe.
          </p>
        </div>
        {/* As DUAS fileiras aparecem (decisão do dono): a Premium mostra o que devolve, mas a
            COMPRA só existe quando a moeda comprada existir no servidor (spec
            economia-de-creditos) — informação sem botão falso. */}
        <p className="text-[11px] text-ink-faint flex items-center gap-1.5 max-w-[28ch]">
          <Crown className="w-3.5 h-3.5 text-warn-ink shrink-0" aria-hidden />
          O Premium devolve {totalPremiumEmCreditos()} Créditos — a compra abre junto com a loja de créditos.
        </p>
      </div>

      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Ir para um trecho do passe">
        {Array.from({ length: 10 }, (_, d) => d + 1).map((d) => (
          <button
            key={d}
            onClick={() => irPara(d)}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${nivel === d ? 'bg-accent-soft border-accent text-accent-ink' : nivel > d ? 'border-border-subtle text-ink-muted' : 'border-border-subtle text-ink-faint'}`}
          >
            {(d - 1) * 10 + 1}–{d * 10}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="shrink-0 hidden sm:flex flex-col gap-2 pt-7 w-[74px]">
          <div className="h-[118px] card-panel flex flex-col items-center justify-center gap-1 text-[9.5px] font-black uppercase tracking-wider text-ink-muted"><Check className="w-3.5 h-3.5 text-good" aria-hidden />Grátis</div>
          <div className="h-[118px] card-panel bg-warn-soft/30 border-warn/30 flex flex-col items-center justify-center gap-1 text-[9.5px] font-black uppercase tracking-wider text-warn-ink"><Crown className="w-3.5 h-3.5" aria-hidden />Premium</div>
        </div>
        <div ref={trilhaRef} className="overflow-x-auto pb-2 flex-1 min-w-0">
          <div className="flex">
            {colunas.map((col) => {
              const aberto = nivel >= col.decada;
              const atual = col.nivel === marcador;
              const marco = col.nivel % 10 === 0;
              const prem = premiumDoNivel(col.nivel);
              return (
                <div key={col.nivel} id={`passe-slot-${col.nivel}`} className="shrink-0 w-[128px] px-1 flex flex-col gap-2">
                  <p className={`flex items-center justify-center gap-1.5 h-5 text-[10.5px] font-mono font-bold rounded-md ${atual ? 'bg-accent text-accent-contrast' : nivel > col.decada ? 'text-accent-ink' : 'text-ink-faint'}`}>
                    {col.nivel}
                    {marco && <Star className="w-3 h-3 fill-warn text-warn" aria-hidden />}
                    {atual && <span className="font-sans font-bold">· você</span>}
                  </p>

                  {/* Fileira GRÁTIS — esparsa de propósito (um Cofre por década, ux-v2 §2):
                      coluna sem recompensa grátis mostra o traço, sem cartão falso. */}
                  <div className="h-[118px] flex flex-col gap-1.5">
                    {col.livres.length === 0 && (
                      <div className="flex-1 rounded-xl border border-dashed border-border-subtle/60 flex items-center justify-center" aria-hidden>
                        <span className="text-ink-faint/50 text-[11px]">—</span>
                      </div>
                    )}
                    {col.livres.map((sl) => {
                      if (sl.tipo === 'seeds') {
                        // "creditado" só com confirmação do servidor; "disponível" é o estado
                        // honesto do meio (ux-v2 §2.2 — o rótulo antigo afirmava o resgate antes).
                        const estadoCofre = !aberto ? `nível ${sl.decada}` : creditados.has(sl.creditoId) ? 'creditado' : 'disponível';
                        return (
                          <button
                            key={sl.creditoId}
                            onClick={() => aoTocar(sl)}
                            className={`flex-1 card-panel p-2 text-left cursor-pointer min-h-0 border-2 border-good/50 ${aberto ? 'bg-good-soft/30' : 'opacity-60'}`}
                            aria-label={`Casa ${col.nivel} do passe, trilha grátis: Cofre da década ${sl.decada}, ${sl.quantidade} Seeds, ${estadoCofre}`}
                          >
                            <p className="flex items-center gap-1.5 text-[13px] font-bold text-good-ink"><Sprout className="w-4 h-4" aria-hidden /> +{sl.quantidade}</p>
                            <p className="text-[10px] font-bold text-ink leading-tight mt-0.5">Cofre da década {sl.decada}</p>
                            <p className="text-[9.5px] text-ink-faint mt-0.5">{estadoCofre}</p>
                          </button>
                        );
                      }
                      const i = sl.item;
                      const cor = COR_DA_RARIDADE[i.raridade];
                      const eq = equipadoAtual(i);
                      return (
                        <button
                          key={i.id}
                          onClick={() => aoTocar(sl)}
                          title={i.desc}
                          className={`flex-1 card-panel p-2 text-left cursor-pointer border-2 min-h-0 overflow-hidden ${cor.borda} ${aberto ? cor.fundo : 'opacity-70'}`}
                          aria-label={`Casa ${col.nivel} do passe, trilha grátis: ${i.nome}${aberto ? '' : ', bloqueado'}`}
                        >
                          <p className={`text-lg leading-none mb-1 ${aberto ? '' : 'grayscale opacity-60'}`} aria-hidden>{emojiDoItem(i)}</p>
                          <p className="text-[10.5px] font-bold text-ink leading-tight truncate">{i.nome}</p>
                          <p className="text-[9px] text-ink-faint mt-0.5 flex items-center gap-1">
                            {eq ? <span className="inline-flex items-center gap-1 text-good-ink font-bold"><Check className="w-3 h-3" aria-hidden />Equipado</span>
                              : aberto ? 'equipar'
                              : <><Lock className="w-2.5 h-2.5" aria-hidden />nível {sl.decada}</>}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Fileira PREMIUM — trancada até a loja de créditos existir; sem botão falso. */}
                  <div
                    className="h-[118px] card-panel bg-warn-soft/20 border-warn/25 p-2 flex flex-col justify-between"
                    role="img"
                    aria-label={`Casa ${col.nivel} do passe, trilha premium: ${prem.tipo === 'creditos' ? `${prem.quantidade} Créditos` : prem.nome}, disponível quando a loja de créditos abrir`}
                  >
                    {prem.tipo === 'creditos' ? (
                      <p className="flex items-center gap-1.5 text-[13px] font-bold text-warn-ink"><Coins className="w-4 h-4" aria-hidden /> +{prem.quantidade}</p>
                    ) : (
                      <div>
                        <p className="text-lg leading-none mb-1 grayscale opacity-70" aria-hidden>👑</p>
                        <p className="text-[10.5px] font-bold text-ink leading-tight">{prem.nome}</p>
                      </div>
                    )}
                    <p className="text-[9px] text-warn-ink flex items-center gap-1"><Crown className="w-2.5 h-2.5" aria-hidden />Premium</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
