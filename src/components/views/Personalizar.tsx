import { useMemo, useState } from 'react';
import { Check, Palette, Sparkles, MousePointer2, Wind, Save, Trash2, Search, Wand2, Type } from 'lucide-react';
import { toast } from '../Toast';
import { comemorar, explodirAleatorio } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';
import { todasAsPaletas, buscarPaletas, paletaPorId, ESTILOS, type EstiloDePaleta, type Paleta } from '../../lib/galeria/paletas';
import { CATEGORIAS_DE_EMOJI, todosOsEmojis } from '../../lib/galeria/emojis';
import { PRESETS, perfisSalvos, salvarPerfil, apagarPerfil, type Perfil } from '../../lib/galeria/perfis';
import { PARTICULAS_OPTIONS, PACKS_DE_EMOJI, PACK_CUSTOM, readParticulas, setParticulas, readPack, setPack, setPackCustom, lerPackCustom, type ParticulasType } from '../../lib/particulas';
import { CURSORES, readCursor, setCursor, idDeCursorDeEmoji, emojiDoCursor } from '../../lib/cursores';
import { FORMAS_DE_RASTRO, RASTROS, readRastro, setRastro, estiloDeRastro, idDeRastroGerado, idDeRastroDeEmojis } from '../../lib/rastroDoMouse';
import { applyCustomColors, FONTE_OPTIONS, type ThemeType, type FonteType } from '../../lib/appearance';

/**
 * PERSONALIZAR — presets completos ("tudo de pato") e o editor "Monte o seu".
 *
 * Por que uma tela e não mais itens na Loja: centenas de paletas, emojis, cursores e rastros como
 * cards de compra seriam uma parede. Aqui a galeria é NAVEGÁVEL (busca, categorias, estilos) e o
 * resultado é um PERFIL — a combinação inteira, aplicada de uma vez e salva com nome.
 *
 * Nada aqui inventa um segundo dono da aparência: aplicar = chamar os mesmos setters de sempre.
 */
interface PersonalizarProps {
  theme: ThemeType;
  setTheme: (t: ThemeType) => void;
  fonte: FonteType;
  setFonte: (f: FonteType) => void;
}

export default function Personalizar({ theme, setTheme, fonte, setFonte }: PersonalizarProps) {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [busca, setBusca] = useState('');
  const [estilo, setEstilo] = useState<EstiloDePaleta | 'todos'>('todos');
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_DE_EMOJI[0].id);
  const [buscaEmoji, setBuscaEmoji] = useState('');
  const [nomeDoPerfil, setNomeDoPerfil] = useState('');
  const [paletaAtiva, setPaletaAtiva] = useState<string | null>(() => { try { return localStorage.getItem('babel.paleta_ativa'); } catch { return null; } });
  const [formaDoRastro, setFormaDoRastro] = useState<string>('estrelas');
  const [emojisDoRastro, setEmojisDoRastro] = useState<string[]>(() => {
    const atual = readRastro();
    return atual.startsWith('emojis:') ? atual.slice(7).split(',') : [];
  });
  const packCustom = lerPackCustom();

  const paletas = useMemo(() => buscarPaletas(busca, estilo), [busca, estilo]);
  const total = todasAsPaletas().length;

  const aplicarPaleta = (p: Paleta, el?: HTMLElement | null) => {
    applyCustomColors({ canvas: p.canvas, surface: p.surface, ink: p.ink, accent: p.accent });
    setTheme('custom');
    try { localStorage.setItem('babel.paleta_ativa', p.id); } catch { /* sem storage */ }
    setPaletaAtiva(p.id);
    if (el) comemorar('acerto', el, { texto: p.nome });
    rerender();
  };

  const aplicarPerfil = (p: Perfil, el?: HTMLElement | null) => {
    if (p.paleta) { const pal = paletaPorId(p.paleta); if (pal) aplicarPaleta(pal); }
    else if (p.tema) setTheme(p.tema);
    setFonte(p.fonte);
    setParticulas(p.particulas);
    if (Array.isArray(p.pack)) setPackCustom(p.pack); else setPack(p.pack);
    setCursor(p.cursor);
    setRastro(p.rastro);
    comemorar('subiuNivel', el ?? null, { texto: p.nome });
    explodirAleatorio(2, 'confete');
    toast.ok(`Perfil "${p.nome}" aplicado: tema, partículas, emojis, cursor e rastro.`);
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

  const alternarEmojiDoPack = (e: string) => {
    const atual = lerPackCustom();
    setPackCustom(atual.includes(e) ? atual.filter((x) => x !== e) : [...atual, e]);
    rerender();
  };

  const emojisVisiveis = useMemo(() => {
    const t = buscaEmoji.trim();
    if (t) return todosOsEmojis().filter((e) => e.includes(t));
    return CATEGORIAS_DE_EMOJI.find((c) => c.id === categoria)?.emojis ?? [];
  }, [categoria, buscaEmoji]);

  const rastroAtual = readRastro();
  const cursorAtual = readCursor();

  return (
    <div className="space-y-8">
      {/* ── PRESETS ── */}
      <section>
        <p className="label-mono mb-2 flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5" aria-hidden /> Perfis prontos: muda tudo de uma vez</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PRESETS.map((p) => {
            const pal = p.paleta ? paletaPorId(p.paleta) : null;
            return (
              <button key={p.id} onClick={(e) => aplicarPerfil(p, e.currentTarget)} className="card-panel text-left p-3 hover:-translate-y-0.5 hover:shadow-card transition-all cursor-pointer border-2 border-border-subtle hover:border-accent">
                <span className="flex items-center gap-2">
                  <span className="text-2xl" aria-hidden>{p.emoji}</span>
                  <span className="font-bold text-[13.5px] text-ink">{p.nome}</span>
                </span>
                {pal && (
                  <span className="flex gap-1 mt-2">
                    {[pal.canvas, pal.surface, pal.accent, pal.ink].map((c, i) => <span key={i} className="w-5 h-5 rounded-full border border-surface" style={{ backgroundColor: c }} />)}
                  </span>
                )}
                <span className="block text-[11.5px] text-ink-muted mt-1.5 leading-snug">{p.desc}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── SEUS PERFIS ── */}
      <section className="card-panel bg-canvas p-4">
        <p className="label-mono mb-2 flex items-center gap-1.5"><Save className="w-3.5 h-3.5" aria-hidden /> Seus perfis</p>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input value={nomeDoPerfil} onChange={(e) => setNomeDoPerfil(e.target.value)} placeholder="Nome do perfil (ex.: Meu pato roxo)" className="flex-1 min-w-[12rem] px-3 py-2 rounded-xl bg-surface border border-border-subtle text-[13px] text-ink outline-none focus:border-accent" />
          <button onClick={salvarAtual} className="btn-solid"><Save className="w-4 h-4" aria-hidden /> Salvar o que está equipado</button>
        </div>
        {perfisSalvos().length === 0 ? (
          <p className="text-[12px] text-ink-muted">Monte abaixo (paleta, partículas, emojis, cursor, rastro) e salve aqui com um nome.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {perfisSalvos().map((p) => (
              <li key={p.id} className="flex items-center gap-1 pl-3 pr-1 py-1 rounded-xl border border-border-subtle bg-surface text-[12.5px]">
                <button onClick={(e) => aplicarPerfil(p, e.currentTarget)} className="font-bold text-ink hover:text-accent cursor-pointer">{p.emoji} {p.nome}</button>
                <button onClick={() => { apagarPerfil(p.id); rerender(); }} className="p-1 rounded-lg text-ink-faint hover:text-error cursor-pointer" aria-label={`Apagar ${p.nome}`}><Trash2 className="w-3.5 h-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── PALETAS ── */}
      <section>
        <p className="label-mono mb-2 flex items-center gap-1.5"><Palette className="w-3.5 h-3.5" aria-hidden /> Paletas · {total} (busca e estilo)</p>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <label className="relative flex-1 min-w-[12rem]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar paleta (roxo, oceano, pastel…)" className="w-full pl-8 pr-3 py-2 rounded-xl bg-surface border border-border-subtle text-[13px] text-ink outline-none focus:border-accent" />
          </label>
          <div className="flex flex-wrap gap-1">
            {[{ id: 'todos', nome: 'Todos' }, ...ESTILOS].map((e) => (
              <button key={e.id} onClick={() => setEstilo(e.id as EstiloDePaleta | 'todos')} aria-pressed={estilo === e.id} className={`px-3 py-1.5 rounded-lg text-[12px] font-bold border cursor-pointer ${estilo === e.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-surface border-border-subtle text-ink-muted hover:text-ink'}`}>{e.nome}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 max-h-[22rem] overflow-y-auto custom-scrollbar pr-1">
          {paletas.map((p) => {
            const ativa = theme === 'custom' && paletaAtiva === p.id;
            return (
              <button key={p.id} onClick={(e) => aplicarPaleta(p, e.currentTarget)} aria-pressed={ativa} title={p.nome} className={`rounded-xl border-2 overflow-hidden text-left cursor-pointer transition-all hover:-translate-y-0.5 ${ativa ? 'border-accent' : 'border-border-subtle hover:border-accent/60'}`}>
                <span className="block p-2" style={{ backgroundColor: p.canvas }}>
                  <span className="block h-1.5 w-2/3 rounded-full mb-1" style={{ backgroundColor: p.ink, opacity: 0.85 }} />
                  <span className="block rounded-md p-1 mb-1" style={{ backgroundColor: p.surface }}>
                    <span className="block h-1 w-3/4 rounded-full" style={{ backgroundColor: p.ink, opacity: 0.45 }} />
                  </span>
                  <span className="inline-block h-2.5 px-3 rounded-md" style={{ backgroundColor: p.accent }} />
                </span>
                <span className="flex items-center justify-between px-2 py-1 bg-surface">
                  <span className="text-[11px] font-bold text-ink truncate">{p.nome}</span>
                  {ativa && <Check className="w-3 h-3 text-accent shrink-0" />}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── FONTE + PARTÍCULAS ── */}
      <section className="grid md:grid-cols-2 gap-4">
        <div className="card-panel bg-surface p-4">
          <p className="label-mono mb-2 flex items-center gap-1.5"><Type className="w-3.5 h-3.5" aria-hidden /> Fonte</p>
          <div className="flex flex-wrap gap-1.5">
            {FONTE_OPTIONS.map((f) => (
              <button key={f.id} onClick={() => setFonte(f.id)} aria-pressed={fonte === f.id} className={`px-3 py-1.5 rounded-lg text-[12.5px] font-bold border cursor-pointer ${fonte === f.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'}`}>{f.name}</button>
            ))}
          </div>
        </div>
        <div className="card-panel bg-surface p-4">
          <p className="label-mono mb-2 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" aria-hidden /> Partículas dos acertos</p>
          <div className="flex flex-wrap gap-1.5">
            {PARTICULAS_OPTIONS.map((o) => (
              <button key={o.id} onClick={(e) => { setParticulas(o.id as ParticulasType); rerender(); const r = e.currentTarget.getBoundingClientRect(); emitBurst(r.left + r.width / 2, r.top, 'xp'); }} aria-pressed={readParticulas() === o.id} title={o.desc} className={`px-3 py-1.5 rounded-lg text-[12.5px] font-bold border cursor-pointer ${readParticulas() === o.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'}`}>{o.name}</button>
            ))}
          </div>
        </div>
      </section>

      {/* ── EMOJIS: pack pronto ou o seu ── */}
      <section className="card-panel bg-surface p-4">
        <p className="label-mono mb-2">Emojis das partículas e do rastro · {todosOsEmojis().length} no catálogo</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {PACKS_DE_EMOJI.map((p) => (
            <button key={p.id} onClick={() => { setPack(p.id); rerender(); }} aria-pressed={readPack() === p.id} className={`px-2.5 py-1.5 rounded-lg text-[12px] font-bold border cursor-pointer ${readPack() === p.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'}`}>{p.emojis.slice(0, 2).join('')} {p.nome}</button>
          ))}
          <button onClick={() => { if (packCustom.length) { setPack(PACK_CUSTOM); rerender(); } }} aria-pressed={readPack() === PACK_CUSTOM} disabled={!packCustom.length} className={`px-2.5 py-1.5 rounded-lg text-[12px] font-bold border cursor-pointer disabled:opacity-50 ${readPack() === PACK_CUSTOM ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'}`}>✏️ Meu pack ({packCustom.length})</button>
        </div>
        <p className="text-[12px] text-ink-muted mb-2">Monte o seu: toque nos emojis (só os escolhidos entram; escolher todos de uma categoria e tirar um também vale).</p>
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <input value={buscaEmoji} onChange={(e) => setBuscaEmoji(e.target.value)} placeholder="Colar um emoji para achar" className="w-40 px-2.5 py-1.5 rounded-lg bg-canvas border border-border-subtle text-[12px] text-ink outline-none focus:border-accent" />
          {CATEGORIAS_DE_EMOJI.map((c) => (
            <button key={c.id} onClick={() => { setCategoria(c.id); setBuscaEmoji(''); }} aria-pressed={categoria === c.id && !buscaEmoji} className={`px-2 py-1 rounded-lg text-[11.5px] font-bold border cursor-pointer ${categoria === c.id && !buscaEmoji ? 'bg-ink text-ink-contrast border-ink' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'}`}>{c.nome}</button>
          ))}
          <button onClick={() => { const cat = CATEGORIAS_DE_EMOJI.find((c) => c.id === categoria)?.emojis ?? []; setPackCustom([...new Set([...lerPackCustom(), ...cat])]); rerender(); }} className="px-2 py-1 rounded-lg text-[11.5px] font-bold border border-border-subtle bg-canvas text-ink-muted hover:text-ink cursor-pointer">+ categoria inteira</button>
          <button onClick={() => { setPackCustom([]); rerender(); }} className="px-2 py-1 rounded-lg text-[11.5px] font-bold border border-border-subtle bg-canvas text-ink-muted hover:text-error cursor-pointer">limpar</button>
        </div>
        <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto custom-scrollbar">
          {emojisVisiveis.map((e) => {
            const dentro = packCustom.includes(e);
            return (
              <button key={e} onClick={() => alternarEmojiDoPack(e)} aria-pressed={dentro} className={`w-9 h-9 rounded-lg text-xl border cursor-pointer transition-transform hover:scale-110 ${dentro ? 'bg-accent-soft border-accent' : 'bg-canvas border-border-subtle'}`}>{e}</button>
            );
          })}
        </div>
        {packCustom.length > 0 && <p className="text-[12px] text-ink mt-2"><b>Meu pack:</b> {packCustom.join(' ')}</p>}
      </section>

      {/* ── CURSOR ── */}
      <section className="card-panel bg-surface p-4">
        <p className="label-mono mb-2 flex items-center gap-1.5"><MousePointer2 className="w-3.5 h-3.5" aria-hidden /> Cursor · qualquer emoji do catálogo</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {CURSORES.map((c) => (
            <button key={c.id} onClick={() => { setCursor(c.id); rerender(); }} aria-pressed={cursorAtual === c.id} className={`px-2.5 py-1.5 rounded-lg text-[12px] font-bold border cursor-pointer ${cursorAtual === c.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'}`}>{c.emoji} {c.nome}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto custom-scrollbar">
          {emojisVisiveis.map((e) => {
            const id = idDeCursorDeEmoji(e);
            return <button key={id} onClick={() => { setCursor(id); rerender(); }} aria-pressed={cursorAtual === id} className={`w-9 h-9 rounded-lg text-xl border cursor-pointer hover:scale-110 transition-transform ${cursorAtual === id ? 'bg-accent-soft border-accent' : 'bg-canvas border-border-subtle'}`}>{e}</button>;
          })}
        </div>
        <p className="text-[11.5px] text-ink-faint mt-2">A lista de emojis segue a categoria escolhida acima.</p>
      </section>

      {/* ── RASTRO ── */}
      <section className="card-panel bg-surface p-4">
        <p className="label-mono mb-2 flex items-center gap-1.5"><Wind className="w-3.5 h-3.5" aria-hidden /> Rastro do mouse · forma × paleta, ou emojis escolhidos</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {RASTROS.map((r) => (
            <button key={r.id} onClick={() => { setRastro(r.id); rerender(); }} aria-pressed={rastroAtual === r.id} className={`px-2.5 py-1.5 rounded-lg text-[12px] font-bold border cursor-pointer ${rastroAtual === r.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'}`}>{r.nome}</button>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <p className="text-[12px] font-bold text-ink mb-1">Forma na cor da paleta ativa</p>
            <div className="flex flex-wrap gap-1.5">
              {FORMAS_DE_RASTRO.map((f) => {
                const id = paletaAtiva ? idDeRastroGerado(f.id, paletaAtiva) : null;
                return (
                  <button key={f.id} disabled={!id} onClick={() => { if (id) { setFormaDoRastro(f.id); setRastro(id); rerender(); } }} aria-pressed={!!id && rastroAtual === id} className={`px-2.5 py-1.5 rounded-lg text-[12px] font-bold border cursor-pointer disabled:opacity-50 ${id && rastroAtual === id ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'}`}>{f.nome}</button>
                );
              })}
            </div>
            {!paletaAtiva && <p className="text-[11.5px] text-ink-faint mt-1">Escolha uma paleta acima para o rastro pegar as cores dela.</p>}
            {paletaAtiva && <p className="text-[11.5px] text-ink-faint mt-1">Forma: {FORMAS_DE_RASTRO.find((f) => f.id === formaDoRastro)?.nome} · paleta: {paletaPorId(paletaAtiva)?.nome}</p>}
          </div>
          <div>
            <p className="text-[12px] font-bold text-ink mb-1">Ou só estes emojis ({emojisDoRastro.length})</p>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar mb-1.5">
              {emojisVisiveis.map((e) => {
                const dentro = emojisDoRastro.includes(e);
                return <button key={e} onClick={() => { const nova = dentro ? emojisDoRastro.filter((x) => x !== e) : [...emojisDoRastro, e]; setEmojisDoRastro(nova); if (nova.length) setRastro(idDeRastroDeEmojis(nova)); else setRastro('off'); rerender(); }} aria-pressed={dentro} className={`w-8 h-8 rounded-lg text-lg border cursor-pointer ${dentro ? 'bg-accent-soft border-accent' : 'bg-canvas border-border-subtle'}`}>{e}</button>;
              })}
            </div>
            <p className="text-[11.5px] text-ink-faint">Rastro atual: {estiloDeRastro(rastroAtual)?.nome ?? 'desligado'}. Mexa o mouse para ver.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
