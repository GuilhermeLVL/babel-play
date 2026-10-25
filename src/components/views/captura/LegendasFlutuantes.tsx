import '../../../styles/legendas.css';
import '../../../styles/legendasFlutuantes.css';

import { ArrowDown, AudioLines, MousePointerClick } from 'lucide-react';
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  falasAVista,
  type Formato,
  type Layout,
  layoutPorTamanho,
  type Tamanho,
  tamanhoDaLetra,
} from '../../../core/legendas/janelaFlutuante';
import { fetchSettings, patchUiSettings } from '../../../data/api';
import {
  avancar,
  type FalaDoRitmo,
  iniciarRitmo,
  janelaDaLegenda,
  pendentes,
  saltarParaOFim,
} from '../../../lib/captura/ritmoDaLegenda';
import {
  classesDoEstilo,
  EVENTO_AJUSTES_DA_LEGENDA,
  lerEstiloDeLegenda,
  resolverEstiloDeLegenda,
} from '../../../lib/estilosDeLegenda';
import { t, tp } from '../../../lib/i18n';
import { toast } from '../../Toast';
import {
  type Aparencia,
  CHAVE,
  CHAVE_MEU,
  FORMATO_DO_MODO,
  fundoResolvido,
  FUNDOS,
  lerAparencia,
  type Modo,
  modoDoFormato,
  MOSTRAS,
  normalizar,
  PADRAO,
  type Preset,
  PRESETS,
  proximoDe,
  type Traducao,
  traducaoAMostra,
} from './legendas/aparenciaDaLegenda';
import BarraDaLegenda from './legendas/BarraDaLegenda';
import CartaoDaPalavra, { type PalavraTocada } from './legendas/CartaoDaPalavra';
import LinhaDaLegenda, { type LegendaAoVivo } from './legendas/LinhaDaLegenda';
import PainelDaLegenda from './legendas/PainelDaLegenda';

export type { LegendaAoVivo };

/**
 * Uma aba a mais na janela, ao lado de "Legendas" (a costura para o Assistente da Fase C). Sem abas
 * extras, a janela não mostra lista de abas nenhuma.
 */
export interface AbaDaJanela {
  id: string;
  rotulo: string;
  conteudo: ReactNode;
}

/** O modo (classe e rótulo de quem fala) que cada layout usa. */
const MODO_DO_LAYOUT: Readonly<Record<Layout, Modo>> = {
  faixa: 'jogo',
  legenda: 'video',
  conversa: 'conversa',
  estudo: 'estudo',
};

/** Sem mexer o mouse, tocar ou teclar por este tempo, os controles somem e fica só o texto. */
export const CONTROLES_SOMEM_MS = 2000;

/** Lê (e acompanha) o tema escuro do APP — é ele que decide o fundo `auto`, também dentro da PiP. */
function useTemaEscuro(): boolean {
  const ler = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const [escuro, setEscuro] = useState(ler);
  useEffect(() => {
    const obs = new MutationObserver(() => setEscuro(ler()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return escuro;
}

/**
 * LEGENDAS FLUTUANTES — o `desenharLegendas()` do protótipo aprovado (C6): a janelinha escura com a
 * barra, as falas e o painel de personalização. Esta é a RAIZ da composição; as peças moram em
 * `./legendas/` (barra, linha da fala, cartão da palavra, painel, aparência guardada).
 *
 * O MECANISMO: no Chrome/Edge a janelinha vive numa Document Picture-in-Picture, SEMPRE NO TOPO por
 * cima do jogo, do vídeo ou da chamada, e este componente ocupa a janela inteira. Sem essa API, quem
 * aparece é a `LegendaFlutuanteDoPrototipo`. As falas são as REAIS da captura, nunca texto fixo.
 *
 * O RITMO (ei/leg, relato do dono: "a legenda some rápido demais"): cada fala fica pelo menos o
 * tempo de ler (`lib/captura/ritmoDaLegenda`), a seguinte espera a vez, as N últimas ficam à vista,
 * e dá para pausar (botão, Espaço, ou só passar o mouse), voltar pelo histórico (rolar, ← →) e
 * tocar uma palavra para ver a glosa, ouvir e salvar. A captura NUNCA para: pausar congela só a
 * janela, e continuar pula para a mais recente.
 */

/** Intervalo mínimo entre dois passos de histórico pela roda do mouse (um gesto dispara dezenas). */
const PASSO_DA_RODA_MS = 160;
/** Quanto o dedo precisa arrastar para um passo de histórico. */
const PASSO_DO_DEDO_PX = 36;
/** Um toque dispara `mouseenter` de compatibilidade logo depois: isso não é "mouse em cima". */
const TOQUE_RECENTE_MS = 800;

export default function LegendasFlutuantes({
  falas,
  aoFechar,
  aprendidas,
  aoRevelarTraducao,
  aoConsultarPalavra,
  aoOuvir,
  aoSalvarPalavra,
  naJanela = false,
  formatoInicial,
  aoTrocarFormato,
  abasExtras,
}: {
  /** As últimas falas da captura, em ordem. A janela decide quais e quando aparecem. */
  falas: LegendaAoVivo[];
  aoFechar: () => void;
  /** Palavras já aprendidas (minúsculas): ganham `data-aprendida`, que o estilo destaca. */
  aprendidas?: ReadonlySet<string>;
  /** "Mostrar tradução" de uma fala deixada sob demanda (`revelarTraducao`). Ausente = sem o botão. */
  aoRevelarTraducao?: (id: string) => void;
  /** A glosa da palavra tocada (o caminho do Analista: dicionário local → Wiktionary → MT). */
  aoConsultarPalavra?: (palavra: string, frase: string, lang?: string) => Promise<{ traducao: string }>;
  /** A voz do navegador (não o áudio original). `lenta` = ritmo reduzido. */
  aoOuvir?: (texto: string, lang: string | undefined, lenta: boolean) => void;
  /** Ficha no vocabulário (FSRS); devolve o que o fichamento disse, para a janela mostrar. */
  aoSalvarPalavra?: (item: { palavra: string; frase?: string; lang?: string; traducao?: string }) => Promise<string>;
  /** Ocupa uma janela inteira (a PiP): o layout segue o TAMANHO dela, medido de verdade. */
  naJanela?: boolean;
  /** O formato sugerido pelo app ao abrir (vence o guardado, uma vez). */
  formatoInicial?: Formato;
  /** A pessoa trocou o formato: quem abriu a janela a redimensiona. */
  aoTrocarFormato?: (f: Formato) => void;
  /** Abas além de "Legendas" (Fase C: o Assistente). */
  abasExtras?: readonly AbaDaJanela[];
}) {
  const [ap, setAp] = useState<Aparencia>(() => {
    const lida = lerAparencia();
    return formatoInicial ? { ...lida, modo: modoDoFormato(formatoInicial) } : lida;
  });
  const temaEscuro = useTemaEscuro();
  const fundo = fundoResolvido(ap.fundo, temaEscuro);
  /* O ESTILO DE LEGENDA equipado (onda 4) — o mesmo da transcrição, relido quando muda. As cores
     que a pessoa escolheu aqui (`--leg-cor`) continuam valendo: o estilo não pinta o texto. */
  const [estiloId, setEstiloId] = useState(lerEstiloDeLegenda);
  useEffect(() => {
    const reler = () => setEstiloId(lerEstiloDeLegenda());
    window.addEventListener(EVENTO_AJUSTES_DA_LEGENDA, reler);
    return () => window.removeEventListener(EVENTO_AJUSTES_DA_LEGENDA, reler);
  }, []);
  const classesDoEstiloEquipado = classesDoEstilo(resolverEstiloDeLegenda(estiloId));
  const [oculto, setOculto] = useState(false);
  const [recolhido, setRecolhido] = useState(false);
  const [painel, setPainel] = useState(false);

  /* Guarda cada mudança: no disco (abre instantâneo) e no servidor (vale em outra máquina). */
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    try {
      localStorage.setItem(CHAVE, JSON.stringify(ap));
    } catch {
      /* best-effort */
    }
    const id = setTimeout(() => void patchUiSettings({ legendasFlutuantes: ap }), 600);
    return () => clearTimeout(id);
  }, [ap]);

  /* Reidrata do servidor uma vez, se este navegador ainda não tem a sua. */
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        if (localStorage.getItem(CHAVE)) return;
        const s = await fetchSettings();
        const ui = s?.ui ? JSON.parse(s.ui) : null;
        const remoto = ui && typeof ui === 'object' ? (ui as Record<string, unknown>).legendasFlutuantes : null;
        if (!cancelado && remoto) setAp(normalizar(remoto));
      } catch {
        /* sem rede: fica o local */
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const mudar = (patch: Partial<Aparencia>) => {
    if (patch.modo && patch.modo !== ap.modo) aoTrocarFormato?.(FORMATO_DO_MODO[patch.modo]);
    setAp((a) => ({ ...a, ...patch }));
  };

  const aplicarPreset = (p: Preset) => {
    if (p === 'meu') {
      let meu: Aparencia | null;
      try {
        const raw = localStorage.getItem(CHAVE_MEU);
        meu = raw ? normalizar(JSON.parse(raw)) : null;
      } catch {
        meu = null;
      }
      if (!meu) {
        toast.info(t('Você ainda não salvou um “Meu perfil”: ajuste e use “Salvar como Meu perfil”.'));
        return;
      }
      if (meu.modo !== ap.modo) aoTrocarFormato?.(FORMATO_DO_MODO[meu.modo]);
      setAp({ ...meu, preset: 'meu' });
      return;
    }
    const [modo, traducao, tam] = PRESETS[p];
    mudar({ preset: p, modo, traducao, tam });
  };

  const salvarMeu = () => {
    try {
      localStorage.setItem(CHAVE_MEU, JSON.stringify({ ...ap, preset: 'meu' }));
      setAp((a) => ({ ...a, preset: 'meu' }));
      toast.info(t('Configuração salva como “Meu perfil”'));
    } catch {
      toast.info(t('Não deu para salvar o perfil neste navegador.'));
    }
  };

  /* ── O TAMANHO DE VERDADE: na PiP, a janela inteira; o layout acompanha quando a pessoa a estica. ── */
  const raiz = useRef<HTMLDivElement>(null);
  const [tamanho, setTamanho] = useState<Tamanho | null>(null);
  useEffect(() => {
    if (!naJanela) return;
    const win = raiz.current?.ownerDocument.defaultView;
    if (!win) return;
    const medir = () =>
      setTamanho((t) =>
        t && t.largura === win.innerWidth && t.altura === win.innerHeight
          ? t
          : { largura: win.innerWidth, altura: win.innerHeight },
      );
    medir();
    win.addEventListener('resize', medir);
    /* O observador DA JANELA dela: o da janela principal não vê o documento da PiP. */
    const RO = (win as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    const obs = RO ? new RO(medir) : null;
    if (obs && raiz.current) obs.observe(raiz.current);
    return () => {
      win.removeEventListener('resize', medir);
      obs?.disconnect();
    };
  }, [naJanela]);
  const formato = FORMATO_DO_MODO[ap.modo];
  const layout = layoutPorTamanho(formato, tamanho);
  const modoDoLayout = MODO_DO_LAYOUT[layout];
  const quantasAVista = falasAVista(layout, tamanho, ap.visiveis);
  /* Fora da PiP a letra é a do protótipo (`--leg-tam`); dentro, acompanha a largura da janela. */
  const letraPx = tamanho ? tamanhoDaLetra(layout, tamanho.largura, ap.tam / 100) : null;
  /* "Só o original" esconde a tradução de todas as falas (como a Imersão); "só a tradução" a mostra no lugar. */
  const modoDaTraducao: Traducao = ap.mostrar === 'original' ? 'oculta' : ap.traducao;

  /* ── LIMPA: só o texto; os controles aparecem ao mexer e somem sozinhos. ─────────────────── */
  const [controles, setControles] = useState(false);
  const [mexeu, setMexeu] = useState(0);
  const mostrarControles = useCallback(() => {
    setControles(true);
    setMexeu((n) => n + 1);
  }, []);

  /* ── AS ABAS (só com abas extras) ─────────────────────────────────────────────────────────── */
  const [aba, setAba] = useState('legendas');
  const abaExtra = abasExtras?.find((a) => a.id === aba);

  /* ── O RITMO ──────────────────────────────────────────────────────────────────────────────── */
  const [pausaManual, setPausaManual] = useState(false);
  const [sobre, setSobre] = useState(false);
  const [segurando, setSegurando] = useState(false);
  const [cartao, setCartao] = useState<PalavraTocada | null>(null);
  /** Tradução trocada fala a fala (vence o modo da janela). */
  const [trocas, setTrocas] = useState<Record<string, boolean>>({});
  /** A fala em foco ao voltar pelo histórico; `null` = seguindo o fim. */
  const [cursor, setCursor] = useState<string | null>(null);
  /* Pausa efetiva: o botão, o cartão aberto (a fala não pode sair debaixo dele) e, se ligado,
     o mouse em cima ou o dedo segurando a janela. */
  const pausado = pausaManual || !!cartao || (ap.pausarAoPassar && (sobre || segurando));

  const aMostra = useCallback(
    (f: LegendaAoVivo) => ap.mostrar === 'traducao' || traducaoAMostra(modoDaTraducao, trocas[f.id]),
    [ap.mostrar, modoDaTraducao, trocas],
  );
  const doRitmo: FalaDoRitmo[] = useMemo(
    () => falas.map((f) => ({ id: f.id, caracteres: f.original.length + (aMostra(f) ? f.traducao.length : 0) })),
    [falas, aMostra],
  );
  const [ritmo, setRitmo] = useState(() => iniciarRitmo(doRitmo, Date.now()));
  const [tique, setTique] = useState(0);
  useEffect(() => {
    if (pausado) return;
    const { estado, proximaEmMs } = avancar(ritmo, doRitmo, Date.now(), ap.leitura);
    if (estado !== ritmo) setRitmo(estado);
    if (proximaEmMs === null) return;
    const id = setTimeout(() => setTique((n) => n + 1), proximaEmMs + 16);
    return () => clearTimeout(id);
  }, [ritmo, doRitmo, pausado, ap.leitura, tique]);

  const porId = useMemo(() => new Map(falas.map((f) => [f.id, f])), [falas]);
  const reveladas = ritmo.reveladas.filter((id) => porId.has(id));
  const janela = janelaDaLegenda(reveladas, quantasAVista, cursor, ritmo.atual);
  const idsAVista = janela.ids;
  const emFoco = janela.foco ? porId.get(janela.foco) : undefined;
  const esperando = pausado ? pendentes(ritmo, doRitmo) : 0;
  const novas = janela.novasDepois + esperando;

  const irParaOFim = () => {
    setCursor(null);
    setPausaManual(false);
    setRitmo((r) => saltarParaOFim(r, doRitmo, Date.now()));
  };
  const alternarPausa = () => {
    if (pausaManual) irParaOFim();
    else setPausaManual(true);
  };
  const navegar = (passo: -1 | 1) => {
    if (!reveladas.length) return;
    const i = reveladas.indexOf(janela.foco ?? '');
    if (passo > 0 && (cursor === null || i + 1 >= reveladas.length - 1)) {
      setCursor(null);
      return;
    }
    setCursor(reveladas[Math.max(0, (i < 0 ? reveladas.length - 1 : i) + passo)]);
  };

  /* ── AS AÇÕES DA FALA ─────────────────────────────────────────────────────────────────────── */
  const [aviso, setAviso] = useState('');
  useEffect(() => {
    if (!aviso) return;
    const id = setTimeout(() => setAviso(''), 2600);
    return () => clearTimeout(id);
  }, [aviso]);

  const alternarTraducao = useCallback(
    (f: LegendaAoVivo) => {
      if (!f.traducao) {
        if (f.sobDemanda && aoRevelarTraducao) {
          aoRevelarTraducao(f.id);
          setTrocas((m) => ({ ...m, [f.id]: true }));
        }
        return;
      }
      setTrocas((m) => ({ ...m, [f.id]: !traducaoAMostra(modoDaTraducao, m[f.id]) }));
    },
    [modoDaTraducao, aoRevelarTraducao],
  );
  const ouvirFala = useCallback((f: LegendaAoVivo, lenta: boolean) => aoOuvir?.(f.original, f.lang, lenta), [aoOuvir]);
  const copiar = useCallback((f: LegendaAoVivo) => {
    /* A área de transferência da JANELA onde a pessoa está: na PiP é a dela, não a do app. */
    const nav = raiz.current?.ownerDocument.defaultView?.navigator ?? navigator;
    const texto = f.traducao ? `${f.original}\n${f.traducao}` : f.original;
    if (!nav.clipboard) {
      setAviso(t('Não deu para copiar.'));
      return;
    }
    nav.clipboard.writeText(texto).then(
      () => setAviso(t('Texto copiado')),
      () => setAviso(t('Não deu para copiar.')),
    );
  }, []);
  const salvarFrase = useCallback(
    (f: LegendaAoVivo) => {
      aoSalvarPalavra?.({ palavra: f.original, lang: f.lang, traducao: f.traducao || undefined }).then(setAviso, () =>
        setAviso(t('Não deu para salvar agora.')),
      );
    },
    [aoSalvarPalavra],
  );
  const [cartaoNoAlto, setCartaoNoAlto] = useState(false);
  const idsAVistaRef = useRef<string[]>([]);
  const tocarPalavra = useCallback((palavra: string, f: LegendaAoVivo) => {
    /* Da metade de baixo da janela, o cartão abre em cima: a frase tocada continua à vista. */
    const ids = idsAVistaRef.current;
    setCartaoNoAlto(ids.indexOf(f.id) >= ids.length / 2);
    setCartao({ palavra, frase: f.original, lang: f.lang });
  }, []);

  useEffect(() => {
    idsAVistaRef.current = idsAVista;
  });

  /* ── LEITOR DE TELA: só a fala NOVA e já fechada é anunciada, nunca cada parcial. ─────────── */
  const anunciada = useRef<string | null>(ritmo.atual);
  const [anuncio, setAnuncio] = useState('');
  const atual = ritmo.atual ? porId.get(ritmo.atual) : undefined;
  useEffect(() => {
    if (!atual || atual.parcial || anunciada.current === atual.id) return;
    anunciada.current = atual.id;
    setAnuncio(atual.traducao && aMostra(atual) ? `${atual.original} — ${atual.traducao}` : atual.original);
  }, [atual, aMostra]);

  /* ── TECLADO ───────────────────────────────────────────────────────────────────────────────── */
  const teclar = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const alvo = e.target as HTMLElement | null;
    if (alvo?.closest?.('input,select,textarea,[contenteditable="true"],.leg-cartao')) return;
    const tecla = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (tecla === ' ') {
      if (alvo?.closest?.('button')) return; // o próprio botão já responde ao Espaço
      alternarPausa();
    } else if (tecla === 'ArrowLeft') navegar(-1);
    else if (tecla === 'ArrowRight') navegar(1);
    else if (tecla === 't' && emFoco) alternarTraducao(emFoco);
    else if (tecla === 'p' && emFoco) ouvirFala(emFoco, false);
    else if (tecla === 's' && emFoco && aoSalvarPalavra) salvarFrase(emFoco);
    else return;
    e.preventDefault();
  };
  const teclarRef = useRef(teclar);
  teclarRef.current = teclar;
  /* Na PiP o foco costuma ficar no `body` da janelinha, fora da árvore do React: escuta o documento
     DELA. */
  useEffect(() => {
    const doc = raiz.current?.ownerDocument;
    if (!doc) return;
    const ouvinte = (e: KeyboardEvent) => teclarRef.current(e);
    doc.addEventListener('keydown', ouvinte);
    return () => doc.removeEventListener('keydown', ouvinte);
  }, []);

  /* ── ROLAR PARA VOLTAR (roda do mouse e arrasto do dedo, uma fala por passo) ────────────────── */
  const ultimaRoda = useRef(0);
  const dedoY = useRef<number | null>(null);
  const ultimoToque = useRef(0);

  /* Os controles somem sozinhos — menos com o Personalizar aberto ou o foco neles (quem navega pelo
     teclado não perde o botão de vista). */
  useEffect(() => {
    if (!controles || painel) return;
    const id = setTimeout(() => {
      const ativo = raiz.current?.ownerDocument.activeElement;
      if (ativo && ativo.closest?.('.leg-barra, .leg-painel, .leg-abas')) return;
      setControles(false);
    }, CONTROLES_SOMEM_MS);
    return () => clearTimeout(id);
  }, [controles, painel, mexeu]);

  /* Na PiP, o fundo do documento acompanha o da janela (sem faixa de outra cor ao redimensionar). */
  useEffect(() => {
    if (!naJanela) return;
    const doc = raiz.current?.ownerDocument;
    if (!doc) return;
    doc.body.style.backgroundColor = fundo === 'claro' ? '#f6f1e8' : fundo === 'preto' ? '#000000' : '#141210';
  }, [naJanela, fundo]);

  const salvarAtual = emFoco && aoSalvarPalavra ? () => salvarFrase(emFoco) : undefined;
  const mudarLetra = (passo: -1 | 1) => mudar({ tam: Math.min(160, Math.max(70, ap.tam + passo * 10)) });

  const corpo = recolhido ? null : oculto ? (
    <p className="leg-vazio">{t('Legenda escondida')}</p>
  ) : !janela.ids.length ? (
    <p className="leg-vazio">
      <AudioLines aria-hidden /> {t('Esperando a primeira fala')}
    </p>
  ) : (
    janela.ids.map((id) => {
      const f = porId.get(id)!;
      const podeTrocar = !!f.traducao || (!!f.sobDemanda && !!aoRevelarTraducao);
      return (
        <LinhaDaLegenda
          key={id}
          fala={f}
          modo={modoDoLayout}
          modoDaTraducao={modoDaTraducao}
          traducaoVisivel={aMostra(f)}
          soTraducao={ap.mostrar === 'traducao'}
          emFoco={id === janela.foco}
          aprendidas={aprendidas}
          aoTocarPalavra={tocarPalavra}
          aoAlternarTraducao={podeTrocar ? alternarTraducao : undefined}
          aoRevelarTraducao={aoRevelarTraducao}
          aoOuvir={aoOuvir ? ouvirFala : undefined}
          aoCopiar={copiar}
          aoSalvarFrase={aoSalvarPalavra ? salvarFrase : undefined}
        />
      );
    })
  );

  const claro = fundo === 'claro';
  const estilo = {
    '--leg-tam': ap.tam / 100,
    /* No fundo claro o texto é escuro (as cores escolhidas são para fundo escuro). */
    ...(claro ? {} : { '--leg-cor': ap.cores.legenda, '--leg-trad': ap.cores.traducao }),
    ...(letraPx ? { '--leg-letra': `${letraPx}px` } : {}),
    /* Na janela sempre-no-topo, a caixa É a janela: ocupa tudo e rola se o painel não couber. */
    position: 'relative',
    right: 'auto',
    bottom: 'auto',
    width: '100%',
    height: '100vh',
    maxHeight: 'none',
    borderRadius: 0,
    boxShadow: 'none',
    overflowY: 'auto',
  } as CSSProperties;

  const estudo = layout === 'estudo';
  const cartaoAberto = !!cartao && !recolhido && !abaExtra;
  const classes = [
    'leg-flut',
    'leg-limpa',
    `modo-${modoDoLayout}`,
    classesDoEstiloEquipado,
    recolhido ? 'recolhido' : '',
    pausado ? 'pausado' : '',
    controles || recolhido ? 'com-controles' : '',
    letraPx ? 'letra-da-janela' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      id="leg-flut"
      ref={raiz}
      role="region"
      aria-label={t('Legendas flutuantes')}
      tabIndex={-1}
      data-fundo={fundo}
      data-layout={layout}
      className={classes}
      style={estilo}
      onMouseEnter={() => {
        if (Date.now() - ultimoToque.current > TOQUE_RECENTE_MS) setSobre(true);
        mostrarControles();
      }}
      onMouseMove={mostrarControles}
      onMouseLeave={() => {
        setSobre(false);
        setControles(false);
      }}
      onFocus={mostrarControles}
      onKeyDown={mostrarControles}
      onTouchStart={() => {
        ultimoToque.current = Date.now();
        setSegurando(true);
        mostrarControles();
      }}
      onTouchEnd={() => setSegurando(false)}
      onTouchCancel={() => setSegurando(false)}
    >
      <BarraDaLegenda
        pausado={pausaManual}
        aoPausar={alternarPausa}
        recolhido={recolhido}
        aoRecolher={() => setRecolhido((v) => !v)}
        leitura={ap.leitura}
        aoTrocarLeitura={(leitura) => mudar({ leitura })}
        traducao={ap.traducao}
        aoTrocarTraducao={(traducao) => mudar({ traducao })}
        modo={ap.modo}
        aoTrocarModo={(modo) => mudar({ modo })}
        mostrar={ap.mostrar}
        aoTrocarMostrar={() => mudar({ mostrar: proximoDe(MOSTRAS, ap.mostrar) })}
        aoLetra={mudarLetra}
        letraNoMinimo={ap.tam <= 70}
        letraNoMaximo={ap.tam >= 160}
        fundo={ap.fundo}
        aoTrocarFundo={() => mudar({ fundo: proximoDe(FUNDOS, ap.fundo) })}
        aoSalvarFrase={salvarAtual}
        painel={painel}
        aoPainel={() => setPainel((v) => !v)}
        aoFechar={aoFechar}
      />
      {abasExtras && abasExtras.length > 0 && !recolhido && (
        <div className="leg-abas" role="tablist" aria-label={t('Partes da janela')}>
          {[{ id: 'legendas', rotulo: t('Legendas') }, ...abasExtras].map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              id={`leg-aba-${a.id}`}
              aria-selected={aba === a.id}
              aria-controls={`leg-painel-${a.id}`}
              onClick={() => setAba(a.id)}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
      )}
      {abaExtra && !recolhido ? (
        <div
          className="leg-aba-extra"
          role="tabpanel"
          id={`leg-painel-${abaExtra.id}`}
          aria-labelledby={`leg-aba-${abaExtra.id}`}
        >
          {abaExtra.conteudo}
        </div>
      ) : (
        corpo && (
          <div
            className="leg-corpo"
            onWheel={(e) => {
              const agora = Date.now();
              if (!e.deltaY || agora - ultimaRoda.current < PASSO_DA_RODA_MS) return;
              ultimaRoda.current = agora;
              navegar(e.deltaY < 0 ? -1 : 1);
            }}
            onTouchStart={(e) => {
              dedoY.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchMove={(e) => {
              const y = e.touches[0]?.clientY;
              if (dedoY.current === null || y === undefined) return;
              const dy = y - dedoY.current;
              if (Math.abs(dy) < PASSO_DO_DEDO_PX) return;
              dedoY.current = y;
              navegar(dy > 0 ? -1 : 1);
            }}
          >
            {corpo}
            {novas > 0 && !oculto && (
              <button type="button" className="leg-novas" onClick={irParaOFim}>
                {tp(novas, '{n} nova', '{n} novas')} <ArrowDown aria-hidden />
              </button>
            )}
          </div>
        )
      )}
      {cartaoAberto && cartao && (
        <CartaoDaPalavra
          alvo={cartao}
          noAlto={!estudo && cartaoNoAlto}
          encaixado={estudo}
          aoConsultar={aoConsultarPalavra}
          aoOuvir={aoOuvir}
          aoSalvar={aoSalvarPalavra}
          aoFechar={() => setCartao(null)}
        />
      )}
      {estudo && !cartaoAberto && !recolhido && !abaExtra && (
        <p className="leg-estudo-dica">
          <MousePointerClick aria-hidden /> {t('Toque numa palavra para ver o significado, ouvir e salvar.')}
        </p>
      )}
      {aviso && (
        <p className="leg-aviso" role="status">
          {aviso}
        </p>
      )}
      <p className="leg-anuncio" aria-live="polite">
        {anuncio}
      </p>
      {painel && !recolhido && (
        <PainelDaLegenda
          ap={ap}
          mudar={mudar}
          aoPreset={aplicarPreset}
          aoSalvarMeu={salvarMeu}
          aoResetar={() => mudar({ ...PADRAO })}
          oculto={oculto}
          aoOcultar={() => setOculto((v) => !v)}
        />
      )}
    </div>
  );
}
