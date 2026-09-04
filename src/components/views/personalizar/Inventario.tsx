import { useMemo, useState } from 'react';
import { Check, Lock, Palette, Pencil, Save, ShoppingBag, Sparkles, Sprout, Trash2, Trophy, TrendingUp, Crown, Wand2 } from 'lucide-react';
import { toast } from '../../Toast';
import { comemorar } from '../../../lib/juice';
import { CATALOGO_DA_LOJA, COR_DA_RARIDADE, ORIGEM, estadoDoItem, type ItemDaLoja, type OrigemDoItem } from '../../../lib/loja';
import { estadoDaColecao } from '../../../lib/galeria/progressao';
import { equiparItem, equipavel, type ContextoDeEquipar } from '../../../lib/galeria/equipar';
import { possuidos } from '../../../lib/loja';
import { cromasDaPeca, temOCroma, cromaEquipado } from '../../../lib/galeria/cromas';
import { paletaPorId } from '../../../lib/galeria/paletas';
import type { Perfil } from '../../../lib/galeria/perfis';
import MiniaturaDoItem from '../../MiniaturaDoItem';
import EditorDoItem, { temPersonalizacao, temCroma } from './EditorDoItem';

/**
 * O INVENTÁRIO (protótipo aprovado 01/09) — a arrumação que jogos usam há vinte anos: **o que
 * está vestido no topo, o acervo no meio, o item escolhido na lateral**.
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
 * · **PERFIS viraram uma categoria** (pedido do dono, 01/09). Eram uma grade de 19 cartões
 *   soltos embaixo da tela, com layout próprio — o último pedaço de "conteúdo legado" fora do
 *   inventário. Perfil é um loadout inteiro em vez de uma peça, e é exatamente assim que jogo
 *   trata: uma aba ao lado das peças, não uma seção à parte.
 *
 * O BOTÃO "PERSONALIZAR" SÓ APARECE ONDE HÁ O QUE PERSONALIZAR (`temPersonalizacao`): oferecer o
 * editor num item sem parâmetro seria abrir uma janela vazia — a versão do controle falso que a
 * casa proíbe.
 */

/* Perfis logo depois de "Tudo": é o caminho mais curto para mudar tudo, e vem antes das peças
   pela mesma razão que um jogo põe loadouts antes do arsenal. */
const CATEGORIAS: Array<{ id: string; nome: string }> = [
  { id: 'tudo', nome: 'Tudo' },
  { id: 'perfis', nome: 'Perfis' },
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

/** As quatro cores de um perfil, quando ele aponta para uma paleta. */
function coresDoPerfil(p: Perfil): string[] | null {
  const pal = p.paleta ? paletaPorId(p.paleta) : null;
  return pal ? [pal.canvas, pal.surface, pal.accent, pal.ink] : null;
}

export default function Inventario({
  nivel, saldo, ctx, equipadoAtual, loadout, onIrParaLoja, aoMudar,
  perfis, faltaDoPerfil, aoAplicarPerfil, aoRenomearPerfil, aoApagarPerfil, aoSalvarPerfil,
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
  /** Os perfis, na ordem em que aparecem (os seus primeiro). */
  perfis: Perfil[];
  /** O que falta liberar para o perfil poder ser aplicado — vazio = dá para aplicar. */
  faltaDoPerfil: (p: Perfil) => string[];
  aoAplicarPerfil: (p: Perfil, el?: HTMLElement | null) => void;
  aoRenomearPerfil: (p: Perfil) => void;
  aoApagarPerfil: (p: Perfil) => void;
  aoSalvarPerfil: (nome: string) => void;
}) {
  const [categoria, setCategoria] = useState('tudo');
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [editando, setEditando] = useState<ItemDaLoja | null>(null);
  const [nomeNovo, setNomeNovo] = useState('');
  const [, force] = useState(0);
  const rerender = () => { force((n) => n + 1); aoMudar(); };

  const colecao = useMemo(() => estadoDaColecao(nivel, saldo), [nivel, saldo]);
  const comprados = useMemo(() => possuidos(), [colecao]); // eslint-disable-line react-hooks/exhaustive-deps -- a posse é lida junto com a coleção

  /** A origem de um item que JÁ é seu: como ele chegou até aqui. */
  const origemDe = (i: ItemDaLoja): OrigemDoItem =>
    i.exclusivoDe ? 'conquista' : comprados.has(i.id) ? 'seeds' : 'nivel';

  const emPerfis = categoria === 'perfis';
  const meus = colecao.possuidos;
  const lista = categoria === 'tudo' ? meus : meus.filter((i) => i.tipo === categoria);
  const item = escolhido ? CATALOGO_DA_LOJA.find((i) => i.id === escolhido) ?? null : lista[0] ?? null;
  const perfil = emPerfis ? (perfis.find((p) => p.id === escolhido) ?? perfis[0] ?? null) : null;

  const equipar = (i: ItemDaLoja, el?: HTMLElement | null) => {
    if (!equipavel(i)) {
      toast.ok(`${i.nome} é uma capacidade: ela já está ativa e abre opções no botão Personalizar da peça que ela destrava.`);
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
            const n = c.id === 'tudo' ? meus.length
              : c.id === 'perfis' ? perfis.length
              : meus.filter((i) => i.tipo === c.id).length;
            if (n === 0 && c.id !== 'tudo') return null;
            return (
              <button
                key={c.id}
                onClick={() => { setCategoria(c.id); setEscolhido(null); }}
                aria-pressed={categoria === c.id}
                className={`shrink-0 rounded-xl border px-3 py-2 text-start font-bold text-[12.5px] cursor-pointer flex items-center justify-between gap-2 ${
                  categoria === c.id ? 'bg-surface border-border-subtle text-ink' : 'border-transparent text-ink-muted hover:bg-surface hover:text-ink'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {c.id === 'perfis' && <Wand2 className="w-3.5 h-3.5 shrink-0" aria-hidden />}{c.nome}
                </span>
                <span className="font-mono text-[11px] text-ink-faint tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>

        {/* ── A GRADE ─────────────────────────────────────────────────────── */}
        <div>
          {emPerfis ? (
            <>
              {/* Salvar mora AQUI, e não numa barra global: guardar o visual atual é uma ação
                  sobre perfis, e é nesta categoria que ela é procurada. */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <input
                  value={nomeNovo}
                  onChange={(e) => setNomeNovo(e.target.value)}
                  placeholder="Nome para salvar o visual de agora"
                  className="flex-1 min-w-[12rem] px-3 py-2 rounded-xl bg-canvas border border-border-subtle text-[13px] text-ink outline-none focus:border-accent"
                />
                <button
                  onClick={() => { aoSalvarPerfil(nomeNovo); setNomeNovo(''); rerender(); }}
                  className="btn-solid"
                >
                  <Save className="w-4 h-4" aria-hidden /> Salvar este visual
                </button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
                {perfis.map((p) => {
                  const falta = faltaDoPerfil(p);
                  const sel = perfil?.id === p.id;
                  const cores = coresDoPerfil(p);
                  return (
                    <button
                      key={p.id}
                      onClick={() => setEscolhido(p.id)}
                      onDoubleClick={(e) => aoAplicarPerfil(p, e.currentTarget)}
                      aria-pressed={sel}
                      title={p.desc}
                      className={`aspect-square rounded-xl border-2 ${sel ? 'border-accent shadow-btn' : 'border-border-subtle'} bg-surface p-2 flex flex-col items-center justify-center gap-1.5 cursor-pointer relative transition-transform hover:-translate-y-0.5 ${falta.length ? 'opacity-80' : ''}`}
                    >
                      {falta.length > 0 && <Lock className="absolute top-1.5 right-1.5 w-3 h-3 text-ink-faint" aria-hidden />}
                      {p.proprio && <span className="absolute top-1.5 left-1.5 font-mono text-[7.5px] font-bold uppercase tracking-wider text-accent-ink">seu</span>}
                      <span className="text-[26px] leading-none" aria-hidden>{p.emoji}</span>
                      {cores && (
                        <span className="flex gap-0.5" aria-hidden>
                          {cores.map((c, i) => <span key={i} className="w-2.5 h-2.5 rounded-full border border-border-subtle" style={{ backgroundColor: c }} />)}
                        </span>
                      )}
                      <span className="text-[9.5px] font-bold text-ink-muted leading-tight text-center line-clamp-2">{p.nome}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : lista.length === 0 ? (
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
                    <MiniaturaDoItem item={i} />
                    <span className="text-[9.5px] font-bold text-ink-muted leading-tight text-center line-clamp-2">{i.nome}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── A PRÉVIA DO QUE ESTÁ ESCOLHIDO ──────────────────────────────── */}
        <div className="rounded-2xl border border-border-subtle bg-surface p-4 lg:sticky lg:top-4">
          {emPerfis ? (
            !perfil ? (
              <p className="text-[12.5px] text-ink-muted">Nenhum perfil ainda. Salve o visual de agora para criar o primeiro.</p>
            ) : (() => {
              const falta = faltaDoPerfil(perfil);
              const cores = coresDoPerfil(perfil);
              return (
                <>
                  <div className="h-28 rounded-xl border border-border-subtle bg-canvas flex flex-col items-center justify-center gap-2 mb-3" aria-hidden>
                    <span className="text-[40px] leading-none">{perfil.emoji}</span>
                    {cores && (
                      <span className="flex gap-1.5">
                        {cores.map((c, i) => <span key={i} className="w-6 h-6 rounded-full border border-border-subtle" style={{ backgroundColor: c }} />)}
                      </span>
                    )}
                  </div>
                  <h4 className="font-display font-black text-[16px] text-ink leading-tight">{perfil.nome}</h4>
                  <p className="font-mono text-[10px] uppercase tracking-wider font-bold text-ink-faint mt-1">
                    {perfil.proprio ? 'Seu' : 'Pronto'}
                  </p>
                  <p className="text-[12.5px] text-ink-muted mt-2 leading-relaxed">{perfil.desc}</p>

                  {/* Perfil troca SEIS peças de uma vez — dizer isso é o que separa "aplicar um
                      perfil" de "equipar uma peça", e o que justifica a categoria existir. */}
                  <p className="mt-3 pt-3 border-t border-border-subtle flex items-start gap-2 text-[11.5px]">
                    <Wand2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-accent-ink" aria-hidden />
                    <span>
                      <b className="text-accent-ink">Loadout</b>{' '}
                      <span className="text-ink-muted">— troca tema, fonte, partículas, emojis, cursor e rastro de uma vez</span>
                    </span>
                  </p>

                  <button
                    onClick={(e) => { aoAplicarPerfil(perfil, e.currentTarget); rerender(); }}
                    className={`w-full mt-3 py-3 rounded-xl font-display font-black text-[13px] cursor-pointer ${
                      falta.length ? 'bg-canvas border-2 border-border-subtle text-ink-muted' : 'bg-accent text-accent-contrast hover:brightness-110'
                    }`}
                  >
                    {falta.length
                      ? <span className="inline-flex items-center gap-1.5"><Lock className="w-4 h-4" aria-hidden /> Faltam peças</span>
                      : 'Aplicar'}
                  </button>

                  {falta.length > 0 && (
                    <p className="text-[11px] text-ink-faint mt-2 leading-snug">
                      Falta liberar: {falta.slice(0, 3).join(' · ')}{falta.length > 3 ? ` e mais ${falta.length - 3}` : ''}.
                    </p>
                  )}

                  {perfil.proprio && (
                    <div className="flex items-center gap-3 mt-3">
                      <button onClick={() => { aoRenomearPerfil(perfil); rerender(); }} className="text-[11.5px] text-ink-faint hover:text-ink inline-flex items-center gap-1 cursor-pointer">
                        <Pencil className="w-3 h-3" aria-hidden /> renomear
                      </button>
                      <button onClick={() => { aoApagarPerfil(perfil); setEscolhido(null); rerender(); }} className="text-[11.5px] text-ink-faint hover:text-error inline-flex items-center gap-1 cursor-pointer">
                        <Trash2 className="w-3 h-3" aria-hidden /> apagar
                      </button>
                    </div>
                  )}
                </>
              );
            })()
          ) : !item ? (
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
                  <MiniaturaDoItem item={item} tam="grande" />
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
                    Capacidade: não se veste — ela abre opções no botão Personalizar da peça que
                    ela destrava.
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
