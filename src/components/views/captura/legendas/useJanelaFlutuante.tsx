import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type ContextoDaCaptura,
  type Formato,
  formatoSugerido,
  tamanhoParaAbrir,
} from '../../../../core/legendas/janelaFlutuante';
import { t } from '../../../../lib/i18n';
import {
  abrirJanelaDocumento,
  type CaminhoDaJanela,
  caminhoDaJanela,
  guardarTamanho,
  lerTamanhos,
  redimensionarJanela,
} from '../../../../lib/legendas/janelaDoNavegador';
import { criarLegendaEmVideo, type LegendaEmVideo as Controlador } from '../../../../lib/legendas/legendaEmVideo';
import DocumentPiP from '../../../DocumentPiP';
import { toast } from '../../../Toast';
import AbaDoAssistente from '../assistente/AbaDoAssistente';
import { useAssistenteAoVivo } from '../assistente/useAssistenteAoVivo';
import LegendasFlutuantes, { type AbaDaJanela } from '../LegendasFlutuantes';
import LegendaEmVideo from './LegendaEmVideo';
import LegendaFlutuanteDoPrototipo from './LegendaFlutuanteDoPrototipo';
import type { LegendaAoVivo } from './LinhaDaLegenda';

const SEM_PAUSA: { pausado: boolean; pelaJanela: boolean } = { pausado: false, pelaJanela: false };

/** Depois de redimensionar, espera a pessoa soltar a borda antes de guardar o tamanho. */
const GUARDAR_TAMANHO_MS = 500;

/** O atalho que abre e fecha a legenda flutuante (Alt+L; no Mac, Option+L). */
export function eAtalhoDaLegenda(e: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'code'>): boolean {
  return e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyL';
}

/** O que o botão diz ANTES de tentar: qual janela este navegador vai dar. */
export function dicaDoCaminho(caminho: CaminhoDaJanela): string {
  if (caminho === 'documento') return t('Abre uma janela que fica por cima de tudo (Alt+L)');
  if (caminho === 'video') return t('Abre a legenda numa janelinha por cima de tudo, só para ler (Alt+L)');
  return t('Neste navegador a legenda flutua só dentro desta tela (Alt+L)');
}

interface Opcoes {
  /** Sem a legenda flutuante (headset): o atalho e a preparação do vídeo ficam desligados. */
  ativo: boolean;
  /** No celular a legenda fica no painel da página (`caminhoDaJanela`). */
  celular?: boolean;
  /** A captura está rodando: é quando o vídeo do PiP do Safari fica pronto (antes do clique). */
  gravando?: boolean;
  falas: LegendaAoVivo[];
  /** Lido na hora de abrir: é dele que sai o formato sugerido. */
  contexto: () => ContextoDaCaptura;
  aprendidas?: ReadonlySet<string>;
  aoRevelarTraducao?: (id: string) => void;
  aoConsultarPalavra?: (palavra: string, frase: string, lang?: string) => Promise<{ traducao: string }>;
  aoOuvir?: (texto: string, lang: string | undefined, lenta: boolean) => void;
  aoSalvarPalavra?: (item: { palavra: string; frase?: string; lang?: string; traducao?: string }) => Promise<string>;
  idiomaDaTraducao?: (lang: string | undefined) => string | undefined;
  /** O idioma da pessoa: o assistente ao vivo explica e traduz nele (e não ajuda nas falas nele). */
  langDaPessoa?: string;
}

/**
 * A LEGENDA FLUTUANTE, DE PONTA A PONTA — um botão só, um atalho, e a melhor janela que o navegador dá:
 * Document PiP (Chrome/Edge), PiP de vídeo (Safari) ou o painel dentro da página (o resto). Ver
 * `lib/legendas/janelaDoNavegador`.
 *
 * `abrir` tem de ser chamado DENTRO do gesto (clique, tecla): o pedido da janela é a primeira coisa
 * que acontece. O formato sugerido decide o tamanho de abertura; trocar de formato na janela
 * redimensiona (é um clique, então pode), e o último tamanho de cada formato fica guardado.
 */
export function useJanelaFlutuante(o: Opcoes) {
  const [caminho] = useState<CaminhoDaJanela>(() => caminhoDaJanela(globalThis, { celular: o.celular }));
  const [ativo, setAtivo] = useState<CaminhoDaJanela | null>(null);
  const [janela, setJanela] = useState<Window | null>(null);
  const [formato, setFormato] = useState<Formato>('legenda');
  const formatoRef = useRef(formato);
  formatoRef.current = formato;
  const [pausaDoVideo, setPausaDoVideo] = useState(SEM_PAUSA);
  /** O pedido em curso. Fechar (ou sair da tela) troca o número: a resposta atrasada é descartada. */
  const pedidoRef = useRef(0);
  const controlador = useRef<Controlador | null>(null);
  const opcoes = useRef(o);
  opcoes.current = o;

  /* O controlador do PiP de vídeo vive com a tela; o vídeo fica pronto ENQUANTO A CAPTURA RODA, antes
     do clique: no Safari, esperar os metadados depois do toque perde o gesto. */
  useEffect(() => {
    if (!o.ativo || caminho !== 'video') return;
    const c = criarLegendaEmVideo();
    controlador.current = c;
    return () => {
      c.destruir();
      controlador.current = null;
    };
  }, [o.ativo, caminho]);
  useEffect(() => {
    if (o.gravando) controlador.current?.preparar();
  }, [o.gravando, o.ativo, caminho]);

  /* Saiu da tela com um pedido no ar: a resposta que chegar depois fecha a janela que abriu. */
  useEffect(
    () => () => {
      pedidoRef.current++;
    },
    [],
  );

  const fechar = useCallback(() => {
    pedidoRef.current++;
    setJanela(null);
    void controlador.current?.fechar();
    setPausaDoVideo(SEM_PAUSA);
    setAtivo(null);
  }, []);

  /** Sem janela por cima de tudo: o painel dentro da página, dizendo por quê. */
  const cairNoPainel = useCallback((motivo: string) => {
    setAtivo('painel');
    toast.info(motivo);
  }, []);

  const salvarUltimaFrase = useCallback(() => {
    const { falas, aoSalvarPalavra } = opcoes.current;
    const ultima = [...falas].reverse().find((f) => !f.parcial && f.original.trim());
    if (!ultima || !aoSalvarPalavra) return;
    /* O fichamento já avisa na página o que aconteceu (entrou, repetida, recusada). */
    aoSalvarPalavra({ palavra: ultima.original, lang: ultima.lang, traducao: ultima.traducao || undefined }).catch(() =>
      toast.info(t('Não deu para salvar agora.')),
    );
  }, []);

  /**
   * Abre a melhor janela. `silencioso`: sem o aviso de "abertas" (a abertura automática). `aoFalhar`:
   * em vez de cair no painel quando o navegador recusa, chama isto (quem abriu oferece o botão).
   */
  const abrir = useCallback(
    ({ silencioso = false, aoFalhar }: { silencioso?: boolean; aoFalhar?: () => void } = {}) => {
      const id = ++pedidoRef.current;
      const valendo = () => pedidoRef.current === id;
      const f = formatoSugerido(opcoes.current.contexto());
      if (caminho === 'documento') {
        /* PRIMEIRO o pedido (ainda dentro do gesto); o estado vem depois. */
        const pedido = abrirJanelaDocumento(tamanhoParaAbrir(f, lerTamanhos()));
        setFormato(f);
        setAtivo('documento');
        pedido.then(
          (win) => {
            /* Fechada (ou saiu da tela) enquanto o navegador abria: esta janela não fica. */
            if (!valendo()) return win.close();
            setJanela(win);
            if (!silencioso) toast.info(t('Legendas flutuantes abertas: a janelinha fica por cima de tudo'));
          },
          () => {
            if (!valendo()) return;
            if (aoFalhar) {
              setAtivo(null);
              return aoFalhar();
            }
            cairNoPainel(t('A janela por cima de tudo não abriu. A legenda ficou flutuando nesta tela.'));
          },
        );
        return;
      }
      const c = controlador.current;
      if (caminho === 'video' && c) {
        /* O PiP de vídeo não tem o formato Estudo (não dá para tocar nas palavras). */
        const doVideo: Formato = f === 'estudo' ? 'legenda' : f;
        setFormato(doVideo);
        setPausaDoVideo(SEM_PAUSA);
        const pedido = c.abrir({
          aoPausar: (pausado, pelaJanela) => setPausaDoVideo({ pausado, pelaJanela }),
          aoSalvar: salvarUltimaFrase,
          aoSair: () => {
            if (!valendo()) return;
            setPausaDoVideo(SEM_PAUSA);
            setAtivo(null);
          },
        });
        setAtivo('video');
        pedido.then(
          () => {
            if (!valendo()) return void c.fechar();
            if (!silencioso)
              toast.info(t('Legendas por cima de tudo, só para ler. Para pausar, use o botão da própria janelinha.'));
          },
          () => {
            if (!valendo()) return;
            if (aoFalhar) {
              setAtivo(null);
              return aoFalhar();
            }
            cairNoPainel(t('A janelinha por cima de tudo não abriu. A legenda ficou flutuando nesta tela.'));
          },
        );
        return;
      }
      setAtivo('painel');
      if (!silencioso)
        toast.info(
          t('Legendas flutuantes abertas nesta tela: este navegador não deixa a janela ficar por cima de outros apps.'),
        );
    },
    [caminho, cairNoPainel, salvarUltimaFrase],
  );

  const aberta = ativo !== null;
  const alternar = useCallback(() => {
    if (aberta) {
      fechar();
      toast.info(t('Legendas flutuantes fechadas'));
    } else abrir();
  }, [aberta, abrir, fechar]);

  /* Alt+L, na página e dentro da janela. */
  const alternarRef = useRef(alternar);
  alternarRef.current = alternar;
  useEffect(() => {
    if (!o.ativo) return;
    const ouvinte = (e: KeyboardEvent) => {
      if (!eAtalhoDaLegenda(e) || e.repeat) return;
      e.preventDefault();
      alternarRef.current();
    };
    window.addEventListener('keydown', ouvinte);
    janela?.document.addEventListener('keydown', ouvinte);
    return () => {
      window.removeEventListener('keydown', ouvinte);
      janela?.document.removeEventListener('keydown', ouvinte);
    };
  }, [o.ativo, janela]);

  /* Guarda o tamanho que a pessoa deixou, por formato. */
  useEffect(() => {
    if (!janela) return;
    let relogio = 0;
    const aoRedimensionar = () => {
      window.clearTimeout(relogio);
      relogio = window.setTimeout(
        () => guardarTamanho(formatoRef.current, { largura: janela.innerWidth, altura: janela.innerHeight }),
        GUARDAR_TAMANHO_MS,
      );
    };
    janela.addEventListener('resize', aoRedimensionar);
    return () => {
      window.clearTimeout(relogio);
      janela.removeEventListener('resize', aoRedimensionar);
    };
  }, [janela]);

  /* ── O ASSISTENTE AO VIVO (Fase C2): na Document PiP inteiro; no PiP de vídeo, só a glosa desenhada. ── */
  const [pausaDaJanela, setPausaDaJanela] = useState(false);
  const assistente = useAssistenteAoVivo({
    aberta: o.ativo && ((ativo === 'documento' && !!janela) || ativo === 'video'),
    pausado: ativo === 'video' ? pausaDoVideo.pausado : pausaDaJanela,
    falas: o.falas,
    langDaPessoa: o.langDaPessoa || 'pt',
    soLeitura: caminho === 'video',
  });
  const { janela: doAssistente, recursos: recursosDoAssistente, glossario, paradoPorCota } = assistente;
  const abasDoAssistente: AbaDaJanela[] | undefined = useMemo(
    () =>
      recursosDoAssistente.algum
        ? [
            {
              id: 'assistente',
              rotulo: t('Assistente'),
              conteudo: (
                <AbaDoAssistente
                  itens={glossario}
                  recursos={recursosDoAssistente}
                  paradoPorCota={paradoPorCota}
                  aoSalvar={o.aoSalvarPalavra}
                  aoComoRespondo={() => doAssistente.pedirComoRespondo()}
                />
              ),
            },
          ]
        : undefined,
    [recursosDoAssistente, glossario, paradoPorCota, o.aoSalvarPalavra, doAssistente],
  );

  const trocarFormato = useCallback(
    (f: Formato) => {
      setFormato(f);
      formatoRef.current = f;
      if (janela) redimensionarJanela(janela, tamanhoParaAbrir(f, lerTamanhos()));
    },
    [janela],
  );

  const elemento: ReactNode = o.ativo ? (
    <>
      {caminho === 'documento' && (
        <DocumentPiP janela={janela} aoFechar={fechar} backgroundColor="#141210">
          <LegendasFlutuantes
            naJanela
            formatoInicial={formato}
            aoTrocarFormato={trocarFormato}
            falas={o.falas}
            aprendidas={o.aprendidas}
            aoRevelarTraducao={o.aoRevelarTraducao}
            aoConsultarPalavra={o.aoConsultarPalavra}
            aoOuvir={o.aoOuvir}
            aoSalvarPalavra={o.aoSalvarPalavra}
            aoFechar={fechar}
            abasExtras={abasDoAssistente}
            abaInicial={assistente.ajustes.abrirNaAba ? 'assistente' : undefined}
            assistente={doAssistente}
            aoMudarPausa={setPausaDaJanela}
          />
        </DocumentPiP>
      )}
      {caminho === 'video' && (
        <LegendaEmVideo
          aberta={ativo === 'video'}
          controlador={controlador.current}
          falas={o.falas}
          formato={formato}
          pausado={pausaDoVideo.pausado}
          seloDePausa={pausaDoVideo.pausado && !pausaDoVideo.pelaJanela}
          glosas={assistente.glosasDoVideo}
        />
      )}
      {/* O último recurso: a janelinha do protótipo, que se arrasta e se joga dentro da página. */}
      <LegendaFlutuanteDoPrototipo
        aberta={ativo === 'painel'}
        falas={o.falas}
        idiomaDaTraducao={o.idiomaDaTraducao}
        aoFechar={fechar}
      />
    </>
  ) : null;

  return { aberta, caminho, ativo, abrir, fechar, alternar, elemento, dica: dicaDoCaminho(caminho) };
}
