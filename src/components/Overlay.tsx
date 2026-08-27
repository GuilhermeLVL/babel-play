import React, { useEffect, useRef, useState } from 'react';
import { EyeOff, MousePointer, Palette, ArrowDown, Volume2, Film, MessagesSquare, Gamepad2, Brain, Star, Radio, type LucideIcon } from 'lucide-react';
import { LangChip } from './LangFlag';
import { initials } from './ChatTranscript';
import { THEME_OPTIONS, type ThemeType } from '../lib/appearance';
import { readAppearance, applyAppearance, type StyledElement } from '../lib/appearanceSync';
import { patchUiSettings, fetchSettings } from '../data/api';

/**
 * Legenda ao vivo para o overlay. Vem SEMPRE das falas reais capturadas
 * (LiveCapture) — nunca de texto de demonstração. `side` diz de quem é a fala:
 * 'inbound' = áudio do sistema/aba (eles), 'outbound' = microfone (você).
 */
export interface OverlayCaption {
  id: string;
  speaker: string;
  original: string;
  translated: string;
  side: 'inbound' | 'outbound';
  /** Cor da PESSOA identificada (diarização) — colore nome e borda do balão. */
  speakerColor?: string;
  /** BCP-47 REAIS desta fala (multi-idioma): original e tradução. Sem eles, cai no par da sessão. */
  origLang?: string;
  transLang?: string;
}

interface OverlayProps {
  isVisible: boolean;
  onClose: () => void;
  /** Cor de fundo da janela PiP (o pai controla; 'transparent' = fundo mágico). */
  bgColor: string;
  onBgColorChange: (c: string) => void;
  /** Histórico cronológico das falas reais (mais antiga → mais recente). */
  captions: OverlayCaption[];
  /** BCP-47 do meu idioma (fonte) e do idioma deles (alvo) — para escolher a voz do TTS. */
  myLang: string;
  theirLang: string;
  /** Fala um texto no idioma dado (o pai injeta usando src/lib/tts.ts + prefs). */
  onSpeak?: (text: string, lang: string) => void;
}

type LayoutMode = 'video' | 'conversation' | 'game';
type Independence = 'assisted' | 'intermediate' | 'immersion';

/** Após quantos ms de silêncio o aviso "aguardando fala" pode aparecer. */
const WAITING_DELAY_MS = 4000;

/**
 * TODA a aparência/comportamento do overlay num objeto só — é isto que persiste
 * (antes cada cor era um useState solto que RESETAVA a cada abertura) e é isto
 * que uma predefinição aplica de uma vez.
 */
export interface OverlaySettings {
  layoutMode: LayoutMode;
  /**
   * TEMA PRÓPRIO do overlay. 'app' = segue o tema do aplicativo (padrão). Qualquer outro valor
   * pinta só esta janela — a legenda que fica por cima de um jogo tem exigência diferente da
   * interface principal (um tema escuro de alto contraste costuma ser melhor ali, mesmo com o
   * app no claro). Aplicado por `data-theme` no wrapper, como `EditablePanel` já faz por painel.
   */
  theme: ThemeType | 'app';
  /** 'app' = segue o modo do aplicativo; true/false força claro ou escuro só aqui. */
  dark: 'app' | boolean;
  bgColor: string;               // 'transparent' = fundo mágico
  originalTextColor: string;
  translatedTextColor: string;
  inboundColor: string;          // '' = tema
  outboundColor: string;         // '' = tema
  independence: Independence;
  /** Multiplicador do tamanho das legendas (0.7–1.6). */
  fontScale: number;
  videoShowHistory: boolean;
}

const DEFAULT_OVERLAY: OverlaySettings = {
  layoutMode: 'video',
  theme: 'app',
  dark: 'app',
  bgColor: 'transparent',
  originalTextColor: '#FFFFFF',
  translatedTextColor: '#FFEA00',
  inboundColor: '',
  outboundColor: '',
  independence: 'intermediate',
  fontScale: 1,
  videoShowHistory: false,
};

/** Predefinições de fábrica — um clique configura o overlay inteiro para o cenário.
 *  Ícones (lucide) em vez de emoji: consistência visual com o resto do app. */
const OVERLAY_PRESETS: Array<{ id: string; nome: string; settings: Partial<OverlaySettings> }> = [
  { id: 'filme', nome: 'Filme', settings: { layoutMode: 'video', bgColor: 'transparent', originalTextColor: '#FFFFFF', translatedTextColor: '#FFEA00', independence: 'intermediate', fontScale: 1, videoShowHistory: false } },
  { id: 'conversa', nome: 'Conversa', settings: { layoutMode: 'conversation', bgColor: 'transparent', inboundColor: '', outboundColor: '', independence: 'assisted', fontScale: 1 } },
  { id: 'jogo', nome: 'Jogo', settings: { layoutMode: 'game', bgColor: 'transparent', originalTextColor: '#FFFFFF', translatedTextColor: '#9AE6B4', independence: 'intermediate', fontScale: 0.85 } },
  { id: 'imersao', nome: 'Imersão', settings: { layoutMode: 'video', independence: 'immersion', fontScale: 1.1, videoShowHistory: false } },
];

const PRESET_ICONS: Record<string, LucideIcon> = {
  filme: Film,
  conversa: MessagesSquare,
  jogo: Gamepad2,
  imersao: Brain,
};

const OVERLAY_KEY = 'babel.overlaySettings';
const MY_PRESET_KEY = 'babel.overlayMyPreset';

function loadOverlaySettings(): OverlaySettings {
  try {
    const raw = localStorage.getItem(OVERLAY_KEY);
    if (raw) return { ...DEFAULT_OVERLAY, ...(JSON.parse(raw) as Partial<OverlaySettings>) };
  } catch { /* corrompido → defaults */ }
  return DEFAULT_OVERLAY;
}

/** Contorno padrão das legendas do modo vídeo (legível sobre qualquer fundo). */
const CAPTION_OUTLINE = '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 4px 10px rgba(0,0,0,0.8)';

/**
 * Lista rolável com auto-scroll até o fim — mas só enquanto o usuário estiver
 * "grudado" embaixo. Se ele rolar para cima para reler algo, paramos de puxar e
 * mostramos um botão "novas" para voltar ao fim. Serve os modos conversa e jogo.
 */
function CaptionScroller({
  items,
  containerClassName,
  renderItem,
}: {
  items: OverlayCaption[];
  containerClassName: string;
  /** `anterior`/`proximo` permitem agrupar falas seguidas da mesma pessoa (ver modo conversa). */
  renderItem: (c: OverlayCaption, anterior?: OverlayCaption, proximo?: OverlayCaption) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  const prevLenRef = useRef(items.length);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
      setShowJump(false);
    } else if (items.length > prevLenRef.current) {
      setShowJump(true);
    }
    prevLenRef.current = items.length;
  }, [items]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    pinnedRef.current = pinned;
    if (pinned) setShowJump(false);
  };

  const jumpToEnd = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
    setShowJump(false);
  };

  // `min-h-0 flex flex-col` faz a lista ENCOLHER dentro da coluna disponível em vez de
  // empurrar o pai. É o que permite ao scroller interno usar `flex-1 min-h-0` e ter como
  // teto a altura REAL da janela — antes cada chamador cravava uma fração do viewport
  // (`max-h-[55vh]`), que ignora a barra de controles e sobra 1/3 da coluna vazia.
  return (
    <div className="relative pointer-events-auto min-h-0 flex flex-col">
      <div ref={ref} onScroll={onScroll} className={containerClassName}>
        {items.map((c, i) => renderItem(c, items[i - 1], items[i + 1]))}
      </div>
      {showJump && (
        <button
          onClick={jumpToEnd}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-accent text-white text-[11px] font-bold px-3 py-1.5 rounded-full shadow-xl animate-in fade-in slide-in-from-bottom-2"
        >
          <ArrowDown className="w-3 h-3" /> novas falas
        </button>
      )}
    </div>
  );
}

export default function Overlay({ isVisible, onClose, bgColor, onBgColorChange, captions, myLang, theirLang, onSpeak }: OverlayProps) {
  const [clickThrough, setClickThrough] = useState(true);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  /**
   * A barra de controles ABERTA ou recolhida na alça. Quem usa overlay costuma ter um
   * monitor só: a barra ocupava uma linha do flex e cobrava ~74px de altura PERMANENTES
   * (17% de uma janela de 440px) mesmo ociosa e a 40% de opacidade. Agora ela é `absolute`
   * — não cobra altura nenhuma — e fica recolhida na alça até o ponteiro chegar perto.
   */
  const [barOpen, setBarOpen] = useState(false);
  /** Raiz do overlay — usada para saber se o foco ainda está dentro (ver `onMouseLeave`). */
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Aparência/comportamento persistidos: carrega a última configuração e grava cada mudança
  // (localStorage p/ abrir instantâneo + settings.ui p/ durabilidade entre máquinas).
  const [ov, setOv] = useState<OverlaySettings>(() => loadOverlaySettings());
  const persistTimer = useRef<any>(null);
  /**
   * A gravação acontece FORA do updater do `setState`. Antes, `localStorage.setItem` e o
   * `setTimeout` de rede moravam dentro dele — um updater com efeito colateral, que o React
   * chama duas vezes em desenvolvimento (StrictMode) e pode reexecutar ao reconciliar.
   */
  const update = (patch: Partial<OverlaySettings>) => {
    setOv(prev => {
      const next = { ...prev, ...patch };
      persistRef.current = next;
      return next;
    });
  };
  const persistRef = useRef<OverlaySettings | null>(null);
  useEffect(() => {
    const next = persistRef.current;
    if (!next) return;
    persistRef.current = null;
    try { localStorage.setItem(OVERLAY_KEY, JSON.stringify(next)); } catch { /* best-effort */ }
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => { void patchUiSettings({ overlay: next }); }, 600);
  }, [ov]);

  /**
   * Reidrata do SERVIDOR uma vez. O `patchUiSettings({overlay})` acima gravava desde sempre, mas
   * NINGUÉM lia de volta — `ui.overlay` era write-only e a configuração não sobrevivia à troca de
   * máquina/navegador, só ao localStorage. A escolha local vence enquanto a rede não responde.
   */
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const s = await fetchSettings();
        const ui = s?.ui ? JSON.parse(s.ui) : null;
        const remoto = ui && typeof ui === 'object' ? (ui as any).overlay : null;
        if (!cancelado && remoto && !localStorage.getItem(OVERLAY_KEY)) {
          setOv(prev => ({ ...prev, ...remoto }));
        }
      } catch { /* sem rede: fica o local */ }
    })();
    return () => { cancelado = true; };
  }, []);
  const applyPreset = (settings: Partial<OverlaySettings>) => {
    update({ ...settings });
    if (settings.bgColor !== undefined) onBgColorChange(settings.bgColor);
  };
  const saveMyPreset = () => {
    try { localStorage.setItem(MY_PRESET_KEY, JSON.stringify({ ...ov, bgColor })); } catch { /* best-effort */ }
  };
  const myPreset = (): Partial<OverlaySettings> | null => {
    try { const raw = localStorage.getItem(MY_PRESET_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  };

  // Aliases legíveis (o resto do componente lê daqui).
  const { layoutMode, originalTextColor, translatedTextColor, inboundColor, outboundColor, videoShowHistory, fontScale } = ov;
  const independenceLevel = ov.independence;

  // O fundo da janela é do PAI (controla o PiP); ao abrir, restaura o fundo salvo uma vez.
  const bgRestoredRef = useRef(false);
  useEffect(() => {
    if (bgRestoredRef.current) return;
    bgRestoredRef.current = true;
    if (ov.bgColor !== bgColor) onBgColorChange(ov.bgColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // IMERSÃO com "espiar": sem tradução por padrão; clicar numa legenda revela a daquela
  // fala por alguns segundos (aprender sem muleta, com socorro a um clique).
  const [peekId, setPeekId] = useState<string | null>(null);
  useEffect(() => {
    if (!peekId) return;
    const t = setTimeout(() => setPeekId(null), 4000);
    return () => clearTimeout(t);
  }, [peekId]);

  // "Aguardando fala…" com atraso: só aparece após WAITING_DELAY_MS sem fala nova,
  // e some no instante em que chega uma fala — sem piscar entre frases próximas.
  const latestId = captions.length ? captions[captions.length - 1].id : null;
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    setIdle(false);
    const t = setTimeout(() => setIdle(true), WAITING_DELAY_MS);
    return () => clearTimeout(t);
  }, [latestId]);

  // TEMA PRÓPRIO: 'app' não escreve nada (herda do documento, que o DocumentPiP sincroniza).
  const temaProprio = ov.theme !== 'app' ? ov.theme : undefined;
  const escuroProprio = ov.dark === 'app' ? undefined : ov.dark;

  /**
   * O tema próprio é escrito na RAIZ da janela flutuante, não num wrapper.
   *
   * Por quê: os blocos de tema do `index.css` incluem o seletor `[data-theme="X"] [class*="dark"]`,
   * que casa com QUALQUER descendente com a classe `dark` — inclusive um wrapper nosso. Com o app
   * em mochi e o overlay em vercel-escuro, os dois casavam com a mesma especificidade e vencia o
   * que aparece por último no arquivo: o overlay saía pintado com as cores do tema do APP.
   * Medido: `--canvas` vinha `#2d353b` (mochi) com `data-theme="vercel"` no wrapper.
   *
   * Na raiz da própria janela não há ancestral competindo. Só vale na janela flutuante — no modo
   * embutido a raiz é a do app inteiro, e pintá-la trocaria o tema da aplicação toda.
   */
  const donoDoTemaRef = useRef(false);
  useEffect(() => {
    const doc = rootRef.current?.ownerDocument;
    if (!doc || doc === window.document) return; // embutido: não é nossa janela
    const raiz = doc.documentElement;
    if (temaProprio || escuroProprio !== undefined) {
      donoDoTemaRef.current = true;
      raiz.setAttribute('data-overlay-owns-theme', 'true');
      if (temaProprio) raiz.setAttribute('data-theme', temaProprio);
      if (escuroProprio !== undefined) raiz.classList.toggle('dark', escuroProprio);
    } else if (donoDoTemaRef.current) {
      // Voltou para "igual ao aplicativo": devolve o comando ao espelho E reaplica o tema do app
      // agora. Sem esta reaplicação, a janela ficava congelada no último tema escolhido até que
      // algo mudasse na janela principal — o observador do DocumentPiP só reage a mutações lá.
      donoDoTemaRef.current = false;
      raiz.removeAttribute('data-overlay-owns-theme');
      applyAppearance(
        raiz as unknown as StyledElement,
        doc.body as unknown as StyledElement,
        readAppearance(
          window.document.documentElement as unknown as StyledElement,
          window.document.body as unknown as StyledElement,
        ),
      );
    }
  }, [temaProprio, escuroProprio, isVisible]);

  if (!isVisible) return null;

  // A barra fica expandida sob o ponteiro, e TRAVADA aberta enquanto o painel está aberto ou
  // os controles estão travados — recolhê-la no meio de um ajuste tiraria o alvo do dedo.
  const barAberta = barOpen || showSettingsPanel || !clickThrough;

  // Imersão esconde a tradução — exceto na fala "espiada" (clique no balão/legenda).
  const showTranslationFor = (id: string) => independenceLevel !== 'immersion' || peekId === id;
  const inboundCaptions = captions.filter((c) => c.side === 'inbound');
  const latestInbound = inboundCaptions.length ? inboundCaptions[inboundCaptions.length - 1] : null;
  const hasAnyCaption = captions.length > 0;

  // Balões SEGUROS PARA QUALQUER TEMA (bug real: com o tema Geist o accent é claro e o
  // balão "Você" ficava BRANCO com texto branco = janela "em branco" quando o usuário
  // falava). Ambos usam superfície do tema; a distinção é a borda lateral colorida.
  // Cores personalizadas de texto valem no MODO VÍDEO (legenda sobre conteúdo) e em
  // balões com fundo personalizado — nunca sobre a superfície do tema.
  const inboundClass = inboundColor ? '' : 'bg-surface border border-border-subtle text-ink';
  const outboundClass = outboundColor ? '' : 'bg-surface border border-border-subtle text-ink';
  const bubbleTextStyle = (custom: string) => (custom ? { color: originalTextColor } : undefined);
  const bubbleTransStyle = (custom: string) => (custom ? { color: translatedTextColor } : undefined);

  // Idioma de cada linha: o REAL da fala (multi-idioma) quando veio; senão, o par da sessão.
  // É o que faz o clique-para-ouvir pronunciar no idioma certo num lobby misto.
  const origLangOf = (c: OverlayCaption) => c.origLang || (c.side === 'inbound' ? theirLang : myLang);
  const transLangOf = (c: OverlayCaption) => c.transLang || (c.side === 'inbound' ? myLang : theirLang);

  // Texto como palavras clicáveis: clicar = ouvir só aquela palavra no idioma da linha.
  const speakableWords = (text: string, lang: string) =>
    text.split(/(\s+)/).map((tok, i) =>
      tok.trim() ? (
        <span
          key={i}
          className="cursor-pointer hover:opacity-70 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onSpeak?.(tok.replace(/[.,!?;:"'’“”…]/g, ''), lang); }}
          title="Clique para ouvir esta palavra"
        >{tok}</span>
      ) : tok
    );

  // Botão 🔊 para ouvir a FRASE inteira — o caso-chave: ouvir a tradução para saber como dizer.
  const ListenBtn = ({ text, lang, className = '' }: { text: string; lang: string; className?: string }) =>
    onSpeak && text ? (
      <button
        onClick={(e) => { e.stopPropagation(); onSpeak(text, lang); }}
        className={`shrink-0 inline-flex items-center justify-center rounded-md p-1 hover:bg-surface-hover transition-colors ${className}`}
        title="Ouvir a frase inteira"
        aria-label="Ouvir a frase inteira"
      >
        <Volume2 className="w-3.5 h-3.5" />
      </button>
    ) : null;

  // No TOPO central (o rodapé é das legendas — lá o aviso sobrepunha os balões).
  // Só quando JÁ HOUVE fala: sem nenhuma, quem explica é o estado vazio lá embaixo, e os dois
  // juntos diziam a mesma coisa duas vezes na mesma tela.
  const waitingPill = idle && hasAnyCaption ? (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none z-10">
      <div className="bg-surface/90 border border-border-subtle rounded-full px-4 py-1.5 shadow-xl text-center">
        <p className="text-[12px] text-ink-muted font-medium">
          {hasAnyCaption ? 'Sem áudio há alguns segundos…' : 'Aguardando fala capturada…'}
        </p>
      </div>
    </div>
  ) : null;


  return (
    <div
      ref={rootRef}
      className={`fixed inset-0 z-50 overflow-hidden flex flex-col ${clickThrough && !showSettingsPanel ? 'pointer-events-none' : 'pointer-events-auto'}`}
      /**
       * Só devolve a transparência de mouse se NÃO houver foco dentro do overlay. Antes, qualquer
       * saída do ponteiro devolvia — inclusive ao abrir um `<select>`, cujo popup é desenhado pelo
       * sistema FORA da janela: o menu abria e a barra sumia embaixo dele.
       */
      onMouseLeave={() => {
        if (showSettingsPanel) return;
        const foco = rootRef.current?.ownerDocument?.activeElement;
        if (foco && rootRef.current?.contains(foco)) return;
        setClickThrough(true);
      }}
    >
      {/* Barra de controles — FORA DO FLUXO (`absolute`), à direita do topo.
          A ALÇA sempre visível (o punho à esquerda da barra) substitui a antiga dica "Controles
          ocultos", que era um elemento `absolute` no MESMO canto: por ser posicionado e vir depois
          no DOM, ele ganhava o hit-test e cobria exatamente os botões Personalizar e Fechar, o
          primeiro clique do usuário sempre acertava a dica, nunca o botão. Uma affordance só.

          Ela era uma LINHA do flex (`shrink-0`), então a legenda começava 74px abaixo do topo da
          janela, sempre, mesmo com a barra ociosa. Agora a alça é a única coisa que fica por cima
          da legenda, e a barra inteira só aparece quando o ponteiro chega. `barAberta` mantém tudo
          expandido enquanto o painel está aberto ou os controles estão travados, senão o usuário
          perderia a barra debaixo do dedo enquanto ajusta. */}
      <div className="absolute top-3 right-3 z-20 flex justify-end pointer-events-none">
        <div
          onMouseEnter={() => setBarOpen(true)}
          /* Mesma regra do `onMouseLeave` da raiz: com foco dentro (ex.: `<select>` aberto, cujo
             popup o sistema desenha FORA da janela) a barra não recolhe embaixo do menu. */
          onMouseLeave={() => {
            const foco = rootRef.current?.ownerDocument?.activeElement;
            if (foco && rootRef.current?.contains(foco)) return;
            setBarOpen(false);
          }}
          className={`pointer-events-auto flex items-center gap-2 bg-surface border border-border-subtle rounded-xl shadow-2xl transition-all duration-200 ${
            barAberta
              ? 'p-2 opacity-100 max-w-[520px]'
              : 'py-2 px-1.5 opacity-50 hover:opacity-90 max-w-[22px] overflow-hidden'
          }`}
        >
          <span className="w-1 h-6 rounded-full bg-border-subtle mr-0.5 shrink-0" aria-hidden />
          <button
            className={`p-2 rounded-lg transition-colors ${clickThrough ? 'text-ink-muted hover:bg-surface-hover' : 'bg-accent text-white'}`}
            onClick={() => setClickThrough(!clickThrough)}
            title="Travar controles (desativa a transparência de mouse)"
            aria-label="Travar controles (desativa a transparência de mouse)"
          >
            <MousePointer className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-border-subtle mx-1" />
          <select
            id="overlay-layout-mode"
            name="overlay-layout-mode"
            className="bg-transparent text-[12px] text-ink font-bold outline-none cursor-pointer"
            value={layoutMode}
            onChange={(e) => update({ layoutMode: e.target.value as LayoutMode })}
          >
            <option value="video">Modo Vídeo</option>
            <option value="conversation">Modo Conversa</option>
            <option value="game">Modo Jogo</option>
          </select>
          <div className="w-px h-6 bg-border-subtle mx-1" />
          <button
            onClick={() => {
              const abrindo = !showSettingsPanel;
              setShowSettingsPanel(abrindo);
              // Abrir o painel TRAVA os controles: sem isto, o painel abria já em modo
              // click-through e o primeiro clique dentro dele não chegava a nada.
              if (abrindo) setClickThrough(false);
            }}
            className={`p-2 rounded-lg transition-colors ${showSettingsPanel ? 'bg-accent text-white' : 'text-ink-muted hover:bg-surface-hover'}`}
            title="Personalizar aparência"
            aria-label="Personalizar aparência"
          >
            <Palette className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-2 text-ink-muted hover:bg-surface-hover hover:text-error rounded-lg transition-colors" title="Fechar overlay" aria-label="Fechar overlay">
            <EyeOff className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Corpo — área das legendas (flex-1) + painel lateral REAL quando aberto.
          Colunas de verdade = zero sobreposição entre legendas e painel, em qualquer
          proporção que o usuário der à janelinha.

          A coluna das legendas é `flex flex-col`: cada modo ancora o próprio bloco com `mt-auto`
          e mede o teto pela coluna (`min-h-0`), não por uma fatia do viewport. */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 relative flex flex-col">

          {/* MODO JOGO — HUD compacto e rolável no canto (histórico das falas).
              Ancorado em CIMA e embaixo (`inset-y-4`): com altura conhecida, o HUD cresce até o
              topo da janela quando há fala demais, em vez de parar nos antigos 45vh. */}
          {layoutMode === 'game' && hasAnyCaption && (
            <div className="absolute inset-y-4 left-4 w-80 max-w-[calc(100%-2rem)] flex flex-col justify-end">
              <CaptionScroller
                items={captions}
                containerClassName="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1"
                renderItem={(c) => {
                  const isIn = c.side === 'inbound';
                  const cls = isIn ? inboundClass : outboundClass;
                  const custom = isIn ? inboundColor : outboundColor;
                  return (
                    <div
                      key={c.id}
                      className={`backdrop-blur-sm rounded-lg p-3 border-l-4 ${isIn ? 'border-l-accent' : 'border-l-good'} shadow-xl ${cls} ${independenceLevel === 'immersion' ? 'cursor-pointer' : ''}`}
                      // Borda = cor da PESSOA identificada (inline vence a classe; sem cor → tema).
                      style={{ ...(custom ? { backgroundColor: custom } : null), ...(c.speakerColor ? { borderLeftColor: c.speakerColor } : null) }}
                      onClick={() => { if (independenceLevel === 'immersion') setPeekId(c.id); }}
                      title={independenceLevel === 'immersion' ? 'Clique para espiar a tradução' : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-80 truncate" style={c.speakerColor ? { color: c.speakerColor } : undefined}>{c.speaker}</span>
                          <LangChip code={origLangOf(c)} />
                        </span>
                        <ListenBtn text={c.original} lang={origLangOf(c)} />
                      </div>
                      <p className="font-semibold leading-tight" style={{ fontSize: `${Math.round(14 * fontScale)}px`, ...bubbleTextStyle(custom) }}>{speakableWords(c.original, origLangOf(c))}</p>
                      {showTranslationFor(c.id) && c.translated && (
                        <div className="flex items-start justify-between gap-1 mt-1">
                          <p className="italic text-ink-muted" style={{ fontSize: `${Math.round(12 * fontScale)}px`, ...bubbleTransStyle(custom) }}>{speakableWords(c.translated, transLangOf(c))}</p>
                          <ListenBtn text={c.translated} lang={transLangOf(c)} />
                        </div>
                      )}
                    </div>
                  );
                }}
              />
            </div>
          )}

          {/* MODO VÍDEO — legenda central; histórico rolável opcional */}
          {layoutMode === 'video' && !videoShowHistory && !idle && latestInbound && (
            <div
              className="mt-auto w-full max-w-4xl mx-auto flex flex-col items-center gap-1 pointer-events-auto px-4 pb-4 text-center"
              onClick={() => { if (independenceLevel === 'immersion') setPeekId(latestInbound.id); }}
              title={independenceLevel === 'immersion' ? 'Clique para espiar a tradução' : undefined}
            >
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <p className="font-black leading-tight tracking-wide" style={{ color: originalTextColor, fontSize: `${Math.round(32 * fontScale)}px`, textShadow: CAPTION_OUTLINE }}>
                  {speakableWords(latestInbound.original, origLangOf(latestInbound))}
                </p>
                <ListenBtn text={latestInbound.original} lang={origLangOf(latestInbound)} className="text-white" />
              </div>
              {showTranslationFor(latestInbound.id) && latestInbound.translated && (
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <p className="font-bold leading-tight tracking-wide" style={{ color: translatedTextColor, fontSize: `${Math.round(22 * fontScale)}px`, textShadow: CAPTION_OUTLINE }}>
                    {speakableWords(latestInbound.translated, transLangOf(latestInbound))}
                  </p>
                  <ListenBtn text={latestInbound.translated} lang={transLangOf(latestInbound)} className="text-white" />
                </div>
              )}
            </div>
          )}
          {layoutMode === 'video' && videoShowHistory && inboundCaptions.length > 0 && (
            <div className="mt-auto w-full max-w-4xl mx-auto min-h-0 flex flex-col px-4 pb-4">
              <CaptionScroller
                items={inboundCaptions}
                containerClassName="flex flex-col items-center gap-2 flex-1 min-h-0 overflow-y-auto custom-scrollbar text-center"
                renderItem={(c) => {
                  const isLatest = c.id === latestInbound?.id;
                  return (
                    <div
                      key={c.id}
                      className={`transition-opacity ${isLatest ? 'opacity-100' : 'opacity-60'} ${independenceLevel === 'immersion' ? 'cursor-pointer' : ''}`}
                      onClick={() => { if (independenceLevel === 'immersion') setPeekId(c.id); }}
                    >
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <p className="font-black leading-tight tracking-wide" style={{ color: originalTextColor, fontSize: `${Math.round((isLatest ? 32 : 20) * fontScale)}px`, textShadow: CAPTION_OUTLINE }}>
                          {speakableWords(c.original, origLangOf(c))}
                        </p>
                        <ListenBtn text={c.original} lang={origLangOf(c)} className="text-white" />
                      </div>
                      {showTranslationFor(c.id) && c.translated && (
                        <p className="font-bold leading-tight tracking-wide" style={{ color: translatedTextColor, fontSize: `${Math.round((isLatest ? 22 : 15) * fontScale)}px`, textShadow: CAPTION_OUTLINE }}>
                          {speakableWords(c.translated, transLangOf(c))}
                        </p>
                      )}
                    </div>
                  );
                }}
              />
            </div>
          )}

          {/* MODO CONVERSA — balões roláveis (eles à esquerda, você à direita).
              O `max-h-[calc(100%-1rem)]` que ficava aqui era INERTE: o pai era `absolute` de altura
              auto, e um percentual contra altura indeterminada resolve como `none`. Medido: a lista
              ficava com 1764px numa janela de 440, 1416px transbordavam para cima e morriam no
              `overflow-hidden` da raiz, o scroll nunca engatava (`scrollHeight === clientHeight`)
              e por isso o auto-scroll e o botão "novas falas" eram código morto. */}
          {layoutMode === 'conversation' && hasAnyCaption && (
            <div className="mt-auto w-full max-w-2xl mx-auto min-h-0 flex flex-col px-3 pb-3">
              <CaptionScroller
                items={captions}
                containerClassName="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto custom-scrollbar py-2"
                renderItem={(c, anterior, proximo) => {
                  const isIn = c.side === 'inbound';
                  const cls = isIn ? inboundClass : outboundClass;
                  const custom = isIn ? inboundColor : outboundColor;
                  // Mesmo agrupamento da tela de captura: falas seguidas da mesma pessoa não
                  // repetem avatar nem nome. Numa janela pequena isso é ainda mais valioso —
                  // cada cabeçalho repetido custa uma linha de legenda.
                  const mesmaPessoa = (a?: OverlayCaption) => !!a && a.speaker === c.speaker && a.side === c.side;
                  const primeiraDaSequencia = !mesmaPessoa(anterior);
                  // O NOME abre a sequência; o AVATAR fecha — é onde o olho espera encontrá-lo
                  // (a última fala é a mais recente). Com ele no primeiro, ficava pendurado entre
                  // os dois balões, parecendo pertencer ao de baixo.
                  const ultimaDaSequencia = !mesmaPessoa(proximo);
                  return (
                    <div key={c.id} className={`flex items-end gap-2 ${isIn ? '' : 'flex-row-reverse'} ${primeiraDaSequencia ? '' : '-mt-2'}`}>
                      {ultimaDaSequencia ? (
                        <span
                          className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-sm"
                          style={{ backgroundColor: c.speakerColor || 'var(--ink-faint)' }}
                          title={c.speaker}
                          aria-hidden
                        >
                          {initials(c.speaker)}
                        </span>
                      ) : (
                        <span className="w-7 shrink-0" aria-hidden />
                      )}
                      <div className={`flex flex-col max-w-[85%] min-w-0 ${isIn ? 'items-start' : 'items-end'}`}>
                      {primeiraDaSequencia && (
                        <span className={`flex items-center gap-1.5 text-[11px] font-semibold mb-1 ${isIn ? 'ml-1' : 'mr-1 flex-row-reverse'}`}>
                          <span className="text-ink-muted" style={c.speakerColor ? { color: c.speakerColor } : undefined}>{c.speaker}</span>
                          <LangChip code={origLangOf(c)} />
                        </span>
                      )}
                      <div
                        className={`backdrop-blur-md rounded-2xl ${isIn ? 'rounded-tl-sm border-l-4 border-l-accent' : 'rounded-tr-sm border-r-4 border-r-good'} px-4 py-3 shadow-xl ${cls} ${independenceLevel === 'immersion' ? 'cursor-pointer' : ''}`}
                        // Cor da pessoa na borda do balão dos OUTROS (o seu continua verde "você").
                        style={{ ...(custom ? { backgroundColor: custom } : null), ...(isIn && c.speakerColor ? { borderLeftColor: c.speakerColor } : null) }}
                        onClick={() => { if (independenceLevel === 'immersion') setPeekId(c.id); }}
                        title={independenceLevel === 'immersion' ? 'Clique para espiar a tradução' : undefined}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <p className="font-medium leading-snug" style={{ fontSize: `${Math.round(16 * fontScale)}px`, ...bubbleTextStyle(custom) }}>{speakableWords(c.original, origLangOf(c))}</p>
                          <ListenBtn text={c.original} lang={origLangOf(c)} />
                        </div>
                        {showTranslationFor(c.id) && c.translated && (
                          <div className="mt-2 pt-2 border-t border-border-subtle flex items-start justify-between gap-1.5">
                            <p className="font-medium text-ink-muted" style={{ fontSize: `${Math.round(14 * fontScale)}px`, ...bubbleTransStyle(custom) }}>{speakableWords(c.translated, transLangOf(c))}</p>
                            <ListenBtn text={c.translated} lang={transLangOf(c)} />
                          </div>
                        )}
                      </div>
                      </div>
                    </div>
                  );
                }}
              />
            </div>
          )}

          {/* SEM NENHUMA LEGENDA a janela era um retângulo totalmente vazio — o usuário não tinha
              como saber se estava funcionando, esperando, ou quebrado. Agora ela diz o que falta. */}
          {!hasAnyCaption && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 pointer-events-none select-none">
              <span className="relative flex h-9 w-9 items-center justify-center">
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent/20 animate-ping" />
                <Radio className="w-4 h-4 text-accent relative" />
              </span>
              <p className="text-[13px] font-bold text-ink">Esperando a primeira fala</p>
              <p className="text-[11px] text-ink-muted max-w-[38ch] leading-snug">
                Dê play no vídeo ou comece a falar, a legenda aparece aqui, por cima de tudo.
              </p>
            </div>
          )}

          {/* Aviso de silêncio (atrasado) */}
          {waitingPill}
        </div>

        {/* PAINEL LATERAL — coluna real: nunca sobrepõe as legendas; um único scroll interno. */}
        {showSettingsPanel && (
          <aside className="pointer-events-auto w-72 max-w-[85vw] shrink-0 h-full overflow-y-auto custom-scrollbar bg-surface border-l border-border-subtle p-4 text-ink animate-in slide-in-from-right-2">
            <h3 className="font-bold text-sm mb-3 flex items-center justify-between">
              Personalização
              <button
                onClick={() => applyPreset(DEFAULT_OVERLAY)}
                className="text-[10px] bg-canvas hover:bg-surface-hover px-2 py-1 rounded transition-colors border border-border-subtle"
              >
                Resetar tudo
              </button>
            </h3>
            <div className="space-y-3">
              {/* PREDEFINIÇÕES — um clique configura o overlay inteiro para o cenário. */}
              <div className="space-y-1.5">
                <p className="label-mono">Predefinições</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {OVERLAY_PRESETS.map((p) => {
                    const Icon = PRESET_ICONS[p.id];
                    return (
                      <button
                        key={p.id}
                        onClick={() => applyPreset(p.settings)}
                        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-border-subtle bg-canvas hover:border-accent hover:text-accent text-[11px] font-bold transition-colors"
                        title={`Aplicar predefinição ${p.nome}`}
                      >
                        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />} {p.nome}
                      </button>
                    );
                  })}
                  {myPreset() && (
                    <button
                      onClick={() => { const m = myPreset(); if (m) applyPreset(m); }}
                      className="col-span-2 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-accent/40 bg-accent-soft text-accent text-[11px] font-bold"
                      title="Aplicar o seu perfil salvo"
                    >
                      <Star className="w-3.5 h-3.5" /> Meu perfil
                    </button>
                  )}
                </div>
                <button
                  onClick={saveMyPreset}
                  className="text-[10px] text-ink-muted hover:text-accent underline cursor-pointer"
                >
                  Salvar a configuração atual como “Meu perfil”
                </button>
              </div>

              {/* TEMA DA JANELA — independente do app. A legenda que fica por cima de um jogo
                  tem exigência diferente da interface principal. */}
              <div className="space-y-1 pt-2 border-t border-border-subtle">
                <label className="label-mono" htmlFor="overlay-theme">Tema desta janela</label>
                <select
                  id="overlay-theme"
                  name="overlay-theme"
                  value={ov.theme}
                  onChange={(e) => update({ theme: e.target.value as ThemeType | 'app' })}
                  className="w-full bg-canvas border border-border-subtle rounded-lg p-2 text-[12px] font-semibold outline-none focus:border-accent cursor-pointer"
                >
                  <option value="app">Igual ao aplicativo</option>
                  {THEME_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <div className="flex items-center gap-1.5 pt-1">
                  {([['app', 'Automático'], [true, 'Escuro'], [false, 'Claro']] as Array<[('app' | boolean), string]>).map(([valor, rotulo]) => (
                    <button
                      key={String(valor)}
                      onClick={() => update({ dark: valor })}
                      aria-pressed={ov.dark === valor}
                      className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg border transition-colors ${
                        ov.dark === valor ? 'bg-accent-soft border-accent/40 text-accent-ink' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'
                      }`}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>
              </div>

              {/* TRADUÇÃO — nível de apoio. */}
              <div className="space-y-1 pt-2 border-t border-border-subtle">
                <label className="label-mono" htmlFor="overlay-independence">Tradução</label>
                <select
                  id="overlay-independence"
                  name="overlay-independence"
                  value={independenceLevel}
                  onChange={(e) => update({ independence: e.target.value as Independence })}
                  className="w-full bg-canvas border border-border-subtle rounded-lg p-2 text-[12px] font-semibold outline-none focus:border-accent cursor-pointer"
                >
                  <option value="assisted">Sempre visível (apoio total)</option>
                  <option value="intermediate">Visível, discreta</option>
                  <option value="immersion">Imersão, oculta (clique na legenda para espiar)</option>
                </select>
              </div>

              {/* TAMANHO — multiplicador aplicado a todos os modos. */}
              <div className="space-y-1">
                <label className="label-mono" htmlFor="overlay-font-scale">Tamanho da legenda · {Math.round(fontScale * 100)}%</label>
                <input
                  id="overlay-font-scale"
                  name="overlay-font-scale"
                  type="range"
                  min={0.7}
                  max={1.6}
                  step={0.05}
                  value={fontScale}
                  onChange={(e) => update({ fontScale: Number(e.target.value) })}
                  className="w-full accent-[var(--accent)]"
                />
              </div>

              <div className="flex items-center justify-between gap-2 bg-canvas border border-border-subtle rounded-lg px-3 py-2">
                <div>
                  <p className="text-[12px] font-bold">Histórico no modo vídeo</p>
                  <p className="text-[9px] text-ink-faint leading-tight">Legendas anteriores roláveis (padrão: só a atual).</p>
                </div>
                <button
                  onClick={() => update({ videoShowHistory: !videoShowHistory })}
                  className={`shrink-0 w-10 h-5 rounded-full transition-colors relative ${videoShowHistory ? 'bg-accent' : 'bg-border-subtle'}`}
                  aria-pressed={videoShowHistory}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${videoShowHistory ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>

              <div className="space-y-1">
                <label className="label-mono" htmlFor="overlay-bg-color">Cor do fundo da janela</label>
                <div className="flex items-center gap-2">
                  <input id="overlay-bg-color" name="overlay-bg-color" type="color" value={bgColor === 'transparent' ? '#000000' : bgColor} onChange={(e) => { onBgColorChange(e.target.value); update({ bgColor: e.target.value }); }} className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0" />
                  <span className="text-xs font-mono">{bgColor === 'transparent' ? 'Invisível' : bgColor}</span>
                  <button
                    onClick={() => { const v = bgColor === 'transparent' ? '#000000' : 'transparent'; onBgColorChange(v); update({ bgColor: v }); }}
                    className="ml-auto text-[10px] border border-border-subtle bg-canvas hover:bg-surface-hover px-2 py-1 rounded"
                  >
                    {bgColor === 'transparent' ? 'Cor sólida' : 'Fundo invisível'}
                  </button>
                </div>
                <p className="text-[9px] text-ink-faint leading-tight">Fundo invisível depende do suporte do navegador.</p>
              </div>

              {/* Cores da LEGENDA — valem no modo vídeo e em balões com fundo personalizado.
                  Nos balões com o tema padrão, o texto segue o tema (nunca fica ilegível). */}
              <div className="space-y-1 pt-2 border-t border-border-subtle">
                <label className="label-mono" htmlFor="overlay-original-color">Cor da legenda (modo vídeo)</label>
                <div className="flex items-center gap-2">
                  <input id="overlay-original-color" name="overlay-original-color" type="color" value={originalTextColor} onChange={(e) => update({ originalTextColor: e.target.value })} className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0" />
                  <span className="text-xs font-mono">{originalTextColor}</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="label-mono" htmlFor="overlay-translated-color">Cor da tradução (modo vídeo)</label>
                <div className="flex items-center gap-2">
                  <input id="overlay-translated-color" name="overlay-translated-color" type="color" value={translatedTextColor} onChange={(e) => update({ translatedTextColor: e.target.value })} className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0" />
                  <span className="text-xs font-mono">{translatedTextColor}</span>
                </div>
              </div>
              <div className="space-y-1 pt-2 border-t border-border-subtle">
                <label className="label-mono" htmlFor="overlay-inbound-color">Fundo do balão: eles</label>
                <div className="flex items-center gap-2">
                  <input id="overlay-inbound-color" name="overlay-inbound-color" type="color" value={inboundColor || '#000000'} onChange={(e) => update({ inboundColor: e.target.value })} className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0" />
                  <span className="text-xs font-mono">{inboundColor || 'Tema padrão'}</span>
                  {inboundColor && (
                    <button onClick={() => update({ inboundColor: '' })} className="ml-auto text-[10px] border border-border-subtle bg-canvas hover:bg-surface-hover px-2 py-1 rounded">Tema</button>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <label className="label-mono" htmlFor="overlay-outbound-color">Fundo do balão: você</label>
                <div className="flex items-center gap-2">
                  <input id="overlay-outbound-color" name="overlay-outbound-color" type="color" value={outboundColor || '#000000'} onChange={(e) => update({ outboundColor: e.target.value })} className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0" />
                  <span className="text-xs font-mono">{outboundColor || 'Tema padrão'}</span>
                  {outboundColor && (
                    <button onClick={() => update({ outboundColor: '' })} className="ml-auto text-[10px] border border-border-subtle bg-canvas hover:bg-surface-hover px-2 py-1 rounded">Tema</button>
                  )}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* A antiga dica "Controles ocultos" vivia AQUI, `absolute top-3 right-3` — exatamente por
          cima dos botões Personalizar e Fechar da barra. Por ser posicionada e vir depois no DOM,
          ela vencia o hit-test: o clique do usuário morria nela e o painel só abria na segunda
          tentativa. A barra agora fica sempre visível (40% de opacidade) e é a única affordance. */}
    </div>
  );
}
