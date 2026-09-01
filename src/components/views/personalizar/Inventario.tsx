import { useMemo, useState } from 'react';
import { Check, Lock, Palette, Pencil, ShoppingBag, Sparkles, Sprout, Trophy, TrendingUp, Crown } from 'lucide-react';
import { toast } from '../../Toast';
import { comemorar } from '../../../lib/juice';
import { CATALOGO_DA_LOJA, COR_DA_RARIDADE, ORIGEM, estadoDoItem, type ItemDaLoja, type OrigemDoItem } from '../../../lib/loja';
import { emojiDoItem, estadoDaColecao } from '../../../lib/galeria/progressao';
import { equiparItem, equipavel, type ContextoDeEquipar } from '../../../lib/galeria/equipar';
import { possuidos } from '../../../lib/loja';
import { cromasDaPeca, temOCroma, cromaEquipado } from '../../../lib/galeria/cromas';
import EditorDoItem, { temPersonalizacao, temCroma } from './EditorDoItem';

/**
 * O INVENTÁRIO (protótipo aprovado 01/09, tarefa 3.2) — a arrumação que jogos usam há vinte
 * anos: **o que está vestido no topo, o acervo no meio, o item escolhido na lateral**.
 *
 * O QUE ISTO SUBSTITUI, e por quê:
 *
 * · A fila de chips "paleta: X · fonte: Y" dizia o que estava equipado em texto corrido. Vira um
 *   LOADOUT de caixas: a mesma informação, mas com o formato que se reconhece de relance — e
 *   cada caixa é o atalho para trocar aquela peça.
 * · Os três baldes por origem ("ganhei / comprei / conquistei") mostravam no máximo 5 nomes por
 *   caixa e escondiam o resto atrás de um "+N" que ia para a Loja. O acervo inteiro agora está
 *   na grade, e a ORIGEM virou etiqueta do item — some a caixa, fica a informação.
 * · Equipar exigia caçar a peça no acordeão certo. Aqui é um clique na grade e um botão na
 *   prévia, pelo MESMO `equiparItem` de sempre — nenhum caminho novo de equipar nasceu aqui.
 *
 * O BOTÃO "PERSONALIZAR" SÓ APARECE ONDE HÁ O QUE PERSONALIZAR (`temPersonalizacao`): oferecer o
 * editor num item sem parâmetro seria abrir uma janela vazia — a versão do controle falso que a
 * casa proíbe.
 */

const CATEGORIAS: Array<{ id: string; nome: string }> = [
  { id: 'tudo', nome: 'Tudo' },
  { id: 'tema', nome: 'Temas' },
  { id: 'particulas', nome: 'Partículas' },
  { id: 'rastro', nome: 'Rastros' },
  { id: 'cursor', nome: 'Cursores' },
  { id: 'pack', nome: 'Emojis' },
  { id: 'fonte', nome: 'Fontes' },
  { id: 'posicao', nome: 'Layout' },
  { id: 'galeria', nome: 'Capacidades' },
];

const ICONE_DA_ORIGEM: Record<OrigemDoItem, React.ReactNode> = {
  nivel: <TrendingUp className="w-3.5 h-3.5" aria-hidden />,
  seeds: <Sprout className="w-3.5 h-3.5" aria-hidden />,
  conquista: <Trophy className="w-3.5 h-3.5" aria-hidden />,
  creditos: <Crown className="w-3.5 h-3.5" aria-hidden />,
};

/**
 * A ARTE DE UM ITEM. Tema usa as PRÓPRIAS cores, não o emoji do tipo: com `emojiDoItem` dando um
 * 🎨 para todo tema, cinco temas lado a lado viravam cinco ícones idênticos — o nome embaixo era
 * a única diferença, e uma grade visual que só se lê pelo texto não é uma grade visual.
 */
function Arte({ item, grande }: { item: ItemDaLoja; grande?: boolean }) {
  if (item.previa) {
    return (
      <span className={`flex ${grande ? 'gap-1.5' : 'gap-0.5'}`} aria-hidden>
        {item.previa.map((c, i) => (
          <span key={i} className={`${grande ? 'w-7 h-7' : 'w-3.5 h-3.5'} rounded-full border border-border-subtle`} style={{ backgroundColor: c }} />
        ))}
      </span>
    );
  }
  return <span className={grande ? 'text-[46px]' : 'text-[26px] leading-none'} aria-hidden>{emojiDoItem(item)}</span>;
}

export default function Inventario({
  nivel, saldo, ctx, equipadoAtual, loadout, onIrParaLoja, aoMudar,
}: {
  nivel: number;
  saldo: number;
  ctx: ContextoDeEquipar;
  equipadoAtual: (item: ItemDaLoja) => boolean;
  /** As peças vestidas agora, na ordem em que a pessoa pensa nelas. */
  loadout: Array<{ chave: string; rotulo: string; valor: string; icone: string; categoria: string }>;
  onIrParaLoja: () => void;
  /** Avisa a tela de fora que algo foi equipado/comprado — ela relê posse e saldo. */
  aoMudar: () => void;
}) {
  const [categoria, setCategoria] = useState('tudo');
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [editando, setEditando] = useState<ItemDaLoja | null>(null);
  const [, force] = useState(0);
  const rerender = () => { force((n) => n + 1); aoMudar(); };

  const colecao = useMemo(() => estadoDaColecao(nivel, saldo), [nivel, saldo]);
  const comprados = useMemo(() => possuidos(), [colecao]); // eslint-disable-line react-hooks/exhaustive-deps -- a posse é lida junto com a coleção

  /** A origem de um item que JÁ é seu: como ele chegou até aqui. */
  const origemDe = (i: ItemDaLoja): OrigemDoItem =>
    i.exclusivoDe ? 'conquista' : comprados.has(i.id) ? 'seeds' : 'nivel';

  const meus = colecao.possuidos;
  const lista = categoria === 'tudo' ? meus : meus.filter((i) => i.tipo === categoria);
  const item = escolhido ? CATALOGO_DA_LOJA.find((i) => i.id === escolhido) ?? null : lista[0] ?? null;

  const equipar = (i: ItemDaLoja, el?: HTMLElement | null) => {
    if (!equipavel(i)) {
      toast.ok(`${i.nome} é uma capacidade: ela já está ativa e abre opções nas seções abaixo.`);
      return;
    }
    if (equiparItem(i, ctx)) {
      comemorar('acerto', el ?? null, { texto: i.nome });
      rerender();
    } else {
      const { motivo } = estadoDoItem(i, nivel, saldo);
      toast.warn(`${i.nome}: ${motivo ?? 'ainda trancado'}.`);
    }
  };

  return (
    <section className="space-y-4">
      {/* ── LOADOUT: o que está vestido agora ─────────────────────────────── */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-4">
        <p className="label-mono mb-2.5">Equipado agora</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {loadout.map((s) => (
            <button
              key={s.chave}
              onClick={() => { setCategoria(s.categoria); setEscolhido(null); }}
              title={`Trocar ${s.rotulo.toLowerCase()}`}
              className="rounded-xl border border-border-subtle bg-canvas p-2.5 text-center cursor-pointer hover:border-accent transition-colors"
            >
              <span className="block font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-faint">{s.rotulo}</span>
              <span className="block text-[19px] leading-none my-1.5" aria-hidden>{s.icone}</span>
              <span className="block text-[11px] font-bold text-ink leading-tight truncate">{s.valor}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[150px_1fr_260px] gap-4 items-start">
        {/* ── CATEGORIAS ──────────────────────────────────────────────────── */}
        <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
          {CATEGORIAS.map((c) => {
            const n = c.id === 'tudo' ? meus.length : meus.filter((i) => i.tipo === c.id).length;
            if (n === 0 && c.id !== 'tudo') return null;
            return (
              <button
                key={c.id}
                onClick={() => { setCategoria(c.id); setEscolhido(null); }}
                aria-pressed={categoria === c.id}
                className={`shrink-0 rounded-xl border px-3 py-2 text-left font-bold text-[12.5px] cursor-pointer flex items-center justify-between gap-2 ${
                  categoria === c.id ? 'bg-surface border-border-subtle text-ink' : 'border-transparent text-ink-muted hover:bg-surface hover:text-ink'
                }`}
              >
                {c.nome} <span className="font-mono text-[11px] text-ink-faint tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>

        {/* ── A GRADE DO ACERVO ───────────────────────────────────────────── */}
        <div>
          {lista.length === 0 ? (
            <p className="text-[13px] text-ink-muted py-8 text-center">
              Nada seu nesta categoria ainda.{' '}
              <button onClick={onIrParaLoja} className="underline text-accent-ink cursor-pointer">Ver o que dá para liberar</button>.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
              {lista.map((i) => {
                const eq = equipadoAtual(i);
                const sel = item?.id === i.id;
                const cor = COR_DA_RARIDADE[i.raridade];
                // O croma equipado aparece na grade: sem isso a peça personalizada some no meio
                // das iguais, e o gasto de Seeds não teria como se mostrar.
                const croma = cromaEquipado(i.id);
                return (
                  <button
                    key={i.id}
                    onClick={() => setEscolhido(i.id)}
                    onDoubleClick={(e) => equipar(i, e.currentTarget)}
                    aria-pressed={sel}
                    title={i.desc}
                    className={`aspect-square rounded-xl border-2 ${sel ? 'border-accent shadow-btn' : cor.borda} bg-surface p-2 flex flex-col items-center justify-center gap-1.5 cursor-pointer relative transition-transform hover:-translate-y-0.5`}
                  >
                    {eq && <Check className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-good" aria-hidden />}
                    {croma && <Palette className="absolute top-1.5 left-1.5 w-3 h-3 text-rare" aria-hidden />}
                    <Arte item={i} />
                    <span className="text-[9.5px] font-bold text-ink-muted leading-tight text-center line-clamp-2">{i.nome}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── A PRÉVIA DO ITEM ESCOLHIDO ──────────────────────────────────── */}
        <div className="rounded-2xl border border-border-subtle bg-surface p-4 lg:sticky lg:top-4">
          {!item ? (
            <p className="text-[12.5px] text-ink-muted">Escolha uma peça na grade para ver o que ela é.</p>
          ) : (() => {
            const cor = COR_DA_RARIDADE[item.raridade];
            const org = ORIGEM[origemDe(item)];
            const eq = equipadoAtual(item);
            // Pack e cursor entram no editor pelo conteúdo (os emojis), não pela cor: contar
            // cromas neles seria anunciar um produto que a peça não tem.
            const cromas = temCroma(item) ? cromasDaPeca(item.id, item.raridade) : [];
            const meusCromas = cromas.filter(temOCroma).length;
            return (
              <>
                <div className={`h-28 rounded-xl border ${cor.borda} ${cor.fundo} flex items-center justify-center mb-3`} aria-hidden>
                  <Arte item={item} grande />
                </div>
                <h4 className="font-display font-black text-[16px] text-ink leading-tight">{item.nome}</h4>
                <p className="font-mono text-[10px] uppercase tracking-wider font-bold text-ink-faint mt-1">{cor.rotulo}</p>
                <p className="text-[12.5px] text-ink-muted mt-2 leading-relaxed">{item.desc}</p>

                {/* A ETIQUETA DE ORIGEM — "como isto chegou até mim" é a pergunta que a coleção
                    antiga não respondia depois que o item entrava no balde único. */}
                <p className={`mt-3 pt-3 border-t border-border-subtle flex items-center gap-2 text-[11.5px] font-bold ${org.texto}`}>
                  {ICONE_DA_ORIGEM[origemDe(item)]} {org.rotulo} · <span className="font-normal text-ink-muted">{org.comoSeGanha}</span>
                </p>

                <button
                  onClick={(e) => equipar(item, e.currentTarget)}
                  disabled={eq}
                  className={`w-full mt-3 py-3 rounded-xl font-display font-black text-[13px] cursor-pointer ${
                    eq ? 'bg-good-soft text-good-ink cursor-default' : 'bg-accent text-accent-contrast hover:brightness-110'
                  }`}
                >
                  {eq ? <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4" aria-hidden /> Em uso</span>
                      : equipavel(item) ? 'Equipar' : 'Capacidade ativa'}
                </button>

                {temPersonalizacao(item) && (
                  <>
                    <button
                      onClick={() => setEditando(item)}
                      className="w-full mt-2 py-2.5 rounded-xl border-2 border-border-subtle bg-canvas text-ink font-bold text-[12.5px] cursor-pointer hover:border-accent hover:text-accent-ink"
                    >
                      <span className="inline-flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" aria-hidden /> Personalizar</span>
                    </button>
                    {cromas.length > 0 && <p className="text-[11px] text-ink-faint mt-2 leading-snug">
                      {meusCromas === 1
                        ? `1 das ${cromas.length} cores desta peça é sua.`
                        : `${meusCromas} das ${cromas.length} cores desta peça são suas.`}{' '}
                      As outras se desbloqueiam com Seeds — a peça é a mesma, muda a cor.
                    </p>}
                  </>
                )}

                {!equipavel(item) && (
                  <p className="text-[11px] text-ink-faint mt-2 leading-snug flex items-start gap-1.5">
                    <Sparkles className="w-3 h-3 mt-0.5 shrink-0" aria-hidden />
                    Capacidade: não se veste — ela abre opções nas seções de montar, logo abaixo.
                  </p>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* ── O QUE FALTA — atalho honesto: o acervo mostra o que é seu, e diz onde vê o resto ── */}
      <p className="text-[12px] text-ink-muted flex items-center gap-2 flex-wrap">
        <Lock className="w-3.5 h-3.5 text-ink-faint" aria-hidden />
        Faltam {colecao.compraveis.length + colecao.porNivel.length} peças na Loja e{' '}
        {colecao.porConquista.length} só por conquista.
        <button onClick={onIrParaLoja} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border-subtle hover:border-accent text-ink font-bold text-[11.5px] cursor-pointer">
          <ShoppingBag className="w-3.5 h-3.5" aria-hidden /> Ir à Loja
        </button>
      </p>

      {editando && (
        <EditorDoItem
          item={editando}
          nivel={nivel}
          saldo={saldo}
          setTheme={ctx.setTheme}
          onIrParaLoja={onIrParaLoja}
          aoFechar={() => { setEditando(null); rerender(); }}
          aoEquipar={() => equipar(editando)}
          aoComprar={rerender}
        />
      )}
    </section>
  );
}
