import {
  BookOpen,
  Check,
  ChevronDown,
  Database,
  Eye,
  FileText,
  Gamepad2,
  History,
  Languages,
  Layers,
  LoaderCircle,
  type LucideIcon,
  PanelRight,
  PenLine,
  PictureInPicture2,
  Plus,
  Route,
  Send,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { AppMetrics } from '../core/learning/contract';
import { apiFetch } from '../data/api';
import { exportarApkg, fetchDeck } from '../data/rotas/vocabulario';
import { t } from '../lib/i18n';
import {
  carregarConversas,
  type Conversa,
  type MensagemDoChat,
  novaConversa,
  type Proposta,
  rastrear,
  salvarConversas,
  TITULO_NOVA,
  tituloDaPergunta,
} from '../lib/ichat/conversas';
import {
  ACOES_DO_CHAT,
  CLASSE_DO_SIGILO,
  ehTelaDeSessao,
  ferramentasDaTela,
  type Ficha,
  focoNaPalavra,
  type IdDaFerramenta,
  lerPedido,
  origemDaResposta,
  pedidoDoTutor,
  PERGUNTA_DA_FERRAMENTA,
  propostaDoPedido,
  RESPOSTA_DA_LACUNA,
  rotuloDaFerramenta,
  type Sigilo,
} from '../lib/ichat/pedido';
import { construirContextoDaTela } from '../lib/ichatContext';
import { type AgeProfileType } from '../lib/profile';
import { seedFromSelection } from '../lib/sentences';
import { Recording, ViewType, VocabCard } from '../types';
import { GavetaDeConversas, GavetaDoRastro } from './ichat/Gavetas';
import { camposDaTela, nomeDaTela } from './ichat/telaDoChat';
import { TextoDoChat } from './ichat/textoDoChat';

interface IChatProps {
  activeView: ViewType;
  selectedRecording: Recording | null;
  liveTranscription: string;
  onChangeView: (view: ViewType, data?: any) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  /** A PREFERÊNCIA de fixar na lateral. Sem espaço, o chat flutua sem apagá-la. */
  isDocked: boolean;
  setIsDocked: (isDocked: boolean) => void;
  practiceSeed?: string;
  recordings?: Recording[];
  /** As métricas do App: os campos de contexto e as propostas usam os números reais daqui. */
  metrics?: AppMetrics | null;
  /** Registro de linguagem do tutor. Sem isto ele responde igual a uma criança e a um executivo. */
  ageProfile?: AgeProfileType;
}

/**
 * A frase que explica o que aconteceu, ou `null` quando a resposta é uma resposta de verdade.
 *
 * Cada motivo tem a sua saída: quem não tem plano precisa saber que é plano, quem mandou texto
 * demais precisa saber que é tamanho, e só quem realmente não tem modelo local ouve falar do
 * Ollama. Uma frase só para tudo é o mesmo que não responder.
 */
function motivoDaResposta(res: Response, data: Record<string, unknown>): string | null {
  const code = typeof data.code === 'string' ? data.code : undefined;
  const reason = typeof data.reason === 'string' ? data.reason : undefined;
  const erro = typeof data.error === 'string' ? data.error : undefined;

  if (code === 'quota_exceeded') {
    return '**Você usou toda a IA de nuvem do seu plano neste mês.** Ela volta no dia 1º; a tradução e a transcrição locais continuam funcionando.';
  }
  if (
    reason === 'managed_requires_plan' ||
    reason === 'managed_requires_pro' ||
    res.status === 402 ||
    code === 'plano_insuficiente'
  ) {
    return '**O tutor de IA faz parte dos planos pagos.** Você pode assinar em Ajustes → Plano.';
  }
  if (res.status === 503 || reason === 'nuvem_indisponivel') {
    // O servidor diz o motivo (IA desligada, orçamento do mês, contador fora do ar): mostrar é honesto.
    return `**A IA de nuvem está indisponível agora.** ${erro ?? 'Tente de novo em alguns minutos.'}`;
  }
  if (res.status === 413 || code === 'payload_grande') {
    return '**O texto ficou grande demais para uma pergunta só.** Selecione um trecho menor da tela e tente de novo.';
  }
  if (res.status === 429 || code === 'rate_limit') {
    return '**Muitas perguntas em pouco tempo.** Espere alguns segundos e tente de novo.';
  }
  if (data.unavailable || reason === 'no_local_model') {
    return '**IA local indisponível.** Instale o Ollama em [ollama.com](https://ollama.com) e rode `ollama run llama3.2` no terminal para ativar o tutor. Depois disso, é só me perguntar de novo!';
  }
  if (!res.ok) {
    // Erro que a tela não conhece: mostrar o que o servidor disse é melhor que inventar um motivo.
    return `**Não consegui responder agora.** ${erro ?? `O servidor respondeu ${res.status}.`}`;
  }
  if (!data.text) {
    return '**Não veio resposta do modelo.** Tente perguntar de novo.';
  }
  return null;
}

/* O CHAT FIXO NA LATERAL (protótipo, rodada 14): vira uma coluna ao lado do conteúdo, que encolhe em
   vez de ficar por baixo. Borda esquerda arrastável (320–560 px); sem espaço para o conteúdo seguir
   legível (440 px), ou no celular, volta a flutuar SOZINHO — sem apagar a escolha de fixar. */
const DOCA = { min: 320, max: 560, conteudoMin: 440 };
const LARGURA_KEY = 'ichat_largura';
const TAMANHO_KEY = 'ichat_tamanho';
/* A janela flutuante: redimensiona pelo canto, 340–640 × 420–820 (os limites do protótipo). */
const JANELA = { wMin: 340, wMax: 640, hMin: 420, hMax: 820 };
const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Math.round(v)));

const ICONE_DA_FERRAMENTA: Record<IdDaFerramenta, LucideIcon> = {
  explicar: BookOpen,
  traduzir: Languages,
  revisar: Target,
  jogar: Gamepad2,
  frase: PenLine,
  resumir: FileText,
  anki: Layers,
};

const SUGESTOES = [
  'O que revisar hoje?',
  'Resumir esta sessão',
  'Qual jogo começo?',
  'Crie uma frase com as minhas palavras',
];

const semMovimento = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function lerJson<T>(chave: string, padrao: T): T {
  try {
    const v = localStorage.getItem(chave);
    return v ? (JSON.parse(v) as T) : padrao;
  } catch {
    return padrao;
  }
}

function baixar(blob: Blob, nome: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

interface Pendente {
  conversa: string;
  ferramenta: string | null;
}
/* A resposta sendo revelada é identificada pela PRÓPRIA mensagem (referência), e não por índice:
   o índice só se sabe depois que o estado aplica o acréscimo, e esperar por ele fazia a origem e a
   proposta piscarem antes de a revelação começar. */
interface Revelando {
  msg: MensagemDoChat;
  k: number;
}

export default function IChat({
  activeView,
  selectedRecording,
  liveTranscription,
  onChangeView,
  isOpen,
  setIsOpen,
  isDocked,
  setIsDocked,
  practiceSeed,
  recordings = [],
  metrics = null,
  ageProfile = 'pro',
}: IChatProps) {
  /* ── Conversas (persistidas) ── */
  const [estado, setEstado] = useState(() => carregarConversas());
  const { conversas, atual } = estado;
  const conv = conversas.find((c) => c.id === atual) ?? conversas[0];
  useEffect(() => salvarConversas(conversas, atual), [conversas, atual]);
  const atualRef = useRef(atual);
  atualRef.current = atual;

  const mudarConversa = useCallback((id: string, fn: (c: Conversa) => Conversa) => {
    setEstado((e) => ({ ...e, conversas: e.conversas.map((c) => (c.id === id ? fn(c) : c)) }));
  }, []);
  const naAtual = useCallback((fn: (c: Conversa) => Conversa) => mudarConversa(atualRef.current, fn), [mudarConversa]);

  /* ── Estado da interface ── */
  const [painel, setPainel] = useState<null | 'conversas' | 'rastro'>(null);
  const [auto, setAuto] = useState(true);
  const [ctxAberto, setCtxAberto] = useState(false);
  const [ferramentas, setFerramentas] = useState(false);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [mencao, setMencao] = useState<Sigilo | null>(null);
  const [mencaoQ, setMencaoQ] = useState('');
  const [rascunho, setRascunho] = useState('');
  const [busca, setBusca] = useState('');
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [revelando, setRevelando] = useState<Revelando | null>(null);
  const digitando = !!pendente || !!revelando;

  const [deck, setDeck] = useState<VocabCard[] | null>(null);
  const noCaderno = useMemo(() => (deck ?? []).filter((c) => c.inDeck !== false), [deck]);

  const nome = nomeDaTela(activeView, ageProfile);
  /* O idioma que domina o caderno, dito como no protótipo ("idioma: inglês"). */
  const idioma = useMemo(() => {
    const conta = new Map<string, number>();
    for (const c of noCaderno) if (c.srcLang) conta.set(c.srcLang, (conta.get(c.srcLang) ?? 0) + 1);
    const [codigo] = [...conta.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (!codigo) return null;
    try {
      return new Intl.DisplayNames(['pt-BR'], { type: 'language' }).of(codigo.split('-')[0])?.toLowerCase() ?? null;
    } catch {
      return null;
    }
  }, [noCaderno]);
  const campos = camposDaTela({ view: activeView, metrics, recordings, selectedRecording, liveTranscription, idioma });
  const pendentes = metrics?.dueToday ?? 0;

  const entradaRef = useRef<HTMLInputElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const focarEntrada = () => setTimeout(() => entradaRef.current?.focus(), 0);

  /* ── Aviso (`.toast` do protótipo): "iChat sintonizado com", "Conversa apagada"… ── */
  const [aviso, setAviso] = useState<{ n: number; conteudo: React.ReactNode; chat: boolean } | null>(null);
  const [avisoVisivel, setAvisoVisivel] = useState(false);
  const avisar = useCallback((conteudo: React.ReactNode, chat = false) => {
    setAviso((a) => ({ n: (a?.n ?? 0) + 1, conteudo, chat }));
    setAvisoVisivel(true);
  }, []);
  useEffect(() => {
    if (!aviso) return;
    const id = setTimeout(() => setAvisoVisivel(false), 2600);
    return () => clearTimeout(id);
  }, [aviso]);

  /* ── Rastro da tela: toda troca de tela entra na conversa atual (aberta ou não). ── */
  const avisadas = useRef(new Set<ViewType>());
  const primeiraTela = useRef(true);
  useEffect(() => {
    naAtual((c) => rastrear(c, 'tela', nome));
    // Aviso do iChat: nome da tela, não o id; uma vez por tela, e nunca no Início.
    if (primeiraTela.current) {
      primeiraTela.current = false;
      return;
    }
    if (!isOpen && !avisadas.current.has(activeView) && activeView !== 'hub') {
      avisadas.current.add(activeView);
      avisar(
        <>
          {t('iChat sintonizado com:')} <b>{nome}</b>
        </>,
        true,
      );
    }
    // Só a troca de TELA dispara: abrir/fechar o chat não é navegação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  /* ── Abrir: registra a tela, carrega o caderno (para @palavra) e põe o foco na caixa. ── */
  useEffect(() => {
    if (!isOpen) return;
    naAtual((c) => rastrear(c, 'tela', nome));
    let vivo = true;
    fetchDeck()
      .then((d) => vivo && setDeck(d))
      .catch(() => vivo && setDeck([]));
    focarEntrada();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const fechar = useCallback(() => {
    setIsOpen(false);
    setTimeout(() => fabRef.current?.focus(), 0);
  }, [setIsOpen]);

  // Esc fecha o chat de qualquer lugar (a caixa de texto trata o dela antes, ver `aoTeclar`).
  useEffect(() => {
    if (!isOpen) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open],[role="alertdialog"]'))
        return;
      fechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [isOpen, fechar]);

  /* ── Doca: medir se cabe e com que largura. ── */
  const [largura, setLargura] = useState(() =>
    limitar(Number(localStorage.getItem(LARGURA_KEY)) || 380, DOCA.min, DOCA.max),
  );
  const [tamanho, setTamanho] = useState(() => lerJson(TAMANHO_KEY, { w: 400, h: 660 }));
  const [medida, setMedida] = useState({ app: 0, menu: 0 });
  const ocupandoRef = useRef(0);
  useLayoutEffect(() => {
    const principal = document.querySelector('main');
    const linha = principal?.parentElement;
    if (!principal || !linha) return;
    const medir = () => {
      const app = linha.clientWidth;
      setMedida({ app, menu: Math.max(0, app - principal.clientWidth - ocupandoRef.current) });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(linha);
    ro.observe(principal);
    window.addEventListener('resize', medir);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', medir);
    };
  }, []);
  const cabe = medida.app > 760 && medida.app - medida.menu - DOCA.min >= DOCA.conteudoMin;
  const larguraDaDoca = Math.max(DOCA.min, Math.min(largura, DOCA.max, medida.app - medida.menu - DOCA.conteudoMin));
  const naDoca = isDocked && isOpen && cabe;
  ocupandoRef.current = naDoca ? larguraDaDoca : 0;

  const guardarLargura = (px: number) => {
    const nova = limitar(px, DOCA.min, DOCA.max);
    setLargura(nova);
    try {
      localStorage.setItem(LARGURA_KEY, String(nova));
    } catch {
      /* só não lembra da largura */
    }
  };

  const arrastar = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const alca = e.currentTarget;
    alca.setPointerCapture(e.pointerId);
    const soltar = () => {
      alca.removeEventListener('pointermove', mover);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };
    let mover: (ev: PointerEvent) => void;
    if (naDoca) {
      const direita = (document.querySelector('main')?.parentElement ?? document.body).getBoundingClientRect().right;
      const menuADireita = Math.max(0, direita - (alca.parentElement?.getBoundingClientRect().right ?? direita));
      document.body.style.cursor = 'ew-resize';
      mover = (ev) => guardarLargura(direita - menuADireita - ev.clientX);
    } else {
      const x0 = e.clientX;
      const y0 = e.clientY;
      const { w: w0, h: h0 } = tamanho;
      document.body.style.cursor = 'nwse-resize';
      mover = (ev) => {
        const novo = {
          w: limitar(w0 + (x0 - ev.clientX), JANELA.wMin, JANELA.wMax),
          h: limitar(h0 + (y0 - ev.clientY), JANELA.hMin, JANELA.hMax),
        };
        setTamanho(novo);
        try {
          localStorage.setItem(TAMANHO_KEY, JSON.stringify(novo));
        } catch {
          /* só não lembra do tamanho */
        }
      };
    }
    document.body.style.userSelect = 'none';
    alca.addEventListener('pointermove', mover);
    alca.addEventListener('pointerup', soltar, { once: true });
    alca.addEventListener('pointercancel', soltar, { once: true });
  };

  const alternarDoca = () => {
    const fixo = !isDocked;
    setIsDocked(fixo);
    if (fixo && !cabe)
      avisar(t('Pouco espaço nesta janela: o iChat fica flutuante. Recolha o menu (Ctrl+B) ou aumente a janela.'));
    else
      avisar(
        fixo
          ? t('iChat fixo na lateral direita. Arraste a borda para mudar a largura.')
          : t('iChat solto: volta a flutuar sobre a tela.'),
      );
  };

  /* ── Mensagens: rolar para o fim a cada mudança, e revelar a resposta aos poucos. ── */
  useLayoutEffect(() => {
    const m = msgsRef.current;
    if (m) m.scrollTop = m.scrollHeight;
  });
  useEffect(() => {
    if (!revelando) return;
    if (revelando.k >= revelando.msg.txt.split(' ').length) {
      setRevelando(null);
      return;
    }
    const id = setTimeout(() => setRevelando((r) => (r ? { ...r, k: r.k + 3 } : r)), 40);
    return () => clearTimeout(id);
  }, [revelando]);

  const responderNaConversa = (id: string, m: MensagemDoChat) => {
    mudarConversa(id, (c) => ({ ...c, msgs: [...c.msgs, m], quando: Date.now() }));
    setPendente(null);
    if (!semMovimento()) setRevelando({ msg: m, k: 3 });
  };

  /* Terminada a resposta, o foco volta à caixa (como no protótipo) — a não ser que a pessoa esteja
     na busca de conversas ou renomeando uma. */
  useEffect(() => {
    if (!isOpen || digitando) return;
    const ativo = document.activeElement?.id;
    if (ativo === 'ch-busca' || ativo === 'ch-renome') return;
    entradaRef.current?.focus();
  }, [digitando, isOpen]);

  /* ── O material que vai ao tutor: a tela (se Auto), as fichas e o que a ação precisa. ── */
  const montarMaterial = async (pergunta: string, usadas: Ficha[]) => {
    const pedido = lerPedido(
      pergunta,
      usadas,
      noCaderno.map((c) => c.word),
    );
    const blocos: string[] = [];
    if (auto) {
      const tela = await construirContextoDaTela(activeView, selectedRecording, liveTranscription, { practiceSeed });
      blocos.push(`[CONTEXTO ATUAL DA TELA]\nTela: ${nome}.${campos.length ? ` ${campos.join('; ')}.` : ''}\n${tela}`);
    }
    const palavrasEmFoco = [...usadas.filter((f) => f.sig === '@').map((f) => f.rot)];
    if (pedido.palavra && !palavrasEmFoco.includes(pedido.palavra)) palavrasEmFoco.push(pedido.palavra);
    for (const w of palavrasEmFoco) {
      const c = noCaderno.find((x) => x.word === w);
      if (!c) continue;
      const origemDaPalavra = recordings.find((r) => r.id === c.sourceSessionId)?.title;
      blocos.push(
        `[PALAVRA DO CADERNO] ${c.word} = ${c.translation || '(sem tradução)'}` +
          `${c.cefrLevel ? `; nível ${c.cefrLevel}` : ''}${c.sentence ? `; frase da gravação: "${c.sentence}"` : ''}` +
          `${origemDaPalavra ? `; veio da sessão "${origemDaPalavra}"` : ''}`,
      );
    }
    const sessoesDasFichas = usadas
      .filter((f) => f.sig === '#')
      .map((f) => recordings.find((r) => r.id === f.id))
      .filter((r): r is Recording => !!r);
    const sessaoDoResumo =
      pedido.acao === 'resumir' && !sessoesDasFichas.length && ehTelaDeSessao(activeView) ? selectedRecording : null;
    for (const r of [...sessoesDasFichas, ...(sessaoDoResumo && !auto ? [sessaoDoResumo] : [])]) {
      blocos.push(`[SESSÃO "${r.title}"]\n${await construirContextoDaTela('analysis', r, '', {})}`);
    }
    if (pedido.acao === 'revisar') {
      const agora = Date.now();
      const devidas = noCaderno.filter((c) => c.dueAtMs != null && c.dueAtMs <= agora).map((c) => c.word);
      blocos.push(
        `[FILA DE REVISÃO] ${pendentes} palavra(s) pendente(s) hoje${devidas.length ? `: ${devidas.slice(0, 30).join(', ')}` : ''}.`,
      );
    }
    if (pedido.acao === 'jogar' || pedido.acao === 'frase') {
      const base = conv.palavras.length ? conv.palavras : noCaderno.slice(0, 20).map((c) => c.word);
      blocos.push(`[CADERNO] ${metrics?.deckSize ?? noCaderno.length} palavra(s). Palavras: ${base.join(', ')}.`);
    }
    const sessao = sessoesDasFichas[0]?.title ?? (pedido.acao === 'resumir' ? selectedRecording?.title : null) ?? null;
    return {
      pedido,
      blocos,
      origem: origemDaResposta({
        pedido,
        sessao,
        palavrasNoCaderno: metrics?.deckSize ?? noCaderno.length,
        auto,
        nomeDaTela: nome,
      }),
    };
  };

  /* ── Enviar: pergunta + fichas → etapa "consultando…" → resposta real do tutor. ── */
  const enviar = async (bruto: string, usadas: Ficha[] = fichas) => {
    const texto = bruto.trim();
    if (!texto || digitando) return;
    const id = conv.id;
    const historico = conv.msgs;
    const pedido = lerPedido(
      texto,
      usadas,
      noCaderno.map((c) => c.word),
    );
    mudarConversa(id, (c) => {
      let n: Conversa = {
        ...c,
        msgs: [...c.msgs, { de: 'eu', txt: texto, tokens: usadas.map((f) => f.sig + f.rot) }],
        titulo: c.titulo === TITULO_NOVA ? tituloDaPergunta(texto) : c.titulo,
        quando: Date.now(),
        sessoes: [...new Set([...c.sessoes, ...usadas.filter((f) => f.sig === '#').map((f) => f.id)])],
      };
      n = rastrear(n, 'pergunta', texto.length > 48 ? `${texto.slice(0, 48)}…` : texto, `na tela ${nome}`);
      if (focoNaPalavra(pedido) && pedido.palavra) {
        const card = noCaderno.find((x) => x.word === pedido.palavra);
        const de = recordings.find((r) => r.id === card?.sourceSessionId)?.title;
        n = rastrear(
          n,
          'palavra',
          pedido.palavra,
          [card?.cefrLevel, de ?? card?.translation].filter(Boolean).join(' · '),
        );
      }
      if (pedido.acao === 'revisar') n = rastrear(n, 'acao', '!revisar', `${pendentes} palavras`);
      if (pedido.acao === 'jogar') n = rastrear(n, 'acao', '!jogar');
      if (pedido.acao === 'frase') n = rastrear(n, 'acao', '!frase');
      if (pedido.acao === 'resumir') {
        const s = usadas.find((f) => f.sig === '#')?.rot ?? selectedRecording?.title ?? '';
        n = rastrear(n, 'acao', '!resumir', s);
        if (s) n = rastrear(n, 'sessao', s);
      }
      return n;
    });
    setFichas([]);
    setMencao(null);
    setRascunho('');

    // P3: o que o iChat não enxerga não vai ao modelo — "não sei" é resposta.
    if (pedido.lacuna) {
      setPendente({ conversa: id, ferramenta: null });
      setTimeout(
        () => responderNaConversa(id, { de: 'ia', txt: RESPOSTA_DA_LACUNA, origem: 'lacuna conhecida' }),
        semMovimento() ? 0 : 250,
      );
      return;
    }

    setPendente({
      conversa: id,
      ferramenta: rotuloDaFerramenta(
        pedido,
        usadas.some((f) => f.sig === '#'),
      ),
    });
    const { blocos, origem } = await montarMaterial(texto, usadas);

    /* O PROMPT É DO SERVIDOR (Fase 2 do lançamento). Esta tela escrevia o `systemInstruction` inteiro
       — persona, tom, registro por idade e a cláusula de contenção — e o servidor o repassava ao
       modelo: quem chamasse a rota escolhia o que o LLM do dono fazia. Agora vão só a FUNÇÃO, o
       perfil de idade e o conteúdo; o servidor monta o `system` e cerca o material como dado
       (`server/ai/llmRequest.ts`). O material e o histórico são cortados aqui para caber no teto de
       entrada do tutor, em vez de a pergunta voltar com 413. */
    const { material, mensagens } = pedidoDoTutor(
      blocos.join('\n\n'),
      historico
        .filter((x) => !x.erro)
        .map((m) => ({ role: m.de === 'eu' ? ('user' as const) : ('assistant' as const), content: m.txt })),
      texto,
    );

    try {
      const res = await apiFetch('/api/tutor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funcao: 'tutor', perfil: ageProfile, material, messages: mensagens }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const motivo = motivoDaResposta(res, data);
      responderNaConversa(
        id,
        motivo
          ? { de: 'ia', txt: motivo, erro: true }
          : {
              de: 'ia',
              txt: String(data.text ?? ''),
              origem,
              proposta: propostaDoPedido(pedido, pendentes),
            },
      );
    } catch {
      responderNaConversa(id, {
        de: 'ia',
        txt: '**Não consegui falar com o servidor agora.** Verifique a conexão e tente de novo.',
        erro: true,
      });
    }
  };

  /* ── Ações da interface ── */
  const nova = () => {
    const c = rastrear(novaConversa(), 'tela', nome);
    setEstado((e) => ({ conversas: [c, ...e.conversas], atual: c.id }));
    setPainel(null);
    focarEntrada();
  };

  const apagar = (id: string) => {
    setEstado((e) => {
      let resto = e.conversas.filter((c) => c.id !== id);
      if (!resto.length) resto = [novaConversa()];
      return { conversas: resto, atual: e.atual === id ? resto[0].id : e.atual };
    });
    avisar(t('Conversa apagada'));
  };

  const copiarRastro = () => {
    const dados = {
      conversa: conv.titulo,
      id: conv.id,
      palavras: conv.palavras,
      sessoes: conv.sessoes,
      rastro: conv.rastro,
    };
    navigator.clipboard?.writeText(JSON.stringify(dados, null, 2)).catch(() => {});
    avisar(t('Rastro da conversa copiado como JSON'));
  };

  const escolherFicha = (sig: Sigilo, id: string, rot: string) => {
    setFichas((f) => [...f, { sig, id, rot }]);
    setMencao(null);
    setRascunho((r) => r.replace(/[@#!][\wÀ-ÿ-]*$/, ''));
    if (sig === '#') naAtual((c) => rastrear(c, 'sessao', rot));
    focarEntrada();
  };

  const usarFerramenta = (f: IdDaFerramenta) => {
    setFerramentas(false);
    if (f === 'explicar') {
      setMencao('@');
      setMencaoQ('');
      setRascunho('@');
      focarEntrada();
      return;
    }
    if (f === 'traduzir') {
      void enviar('Traduza a fala ativa');
      return;
    }
    if (f === 'anki') {
      const n = conv.palavras.length || noCaderno.length;
      naAtual((c) => ({
        ...rastrear(c, 'acao', '!anki'),
        msgs: [
          ...c.msgs,
          {
            de: 'ia',
            txt: `Posso exportar ${n === 1 ? 'a palavra' : `as ${n} palavras`} para o Anki, com a frase de exemplo.`,
            origem: `seu caderno · ${n} ${n === 1 ? 'palavra' : 'palavras'}`,
            proposta: { rot: 'Exportar para o Anki', tipo: 'anki', palavras: c.palavras },
          },
        ],
      }));
      return;
    }
    const ficha: Ficha = { sig: '!', id: f, rot: f };
    void enviar(PERGUNTA_DA_FERRAMENTA[f], [...fichas, ficha]);
  };

  /* P4: a proposta só roda aqui, depois do clique em confirmar. */
  const confirmar = async (idx: number, p: Proposta) => {
    naAtual((c) => ({
      ...rastrear(c, 'acao', p.rot, 'confirmada'),
      msgs: c.msgs.map((m, i) => (i === idx ? { ...m, decidida: 'ok' as const } : m)),
    }));
    if (p.tipo === 'revisar') onChangeView('study');
    if (p.tipo === 'palavra' && p.palavra) {
      const card = noCaderno.find((c) => c.word === p.palavra);
      onChangeView('study', {
        seed: { ...seedFromSelection(p.palavra, card?.srcLang ?? '', 'review'), word: p.palavra },
      });
    }
    if (p.tipo === 'jogar') onChangeView('play', { seed: { text: '', lang: '', exercise: 'memory' } });
    if (p.tipo === 'anki') {
      const saem = p.palavras?.length ? noCaderno.filter((c) => p.palavras?.includes(c.word)) : noCaderno;
      try {
        const blob = await exportarApkg(
          saem.map((c) => ({ frente: c.word, verso: c.translation, exemplo: c.sentence })),
          'Babel Play',
        );
        baixar(blob, `babel-ichat-${new Date().toISOString().slice(0, 10)}.apkg`);
        avisar(`${t('Baralho do Anki exportado:')} ${saem.length} ${t('cartões')}`);
      } catch (e) {
        avisar(`${t('Não consegui gerar o .apkg:')} ${(e as Error).message}`);
      }
    }
  };

  const avaliar = (idx: number, v: 'bom' | 'ruim') => {
    const m = conv.msgs[idx];
    const novo = m.av === v ? null : v;
    naAtual((c) => ({ ...c, msgs: c.msgs.map((x, i) => (i === idx ? { ...x, av: novo } : x)) }));
    if (novo === 'ruim') {
      // A "lista de casos para melhorar" é local: não existe rota de servidor para receber isto.
      const casos = lerJson<unknown[]>('ichat_avaliacoes', []);
      casos.push({
        pergunta: conv.msgs[idx - 1]?.txt ?? '',
        resposta: m.txt,
        origem: m.origem,
        tela: activeView,
        em: Date.now(),
      });
      try {
        localStorage.setItem('ichat_avaliacoes', JSON.stringify(casos.slice(-200)));
      } catch {
        /* só não guarda o caso */
      }
      avisar(t('Obrigado. Essa resposta entra na lista de casos para melhorar o iChat.'));
    }
  };

  /* ── Entrada de texto: @ # ! abrem a lista; Enter envia; Backspace tira a última ficha. ── */
  const aoDigitar = (v: string) => {
    setRascunho(v);
    const m = v.match(/([@#!])([\wÀ-ÿ-]*)$/);
    setMencao(m ? (m[1] as Sigilo) : null);
    setMencaoQ(m ? m[2].toLowerCase() : '');
    if (m) setFerramentas(false);
  };

  const itensDaMencao = !mencao
    ? []
    : mencao === '@'
      ? noCaderno
          .filter((c) => c.word.toLowerCase().includes(mencaoQ))
          .slice(0, 40)
          .map((c) => ({ id: c.word, rot: c.word, meta: [c.translation, c.cefrLevel].filter(Boolean).join(' · ') }))
      : mencao === '#'
        ? recordings
            .filter((r) => r.title.toLowerCase().includes(mencaoQ))
            .slice(0, 40)
            .map((r) => ({ id: r.id, rot: r.title, meta: `${r.durationStr || 'texto'} · ${r.wordCount} palavras` }))
        : ACOES_DO_CHAT.filter((a) => a.t.includes(mencaoQ)).map((a) => ({ id: a.id, rot: a.t, meta: t(a.d) }));

  const aoTeclar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && mencao) {
      e.preventDefault();
      const x = itensDaMencao[0];
      if (x) escolherFicha(mencao, x.id, x.rot);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      void enviar(rascunho);
      return;
    }
    if (e.key === 'Backspace' && !rascunho && fichas.length) setFichas((f) => f.slice(0, -1));
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (mencao || ferramentas) {
        setMencao(null);
        setFerramentas(false);
      } else fechar();
    }
  };

  /* ── Render ── */
  const linhaDoContexto = [
    ...(auto ? [`${t('tela')} ${nome}`, ...campos.slice(0, 1)] : []),
    ...fichas.map((f) => f.sig + f.rot),
  ];
  const pendenteAqui = pendente?.conversa === conv.id ? pendente : null;
  const ultima = conv.msgs.length - 1;

  const estiloDoPainel: React.CSSProperties & Record<'--ch-w' | '--ch-h', string> = {
    '--ch-w': `${tamanho.w}px`,
    '--ch-h': `${tamanho.h}px`,
    ...(naDoca ? { width: larguraDaDoca, flex: 'none' } : {}),
  };

  return (
    /* `display: contents`: a caixa não existe para o layout — o painel fixo continua sendo uma coluna
       da linha do App. As classes `app chat-fixo` são só o gancho dos seletores do protótipo
       (`.app.chat-fixo .painel-chat.on`), que lá ficam na moldura inteira. */
    <div
      className={`app ${naDoca ? 'chat-fixo' : ''}`}
      style={{ display: 'contents', ...(naDoca ? { '--ch-doca': `${larguraDaDoca}px` } : {}) } as React.CSSProperties}
    >
      <div className={`toast ${avisoVisivel ? 'on' : ''}`} role="status" aria-live="polite">
        {aviso?.chat && <span className="dot" />}
        <span>{aviso?.conteudo}</span>
      </div>

      <button
        type="button"
        ref={fabRef}
        className={`fab ${isOpen ? 'esconde' : ''}`}
        id="fab"
        aria-label={t('Abrir o iChat')}
        aria-expanded={isOpen}
        aria-controls="painel-chat"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Sparkles aria-hidden />
        <span className="rot">iChat</span>
        <span className="ctx">Context</span>
      </button>

      <section
        className={`painel-chat cartao ${isOpen ? 'on' : ''}`}
        id="painel-chat"
        aria-label="iChat"
        style={estiloDoPainel}
      >
        {isOpen && (
          <>
            {naDoca ? (
              <div
                className="ch-redim"
                role="separator"
                aria-orientation="vertical"
                aria-label={t('Largura do iChat')}
                aria-valuemin={DOCA.min}
                aria-valuemax={DOCA.max}
                aria-valuenow={larguraDaDoca}
                tabIndex={0}
                title={t('Arraste para redimensionar')}
                onPointerDown={arrastar}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    guardarLargura(larguraDaDoca + (e.key === 'ArrowLeft' ? 16 : -16));
                  }
                }}
              />
            ) : (
              <div className="ch-redim" title={t('Arraste para redimensionar')} aria-hidden onPointerDown={arrastar} />
            )}
            <header className="ch-cab">
              <span className="ib rare" style={{ width: 36, height: 36, borderRadius: 12 }}>
                <Sparkles aria-hidden style={{ width: 17, height: 17 }} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>iChat</b>
                <small title={t('A navegação continua liberada enquanto o iChat está aberto')}>
                  {t('vendo a tela')} {nome}
                </small>
              </div>
              <button
                type="button"
                className="ch-btn"
                aria-pressed={painel === 'conversas'}
                aria-label={t('Conversas')}
                onClick={() => setPainel((p) => (p === 'conversas' ? null : 'conversas'))}
              >
                <History aria-hidden />
              </button>
              <button
                type="button"
                className="ch-btn"
                aria-pressed={painel === 'rastro'}
                aria-label={t('Rastro da conversa')}
                onClick={() => setPainel((p) => (p === 'rastro' ? null : 'rastro'))}
              >
                <Route aria-hidden />
              </button>
              <button type="button" className="ch-btn" aria-label={t('Nova conversa')} onClick={nova}>
                <Plus aria-hidden />
              </button>
              <button
                type="button"
                className="ch-btn"
                data-ch-doca
                aria-pressed={isDocked}
                aria-label={isDocked ? t('Soltar o iChat (janela flutuante)') : t('Fixar o iChat na lateral direita')}
                title={isDocked ? t('Soltar o iChat (janela flutuante)') : t('Fixar o iChat na lateral direita')}
                onClick={alternarDoca}
              >
                {isDocked ? <PictureInPicture2 aria-hidden /> : <PanelRight aria-hidden />}
              </button>
              <button type="button" className="ch-btn" aria-label={t('Fechar o iChat')} onClick={fechar}>
                <X aria-hidden />
              </button>
            </header>

            {painel === 'conversas' && (
              <GavetaDeConversas
                conversas={conversas}
                atual={conv.id}
                busca={busca}
                renomeando={renomeando}
                naSessao={ehTelaDeSessao(activeView)}
                onBusca={setBusca}
                onNova={nova}
                onAbrir={(id) => {
                  setEstado((e) => ({ ...e, atual: id }));
                  setPainel(null);
                  focarEntrada();
                }}
                onFixar={(id) => mudarConversa(id, (c) => ({ ...c, fixada: !c.fixada }))}
                onRenomear={setRenomeando}
                onSalvarNome={(id, v) => {
                  if (v.trim()) mudarConversa(id, (c) => ({ ...c, titulo: v.trim() }));
                  setRenomeando(null);
                }}
                onApagar={apagar}
              />
            )}
            {painel === 'rastro' && <GavetaDoRastro conversa={conv} onJson={copiarRastro} />}

            <div className="ch-ctx">
              <div className="linha" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="ch-ctx-linha"
                  aria-expanded={ctxAberto}
                  onClick={() => setCtxAberto((v) => !v)}
                >
                  <Eye
                    aria-hidden
                    style={{
                      width: 14,
                      height: 14,
                      color: linhaDoContexto.length ? 'var(--rare-ink)' : 'var(--ink-faint)',
                    }}
                  />
                  <span>
                    {linhaDoContexto.length
                      ? `${t('Contexto:')} ${linhaDoContexto.join(' + ')}`
                      : t('Sem contexto: pergunta geral')}
                  </span>
                  <ChevronDown
                    aria-hidden
                    style={{
                      width: 13,
                      height: 13,
                      transition: 'transform .2s',
                      transform: ctxAberto ? 'rotate(180deg)' : undefined,
                    }}
                  />
                </button>
                <button
                  type="button"
                  className={`ch-auto ${auto ? 'on' : ''}`}
                  role="switch"
                  aria-checked={auto}
                  title={t('Seguir o contexto da tela')}
                  onClick={() => setAuto((v) => !v)}
                >
                  <span className="ch-trilho">
                    <span />
                  </span>
                  Auto
                </button>
              </div>
              {ctxAberto && (
                <div className="ch-ctx-det entra">
                  <span className="label-mono">{t('O iChat está considerando')}</span>
                  {auto &&
                    [`${t('tela')} ${nome}`, ...campos].map((x) => (
                      <p key={x}>
                        <i />
                        {x}
                      </p>
                    ))}
                  {fichas.map((f, i) => (
                    <p key={`${i}${f.sig}${f.id}`}>
                      <i />
                      {f.sig + f.rot}
                    </p>
                  ))}
                  {!auto && !fichas.length && (
                    <p className="mut">{t('Nada fixado. Ligue o Auto ou use @palavra, #sessão, !ação.')}</p>
                  )}
                </div>
              )}
              {fichas.length > 0 && (
                <div className="chips" style={{ marginTop: 8 }}>
                  {fichas.map((f, i) => (
                    <span className={`ch-chip ${CLASSE_DO_SIGILO[f.sig]}`} key={`${i}${f.sig}${f.id}`}>
                      {f.sig + f.rot}
                      <button
                        type="button"
                        aria-label={`${t('Tirar')} ${f.rot}`}
                        onClick={() => setFichas((l) => l.filter((_, j) => j !== i))}
                      >
                        <X aria-hidden />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="ch-msgs" id="ch-msgs" aria-live="polite" ref={msgsRef}>
              {conv.msgs.length || pendenteAqui ? (
                <>
                  {conv.msgs.map((m, k) => {
                    if (m.de === 'eu')
                      return (
                        <div className="ch-msg eu" key={k}>
                          {!!m.tokens?.length && (
                            <div className="ch-tokens-msg">
                              {m.tokens.map((tk, j) => (
                                <span key={j}>{tk}</span>
                              ))}
                            </div>
                          )}
                          {m.txt}
                        </div>
                      );
                    const revelandoEsta = revelando?.msg === m;
                    const texto = revelandoEsta ? m.txt.split(' ').slice(0, revelando.k).join(' ') : m.txt;
                    const extras = !revelandoEsta && (k < ultima || !digitando);
                    return (
                      <div className="ch-msg ia" key={k}>
                        <TextoDoChat texto={texto} />
                        {extras && !m.erro && (
                          <>
                            {m.origem && (
                              <>
                                {' '}
                                <span className="ch-origem">
                                  <Database aria-hidden style={{ width: 12, height: 12 }} /> {t('Origem:')} {m.origem}
                                </span>
                              </>
                            )}
                            {m.proposta && !m.decidida && (
                              <div className="ch-proposta">
                                <span className="label-mono">{t('Proposta · só acontece se você confirmar')}</span>
                                <div className="linha" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                                  <button
                                    type="button"
                                    className="btn btn-solid peq"
                                    onClick={() => m.proposta && void confirmar(k, m.proposta)}
                                  >
                                    <Check aria-hidden /> {m.proposta.rot}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-outline peq"
                                    onClick={() =>
                                      naAtual((c) => ({
                                        ...c,
                                        msgs: c.msgs.map((x, i) => (i === k ? { ...x, decidida: 'nao' as const } : x)),
                                      }))
                                    }
                                  >
                                    {t('Agora não')}
                                  </button>
                                </div>
                              </div>
                            )}
                            {m.decidida && (
                              <span className="ch-origem">
                                {m.decidida === 'ok' ? (
                                  <Check aria-hidden style={{ width: 12, height: 12 }} />
                                ) : (
                                  <X aria-hidden style={{ width: 12, height: 12 }} />
                                )}{' '}
                                {m.decidida === 'ok' ? t('Feito') : t('Recusado')}
                              </span>
                            )}
                            <div className="ch-avaliar">
                              <button
                                type="button"
                                aria-pressed={m.av === 'bom'}
                                aria-label={t('Resposta útil')}
                                onClick={() => avaliar(k, 'bom')}
                              >
                                <ThumbsUp aria-hidden />
                              </button>
                              <button type="button" aria-pressed={m.av === 'ruim'} onClick={() => avaliar(k, 'ruim')}>
                                <ThumbsDown aria-hidden /> {t('Não faz sentido aqui')}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {pendenteAqui && (
                    <div className="ch-msg ia">
                      <span className="ch-ferramenta">
                        <LoaderCircle aria-hidden className="gira" /> {pendenteAqui.ferramenta ?? t('pensando')}…
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="ch-msg ia">
                  {t(
                    'Oi! Sou o iChat do seu estudo. Enxergo a tela em que você está e respondo sobre as suas palavras e sessões.',
                  )}{' '}
                  <Sparkles aria-hidden style={{ width: 13, height: 13, display: 'inline-block', verticalAlign: -2 }} />
                  <div className="chips" style={{ marginTop: 10 }}>
                    {SUGESTOES.map((s) => (
                      <button type="button" className="pill" key={s} onClick={() => void enviar(t(s), [])}>
                        {t(s)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="ch-compor">
              {mencao && (
                <div className="ch-pop" role="listbox" aria-label={t('Sugestões')}>
                  <div className="ch-pop-cab">
                    {mencao === '@'
                      ? t('Palavras do caderno')
                      : mencao === '#'
                        ? t('Sessões da biblioteca')
                        : t('Ações')}
                  </div>
                  {itensDaMencao.length ? (
                    itensDaMencao.map((x, i) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={i === 0}
                        className={i === 0 ? 'foco' : ''}
                        key={x.id}
                        onClick={() => escolherFicha(mencao, x.id, x.rot)}
                      >
                        <span className={`ch-sig ${CLASSE_DO_SIGILO[mencao]}`}>{mencao}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b>{x.rot}</b>
                          <small>{x.meta}</small>
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="mut" style={{ padding: 12, fontSize: 12.5 }}>
                      {mencao === '@' && deck === null ? t('Carregando o caderno…') : t('Nenhum resultado.')}
                    </p>
                  )}
                </div>
              )}
              {ferramentas && (
                <div className="ch-pop ch-ferr" role="menu">
                  <div className="ch-pop-cab destaque">
                    <Sparkles aria-hidden style={{ width: 14, height: 14 }} /> {t('Ferramentas para')} <b>{nome}</b>
                  </div>
                  {ferramentasDaTela(activeView).map(([sec, itens]) => (
                    <React.Fragment key={sec}>
                      <div className="ch-sec">{t(sec)}</div>
                      {itens.map((f) => {
                        const Icone = ICONE_DA_FERRAMENTA[f.id];
                        return (
                          <button type="button" role="menuitem" key={f.id} onClick={() => usarFerramenta(f.id)}>
                            <span className="ib" style={{ width: 30, height: 30, borderRadius: 9 }}>
                              <Icone aria-hidden style={{ width: 15, height: 15 }} />
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <b>{t(f.t)}</b>
                              <small>{t(f.d)}</small>
                            </span>
                          </button>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="ch-mais"
                aria-expanded={ferramentas}
                aria-label={t('Ferramentas do iChat')}
                onClick={() => {
                  setFerramentas((v) => !v);
                  setMencao(null);
                }}
              >
                <Plus aria-hidden />
              </button>
              <label className="sr" htmlFor="ch-input">
                {t('Pergunte ao iChat')}
              </label>
              <input
                id="ch-input"
                ref={entradaRef}
                className="campo"
                autoComplete="off"
                placeholder={t('Pergunte algo: use @palavra, #sessão, !ação')}
                disabled={digitando}
                value={rascunho}
                onChange={(e) => aoDigitar(e.target.value)}
                onKeyDown={aoTeclar}
              />
              <button
                type="button"
                className="ch-enviar"
                aria-label={t('Enviar')}
                disabled={digitando}
                onClick={() => void enviar(rascunho)}
              >
                <Send aria-hidden />
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
