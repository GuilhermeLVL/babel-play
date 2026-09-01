import { useState } from 'react';
import { Save, Trash2, Wand2, Lock, ShoppingBag, Undo2, Pencil, Gamepad2, Zap, Eye } from 'lucide-react';
import { toast } from '../Toast';
import { comemorar, explodirAleatorio } from '../../lib/juice';
import { paletaPorId, lerPaletaAtiva, gravarPaletaAtiva, type Paleta } from '../../lib/galeria/paletas';
import { CATEGORIAS_DE_EMOJI } from '../../lib/galeria/emojis';
import { PRESETS, perfisSalvos, salvarPerfil, apagarPerfil, renomearPerfil, type Perfil } from '../../lib/galeria/perfis';
import { restaurarVisualPadrao } from '../../lib/galeria/restaurar';
import { palavraDeNivel } from '../../lib/galeria/textos';
import { acessoAoEstilo, faltaParaOPerfil } from '../../lib/galeria/acesso';
import { PARTICULAS_OPTIONS, PACKS_DE_EMOJI, PACK_CUSTOM, readParticulas, setParticulas, readPack, setPack, setPackCustom, lerPackCustom } from '../../lib/particulas';
import { CURSORES, readCursor, setCursor, emojiDoCursor } from '../../lib/cursores';
import { readRastro, setRastro, estiloDeRastro } from '../../lib/rastroDoMouse';
import { applyCustomColors, FONTE_OPTIONS, type ThemeType, type FonteType } from '../../lib/appearance';
import Inventario from './personalizar/Inventario';
import type { AgeProfileType, MenuPositionType } from '../shell/navItems';

/**
 * MEU VISUAL — o inventário, os perfis de um toque, e o perfil de exibição.
 *
 * O QUE SAIU DAQUI (e para onde foi), na limpeza pedida pelo dono em 01/09: "está tendo um
 * acúmulo de conteúdo legado; remova o que é passado e deixe o novo".
 *
 * Esta tela carregava um acordeão de OITO seções chamado "Monte o seu, peça por peça". Sete
 * delas ofereciam de novo o que a grade do inventário já faz — escolher tema, fonte, partícula,
 * pack, cursor, rastro, posição do menu — só que numa lista de chips, com outro desenho e outra
 * régua de cadeado. Duas telas para a mesma decisão é exatamente o que fazia o app parecer
 * desconectado de si mesmo.
 *
 * O que era PROFUNDIDADE e não repetição (as 200 paletas, o editor do pack, o cursor de qualquer
 * emoji, o rastro de emojis) mudou de lugar em vez de sumir: agora abre pelo botão "Personalizar"
 * da peça, em `personalizar/EditorDoItem`. A pergunta nasce na peça, e é lá que ela é respondida.
 *
 * O QUE FICOU AQUI, e por que não cabia no inventário:
 *  · PERFIS — trocam o visual INTEIRO num toque; não são uma peça para equipar.
 *  · PERFIL DE EXIBIÇÃO — é acessibilidade, sempre grátis, e não é item de catálogo nenhum.
 *    Fica sem cadeado e sem acordeão, porque direito não se esconde atrás de um clique.
 */
interface PersonalizarProps {
  theme: ThemeType;
  setTheme: (t: ThemeType) => void;
  fonte: FonteType;
  setFonte: (f: FonteType) => void;
  nivel: number;
  saldo: number;
  onIrParaLoja: () => void;
  ageProfile: AgeProfileType;
  setAgeProfile: (p: AgeProfileType) => void;
  menuPosition: MenuPositionType;
  setMenuPosition: (p: MenuPositionType) => void;
  onOpenStudio: () => void;
}

export default function Personalizar({ theme, setTheme, fonte, setFonte, nivel, saldo, onIrParaLoja, ageProfile, setAgeProfile, menuPosition, setMenuPosition, onOpenStudio }: PersonalizarProps) {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [nomeDoPerfil, setNomeDoPerfil] = useState('');
  const saldoAgora = saldo;

  const packCustom = lerPackCustom();
  const rastroAtual = readRastro();
  const cursorAtual = readCursor();
  const paletaAtiva = lerPaletaAtiva();
  const estiloDaPaleta = (id: string) => paletaPorId(id)?.estilo;
  const ctxAcesso = { nivel, saldo: saldoAgora, estiloDaPaleta, categorias: CATEGORIAS_DE_EMOJI };

  /* A régua na FUNÇÃO, não só no botão (spec galeria-gating-fechado): qualquer caminho que
     aplique uma paleta — inclusive um perfil salvo — esbarra aqui. */
  const aplicarPaleta = (p: Paleta) => {
    const acesso = acessoAoEstilo(p.estilo, nivel, saldoAgora);
    if (!acesso.liberado) { toast.warn(`Estilo ainda trancado — ${acesso.motivo}.`); return; }
    applyCustomColors({ canvas: p.canvas, surface: p.surface, ink: p.ink, accent: p.accent });
    setTheme('custom');
    gravarPaletaAtiva(p.id);
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

  /* O direito de desfazer (ux-v2 §3): devolve o padrão do app num clique, posse intacta. */
  const voltarAoOriginal = () => {
    const { tema, fonte: fontePadrao } = restaurarVisualPadrao();
    setTheme(tema);
    setFonte(fontePadrao);
    toast.ok('Visual original de volta. Tudo o que você desbloqueou continua seu.');
    rerender();
  };

  const renomear = (p: Perfil) => {
    // prompt nativo: um campo, teclado-acessível, sem estado novo — suficiente para um nome.
    const nome = window.prompt(`Novo nome para "${p.nome}":`, p.nome);
    if (nome === null) return;
    if (renomearPerfil(p.id, nome)) { toast.ok(`Perfil renomeado para "${nome.trim()}".`); rerender(); }
    else toast.warn('O nome não pode ficar vazio.');
  };

  /** Um cartão para os dois grupos (meus e prontos): aplicar, e nos meus renomear/apagar. */
  const CartaoDePerfil = ({ p }: { p: Perfil }) => {
    const pal = p.paleta ? paletaPorId(p.paleta) : null;
    const falta = faltaParaOPerfil(p, ctxAcesso);
    const trancado = falta.length > 0;
    return (
      <div className={`card-panel p-3 border-2 ${trancado ? 'border-border-subtle opacity-90' : 'border-border-subtle hover:border-accent'} flex flex-col gap-1.5`}>
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
        {p.proprio && (
          <span className="flex items-center gap-3">
            <button onClick={() => renomear(p)} className="text-[11px] text-ink-faint hover:text-ink inline-flex items-center gap-1 cursor-pointer"><Pencil className="w-3 h-3" aria-hidden /> renomear</button>
            <button onClick={() => { apagarPerfil(p.id); rerender(); }} className="text-[11px] text-ink-faint hover:text-error inline-flex items-center gap-1 cursor-pointer"><Trash2 className="w-3 h-3" aria-hidden /> apagar</button>
          </span>
        )}
      </div>
    );
  };

  const paletaNome = theme === 'custom' && paletaAtiva ? paletaPorId(paletaAtiva)?.nome ?? 'Paleta' : `Tema ${theme}`;
  const packNome = readPack() === PACK_CUSTOM ? `Meu pack (${packCustom.length})` : PACKS_DE_EMOJI.find((p) => p.id === readPack())?.nome ?? 'Clássico';
  /* Meus perfis primeiro: o que a pessoa montou vale mais do que o que veio de fábrica. */
  const meusPerfis = perfisSalvos();

  return (
    <div className="space-y-6">
      {/* ── O INVENTÁRIO (protótipo aprovado 01/09) ──────────────────────────────────────
             Loadout, categorias, o acervo inteiro e a prévia com origem, equipar e
             personalizar. Ele é o único lugar da tela onde se troca uma peça. */}
      <Inventario
        nivel={nivel}
        saldo={saldoAgora}
        ctx={{ setTheme, setFonte, setMenuPosition, onOpenStudio, nivel, saldo: saldoAgora }}
        equipadoAtual={(i) => (
          i.tipo === 'tema' ? theme === i.alvo
          : i.tipo === 'fonte' ? fonte === i.alvo
          : i.tipo === 'particulas' ? readParticulas() === i.alvo
          : i.tipo === 'posicao' ? menuPosition === i.alvo
          : i.tipo === 'pack' ? readPack() === i.alvo
          : i.tipo === 'cursor' ? cursorAtual === i.alvo
          : i.tipo === 'rastro' ? rastroAtual === i.alvo
          : false
        )}
        loadout={[
          { chave: 'tema', rotulo: 'Tema', valor: paletaNome, icone: '🎨', categoria: 'tema' },
          { chave: 'particulas', rotulo: 'Partículas', valor: PARTICULAS_OPTIONS.find((o) => o.id === readParticulas())?.name ?? '—', icone: '✨', categoria: 'particulas' },
          { chave: 'rastro', rotulo: 'Rastro', valor: estiloDeRastro(rastroAtual)?.nome ?? 'sem rastro', icone: '💫', categoria: 'rastro' },
          { chave: 'cursor', rotulo: 'Cursor', valor: CURSORES.find((c) => c.id === cursorAtual)?.nome ?? 'Emoji', icone: emojiDoCursor(cursorAtual) ?? '🖱️', categoria: 'cursor' },
          { chave: 'pack', rotulo: 'Emojis', valor: packNome, icone: '😀', categoria: 'pack' },
          { chave: 'fonte', rotulo: 'Fonte', valor: FONTE_OPTIONS.find((f) => f.id === fonte)?.name ?? fonte, icone: '🔤', categoria: 'fonte' },
        ]}
        onIrParaLoja={onIrParaLoja}
        aoMudar={rerender}
      />

      {/* Salvar, liberar mais e desfazer — as três ações sobre o visual INTEIRO, e não sobre uma
          peça: por isso ficam fora do inventário, embaixo dele. */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={nomeDoPerfil} onChange={(e) => setNomeDoPerfil(e.target.value)} placeholder="Nome para salvar este visual" className="flex-1 min-w-[12rem] px-3 py-2 rounded-xl bg-surface border border-border-subtle text-[13px] text-ink outline-none focus:border-accent" />
        <button onClick={salvarAtual} className="btn-solid"><Save className="w-4 h-4" aria-hidden /> Salvar como perfil</button>
        <button onClick={onIrParaLoja} className="btn-outline"><ShoppingBag className="w-4 h-4" aria-hidden /> Liberar mais na Loja</button>
        {/* DIREITO, não recompensa: desfazer o visual nunca depende de nível nem de Seeds. */}
        <button onClick={voltarAoOriginal} className="btn-outline"><Undo2 className="w-4 h-4" aria-hidden /> Voltar ao visual original</button>
      </div>

      {/* ── PERFIS: um toque muda tudo ──────────────────────────────────────────────────
             Eram duas seções com dois títulos ("meus salvos" e "prontos"); viraram uma, com os
             seus na frente. A diferença entre os dois grupos é quem fez — e isso o cartão já
             diz, porque só o seu tem renomear e apagar. */}
      <section>
        <p className="label-mono mb-2 flex items-center gap-1.5">
          <Wand2 className="w-3.5 h-3.5" aria-hidden /> Perfis: um toque muda tudo
          <span className="text-ink-faint">· {meusPerfis.length + PRESETS.length}</span>
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {meusPerfis.map((p) => <CartaoDePerfil key={p.id} p={p} />)}
          {PRESETS.map((p) => <CartaoDePerfil key={p.id} p={p} />)}
        </div>
      </section>

      {/* ── PERFIL DE EXIBIÇÃO ───────────────────────────────────────────────────────────
             DIREITO declarado onde mora (ux-v2 §4.4): a seção vive numa tela de recompensas e o
             leigo lia o perfil como mais um cosmético trancável. Sem cadeado, sem acordeão. */}
      <section className="card-panel bg-canvas p-4">
        <p className="label-mono mb-1.5">Perfil de exibição</p>
        <p className="text-[12px] text-ink-muted mb-3 max-w-[72ch]">
          Muda a linguagem e a densidade das telas. Não muda o tema nem esconde recurso nenhum.{' '}
          <b className="text-ink">Isto é acessibilidade: sempre grátis, em qualquer {palavraDeNivel().toLowerCase()}.</b>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {([
            { id: 'kids' as const, icon: Gamepad2, label: 'Kids / Gamer', desc: 'Missões, recompensas e linguagem de jogo.' },
            { id: 'pro' as const, icon: Zap, label: 'Produtividade', desc: 'Densidade alta e vocabulário técnico.' },
            { id: 'senior' as const, icon: Eye, label: 'Leitura ampliada', desc: 'Passo a passo, alvos de 48px e mais respiro.' },
          ]).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setAgeProfile(opt.id)}
              aria-pressed={ageProfile === opt.id}
              className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                ageProfile === opt.id ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border-subtle bg-surface hover:border-accent text-ink-muted'
              }`}
            >
              <span className="flex items-center gap-2 font-bold text-[13px]"><opt.icon className="w-4 h-4 shrink-0" aria-hidden /> {opt.label}</span>
              <span className="block text-[11.5px] mt-1 opacity-80">{opt.desc}</span>
            </button>
          ))}
        </div>
        <p className="text-[11.5px] text-ink-faint mt-3">
          A posição do menu virou peça de inventário: está na categoria <b className="text-ink-muted">Layout</b>, ali em cima.
        </p>
      </section>
    </div>
  );
}
