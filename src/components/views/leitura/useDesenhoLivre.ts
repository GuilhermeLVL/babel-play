/**
 * O DESENHO LIVRE DA LEITURA — o motor por trás do canvas e da barra de ferramentas.
 *
 * Guarda os traços como vetores (desfazer por traço, refazer em outra largura de janela), pinta com
 * `lib/desenho/tracos`, lembra as preferências e guarda o desenho de cada sessão no navegador
 * (`lib/desenho/persistencia`). A tela só liga `canvasRef` + `handlers` ao canvas e a barra aos controles.
 */
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import {
  acrescentar,
  desfazer as desfazerHist,
  type Historico,
  historicoVazio,
  limpar as limparHist,
  podeDesfazer,
  podeRefazer,
  refazer as refazerHist,
} from '../../../lib/desenho/historico';
import {
  armazemDeDesenhos,
  type DesenhoGuardado,
  type Quadro,
  registrarSalvador,
  type ResultadoDaGravacao,
} from '../../../lib/desenho/persistencia';
import { gerarPng } from '../../../lib/desenho/png';
import {
  carregarPreferencias,
  guardarPreferencias,
  opacidadeDe,
  type PreferenciasDeDesenho,
  pushRecente,
} from '../../../lib/desenho/preferencias';
import {
  colarCamada,
  criarCamadaPadrao,
  desenharTudo,
  fatorDoPonto,
  type Ferramenta,
  limitarLargura,
  novoPonto,
  pintarPonto,
  pintarTrecho,
  reescalar,
  type Traco,
} from '../../../lib/desenho/tracos';
import { t } from '../../../lib/i18n';
import { askConfirm, toast } from '../../Toast';

const ESPERA_PARA_SALVAR_MS = 700;

export interface DesenhoLivre {
  prefs: PreferenciasDeDesenho;
  escolherFerramenta: (f: Ferramenta) => void;
  escolherCor: (hex: string) => void;
  escolherLargura: (n: number) => void;
  escolherOpacidade: (n: number) => void;
  desfazer: () => void;
  refazer: () => void;
  limparTudo: () => Promise<void>;
  podeDesfazer: boolean;
  podeRefazer: boolean;
  temTracos: boolean;
  /** `cheio`/`indisponivel` quando o navegador não deixou guardar; `null` se está tudo certo. */
  aviso: ResultadoDaGravacao | null;
  handlers: {
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  };
}

interface TracoEmCurso {
  traco: Traco;
  pointerId: number;
  ultimoT: number;
}

export function useDesenhoLivre(opts: {
  sessionId: string | undefined;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** O modo desenho está ligado (os atalhos Ctrl+Z só valem com ele). */
  ativo: boolean;
  /** Mudou a mancha do texto (fonte, modo de exibição…): remede o canvas. */
  remedir?: readonly unknown[];
}): DesenhoLivre {
  const { sessionId, canvasRef, ativo } = opts;

  const [prefs, setPrefs] = useState<PreferenciasDeDesenho>(carregarPreferencias);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const [estado, setEstado] = useState({ desfazer: false, refazer: false, tem: false });
  const [aviso, setAviso] = useState<ResultadoDaGravacao | null>(null);
  const avisouRef = useRef(false);

  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const hist = useRef<Historico<Traco>>(historicoVazio());
  const larguraRef = useRef(0);
  const outrosQuadros = useRef<Quadro[]>([]);
  const carregado = useRef(false);
  const sujo = useRef(false);
  const timer = useRef<number | null>(null);
  const base = useRef<HTMLCanvasElement | null>(null);
  const camada = useRef<HTMLCanvasElement | null>(null);
  const emCurso = useRef<TracoEmCurso | null>(null);

  const sincronizarEstado = useCallback(() => {
    const h = hist.current;
    setEstado({ desfazer: podeDesfazer(h), refazer: podeRefazer(h), tem: h.itens.length > 0 });
  }, []);

  /* ── pintura na tela ── */
  const mostrar = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (base.current) ctx.drawImage(base.current, 0, 0);
    const c = emCurso.current;
    if (c && camada.current) colarCamada(ctx, camada.current, c.traco);
  }, [canvasRef]);

  const redesenhar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!base.current) base.current = criarCamadaPadrao(canvas.width, canvas.height);
    base.current.width = canvas.width;
    base.current.height = canvas.height;
    const bc = base.current.getContext('2d');
    if (bc) desenharTudo(bc, hist.current.itens);
    mostrar();
  }, [canvasRef, mostrar]);

  /** Ajusta o bitmap ao tamanho da mancha do texto; se a largura mudou, o desenho muda junto. */
  const medir = useCallback(
    (forcar = false) => {
      const canvas = canvasRef.current;
      const pai = canvas?.parentElement;
      if (!canvas || !pai) return;
      const w = Math.round(pai.clientWidth);
      const h = Math.round(pai.clientHeight);
      if (w <= 0 || h <= 0) return;
      const mudou = canvas.width !== w || canvas.height !== h;
      if (!mudou && !forcar) return;
      if (larguraRef.current > 0 && Math.abs(w / larguraRef.current - 1) > 0.005) {
        const fator = w / larguraRef.current;
        hist.current = {
          itens: reescalar(hist.current.itens, fator),
          refazer: reescalar(hist.current.refazer, fator),
        };
      }
      larguraRef.current = w;
      if (mudou) {
        canvas.width = w;
        canvas.height = h;
      }
      redesenhar();
    },
    [canvasRef, redesenhar],
  );

  /* ── guardar ── */
  const salvar = useCallback(
    async (id: string | undefined, forcar = false): Promise<void> => {
      if (!id || !carregado.current || (!sujo.current && !forcar)) return;
      sujo.current = false;
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      const tracos = [...hist.current.itens];
      const canvas = canvasRef.current;
      const largura = larguraRef.current || canvas?.width || 0;
      const altura = canvas?.height || 0;
      const armazem = armazemDeDesenhos();
      if (tracos.length === 0 && outrosQuadros.current.length === 0) {
        await armazem.apagar(id);
        return;
      }
      const feito = gerarPng(tracos, largura, altura);
      const quadro: Quadro = {
        largura,
        altura: feito?.altura ?? altura,
        tracos,
        ...(feito ? { png: feito.png } : {}),
      };
      const desenho: DesenhoGuardado = {
        v: 1,
        quadros: [quadro, ...outrosQuadros.current],
        atualizadoEm: Date.now(),
      };
      const r = await armazem.gravar(id, desenho);
      if (r !== 'ok') {
        setAviso(r);
        if (!avisouRef.current) {
          avisouRef.current = true;
          toast.warn(
            r === 'cheio'
              ? t('O navegador está sem espaço: este desenho não foi guardado.')
              : t('Este navegador não deixa guardar o desenho: ele vale só até sair da tela.'),
          );
        }
      } else setAviso(null);
    },
    [canvasRef],
  );

  const agendarSalvar = useCallback(() => {
    sujo.current = true;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void salvar(sessionIdRef.current), ESPERA_PARA_SALVAR_MS);
  }, [salvar]);
  /* ── a sessão: carrega ao entrar, salva ao sair ── */
  useEffect(() => {
    let cancelado = false;
    carregado.current = false;
    hist.current = historicoVazio();
    outrosQuadros.current = [];
    larguraRef.current = 0;
    sujo.current = false;
    sincronizarEstado();
    redesenhar();

    const id = sessionId;
    if (id) {
      void armazemDeDesenhos()
        .ler(id)
        .then((d) => {
          if (cancelado) return;
          const [primeiro, ...resto] = d?.quadros ?? [];
          if (primeiro) {
            hist.current = historicoVazio(primeiro.tracos);
            larguraRef.current = primeiro.largura;
            outrosQuadros.current = resto;
          }
          carregado.current = true;
          medir(true);
          sincronizarEstado();
        })
        .catch(() => {
          if (cancelado) return;
          carregado.current = true;
        });
    } else carregado.current = true;

    const desregistrar = id ? registrarSalvador(id, () => salvar(id, true)) : () => undefined;
    const aoSair = () => void salvar(id);
    const aoEsconder = () => {
      if (document.visibilityState === 'hidden') aoSair();
    };
    window.addEventListener('pagehide', aoSair);
    document.addEventListener('visibilitychange', aoEsconder);
    return () => {
      cancelado = true;
      window.removeEventListener('pagehide', aoSair);
      document.removeEventListener('visibilitychange', aoEsconder);
      desregistrar();
      void salvar(id);
    };
  }, [sessionId, medir, redesenhar, salvar, sincronizarEstado]);

  /* ── o tamanho: ao montar, ao redimensionar e quando o texto muda de mancha ── */
  useEffect(() => {
    const pai = canvasRef.current?.parentElement;
    const h = () => medir();
    const primeiro = window.setTimeout(h, 60);
    window.addEventListener('resize', h);
    const ro = typeof ResizeObserver !== 'undefined' && pai ? new ResizeObserver(h) : null;
    if (ro && pai) ro.observe(pai);
    return () => {
      window.clearTimeout(primeiro);
      window.removeEventListener('resize', h);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medir, canvasRef, ...(opts.remedir ?? [])]);

  /* ── preferências ── */
  const mudarPrefs = useCallback((fn: (p: PreferenciasDeDesenho) => PreferenciasDeDesenho) => {
    setPrefs((anterior) => {
      const proxima = fn(anterior);
      guardarPreferencias(proxima);
      return proxima;
    });
  }, []);

  const escolherFerramenta = useCallback((f: Ferramenta) => mudarPrefs((p) => ({ ...p, ferramenta: f })), [mudarPrefs]);
  const escolherCor = useCallback((cor: string) => mudarPrefs((p) => ({ ...p, cor })), [mudarPrefs]);
  const escolherLargura = useCallback(
    (n: number) => mudarPrefs((p) => ({ ...p, larguras: { ...p.larguras, [p.ferramenta]: limitarLargura(n) } })),
    [mudarPrefs],
  );
  const escolherOpacidade = useCallback(
    (n: number) =>
      mudarPrefs((p) => {
        const v = Math.min(1, Math.max(0.1, n));
        if (p.ferramenta === 'pincel') return { ...p, opacidadePincel: v };
        if (p.ferramenta === 'marca-texto') return { ...p, opacidadeMarcaTexto: v };
        return p;
      }),
    [mudarPrefs],
  );

  /* ── desfazer / refazer / limpar ── */
  const aposMudar = useCallback(() => {
    redesenhar();
    sincronizarEstado();
    agendarSalvar();
  }, [redesenhar, sincronizarEstado, agendarSalvar]);

  const desfazer = useCallback(() => {
    if (emCurso.current) return;
    hist.current = desfazerHist(hist.current);
    aposMudar();
  }, [aposMudar]);

  const refazer = useCallback(() => {
    if (emCurso.current) return;
    hist.current = refazerHist(hist.current);
    aposMudar();
  }, [aposMudar]);

  const limparTudo = useCallback(async () => {
    if (hist.current.itens.length === 0) return;
    const ok = await askConfirm({
      title: t('Apagar todo o desenho?'),
      detail: t('Todos os traços desta sessão serão apagados. Isso não dá para desfazer.'),
      confirmLabel: t('Apagar tudo'),
      cancelLabel: t('Cancelar'),
      danger: true,
    });
    if (!ok) return;
    hist.current = limparHist<Traco>();
    aposMudar();
    void salvar(sessionIdRef.current);
    toast.info(t('Desenhos apagados'));
  }, [aposMudar, salvar]);

  /* ── os atalhos: Ctrl+Z desfaz, Ctrl+Shift+Z / Ctrl+Y refaz (menos dentro de um campo de texto) ── */
  useEffect(() => {
    if (!ativo) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || /^(input|textarea|select)$/i.test(alvo.tagName))) {
        const tipo = (alvo as HTMLInputElement).type;
        if (!(alvo.tagName === 'INPUT' && (tipo === 'range' || tipo === 'color' || tipo === 'checkbox'))) return;
      }
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        desfazer();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        refazer();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [ativo, desfazer, refazer]);

  /* ── o traço, com mouse, toque e caneta ── */
  const pontoDe = (canvas: HTMLCanvasElement, e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    const ex = r.width ? canvas.width / r.width : 1;
    const ey = r.height ? canvas.height / r.height : 1;
    return { x: (e.clientX - r.left) * ex, y: (e.clientY - r.top) * ey };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !carregado.current || emCurso.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    medir();
    const p = prefsRef.current;
    const { x, y } = pontoDe(canvas, e);
    const f = p.ferramenta;
    const traco: Traco = {
      f,
      cor: p.cor,
      w: p.larguras[f],
      a: opacidadeDe(p, f),
      pts: [novoPonto(x, y, fatorDoPonto(f, e, 0, undefined))],
    };
    if (!camada.current) camada.current = criarCamadaPadrao(canvas.width, canvas.height);
    camada.current.width = canvas.width;
    camada.current.height = canvas.height;
    const cc = camada.current.getContext('2d');
    if (!cc) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ponteiro já solto */
    }
    emCurso.current = { traco, pointerId: e.pointerId, ultimoT: e.timeStamp };
    pintarPonto(cc, traco);
    mostrar();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = emCurso.current;
    const canvas = canvasRef.current;
    const cc = camada.current?.getContext('2d');
    if (!c || !canvas || !cc || e.pointerId !== c.pointerId) return;
    const nativos = e.nativeEvent as PointerEvent;
    const eventos = typeof nativos.getCoalescedEvents === 'function' ? nativos.getCoalescedEvents() : [];
    const lista: PointerEvent[] = eventos.length > 0 ? eventos : [nativos];
    let mudou = false;
    for (const ev of lista) {
      const { x, y } = pontoDe(canvas, ev);
      const t = c.traco;
      const ant = t.pts[t.pts.length - 1]!;
      const dist = Math.hypot(x - ant[0], y - ant[1]);
      if (dist < 1) continue;
      const dt = Math.max(1, ev.timeStamp - c.ultimoT);
      c.ultimoT = ev.timeStamp;
      t.pts.push(novoPonto(x, y, fatorDoPonto(t.f, ev, dist / dt, ant[2])));
      pintarTrecho(cc, t, t.pts.length - 1);
      mudou = true;
    }
    if (mudou) mostrar();
  };

  const terminar = (e: React.PointerEvent<HTMLCanvasElement>, cancelado: boolean) => {
    const c = emCurso.current;
    const canvas = canvasRef.current;
    if (!c || !canvas || e.pointerId !== c.pointerId) return;
    emCurso.current = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* já solto */
    }
    const cc = camada.current?.getContext('2d');
    const bc = base.current?.getContext('2d');
    if (cancelado || !cc || !bc || !camada.current) {
      mostrar();
      return;
    }
    pintarTrecho(cc, c.traco, c.traco.pts.length);
    colarCamada(bc, camada.current, c.traco);
    hist.current = acrescentar(hist.current, c.traco);
    if (c.traco.f !== 'borracha') {
      const cor = c.traco.cor;
      mudarPrefs((p) => ({ ...p, recentes: pushRecente(p.recentes, cor) }));
    }
    mostrar();
    sincronizarEstado();
    agendarSalvar();
  };

  return {
    prefs,
    escolherFerramenta,
    escolherCor,
    escolherLargura,
    escolherOpacidade,
    desfazer,
    refazer,
    limparTudo,
    podeDesfazer: estado.desfazer,
    podeRefazer: estado.refazer,
    temTracos: estado.tem,
    aviso,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e) => terminar(e, false),
      onPointerCancel: (e) => terminar(e, true),
    },
  };
}
