import { ArrowDown, Headphones, Mic, MoreHorizontal, Square, Volume2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import { aoMudarAudioDasFalas, falaTocando } from '../../../../lib/captura/audioDasFalas';
import type { SpeechSegment } from '../../../../lib/captura/tiposDaFala';
import { t } from '../../../../lib/i18n';

/** A esta distância do fim (px) a lista ainda conta como "no fim" e segue acompanhando. */
const FOLGA_DO_FIM = 80;

/**
 * A LEGENDA AO VIVO NO QUEST — a maquete de 01/10/2026 (tela 2), revista pelo dono no mesmo dia.
 *
 * A primeira versão mostrava só as duas últimas falas e o resto sumia. No uso de verdade isso tira o
 * acompanhamento: a pessoa quer voltar duas frases, ouvir de novo, guardar uma palavra. Agora é o
 * HISTÓRICO inteiro, rolável, com a fala atual em destaque (tradução grande, original acima) e as
 * anteriores menores, mas legíveis.
 *
 * Cada fala traz as ações à vista, como alvos de 56 px: "Ouvir" (o áudio REAL da fala, quando foi
 * guardado; o headset não tem voz de leitura) e "Opções" (a folha da frase: devagar, tradução, palavras,
 * copiar). Tocar no texto abre a mesma folha.
 *
 * OS DETALHES QUE DIZEM O QUE ESTÁ ACONTECENDO, sem a pessoa ter de adivinhar:
 *   · a hora de cada fala e, com as duas fontes ligadas, DE QUEM ela é (você, ou o som do headset);
 *   · "Transcrevendo…" enquanto uma fala que acabou ainda não virou texto (os segundos de espera);
 *   · o botão Ouvir vira "parar" enquanto aquela fala toca.
 *
 * A lista acompanha o fim sozinha. Se a pessoa rolar para cima para reler, ela para de acompanhar e
 * aparece "Ir para a fala atual".
 *
 * Só apresentação: recebe as falas prontas da `LiveCapture`. O tamanho vem da faixa (A− / A+).
 */
export default function LegendaAoVivoDoQuest({
  falas,
  escala,
  idiomaPadrao,
  aoTocar,
  temAudio,
  aoOuvir,
  aoPararAudio,
  mostrarFonte = false,
}: {
  falas: readonly SpeechSegment[];
  /** Multiplicador do tamanho do texto (0,75 a 2), escolhido na faixa. */
  escala: number;
  /** Idioma das falas que não trazem o próprio (o do conteúdo). */
  idiomaPadrao: string;
  /** Abre as opções da fala (a folha da frase). */
  aoTocar: (fala: SpeechSegment, lang: string) => void;
  /** Há áudio real guardado desta fala? Sem ele, o botão "Ouvir" não aparece. */
  temAudio?: (id: string) => boolean;
  /** Toca de novo o áudio real da fala. */
  aoOuvir?: (fala: SpeechSegment) => void;
  /** Para o áudio que está tocando. */
  aoPararAudio?: () => void;
  /** As duas fontes estão ligadas: cada fala diz de quem é (você, ou o som do headset). */
  mostrarFonte?: boolean;
}) {
  /* "…" é só o marcador de tradução a caminho: sozinho, não é texto para mostrar. */
  const traducaoDe = (f: SpeechSegment) => (f.translatedText.trim() === '…' ? '' : f.translatedText.trim());
  const comTexto = falas.filter((f) => f.originalText.trim() || traducaoDe(f));
  /* Uma fala que já fechou e ainda não tem texto: o detector a entregou e a transcrição está a caminho. */
  const transcrevendo = falas.some((f) => f.isPartial && !f.originalText.trim());
  const atual = comTexto[comTexto.length - 1];
  const tocando = useSyncExternalStore(aoMudarAudioDasFalas, falaTocando, () => null);
  const lista = useRef<HTMLDivElement>(null);
  const noFim = useRef(true);
  const [longeDoFim, setLongeDoFim] = useState(false);

  const irParaOFim = () => {
    const el = lista.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    noFim.current = true;
    setLongeDoFim(false);
  };
  const aoRolar = () => {
    const el = lista.current;
    if (!el) return;
    noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLGA_DO_FIM;
    setLongeDoFim(!noFim.current);
  };
  /* Fala nova ou texto que cresceu: segue o fim, a menos que a pessoa esteja relendo lá em cima. */
  const assinatura = `${comTexto.length}|${atual?.originalText.length ?? 0}|${atual?.translatedText.length ?? 0}|${transcrevendo}`;
  useLayoutEffect(() => {
    if (noFim.current && lista.current) lista.current.scrollTop = lista.current.scrollHeight;
  }, [assinatura, escala]);
  useEffect(() => {
    if (!noFim.current) setLongeDoFim(true);
  }, [comTexto.length]);

  return (
    <div className="q-leg" style={{ '--q-escala': escala } as React.CSSProperties}>
      <div className="q-historico" ref={lista} onScroll={aoRolar} aria-live="polite">
        {comTexto.length === 0 && !transcrevendo && <p className="q-espera">{t('Ouvindo… a legenda aparece aqui.')}</p>}
        {comTexto.map((fala) => {
          const traducao = traducaoDe(fala);
          const original = fala.originalText.trim();
          const lang = fala.lang ?? idiomaPadrao;
          const minha = fala.source === 'mic';
          const estaTocando = tocando === fala.id;
          return (
            <div
              key={fala.id}
              className={fala === atual ? 'q-linha-da-fala atual' : 'q-linha-da-fala'}
              data-fonte={mostrarFonte ? fala.source : undefined}
            >
              <button
                type="button"
                className={fala === atual ? 'q-fala' : 'q-fala antiga'}
                onClick={() => aoTocar(fala, lang)}
              >
                <span className="q-meta">
                  {mostrarFonte && (minha ? <Mic aria-hidden /> : <Headphones aria-hidden />)}
                  {mostrarFonte && <span>{minha ? t('Você') : t('Som do headset')}</span>}
                  <span className="tn">{fala.timestamp}</span>
                </span>
                {/* Sem tradução ainda (ou fala já no idioma de destino): o original ocupa o lugar grande. */}
                {traducao && original && <span className="q-o">{original}</span>}
                <span className="q-t">{traducao || original}</span>
              </button>
              <div className="q-acoes-da-fala">
                {aoOuvir && temAudio?.(fala.id) && (
                  <button
                    type="button"
                    className="q-ctl"
                    data-sfx="none"
                    aria-pressed={estaTocando}
                    aria-label={estaTocando ? t('Parar o áudio') : t('Ouvir de novo')}
                    onClick={() => (estaTocando ? aoPararAudio?.() : aoOuvir(fala))}
                  >
                    {estaTocando ? <Square aria-hidden /> : <Volume2 aria-hidden />}
                  </button>
                )}
                <button
                  type="button"
                  className="q-ctl"
                  aria-label={t('Opções da fala')}
                  onClick={() => aoTocar(fala, lang)}
                >
                  <MoreHorizontal aria-hidden />
                </button>
              </div>
            </div>
          );
        })}
        {transcrevendo && (
          <p className="q-transcrevendo" role="status">
            <span className="q-pontos" aria-hidden>
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
