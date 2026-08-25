import React, { useState, useEffect, useCallback } from 'react';
import { Mic, Headphones, Plus, Zap, Volume2 } from 'lucide-react';
import { seedFromSelection, type ExerciseId } from '../lib/sentences';
import { speak as ttsSpeak } from '../lib/tts';
import { resolveSpokenLang } from '../lib/spokenLang';

/**
 * MENU DE PRÁTICA — selecione qualquer texto, em qualquer tela, e clique com o botão direito.
 *
 * Este é o atalho que elimina o maior atrito da app: até aqui, praticar um trecho exigia sair da
 * tela, achar a Central de Exercícios (que não era nem uma view de primeiro nível), garimpar o
 * exercício certo entre cards duplicados e então… descobrir que ele rodava num texto fixo em inglês,
 * não no seu. Agora o conteúdo vem até o exercício.
 *
 * É global: montado uma vez no `<main>` do App, funciona sobre qualquer texto de qualquer view.
 */
interface PracticeMenuProps {
  /** Navegação do App (`navigateTo`). O menu envia a semente junto. */
  onChangeView: (view: string, data?: any) => void;
  /** Sessão em foco, para amarrar a prática à sessão de origem. */
  sessionId?: string;
  /** Idioma estudado configurado — fallback quando não dá para saber o idioma da seleção. */
  studyLang?: string;
}

interface MenuState {
  x: number;
  y: number;
  text: string;
}

const MENU_W = 248;
const MENU_H = 232;

export default function PracticeMenu({ onChangeView, sessionId, studyLang = '' }: PracticeMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);

  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const sel = window.getSelection();
      const text = (sel?.toString() ?? '').trim();

      // Sem seleção → deixa o menu nativo do navegador aparecer (não sequestramos o botão direito
      // à toa; isso é o tipo de coisa que irrita mais do que ajuda).
      if (!text || text.length < 2) {
        setMenu(null);
        return;
      }
      // Não interfere em campos editáveis (o usuário quer copiar/colar de verdade ali).
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, [contenteditable="true"]')) return;

      e.preventDefault();

      // Mantém o menu dentro da viewport (mesma matemática do popover do Analysis).
      const x = Math.min(Math.max(8, e.clientX), window.innerWidth - MENU_W - 8);
      const y = e.clientY + MENU_H > window.innerHeight
        ? Math.max(8, e.clientY - MENU_H)
        : e.clientY;

      setMenu({ x, y, text });
    };

    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest('[data-practice-menu]')) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };

    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
    };
  }, [close]);

  if (!menu) return null;

  /**
   * O idioma da seleção é CONFERIDO CONTRA O TEXTO antes de virar semente.
   *
   * Antes, esta função carimbava `studyLang` em qualquer seleção — o comentário aqui até afirmava
   * que "nada é chutado", mas o código chutava: selecionar uma frase em inglês com o deck em
   * português produzia `seed.lang = 'pt'`. Esse rótulo falso viajava até o exercício e virava voz
   * errada no narrador e idioma errado no reconhecedor de fala (nota de pronúncia sem significado).
   * `resolveSpokenLang` só troca o idioma quando o TEXTO discorda com confiança; sem sinal, o
   * declarado prevalece.
   */
  const practice = async (exercise: ExerciseId) => {
    const text = menu.text;
    const spoken = await resolveSpokenLang(text, studyLang);
    const seed = seedFromSelection(text, spoken.lang, exercise, sessionId);
    /* O DESTINO DEPENDE DE ONDE O EXERCÍCIO MORA: revisão espaçada e produção ativa no Estudo, os
       jogos no Jogar. Mandar tudo para o Estudo, como era antes, agora levaria a uma tela que não
       tem mais aquele exercício. */
    onChangeView(exercise === 'review' || exercise === 'active_production' ? 'study' : 'play', { seed, id: sessionId });
    close();
  };

  /** Mesma regra para o "Ouvir": narrar o texto no idioma DELE, não no idioma que o deck declara. */
  const listen = async () => {
    const text = menu.text;
    close();
    const spoken = await resolveSpokenLang(text, studyLang);
    ttsSpeak(text, { lang: spoken.bcp47 || undefined });
  };

  const preview = menu.text.length > 52 ? menu.text.slice(0, 52) + '…' : menu.text;
  const isSingleWord = !/\s/.test(menu.text.trim());

  const Item = ({
    icon, label, hint, onClick,
  }: { icon: React.ReactNode; label: string; hint: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover transition-colors cursor-pointer group"
    >
      <span className="text-ink-muted group-hover:text-accent transition-colors shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-bold text-ink leading-tight">{label}</span>
        <span className="block text-[10px] text-ink-faint leading-tight">{hint}</span>
      </span>
    </button>
  );

  return (
    <div
      data-practice-menu
      role="menu"
      style={{ left: menu.x, top: menu.y, width: MENU_W }}
      className="fixed z-50 bg-surface border border-border-subtle rounded-xl shadow-card overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      <div className="px-3 py-2 border-b border-border-subtle bg-canvas">
        <p className="text-[9px] font-mono font-bold uppercase tracking-wider text-ink-faint">Praticar com</p>
        <p className="text-[11px] text-ink font-semibold truncate italic">"{preview}"</p>
      </div>

      <div className="py-1">
        {/* OS DESTINOS MUDARAM quando os exercícios legados saíram, e mudaram para o substituto
            de verdade — não para o lobby genérico. O trecho selecionado viaja junto e entra na
            frente da fila da rodada (ver `priorizar` em `Play.tsx`).

            "Reescrever este trecho" SAIU e não foi substituído: o exercício de reescrita dependia
            de um LLM julgando estilo, o que não é jogo de vocabulário e não vira um sem virar
            outro produto. Deixá-lo apontando para qualquer coisa seria pior que tirá-lo. */}
        <Item
          icon={<Mic className="w-3.5 h-3.5" />}
          label="Falar esta frase"
          hint="karaokê: ouça, repita e veja palavra a palavra o que escapou"
          onClick={() => practice('karaoke')}
        />
        <Item
          icon={<Headphones className="w-3.5 h-3.5" />}
          label="Escrever o que ouvir"
          hint="ditado do áudio real, com ajuda progressiva"
          onClick={() => practice('ditado')}
        />
        <Item
          icon={<Zap className="w-3.5 h-3.5" />}
          label="Duelo relâmpago"
          hint="questões rápidas com as palavras deste trecho"
          onClick={() => practice('blitz')}
        />
        {isSingleWord && (
          <Item
            icon={<Plus className="w-3.5 h-3.5" />}
            label="Adicionar ao deck"
            hint="revisão espaçada (SRS)"
            onClick={() => practice('review')}
          />
        )}
      </div>

      <div className="border-t border-border-subtle">
        <Item
          icon={<Volume2 className="w-3.5 h-3.5" />}
          label="Ouvir"
          hint="pronúncia na sua voz preferida"
          onClick={() => { void listen(); }}
        />
      </div>
    </div>
  );
}
