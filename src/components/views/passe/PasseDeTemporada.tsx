import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crown, Leaf, Lock, Star, Ticket } from 'lucide-react';
import { COR_DA_RARIDADE, estadoDoItem, type ItemDaLoja } from '../../../lib/loja';
import { emojiDoItem } from '../../../lib/galeria/progressao';
import { equiparItem, equipavel, type ContextoDeEquipar } from '../../../lib/galeria/equipar';
import { passeNivel, slotsDoPasse, slotDestravado, TEMPORADA_ATUAL, type SlotDoPasse } from '../../../lib/galeria/passe';
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
  const trilhaRef = useRef<HTMLDivElement | null>(null);
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);

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
      toast.warn(`Nível ${s.decada * 10 - 9}–${s.decada * 10} do passe: chega com o nível ${s.decada} do app. XP de estudo sobe o passe.`);
      return;
    }
    if (s.tipo === 'seeds') {
      toast.ok(`+${s.quantidade} Seeds — já creditadas quando você alcançou este trecho.`);
      return;
    }
    if (!equipavel(s.item)) { toast.ok(`${s.item.nome}: capacidade da galeria — use em Biblioteca.`); return; }
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
            100 níveis com os itens reais do catálogo — a década N é o nível N do app, então nada
            destrava antes nem depois do que já destravava. Você está no <b className="text-ink">nível {marcador}</b> do passe.
          </p>
        </div>
        {/* A fileira Premium existe no desenho aprovado, mas moeda comprada exige o inventário
            no servidor (spec economia-de-creditos) — até lá, nenhum botão falso aqui. */}
        <p className="text-[11px] text-ink-faint flex items-center gap-1.5"><Crown className="w-3.5 h-3.5" aria-hidden /> Trilha Grátis — completa para todo mundo</p>
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

      <div ref={trilhaRef} className="overflow-x-auto pb-2 -mx-1 px-1">
        <div className="flex gap-2">
          {slots.map((s) => {
            const aberto = slotDestravado(s, nivel);
            const atual = s.slot === marcador;
            const marco = s.slot % 10 === 0;
            if (s.tipo === 'seeds') {
              return (
                <button
                  key={`s-${s.slot}-seeds`}
                  id={`passe-slot-${s.slot}`}
                  onClick={() => aoTocar(s)}
                  className={`shrink-0 w-[104px] card-panel border-dashed p-2.5 text-left cursor-pointer ${atual ? 'border-accent' : ''} ${aberto ? '' : 'opacity-60'}`}
                  aria-label={`Nível ${s.slot} do passe: ${s.quantidade} Seeds${aberto ? ', resgatadas' : ', bloqueado'}`}
                >
                  <p className="text-[10px] font-mono font-bold text-ink-faint mb-1.5">{s.slot}</p>
                  <p className="flex items-center gap-1.5 text-[13px] font-bold text-good-ink"><Leaf className="w-4 h-4" aria-hidden /> +{s.quantidade}</p>
                  <p className="text-[10px] text-ink-faint mt-1">{aberto ? <span className="inline-flex items-center gap-1"><Check className="w-3 h-3 text-good" aria-hidden /> resgatado</span> : <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" aria-hidden /> nível {s.decada}</span>}</p>
                </button>
              );
            }
            const i = s.item;
            const cor = COR_DA_RARIDADE[i.raridade];
            const eq = equipadoAtual(i);
            return (
              <button
                key={`s-${s.slot}-${i.id}`}
                id={`passe-slot-${s.slot}`}
                onClick={() => aoTocar(s)}
                title={i.desc}
                className={`shrink-0 w-[124px] card-panel p-2.5 text-left cursor-pointer border-2 ${cor.borda} ${aberto ? cor.fundo : 'opacity-70'} ${atual ? 'ring-2 ring-accent' : ''}`}
                aria-label={`Nível ${s.slot} do passe: ${i.nome}${aberto ? '' : ', bloqueado'}`}
              >
                <p className="flex items-center justify-between text-[10px] font-mono font-bold text-ink-faint mb-1.5">
                  <span>{s.slot}</span>
                  {marco && <Star className="w-3 h-3 fill-warn text-warn" aria-hidden />}
                </p>
                <p className={`text-2xl leading-none mb-1.5 ${aberto ? '' : 'grayscale opacity-60'}`} aria-hidden>{emojiDoItem(i)}</p>
                <p className="text-[11.5px] font-bold text-ink leading-tight">{i.nome}</p>
                <p className="text-[10px] text-ink-faint mt-1">
                  {eq
                    ? <span className="inline-flex items-center gap-1 text-good-ink font-bold"><Check className="w-3 h-3" aria-hidden /> Equipado</span>
                    : aberto
                    ? 'Seu — equipar'
                    : <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" aria-hidden /> nível {s.decada}{i.precoSeeds !== undefined ? ` · ${i.precoSeeds} na Loja` : ''}</span>}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
