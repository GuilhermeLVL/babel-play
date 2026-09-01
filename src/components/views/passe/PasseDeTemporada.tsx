import { useEffect, useMemo, useState } from 'react';
// Sprout, e não Leaf: é o ícone que TODA a aplicação usa para Seeds (FaixaDeProgresso,
// Conquistas, Loja) — um conceito, um ícone.
import { Check, Coins, Crown, Lock, Sprout, Star } from 'lucide-react';
import { COR_DA_RARIDADE, estadoDoItem, type ItemDaLoja } from '../../../lib/loja';
import { emojiDoItem } from '../../../lib/galeria/progressao';
import { equiparItem, equipavel, type ContextoDeEquipar } from '../../../lib/galeria/equipar';
import { passeNivel, premiumDoNivel, slotsDoPasse, slotDestravado, totalPremiumEmCreditos, TEMPORADA_ATUAL, type SlotDoPasse } from '../../../lib/galeria/passe';
import { creditarSeeds } from '../../../data/api';
import { toast } from '../../Toast';
import type { DerivedProgress } from '../../../lib/progress';

/**
 * O PASSE DE TEMPORADA — a lente de 100 níveis sobre a progressão existente (spec
 * personalizar-v4; redesenho do protótipo aprovado pelo dono em 01/09).
 *
 * O que esta tela NÃO faz: mudar a economia. Slot da década N destrava com nível N do app —
 * o mesmo `estadoDoItem` de sempre confere o cadeado na hora de equipar.
 *
 * O QUE MUDOU NO REDESENHO, e por quê:
 *
 * 1. **Uma década por página, não 100 colunas num trilho.** A versão anterior era uma fita
 *    horizontal de 100 casas de 128px: a pessoa arrastava às cegas e nunca via um conjunto. Passe
 *    de jogo mostra um trecho e deixa você pular entre trechos — a paginação virou o gesto, e o
 *    trilho ficou com cartões grandes o bastante para ler o nome do item.
 * 2. **O marco tem largura própria.** A casa 10 da década guarda o item mais raro (`passe.ts`) e
 *    agora parece isso: coluna mais larga, moldura dourada, estrela.
 * 3. **Estado no cartão, não na legenda.** ✓ para o que é seu, cadeado para o que falta, anel no
 *    que está ao alcance agora. Antes era preciso cruzar cor e texto miúdo para saber.
 *
 * Seeds de slot são crédito REAL e idempotente (`passe:t1:cofre-dN-K` via `creditarSeeds`, o
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
  progress, ctxEquipar, equipadoAtual, aoComprarPasse, temPasse = false,
}: {
  progress: DerivedProgress;
  ctxEquipar: ContextoDeEquipar;
  equipadoAtual: (item: ItemDaLoja) => boolean;
  /** Leva à prateleira paga. Ausente = self-host/sem conta, e aí não há o que vender. */
  aoComprarPasse?: () => void;
  /** O Premium já é seu — a fileira deixa de ser vitrine e o CTA some. */
  temPasse?: boolean;
}) {
  const nivel = progress.available ? progress.level : 1;
  const pct = progress.available ? progress.levelPct : 0;
  const marcador = passeNivel(nivel, pct);
  const slots = useMemo(slotsDoPasse, []);
  // A década do marcador é onde a pessoa quer estar quando a tela abre.
  const [pagina, setPagina] = useState(() => Math.ceil(marcador / 10));
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);
  // Só o que o SERVIDOR confirmou conta como creditado — o cartão nunca afirma "resgatado"
  // por conta própria (auditoria ux-v2 §2.2: o rótulo mentia antes do resultado do crédito).
  const [creditados, setCreditados] = useState<Set<string>>(lerCreditados);

  /** As 10 colunas da década aberta. Década cheia empilha o excedente na coluna do marco. */
  const colunas = useMemo(() => {
    const por = new Map<number, SlotDoPasse[]>();
    for (const x of slots) por.set(x.slot, [...(por.get(x.slot) ?? []), x]);
    return Array.from({ length: 10 }, (_, i) => {
      const nv = (pagina - 1) * 10 + i + 1;
      return { nivel: nv, decada: pagina, livres: por.get(nv) ?? [] };
    });
  }, [slots, pagina]);

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

  /* A PÁGINA CERTA NÃO BASTA: a década tem 10 colunas e o trilho rola. Sem isto, quem está na
     casa 59 abre a década 6 vendo a casa 51 — a informação que a pessoa veio buscar fica fora da
     tela por 900px. Só rola quando a casa atual pertence à página aberta: navegar para outra
     década é um gesto deliberado, e arrastar a tela de volta seria brigar com quem navegou. */
  useEffect(() => {
    if (Math.ceil(marcador / 10) !== pagina) return;
    document.getElementById(`passe-slot-${marcador}`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [marcador, pagina]);

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

  return (
    <div className="space-y-4" data-testid="passe-de-temporada">
      {/* ── PAGINAÇÃO POR DÉCADA — a década trancada continua visitável (ver antes de ter é
             metade da graça de um passe), só não finge que está aberta. ── */}
      <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Trechos do passe">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((d) => {
          const trancada = nivel < d;
          return (
            <button
              key={d}
              onClick={() => setPagina(d)}
              aria-current={pagina === d}
              className={`px-2.5 py-1.5 rounded-lg border font-mono font-bold text-[11.5px] cursor-pointer ${
                pagina === d
                  ? 'bg-accent border-accent text-accent-contrast'
                  : 'bg-surface border-border-subtle text-ink-muted hover:text-ink'
              } ${trancada && pagina !== d ? 'opacity-45' : ''}`}
            >
              {(d - 1) * 10 + 1}–{d * 10}
            </button>
          );
        })}
        <span className="ml-auto text-[11.5px] text-ink-muted">
          Você está na <b className="text-ink">casa {marcador}</b> de 100
        </span>
      </div>

      <div className="flex gap-3">
        {/* As duas fileiras nomeadas. Some no celular: lá o próprio cartão diz de que fileira é. */}
        <div className="shrink-0 hidden sm:flex flex-col gap-2.5 pt-[34px] w-[84px]">
          <div className="h-[168px] rounded-xl border border-border-subtle bg-surface flex flex-col items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-ink-muted text-center px-2">
            <Check className="w-4 h-4 text-good" aria-hidden />Grátis
            <span className="font-sans font-semibold normal-case tracking-normal text-[9.5px] text-ink-faint">estudando</span>
          </div>
          <div className="h-[168px] rounded-xl border border-premium/40 bg-premium-soft flex flex-col items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-premium-ink text-center px-2">
            <Crown className="w-4 h-4" aria-hidden />Premium
            <span className="font-sans font-semibold normal-case tracking-normal text-[9.5px] text-premium-ink/70">
              {temPasse ? 'seu' : 'com Créditos'}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto pb-2.5 flex-1 min-w-0 custom-scrollbar">
          <div className="flex gap-2.5 min-w-min">
            {colunas.map((col) => {
              const aberto = nivel >= col.decada;
              const atual = col.nivel === marcador;
              const marco = col.nivel % 10 === 0;
              const prem = premiumDoNivel(col.nivel);
              return (
                <div key={col.nivel} id={`passe-slot-${col.nivel}`} className={`shrink-0 flex flex-col gap-2.5 ${marco ? 'w-[152px]' : 'w-[132px]'}`}>
                  <p className={`h-[26px] flex items-center justify-center gap-1.5 rounded-lg font-mono font-bold text-[13px] ${
                    atual ? 'bg-accent text-accent-contrast' : marco ? 'text-warn-ink' : aberto ? 'text-ink-muted' : 'text-ink-faint'
                  }`}>
                    {col.nivel}
                    {marco && <Star className={`w-3.5 h-3.5 ${atual ? 'fill-current' : 'fill-warn text-warn'}`} aria-hidden />}
                    {atual && <span className="font-sans font-black text-[9px] uppercase tracking-wider">você</span>}
                  </p>

                  {/* ── FILEIRA GRÁTIS. Nenhuma casa vazia: `passe.ts` deriva cofres para o que
                         sobra, e o teste reprova o build se alguma coluna ficar sem nada. ── */}
                  <div className="h-[168px] flex flex-col gap-2">
                    {col.livres.map((sl) => {
                      const chave = sl.tipo === 'seeds' ? sl.creditoId : sl.item.id;
                      const solo = col.livres.length === 1;
                      if (sl.tipo === 'seeds') {
                        // "creditado" só com confirmação do servidor; "disponível" é o estado
                        // honesto do meio (ux-v2 §2.2 — o rótulo antigo afirmava o resgate antes).
                        const feito = creditados.has(sl.creditoId);
                        const estadoCofre = !aberto ? `nível ${sl.decada}` : feito ? 'creditado' : 'disponível';
                        return (
                          <button
                            key={chave}
                            onClick={() => aoTocar(sl)}
                            className={`flex-1 min-h-0 rounded-xl border-2 border-good/60 bg-good-soft p-2.5 flex flex-col items-center justify-center gap-1 cursor-pointer relative overflow-hidden transition-transform hover:-translate-y-0.5 ${aberto ? '' : 'opacity-40 saturate-50'}`}
                            aria-label={`Casa ${col.nivel} do passe, trilha grátis: Cofre da década ${sl.decada}, ${sl.quantidade} Seeds, ${estadoCofre}`}
                          >
                            <Selo ok={aberto && feito} trancado={!aberto} />
                            <Sprout className={`${solo ? 'w-8 h-8' : 'w-5 h-5'} text-good`} aria-hidden />
                            <b className={`font-mono font-bold text-good ${solo ? 'text-[19px]' : 'text-[14px]'}`}>+{sl.quantidade}</b>
                            <span className="text-[10px] font-bold text-ink leading-tight text-center">Cofre da década {sl.decada}</span>
                            <span className="font-mono text-[8.5px] uppercase tracking-wider font-bold text-good-ink">{estadoCofre}</span>
                          </button>
                        );
                      }
                      const i = sl.item;
                      const cor = COR_DA_RARIDADE[i.raridade];
                      const eq = equipadoAtual(i);
                      return (
                        <button
                          key={chave}
                          onClick={() => aoTocar(sl)}
                          title={i.desc}
                          className={`flex-1 min-h-0 rounded-xl border-2 ${cor.borda} ${cor.fundo} p-2.5 flex flex-col items-center justify-center gap-1 cursor-pointer relative overflow-hidden transition-transform hover:-translate-y-0.5 ${
                            aberto ? '' : 'opacity-40 saturate-50'
                          } ${atual && aberto && !eq ? 'ring-2 ring-accent ring-offset-1 ring-offset-canvas' : ''}`}
                          aria-label={`Casa ${col.nivel} do passe, trilha grátis: ${i.nome}${aberto ? '' : ', bloqueado'}${eq ? ', equipado' : ''}`}
                        >
                          <Selo ok={eq} trancado={!aberto} />
                          <span className={`${solo ? 'text-[34px]' : 'text-[20px]'} leading-none`} aria-hidden>{emojiDoItem(i)}</span>
                          <span className="text-[10.5px] font-bold text-ink leading-tight text-center line-clamp-2">{i.nome}</span>
                          <span className="font-mono text-[8.5px] uppercase tracking-wider font-bold text-ink-faint">{cor.rotulo}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* ── FILEIRA PREMIUM. Vitrine honesta: sem o passe, o cartão mostra o que vem
                         e não oferece botão de resgate que não existiria. ── */}
                  <div
                    className={`h-[168px] rounded-xl border-2 border-premium/40 bg-premium-soft p-2.5 flex flex-col items-center justify-center gap-1 relative overflow-hidden ${temPasse ? '' : 'opacity-70'}`}
                    role="img"
                    aria-label={`Casa ${col.nivel} do passe, trilha premium: ${prem.tipo === 'creditos' ? `${prem.quantidade} Créditos` : prem.nome}${temPasse ? '' : ', precisa do Passe Premium'}`}
                  >
                    {!temPasse && (
                      <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-canvas/70 flex items-center justify-center" aria-hidden>
                        <Lock className="w-3 h-3 text-ink-faint" />
                      </span>
                    )}
                    {prem.tipo === 'creditos' ? (
                      <>
                        <Coins className="w-8 h-8 text-premium" aria-hidden />
                        <b className="font-mono font-bold text-[19px] text-premium">+{prem.quantidade}</b>
                        <span className="text-[10px] font-bold text-ink">Créditos</span>
                      </>
                    ) : (
                      <>
                        <Crown className="w-8 h-8 text-premium" aria-hidden />
                        <span className="text-[10.5px] font-bold text-ink leading-tight text-center">{prem.nome}</span>
                        <span className="font-mono text-[8.5px] uppercase tracking-wider font-bold text-premium-ink">Lendário</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── O CTA. Só aparece quando há o que vender e ainda não é seu; a conta que ele faz é a
             mesma de `totalPremiumEmCreditos` — o passe devolve mais Créditos do que custa. ── */}
      {aoComprarPasse && !temPasse && (
        <div className="rounded-2xl border-2 border-premium/40 bg-premium-soft p-5 flex items-center gap-5 flex-wrap">
          <div className="flex-1 min-w-[240px]">
            <h3 className="font-display font-black text-[17px] text-ink flex items-center gap-2">
              <Crown className="w-5 h-5 text-premium" aria-hidden /> Passe Premium · Temporada 1
            </h3>
            <p className="text-[12.5px] text-ink-muted mt-1.5 max-w-[62ch] leading-relaxed">
              Abre a fileira de baixo das 100 casas: {totalPremiumEmCreditos()} Créditos ao longo da
              trilha e as 10 variantes douradas dos marcos. <b className="text-ink">Não muda nada
              do que se aprende</b> — nível, XP, Seeds e conquista continuam saindo só de estudo.
            </p>
          </div>
          <button
            onClick={aoComprarPasse}
            className="px-6 py-3 rounded-xl bg-premium text-white font-display font-black text-[14px] cursor-pointer hover:brightness-110 shadow-btn"
          >
            Ver o Passe Premium
            <small className="block font-bold text-[10.5px] opacity-85 mt-0.5">devolve mais do que custa</small>
          </button>
        </div>
      )}
    </div>
  );
}

/** O selo do canto: ✓ para o que já é seu, cadeado para o que a década ainda não abriu. */
function Selo({ ok, trancado }: { ok: boolean; trancado: boolean }) {
  if (ok) return (
    <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-good flex items-center justify-center" aria-hidden>
      <Check className="w-3 h-3 text-good-soft" />
    </span>
  );
  if (trancado) return (
    <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-canvas/70 flex items-center justify-center" aria-hidden>
      <Lock className="w-3 h-3 text-ink-faint" />
    </span>
  );
  return null;
}
