import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Lock, Sprout, Trophy, Crown } from 'lucide-react';
import { toast } from '../../Toast';
import { gastarSeeds } from '../../../data/api';
import {
  cromasDaPeca, temOCroma, idDoCroma, marcarCroma, cromaEquipado, equiparCroma,
  type Croma,
} from '../../../lib/galeria/cromas';
import {
  lerIntensidade, setIntensidade, intensidadeMaxima, nivelDoAprimoramento, type Intensidade,
} from '../../../lib/aprimoramentos';
import { FORMAS_DE_RASTRO, setRastro, readRastro, idDeRastroDeCroma } from '../../../lib/rastroDoMouse';
import { MATIZES } from '../../../lib/galeria/paletas';
import { applyCustomColors, THEME_OPTIONS } from '../../../lib/appearance';
import type { ItemDaLoja } from '../../../lib/loja';

/**
 * EDITOR CONTEXTUAL DE UM ITEM (mudança inventario-e-cromas; protótipo aprovado em 01/09).
 *
 * DUAS COISAS QUE ESTE COMPONENTE RESOLVE:
 *
 * 1. **O controle é do TIPO, não genérico.** Cor não era a única coisa ajustável e o editor antigo
 *    só sabia trocar a peça inteira. Partícula tem intensidade; rastro tem forma. Um slider de
 *    "quantidade de partículas" num cursor seria ruído, então cada tipo abre o que é dele — e o
 *    tipo que não tem nada a ajustar não ganha um botão que abriria um editor vazio.
 *
 * 2. **Croma custa, e a compra é explícita.** Clicar num croma trancado NUNCA gasta sozinho:
 *    pergunta antes, porque moeda gasta por engano é a reclamação clássica de loja de jogo. As
 *    vias que não são de Seeds (conquista e Premium) dizem de onde saem em vez de recusar seco.
 */

interface Props {
  item: ItemDaLoja;
  /** Saldo de Seeds — o editor precisa dele para saber se a compra cabe ANTES de perguntar. */
  saldo: number;
  aoFechar: () => void;
  /** Aplica a peça (o mesmo caminho único de equipar que a tela usa). */
  aoEquipar: () => void;
  /** Depois de comprar: a tela relê saldo e posse. */
  aoComprar?: () => void;
}

/** O que cada tipo de item abre. Vazio = não há o que personalizar (e o botão nem aparece). */
export function temPersonalizacao(item: ItemDaLoja): boolean {
  return item.tipo === 'particulas' || item.tipo === 'rastro' || item.tipo === 'tema';
}

export default function EditorDoItem({ item, saldo, aoFechar, aoEquipar, aoComprar }: Props) {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [comprando, setComprando] = useState<string | null>(null);

  const cromas = cromasDaPeca(item.id, item.raridade);
  const equipado = cromaEquipado(item.id);
  const nivelApr = nivelDoAprimoramento('particulas');
  /* A forma do rastro vive aqui porque ela é a OUTRA metade da peça: forma × cor são as duas
     escolhas que se combinam, e guardar só a cor faria trocar de croma perder a forma. */
  const [forma, setForma] = useState(() => {
    const atual = readRastro();
    const partes = atual.split(':');
    return partes.length === 3 && (partes[0] === 'croma' || partes[0] === 'gen') ? partes[1]
      : FORMAS_DE_RASTRO.some((f) => f.id === item.alvo) ? item.alvo
      : FORMAS_DE_RASTRO[0].id;
  });

  /**
   * O CROMA PRECISA APARECER. Comprar uma cor e não ver nada mudar seria o pior tipo de controle
   * falso — o que cobra. Cada tipo tem o seu caminho de aplicação, e são todos caminhos que já
   * existiam:
   *
   * · PARTÍCULAS: `ParticleCanvas` lê `corDoCromaEquipado('part-<skin>')` na hora do burst. Nada
   *   a fazer aqui: equipar o croma já basta.
   * · RASTRO: o id `croma:<forma>:<matiz>` que `estiloDeRastro` passou a resolver.
   * · TEMA: as cores do PRÓPRIO tema com o acento no matiz do croma. Não vira uma paleta da
   *   galeria de propósito — paleta troca as quatro cores e tem porta própria por estilo; croma
   *   de tema troca só o acento, que é o que "o mesmo tema em outra cor" quer dizer.
   */
  const aplicarCroma = (matiz: string | null, formaAlvo = forma) => {
    if (item.tipo === 'rastro') {
      setRastro(matiz ? idDeRastroDeCroma(formaAlvo, matiz) : item.alvo);
      return;
    }
    if (item.tipo === 'tema') {
      const base = THEME_OPTIONS.find((t) => t.id === item.alvo);
      const m = matiz ? MATIZES.find((x) => x.id === matiz) : null;
      if (!base) return;
      if (!m) { aoEquipar(); return; } // sem croma: volta ao tema de fábrica, pelo caminho único
      applyCustomColors({ canvas: base.swatches.canvas, surface: base.swatches.surface, ink: base.swatches.ink, accent: `hsl(${m.h} 72% 52%)` });
    }
  };

  /**
   * A COMPRA DE UM CROMA. Mesmo funil de `gastarSeeds` da Loja — idempotente por `spendId`, então
   * o duplo clique não cobra duas vezes. A posse local só é marcada DEPOIS do servidor aceitar.
   */
  const comprarCroma = async (c: Croma) => {
    if (c.via === 'conquista') { toast.ok(`${c.nome}: sai de conquista — não está à venda.`); return; }
    if (c.via === 'premium') { toast.ok(`${c.nome}: vem no Passe Premium, não com Seeds.`); return; }
    if (c.via !== 'seeds' || !c.preco) return;
    if (saldo < c.preco) {
      toast.warn(`Faltam ${c.preco - saldo} Seeds. Elas vêm de estudar: revisar, jogar, aparecer.`);
      return;
    }
    const id = idDoCroma(item.id, c.matiz);
    setComprando(c.matiz);
    try {
      const r = await gastarSeeds({ spendId: id, amount: c.preco, reason: id });
      if (r && (r as { ok?: boolean }).ok === false) { toast.warn('Não deu para desbloquear agora.'); return; }
      marcarCroma(id);
      equiparCroma(item.id, c.matiz);
      aplicarCroma(c.matiz);
      toast.ok(`${c.nome} desbloqueado e equipado.`);
      aoComprar?.();
      rerender();
    } catch {
      toast.warn('Não deu para desbloquear agora. Tente de novo.');
    } finally {
      setComprando(null);
    }
  };

  const escolher = (c: Croma) => {
    if (temOCroma(c)) {
      // Trocar de croma é grátis e reversível — clicar no equipado tira, como um interruptor.
      const proximo = equipado === c.matiz ? null : c.matiz;
      equiparCroma(item.id, proximo);
      aplicarCroma(proximo);
      rerender();
      return;
    }
    void comprarCroma(c);
  };

  const selo = (c: Croma) => {
    if (temOCroma(c)) return <Check className="w-3 h-3 text-good" aria-hidden />;
    if (c.via === 'conquista') return <Trophy className="w-3 h-3 text-warn" aria-hidden />;
    if (c.via === 'premium') return <Crown className="w-3 h-3 text-premium" aria-hidden />;
    return <span className="flex items-center gap-0.5 text-[9px] font-bold text-good"><Sprout className="w-2.5 h-2.5" aria-hidden />{c.preco}</span>;
  };

  const meus = cromas.filter(temOCroma).length;

  /* PORTAL PARA O BODY, como `RecompensaDesbloqueada` já fazia. Dentro da árvore da Loja o
     `fixed inset-0` caía num bloco de contenção e o véu esticava a altura INTEIRA do documento,
     com o cartão centralizado no meio do nada — visível no DOM, invisível na tela. */
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-canvas/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      role="dialog" aria-modal="true" aria-label={`Personalizar ${item.nome}`}
      onClick={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="card-panel bg-surface w-full max-w-2xl max-h-[88vh] overflow-y-auto custom-scrollbar p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display font-black text-lg text-ink">{item.nome}</h3>
            <p className="text-[12.5px] text-ink-muted mt-0.5 max-w-[52ch]">{item.desc}</p>
          </div>
          <button onClick={aoFechar} aria-label="Fechar" className="btn-outline shrink-0 !px-2 !py-2">
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        {/* ── CROMAS ─────────────────────────────────────────────────────── */}
        <section className="mt-5">
          <p className="label-mono mb-2">
            Cromas — a peça vem com uma cor; as outras você desbloqueia
            <span className="text-ink-faint"> ({meus} de {cromas.length} seus)</span>
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-9 gap-2">
            {cromas.map((c) => {
              const tem = temOCroma(c);
              const ativo = equipado === c.matiz || (!equipado && c.via === 'incluso');
              return (
                <button
                  key={c.matiz}
                  onClick={() => escolher(c)}
                  disabled={comprando === c.matiz}
                  title={tem ? c.nome : c.via === 'seeds' ? `${c.nome} · ${c.preco} Seeds` : `${c.nome} · ${c.via === 'premium' ? 'Passe Premium' : 'conquista'}`}
                  aria-pressed={ativo}
                  className={`rounded-xl border-2 p-1.5 cursor-pointer flex flex-col items-center gap-1 transition-colors ${
                    ativo ? 'border-accent bg-accent-soft' : 'border-border-subtle hover:border-accent/60'
                  } ${tem ? '' : 'opacity-90'}`}
                >
                  {/* A COR TRANCADA APARECE INTEIRA. Dessaturar o bloqueado escondia justamente o
                      que se está vendendo — trinta quadrados cinzas idênticos, impossível dizer
                      turquesa de ciano. O que marca o bloqueio é o preço no selo, não apagar a
                      cor: em loja de croma, ver o que falta É o argumento. */}
                  <span className="w-full h-7 rounded-md" style={{ background: `hsl(${c.h} 78% 62%)` }} aria-hidden />
                  <span className="text-[8.5px] font-bold text-ink-muted leading-none truncate w-full text-center">{c.nome}</span>
                  <span className="h-3 flex items-center">{selo(c)}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── COMPORTAMENTO: o controle que pertence a ESTE tipo ───────────── */}
        {item.tipo === 'particulas' && (
          <section className="mt-5">
            <p className="label-mono mb-2">Comportamento</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-ink-faint w-20">Intensidade</span>
              {(['pequena', 'media', 'grande'] as Intensidade[]).map((i) => {
                /* A intensidade JÁ existia em `aprimoramentos.ts` (grátis e reversível) e não
                   tinha onde aparecer. "Grande" exige o Nv.2 do aprimoramento — é a mesma regra
                   de antes, agora visível no lugar onde a pessoa quer usá-la. */
                // O TETO já era regra: `intensidadeMaxima` limita pelo nível do aprimoramento.
                const travada = i === 'grande' && intensidadeMaxima(nivelApr) !== 'grande';
                const atual = lerIntensidade() === i;
                return (
                  <button
                    key={i}
                    onClick={() => { if (travada) { toast.warn('A intensidade grande abre no Nv.2 de Explosão de Partículas.'); return; } setIntensidade(i); rerender(); }}
                    aria-pressed={atual}
                    className={`px-3 py-1.5 rounded-lg border text-[12px] font-bold cursor-pointer ${
                      atual ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'
                    } ${travada ? 'opacity-60' : ''}`}
                  >
                    {travada && <Lock className="w-3 h-3 inline mr-1" aria-hidden />}{i}
                  </button>
                );
              })}
            </div>
            <p className="text-[11.5px] text-ink-muted mt-2">
              Quantas partículas e de que tamanho. Nível {nivelApr} de 3 do aprimoramento —
              cada nível aumenta o teto.
            </p>
          </section>
        )}

        {item.tipo === 'rastro' && (
          <section className="mt-5">
            <p className="label-mono mb-2">Forma — a outra metade da peça</p>
            <div className="flex flex-wrap gap-2">
              {FORMAS_DE_RASTRO.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setForma(f.id);
                    aplicarCroma(equipado, f.id);
                    toast.ok(`Rastro ${f.nome} aplicado.`);
                    rerender();
                  }}
                  aria-pressed={forma === f.id}
                  className={`px-3 py-1.5 rounded-lg border text-[12px] font-bold cursor-pointer ${
                    forma === f.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'
                  }`}
                >
                  {f.nome}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] text-ink-muted mt-2">
              Forma e cor se combinam: {FORMAS_DE_RASTRO.length} formas × {cromas.length} cores
              nesta peça. Sem croma, o rastro sai nas cores do tema.
            </p>
          </section>
        )}

        <div className="flex flex-wrap gap-2 mt-6">
          <button onClick={() => { aoEquipar(); aoFechar(); }} className="btn-solid flex-1 min-w-[160px] justify-center">
            <Check className="w-4 h-4" aria-hidden /> Aplicar e equipar
          </button>
          <button onClick={aoFechar} className="btn-outline">Sair sem salvar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
