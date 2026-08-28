/**
 * PERSONALIZAR v3 — a casca com QUATRO áreas claras (pedido do dono, 2026-08-28):
 *
 *   · Meu visual    → o que já é seu, para equipar (o editor por peça — `Personalizar`).
 *   · Loja          → SÓ o que ainda se compra/libera por nível ou Seeds (nada de possuído aqui).
 *   · Conquistas    → o que SÓ vem por conquista (exclusivos em destaque) + a grade + "como ganhar".
 *   · Progressão    → a grade de tudo que dá para liberar, nível a nível, e a curva de XP.
 *
 * No topo, sempre visível: a barra de XP do nível, "faltam N XP", o saldo e a PRÓXIMA recompensa.
 * Comprar aqui e equipar ali passam pelo mesmo `equiparItem` (lib/galeria/equipar) — o único
 * caminho que equipa no app. Os textos dos estados vêm de `lib/galeria/textos`.
 */
import { useEffect, useMemo, useState } from 'react';
import { ShoppingBag, Sprout, Lock, Check, Sparkles, Palette, Type, Gamepad2, PanelRight, Wand2, Trophy, Star, Map, Shirt } from 'lucide-react';
import { Abas, PainelDeAba } from '../ui';
import Conquistas from './Conquistas';
import Personalizar from './Personalizar';
import { REGRAS, type ContextoDeConquistas } from '@core';
import {
  CATALOGO_DA_LOJA, COR_DA_RARIDADE, estadoDoItem, marcarPosse, type ItemDaLoja,
} from '../../lib/loja';
import { itensPorNivel, proximaRecompensa, estadoDaColecao, emojiDoItem } from '../../lib/galeria/progressao';
import { equiparItem, equipavel, type ContextoDeEquipar } from '../../lib/galeria/equipar';
import { TEXTOS } from '../../lib/galeria/textos';
import { gastarSeeds } from '../../data/api';
import { toast } from '../Toast';
import { comemorar, explodirAleatorio } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';
import { readParticulas, readPack, PACKS_DE_EMOJI } from '../../lib/particulas';
import { readCursor, CURSORES } from '../../lib/cursores';
import { readRastro } from '../../lib/rastroDoMouse';
import {
  nivelDoAprimoramento, custoDoProximoNivel, registrarAprimoramento, progressoDoAprimoramento,
  NIVEL_MAXIMO, lerIntensidade, setIntensidade, intensidadeMaxima, type Intensidade,
} from '../../lib/aprimoramentos';
import type { ThemeType, FonteType } from '../../lib/appearance';
import type { MenuPositionType, AgeProfileType } from '../shell/navItems';
import type { DerivedProgress } from '../../lib/progress';

interface LojaProps {
  progress: DerivedProgress;
  theme: ThemeType;
  setTheme: (t: ThemeType) => void;
  fonte: FonteType;
  setFonte: (f: FonteType) => void;
  menuPosition: MenuPositionType;
  setMenuPosition: (p: MenuPositionType) => void;
  onOpenStudio: () => void;
  /** Contexto das conquistas (montado no App). A aba "Conquistas" mora aqui na edição leve,
   *  onde o Perfil não existe. */
  ctxConquistas: ContextoDeConquistas | null;
  /** Perfil de exibição — editado na aba Meu visual (único dono desde 2026-08-28). */
  ageProfile: AgeProfileType;
  setAgeProfile: (p: AgeProfileType) => void;
  /** v3: aba de destino ao abrir ("progressao" do fim de rodada). */
  abaInicial?: string | null;
  /** v3: o contexto único de equipar (App). Opcional só para os testes de tela. */
  equiparCtx?: ContextoDeEquipar;
}

const ICONE_DO_TIPO: Record<string, React.ReactNode> = {
  tema: <Palette className="w-3.5 h-3.5" />,
  fonte: <Type className="w-3.5 h-3.5" />,
  particulas: <Sparkles className="w-3.5 h-3.5" />,
  posicao: <PanelRight className="w-3.5 h-3.5" />,
  estudio: <Wand2 className="w-3.5 h-3.5" />,
};

const FILTROS = [
  { id: 'tudo', nome: 'Tudo' },
  { id: 'tema', nome: 'Temas' },
  { id: 'particulas', nome: 'Partículas' },
  { id: 'pack', nome: 'Emojis' },
  { id: 'cursor', nome: 'Cursor' },
  { id: 'rastro', nome: 'Rastro' },
  { id: 'posicao', nome: 'Layout' },
  { id: 'estudio', nome: 'Estúdio' },
  { id: 'galeria', nome: 'Galeria' },
] as const;

const ABAS_VALIDAS = ['personalizar', 'loja', 'conquistas', 'progressao'] as const;

export default function Loja({ progress, theme, setTheme, fonte, setFonte, menuPosition, setMenuPosition, onOpenStudio, ctxConquistas, ageProfile, setAgeProfile, abaInicial, equiparCtx }: LojaProps) {
  // A tela ÚNICA abre no Meu visual: personalizar é o uso; comprar e conquistar são os caminhos.
  const [aba, setAba] = useState<string>(ABAS_VALIDAS.includes(abaInicial as never) ? (abaInicial as string) : 'personalizar');
  useEffect(() => { if (ABAS_VALIDAS.includes(abaInicial as never)) setAba(abaInicial as string); }, [abaInicial]);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('tudo');
  const [comprando, setComprando] = useState<string | null>(null);
  const [, force] = useState(0);
  const nivel = progress.available ? progress.level : 1;
  const saldo = progress.available ? progress.seeds : 0;
  const ctxEquipar: ContextoDeEquipar = equiparCtx ?? { setTheme, setFonte, setMenuPosition, onOpenStudio, nivel, saldo };

  // Recém-comprados nesta visita continuam na prateleira como 'Liberado · Equipar agora'.
  const [recemComprados] = useState(() => new Set<string>());
  const colecao = useMemo(() => estadoDaColecao(nivel, saldo), [nivel, saldo, comprando]); // eslint-disable-line react-hooks/exhaustive-deps -- `comprando` força reler a posse depois da compra
  /* LOJA = só o que ainda NÃO é seu e NÃO é exclusivo. Possuído vai para "Meu visual";
     exclusivo, para "Conquistas". Os aprimoramentos ficam aqui (são compra em degraus). */
  const itens = useMemo(
    () => CATALOGO_DA_LOJA.filter((i) => {
      if (i.exclusivoDe) return false;
      if (i.tipo === 'aprimoramento') return filtro === 'tudo' || filtro === 'particulas';
      const seu = estadoDoItem(i, nivel, saldo).estado === 'equipavel';
      // Um item recém-comprado nesta visita continua na prateleira como "Liberado" (com Equipar agora).
      if (seu && !recemComprados.has(i.id)) return false;
      return filtro === 'tudo' || i.tipo === filtro;
    }),
    [filtro, nivel, saldo, comprando], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const proxima = proximaRecompensa(nivel);
  const faltamXp = progress.available ? Math.max(0, progress.xpForLevel - progress.xpIntoLevel) : 0;

  const equipadoAtual = (item: ItemDaLoja): boolean => {
    if (item.tipo === 'tema') return theme === item.alvo;
    if (item.tipo === 'fonte') return fonte === item.alvo;
    if (item.tipo === 'particulas') return readParticulas() === item.alvo;
    if (item.tipo === 'posicao') return menuPosition === item.alvo;
    if (item.tipo === 'pack') return readPack() === item.alvo;
    if (item.tipo === 'cursor') return readCursor() === item.alvo;
    if (item.tipo === 'rastro') return readRastro() === item.alvo;
    return false;
  };

  /** "Equipar agora" depois da compra — pelo único caminho que equipa. */
  const equiparAgora = (item: ItemDaLoja, el: HTMLElement | null) => {
    if (!equipavel(item)) { setAba('personalizar'); return; }
    if (equiparItem(item, ctxEquipar)) {
      comemorar('acerto', el, { texto: TEXTOS.emUso });
      force((n) => n + 1);
    }
  };

  /** Compra o PRÓXIMO nível de um aprimoramento (spendId por nível: idempotente por degrau). */
  const aprimorar = async (item: ItemDaLoja, el: HTMLElement | null) => {
    const custo = custoDoProximoNivel(item.alvo);
    if (custo === null) return;
    const proximo = nivelDoAprimoramento(item.alvo) + 1;
    setComprando(item.id);
    try {
      const r = await gastarSeeds({ spendId: `apr-${item.alvo}-n${proximo}`, amount: custo, reason: `aprimoramento:${item.alvo}:${proximo}` });
      if (r && (r as { ok?: boolean }).ok === false) { toast.warn('Não deu para aprimorar agora. Tente de novo.'); return; }
      registrarAprimoramento(item.alvo);
      comemorar('subiuNivel', el, { texto: `Nv. ${proximo}!` });
      explodirAleatorio(2, 'fogos');
      toast.ok(`${item.nome} subiu para o nível ${proximo}!`);
      force((n) => n + 1);
    } catch {
      toast.warn('Não deu para aprimorar agora. Tente de novo.');
    } finally {
      setComprando(null);
    }
  };

  const comprar = async (item: ItemDaLoja, el: HTMLElement | null) => {
    if (item.precoSeeds === undefined) return;
    setComprando(item.id);
    try {
      // spendId fixo por item: comprar de novo (retry, aba duplicada) NÃO cobra de novo.
      const r = await gastarSeeds({ spendId: `loja-${item.id}`, amount: item.precoSeeds, reason: `loja:${item.id}` });
      if (r && (r as { ok?: boolean }).ok === false) {
        toast.warn('Não deu para completar a compra agora. Tente de novo.');
        return;
      }
      marcarPosse(item.id);
      recemComprados.add(item.id);
      comemorar('subiuNivel', el, { texto: 'Seu!' });
      explodirAleatorio(3, 'confete');
      toast.ok(`${item.nome} é seu!`);
      force((n) => n + 1);
    } catch {
      toast.warn('Não deu para completar a compra agora. Tente de novo.');
    } finally {
      setComprando(null);
    }
  };

  const porNivel = useMemo(() => itensPorNivel(), []);
  const possuidosIds = useMemo(() => new Set(colecao.possuidos.map((i) => i.id)), [colecao]);

  return (
    <div className="flex-1 h-full min-h-0 overflow-y-auto custom-scrollbar" aria-label="Personalizar">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-in fade-in duration-300">
      {/* ── TOPO GAMIFICADO: nível com barra de XP, saldo, e a PRÓXIMA recompensa ── */}
      <section className="relative overflow-hidden rounded-3xl border border-border-subtle bg-surface px-6 py-7 sm:px-8">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="sobre-blob absolute -top-14 right-8 w-56 h-56 rounded-full bg-warn/20 blur-3xl" />
          <span className="sobre-blob sobre-blob-2 absolute -bottom-16 -left-8 w-64 h-64 rounded-full bg-accent/15 blur-3xl" />
        </div>
        <div className="relative space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div>
              <p className="label-mono mb-1.5">Personalizar</p>
              <h1 className="font-marca font-bold text-2xl sm:text-3xl text-ink tracking-tight flex items-center gap-2.5">
                <Shirt className="w-7 h-7 text-accent" /> Seu visual, sua progressão
              </h1>
              <p className="text-[13.5px] text-ink-muted mt-1.5 max-w-xl">
                O que é seu fica em <b className="text-ink">Meu visual</b>. Cada nível libera itens de graça; as <b className="text-ink">Seeds</b> compram o atalho na Loja; os <b className="text-ink">exclusivos</b> só saem por conquista.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="card-panel bg-canvas px-4 py-3 text-center min-w-[92px]">
                <p className="font-display font-black text-2xl text-ink tabular-nums">{nivel}</p>
                <p className="text-[10px] uppercase tracking-wider text-ink-muted font-bold">nível</p>
              </div>
              <div className="card-panel bg-canvas px-4 py-3 text-center min-w-[92px]">
                <p className="flex items-center justify-center gap-1 font-display font-black text-2xl text-good tabular-nums">
                  <Sprout className="w-5 h-5" aria-hidden /> {saldo}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-ink-muted font-bold">seeds</p>
              </div>
            </div>
          </div>
          {/* A barra de XP + a próxima recompensa: para onde estou indo. */}
          <div className="card-panel bg-canvas p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-[12px] mb-1.5">
                <span className="font-bold text-ink">{TEXTOS.nivel(nivel)}</span>
                <span className="text-ink-muted tabular-nums">{progress.available ? `${progress.xpIntoLevel} / ${progress.xpForLevel} XP · ${TEXTOS.faltamXp(faltamXp)}` : '…'}</span>
              </div>
              <div className="h-2.5 rounded-full bg-surface border border-border-subtle overflow-hidden" role="progressbar" aria-valuenow={progress.levelPct} aria-valuemax={100} aria-label={`Progresso para o nível ${nivel + 1}`}>
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress.levelPct}%` }} />
              </div>
            </div>
            {proxima && (
              <div className="flex items-center gap-3 sm:border-l sm:border-border-subtle sm:pl-4 min-w-0">
                <span className="text-3xl shrink-0" aria-hidden>{emojiDoItem(proxima.destaque)}</span>
                <div className="min-w-0">
                  <p className="text-[10.5px] uppercase tracking-wider font-black text-ink-faint">{TEXTOS.proximaRecompensa} · {TEXTOS.nivel(proxima.nivel)}</p>
                  <p className="font-bold text-[13.5px] text-ink truncate">{proxima.destaque.nome}{proxima.itens.length > 1 ? <span className="text-ink-muted font-semibold"> +{proxima.itens.length - 1}</span> : null}</p>
                  <button onClick={() => setAba('progressao')} className="text-[11.5px] text-accent-ink underline cursor-pointer">{TEXTOS.verTudoQueVem}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <Abas
        rotuloDoGrupo="Áreas de Personalizar"
        ativo={aba}
        aoTrocar={setAba}
        itens={[
          { id: 'personalizar', rotulo: `Meu visual · ${colecao.possuidos.length}`, icone: <Wand2 className="w-4 h-4" /> },
          { id: 'loja', rotulo: `Loja · ${colecao.compraveis.length + colecao.porNivel.length}`, icone: <ShoppingBag className="w-4 h-4" /> },
          { id: 'conquistas', rotulo: `Conquistas · ${colecao.porConquista.length}`, icone: <Trophy className="w-4 h-4" /> },
          { id: 'progressao', rotulo: 'Progressão', icone: <Map className="w-4 h-4" /> },
        ]}
      />

      <PainelDeAba id="personalizar" ativo={aba}>
        <Personalizar
          theme={theme} setTheme={setTheme} fonte={fonte} setFonte={setFonte}
          nivel={nivel} saldo={saldo}
          ageProfile={ageProfile} setAgeProfile={setAgeProfile}
          menuPosition={menuPosition} setMenuPosition={setMenuPosition}
          onOpenStudio={onOpenStudio}
          onIrParaLoja={() => { setAba('loja'); setFiltro('galeria'); }}
        />
      </PainelDeAba>

      <PainelDeAba id="conquistas" ativo={aba}>
        <Conquistas progress={progress} ctx={ctxConquistas} />
      </PainelDeAba>

      {/* ── PROGRESSÃO: a grade de tudo que dá para liberar, nível a nível ── */}
      <PainelDeAba id="progressao" ativo={aba}>
        <div className="space-y-6">
          <p className="text-[13px] text-ink-muted">Cada linha é um nível e o que ele libera de graça. <Check className="inline w-3.5 h-3.5 text-good" aria-hidden /> é seu · <b className="text-ink">▶</b> é o seu nível · <Lock className="inline w-3 h-3" aria-hidden /> ainda vem. Tudo que tem preço também dá para obter antes, na Loja.</p>
          <ol className="space-y-3">
            {[...porNivel.entries()].map(([n, lista]) => {
              const passado = n < nivel; const atual = n === nivel;
              return (
                <li key={n} className={`card-panel p-4 border-2 ${atual ? 'border-accent bg-accent-soft/40' : passado ? 'border-border-subtle' : 'border-border-subtle opacity-90'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center font-display font-black text-[14px] shrink-0 ${atual ? 'bg-accent text-accent-contrast' : passado ? 'bg-good-soft text-good-ink' : 'bg-canvas border border-border-subtle text-ink-muted'}`}>
                      {passado ? <Check className="w-4 h-4" aria-hidden /> : atual ? '▶' : n}
                    </span>
                    <div>
                      <p className="font-bold text-[14px] text-ink leading-tight">{TEXTOS.nivel(n)}{atual ? ' · você está aqui' : ''}</p>
                      <p className="text-[11.5px] text-ink-muted">{lista.length} {lista.length === 1 ? 'item' : 'itens'}{n > nivel && n === proxima?.nivel ? ` · ${TEXTOS.faltamXp(faltamXp)}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {lista.map((i) => {
                      const seu = possuidosIds.has(i.id);
                      const cor = COR_DA_RARIDADE[i.raridade];
                      return (
                        <span key={i.id} title={i.desc} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[12px] font-bold ${cor.borda} ${cor.fundo} ${seu ? 'text-ink' : n <= nivel ? 'text-ink' : 'text-ink-muted'}`}>
                          <span aria-hidden>{emojiDoItem(i)}</span> {i.nome}
                          {seu ? <Check className="w-3.5 h-3.5 text-good" aria-hidden /> : n > nivel ? <Lock className="w-3 h-3" aria-hidden /> : null}
                          {!seu && n > nivel && i.precoSeeds !== undefined && <span className="text-ink-faint font-semibold">· {i.precoSeeds}</span>}
                        </span>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ol>
          {colecao.porConquista.length > 0 && (
            <section>
              <p className="label-mono mb-2">Só por conquista</p>
              <div className="flex flex-wrap gap-2">
                {CATALOGO_DA_LOJA.filter((i) => i.exclusivoDe).map((i) => {
                  const seu = possuidosIds.has(i.id);
                  const cor = COR_DA_RARIDADE[i.raridade];
                  const { motivo } = estadoDoItem(i, nivel, saldo);
                  return (
                    <span key={i.id} title={i.desc} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[12px] font-bold ${cor.borda} ${cor.fundo} text-ink`}>
                      <Star className="w-3 h-3 fill-warn text-warn" aria-hidden /> <span aria-hidden>{emojiDoItem(i)}</span> {i.nome}
                      {seu ? <Check className="w-3.5 h-3.5 text-good" aria-hidden /> : <span className="text-ink-muted font-semibold">· {motivo}</span>}
                    </span>
                  );
                })}
              </div>
              <button onClick={() => setAba('conquistas')} className="mt-2 text-[12px] text-accent-ink underline cursor-pointer">Ver as conquistas</button>
            </section>
          )}
        </div>
      </PainelDeAba>

      <PainelDeAba id="loja" ativo={aba}>
      <div className="space-y-8">
      {/* ── NO PRÓXIMO NÍVEL: o motivo de continuar ── */}
      {proxima && (
        <section className="card-panel bg-canvas border-accent/30 p-4 sm:p-5">
          <p className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wider text-accent-ink mb-3">
            <Sparkles className="w-4 h-4" /> No nível {proxima.nivel} você libera de graça
          </p>
          <div className="flex flex-wrap gap-2">
            {proxima.itens.map((i) => (
              <span key={i.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12.5px] font-bold text-ink ${COR_DA_RARIDADE[i.raridade].borda} ${COR_DA_RARIDADE[i.raridade].fundo}`}>
                {ICONE_DO_TIPO[i.tipo] ?? <span aria-hidden>{emojiDoItem(i)}</span>} {i.nome}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── FILTROS ── */}
      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            aria-pressed={filtro === f.id}
            className={`px-4 py-2 rounded-xl text-[12.5px] font-bold cursor-pointer border transition-colors ${
              filtro === f.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-surface border-border-subtle text-ink-muted hover:text-ink hover:border-accent'
            }`}
          >
            {f.nome}
          </button>
        ))}
      </div>

      {itens.length === 0 && (
        <p className="text-center text-[13px] text-ink-muted py-6">Nada para comprar neste filtro: tudo já é seu. Veja em <button onClick={() => setAba('personalizar')} className="underline text-accent-ink cursor-pointer">Meu visual</button>.</p>
      )}

      {/* ── PRATELEIRAS ── */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {itens.map((item) => {
          const { estado, motivo } = estadoDoItem(item, nivel, saldo);
          const raridade = COR_DA_RARIDADE[item.raridade];
          const equipado = estado === 'equipavel' && equipadoAtual(item);
          return (
            <div
              key={item.id}
              className={`card-panel overflow-hidden flex flex-col transition-all hover:-translate-y-1 hover:shadow-card border-2 ${raridade.borda} ${estado === 'bloqueado' ? 'opacity-80' : ''}`}
              onMouseEnter={(e) => {
                // Prévia VIVA: partículas soltam uma amostra ao passar o mouse no card delas.
                if (item.tipo === 'particulas' && estado !== 'bloqueado') {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  emitBurst(r.left + r.width / 2, r.top + r.height / 3, 'xp');
                }
              }}
            >
              {/* Prévia */}
              <div className={`h-24 flex items-center justify-center gap-2 ${raridade.fundo} border-b ${raridade.borda}`}>
                {item.previa ? (
                  <span className="flex -space-x-1.5">
                    {item.previa.map((c, i) => (
                      <span key={i} className="w-9 h-9 rounded-full border-2 border-surface shadow-sm shrink-0" style={{ backgroundColor: c }} />
                    ))}
                  </span>
                ) : item.tipo === 'particulas' ? (
                  <span className="font-display font-black text-3xl select-none" aria-hidden>
                    {item.alvo === 'coracoes' ? '💛🧡❤️' : item.alvo === 'estrelas' ? '⭐✨🌟' : item.alvo === 'confete' ? '🎊🎉' : item.alvo === 'emoji' ? PACKS_DE_EMOJI.find((pk) => pk.id === readPack())?.emojis.slice(0, 3).join('') : '🟧🟨🟩'}
                  </span>
                ) : item.tipo === 'pack' ? (
                  <span className="font-display font-black text-2xl select-none tracking-wider" aria-hidden>
                    {PACKS_DE_EMOJI.find((pk) => pk.id === item.alvo)?.emojis.slice(0, 4).join(' ')}
                  </span>
                ) : item.tipo === 'cursor' ? (
                  <span className="font-display font-black text-4xl select-none" aria-hidden>
                    {CURSORES.find((c) => c.id === item.alvo)?.emoji}
                  </span>
                ) : item.tipo === 'rastro' ? (
                  <span className="font-display font-black text-3xl select-none" aria-hidden>
                    {item.alvo === 'off' ? '🚫' : item.alvo === 'coracoes' ? '🖱️💨❤️' : item.alvo === 'estrelas' ? '🖱️💨⭐' : item.alvo === 'emoji' ? '🖱️💨🦆' : '🖱️💨✨'}
                  </span>
                ) : item.tipo === 'aprimoramento' ? (
                  <span className="font-display font-black text-4xl select-none" aria-hidden>
                    {item.alvo === 'sorte' ? '🎲' : '💥'}
                  </span>
                ) : item.tipo === 'estudio' ? (
                  <Wand2 className="w-10 h-10 text-warn" aria-hidden />
                ) : item.tipo === 'galeria' ? (
                  <span className="font-display font-black text-3xl select-none" aria-hidden>
                    {item.alvo.startsWith('estilo:') ? '🎨' : item.alvo === 'editor-pack' ? '✏️' : item.alvo === 'cursor-emoji' ? '🖱️' : (item.desc.match(/\p{Extended_Pictographic}+/gu) ?? ['✨']).slice(0, 3).join('')}
                  </span>
                ) : (
                  <Gamepad2 className="w-10 h-10 text-ink-muted" aria-hidden />
                )}
              </div>

              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-[14px] text-ink leading-tight">{item.nome}</h3>
                  <span className={`shrink-0 text-[9.5px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${raridade.borda} ${raridade.fundo} text-ink`}>
                    {raridade.rotulo}
                  </span>
                </div>
                <p className="text-[12px] text-ink-muted leading-snug flex-1">{item.desc}</p>

                {item.tipo === 'aprimoramento' ? (
                  (() => {
                    const nv = nivelDoAprimoramento(item.alvo);
                    const custo = custoDoProximoNivel(item.alvo);
                    const pct = progressoDoAprimoramento(item.alvo);
                    return (
                      <div className="space-y-2">
                        {/* A barra de progressão do upgrade — o "battle pass" do item. */}
                        <div>
                          <div className="flex items-center justify-between text-[11px] font-black mb-1">
                            <span className="text-ink">Nv. {nv} / {NIVEL_MAXIMO}</span>
                            <span className="text-ink-muted tabular-nums">{pct}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-canvas border border-border-subtle overflow-hidden">
                            <div className="h-full rounded-full bg-warn transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        {custo === null ? (
                          <div className="w-full py-2 rounded-xl bg-warn/15 border border-warn text-center text-[12.5px] font-black text-warn-ink">★ Dominado</div>
                        ) : (
                          <button
                            onClick={(e) => void aprimorar(item, e.currentTarget)}
                            disabled={comprando === item.id || saldo < custo}
                            className="w-full py-2.5 rounded-xl bg-warn hover:brightness-110 text-white font-bold text-[13px] shadow-btn transition-all cursor-pointer disabled:opacity-50"
                          >
                            <span className="inline-flex items-center gap-1.5"><Sprout className="w-4 h-4" /> {comprando === item.id ? 'Aprimorando…' : `Aprimorar · ${custo} Seeds`}</span>
                          </button>
                        )}
                        {item.alvo === 'particulas' && nv > 0 && (
                          <div>
                            <p className="text-[10.5px] uppercase tracking-wider font-black text-ink-faint mb-1">Intensidade (sua escolha)</p>
                            <div className="grid grid-cols-3 gap-1 p-1 bg-canvas border border-border-subtle rounded-xl">
                              {(['pequena', 'media', 'grande'] as Intensidade[]).map((intz) => {
                                const teto = intensidadeMaxima(nv);
                                const permitida = ['pequena', 'media', 'grande'].indexOf(intz) <= ['pequena', 'media', 'grande'].indexOf(teto);
                                return (
                                  <button
                                    key={intz}
                                    disabled={!permitida}
                                    onClick={(e) => {
                                      setIntensidade(intz);
                                      force((n) => n + 1);
                                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                      emitBurst(r.left + r.width / 2, r.top, 'xp');
                                    }}
                                    aria-pressed={lerIntensidade() === intz}
                                    className={`py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                      lerIntensidade() === intz ? 'bg-accent text-accent-contrast' : 'text-ink-muted hover:text-ink'
                                    }`}
                                    title={permitida ? undefined : `Requer Nv. ${intz === 'grande' ? 2 : 1}`}
                                  >
                                    {intz === 'pequena' ? 'Pequena' : intz === 'media' ? 'Média' : 'Grande'}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : estado === 'equipavel' ? (
                  /* Recém-comprado: "Equipar agora" pelo caminho único; capacidade da galeria leva ao Meu visual. */
                  <button
                    onClick={(e) => equiparAgora(item, e.currentTarget)}
                    className={`w-full py-2.5 rounded-xl font-bold text-[13px] transition-all cursor-pointer ${
                      equipado ? 'bg-good-soft text-good-ink' : 'bg-accent text-accent-contrast hover:brightness-110'
                    }`}
                  >
                    {equipado
                      ? <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4" /> {TEXTOS.emUso}</span>
                      : item.tipo === 'estudio' ? 'Abrir o Estúdio'
                      : equipavel(item) ? <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4" /> {TEXTOS.liberado} · {TEXTOS.equiparAgora}</span>
                      : <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4" /> {TEXTOS.liberado} · usar no Meu visual</span>}
                  </button>
                ) : estado === 'compravel' ? (
                  <button
                    onClick={(e) => void comprar(item, e.currentTarget)}
                    disabled={comprando === item.id}
                    className="w-full py-2.5 rounded-xl bg-good hover:brightness-110 text-white font-bold text-[13px] shadow-btn transition-all cursor-pointer disabled:opacity-60"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Sprout className="w-4 h-4" /> {comprando === item.id ? 'Comprando…' : TEXTOS.obter(item.precoSeeds!)}
                    </span>
                  </button>
                ) : (
                  <div className="w-full py-2.5 rounded-xl bg-canvas border border-border-subtle text-center text-[12.5px] font-bold text-ink-muted">
                    <span className="inline-flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> {motivo}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* O rodapé lê das REGRAS: o que a Loja diz sobre ganhar Seeds é o que o sistema credita. */}
      <p className="text-center text-[11.5px] text-ink-faint pb-4">
        Seeds se ganham fazendo: {REGRAS.filter((r) => r.seeds > 0).slice(0, 4).map((r) => `${r.seeds} ${r.unidade}`).join(' · ')}.
        {' '}<button onClick={() => setAba('conquistas')} className="underline hover:text-accent cursor-pointer">Ver todas as regras</button>. Nada aqui custa dinheiro.
      </p>
      </div>
      </PainelDeAba>
    </div>
    </div>
  );
}
