import { ArrowDown, Ellipsis, Square, Volume2 } from 'lucide-react';
import { memo, useEffect, useLayoutEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';

import type { MarcaNaLinha } from '../../../../core/assistente/telaDoAssistente';
import type { CorrecaoDaFala } from '../../../../data/apiDoAssistente';
import { aoMudarAudioDasFalas, falaTocando } from '../../../../lib/captura/audioDasFalas';
import { agruparEmBlocos, blocosDasFalas } from '../../../../lib/captura/blocosDasFalas';
import {
  ajusteDaRolagem,
  alturaDoBloco,
  alturaMediaDaFala,
  janelaDasFalas,
  type MedidaDoBloco,
} from '../../../../lib/captura/janelaDasFalas';
import type { SpeechSegment } from '../../../../lib/captura/tiposDaFala';
import { traducaoNaLegenda } from '../../../../lib/captura/traducaoDaFala';
import { palavrasDoPedaco } from '../../../../lib/captura/trechosTocaveis';
import { t } from '../../../../lib/i18n';
import { direcaoDoTexto } from '../../../../lib/languages';
import {
  entrarLinha,
  entrarPalavra,
  entrarTraducao,
  irAoFim,
  sairLinhaVazia,
  sairOriginal,
} from '../../../../lib/polimento/captura';
import { CorrecaoNaPagina } from '../assistente/AssistenteNaPagina';
import { marcaDoAlvo, TextoComMarcas, tituloDaMarca } from '../assistente/TextoComMarcas';

/** A esta distância do fim (px) a lista ainda conta como "no fim" e segue acompanhando. */
const FOLGA_DO_FIM = 80;

/** O `gap` da coluna de falas (`capturaNoCelular.css`) antes de a lista ser medida. */
const ESPACO_ENTRE_FALAS = 10;

/** O navegador ancora a rolagem sozinho quando o que está acima muda de altura (Chrome, Firefox). */
const ancoraNativa = () =>
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('overflow-anchor', 'auto');

/** O que a janela sabe da área visível da lista: atualizado na rolagem e quando a lista muda de tamanho. */
interface Vista {
  rolagem: number;
  visivel: number;
  largura: number;
  /** O `padding-top` da lista: o primeiro bloco começa abaixo dele. */
  margem: number;
  espaco: number;
}

/**
 * Uma palavra da fala que ainda está chegando: entra desfocada e assenta (`telas.js:131-134`).
 * `texto` já traz o espaço de depois, quando a escrita tem espaço entre as palavras.
 */
function Palavra({
  texto,
  anima,
  marca,
  indice,
}: {
  texto: string;
  anima: boolean;
  /** A marca do assistente que cai nesta palavra (Fase C3): só atributos, a palavra é a mesma. */
  marca?: MarcaNaLinha;
  indice?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (anima && ref.current) entrarPalavra(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na chegada da palavra
  }, []);
  return (
    <span
      ref={ref}
      className={marca ? 'asst-marca' : undefined}
      data-marca={marca?.tipo}
      data-marca-i={marca ? indice : undefined}
      title={marca ? tituloDaMarca(marca) : undefined}
    >
      {texto}
    </span>
  );
}

/** As palavras de uma fala que ainda está só no original, cada uma com a marca que cai nela (se houver). */
function marcasDasPalavras(original: string, palavras: string[], marcas: ReadonlyArray<MarcaNaLinha> | undefined) {
  if (!marcas?.length) return null;
  let cursor = 0;
  return palavras.map((p) => {
    const limpa = p.trim();
    const ini = original.indexOf(limpa, cursor);
    if (ini < 0) return -1;
    cursor = ini + limpa.length;
    const nucleo = /[\p{L}\p{N}][\s\S]*[\p{L}\p{N}]|[\p{L}\p{N}]/u.exec(limpa);
    const a = ini + (nucleo?.index ?? 0);
    const b = a + (nucleo?.[0].length ?? limpa.length);
    return marcas.findIndex((m) => a < m.fim && m.inicio < b);
  });
}

/**
 * UMA FALA — `proximaFala()` de `telas.js:111-160`. Enquanto só há o original, ele ocupa a linha
 * grande e chega palavra por palavra. Quando a tradução chega, a original sobe para a linha pequena
 * (`.q-o`) e a tradução assume a grande (`.q-t`).
 *
 * A LINHA NASCE COM A FALA, não com o texto (o protótipo encena e sempre tem texto; a captura real
 * não): aberta e ainda sem texto, ela é a linha de ESCUTA, com os três pontos da tela no lugar da
 * linha grande. O primeiro texto entra NELA; se a fala acabar vazia (ruído), ela sai apagando.
 */
const Linha = memo(function Linha({
  id,
  hora,
  original,
  traducao,
  provisoria,
  lang,
  langDaTraducao,
  atual,
  escolhida,
  nova,
  tocando,
  aoTocar,
  aoOuvir,
  aoPararAudio,
  aoMudar,
  comMarcas = false,
  marcas,
  correcao,
  aoTocarMarca,
}: {
  id: string;
  hora: string;
  original: string;
  traducao: string;
  /** A tradução na tela ainda é a do parcial: quando a do final a troca, entra com a animação. */
  provisoria: boolean;
  lang: string;
  langDaTraducao?: string;
  atual: boolean;
  /** O painel da frase está aberto nesta fala: ela fica marcada. */
  escolhida: boolean;
  /** Chegou com a tela já aberta: entra animada. */
  nova: boolean;
  tocando: boolean;
  aoTocar: (id: string) => void;
  aoOuvir?: (id: string) => void;
  aoPararAudio?: () => void;
  /** O texto mudou de tamanho: a lista acompanha o fim. */
  aoMudar: () => void;
  /**
   * O ASSISTENTE AO VIVO está nesta tela (Fase C3): o original já nasce em pedaços, e as marcas que chegarem depois
   * só mudam atributos — nada novo para a região `aria-live` anunciar.
   */
  comMarcas?: boolean;
  /** As marcas desta fala (o MESMO array enquanto nada muda: o `memo` segura a linha). */
  marcas?: MarcaNaLinha[];
  /** A correção gentil da própria fala (opt-in). */
  correcao?: CorrecaoDaFala;
  /** Tocou numa palavra marcada: abre o cartão da palavra com o sentido. */
  aoTocarMarca?: (id: string, marca: MarcaNaLinha) => void;
}) {
  const linha = useRef<HTMLDivElement>(null);
  const alvo = useRef<HTMLSpanElement>(null);
  const pequena = useRef<HTMLSpanElement>(null);
  /* A tradução que está NA TELA: fica um instante atrás da que chegou, o tempo de a original sair. */
  const [mostrada, setMostrada] = useState(traducao);
  /* O que acabou de trocar na linha grande: a tradução assumiu (`entrada`), ou a do final tomou o
     lugar da parcial (`final`: só ela entra de novo, a original já está na linha pequena). */
  const trocou = useRef<'entrada' | 'final' | null>(null);
  /* A tradução que está na tela é a do parcial. */
  const parcialNaTela = useRef(provisoria);

  /* Um pedaço por espaço, com o espaço depois. Em chinês e japonês não há espaço: o pedaço chega
     partido nas palavras dele (`palavrasDoPedaco`), coladas como na escrita. */
  const palavras = original
    .split(' ')
    .filter(Boolean)
    .flatMap((pedaco) => {
      const partes = palavrasDoPedaco(pedaco, lang);
      return partes.map((p, i) => (i === partes.length - 1 ? `${p} ` : p));
    });
  const indicesDasMarcas = marcasDasPalavras(original, palavras, marcas);
  /* A fala abriu e nada chegou ainda: a linha de escuta. */
  const ouvindo = !mostrada && !traducao && palavras.length === 0;
  const aindaOuvindo = useRef(ouvindo);
  aindaOuvindo.current = ouvindo;

  useLayoutEffect(() => {
    const el = linha.current;
    if (nova && el) entrarLinha(el);
    /* A linha saiu ainda em escuta (ruído, silêncio): apaga em vez de sumir de uma vez. */
    return () => {
      if (aindaOuvindo.current && el) sairLinhaVazia(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na chegada e na saída da linha
  }, []);

  useEffect(() => {
    if (traducao === mostrada) {
      parcialNaTela.current = provisoria;
      return;
    }
    /* Tradução corrigida depois (a Nuance, a retradução): troca direto, sem refazer a entrada. A do
       FINAL no lugar da parcial é a troca da fala: uma só, com a entrada da tradução. */
    if (mostrada || !alvo.current) {
      if (mostrada && traducao && parcialNaTela.current && !provisoria) trocou.current = 'final';
      parcialNaTela.current = provisoria;
      setMostrada(traducao);
      return;
    }
    let vivo = true;
    void sairOriginal(alvo.current).then(() => {
      if (!vivo) return;
      trocou.current = 'entrada';
      parcialNaTela.current = provisoria;
      setMostrada(traducao);
    });
    return () => {
      vivo = false;
    };
  }, [traducao, mostrada, provisoria]);

  useLayoutEffect(() => {
    const troca = trocou.current;
    if (!troca || !alvo.current) return;
    trocou.current = null;
    entrarTraducao(alvo.current, troca === 'entrada' ? pequena.current : null);
    aoMudar();
  }, [mostrada, aoMudar]);

  useLayoutEffect(() => aoMudar(), [palavras.length, aoMudar]);

  return (
    <div
      ref={linha}
      className={atual ? 'q-linha-da-fala atual' : 'q-linha-da-fala'}
      data-fala={id}
      data-ouvindo={ouvindo ? '' : undefined}
    >
      <button
        type="button"
        className="q-fala"
        aria-disabled={ouvindo || undefined}
        aria-current={escolhida ? 'true' : undefined}
        data-frase-escolhida={escolhida ? '' : undefined}
        onClick={(e) => {
          if (ouvindo) return;
          const marca = aoTocarMarca ? marcaDoAlvo(e.target, marcas) : undefined;
          if (marca && aoTocarMarca) aoTocarMarca(id, marca);
          else aoTocar(id);
        }}
      >
        <span className="q-meta">
          <span className="tn">{hora}</span>
        </span>
        {mostrada && original && (
          <span className="q-o" lang={lang} dir={direcaoDoTexto(lang)} ref={pequena}>
            {comMarcas ? <TextoComMarcas texto={original} lang={lang} marcas={marcas} /> : original}
          </span>
        )}
        {mostrada ? (
          <span
            className="q-t"
            lang={langDaTraducao}
            dir={langDaTraducao ? direcaoDoTexto(langDaTraducao) : undefined}
            ref={alvo}
          >
            {mostrada}
          </span>
        ) : ouvindo ? (
          /* Os mesmos três pontos de "Transcrevendo…", no lugar do texto que ainda não chegou. */
          <span className="q-pontos" role="img" aria-label={t('Ouvindo…')}>
            <i />
            <i />
            <i />
          </span>
        ) : (
          <span className="q-t" lang={lang} dir={direcaoDoTexto(lang)} ref={alvo}>
            {palavras.map((p, i) => {
              const k = indicesDasMarcas?.[i] ?? -1;
              return <Palavra key={i} texto={p} anima={nova} marca={k >= 0 ? marcas?.[k] : undefined} indice={k} />;
            })}
          </span>
        )}
        <CorrecaoNaPagina correcao={correcao} lang={lang} />
      </button>
      {/* Na escuta os botões guardam o lugar (a linha não muda de tamanho quando o texto chega), sem aparecer. */}
      <div className="q-acoes-da-fala" style={ouvindo ? { visibility: 'hidden' } : undefined}>
        {aoOuvir && (
          <button
            type="button"
            className="q-ctl"
            data-sfx="none"
            aria-label={tocando ? t('Parar o áudio') : t('Ouvir de novo')}
            onClick={() => (tocando ? aoPararAudio?.() : aoOuvir(id))}
          >
            {tocando ? <Square aria-hidden /> : <Volume2 aria-hidden />}
          </button>
        )}
        <button type="button" className="q-ctl" aria-label={t('Opções da fala')} onClick={() => aoTocar(id)}>
          <Ellipsis aria-hidden />
        </button>
      </div>
    </div>
  );
});

type BlocoDaLista = { bloco: number; falas: SpeechSegment[] };

/** A janela da lista com o que a tela sabe agora: as medidas dos blocos e a área visível. */
function montarJanela(
  blocos: readonly BlocoDaLista[],
  medidas: ReadonlyMap<number, MedidaDoBloco>,
  v: Vista,
  noFim: boolean,
  fixos: readonly number[],
) {
  const porFala = alturaMediaDaFala(medidas.values(), v.espaco);
  const alturas = blocos.map((g) => alturaDoBloco(medidas.get(g.bloco), g.falas.length, porFala, v.espaco));
  /* Antes da primeira medida (ou sem layout), a área visível é a da janela do navegador. */
  const visivel = v.visivel > 0 ? v.visivel : typeof window !== 'undefined' ? window.innerHeight : 800;
  return janelaDasFalas({
    alturas,
    espaco: v.espaco,
    topo: noFim ? null : Math.max(0, v.rolagem - v.margem),
    visivel,
    folga: Math.max(600, visivel),
    fixos,
  });
}

/** Quais blocos uma janela monta, como texto: duas janelas com a mesma chave desenham a mesma lista. */
const chaveDaJanela = (pedacos: ReturnType<typeof janelaDasFalas>, blocos: readonly BlocoDaLista[]) =>
  pedacos.map((p) => (p.tipo === 'bloco' ? blocos[p.i].bloco : '_')).join(',');

/** O que a legenda da página recebe do assistente ao vivo (Fase C3). */
export interface AssistenteNaLegenda {
  marcas: ReadonlyMap<string, MarcaNaLinha[]>;
  correcoes: ReadonlyMap<string, CorrecaoDaFala>;
  aoTocarMarca?: (fala: SpeechSegment, marca: MarcaNaLinha, lang: string) => void;
}

/**
 * A LEGENDA AO VIVO NO DESENHO NOVO — a marcação e o movimento do protótipo de polimento
 * (`telas.js:78-160`, `telas.css:11-20`; itens D11 e D12 de `fidelidade/casca-e-telas.md`).
 *
 * O protótipo encena a fala com um roteiro; aqui as falas são as REAIS da captura: a palavra entra
 * quando o reconhecimento a entrega e a tradução assume a linha quando chega.
 *
 * A lista acompanha o fim sozinha. Se a pessoa rolar para cima para reler, ela para de acompanhar e
 * aparece "Ir para a fala atual" (isso o protótipo não tem: lá ninguém relê no meio da fala).
 *
 * A SESSÃO LONGA (26/10/2026): só os blocos de falas perto da área visível ficam no DOM
 * (`lib/captura/janelaDasFalas`); os outros viram um vão com a altura medida (ou estimada) deles. Com 600 falas
 * a árvore de acessibilidade da página caiu de ~40 s para ~0,5 s (CPU 4×, `scripts/perf/telas/legenda-longa.mjs`).
 * O que a janela preserva e o que ela troca:
 *  - acompanhar ao vivo e parar quando a pessoa rola para cima: como antes; a rolagem nossa a caminho do fim
 *    (que fica mais longe quando a primeira medida corrige a estimativa) não conta como a pessoa saindo dele;
 *  - a rolagem não pula quando um bloco acima é medido: o navegador ancora (`overflow-anchor`); no Safari, sem
 *    âncora, a lista corrige ela mesma (`ajusteDaRolagem`);
 *  - o bloco da fala com foco, da escolhida (o painel aberto) e da que está tocando nunca sai: o foco não cai no
 *    vazio e o Esc do painel tem para onde devolvê-lo;
 *  - a região `aria-live` é a mesma; o bloco que VOLTA para a janela entra com `aria-live="off"` (não são falas
 *    novas) e sem refazer a entrada animada. Uma tradução que chegar tarde numa fala desse bloco também não é
 *    anunciada — é uma fala que a pessoa já rolou para longe;
 *  - BUSCA DA PÁGINA (Ctrl+F): só acha o que está montado (a área visível e a folga); é a troca que a janela faz.
 *    A sessão inteira fica na Biblioteca depois de salva. Nada lê a legenda do DOM: salvar usa as falas do estado.
 *
 * Só apresentação: recebe as falas prontas da `LiveCapture`. O tamanho vem da faixa (A− / A+).
 */
export default function HistoricoDoPrototipo({
  falas,
  escala,
  idiomaPadrao,
  idiomaDaTraducao,
  aoTocar,
  aoOuvir,
  aoPararAudio,
  escolhida,
  assistente,
}: {
  falas: readonly SpeechSegment[];
  /** Multiplicador do tamanho do texto (0,75 a 2), escolhido na faixa. */
  escala: number;
  /** Idioma das falas que não trazem o próprio (o do conteúdo). */
  idiomaPadrao: string;
  /** O idioma da tradução de uma fala (o "outro" do par). */
  idiomaDaTraducao?: (lang: string) => string | undefined;
  /** Abre a folha da frase. */
  aoTocar: (fala: SpeechSegment, lang: string) => void;
  /** "Ouvir de novo": o áudio real da fala onde foi guardado, ou a voz de leitura. */
  aoOuvir?: (fala: SpeechSegment, lang: string) => void;
  aoPararAudio?: () => void;
  /** O id da fala em que o painel da frase está aberto: ela fica marcada (`aria-current`). */
  escolhida?: string | null;
  /**
   * O ASSISTENTE AO VIVO na legenda da página (Fase C3): as marcas silenciosas (sublinhado pontilhado, sentido no
   * `title` e no cartão da palavra), a correção da própria fala. A instância é a mesma da janela flutuante.
   */
  assistente?: AssistenteNaLegenda;
}) {
  /* "…" é só o marcador de tradução a caminho: sozinho, não é texto para mostrar (e enquanto a do
     final não chega, fica a parcial que a linha já tinha: `traducaoNaLegenda`). */
  const temTexto = (f: SpeechSegment) => !!(f.originalText.trim() || traducaoNaLegenda(f).texto);
  /* A fala aberta e ainda sem texto também é linha: a de escuta. Vazia e fechada não existe. */
  const comTexto = falas.filter((f) => temTexto(f) || f.isPartial);
  /* O reconhecimento ainda refina uma fala que já tem texto. A que não tem mostra os pontos nela mesma. */
  const transcrevendo = falas.some((f) => f.isPartial && temTexto(f));
  const atual = comTexto[comTexto.length - 1];
  const tocando = useSyncExternalStore(aoMudarAudioDasFalas, falaTocando, () => null);
  const lista = useRef<HTMLDivElement>(null);
  const noFim = useRef(true);
  const [longeDoFim, setLongeDoFim] = useState(false);
  /* As falas que já estavam na tela quando ela abriu não refazem a entrada. */
  const [deAntes] = useState(() => new Set(comTexto.map((f) => f.id)));

  const porId = useRef(new Map<string, SpeechSegment>());
  porId.current = new Map(comTexto.map((f) => [f.id, f]));
  /* AS FALAS EM BLOCOS (`lib/captura/blocosDasFalas`): a lista longa deixa de ter um filho por fala, e o
     navegador pula de uma vez o bloco que está fora da tela. A fala guarda o bloco em que nasceu: trocar
     de bloco seria trocar de pai, e a linha remontaria no meio da leitura. */
  const blocoDaFala = useRef<Map<string, number>>(new Map());
  blocoDaFala.current = blocosDasFalas(
    comTexto.map((f) => f.id),
    blocoDaFala.current,
  );
  const blocos: BlocoDaLista[] = agruparEmBlocos(comTexto, blocoDaFala.current);
  /* O último bloco aberto continua na lista mesmo vazio (sem tamanho: `:empty` no CSS). A linha de escuta
     que acaba sem texto sai apagando DENTRO do pai dela (`sairLinhaVazia`); se ela era a única do bloco e
     o bloco saísse junto, sumiria de uma vez. */
  const blocoAberto = useRef(-1);
  for (const g of blocos) if (g.bloco > blocoAberto.current) blocoAberto.current = g.bloco;
  if (blocoAberto.current >= 0 && (blocos[blocos.length - 1]?.bloco ?? -1) < blocoAberto.current)
    blocos.push({ bloco: blocoAberto.current, falas: [] });

  /* A JANELA (`lib/captura/janelaDasFalas`): só os blocos perto da área visível ficam no DOM; os outros viram um
     vão com a altura deles. A conta é refeita a cada desenho; a rolagem e as medidas só pedem um desenho novo
     quando o conjunto de blocos montados muda. */
  const medidas = useRef(new Map<number, MedidaDoBloco>());
  const vista = useRef<Vista>({ rolagem: 0, visivel: 0, largura: 0, margem: 0, espaco: ESPACO_ENTRE_FALAS });
  const [, redesenhar] = useReducer((x: number) => x + 1, 0);
  /* A última fala que recebeu foco: o bloco dela fica, para o foco não cair no vazio nem ter para onde voltar. */
  const focada = useRef<string | null>(null);
  /* As falas cujo bloco já saiu da janela: quando ele volta, elas não refazem a entrada animada. */
  const semEntrada = useRef(new Set<string>());
  /* Os blocos que já ficaram fora da janela: quando voltam, entram calados (`aria-live="off"`) — não são falas
     novas, e a região viva só anuncia as novas. */
  const calados = useRef(new Set<number>());
  const montados = useRef(new Set<number>());
  const indiceDoBloco = (id: string | null | undefined) => {
    const b = id ? blocoDaFala.current.get(id) : undefined;
    return b === undefined ? -1 : blocos.findIndex((g) => g.bloco === b);
  };
  const fixosDaJanela = [indiceDoBloco(escolhida), indiceDoBloco(tocando), indiceDoBloco(focada.current)];
  const pedacos = montarJanela(blocos, medidas.current, vista.current, noFim.current, fixosDaJanela);
  montados.current = new Set();
  for (const p of pedacos) {
    if (p.tipo === 'bloco') {
      montados.current.add(blocos[p.i].bloco);
      continue;
    }
    for (let i = p.de; i <= p.ate; i++) {
      calados.current.add(blocos[i].bloco);
      for (const f of blocos[i].falas) semEntrada.current.add(f.id);
    }
  }
  const janela = useRef({ blocos, fixos: fixosDaJanela, chave: '' });
  janela.current = { blocos, fixos: fixosDaJanela, chave: chaveDaJanela(pedacos, blocos) };
  const tocar = useRef(aoTocar);
  tocar.current = aoTocar;
  const ouvir = useRef(aoOuvir);
  ouvir.current = aoOuvir;
  const tocarMarca = useRef(assistente?.aoTocarMarca);
  tocarMarca.current = assistente?.aoTocarMarca;
  const padrao = useRef(idiomaPadrao);
  padrao.current = idiomaPadrao;
  const [fixos] = useState(() => ({
    tocar: (id: string) => {
      const f = porId.current.get(id);
      if (f) tocar.current(f, f.lang ?? padrao.current);
    },
    ouvir: (id: string) => {
      const f = porId.current.get(id);
      if (f) ouvir.current?.(f, f.lang ?? padrao.current);
    },
    tocarMarca: (id: string, m: MarcaNaLinha) => {
      const f = porId.current.get(id);
      if (f) tocarMarca.current?.(f, m, f.lang ?? padrao.current);
    },
    seguir: () => {
      if (noFim.current) fixos.irAoFim();
    },
    /**
     * A ROLAGEM NOSSA A CAMINHO DO FIM. Enquanto ela anda (a rolagem suave leva alguns quadros), a lista ainda não
     * está no fim, e isso não é a pessoa saindo dele; e se o fim se afasta no caminho (um bloco medido maior que a
     * estimativa, o vão de cima recalculado), ela é refeita até o fim novo. Termina ao chegar, quando a pessoa mexe
     * na lista (roda, toque, tecla, barra de rolagem, foco) ou, por garantia, num prazo.
     */
    indoAoFim: false,
    prazoDaIda: 0,
    irAoFim: () => {
      if (!lista.current) return;
      fixos.indoAoFim = true;
      fixos.prazoDaIda = performance.now() + 1500;
      irAoFim(lista.current);
    },
    soltar: () => {
      fixos.indoAoFim = false;
    },
    /** A janela de agora monta outros blocos que a do último desenho? Então desenha de novo. */
    conferir: () => {
      const j = janela.current;
      const p = montarJanela(j.blocos, medidas.current, vista.current, noFim.current, j.fixos);
      if (chaveDaJanela(p, j.blocos) !== j.chave) redesenhar();
    },
    /** O tamanho da lista (área visível, largura, margem e espaço da coluna). */
    medirVista: () => {
      const el = lista.current;
      if (!el) return;
      const estilo = getComputedStyle(el);
      const largura = el.clientWidth;
      /* Mudou a largura: as linhas quebram em outro lugar, e a medida de um bloco fora da tela não vale mais. */
      if (vista.current.largura && largura !== vista.current.largura) fixos.esquecerForaDaTela();
      vista.current = {
        rolagem: el.scrollTop,
        visivel: el.clientHeight,
        largura,
        margem: parseFloat(estilo.paddingTop) || 0,
        espaco: parseFloat(estilo.rowGap) || ESPACO_ENTRE_FALAS,
      };
    },
    esquecerForaDaTela: () => {
      for (const b of [...medidas.current.keys()]) if (!montados.current.has(b)) medidas.current.delete(b);
    },
    /** Um observador só, para a lista e para cada bloco montado. */
    observador: null as ResizeObserver | null,
    observar: (el: HTMLElement | null) => {
      if (!el || typeof ResizeObserver === 'undefined') return;
      fixos.observador ??= new ResizeObserver((entradas) => fixos.aoMedir(entradas));
      const obs = fixos.observador;
      obs.observe(el);
      return () => obs.unobserve(el);
    },
    aoMedir: (entradas: ResizeObserverEntry[]) => {
      const l = lista.current;
      let mudou = false;
      for (const e of entradas) {
        const alvo = e.target as HTMLElement;
        if (alvo === l) {
          fixos.medirVista();
          mudou = true;
          continue;
        }
        if (!alvo.isConnected) continue;
        const falas = alvo.querySelectorAll(':scope > [data-fala]').length;
        if (!falas) continue;
        const b = Number(alvo.dataset.bloco);
        const altura = e.borderBoxSize?.[0]?.blockSize ?? alvo.getBoundingClientRect().height;
        const antes = medidas.current.get(b);
        medidas.current.set(b, { altura, falas });
        if (antes?.altura === altura) continue;
        mudou = true;
        /* Sem âncora do navegador (Safari): o bloco que cresceu ou encolheu INTEIRO acima do que a pessoa lê
           empurraria a leitura; a rolagem anda a mesma diferença. */
        if (antes && l && !noFim.current && !ancoraNativa()) {
          const topoDoBloco = alvo.getBoundingClientRect().top - l.getBoundingClientRect().top + l.scrollTop;
          const ajuste = ajusteDaRolagem(topoDoBloco, antes.altura, altura, l.scrollTop);
          if (ajuste) l.scrollTop += ajuste;
        }
      }
      if (!mudou) return;
      fixos.conferir();
      fixos.seguir();
    },
    quadro: 0,
    /** A rolagem confere a janela uma vez por quadro, não a cada evento. */
    agendar: () => {
      if (fixos.quadro || typeof requestAnimationFrame === 'undefined') return;
      fixos.quadro = requestAnimationFrame(() => {
        fixos.quadro = 0;
        fixos.conferir();
      });
    },
  }));
  useLayoutEffect(() => {
    fixos.medirVista();
    if (lista.current) fixos.observar(lista.current);
    fixos.conferir();
    return () => {
      fixos.observador?.disconnect();
      fixos.observador = null;
      if (fixos.quadro) cancelAnimationFrame(fixos.quadro);
      fixos.quadro = 0;
    };
  }, [fixos]);
  /* Outro tamanho de letra: as medidas de fora da tela não valem mais (as de dentro o observador refaz). */
  const escalaMedida = useRef(escala);
  useEffect(() => {
    if (escalaMedida.current === escala) return;
    escalaMedida.current = escala;
    fixos.esquecerForaDaTela();
    fixos.conferir();
  }, [escala, fixos]);

  const irParaOFim = () => {
    if (!lista.current) return;
    fixos.irAoFim();
    noFim.current = true;
    setLongeDoFim(false);
    fixos.conferir();
  };
  const aoRolar = () => {
    const el = lista.current;
    if (!el) return;
    vista.current.rolagem = el.scrollTop;
    fixos.agendar();
    const chegou = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLGA_DO_FIM;
    if (chegou || performance.now() > fixos.prazoDaIda) fixos.soltar();
    /* A caminho do fim pela rolagem nossa: ainda acompanhando. */
    if (fixos.indoAoFim) return;
    noFim.current = chegou;
    setLongeDoFim(!noFim.current);
  };
  /* O foco numa fala prende o bloco dela na janela (o desenho que vem depois já o conta). */
  const aoFocar = (e: React.FocusEvent) => {
    fixos.soltar();
    const id = (e.target as Element).closest?.('[data-fala]')?.getAttribute('data-fala') ?? null;
    if (id && id !== focada.current) focada.current = id;
  };
  useLayoutEffect(() => fixos.seguir(), [comTexto.length, transcrevendo, escala, fixos]);
  /* Os vãos mudaram de altura (a estimativa melhorou com a primeira medida): o fim se afastou, e quem
     acompanha vai até o fim novo. */
  const alturaDosVaos = pedacos.map((p) => (p.tipo === 'vao' ? Math.round(p.altura) : '')).join(',');
  useLayoutEffect(() => fixos.seguir(), [alturaDosVaos, fixos]);
  useEffect(() => {
    if (!noFim.current) setLongeDoFim(true);
  }, [comTexto.length]);

  return (
    <div className="q-leg" style={{ '--q-escala': escala } as React.CSSProperties}>
      <div
        className="q-historico"
        ref={lista}
        onScroll={aoRolar}
        onFocus={aoFocar}
        onWheel={fixos.soltar}
        onTouchStart={fixos.soltar}
        onKeyDown={fixos.soltar}
        onPointerDown={(e) => e.target === e.currentTarget && fixos.soltar()}
        aria-live="polite"
      >
        {comTexto.length === 0 && <p className="q-espera">{t('Ouvindo… a legenda aparece aqui.')}</p>}
        {pedacos.map((p) => {
          if (p.tipo === 'vao')
            return (
              <div
                key={`vao-${blocos[p.de].bloco}`}
                className="q-vao-das-falas"
                aria-hidden="true"
                style={{ height: p.altura }}
              />
            );
          const grupo = blocos[p.i];
          /* O último bloco é o que está recebendo falas (sempre montado); os de antes são `antigo`. O bloco observado
             dá à janela a altura dele; o que volta para a janela entra calado para a região viva. */
          return (
            <div
              key={grupo.bloco}
              ref={fixos.observar}
              data-bloco={grupo.bloco}
              aria-live={calados.current.has(grupo.bloco) ? 'off' : undefined}
              className={p.i === blocos.length - 1 ? 'q-bloco-de-falas' : 'q-bloco-de-falas antigo'}
            >
              {grupo.falas.map((fala) => {
                const lang = fala.lang ?? idiomaPadrao;
                const traducao = traducaoNaLegenda(fala);
                return (
                  <Linha
                    key={fala.id}
                    id={fala.id}
                    hora={fala.timestamp}
                    original={fala.originalText.trim()}
                    traducao={traducao.texto}
                    provisoria={traducao.provisoria || !!fala.isPartial}
                    lang={lang}
                    langDaTraducao={idiomaDaTraducao?.(lang)}
                    atual={fala === atual}
                    escolhida={fala.id === escolhida}
                    nova={!deAntes.has(fala.id) && !semEntrada.current.has(fala.id)}
                    tocando={tocando === fala.id}
                    aoTocar={fixos.tocar}
                    aoOuvir={aoOuvir ? fixos.ouvir : undefined}
                    aoPararAudio={aoPararAudio}
                    aoMudar={fixos.seguir}
                    comMarcas={!!assistente}
                    marcas={assistente?.marcas.get(fala.id)}
                    correcao={assistente?.correcoes.get(fala.id)}
                    aoTocarMarca={assistente?.aoTocarMarca ? fixos.tocarMarca : undefined}
                  />
                );
              })}
            </div>
          );
        })}
        {transcrevendo && (
          <p className="q-transcrevendo">
            <span className="q-pontos">
              <i />
              <i />
              <i />
            </span>
            {t('Transcrevendo…')}
          </p>
        )}
      </div>
      {longeDoFim && (
        <button type="button" className="q-ctl q-ir-para-o-fim" onClick={irParaOFim}>
          <ArrowDown aria-hidden /> {t('Ir para a fala atual')}
        </button>
      )}
    </div>
  );
}
