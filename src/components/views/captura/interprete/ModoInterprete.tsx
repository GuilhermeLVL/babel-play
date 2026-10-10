import '../../../../styles/modoInterprete.css';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import {
  type ControleDoInterprete,
  criarControleDoInterprete,
  type EstadoDoControle,
  type PonteDoInterprete,
} from '../../../../lib/captura/controleDoInterprete';
import { baixarTexto, conversaEmMarkdown, nomeDoArquivoDaConversa } from '../../../../lib/captura/exportarConversa';
import { historicoDoInterprete, JANELA_DO_HISTORICO } from '../../../../lib/captura/historicoDoInterprete';
import { direcaoDoLado, ESTADO_INICIAL, type IdiomasDoInterprete } from '../../../../lib/captura/interprete';
import { chaveLigada } from '../../../../lib/captura/testesDoInterprete';
import type { LadoDoInterprete, SpeechSegment } from '../../../../lib/captura/tiposDaFala';
import { t } from '../../../../lib/i18n';
import { langLabel } from '../../../../lib/languages';
import { estadoDaTela, mudarEstadoDaTela, tomarPedidoDaConversa, tremer } from '../../../../lib/polimento/interprete';
import { nativeTts, type TtsEngine } from '../../../../lib/tts';
import { aquecerInterprete } from '../../../../lib/voz/aquecimentoDoInterprete';
import { ladosDaVoz } from '../../../../lib/voz/catalogoDeVozes';
import { comoInstalarVoz, faltaVozNoAparelho, useVozesDoAparelho } from '../../../../lib/voz/faltaDeVoz';
import { criarMotorPorPreferencia } from '../../../../lib/voz/motorPorPreferencia';
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
import { guardarModo, type ModoDaConversa, modoGuardado } from './modoDaConversa';

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

/**
 * O MODO INTÉRPRETE (E3 da Fase E): a conversa em curso, na tela do protótipo (`ConversaDoPrototipo`),
 * a mesma em todo aparelho.
 *
 *  · As duas metades frente a frente: cada uma mostra o idioma dela, a fala de quem está nela ou a
 *    tradução do outro, e o botão de falar.
 *  · COMPUTADOR: atalhos de teclado (1 e 2 falam, R repete, P para a voz, Esc sai). No celular e no
 *    headset não há teclado a ouvir.
 *  · Sem voz de leitura no aparelho (`semVoz`), a tela diz que a tradução é em texto, em vez de
 *    prometer leitura em voz alta.
 *  · AUTOMÁTICO (E7, o padrão de quem o tem no plano): ninguém toca em lado; o app reconhece o idioma
 *    de cada fala, mostra a tradução na metade de quem ouve, lê em voz alta e volta a ouvir. Sem ele no
 *    plano, o botão aparece com cadeado e diz de que plano é.
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
  aoSair: () => void;
  aoFalharMicrofone?: (erro: unknown) => void;
  /** O botão de cada metade que abre a escolha dos idiomas (`direto.js:73`). */
  aoEscolherIdiomas?: (() => void) | undefined;
  /** Os Planos, a partir do aviso do cadeado (ausente no perfil protegido). */
  aoConhecerOPremium?: (() => void) | undefined;
  /** A conversa virtual existe neste aparelho; "Virtual" abre a folha dela. */
  comVirtual?: boolean;
}) {
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
  /* Os lados podem ter sido trocados na tela pronta: a conversa já abre assim. */
  const [estado, setEstado] = useState<EstadoDoControle>(() =>
    estadoDaTela().trocados ? { ...ESTADO_DA_TELA, trocados: true } : ESTADO_DA_TELA,
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
  /* A lista de vozes do aparelho chega depois da tela, e muda quando a pessoa instala uma voz. */
  useVozesDoAparelho();
  /**
   * O APARELHO TEM VOZ, MAS NÃO A DESTE IDIOMA (o Windows sem o pacote de chinês): o motor não lê com
   * voz de outro idioma, e a tela precisa dizer isso em vez de prometer leitura. Com a voz natural no
   * plano, quem lê é a nuvem, que não depende das vozes do aparelho.
   */
  const semVozDoIdioma = (idioma: string) => !semVoz && !vozNaturalDisponivel && faltaVozNoAparelho(idioma);
  /** Este idioma não é lido em voz alta aqui: a tradução dele fica em texto. */
  const mudo = (idioma: string) => (semVoz && !(comVozDoSite && vozDoQuestFala(idioma))) || semVozDoIdioma(idioma);

  useEffect(() => {
    /* Com a voz natural, cada fala pergunta pela voz escolhida do idioma dela: a do aparelho, se a
       pessoa escolheu uma; senão a nuvem (`motorPorPreferencia.ts`). */
    const voz = comVozDoSite
      ? criarVozDoQuest()
      : vozNaturalDisponivel
        ? criarMotorPorPreferencia({ nuvem: criarVozDaNuvem() })
        : null;
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
    if (estadoDaTela().trocados && !controle.estado().trocados) controle.trocarLados();
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

  /* A conversa abre direto (`direto.js:8-14`). A tela pronta fica por baixo e se esconde
     enquanto esta está na frente; o toque que a abriu (um lado, ou a escuta do automático) começa aqui. */
  useLayoutEffect(() => {
    /* A conversa voltou ("Continuar gravando" no Encerrar): o que foi pedido para depois dela não vale mais. */
    mudarEstadoDaTela({ emCurso: true, depois: null });
    return () => mudarEstadoDaTela({ emCurso: false });
  }, []);
  useEffect(() => {
    /* Depois do efeito que cria o controle (e da segunda montagem do StrictMode). */
    const relogio = setTimeout(() => {
      const c = controleRef.current;
      const pedido = tomarPedidoDaConversa();
      if (!c || !pedido) return;
      if (pedido === 'ouvir') c.ouvir();
      else c.tocar(pedido);
    }, 0);
    return () => clearTimeout(relogio);
  }, []);

  /* A TELA: a conversa abre sempre nas duas metades (`telas2.js:170-182`); a lista é uma escolha da vez. */
  const [tela, setTela] = useState<TelaDoInterprete>('frente');
  const alternarTela = () => setTela(tela === 'frente' ? 'conversa' : 'frente');
  const totalDeFinais = useMemo(
    () => falas.filter((f) => f.lado && !f.isPartial && f.originalText.trim()).length,
    [falas],
  );

  /* O MODO. Quem tem o automático começa nele (decisão do dono), a menos que tenha escolhido o toque
     da última vez. Sem ele no plano, é sempre por toque. */
  const [modo, setModo] = useState<ModoDaConversa>(() =>
    automatico === 'disponivel' ? (modoGuardado() ?? 'automatico') : 'toque',
  );
  useEffect(() => {
    if (automatico !== 'disponivel') setModo('toque');
  }, [automatico]);
  /** O aviso do cadeado fica na tela, com o botão dos Planos (`telas2.js:260-262`). */
  const [cadeado, setCadeado] = useState(false);
  const trocarModo = () => {
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
  /** Sem nada dito, o X volta para a tela de origem (`direto.js:94`) assim que a sessão
      encerra (quem navega é a tela pronta, que fica por baixo); com falas, o Encerrar decide antes. */
  const sairDaTela = () => {
    if (totalDeFinais === 0) mudarEstadoDaTela({ depois: 'voltar' });
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
      /* Com um diálogo por cima (os idiomas, o Encerrar), o teclado é dele: o Esc fecha o diálogo, e
         não a conversa. */
      if (document.querySelector('dialog[open]')) return;
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
  /** O idioma sem voz NESTE aparelho (que tem as de outros): a faixa diz como instalar a dele. */
  const idiomaSemVoz = (['outro', 'meu'] as const).map(idiomaDoLado).find(semVozDoIdioma);
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

  /** O que cada lado precisa para se desenhar, igual nas duas telas (frente a frente e conversa). */
  const dadosDoLado = (lado: LadoDoInterprete) => {
    const direcao = direcaoDoLado(lado, idiomas, atual.trocados);
    const historico = historicoDoInterprete(falas, lado, {
      janela: JANELA_DO_HISTORICO,
      parcialDoOutro: chaveLigada('parcialTraduzido'),
    });
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
      vozes={semVoz ? undefined : { lados: ladosDaVoz(idiomas) }}
      aviso={
        aviso ??
        (avisoDoCadeado
          ? t('O modo automático faz parte do Premium: o app reconhece sozinho quem fala qual idioma.')
          : idiomaSemVoz
            ? comoInstalarVoz(idiomaSemVoz)
            : noAutomatico
              ? t('Automático ligado: é só conversar. O app reconhece quem fala qual idioma.')
              : '')
      }
      aoConhecerOPremium={
        avisoDoCadeado && !aviso && aoConhecerOPremium && totalDeFinais === 0
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
              /* A conversa virtual é outra sessão: esta encerra primeiro (sem falas, na hora; com falas,
                 o Encerrar pergunta se salva) e a tela pronta abre a folha em seguida, por cima da conversa. */
              mudarEstadoDaTela({ depois: 'virtual' });
              sair();
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
