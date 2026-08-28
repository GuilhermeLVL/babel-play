import { useMemo, useState } from 'react';
import { Check, Palette, Sparkles, MousePointer2, Wind, Save, Trash2, Search, Wand2, Type, Lock, ChevronDown, ShoppingBag, Sprout } from 'lucide-react';
import { toast } from '../Toast';
import { comemorar, explodirAleatorio } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';
import { gastarSeeds } from '../../data/api';
import { marcarPosse } from '../../lib/loja';
import { todasAsPaletas, buscarPaletas, paletaPorId, ESTILOS, type EstiloDePaleta, type Paleta } from '../../lib/galeria/paletas';
import { CATEGORIAS_DE_EMOJI, todosOsEmojis } from '../../lib/galeria/emojis';
import { PRESETS, perfisSalvos, salvarPerfil, apagarPerfil, type Perfil } from '../../lib/galeria/perfis';
import {
  acessoAoEstilo, acessoACategoria, acessoAFormaDeRastro, acessoAoEditorDePack, acessoAoCursorDeEmoji, acessoAoRastroDeEmojis,
  faltaParaOPerfil, type Acesso,
} from '../../lib/galeria/acesso';
import { PARTICULAS_OPTIONS, PACKS_DE_EMOJI, PACK_CUSTOM, readParticulas, setParticulas, readPack, setPack, setPackCustom, lerPackCustom, type ParticulasType } from '../../lib/particulas';
import { CURSORES, readCursor, setCursor, idDeCursorDeEmoji, emojiDoCursor } from '../../lib/cursores';
import { FORMAS_DE_RASTRO, RASTROS, readRastro, setRastro, estiloDeRastro, idDeRastroGerado, idDeRastroDeEmojis } from '../../lib/rastroDoMouse';
import { applyCustomColors, FONTE_OPTIONS, THEME_OPTIONS, type ThemeType, type FonteType } from '../../lib/appearance';
import { desbloqueado, nivelNecessario } from '../../lib/desbloqueios';
import { CATALOGO_DA_LOJA } from '../../lib/loja';
import { acessoAoItem } from '../../lib/galeria/acesso';
import type { AgeProfileType, MenuPositionType } from '../shell/navItems';
import { Gamepad2, Zap, Eye, PanelTop, PanelLeft, PanelRight, PanelBottom, Monitor, SlidersHorizontal } from 'lucide-react';

/**
 * PERSONALIZAR — presets completos e o editor "Monte o seu", NA MESMA RÉGUA DA LOJA.
 *
 * Duas coisas mudaram na 2ª versão (pedido do dono, 2026-08-28):
 *  1. ACESSO. Cada capacidade (estilo de paleta, categoria de emoji, editor de pack, cursor de
 *     emoji, forma de rastro) é um item da Loja e abre por nível OU Seeds OU conquista
 *     (`lib/galeria/acesso.ts`). O editor nunca esconde: mostra o cadeado, o motivo e o botão de
 *     obter — editar com o que se tem, e ver o que vem depois.
 *  2. SIMPLICIDADE. Um resumo "Seu visual agora" no topo; UMA seção aberta por vez (acordeão);
 *     um seletor de emojis só (`SeletorDeEmojis`) reaproveitado por pack, cursor e rastro.
 */
interface PersonalizarProps {
  theme: ThemeType;
  setTheme: (t: ThemeType) => void;
  fonte: FonteType;
  setFonte: (f: FonteType) => void;
  nivel: number;
  saldo: number;
  onIrParaLoja: () => void;
  /* CENTRALIZAÇÃO (2026-08-28): perfil de exibição, posição do menu e o Estúdio também moram
     aqui agora — eram editados em Ajustes, no cluster e na Loja. */
  ageProfile: AgeProfileType;
  setAgeProfile: (p: AgeProfileType) => void;
  menuPosition: MenuPositionType;
  setMenuPosition: (p: MenuPositionType) => void;
  onOpenStudio: () => void;
}

type Secao = 'tema' | 'paleta' | 'fonte' | 'particulas' | 'emojis' | 'cursor' | 'rastro' | 'tela';

export default function Personalizar({ theme, setTheme, fonte, setFonte, nivel, saldo, onIrParaLoja, ageProfile, setAgeProfile, menuPosition, setMenuPosition, onOpenStudio }: PersonalizarProps) {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [aberta, setAberta] = useState<Secao | null>(null);
  const [busca, setBusca] = useState('');
  const [estilo, setEstilo] = useState<EstiloDePaleta | 'todos'>('todos');
  const [nomeDoPerfil, setNomeDoPerfil] = useState('');
  const [comprando, setComprando] = useState<string | null>(null);
  const [gastasAqui, setGastasAqui] = useState(0);
  const saldoAgora = Math.max(0, saldo - gastasAqui);
  const [paletaAtiva, setPaletaAtiva] = useState<string | null>(() => { try { return localStorage.getItem('babel.paleta_ativa'); } catch { return null; } });
  const [emojisDoRastro, setEmojisDoRastro] = useState<string[]>(() => { const a = readRastro(); return a.startsWith('emojis:') ? a.slice(7).split(',') : []; });

  const paletas = useMemo(() => buscarPaletas(busca, estilo), [busca, estilo]);
  const packCustom = lerPackCustom();
  const rastroAtual = readRastro();
  const cursorAtual = readCursor();
  const estiloDaPaleta = (id: string) => paletaPorId(id)?.estilo;
  const ctxAcesso = { nivel, saldo: saldoAgora, estiloDaPaleta, categorias: CATEGORIAS_DE_EMOJI };

  /** Compra um item de capacidade da galeria (mesmo `spendId` idempotente da Loja). */
  const obter = async (a: Acesso) => {
    if (!a.item?.precoSeeds || !a.compravel) return;
    setComprando(a.item.id);
    try {
      const r = await gastarSeeds({ spendId: `loja-${a.item.id}`, amount: a.item.precoSeeds, reason: `loja:${a.item.id}` });
      if (!r) { toast.warn('Não deu para obter agora. Tente de novo.'); return; }
      marcarPosse(a.item.id);
      if (!r.jaExistia) setGastasAqui((g) => g + a.item!.precoSeeds!);
      explodirAleatorio(2, 'confete');
      toast.ok(`${a.item.nome} liberado!`);
      rerender();
    } finally { setComprando(null); }
  };

  const aplicarPaleta = (p: Paleta, el?: HTMLElement | null) => {
    applyCustomColors({ canvas: p.canvas, surface: p.surface, ink: p.ink, accent: p.accent });
    setTheme('custom');
    try { localStorage.setItem('babel.paleta_ativa', p.id); } catch { /* sem storage */ }
    setPaletaAtiva(p.id);
    if (el) comemorar('acerto', el, { texto: p.nome });
    rerender();
  };

  const aplicarPerfil = (p: Perfil, el?: HTMLElement | null) => {
    const falta = faltaParaOPerfil(p, ctxAcesso);
    if (falta.length) { toast.warn(`Falta liberar: ${falta.slice(0, 2).join(' · ')}${falta.length > 2 ? ` e mais ${falta.length - 2}` : ''}.`); return; }
    if (p.paleta) { const pal = paletaPorId(p.paleta); if (pal) aplicarPaleta(pal); } else if (p.tema) setTheme(p.tema);
    setFonte(p.fonte);
    setParticulas(p.particulas);
    if (Array.isArray(p.pack)) setPackCustom(p.pack); else setPack(p.pack);
    setCursor(p.cursor);
    setRastro(p.rastro);
    comemorar('subiuNivel', el ?? null, { texto: p.nome });
    explodirAleatorio(2, 'confete');
    toast.ok(`Perfil "${p.nome}" aplicado.`);
    rerender();
  };

  const salvarAtual = () => {
    const nome = nomeDoPerfil.trim() || `Meu perfil ${perfisSalvos().length + 1}`;
    const pack = readPack();
    salvarPerfil({
      nome, emoji: emojiDoCursor(readCursor()) ?? '✨', desc: 'Montado por você.',
      ...(theme === 'custom' && paletaAtiva ? { paleta: paletaAtiva } : { tema: theme }),
      fonte, particulas: readParticulas(), pack: pack === PACK_CUSTOM ? lerPackCustom() : pack,
      cursor: readCursor(), rastro: readRastro(),
    });
    setNomeDoPerfil('');
    toast.ok(`Perfil "${nome}" salvo.`);
    rerender();
  };

  /* ── Peças reutilizadas ── */
  const Cadeado = ({ a, compacto }: { a: Acesso; compacto?: boolean }) => a.liberado ? null : (
    <span className={`inline-flex items-center gap-1.5 ${compacto ? 'text-[11px]' : 'text-[12px]'} text-ink-muted`}>
      <Lock className="w-3 h-3" aria-hidden /> {a.motivo}
      {a.compravel && a.item?.precoSeeds && (
        <button onClick={() => void obter(a)} disabled={comprando === a.item.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-good text-white font-bold text-[11px] cursor-pointer disabled:opacity-60">
          <Sprout className="w-3 h-3" aria-hidden /> {comprando === a.item.id ? '…' : `Obter · ${a.item.precoSeeds}`}
        </button>
      )}
    </span>
  );

  const Secao = ({ id, icone, titulo, resumo, children }: { id: Secao; icone: React.ReactNode; titulo: string; resumo: string; children: React.ReactNode }) => (
    <section className="card-panel bg-surface overflow-hidden">
      <button onClick={() => setAberta(aberta === id ? null : id)} aria-expanded={aberta === id} className="w-full flex items-center gap-3 p-4 text-left cursor-pointer hover:bg-surface-hover">
        <span className="w-9 h-9 rounded-xl bg-accent-soft text-accent-ink flex items-center justify-center shrink-0">{icone}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-[14px] text-ink">{titulo}</span>
          <span className="block text-[12px] text-ink-muted truncate">{resumo}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-ink-faint transition-transform ${aberta === id ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {aberta === id && <div className="px-4 pb-4 pt-1 border-t border-border-subtle">{children}</div>}
    </section>
  );

  /** Seletor de emojis: categorias com cadeado + grade. `selecionados` marca; `aoTocar` decide. */
  const SeletorDeEmojis = ({ selecionados, aoTocar, aoAdicionarCategoria }: { selecionados: ReadonlySet<string>; aoTocar: (e: string) => void; aoAdicionarCategoria?: (emojis: string[]) => void }) => {
    const [cat, setCat] = useState(CATEGORIAS_DE_EMOJI[0].id);
    const [q, setQ] = useState('');
    const categoria = CATEGORIAS_DE_EMOJI.find((c) => c.id === cat)!;
    const acesso = acessoACategoria(cat, nivel, saldoAgora);
    const lista = q.trim() ? todosOsEmojis().filter((e) => e.includes(q.trim())) : categoria.emojis;
    return (
      <div>
        <div className="flex flex-wrap gap-1 mb-2">
          {CATEGORIAS_DE_EMOJI.map((c) => {
            const a = acessoACategoria(c.id, nivel, saldoAgora);
            return (
              <button key={c.id} onClick={() => { setCat(c.id); setQ(''); }} aria-pressed={cat === c.id && !q} title={a.liberado ? c.nome : a.motivo} className={`px-2 py-1 rounded-lg text-[11.5px] font-bold border cursor-pointer inline-flex items-center gap-1 ${cat === c.id && !q ? 'bg-ink text-ink-contrast border-ink' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'} ${a.liberado ? '' : 'opacity-70'}`}>
                {!a.liberado && <Lock className="w-3 h-3" aria-hidden />}{c.emojis[0]} {c.nome}
              </button>
            );
          })}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="colar emoji" className="w-28 px-2 py-1 rounded-lg bg-canvas border border-border-subtle text-[11.5px] text-ink outline-none focus:border-accent" />
        </div>
        {!q && !acesso.liberado ? (
          <div className="p-3 rounded-xl bg-canvas border border-border-subtle text-[12.5px] text-ink-muted flex flex-wrap items-center gap-2">
            <span className="text-2xl" aria-hidden>{categoria.emojis.slice(0, 6).join(' ')}</span>
            <span className="flex-1 min-w-[12rem]"><b className="text-ink">{categoria.nome}</b> ainda não está liberada.</span>
            <Cadeado a={acesso} />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto custom-scrollbar">
              {lista.map((e) => {
                const dentro = selecionados.has(e);
                const aE = q ? acessoACategoria(CATEGORIAS_DE_EMOJI.find((c) => c.emojis.includes(e))?.id ?? '', nivel, saldoAgora) : acesso;
                return <button key={e} disabled={!aE.liberado} onClick={() => aoTocar(e)} aria-pressed={dentro} title={aE.liberado ? e : aE.motivo} className={`w-9 h-9 rounded-lg text-xl border cursor-pointer transition-transform hover:scale-110 disabled:opacity-40 disabled:cursor-not-allowed ${dentro ? 'bg-accent-soft border-accent' : 'bg-canvas border-border-subtle'}`}>{e}</button>;
              })}
            </div>
            {aoAdicionarCategoria && !q && (
              <button onClick={() => aoAdicionarCategoria(categoria.emojis)} className="mt-2 text-[11.5px] font-semibold text-accent-ink hover:underline cursor-pointer">+ adicionar {categoria.nome} inteira</button>
            )}
          </>
        )}
      </div>
    );
  };

  const paletaNome = theme === 'custom' && paletaAtiva ? paletaPorId(paletaAtiva)?.nome ?? 'Paleta' : `Tema ${theme}`;
  const packNome = readPack() === PACK_CUSTOM ? `Meu pack (${packCustom.length})` : PACKS_DE_EMOJI.find((p) => p.id === readPack())?.nome ?? 'Clássico';
  const editorDePack = acessoAoEditorDePack(nivel, saldoAgora);
  const cursorDeEmoji = acessoAoCursorDeEmoji(nivel, saldoAgora);
  const rastroDeEmojis = acessoAoRastroDeEmojis(nivel, saldoAgora);

  return (
    <div className="space-y-6">
      {/* ── SEU VISUAL AGORA ── */}
      <section className="card-panel bg-canvas p-4">
        <p className="label-mono mb-2">Seu visual agora</p>
        <div className="flex flex-wrap gap-2 text-[12.5px]">
          {[
            ['paleta', paletaNome], ['fonte', FONTE_OPTIONS.find((f) => f.id === fonte)?.name ?? fonte], ['particulas', PARTICULAS_OPTIONS.find((o) => o.id === readParticulas())?.name ?? ''],
            ['emojis', packNome], ['cursor', `${emojiDoCursor(cursorAtual) ?? '🖱️'} ${CURSORES.find((c) => c.id === cursorAtual)?.nome ?? 'Emoji'}`], ['rastro', estiloDeRastro(rastroAtual)?.nome ?? 'sem rastro'],
          ].map(([id, rotulo]) => (
            <button key={id} onClick={() => setAberta(id as Secao)} className="px-3 py-1.5 rounded-xl bg-surface border border-border-subtle text-ink hover:border-accent cursor-pointer">
              <span className="text-ink-faint">{id}: </span><b>{rotulo}</b>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <input value={nomeDoPerfil} onChange={(e) => setNomeDoPerfil(e.target.value)} placeholder="Nome para salvar este visual" className="flex-1 min-w-[12rem] px-3 py-2 rounded-xl bg-surface border border-border-subtle text-[13px] text-ink outline-none focus:border-accent" />
          <button onClick={salvarAtual} className="btn-solid"><Save className="w-4 h-4" aria-hidden /> Salvar como perfil</button>
          <button onClick={onIrParaLoja} className="btn-outline"><ShoppingBag className="w-4 h-4" aria-hidden /> Liberar mais na Loja</button>
        </div>
      </section>

      {/* ── PERFIS PRONTOS + SEUS ── */}
      <section>
        <p className="label-mono mb-2 flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5" aria-hidden /> Perfis prontos: um toque muda tudo</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[...perfisSalvos(), ...PRESETS].map((p) => {
            const pal = p.paleta ? paletaPorId(p.paleta) : null;
            const falta = faltaParaOPerfil(p, ctxAcesso);
            const trancado = falta.length > 0;
            return (
              <div key={p.id} className={`card-panel p-3 border-2 ${trancado ? 'border-border-subtle opacity-90' : 'border-border-subtle hover:border-accent'} flex flex-col gap-1.5`}>
                <button onClick={(e) => aplicarPerfil(p, e.currentTarget)} className="text-left cursor-pointer">
                  <span className="flex items-center gap-2">
                    <span className="text-2xl" aria-hidden>{p.emoji}</span>
                    <span className="font-bold text-[13.5px] text-ink flex-1 truncate">{p.nome}</span>
                    {trancado ? <Lock className="w-3.5 h-3.5 text-ink-faint shrink-0" aria-hidden /> : null}
                  </span>
                  {pal && <span className="flex gap-1 mt-2">{[pal.canvas, pal.surface, pal.accent, pal.ink].map((c, i) => <span key={i} className="w-5 h-5 rounded-full border border-surface" style={{ backgroundColor: c }} />)}</span>}
                  <span className="block text-[11.5px] text-ink-muted mt-1.5 leading-snug">{p.desc}</span>
                </button>
                {trancado && <p className="text-[11px] text-ink-faint leading-snug">Falta: {falta.slice(0, 2).join(' · ')}{falta.length > 2 ? ` +${falta.length - 2}` : ''}</p>}
                {p.proprio && <button onClick={() => { apagarPerfil(p.id); rerender(); }} className="self-start text-[11px] text-ink-faint hover:text-error inline-flex items-center gap-1 cursor-pointer"><Trash2 className="w-3 h-3" aria-hidden /> apagar</button>}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── MONTE O SEU (acordeão) ── */}
      <p className="label-mono">Monte o seu, peça por peça</p>
      <div className="space-y-2">
        <Secao id="tema" icone={<Monitor className="w-4 h-4" />} titulo="Tema pronto" resumo={THEME_OPTIONS.find((t) => t.id === theme)?.name ?? theme}>
          {/* Os temas NATIVOS (CSS completo) — antes escolhidos no Estúdio sem cadeado nenhum, o
              furo que deixava equipar o tema de nível 10 no nível 1. Aqui a régua da Loja vale. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {THEME_OPTIONS.filter((t) => t.id !== 'custom').map((t) => {
              const item = CATALOGO_DA_LOJA.find((i) => i.tipo === 'tema' && i.alvo === t.id);
              const a = acessoAoItem(item?.id, nivel, saldoAgora);
              const ativo = theme === t.id;
              return (
                <button key={t.id} disabled={!a.liberado} onClick={() => setTheme(t.id)} aria-pressed={ativo} title={a.liberado ? t.desc : `${t.name} · ${a.motivo}`} className={`rounded-xl border-2 overflow-hidden text-left cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed ${ativo ? 'border-accent' : 'border-border-subtle hover:border-accent/60'}`}>
                  <span className="flex gap-1 p-2" style={{ backgroundColor: t.swatches.canvas }}>
                    {[t.swatches.surface, t.swatches.accent, t.swatches.ink].map((c, i) => <span key={i} className="w-5 h-5 rounded-full border border-surface" style={{ backgroundColor: c }} />)}
                  </span>
                  <span className="flex items-center justify-between px-2 py-1 bg-surface">
                    <span className="text-[11px] font-bold text-ink truncate">{t.name}</span>
                    {ativo ? <Check className="w-3 h-3 text-accent shrink-0" /> : !a.liberado ? <Lock className="w-3 h-3 text-ink-faint shrink-0" /> : null}
                  </span>
                  {!a.liberado && <span className="block px-2 pb-1.5 bg-surface"><Cadeado a={a} compacto /></span>}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">
            <span>Cores livres e layout das telas:</span>
            {desbloqueado(nivel, 'estudio', 'abrir')
              ? <button onClick={onOpenStudio} className="btn-outline text-[12px] py-1.5"><SlidersHorizontal className="w-3.5 h-3.5" aria-hidden /> Abrir o Estúdio</button>
              : <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" aria-hidden /> Estúdio · Nível {nivelNecessario('estudio', 'abrir')} ou pela Loja</span>}
          </div>
        </Secao>

        <Secao id="paleta" icone={<Palette className="w-4 h-4" />} titulo="Paleta de cores" resumo={`${paletaNome} · ${todasAsPaletas().length} paletas em 6 estilos`}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <label className="relative flex-1 min-w-[12rem]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar (roxo, oceano, pastel…)" className="w-full pl-8 pr-3 py-2 rounded-xl bg-canvas border border-border-subtle text-[13px] text-ink outline-none focus:border-accent" />
            </label>
            <div className="flex flex-wrap gap-1">
              {[{ id: 'todos', nome: 'Todos' }, ...ESTILOS].map((e) => {
                const a = e.id === 'todos' ? { liberado: true } as Acesso : acessoAoEstilo(e.id as EstiloDePaleta, nivel, saldoAgora);
                return (
                  <button key={e.id} onClick={() => setEstilo(e.id as EstiloDePaleta | 'todos')} aria-pressed={estilo === e.id} title={a.liberado ? e.nome : a.motivo} className={`px-3 py-1.5 rounded-lg text-[12px] font-bold border cursor-pointer inline-flex items-center gap-1 ${estilo === e.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'}`}>
                    {!a.liberado && <Lock className="w-3 h-3" aria-hidden />}{e.nome}
                  </button>
                );
              })}
            </div>
          </div>
          {estilo !== 'todos' && !acessoAoEstilo(estilo, nivel, saldoAgora).liberado && (
            <p className="mb-2 text-[12.5px] text-ink-muted flex flex-wrap items-center gap-2">Estilo <b className="text-ink">{ESTILOS.find((e) => e.id === estilo)?.nome}</b> ainda trancado. <Cadeado a={acessoAoEstilo(estilo, nivel, saldoAgora)} /></p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 max-h-[20rem] overflow-y-auto custom-scrollbar pr-1">
            {paletas.map((p) => {
              const ativa = theme === 'custom' && paletaAtiva === p.id;
              const a = acessoAoEstilo(p.estilo, nivel, saldoAgora);
              return (
                <button key={p.id} disabled={!a.liberado} onClick={(e) => aplicarPaleta(p, e.currentTarget)} aria-pressed={ativa} title={a.liberado ? p.nome : `${p.nome} · ${a.motivo}`} className={`rounded-xl border-2 overflow-hidden text-left cursor-pointer transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${ativa ? 'border-accent' : 'border-border-subtle hover:border-accent/60'}`}>
                  <span className="block p-2" style={{ backgroundColor: p.canvas }}>
                    <span className="block h-1.5 w-2/3 rounded-full mb-1" style={{ backgroundColor: p.ink, opacity: 0.85 }} />
                    <span className="block rounded-md p-1 mb-1" style={{ backgroundColor: p.surface }}><span className="block h-1 w-3/4 rounded-full" style={{ backgroundColor: p.ink, opacity: 0.45 }} /></span>
                    <span className="inline-block h-2.5 px-3 rounded-md" style={{ backgroundColor: p.accent }} />
                  </span>
                  <span className="flex items-center justify-between px-2 py-1 bg-surface">
                    <span className="text-[11px] font-bold text-ink truncate">{p.nome}</span>
                    {ativa ? <Check className="w-3 h-3 text-accent shrink-0" /> : !a.liberado ? <Lock className="w-3 h-3 text-ink-faint shrink-0" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </Secao>

        <Secao id="fonte" icone={<Type className="w-4 h-4" />} titulo="Fonte" resumo={FONTE_OPTIONS.find((f) => f.id === fonte)?.name ?? fonte}>
          <div className="flex flex-wrap gap-1.5">
            {FONTE_OPTIONS.map((f) => (
              <button key={f.id} onClick={() => setFonte(f.id)} aria-pressed={fonte === f.id} title={f.desc} className={`px-3 py-1.5 rounded-lg text-[12.5px] font-bold border cursor-pointer ${fonte === f.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'}`}>{f.name}</button>
            ))}
          </div>
        </Secao>

        <Secao id="particulas" icone={<Sparkles className="w-4 h-4" />} titulo="Partículas dos acertos" resumo={PARTICULAS_OPTIONS.find((o) => o.id === readParticulas())?.name ?? ''}>
          <div className="flex flex-wrap gap-1.5">
            {PARTICULAS_OPTIONS.map((o) => (
              <button key={o.id} onClick={(e) => { setParticulas(o.id as ParticulasType); rerender(); const r = e.currentTarget.getBoundingClientRect(); emitBurst(r.left + r.width / 2, r.top, 'xp'); }} aria-pressed={readParticulas() === o.id} title={o.desc} className={`px-3 py-1.5 rounded-lg text-[12.5px] font-bold border cursor-pointer ${readParticulas() === o.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'}`}>{o.name}</button>
            ))}
          </div>
          <p className="text-[11.5px] text-ink-faint mt-2">As skins compradas na Loja (pixel, confete, corações, estrelas, emojis) aparecem aqui quando liberadas.</p>
        </Secao>

        <Secao id="emojis" icone={<span className="text-base" aria-hidden>😀</span>} titulo="Emojis (partículas e rastro)" resumo={packNome}>
          <p className="text-[12px] font-bold text-ink mb-1.5">Packs prontos</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PACKS_DE_EMOJI.map((p) => (
              <button key={p.id} onClick={() => { setPack(p.id); rerender(); }} aria-pressed={readPack() === p.id} className={`px-2.5 py-1.5 rounded-lg text-[12px] font-bold border cursor-pointer ${readPack() === p.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'}`}>{p.emojis.slice(0, 2).join('')} {p.nome}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <p className="text-[12px] font-bold text-ink">Meu pack {packCustom.length ? `(${packCustom.length})` : ''}</p>
            <Cadeado a={editorDePack} compacto />
            {editorDePack.liberado && packCustom.length > 0 && (
              <>
                <button onClick={() => { setPack(PACK_CUSTOM); rerender(); }} aria-pressed={readPack() === PACK_CUSTOM} className={`px-2 py-1 rounded-lg text-[11.5px] font-bold border cursor-pointer ${readPack() === PACK_CUSTOM ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted'}`}>usar o meu</button>
                <button onClick={() => { setPackCustom([]); rerender(); }} className="text-[11.5px] text-ink-faint hover:text-error cursor-pointer">limpar</button>
              </>
            )}
          </div>
          {editorDePack.liberado ? (
            <>
              <SeletorDeEmojis
                selecionados={new Set(packCustom)}
                aoTocar={(e) => { const a = lerPackCustom(); setPackCustom(a.includes(e) ? a.filter((x) => x !== e) : [...a, e]); rerender(); }}
                aoAdicionarCategoria={(emojis) => { setPackCustom([...new Set([...lerPackCustom(), ...emojis])]); rerender(); }}
              />
              {packCustom.length > 0 && <p className="text-[12px] text-ink mt-2 leading-relaxed">{packCustom.join(' ')}</p>}
              <p className="text-[11.5px] text-ink-faint mt-1">Toque para incluir ou tirar. "Adicionar categoria inteira" e depois tirar um é o jeito rápido de "todos menos esse".</p>
            </>
          ) : (
            <p className="text-[12px] text-ink-muted">Com o editor você escolhe emoji por emoji, categoria inteira, ou tira só um.</p>
          )}
        </Secao>

        <Secao id="cursor" icone={<MousePointer2 className="w-4 h-4" />} titulo="Cursor" resumo={`${emojiDoCursor(cursorAtual) ?? '🖱️'} ${CURSORES.find((c) => c.id === cursorAtual)?.nome ?? 'Emoji da galeria'}`}>
          <p className="text-[12px] font-bold text-ink mb-1.5">Da Loja</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {CURSORES.map((c) => (
              <button key={c.id} onClick={() => { setCursor(c.id); rerender(); }} aria-pressed={cursorAtual === c.id} className={`px-2.5 py-1.5 rounded-lg text-[12px] font-bold border cursor-pointer ${cursorAtual === c.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'}`}>{c.emoji} {c.nome}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5"><p className="text-[12px] font-bold text-ink">Qualquer emoji</p><Cadeado a={cursorDeEmoji} compacto /></div>
          {cursorDeEmoji.liberado
            ? <SeletorDeEmojis selecionados={new Set(cursorAtual.startsWith('emoji:') ? [cursorAtual.slice(6)] : [])} aoTocar={(e) => { setCursor(idDeCursorDeEmoji(e)); rerender(); }} />
            : <p className="text-[12px] text-ink-muted">Libere e todo emoji do catálogo (das categorias abertas) vira ponteiro.</p>}
        </Secao>

        <Secao id="rastro" icone={<Wind className="w-4 h-4" />} titulo="Rastro do mouse" resumo={estiloDeRastro(rastroAtual)?.nome ?? 'desligado'}>
          <p className="text-[12px] font-bold text-ink mb-1.5">Da Loja</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {RASTROS.map((r) => (
              <button key={r.id} onClick={() => { setRastro(r.id); rerender(); }} aria-pressed={rastroAtual === r.id} className={`px-2.5 py-1.5 rounded-lg text-[12px] font-bold border cursor-pointer ${rastroAtual === r.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'}`}>{r.nome}</button>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-[12px] font-bold text-ink mb-1.5">Forma nas cores da paleta ativa</p>
              {!paletaAtiva && <p className="text-[11.5px] text-ink-faint mb-1">Escolha uma paleta primeiro.</p>}
              <div className="flex flex-col gap-1.5">
                {FORMAS_DE_RASTRO.map((f) => {
                  const a = acessoAFormaDeRastro(f.id, nivel, saldoAgora);
                  const id = paletaAtiva ? idDeRastroGerado(f.id, paletaAtiva) : null;
                  return (
                    <div key={f.id} className="flex flex-wrap items-center gap-2">
                      <button disabled={!id || !a.liberado} onClick={() => { if (id) { setRastro(id); rerender(); } }} aria-pressed={!!id && rastroAtual === id} className={`px-2.5 py-1.5 rounded-lg text-[12px] font-bold border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1 ${id && rastroAtual === id ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'}`}>{!a.liberado && <Lock className="w-3 h-3" aria-hidden />}{f.nome}</button>
                      <Cadeado a={a} compacto />
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5"><p className="text-[12px] font-bold text-ink">Só estes emojis {emojisDoRastro.length ? `(${emojisDoRastro.length})` : ''}</p><Cadeado a={rastroDeEmojis} compacto /></div>
              {rastroDeEmojis.liberado ? (
                <SeletorDeEmojis selecionados={new Set(emojisDoRastro)} aoTocar={(e) => { const nova = emojisDoRastro.includes(e) ? emojisDoRastro.filter((x) => x !== e) : [...emojisDoRastro, e]; setEmojisDoRastro(nova); setRastro(nova.length ? idDeRastroDeEmojis(nova) : 'off'); rerender(); }} />
              ) : <p className="text-[12px] text-ink-muted">Com o Rastro Emoji da Loja você escolhe exatamente quais emojis seguem o mouse.</p>}
            </div>
          </div>
          <p className="text-[11.5px] text-ink-faint mt-2">Rastro atual: {estiloDeRastro(rastroAtual)?.nome ?? 'desligado'}. Mexa o mouse para ver.</p>
        </Secao>

        <Secao id="tela" icone={<Monitor className="w-4 h-4" />} titulo="Tela: perfil de exibição e posição do menu" resumo={`${ageProfile === 'kids' ? 'Kids / Gamer' : ageProfile === 'senior' ? 'Leitura ampliada' : 'Produtividade'} · menu ${menuPosition === 'top' ? 'no topo' : menuPosition === 'left' ? 'à esquerda' : menuPosition === 'right' ? 'à direita' : 'embaixo'}`}>
          <p className="text-[12px] font-bold text-ink mb-1.5">Perfil de exibição</p>
          <p className="text-[12px] text-ink-muted mb-2">Muda a linguagem e a densidade das telas. Não muda o tema nem esconde recurso nenhum.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            {([
              { id: 'kids' as const, icon: Gamepad2, label: 'Kids / Gamer', desc: 'Missões, recompensas e linguagem de jogo.' },
              { id: 'pro' as const, icon: Zap, label: 'Produtividade', desc: 'Densidade alta e vocabulário técnico.' },
              { id: 'senior' as const, icon: Eye, label: 'Leitura ampliada', desc: 'Passo a passo, alvos de 48px e mais respiro.' },
            ]).map((opt) => (
              <button key={opt.id} onClick={() => setAgeProfile(opt.id)} aria-pressed={ageProfile === opt.id} className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${ageProfile === opt.id ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border-subtle bg-canvas hover:border-accent text-ink-muted'}`}>
                <span className="flex items-center gap-2 font-bold text-[13px]"><opt.icon className="w-4 h-4 shrink-0" aria-hidden /> {opt.label}</span>
                <span className="block text-[11.5px] mt-1 opacity-80">{opt.desc}</span>
              </button>
            ))}
          </div>
          <p className="text-[12px] font-bold text-ink mb-1.5">Posição do menu</p>
          <p className="text-[12px] text-ink-muted mb-2">Vale para telas grandes. No celular a app é sempre controles em cima e destinos embaixo.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([
              { id: 'top' as const, icon: PanelTop, label: 'No topo' },
              { id: 'left' as const, icon: PanelLeft, label: 'À esquerda' },
              { id: 'right' as const, icon: PanelRight, label: 'À direita' },
              { id: 'bottom' as const, icon: PanelBottom, label: 'Embaixo' },
            ]).map((opt) => {
              const livre = desbloqueado(nivel, 'posicao', opt.id, menuPosition);
              const item = CATALOGO_DA_LOJA.find((i) => i.tipo === 'posicao' && i.alvo === opt.id);
              const a = livre ? { liberado: true } as Acesso : acessoAoItem(item?.id, nivel, saldoAgora);
              return (
                <div key={opt.id} className="flex flex-col gap-1">
                  <button disabled={!a.liberado} onClick={() => setMenuPosition(opt.id)} aria-pressed={menuPosition === opt.id} className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 font-bold text-[12px] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${menuPosition === opt.id ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border-subtle bg-canvas hover:border-accent text-ink-muted'}`}>
                    {a.liberado ? <opt.icon className="w-5 h-5" aria-hidden /> : <Lock className="w-5 h-5" aria-hidden />} {opt.label}
                  </button>
                  {!a.liberado && <Cadeado a={a} compacto />}
                </div>
              );
            })}
          </div>
        </Secao>
      </div>
    </div>
  );
}
