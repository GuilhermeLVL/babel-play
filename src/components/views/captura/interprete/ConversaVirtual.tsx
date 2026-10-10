import '../../../../styles/modoInterprete.css';

import { Languages, Monitor, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { type PonteDoInterprete, VELOCIDADE_LENTA } from '../../../../lib/captura/controleDoInterprete';
import { baixarTexto, conversaEmMarkdown, nomeDoArquivoDaConversa } from '../../../../lib/captura/exportarConversa';
import {
  historicoDoInterprete,
  type ItemDoHistorico,
  JANELA_DO_HISTORICO,
  subirJanela,
} from '../../../../lib/captura/historicoDoInterprete';
import { direcaoDoLado, type IdiomasDoInterprete } from '../../../../lib/captura/interprete';
import { ESTADO_DO_AUTOMATICO } from '../../../../lib/captura/interpreteAutomatico';
import { detectarIdiomaNaVirtual, gravarDetectarIdiomaNaVirtual } from '../../../../lib/captura/testesDoInterprete';
import type { LadoDoInterprete } from '../../../../lib/captura/tiposDaFala';
import type { TraducaoFinal } from '../../../../lib/captura/traducaoDaFala';
import { t } from '../../../../lib/i18n';
import { langLabel, toBcp47 } from '../../../../lib/languages';
import { mudarEstadoDaTela } from '../../../../lib/polimento/interprete';
import { nativeTts } from '../../../../lib/tts';
import { criarFilaDeFala, type FilaDeFala } from '../../../../lib/voz/filaDeFala';
import { criarVozDaNuvem, destravarVozDaNuvem, type VozDaNuvem } from '../../../../lib/voz/vozDaNuvem';
import ConversaDoPrototipo, { type FraseDaMetade, type MetadeDaConversa } from './ConversaDoPrototipo';
import FolhaDeEdicao from './FolhaDeEdicao';
import { ConversaEmBolhas } from './ListaDoHistorico';
import type { FalaDoInterprete, FraseParaGuardar } from './ModoInterprete';
import type { AoOuvirTrecho, TrechoEmLeitura } from './TextoTocavel';

/** Quanto tempo entre as leituras do estado das fontes (os ref da captura não avisam a tela). */
const INTERVALO_DAS_FONTES_MS = 500;

const outroLado = (lado: LadoDoInterprete): LadoDoInterprete => (lado === 'meu' ? 'outro' : 'meu');

/**
 * A CONVERSA VIRTUAL (Intérprete v3, Fase 4) — o intérprete para quem NÃO está frente a frente: um vídeo,
 * o Discord, um jogo, uma chamada. Duas fontes rodam juntas, cada uma com a direção FIXA:
 *   · "A outra pessoa" = o áudio do computador: o idioma dela, traduzido para o meu;
 *   · "Você"           = o microfone: o meu idioma, traduzido para o dela.
 *
 * A TELA É A DA CONVERSA DO DESENHO NOVO (`ConversaDoPrototipo`), a mesma do frente a frente: no
 * computador, duas colunas ("Você" à esquerda, "A outra pessoa" à direita) e a faixa em cima. Onde cada
 * controle da conversa virtual mora nela:
 *   · a coluna da outra pessoa mostra o que vem do som do computador (a tradução grande, o que foi dito
 *     embaixo); o botão grande dela, com o monitor, abre o seletor da aba ou tela com áudio e, ouvindo,
 *     fica aceso (parar é sair da conversa ou encerrar o compartilhamento no navegador);
 *   · a sua coluna mostra o que você fala; o botão grande dela liga e silencia o microfone;
 *   · na faixa, "Detectando idiomas" / "Idiomas fixos" e "Só legenda" / "Lendo em voz alta" são botões de
 *     modo como o "Automático"; a voz em uso e o aviso do preparo ficam no meio, e o X sai;
 *   · "Conversa" abre a lista em bolhas, onde cada fala se ouve, se corrige e se guarda, e "Exportar";
 *   · "Repetir" lê de novo a última tradução da outra pessoa, e "Parar voz" cala a leitura.
 * O padrão é SÓ LEGENDA: ler a tradução da outra pessoa em voz alta é uma escolha (com a voz do app
 * tocando, o que começa a ser dito nesse intervalo é pulado pelo anti-eco — de preferência, de fone).
 *
 * A captura (`LiveCapture`) abre as duas fontes e repassa as falas; a ponte liga o fim de cada tradução à
 * leitura. Aqui só vive a tela, a leitura e o estado das fontes.
 */
export default function ConversaVirtual({
  idiomas,
  falas,
  registrarPonte,
  fontes,
  abrirSistema,
  alternarMicrofone,
  vozNaturalDisponivel,
  velocidade,
  abrindo,
  aviso,
  aoCorrigirFala,
  aoGuardar,
  aoDetectarIdioma,
  aoSair,
}: {
  idiomas: IdiomasDoInterprete;
  falas: ReadonlyArray<FalaDoInterprete>;
  registrarPonte: (ponte: PonteDoInterprete | null) => void;
  /** O estado das duas fontes agora (a captura guarda em ref; a tela pergunta a cada meio segundo). */
  fontes: { sistemaAtivo: () => boolean; microfoneAtivo: () => boolean };
  /** Abre (ou reabre) o seletor da aba ou tela com áudio: precisa de um toque. */
  abrirSistema: () => void;
  /** Liga ou silencia o microfone sem fechar a conversa. */
  alternarMicrofone: (ligar: boolean) => void;
  vozNaturalDisponivel: boolean;
  velocidade?: number;
  abrindo?: boolean;
  aviso?: string | null;
  aoCorrigirFala?: (id: string, texto: string, direcao: { de: string; para: string }) => void;
  aoGuardar?: (frase: FraseParaGuardar) => void;
  /** A pessoa ligou ou desligou "Detectar idioma": a captura passa a medir o idioma de cada fala (ou a usar o fixo). */
  aoDetectarIdioma?: (ligado: boolean) => void;
  aoSair: () => void;
}) {
  const idiomasRef = useRef(idiomas);
  idiomasRef.current = idiomas;
  const fontesRef = useRef(fontes);
  fontesRef.current = fontes;
  const [ativos, setAtivos] = useState(() => ({ sistema: fontes.sistemaAtivo(), microfone: fontes.microfoneAtivo() }));
  useEffect(() => {
    const ler = () => {
      const sistema = fontesRef.current.sistemaAtivo();
      const microfone = fontesRef.current.microfoneAtivo();
      setAtivos((a) => (a.sistema === sistema && a.microfone === microfone ? a : { sistema, microfone }));
    };
    ler();
    const relogio = setInterval(ler, INTERVALO_DAS_FONTES_MS);
    return () => clearInterval(relogio);
  }, []);

  /* A LEITURA: uma fila só, para a tradução da outra pessoa (quando ligada) e para os toques no texto. */
  const [lerEmVozAlta, setLerEmVozAlta] = useState(false);
  const lerRef = useRef(false);
  lerRef.current = lerEmVozAlta;
  const velocidadeRef = useRef(velocidade);
  velocidadeRef.current = velocidade;
  const [lendo, setLendo] = useState<TrechoEmLeitura | null>(null);
  const filaRef = useRef<FilaDeFala | null>(null);
  const vozRef = useRef<VozDaNuvem | null>(null);
  useEffect(() => {
    const voz = vozNaturalDisponivel ? criarVozDaNuvem() : null;
    vozRef.current = voz;
    const velocidadeInicial = velocidadeRef.current;
    const fila = criarFilaDeFala({
      motor: () => voz ?? nativeTts,
      ...(velocidadeInicial && velocidadeInicial !== 1 ? { opcoesDeFala: { rate: velocidadeInicial } } : {}),
      aoMudar: (e) => setLendo(e.falando?.manual ? { texto: e.falando.texto, lang: e.falando.lang } : null),
    });
    filaRef.current = fila;
    return () => {
      fila.destruir();
      if (filaRef.current === fila) filaRef.current = null;
    };
  }, [vozNaturalDisponivel]);

  /* DETECTAR IDIOMA: do computador podem vir idiomas diferentes; cada fala é medida e a minha resposta vai para o
     idioma de quem falou por último. Ligado por padrão; desligado, valem os dois idiomas escolhidos. */
  const [detectar, setDetectar] = useState(detectarIdiomaNaVirtual);
  const alternarDetectar = () => {
    const ligar = !detectar;
    gravarDetectarIdiomaNaVirtual(ligar);
    setDetectar(ligar);
    aoDetectarIdioma?.(ligar);
  };

  const falaDe = useCallback((lado: LadoDoInterprete) => direcaoDoLado(lado, idiomasRef.current).fala, []);

  /* A PONTE com a captura: a direção é do pipeline (fixa por fonte), então aqui só a tradução do que vem
     do computador. */
  useEffect(() => {
    const aoTraduzirFinal = (final: TraducaoFinal) => {
      if (!lerRef.current || !final.segId.startsWith('sys-')) return;
      if (final.resultado !== 'traduzida' || !final.traducao.trim()) return;
      filaRef.current?.enfileirar({ id: final.segId, texto: final.traducao, lang: falaDe('meu'), lado: 'outro' });
    };
    const ponte: PonteDoInterprete = {
      direcao: () => null,
      aoFimDaFala: () => {},
      aoTraduzirFinal,
      idiomasDaConversa: () => [falaDe('meu'), falaDe('outro')],
      microfoneFalhou: () => {},
      automatico: () => false,
      ladoDaFala: () => ({
        lado: 'outro',
        de: '',
        para: '',
        fala: falaDe('meu'),
        terceiro: false,
        palpite: true,
        estado: ESTADO_DO_AUTOMATICO,
      }),
    };
    registrarPonte(ponte);
    return () => registrarPonte(null);
  }, [registrarPonte, falaDe]);

  const alternarLeitura = () => {
    const ligar = !lerEmVozAlta;
    if (ligar && vozNaturalDisponivel) destravarVozDaNuvem();
    if (!ligar) filaRef.current?.parar();
    setLerEmVozAlta(ligar);
  };

  /* A conversa cobre a tela pronta, que fica por baixo e se esconde enquanto esta está na frente (como
     na conversa frente a frente, `ModoInterprete`). */
  useLayoutEffect(() => {
    mudarEstadoDaTela({ emCurso: true, depois: null });
    return () => mudarEstadoDaTela({ emCurso: false });
  }, []);

  /** TOQUE NO TEXTO: lê a palavra ou a frase, cortando a leitura em curso. */
  const ouvirTrecho: AoOuvirTrecho = (texto, lang, opcoes) => {
    const fila = filaRef.current;
    if (!fila || !texto.trim()) return;
    if (vozNaturalDisponivel) destravarVozDaNuvem();
    fila.parar();
    fila.enfileirar({
      id: `trecho-${Date.now()}`,
      texto,
      lang,
      manual: true,
      ...(opcoes?.lento ? { velocidade: VELOCIDADE_LENTA } : {}),
    });
  };

  /* O HISTÓRICO: a lista da tela "Conversa" (a janela) e, inteiro, o que cada coluna mostra por último. */
  const [lista, setLista] = useState(false);
  const [janela, setJanela] = useState(JANELA_DO_HISTORICO);
  const totalDeFinais = useMemo(
    () => falas.filter((f) => f.lado && !f.isPartial && f.originalText.trim()).length,
    [falas],
  );
  const historico = historicoDoInterprete(falas, 'meu', { janela });
  const tudo = historicoDoInterprete(falas, 'meu', { janela: Number.MAX_SAFE_INTEGER });
  /* Os idiomas que a outra pessoa já falou nesta conversa, na ordem em que apareceram (com detecção). */
  const idiomasOuvidos = useMemo(() => {
    const vistos: string[] = [];
    for (const f of falas) if (f.lado === 'outro' && f.lang && !vistos.includes(f.lang)) vistos.push(f.lang);
    return vistos;
  }, [falas]);

  /* CORRIGIR e GUARDAR, como na tela frente a frente. */
  const [edicao, setEdicao] = useState<{ item: ItemDoHistorico; lang: string; de: string; para: string } | null>(null);
  /** Os idiomas desta fala: os medidos (com detecção) ou, na falta deles, os dos dois lados escolhidos. */
  const idiomaDaFala = (item: ItemDoHistorico) => (item.idioma ? toBcp47(item.idioma) : falaDe(item.lado));
  const idiomaDaTraducao = (item: ItemDoHistorico) =>
    item.idiomaDaTraducao ? toBcp47(item.idiomaDaTraducao) : falaDe(item.lado === 'meu' ? 'outro' : 'meu');
  const editar = (item: ItemDoHistorico) => {
    const d = direcaoDoLado(item.lado, idiomasRef.current);
    setEdicao({
      item,
      lang: idiomaDaFala(item),
      de: item.idioma ?? d.de,
      para: item.idiomaDaTraducao ?? d.para,
    });
  };
  const guardar = (item: ItemDoHistorico) => {
    aoGuardar?.({
      id: item.id,
      texto: item.original,
      traducao: item.traducao,
      lang: idiomaDaFala(item),
      langDaTraducao: idiomaDaTraducao(item),
    });
  };
  const exportar = () => {
    const titulo = t('Conversa de {data}', { data: new Date().toLocaleDateString() });
    baixarTexto(
      nomeDoArquivoDaConversa(titulo),
      conversaEmMarkdown(falas, {
        titulo,
        rotulos: { meu: t('Você'), outro: t('A outra pessoa') },
        idiomas: { meu: langLabel(falaDe('meu')), outro: langLabel(falaDe('outro')) },
      }),
    );
  };

  /* AS DUAS COLUNAS. Cada uma é de quem fala nela: a da outra pessoa mostra o que vem do computador
     (o que EU leio em destaque é a tradução), a minha o que eu disse (em destaque) e a tradução embaixo. */
  const [trocados, setTrocados] = useState(false);
  const ultimaDe = (dono: LadoDoInterprete) => [...tudo.itens].reverse().find((i) => i.lado === dono);
  const ultimaDoOutro = ultimaDe('outro');
  const vozNatural = !!vozRef.current && vozRef.current.motorDaUltimaFala() === 'voz-da-nuvem';
  const coluna = (lado: LadoDoInterprete): MetadeDaConversa => {
    const dono = trocados ? outroLado(lado) : lado;
    const doComputador = dono === 'outro';
    const dizendo = [...falas].reverse().find((f) => f.lado === dono && f.isPartial && f.originalText.trim());
    const item = ultimaDe(dono);
    /* Com a detecção, a coluna da outra pessoa diz o idioma medido da fala que está na tela. */
    const lang = doComputador && detectar && item?.idioma ? toBcp47(item.idioma) : falaDe(dono);
    let frase: FraseDaMetade = {
      tipo: 'dica',
      texto: !doComputador
        ? t('De fone, o microfone não ouve o que toca no computador.')
        : ativos.sistema
          ? t('Estou ouvindo o áudio do computador. Toque um vídeo ou entre na conversa: a tradução aparece aqui.')
          : t('Compartilhe uma aba ou a tela com áudio para eu ouvir o computador.'),
    };
    if (dizendo) frase = { tipo: 'fala', texto: dizendo.originalText, lang: falaDe(dono), aoVivo: true };
    else if (item) {
      const traducao = item.traduzindo ? '…' : item.traducao.trim();
      /* Sem tradução (a outra pessoa falou o meu idioma), o que foi dito é o que se lê. */
      const grande = doComputador ? traducao || item.original : item.original;
      const pequeno = doComputador ? (traducao ? item.original : '') : traducao;
      frase = {
        tipo: 'traducao',
        id: item.id,
        traducao: grande,
        original: pequeno,
        lang: doComputador && traducao ? idiomaDaTraducao(item) : idiomaDaFala(item),
        langDoOriginal: doComputador ? idiomaDaFala(item) : idiomaDaTraducao(item),
      };
    }
    if (doComputador)
      return {
        lado,
        dono,
        lang,
        nome: langLabel(lang),
        frase,
        status: ativos.sistema ? t('Ouvindo o computador…') : '',
        rotulo: ativos.sistema ? t('Ouvindo') : t('Ouvir'),
        rotuloParaLeitor: ativos.sistema ? t('Ouvindo o áudio do computador') : t('Compartilhar áudio'),
        ouvindo: ativos.sistema,
        aoFalar: abrirSistema,
        /* Ouvindo, não há o que tocar aqui: a captura do computador só fecha ao sair da conversa. */
        travado: ativos.sistema,
        semVoz: false,
        icone: Monitor,
      };
    return {
      lado,
      dono,
      lang,
      nome: langLabel(lang),
      frase,
      status: abrindo ? t('Abrindo o microfone…') : ativos.microfone ? t('Ouvindo…') : '',
      rotulo: ativos.microfone ? t('Parar') : t('Falar'),
      rotuloParaLeitor: ativos.microfone ? t('Silenciar o meu microfone') : t('Ligar o meu microfone'),
      ouvindo: ativos.microfone,
      aoFalar: () => alternarMicrofone(!ativos.microfone),
      /* A tradução do microfone nunca é lida aqui: não há o que repetir nem o que calar nesta coluna. */
      semVoz: true,
    };
  };

  return (
    <ConversaDoPrototipo
      cima={coluna('outro')}
      baixo={coluna('meu')}
      modos={[
        {
          id: 'detectar-idioma',
          icone: Languages,
          rotulo: detectar ? t('Detectando idiomas') : t('Idiomas fixos'),
          rotuloParaLeitor: t('Detectar o idioma de cada fala'),
          ligado: detectar,
          aoTocar: alternarDetectar,
        },
        {
          id: 'ler-em-voz-alta',
          icone: lerEmVozAlta ? Volume2 : VolumeX,
          rotulo: lerEmVozAlta ? t('Lendo em voz alta') : t('Só legenda'),
          rotuloParaLeitor: t('Ler a tradução da outra pessoa em voz alta'),
          ligado: lerEmVozAlta,
          aoTocar: alternarLeitura,
        },
      ]}
      lista={{
        aberta: lista,
        bolhas: [],
        aoAlternar: () => setLista((v) => !v),
        aoExportar: () => {
          if (totalDeFinais > 0) exportar();
        },
        topo:
          detectar && idiomasOuvidos.length > 0 ? (
            <span
              className="int-idiomas"
              data-testid="idiomas-ouvidos"
              aria-label={t('Idiomas ouvidos da outra pessoa')}
            >
              {idiomasOuvidos.map((l) => (
                <span key={l}>{langLabel(toBcp47(l))}</span>
              ))}
            </span>
          ) : null,
        /* Vazia, a lista é a de sempre ("A conversa aparece aqui…"). */
        conteudo: totalDeFinais > 0 && (
          <ConversaEmBolhas
            historico={historico}
            total={totalDeFinais}
            aoVerMais={() => setJanela((j) => subirJanela(j, totalDeFinais))}
            idiomaDaFala={idiomaDaFala}
            idiomaDaTraducao={idiomaDaTraducao}
            {...(detectar
              ? { rotulo: (item: ItemDoHistorico) => (item.idioma ? langLabel(toBcp47(item.idioma)) : null) }
              : {})}
            mudo={() => false}
            lendo={lendo}
            aoOuvir={ouvirTrecho}
            {...(aoCorrigirFala ? { aoEditar: editar } : {})}
            {...(aoGuardar ? { aoGuardar: guardar } : {})}
          />
        ),
      }}
      voz={{
        rotulo: !lerEmVozAlta ? t('Só legenda') : vozNatural ? t('Voz natural · Premium') : t('Voz do aparelho'),
        natural: lerEmVozAlta && vozNatural,
        muda: !lerEmVozAlta,
      }}
      aviso={aviso ?? ''}
      aoTrocarLados={() => setTrocados((v) => !v)}
      aoRepetir={() => {
        if (ultimaDoOutro?.traducao.trim()) ouvirTrecho(ultimaDoOutro.traducao, idiomaDaTraducao(ultimaDoOutro));
      }}
      aoPararVoz={() => filaRef.current?.parar()}
      aoSair={aoSair}
      emDialogo
      testid="conversa-virtual"
      rotulo={t('Conversa virtual')}
      rotuloDeSair={t('Sair da conversa virtual')}
    >
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
    </ConversaDoPrototipo>
  );
}
