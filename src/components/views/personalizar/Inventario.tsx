import { Check, Crown, Lock, Palette, Pencil, Save, ShoppingBag, Sparkles, Sprout, Trash2, TrendingUp, Trophy, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { cromaEquipado,cromasDaPeca, temOCroma } from '../../../lib/galeria/cromas';
import { type ContextoDeEquipar,equiparItem, equipavel } from '../../../lib/galeria/equipar';
import { paletaPorId } from '../../../lib/galeria/paletas';
import type { Perfil } from '../../../lib/galeria/perfis';
import { estadoDaColecao } from '../../../lib/galeria/progressao';
import { comemorar } from '../../../lib/juice';
import { CATALOGO_DA_LOJA, COR_DA_RARIDADE, type DestinoDeObtencao, estadoDoItem, type ItemDaLoja, ORIGEM, type OrigemDoItem,rotaDeObtencao } from '../../../lib/loja';
import { possuidos } from '../../../lib/loja';
import MiniaturaDoItem from '../../MiniaturaDoItem';
import { toast } from '../../Toast';
import EditorDoItem, { temCroma,temPersonalizacao } from './EditorDoItem';

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
 * O ACERVO INTEIRO E A ROTA DE AQUISIÇÃO (08/09). O inventário respondia "o que é meu" e parava
 * ali: uma peça que ainda não fosse sua não existia nesta tela, e as de conquista e de nível não
 * existiam em tela nenhuma antes de serem obtidas — a Loja só mostra o que se compra. Agora a
 * grade tem dois estados ("meu acervo" e "tudo que existe"), a peça trancada aparece com cadeado,
 * e o cartão dela responde **como se consegue**, com o botão para a tela que entrega. O texto sai
 * de `rotaDeObtencao` e a cor de `ORIGEM`, os dois em `lib/loja.ts`, pelo mesmo motivo de sempre:
 * uma régua só. A versão anterior desta tela escrevia os quatro caminhos à mão e mostrava o ID da
 * conquista onde devia mostrar o nome.
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

/** O ícone da tela para onde a rota manda — o mesmo desenho que a tela de destino usa no menu. */
const DESTINO: Record<DestinoDeObtencao, React.ReactNode> = {
  conquistas: <Trophy className="w-3.5 h-3.5" aria-hidden />,
  loja: <ShoppingBag className="w-3.5 h-3.5" aria-hidden />,
  passe: <Sparkles className="w-3.5 h-3.5" aria-hidden />,
};

/** As quatro cores de um perfil, quando ele aponta para uma paleta. */
function coresDoPerfil(p: Perfil): string[] | null {
  const pal = p.paleta ? paletaPorId(p.paleta) : null;
  return pal ? [pal.canvas, pal.surface, pal.accent, pal.ink] : null;
}

export default function Inventario({
  nivel, saldo, ctx, equipadoAtual, loadout, onIrParaLoja, onIrParaPasse, onIrParaConquistas, aoMudar,
  perfis, faltaDoPerfil, aoAplicarPerfil, aoRenomearPerfil, aoApagarPerfil, aoSalvarPerfil,
}: {
  nivel: number;
  saldo: number;
  ctx: ContextoDeEquipar;
  equipadoAtual: (item: ItemDaLoja) => boolean;
  /** As peças vestidas agora, na ordem em que a pessoa pensa nelas. */
  loadout: Array<{ chave: string; rotulo: string; valor: string; icone: string; categoria: string }>;
  onIrParaLoja: () => void;
  /* Os outros dois destinos de uma rota de obtenção. Opcionais porque nem toda tela que monta o
     inventário tem para onde mandar — sem o callback, o cartão explica a rota e não oferece o
     botão, que é melhor do que um botão que não leva a lugar nenhum. */
  onIrParaPasse?: () => void;
  onIrParaConquistas?: () => void;
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
  /* O ACERVO INTEIRO, e não só o meu. O inventário respondia "o que é seu" muito bem e não
     respondia "o que existe" de jeito nenhum: para ver o resto era preciso ir à Loja, que só
     mostra o que se compra — os itens de conquista e os de nível não aparecem em lugar nenhum
     antes de serem seus. Com o segundo botão ligado, a grade mostra o catálogo todo, os seus
     primeiro, e o cartão de cada trancado diz a rota. `false` é o padrão porque a pergunta mais
     frequente na tela de Personalizar continua sendo "o que eu tenho". */
  const [verTudo, setVerTudo] = useState(false);
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
  const meusIds = useMemo(() => new Set(meus.map((m) => m.id)), [meus]);
  const acervo = verTudo ? CATALOGO_DA_LOJA : meus;
  const lista = useMemo(() => {
    const filtrados = categoria === 'tudo' ? acervo : acervo.filter((i) => i.tipo === categoria);
    if (!verTudo) return filtrados;
    /* Os meus na frente: quem liga o catálogo completo quer ver o que falta SEM perder de vista o
       que já tem, e uma grade em ordem de arquivo enterraria as peças próprias no meio. */
    return [...filtrados].sort((a, b) => Number(meusIds.has(b.id)) - Number(meusIds.has(a.id)));
  }, [acervo, categoria, verTudo, meusIds]);
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
            /* A contagem segue o ACERVO em exibição, não a posse: contando só o que é meu, ligar
               "catálogo completo" deixava sumidas justamente as categorias em que ainda não tenho
               nada — que são as únicas que o catálogo completo existe para mostrar. */
            const n = c.id === 'tudo' ? acervo.length
              : c.id === 'perfis' ? perfis.length
              : acervo.filter((i) => i.tipo === c.id).length;
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
          {!emPerfis && (
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div className="inline-flex p-1 rounded-xl bg-canvas border border-border-subtle">
                <button
                  onClick={() => { setVerTudo(false); setEscolhido(null); }}
                  aria-pressed={!verTudo}
                  className={`px-3 py-1 rounded-lg text-[11.5px] font-bold cursor-pointer ${
                    !verTudo ? 'bg-surface text-ink' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Meu acervo ({meus.length})
                </button>
                <button
                  onClick={() => { setVerTudo(true); setEscolhido(null); }}
                  aria-pressed={verTudo}
                  className={`px-3 py-1 rounded-lg text-[11.5px] font-bold cursor-pointer ${
                    verTudo ? 'bg-surface text-ink' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Tudo que existe ({CATALOGO_DA_LOJA.length})
                </button>
              </div>
              {verTudo && (
                <span className="text-[11px] text-ink-faint">Clique numa peça trancada para ver como se consegue.</span>
              )}
            </div>
          )}

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
            /* O "SEU" É A PALAVRA QUE IMPORTA quando os dois acervos convivem na mesma grade:
               sem ela, a mesma frase serviria para "você não tem nada aqui" e para "não existe
               nada aqui", que são notícias opostas. */
            <p className="text-[13px] text-ink-muted py-8 text-center">
              {verTudo ? 'Esta categoria ainda não tem peça nenhuma no catálogo.' : (
                <>
                  Nada seu nesta categoria ainda.{' '}
                  <button onClick={() => setVerTudo(true)} className="underline text-accent-ink cursor-pointer">Ver o que existe</button>.
                </>
              )}
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
              {lista.map((i) => {
                // A MESMA RÉGUA de sempre decide o cadeado: a grade não tem opinião própria sobre
                // o que está liberado. No acervo próprio ela responde 'equipavel' para todos.
                const liberado = estadoDoItem(i, nivel, saldo).estado === 'equipavel';
                const eq = liberado && equipadoAtual(i);
                const sel = item?.id === i.id;
                const cor = COR_DA_RARIDADE[i.raridade];
                // O croma equipado aparece na grade: sem isso a peça personalizada some no meio
                // das iguais, e o gasto de Seeds não teria como se mostrar.
                const croma = cromaEquipado(i.id);
                return (
                  <button
                    key={i.id}
                    onClick={() => setEscolhido(i.id)}
                    onDoubleClick={(e) => { if (liberado) equipar(i, e.currentTarget); }}
                    aria-pressed={sel}
                    title={liberado ? i.desc : `${i.nome} — trancado; clique para ver como se consegue`}
                    className={`aspect-square rounded-xl border-2 ${sel ? 'border-accent shadow-btn' : cor.borda} bg-surface p-2 flex flex-col items-center justify-center gap-1.5 cursor-pointer relative transition-transform hover:-translate-y-0.5 ${liberado ? '' : 'opacity-60'}`}
                  >
                    {eq && <Check className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-good" aria-hidden />}
                    {!liberado && <Lock className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-ink-faint" aria-hidden />}
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
            const liberado = estadoDoItem(item, nivel, saldo).estado === 'equipavel';
            const eq = liberado && equipadoAtual(item);
            // Pack e cursor entram no editor pelo conteúdo (os emojis), não pela cor: contar
            // cromas neles seria anunciar um produto que a peça não tem.
            const cromas = temCroma(item) ? cromasDaPeca(item.id, item.raridade) : [];
            const meusCromas = cromas.filter(temOCroma).length;
            return (
              <>
                <div className={`relative h-28 rounded-xl border ${cor.borda} ${cor.fundo} flex items-center justify-center mb-3`} aria-hidden>
                  {!liberado && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-canvas border border-border-subtle text-ink-faint text-[10px] font-bold inline-flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Trancado
                    </span>
                  )}
                  <MiniaturaDoItem item={item} tam="grande" />
                </div>
                <h4 className="font-display font-black text-[16px] text-ink leading-tight">{item.nome}</h4>
                <p className="font-mono text-[10px] uppercase tracking-wider font-bold text-ink-faint mt-1">{cor.rotulo}</p>
                <p className="text-[12.5px] text-ink-muted mt-2 leading-relaxed">{item.desc}</p>

                {liberado ? (
                  <>
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
                ) : (() => {
                  /* A ROTA DE AQUISIÇÃO — a pergunta que a tela nunca respondia. Até aqui, uma peça
                     que não era sua simplesmente não aparecia no inventário; agora aparece, e o
                     cartão diz o canal, o que falta e para onde ir. O texto e a cor saem de
                     `rotaDeObtencao`/`ORIGEM` (lib/loja.ts): a tela não tem régua própria. */
                  const rota = rotaDeObtencao(item, saldo);
                  const cores = ORIGEM[rota.origem];
                  const irPara = rota.destino === 'conquistas' ? onIrParaConquistas
                    : rota.destino === 'passe' ? onIrParaPasse
                    : onIrParaLoja;
                  return (
                    <div className={`mt-3 rounded-xl border ${cores.borda} ${cores.fundo} p-3`}>
                      <p className={`text-[11px] font-bold flex items-center gap-1.5 mb-1 ${cores.texto}`}>
                        {ICONE_DA_ORIGEM[rota.origem]} {rota.titulo}
                      </p>
                      <p className="text-[11.5px] text-ink-muted leading-relaxed">{rota.texto}</p>
                      {irPara && (
                        <button
                          onClick={irPara}
                          className="w-full mt-2.5 py-2 rounded-lg border border-border-subtle bg-canvas text-ink font-bold text-[12px] cursor-pointer hover:border-accent hover:text-accent-ink inline-flex items-center justify-center gap-1.5"
                        >
                          {DESTINO[rota.destino]} {rota.rotuloDoBotao}
                        </button>
                      )}
                    </div>
                  );
                })()}
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
