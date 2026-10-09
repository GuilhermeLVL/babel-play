import '../../../../styles/modoInterprete.css';

import { Download, Headphones, Languages, Loader2, Mic, MicOff, Monitor, Volume2, VolumeX, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
import { nativeTts } from '../../../../lib/tts';
import { criarFilaDeFala, type FilaDeFala } from '../../../../lib/voz/filaDeFala';
import { criarVozDaNuvem, destravarVozDaNuvem } from '../../../../lib/voz/vozDaNuvem';
import FolhaDeEdicao from './FolhaDeEdicao';
import { ConversaEmBolhas } from './ListaDoHistorico';
import type { FalaDoInterprete, FraseParaGuardar } from './ModoInterprete';
import type { AoOuvirTrecho, TrechoEmLeitura } from './TextoTocavel';

/** Quanto tempo entre as leituras do estado das fontes (os ref da captura não avisam a tela). */
const INTERVALO_DAS_FONTES_MS = 500;

/**
 * A CONVERSA VIRTUAL (Intérprete v3, Fase 4) — o intérprete para quem NÃO está frente a frente: um vídeo,
 * o Discord, um jogo, uma chamada. Duas fontes rodam juntas, cada uma com a direção FIXA:
 *   · "Eles"  = o áudio do computador: o idioma da outra pessoa, traduzido para o meu;
 *   · "Você"  = o microfone: o meu idioma, traduzido para o dela.
 * A tela é a lista em bolhas do histórico (a mesma tela "Conversa" do intérprete), sem tocar em lado nem
 * alternar turnos. O padrão é SÓ LEGENDA: ler a tradução de "Eles" em voz alta é uma escolha (com a voz
 * do app tocando, o que começa a ser dito nesse intervalo é pulado pelo anti-eco — de preferência, de fone).
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
  layout,
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
  layout: 'celular' | 'computador' | 'quest';
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

  /* A LEITURA: uma fila só, para a tradução de "Eles" (quando ligada) e para os toques no texto. */
  const [lerEmVozAlta, setLerEmVozAlta] = useState(false);
  const lerRef = useRef(false);
  lerRef.current = lerEmVozAlta;
  const velocidadeRef = useRef(velocidade);
  velocidadeRef.current = velocidade;
  const [lendo, setLendo] = useState<TrechoEmLeitura | null>(null);
  const filaRef = useRef<FilaDeFala | null>(null);
  useEffect(() => {
    const voz = vozNaturalDisponivel ? criarVozDaNuvem() : null;
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

  /* DETECTAR IDIOMA: "Eles" podem falar idiomas diferentes; cada fala é medida e a minha resposta vai para o
     idioma de quem falou por último. Ligado por padrão; desligado, valem os dois idiomas escolhidos. */
  const [detectar, setDetectar] = useState(detectarIdiomaNaVirtual);
  const alternarDetectar = () => {
    const ligar = !detectar;
    gravarDetectarIdiomaNaVirtual(ligar);
    setDetectar(ligar);
    aoDetectarIdioma?.(ligar);
  };

  const falaDe = useCallback((lado: LadoDoInterprete) => direcaoDoLado(lado, idiomasRef.current).fala, []);

  /* A PONTE com a captura: a direção é do pipeline (fixa por fonte), então aqui só a tradução de "Eles". */
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

  const [avisoDaTela, setAvisoDaTela] = useState<string | null>(null);
  useEffect(() => {
    if (!avisoDaTela) return;
    const relogio = setTimeout(() => setAvisoDaTela(null), 6000);
    return () => clearTimeout(relogio);
  }, [avisoDaTela]);
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

  /* O HISTÓRICO (a mesma lista da tela "Conversa") e o que falta dele ao vivo: o que "Eles" estão dizendo agora. */
  const [janela, setJanela] = useState(JANELA_DO_HISTORICO);
  const totalDeFinais = useMemo(
    () => falas.filter((f) => f.lado && !f.isPartial && f.originalText.trim()).length,
    [falas],
  );
  const historico = historicoDoInterprete(falas, 'meu', { janela });
  /* Os idiomas que "Eles" já falaram nesta conversa, na ordem em que apareceram (com detecção). */
  const idiomasOuvidos = useMemo(() => {
    const vistos: string[] = [];
    for (const f of falas) if (f.lado === 'outro' && f.lang && !vistos.includes(f.lang)) vistos.push(f.lang);
    return vistos;
  }, [falas]);
  const dizendoAgora = [...falas].reverse().find((f) => f.lado === 'outro' && f.isPartial && f.originalText.trim());
  const fim = dizendoAgora ? (
    <p className="int-ao-vivo" lang={falaDe('outro')} data-testid="eles-dizendo">
      {dizendoAgora.originalText}
    </p>
  ) : historico.itens.length === 0 ? (
    <p className="int-dica">
      {ativos.sistema
        ? t('Estou ouvindo o áudio do computador. Toque um vídeo ou entre na conversa: a tradução aparece aqui.')
        : t('Compartilhe uma aba ou a tela com áudio para eu ouvir o computador.')}
    </p>
  ) : null;

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
        rotulos: { meu: t('Você'), outro: t('Eles') },
        idiomas: { meu: langLabel(falaDe('meu')), outro: langLabel(falaDe('outro')) },
      }),
    );
  };

  return (
    <div
      className="int"
      data-layout={layout}
      data-tela="conversa"
      data-virtual
      role="dialog"
      aria-modal="true"
      aria-label={t('Conversa virtual')}
      data-testid="conversa-virtual"
    >
      <div className="int-faixa" data-testid="faixa-virtual">
        <div className="int-esq">
          <span className="int-fonte" data-ativa={ativos.sistema || undefined} data-testid="fonte-eles">
            <Monitor aria-hidden />
            <span>{ativos.sistema ? t('Eles · ouvindo o computador') : t('Eles · desligado')}</span>
          </span>
          {!ativos.sistema && (
            <button type="button" className="int-modo" onClick={abrirSistema} data-testid="compartilhar-audio">
              <Monitor aria-hidden />
              <span>{t('Compartilhar áudio')}</span>
            </button>
          )}
          <button
            type="button"
            className="int-modo"
            onClick={() => alternarMicrofone(!ativos.microfone)}
            aria-pressed={ativos.microfone}
            aria-label={ativos.microfone ? t('Silenciar o meu microfone') : t('Ligar o meu microfone')}
            data-testid="fonte-voce"
          >
            {abrindo ? (
              <Loader2 aria-hidden className="animate-spin" />
            ) : ativos.microfone ? (
              <Mic aria-hidden />
            ) : (
              <MicOff aria-hidden />
            )}
            <span>{ativos.microfone ? t('Você · ouvindo') : t('Você · silenciado')}</span>
          </button>
        </div>
        <div className="int-centro">
          <button
            type="button"
            className="int-modo"
            onClick={alternarLeitura}
            aria-pressed={lerEmVozAlta}
            aria-label={t('Ler a tradução de Eles em voz alta')}
            data-testid="ler-em-voz-alta"
          >
            {lerEmVozAlta ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
            <span>{lerEmVozAlta ? t('Lendo em voz alta') : t('Só legenda')}</span>
          </button>
          <button
            type="button"
            className="int-modo"
            onClick={alternarDetectar}
            aria-pressed={detectar}
            aria-label={t('Detectar o idioma de cada fala')}
            data-testid="detectar-idioma"
          >
            <Languages aria-hidden />
            <span>{detectar ? t('Detectando idiomas') : t('Idiomas fixos')}</span>
          </button>
          <span className="int-aviso" role="status" data-testid="aviso-do-interprete">
            {avisoDaTela ?? aviso ?? ''}
          </span>
        </div>
        <button type="button" className="int-ib peq" onClick={aoSair} aria-label={t('Sair da conversa virtual')}>
          <X aria-hidden />
        </button>
      </div>
      <section className="int-conversa" aria-label={t('Conversa')} data-testid="interprete-conversa">
        <div className="int-conversa-topo">
          {detectar && idiomasOuvidos.length > 0 && (
            <span className="int-idiomas" data-testid="idiomas-ouvidos" aria-label={t('Idiomas ouvidos de Eles')}>
              {idiomasOuvidos.map((l) => (
                <span key={l}>{langLabel(toBcp47(l))}</span>
              ))}
            </span>
          )}
          <span className="int-nota-fone">
            <Headphones aria-hidden /> {t('De fone, o microfone não ouve o que toca no computador.')}
          </span>
          {totalDeFinais > 0 && (
            <button type="button" className="int-modo" onClick={exportar} data-testid="exportar-conversa">
              <Download aria-hidden />
              <span>{t('Exportar')}</span>
            </button>
          )}
        </div>
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
          fim={fim}
          {...(aoCorrigirFala ? { aoEditar: editar } : {})}
          {...(aoGuardar ? { aoGuardar: guardar } : {})}
        />
      </section>
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
