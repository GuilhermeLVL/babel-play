import { Check, Crown, Lock, ShoppingBag,Sprout, Trophy, X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';

import { gastarSeeds } from '../../../data/api';
import { applyCustomColors, THEME_OPTIONS, type ThemeType } from '../../../lib/appearance';
import {
type Intensidade,
intensidadeMaxima,   lerIntensidade, nivelDoAprimoramento, setIntensidade, } from '../../../lib/aprimoramentos';
import { idDeCursorDeEmoji,readCursor, setCursor } from '../../../lib/cursores';
import { type Acesso,acessoAoCursorDeEmoji, acessoAoEditorDePack, acessoAoRastroDeEmojis } from '../../../lib/galeria/acesso';
import {
  type Croma,
cromaEquipado,   cromasDaPeca, equiparCroma,
idDoCroma, marcarCroma, temOCroma, } from '../../../lib/galeria/cromas';
import { MATIZES } from '../../../lib/galeria/paletas';
import type { ItemDaLoja } from '../../../lib/loja';
import { lerPackCustom,PACK_CUSTOM, readPack, setPack, setPackCustom } from '../../../lib/particulas';
import { FORMAS_DE_RASTRO, idDeRastroDeCroma, idDeRastroDeEmojis,readRastro, setRastro } from '../../../lib/rastroDoMouse';
import { toast } from '../../Toast';
import SeletorDeEmojis from './SeletorDeEmojis';
import SeletorDePaletas from './SeletorDePaletas';

/**
 * EDITOR CONTEXTUAL DE UM ITEM (mudança inventario-e-cromas; protótipo aprovado em 01/09).
 *
 * ELE ABSORVEU O ACORDEÃO "MONTE O SEU, PEÇA POR PEÇA". Aquelas oito seções ficavam embaixo do
 * inventário e, em sete delas, ofereciam de novo o que a grade já fazia: escolher tema, fonte,
 * partícula, cursor, rastro, posição do menu. Era a mesma decisão em dois lugares com dois
 * desenhos — uma das fontes do "tudo parece mudar demais, nada parece estar ligado".
 *
 * O QUE SOBROU DELAS não era repetição, era PROFUNDIDADE: as 200 paletas, o editor do pack de
 * emojis, o cursor de qualquer emoji, o rastro de emojis escolhidos. Isso não some — muda de
 * lugar. Cada um agora abre a partir da SUA peça, que é onde a pergunta nasce: quem quer outra
 * cor de tema clica no tema; quem quer escolher os emojis do rastro clica no rastro.
 *
 * DUAS REGRAS QUE ESTE COMPONENTE MANTÉM:
 *
 * 1. **O controle é do TIPO.** Cada peça abre o que é dela, e o tipo sem parâmetro nenhum não
 *    ganha botão que abriria uma janela vazia (`temPersonalizacao`).
 * 2. **Croma custa, e a compra é explícita.** Clicar num croma trancado NUNCA gasta sozinho:
 *    confere o saldo antes, porque moeda gasta por engano é a reclamação clássica de loja de
 *    jogo. As vias que não são de Seeds (conquista e Premium) dizem de onde saem em vez de
 *    recusar seco.
 */

interface Props {
  item: ItemDaLoja;
  nivel: number;
  /** Saldo de Seeds — o editor precisa dele para saber se a compra cabe ANTES de perguntar. */
  saldo: number;
  aoFechar: () => void;
  /** Aplica a peça (o mesmo caminho único de equipar que a tela usa). */
  aoEquipar: () => void;
  /** Depois de comprar: a tela relê saldo e posse. */
  aoComprar?: () => void;
  /** Paleta aplicada = tema `custom`; quem manda no tema é a tela de fora. */
  setTheme: (t: ThemeType) => void;
  onIrParaLoja?: () => void;
}

/** Peças cuja COR varia: as três que sabem pintar o que mostram. Pack e cursor são o emoji. */
export function temCroma(item: ItemDaLoja): boolean {
  return item.tipo === 'particulas' || item.tipo === 'rastro' || item.tipo === 'tema';
}

/** O que cada tipo abre. Vazio = não há o que personalizar (e o botão nem aparece). */
export function temPersonalizacao(item: ItemDaLoja): boolean {
  return temCroma(item) || item.tipo === 'pack' || item.tipo === 'cursor';
}

/** O cadeado do acesso: diz o motivo e o caminho, nunca esconde a capacidade. */
function Cadeado({ a, onIrParaLoja }: { a: Acesso; onIrParaLoja?: () => void }) {
  if (a.liberado) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-normal normal-case tracking-normal text-ink-muted">
      <Lock className="w-3 h-3" aria-hidden /> {a.motivo}
      {a.item && onIrParaLoja && (
        <button onClick={onIrParaLoja} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-border-subtle hover:border-accent text-ink font-bold text-[11px] cursor-pointer">
          <ShoppingBag className="w-3 h-3" aria-hidden /> ver na Loja
        </button>
      )}
    </span>
  );
}

export default function EditorDoItem({ item, nivel, saldo, aoFechar, aoEquipar, aoComprar, setTheme, onIrParaLoja }: Props) {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [comprando, setComprando] = useState<string | null>(null);

  const cromas = temCroma(item) ? cromasDaPeca(item.id, item.raridade) : [];
  const equipado = cromaEquipado(item.id);
  const nivelApr = nivelDoAprimoramento('particulas');
  const packCustom = lerPackCustom();
  const cursorAtual = readCursor();
  const [emojisDoRastro, setEmojisDoRastro] = useState<string[]>(() => {
    const a = readRastro();
    return a.startsWith('emojis:') ? a.slice(7).split(',') : [];
  });
  /* A forma do rastro vive aqui porque ela é a OUTRA metade da peça: forma × cor são as duas
     escolhas que se combinam, e guardar só a cor faria trocar de croma perder a forma. */
  const [forma, setForma] = useState(() => {
    const partes = readRastro().split(':');
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
  const editorDePack = acessoAoEditorDePack(nivel, saldo);
  const cursorDeEmoji = acessoAoCursorDeEmoji(nivel, saldo);
  const rastroDeEmojis = acessoAoRastroDeEmojis(nivel, saldo);

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
        {cromas.length > 0 && (
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
        )}

        {/* ── TEMA: as 200 paletas, a profundidade que o croma não alcança ── */}
        {item.tipo === 'tema' && (
          <section className="mt-5">
            <p className="label-mono mb-2">Paletas — trocar as quatro cores, não só o acento</p>
            <SeletorDePaletas
              nivel={nivel}
              saldo={saldo}
              setTheme={setTheme}
              aoAplicar={() => { aoComprar?.(); rerender(); }}
              onIrParaLoja={onIrParaLoja}
            />
          </section>
        )}

        {/* ── PARTÍCULAS: o controle que pertence a ESTE tipo ──────────────── */}
        {item.tipo === 'particulas' && (
          <section className="mt-5">
            <p className="label-mono mb-2">Comportamento</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-ink-faint w-20">Intensidade</span>
              {(['pequena', 'media', 'grande'] as Intensidade[]).map((i) => {
                /* A intensidade JÁ existia em `aprimoramentos.ts` (grátis e reversível) e não
                   tinha onde aparecer. O TETO já era regra: `intensidadeMaxima` limita pelo nível
                   do aprimoramento — a mesma de antes, agora visível onde se quer usá-la. */
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
                    {travada && <Lock className="w-3 h-3 inline me-1" aria-hidden />}{i}
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

        {/* ── RASTRO: forma, e os emojis escolhidos um a um ────────────────── */}
        {item.tipo === 'rastro' && (
          <>
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

            <section className="mt-5">
              <p className="label-mono mb-2 flex flex-wrap items-center gap-2">
                Só estes emojis {emojisDoRastro.length ? `(${emojisDoRastro.length})` : ''}
                <Cadeado a={rastroDeEmojis} onIrParaLoja={onIrParaLoja} />
              </p>
              {rastroDeEmojis.liberado ? (
                <SeletorDeEmojis
                  nivel={nivel}
                  saldo={saldo}
                  selecionados={new Set(emojisDoRastro)}
                  onIrParaLoja={onIrParaLoja}
                  aoTocar={(e) => {
                    const nova = emojisDoRastro.includes(e) ? emojisDoRastro.filter((x) => x !== e) : [...emojisDoRastro, e];
                    setEmojisDoRastro(nova);
                    setRastro(nova.length ? idDeRastroDeEmojis(nova) : item.alvo);
                    rerender();
                  }}
                />
              ) : (
                <p className="text-[12px] text-ink-muted">Com o Rastro Emoji da Loja você escolhe exatamente quais emojis seguem o mouse.</p>
              )}
            </section>
          </>
        )}

        {/* ── PACK: montar o pack emoji a emoji ────────────────────────────── */}
        {item.tipo === 'pack' && (
          <section className="mt-5">
            <p className="label-mono mb-2 flex flex-wrap items-center gap-2">
              Meu pack {packCustom.length ? `(${packCustom.length})` : ''}
              <Cadeado a={editorDePack} onIrParaLoja={onIrParaLoja} />
              {editorDePack.liberado && packCustom.length > 0 && (
                <>
                  <button
                    onClick={() => { setPack(PACK_CUSTOM); rerender(); }}
                    aria-pressed={readPack() === PACK_CUSTOM}
                    className={`px-2 py-1 rounded-lg text-[11.5px] font-bold normal-case tracking-normal border cursor-pointer ${
                      readPack() === PACK_CUSTOM ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted'
                    }`}
                  >
                    usar o meu
                  </button>
                  <button onClick={() => { setPackCustom([]); rerender(); }} className="text-[11.5px] font-normal normal-case tracking-normal text-ink-faint hover:text-error cursor-pointer">limpar</button>
                </>
              )}
            </p>
            {editorDePack.liberado ? (
              <>
                <SeletorDeEmojis
                  nivel={nivel}
                  saldo={saldo}
                  selecionados={new Set(packCustom)}
                  onIrParaLoja={onIrParaLoja}
                  aoTocar={(e) => { const a = lerPackCustom(); setPackCustom(a.includes(e) ? a.filter((x) => x !== e) : [...a, e]); rerender(); }}
                  aoAdicionarCategoria={(emojis) => { setPackCustom([...new Set([...lerPackCustom(), ...emojis])]); rerender(); }}
                />
                {packCustom.length > 0 && <p className="text-[12px] text-ink mt-2 leading-relaxed">{packCustom.join(' ')}</p>}
                <p className="text-[11.5px] text-ink-faint mt-1">
                  Toque para incluir ou tirar. "Adicionar categoria inteira" e depois tirar um é o
                  jeito rápido de "todos menos esse".
                </p>
              </>
            ) : (
              <p className="text-[12px] text-ink-muted">Com o editor você escolhe emoji por emoji, categoria inteira, ou tira só um.</p>
            )}
          </section>
        )}

        {/* ── CURSOR: qualquer emoji do catálogo vira ponteiro ─────────────── */}
        {item.tipo === 'cursor' && (
          <section className="mt-5">
            <p className="label-mono mb-2 flex flex-wrap items-center gap-2">
              Qualquer emoji <Cadeado a={cursorDeEmoji} onIrParaLoja={onIrParaLoja} />
            </p>
            {cursorDeEmoji.liberado ? (
              <SeletorDeEmojis
                nivel={nivel}
                saldo={saldo}
                selecionados={new Set(cursorAtual.startsWith('emoji:') ? [cursorAtual.slice(6)] : [])}
                onIrParaLoja={onIrParaLoja}
                aoTocar={(e) => { setCursor(idDeCursorDeEmoji(e)); rerender(); }}
              />
            ) : (
              <p className="text-[12px] text-ink-muted">Libere e todo emoji do catálogo (das categorias abertas) vira ponteiro.</p>
            )}
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
