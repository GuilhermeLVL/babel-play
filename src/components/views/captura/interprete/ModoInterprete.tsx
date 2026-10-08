import '../../../../styles/modoInterprete.css';

import {
  ArrowUpDown,
  AudioLines,
  Download,
  Loader2,
  Lock,
  MessagesSquare,
  Mic,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import {
  type ControleDoInterprete,
  criarControleDoInterprete,
  type EstadoDoControle,
  type PonteDoInterprete,
} from '../../../../lib/captura/controleDoInterprete';
import { baixarTexto, conversaEmMarkdown, nomeDoArquivoDaConversa } from '../../../../lib/captura/exportarConversa';
import {
  historicoDoInterprete,
  type ItemDoHistorico,
  JANELA_DO_HISTORICO,
  subirJanela,
} from '../../../../lib/captura/historicoDoInterprete';
import { direcaoDoLado, ESTADO_INICIAL, type IdiomasDoInterprete } from '../../../../lib/captura/interprete';
import { chaveLigada } from '../../../../lib/captura/testesDoInterprete';
import type { LadoDoInterprete, SpeechSegment } from '../../../../lib/captura/tiposDaFala';
import { useQuestNovo } from '../../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../../lib/i18n';
import { langLabel } from '../../../../lib/languages';
import { estadoDaTela, mudarEstadoDaTela, tomarPedidoDaConversa, tremer } from '../../../../lib/polimento/interprete';
import { nativeTts, type TtsEngine } from '../../../../lib/tts';
import { aquecerInterprete } from '../../../../lib/voz/aquecimentoDoInterprete';
import { tempoAteAVoz } from '../../../../lib/voz/tempoAteAVoz';
import { criarVozDaNuvem, destravarVozDaNuvem, type VozDaNuvem } from '../../../../lib/voz/vozDaNuvem';
import {
  aoMudarIdiomasDaVozDoQuest,
  atualizarIdiomasDaVozDoQuest,
  criarVozDoQuest,
  idiomasDaVozDoQuest,
  MOTOR_MUDO,
  vozDoQuestFala,
} from '../../../../lib/voz/vozDoQuest';
import ConversaDoPrototipo, { type FraseDaMetade, type MetadeDaConversa } from './ConversaDoPrototipo';
import FolhaDeEdicao from './FolhaDeEdicao';
import { ConversaEmBolhas, ListaDaMetade } from './ListaDoHistorico';
import { guardarModo, type ModoDaConversa, modoGuardado } from './modoDaConversa';
import type { AoOuvirTrecho, TrechoEmLeitura } from './TextoTocavel';

/** A fala, no que a tela precisa. */
export type FalaDoInterprete = Pick<SpeechSegment, 'id' | 'originalText' | 'translatedText' | 'isPartial' | 'lado'> &
  Partial<Pick<SpeechSegment, 'lang' | 'paraLang' | 'semTraducao'>> &
  Partial<Pick<SpeechSegment, 'timestamp'>>;

/** Uma frase que a pessoa quer guardar para estudar (a folha da frase da captura a abre). */
export interface FraseParaGuardar {
  id: string;
  texto: string;
  traducao: string;
  lang: string;
  langDaTraducao: string;
}

const ESTADO_DA_TELA: EstadoDoControle = { ...ESTADO_INICIAL, falando: null };

/**
 * SEM VOZ DE LEITURA (o Quest sem a nuvem): um motor que não fala e avisa o fim na hora. Sem ele a fila
 * esperava o prazo de uma fala que nunca começa, com a tela dizendo "Lendo a tradução" e o próximo
 * toque atrasado.
 */
const MOTOR_SEM_VOZ: TtsEngine = MOTOR_MUDO;

const outro = (lado: LadoDoInterprete): LadoDoInterprete => (lado === 'meu' ? 'outro' : 'meu');

export type { ModoDaConversa };
/**
 * O automático NESTA conta: `disponivel` (o plano o tem), `premium` (não tem: o botão aparece com
 * cadeado e diz de que plano é) ou `oculto` (o site sem servidor, o perfil protegido: nem aparece).
 */
export type AutomaticoNoPlano = 'disponivel' | 'premium' | 'oculto';

/** Como a conversa é desenhada: frente a frente (o padrão) ou em lista única ("Conversa"). */
export type TelaDoInterprete = 'frente' | 'conversa';
const CHAVE_DA_TELA = 'babel.interprete.tela';
function telaGuardada(): TelaDoInterprete | null {
  try {
    const v = localStorage.getItem(CHAVE_DA_TELA);
    return v === 'frente' || v === 'conversa' ? v : null;
  } catch {
    return null;
  }
}
function guardarTela(tela: TelaDoInterprete) {
  try {
    localStorage.setItem(CHAVE_DA_TELA, tela);
  } catch {
    /* sem armazenamento: a escolha vale só nesta tela */
  }
}

/**
 * O MODO INTÉRPRETE (E3 da Fase E) — a maquete aprovada pelo dono (2026-09-30), no visual da captura
 * (tokens, cartão escuro, ícones lucide):
 *
 *  · CELULAR: a tela dividida frente a frente. A metade de cima fica VIRADA 180° para a pessoa do
 *    outro lado da mesa. Cada metade mostra o idioma dela, a última frase do outro TRADUZIDA GRANDE
 *    com o original pequeno embaixo, e um botão redondo grande "Falar". Na faixa do meio: trocar os
 *    lados, a voz em uso ("Voz do aparelho" ou "Voz natural · Premium") e sair.
 *  · OUVINDO: o botão de quem fala vira "Parar", com anel.
 *  · FALANDO: a metade de quem ouve mostra "Repetir" e "Parar voz".
 *  · COMPUTADOR: duas colunas lado a lado, com atalhos de teclado (1 e 2 falam, R repete, P para a
 *    voz, Esc sai).
 *  · QUEST (maquete de 01/10/2026): as duas colunas do computador, sem atalhos (não há teclado), com a
 *    faixa embaixo e alvos de 60 px. Sem voz de leitura no aparelho (`semVoz`), a tela diz que a
 *    tradução é em texto, em vez de prometer leitura em voz alta, e "Repetir" não aparece.
 *  · AUTOMÁTICO (E7, o padrão de quem o tem no plano): ninguém toca em lado. Um botão só, "Ouvir a
 *    conversa", na metade de quem segura o aparelho; o app reconhece o idioma de cada fala, mostra a
 *    tradução na metade de quem ouve, lê em voz alta e volta a ouvir. O botão "Automático" da faixa
 *    do meio alterna com o modo por toque (para a rua barulhenta); sem ele no plano, aparece com
 *    cadeado e diz de que plano é.
 *
 * O estado e os efeitos são do `controleDoInterprete.ts`. A captura (`LiveCapture`) abre a sessão,
 * repassa as falas e liga a ponte (`registrarPonte`): o pipeline e as fontes leem a direção do
 * microfone dela, e o fim de cada fala e a tradução de cada final chegam por ela.
 */
export default function ModoInterprete({
  idiomas,
  falas,
  microfone,
  registrarPonte,
  vozNaturalDisponivel,
  velocidade,
  layout,
  semVoz = false,
  vozDoSite = false,
  abrindo,
  aviso,
  automatico = 'oculto',
  aoCorrigirFala,
  aoGuardar,
  aoSair,
  aoFalharMicrofone,
  aoEscolherIdiomas,
  aoConhecerOPremium,
  comVirtual = false,
}: {
  idiomas: IdiomasDoInterprete;
  falas: ReadonlyArray<FalaDoInterprete>;
  microfone: { abrir: () => Promise<void> | void; fechar: () => void };
  registrarPonte: (ponte: PonteDoInterprete | null) => void;
  /** O Premium com a voz natural (entitlement `vozNatural` e flag `voz_natural`). */
  vozNaturalDisponivel: boolean;
  velocidade?: number;
  layout: 'celular' | 'computador' | 'quest';
  /** O aparelho não tem voz de leitura (`recursosDoAparelho`): a conversa é só em texto. */
  semVoz?: boolean;
  /**
   * A voz do site (`/quest/tts`) está ligada: no aparelho sem voz, é ela que lê a tradução, nos idiomas
   * que tem. O lado cujo idioma ela não lê continua em texto.
   */
  vozDoSite?: boolean;
  /** O microfone está abrindo (a permissão, o modelo): o botão de quem fala mostra a espera. */
  abrindo?: boolean;
  /**
   * O que a captura diria por baixo (o tradutor do outro sentido baixando, um aviso do microfone): a
   * tela do intérprete a cobre inteira, então a linha aparece aqui, na faixa do meio.
   */
  aviso?: string | null;
  /** O modo automático nesta conta (o entitlement `interpreteAutomatico`). Ausente = não aparece. */
  automatico?: AutomaticoNoPlano;
  /**
   * CORRIGIR o que foi reconhecido: a captura troca o texto da fala e refaz a tradução na direção de
   * quem falou. Ausente = a tela não oferece a correção.
   */
  aoCorrigirFala?: (id: string, texto: string, direcao: { de: string; para: string }) => void;
  /** GUARDAR uma frase para estudar. Ausente = a tela não oferece a estrela. */
  aoGuardar?: (frase: FraseParaGuardar) => void;
  aoSair: () => void;
  aoFalharMicrofone?: (erro: unknown) => void;
  /** DESENHO NOVO: o botão de cada metade que abre a escolha dos idiomas (`direto.js:73`). */
  aoEscolherIdiomas?: (() => void) | undefined;
  /** DESENHO NOVO: os Planos, a partir do aviso do cadeado (ausente no perfil protegido). */
  aoConhecerOPremium?: (() => void) | undefined;
  /** DESENHO NOVO: a conversa virtual existe neste aparelho; "Virtual" leva ao preparo dela. */
  comVirtual?: boolean;
}) {
  /** O desenho novo: a tela do protótipo, em todo aparelho (`ConversaDoPrototipo`). */
  const novo = useQuestNovo();
  const novoRef = useRef(novo);
  novoRef.current = novo;
  const idiomasRef = useRef(idiomas);
  idiomasRef.current = idiomas;
  const microfoneRef = useRef(microfone);
  microfoneRef.current = microfone;
  const aoFalharRef = useRef(aoFalharMicrofone);
  aoFalharRef.current = aoFalharMicrofone;

  /* O CONTROLE nasce no efeito, e não no render: no StrictMode o efeito monta, desmonta e monta de
     novo — um controle criado no render seria desligado na primeira desmontagem e ficaria morto. */
  const controleRef = useRef<ControleDoInterprete | null>(null);
  const vozRef = useRef<VozDaNuvem | null>(null);
  /* No desenho novo os lados podem ter sido trocados na tela pronta: a conversa já abre assim. */
  const [estado, setEstado] = useState<EstadoDoControle>(() =>
    novo && estadoDaTela().trocados ? { ...ESTADO_DA_TELA, trocados: true } : ESTADO_DA_TELA,
  );
  const velocidadeRef = useRef(velocidade);
  velocidadeRef.current = velocidade;
  const semVozRef = useRef(semVoz);
  semVozRef.current = semVoz;
  /* A VOZ DO SITE só entra onde a do aparelho não toca: com voz nativa, o aparelho lê sem ir à rede. */
  const comVozDoSite = semVoz && vozDoSite;
  /* A lista de idiomas com voz pode crescer (o GET da função responde depois): a tela acompanha. */
  useSyncExternalStore(
    aoMudarIdiomasDaVozDoQuest,
    () => idiomasDaVozDoQuest().join(),
    () => '',
  );
  useEffect(() => {
    if (comVozDoSite) void atualizarIdiomasDaVozDoQuest();
  }, [comVozDoSite]);
  /** Este idioma não é lido em voz alta aqui: a tradução dele fica em texto. */
  const mudo = (idioma: string) => semVoz && !(comVozDoSite && vozDoQuestFala(idioma));

  useEffect(() => {
    const voz = comVozDoSite ? criarVozDoQuest() : vozNaturalDisponivel ? criarVozDaNuvem() : null;
    const velocidadeInicial = velocidadeRef.current;
    const controle = criarControleDoInterprete({
      idiomas: () => idiomasRef.current,
      microfone: {
        abrir: () => microfoneRef.current.abrir(),
        fechar: () => microfoneRef.current.fechar(),
      },
      motor: () => voz ?? (semVozRef.current ? MOTOR_SEM_VOZ : nativeTts),
      nomeDoMotor: () =>
        comVozDoSite
          ? voz?.motorDaUltimaFala() === 'voz-da-nuvem'
            ? 'voz-do-site'
            : 'sem-voz'
          : semVozRef.current
            ? 'sem-voz'
            : (voz?.motorDaUltimaFala() ?? 'voz-do-aparelho'),
      ...(voz ? { destravarVoz: destravarVozDaNuvem } : {}),
      ...(velocidadeInicial && velocidadeInicial !== 1 ? { opcoesDeFala: { rate: velocidadeInicial } } : {}),
      aoMudar: setEstado,
      aoFalharMicrofone: (erro) => aoFalharRef.current?.(erro),
    });
    controleRef.current = controle;
    vozRef.current = voz;
    tempoAteAVoz.zerar();
    registrarPonte(controle);
    if (novoRef.current && estadoDaTela().trocados && !controle.estado().trocados) controle.trocarLados();
    setEstado(controle.estado());
    if (voz) aquecerInterprete(); // libera o áudio da voz da nuvem antes do 1º toque (chave vozPorFrase)
    return () => {
      registrarPonte(null);
      controle.sair();
      /* O tempo até a voz desta conversa fica no aparelho (só números) para o /diagnostico. */
      tempoAteAVoz.guardar();
      if (controleRef.current === controle) controleRef.current = null;
    };
  }, [vozNaturalDisponivel, comVozDoSite, registrarPonte]);
  const atual = estado;
  const atualRef = useRef(atual);
  atualRef.current = atual;

  /* DESENHO NOVO: a conversa abre direto (`direto.js:8-14`). A tela pronta fica por baixo e se esconde
     enquanto esta está na frente; o toque que a abriu (um lado, ou a escuta do automático) começa aqui. */
  useLayoutEffect(() => {
    if (!novo) return;
    mudarEstadoDaTela({ emCurso: true });
    return () => mudarEstadoDaTela({ emCurso: false });
  }, [novo]);
  useEffect(() => {
    if (!novo) return;
    /* Depois do efeito que cria o controle (e da segunda montagem do StrictMode). */
    const relogio = setTimeout(() => {
      const c = controleRef.current;
      const pedido = tomarPedidoDaConversa();
      if (!c || !pedido) return;
      if (pedido === 'ouvir') c.ouvir();
      else c.tocar(pedido);
    }, 0);
    return () => clearTimeout(relogio);
  }, [novo]);

  /* A TELA e a JANELA do histórico (50 falas; "ver mais" sobe de 50 em 50). */
  const [tela, setTela] = useState<TelaDoInterprete>(() => (novo ? 'frente' : (telaGuardada() ?? 'frente')));
  const alternarTela = () => {
    const nova: TelaDoInterprete = tela === 'frente' ? 'conversa' : 'frente';
    setTela(nova);
    /* No desenho novo a conversa abre sempre nas duas metades (`telas2.js:170-182`). */
    if (!novo) guardarTela(nova);
  };
  const [janela, setJanela] = useState(JANELA_DO_HISTORICO);
  const totalDeFinais = useMemo(
    () => falas.filter((f) => f.lado && !f.isPartial && f.originalText.trim()).length,
    [falas],
  );
  const verMais = () => setJanela((j) => subirJanela(j, totalDeFinais));

  /* O MODO. Quem tem o automático começa nele (decisão do dono), a menos que tenha escolhido o toque
     da última vez. Sem ele no plano, é sempre por toque. */
  const [modo, setModo] = useState<ModoDaConversa>(() =>
    automatico === 'disponivel' ? (modoGuardado() ?? 'automatico') : 'toque',
  );
  useEffect(() => {
    if (automatico !== 'disponivel') setModo('toque');
  }, [automatico]);
  /** O aviso da própria tela (o cadeado do automático), por alguns segundos. */
  const [avisoDaTela, setAvisoDaTela] = useState<string | null>(null);
  /** DESENHO NOVO: o aviso do cadeado fica na tela, com o botão dos Planos (`telas2.js:260-262`). */
  const [cadeado, setCadeado] = useState(false);
  useEffect(() => {
    if (!avisoDaTela) return;
    const relogio = setTimeout(() => setAvisoDaTela(null), 7000);
    return () => clearTimeout(relogio);
  }, [avisoDaTela]);
  const trocarModo = () => {
    if (automatico !== 'disponivel') {
      setAvisoDaTela(t('O modo automático faz parte do Premium: o app reconhece sozinho quem fala qual idioma.'));
      return;
    }
    /* Trocar no meio da conversa fecha o microfone e cala a voz: o modo novo começa do zero. */
    if (controleRef.current && controleRef.current.estado().fase !== 'parado') controleRef.current.parar();
    const novo: ModoDaConversa = modo === 'automatico' ? 'toque' : 'automatico';
    setModo(novo);
    guardarModo(novo);
  };
  const noAutomatico = modo === 'automatico';
  /** "Ouvir a conversa" / "Parar": o botão único do automático. */
  const alternarEscuta = () => {
    const c = controleRef.current;
    if (!c) return;
    if (c.estado().automatico) c.parar();
    else c.ouvir();
  };

  /** O trecho que a voz lê por causa de um toque (a palavra fica marcada enquanto é lida). */
  const lendo: TrechoEmLeitura | null = atual.falando?.manual
    ? { texto: atual.falando.texto, lang: atual.falando.lang }
    : null;
  /** TOQUE NO TEXTO: ouve a palavra ou a frase; com o microfone aberto, a tela diz por que não. */
  const ouvirTrecho: AoOuvirTrecho = (texto, lang, opcoes) => {
    const r = controleRef.current?.ouvirTrecho(texto, lang, opcoes);
    if (r === 'ouvindo') setAvisoDaTela(t('Espere a escuta terminar para ouvir'));
  };

  /** CORRIGIR A FALA: a folha aberta (a fala, o idioma em que foi dita e a direção da tradução). */
  const [edicao, setEdicao] = useState<{ item: ItemDoHistorico; lang: string; de: string; para: string } | null>(null);
  const editar = (item: ItemDoHistorico) => {
    const d = direcaoDoLado(item.lado, idiomas, atualRef.current.trocados);
    setEdicao({ item, lang: d.fala, de: d.de, para: d.para });
  };
  const guardar = (item: ItemDoHistorico) => {
    const falou = direcaoDoLado(item.lado, idiomas, atualRef.current.trocados);
    const ouviu = direcaoDoLado(outro(item.lado), idiomas, atualRef.current.trocados);
    aoGuardar?.({
      id: item.id,
      texto: item.original,
      traducao: item.traducao,
      lang: falou.fala,
      langDaTraducao: ouviu.fala,
    });
  };
  /** EXPORTAR: o Markdown da conversa, baixado no aparelho (nada sai dele). */
  const exportar = () => {
    const titulo = t('Conversa de {data}', { data: new Date().toLocaleDateString() });
    const md = conversaEmMarkdown(falas, {
      titulo,
      rotulos: { meu: t('Você'), outro: t('A outra pessoa') },
      idiomas: {
        meu: langLabel(direcaoDoLado('meu', idiomas, atualRef.current.trocados).fala),
        outro: langLabel(direcaoDoLado('outro', idiomas, atualRef.current.trocados).fala),
      },
    });
    baixarTexto(nomeDoArquivoDaConversa(titulo), md);
  };

  const controle = {
    tocar: (lado: LadoDoInterprete) => controleRef.current?.tocar(lado),
    repetir: () => controleRef.current?.repetir(),
    pararVoz: () => controleRef.current?.pararVoz(),
    trocarLados: () => controleRef.current?.trocarLados(),
    sair: () => controleRef.current?.sair(),
  };

  const sair = () => {
    controle.sair();
    aoSair();
  };
  /** DESENHO NOVO: sem nada dito, o X volta para a tela de origem (`direto.js:94`) assim que a sessão
      encerra (quem navega é a tela pronta, que fica por baixo); com falas, o Encerrar decide antes. */
  const sairDaTela = () => {
    if (novo && totalDeFinais === 0) mudarEstadoDaTela({ depois: 'voltar' });
    sair();
  };

  /* OS ATALHOS do computador. No celular não há teclado a ouvir. */
  const sairRef = useRef(sairDaTela);
  sairRef.current = sairDaTela;
  const noAutomaticoRef = useRef(noAutomatico);
  noAutomaticoRef.current = noAutomatico;
  const alternarEscutaRef = useRef(alternarEscuta);
  alternarEscutaRef.current = alternarEscuta;
  useEffect(() => {
    if (layout !== 'computador') return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
      const tecla = e.key.toLowerCase();
      /* No automático não há lados a tocar: o 1 liga e desliga a escuta, e o 2 não faz nada. */
      if (tecla === '1') {
        if (noAutomaticoRef.current) alternarEscutaRef.current();
        else controle.tocar('meu');
      } else if (tecla === '2') {
        if (noAutomaticoRef.current) return;
        controle.tocar('outro');
      } else if (tecla === 'r') controle.repetir();
      else if (tecla === 'p') controle.pararVoz();
      else if (tecla === 'escape') sairRef.current();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `controle` só lê o ref
  }, [layout]);

  const vozNatural = !comVozDoSite && !!vozRef.current && vozRef.current.motorDaUltimaFala() === 'voz-da-nuvem';
  /* O que a faixa do meio diz da voz, no aparelho sem voz própria: quem é lido e quem fica em texto. */
  const idiomaDoLado = (lado: LadoDoInterprete) => direcaoDoLado(lado, idiomas, atual.trocados).fala;
  const mudos = (['meu', 'outro'] as const).filter((l) => mudo(idiomaDoLado(l)));
  const rotuloDaVoz =
    mudos.length === 2
      ? t('Tradução em texto neste aparelho')
      : mudos.length === 1
        ? t('Voz em {comVoz} · {semVoz} em texto', {
            comVoz: langLabel(idiomaDoLado(outro(mudos[0]))),
            semVoz: langLabel(idiomaDoLado(mudos[0])),
          })
        : comVozDoSite
          ? t('Voz do site')
          : vozNatural
            ? t('Voz natural · Premium')
            : t('Voz do aparelho');
  /** Lado a lado (computador e Quest); no celular, frente a frente com a metade de cima virada. */
  const ladoALado = layout !== 'celular';
  const computador = layout === 'computador';

  /** O que cada lado precisa para se desenhar, igual nas duas telas (frente a frente e conversa). */
  const dadosDoLado = (lado: LadoDoInterprete) => {
    const direcao = direcaoDoLado(lado, idiomas, atual.trocados);
    const historico = historicoDoInterprete(falas, lado, { janela, parcialDoOutro: chaveLigada('parcialTraduzido') });
    /* No automático a escuta não é de um lado: as duas metades dizem o mesmo, cada uma virada para
       quem a lê. */
    const escutando = atual.automatico && atual.fase === 'ouvindo';
    const ouvindo = !atual.automatico && atual.fase === 'ouvindo' && atual.lado === lado;
    return {
      lado,
      direcao,
      nome: langLabel(direcao.fala),
      historico,
      doOutro: historico.destaque,
      escutando,
      ouvindo,
      traduzindo: atual.fase === 'traduzindo' && (atual.automatico || atual.lado === lado),
      vozParaMim: !!atual.falando && !atual.falando.manual && atual.falando.lado === outro(lado),
      minhaAoVivo: ouvindo ? historico.parcial : undefined,
      atalho: lado === 'meu' ? '1' : '2',
      /* Quem está deste lado OUVE no idioma dele: sem voz para esse idioma, a tradução fica em texto. */
      semVozAqui: mudo(direcao.fala),
      /* E o que ESTE lado fala é lido para o outro, no idioma do outro. */
      semVozParaOOutro: mudo(idiomaDoLado(outro(lado))),
    };
  };
  type DadosDoLado = ReturnType<typeof dadosDoLado>;

  /** A dica de começo, enquanto ninguém falou, no que a voz promete neste aparelho. */
  const dicaDeComeco = (d: DadosDoLado) =>
    d.semVozParaOOutro
      ? noAutomatico
        ? t('Toque em Ouvir e conversem. O app reconhece quem fala qual idioma e mostra a tradução.')
        : t('Toque em Falar e fale. A tradução aparece do outro lado, em texto.')
      : noAutomatico
        ? t('Toque em Ouvir e conversem. O app reconhece quem fala qual idioma e lê a tradução em voz alta.')
        : t('Toque em Falar e fale. A tradução aparece do outro lado e é lida em voz alta.');

  /** O que a lista mostra depois da última fala: a minha fala em andamento, em cinza, ou a dica de começo. */
  const fimDaLista = (d: DadosDoLado) =>
    d.minhaAoVivo ? (
      <p className="int-ao-vivo" lang={d.direcao.fala}>
        {d.minhaAoVivo.texto}
      </p>
    ) : d.historico.itens.length === 0 ? (
      <p className="int-dica">{dicaDeComeco(d)}</p>
    ) : null;

  /** A linha de estado de um lado (Ouvindo, Traduzindo, Lendo a tradução). */
  const statusDoLado = (d: DadosDoLado) =>
    d.ouvindo || d.escutando
      ? abrindo
        ? t('Abrindo o microfone…')
        : d.escutando
          ? t('Ouvindo a conversa…')
          : t('Ouvindo…')
      : d.traduzindo
        ? t('Traduzindo…')
        : d.vozParaMim && !d.semVozAqui
          ? t('Lendo a tradução')
          : '';

  /** Os botões de um lado: Repetir, Falar (ou Ouvir a conversa) e Parar voz. */
  const acoesDoLado = (d: DadosDoLado) => (
    <div className="int-acoes">
      {!d.semVozAqui && (d.vozParaMim || (atual.fase === 'parado' && d.doOutro)) && (
        <button
          type="button"
          className="int-ib"
          onClick={() => controle.repetir()}
          aria-label={t('Repetir a tradução')}
        >
          <RotateCcw aria-hidden />
          <span>{t('Repetir')}</span>
          {computador && <kbd>R</kbd>}
        </button>
      )}
      {noAutomatico ? (
        /* O botão único do automático fica na metade de quem segura o aparelho; a outra pessoa só fala. */
        d.lado === 'meu' && (
          <button
            type="button"
            className="int-falar"
            data-ouvindo={d.escutando || undefined}
            onClick={alternarEscuta}
            aria-pressed={atual.automatico}
            aria-label={atual.automatico ? t('Parar de ouvir a conversa') : t('Ouvir a conversa')}
            data-sfx="none"
            data-testid="ouvir-a-conversa"
          >
            {atual.automatico ? (
              d.escutando && abrindo ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <Square aria-hidden />
              )
            ) : (
              <AudioLines aria-hidden />
            )}
            <span aria-hidden>{atual.automatico ? t('Parar') : t('Ouvir')}</span>
            {computador && <kbd aria-hidden>1</kbd>}
          </button>
        )
      ) : (
        <button
          type="button"
          className="int-falar"
          data-ouvindo={d.ouvindo || undefined}
          onClick={() => controle.tocar(d.lado)}
          aria-pressed={d.ouvindo}
          aria-label={d.ouvindo ? t('Parar de ouvir') : t('Falar em {idioma}', { idioma: d.nome })}
          data-sfx="none"
        >
          {d.ouvindo ? (
            abrindo ? (
              <Loader2 aria-hidden className="animate-spin" />
            ) : (
              <Square aria-hidden />
            )
          ) : (
            <Mic aria-hidden />
          )}
          <span aria-hidden>{d.ouvindo ? t('Parar') : t('Falar')}</span>
          {computador && <kbd aria-hidden>{d.atalho}</kbd>}
        </button>
      )}
      {!d.semVozAqui && d.vozParaMim && (
        <button type="button" className="int-ib" onClick={() => controle.pararVoz()} aria-label={t('Parar a voz')}>
          <VolumeX aria-hidden />
          <span>{t('Parar voz')}</span>
          {computador && <kbd>P</kbd>}
        </button>
      )}
    </div>
  );

  const metade = (lado: LadoDoInterprete) => {
    const d = dadosDoLado(lado);
    const direcaoDoOutro = direcaoDoLado(outro(lado), idiomas, atual.trocados);
    return (
      <section
        className="int-metade"
        data-lado={lado}
        data-virada={!ladoALado && lado === 'outro' ? true : undefined}
        data-ouvindo={d.ouvindo || d.escutando || undefined}
        aria-label={t('Lado de quem fala {idioma}', { idioma: d.nome })}
        data-testid={`interprete-${lado}`}
      >
        <p className="int-idioma" lang={d.direcao.fala}>
          {layout === 'quest' && <span className="int-quem">{lado === 'meu' ? t('Você') : t('A outra pessoa')}</span>}
          {d.nome}
        </p>
        <ListaDaMetade
          historico={d.historico}
          total={totalDeFinais}
          aoVerMais={verMais}
          idiomaDoItem={(_item, texto) => (texto === 'principal' ? d.direcao.fala : direcaoDoOutro.fala)}
          mudo={mudo}
          lendo={lendo}
          aoOuvir={ouvirTrecho}
          fim={fimDaLista(d)}
          {...(aoCorrigirFala ? { aoEditar: editar } : {})}
          {...(aoGuardar ? { aoGuardar: guardar } : {})}
        />
        <p className="int-status" role="status">
          {statusDoLado(d)}
        </p>
        {acoesDoLado(d)}
      </section>
    );
  };

  /** A TELA "CONVERSA": uma lista única, na orientação normal, e os dois botões de falar embaixo. */
  const conversa = () => {
    const meu = dadosDoLado('meu');
    const dele = dadosDoLado('outro');
    return (
      <section className="int-conversa" aria-label={t('Conversa')} data-testid="interprete-conversa">
        {totalDeFinais > 0 && (
          <div className="int-conversa-topo">
            <button type="button" className="int-modo" onClick={exportar} data-testid="exportar-conversa">
              <Download aria-hidden />
              <span>{t('Exportar')}</span>
            </button>
          </div>
        )}
        <ConversaEmBolhas
          historico={meu.historico}
          total={totalDeFinais}
          aoVerMais={verMais}
          idiomaDaFala={(item) => direcaoDoLado(item.lado, idiomas, atual.trocados).fala}
          idiomaDaTraducao={(item) => direcaoDoLado(outro(item.lado), idiomas, atual.trocados).fala}
          mudo={mudo}
          lendo={lendo}
          aoOuvir={ouvirTrecho}
          fim={fimDaLista(meu)}
          {...(aoCorrigirFala ? { aoEditar: editar } : {})}
          {...(aoGuardar ? { aoGuardar: guardar } : {})}
        />
        <p className="int-status" role="status">
          {statusDoLado(meu.ouvindo || meu.escutando || meu.traduzindo || meu.vozParaMim ? meu : dele)}
        </p>
        <div className="int-conversa-acoes">
          {[dele, meu].map((d) => (
            <div key={d.lado} className="int-conversa-lado" data-lado={d.lado}>
              <p className="int-idioma" lang={d.direcao.fala}>
                {d.nome}
              </p>
              {acoesDoLado(d)}
            </div>
          ))}
        </div>
      </section>
    );
  };

  if (novo) {
    const tudo = historicoDoInterprete(falas, 'meu', { janela: Number.MAX_SAFE_INTEGER });
    const donoDe = (lado: LadoDoInterprete): LadoDoInterprete => (atual.trocados ? outro(lado) : lado);
    const metadeNova = (lado: LadoDoInterprete): MetadeDaConversa => {
      const d = dadosDoLado(lado);
      const direcaoDoOutro = direcaoDoLado(outro(lado), idiomas, atual.trocados);
      /* O que fica no meio da metade (`telas2.js:198-217`): a fala de quem está nela enquanto fala e
         depois de falar; a tradução do outro quando ela chega; no começo, a dica. */
      let frase: FraseDaMetade = { tipo: 'dica', texto: dicaDeComeco(d) };
      if (d.minhaAoVivo) frase = { tipo: 'fala', texto: d.minhaAoVivo.texto, lang: d.direcao.fala, aoVivo: true };
      else
        for (let i = d.historico.itens.length - 1; i >= 0; i--) {
          const item = d.historico.itens[i];
          if (item.traduzindo) continue;
          frase = item.propria
            ? { tipo: 'fala', texto: item.original, lang: d.direcao.fala, aoVivo: false }
            : {
                tipo: 'traducao',
                id: item.id,
                traducao: item.traducao.trim() ? item.traducao : item.original,
                original: item.traducao.trim() ? item.original : '',
                lang: d.direcao.fala,
                langDoOriginal: direcaoDoOutro.fala,
              };
          break;
        }
      return {
        lado,
        dono: donoDe(lado),
        lang: d.direcao.fala,
        nome: d.nome,
        frase,
        status: statusDoLado(d),
        rotulo: noAutomatico ? (atual.automatico ? t('Parar') : t('Ouvir')) : d.ouvindo ? t('Parar') : t('Falar'),
        rotuloParaLeitor: noAutomatico
          ? atual.automatico
            ? t('Parar de ouvir a conversa')
            : t('Ouvir a conversa')
          : d.ouvindo
            ? t('Parar de ouvir')
            : t('Falar em {idioma}', { idioma: d.nome }),
        ouvindo: noAutomatico ? d.escutando : d.ouvindo,
        aoFalar: noAutomatico ? alternarEscuta : () => controle.tocar(lado),
        semVoz: d.semVozAqui,
      };
    };
    const avisoDoCadeado = cadeado && automatico === 'premium';
    return (
      <ConversaDoPrototipo
        cima={metadeNova('outro')}
        baixo={metadeNova('meu')}
        {...(automatico !== 'oculto'
          ? {
              automatico: {
                ligado: noAutomatico,
                comCadeado: automatico === 'premium',
                aoTocar: (botao: HTMLElement) => {
                  if (automatico !== 'disponivel') {
                    setCadeado(true);
                    tremer(botao);
                    return;
                  }
                  trocarModo();
                },
              },
            }
          : {})}
        lista={{
          aberta: tela === 'conversa',
          bolhas: tudo.itens.map((item) => ({
            id: item.id,
            dono: donoDe(item.lado),
            fala: item.original,
            traducao: item.traduzindo ? '…' : item.traducao,
          })),
          aoAlternar: alternarTela,
          aoExportar: () => {
            if (totalDeFinais > 0) exportar();
          },
        }}
        voz={{ rotulo: rotuloDaVoz, natural: vozNatural, muda: mudos.length === 2 }}
        aviso={
          avisoDaTela ??
          aviso ??
          (avisoDoCadeado
            ? t('O modo automático faz parte do Premium: o app reconhece sozinho quem fala qual idioma.')
            : noAutomatico
              ? t('Automático ligado: é só conversar. O app reconhece quem fala qual idioma.')
              : '')
        }
        aoConhecerOPremium={
          avisoDoCadeado && !avisoDaTela && !aviso && aoConhecerOPremium && totalDeFinais === 0
            ? () => {
                mudarEstadoDaTela({ depois: 'planos' });
                sair();
              }
            : undefined
        }
        aoTrocarLados={() => {
          mudarEstadoDaTela({ trocados: !atual.trocados });
          controle.trocarLados();
        }}
        aoVirtual={
          comVirtual
            ? () => {
                sair();
                mudarEstadoDaTela({ preparoVirtual: true });
              }
            : undefined
        }
        aoEscolherIdioma={
          aoEscolherIdiomas
            ? () => {
                /* Trocar o idioma no meio de uma fala fecha o microfone: o idioma novo começa do zero. */
                if (controleRef.current && controleRef.current.estado().fase !== 'parado') controleRef.current.parar();
                aoEscolherIdiomas();
              }
            : undefined
        }
        aoRepetir={() => controle.repetir()}
        aoPararVoz={() => controle.pararVoz()}
        aoSair={sairDaTela}
        emDialogo
        fase={atual.fase}
      />
    );
  }

  return (
    <div
      className="int"
      data-layout={layout}
      data-tela={tela}
      role="dialog"
      aria-modal="true"
      aria-label={t('Modo intérprete')}
      data-testid="modo-interprete"
      data-fase={atual.fase}
      data-modo={modo}
    >
      {tela === 'conversa' ? null : ladoALado ? metade('meu') : metade('outro')}
      <div className="int-faixa" data-com-modo={automatico !== 'oculto' || undefined}>
        <div className="int-esq">
          <button
            type="button"
            className="int-ib peq"
            onClick={() => controle.trocarLados()}
            aria-label={t('Trocar os lados')}
          >
            <ArrowUpDown aria-hidden />
          </button>
          {automatico !== 'oculto' && (
            <button
              type="button"
              className="int-modo"
              onClick={trocarModo}
              aria-pressed={noAutomatico}
              aria-label={t('Modo automático: o app reconhece quem fala qual idioma')}
              data-bloqueado={automatico === 'premium' || undefined}
              data-testid="modo-automatico"
            >
              {automatico === 'premium' ? <Lock aria-hidden /> : <AudioLines aria-hidden />}
              <span aria-hidden>{t('Automático')}</span>
            </button>
          )}
          <button
            type="button"
            className="int-modo"
            onClick={alternarTela}
            aria-pressed={tela === 'conversa'}
            aria-label={t('Ver a conversa em lista')}
            data-testid="tela-conversa"
          >
            <MessagesSquare aria-hidden />
            <span className="int-modo-txt" aria-hidden>
              {t('Conversa')}
            </span>
          </button>
        </div>
        <div className="int-centro">
          <span className="int-voz" data-natural={vozNatural || undefined} data-testid="voz-em-uso" title={rotuloDaVoz}>
            {mudos.length === 2 ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
            <span className="int-voz-txt">{rotuloDaVoz}</span>
          </span>
          <span className="int-aviso" role="status" data-testid="aviso-do-interprete">
            {avisoDaTela ?? aviso ?? ''}
          </span>
        </div>
        <button type="button" className="int-ib peq" onClick={sair} aria-label={t('Sair do modo intérprete')}>
          <X aria-hidden />
        </button>
      </div>
      {tela === 'conversa' ? conversa() : ladoALado ? metade('outro') : metade('meu')}
      {edicao && (
        <FolhaDeEdicao
          texto={edicao.item.original}
          lang={edicao.lang}
          aoCancelar={() => setEdicao(null)}
          aoConfirmar={(novo) => {
            aoCorrigirFala?.(edicao.item.id, novo, { de: edicao.de, para: edicao.para });
            setEdicao(null);
          }}
        />
      )}
    </div>
  );
}
