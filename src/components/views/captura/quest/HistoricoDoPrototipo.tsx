import { ArrowDown, Ellipsis, Square, Volume2 } from 'lucide-react';
import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import { aoMudarAudioDasFalas, falaTocando } from '../../../../lib/captura/audioDasFalas';
import type { SpeechSegment } from '../../../../lib/captura/tiposDaFala';
import { traducaoNaLegenda } from '../../../../lib/captura/traducaoDaFala';
import { t } from '../../../../lib/i18n';
import {
  entrarLinha,
  entrarPalavra,
  entrarTraducao,
  irAoFim,
  sairLinhaVazia,
  sairOriginal,
} from '../../../../lib/polimento/captura';

/** A esta distância do fim (px) a lista ainda conta como "no fim" e segue acompanhando. */
const FOLGA_DO_FIM = 80;

/** Uma palavra da fala que ainda está chegando: entra desfocada e assenta (`telas.js:131-134`). */
function Palavra({ texto, anima }: { texto: string; anima: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (anima && ref.current) entrarPalavra(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na chegada da palavra
  }, []);
  return <span ref={ref}>{texto} </span>;
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
  nova,
  tocando,
  aoTocar,
  aoOuvir,
  aoPararAudio,
  aoMudar,
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
  /** Chegou com a tela já aberta: entra animada. */
  nova: boolean;
  tocando: boolean;
  aoTocar: (id: string) => void;
  aoOuvir?: (id: string) => void;
  aoPararAudio?: () => void;
  /** O texto mudou de tamanho: a lista acompanha o fim. */
  aoMudar: () => void;
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

  const palavras = original.split(' ').filter(Boolean);
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
        onClick={() => !ouvindo && aoTocar(id)}
      >
        <span className="q-meta">
          <span className="tn">{hora}</span>
        </span>
        {mostrada && original && (
          <span className="q-o" lang={lang} ref={pequena}>
            {original}
          </span>
        )}
        {mostrada ? (
          <span className="q-t" lang={langDaTraducao} ref={alvo}>
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
          <span className="q-t" lang={lang} ref={alvo}>
            {palavras.map((p, i) => (
              <Palavra key={i} texto={p} anima={nova} />
            ))}
          </span>
        )}
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
  const tocar = useRef(aoTocar);
  tocar.current = aoTocar;
  const ouvir = useRef(aoOuvir);
  ouvir.current = aoOuvir;
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
    seguir: () => {
      if (noFim.current && lista.current) irAoFim(lista.current);
    },
  }));

  const irParaOFim = () => {
    if (!lista.current) return;
    irAoFim(lista.current);
    noFim.current = true;
    setLongeDoFim(false);
  };
  const aoRolar = () => {
    const el = lista.current;
    if (!el) return;
    noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLGA_DO_FIM;
    setLongeDoFim(!noFim.current);
  };
  useLayoutEffect(() => fixos.seguir(), [comTexto.length, transcrevendo, escala, fixos]);
  useEffect(() => {
    if (!noFim.current) setLongeDoFim(true);
  }, [comTexto.length]);

  return (
    <div className="q-leg" style={{ '--q-escala': escala } as React.CSSProperties}>
      <div className="q-historico" ref={lista} onScroll={aoRolar} aria-live="polite">
        {comTexto.length === 0 && <p className="q-espera">{t('Ouvindo… a legenda aparece aqui.')}</p>}
        {comTexto.map((fala) => {
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
              nova={!deAntes.has(fala.id)}
              tocando={tocando === fala.id}
              aoTocar={fixos.tocar}
              aoOuvir={aoOuvir ? fixos.ouvir : undefined}
              aoPararAudio={aoPararAudio}
              aoMudar={fixos.seguir}
            />
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
