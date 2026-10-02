import { ArrowDown, MoreHorizontal, Volume2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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
}) {
  const comTexto = falas.filter((f) => f.originalText.trim() || f.translatedText.trim());
  const atual = comTexto[comTexto.length - 1];
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
  const assinatura = `${comTexto.length}|${atual?.originalText.length ?? 0}|${atual?.translatedText.length ?? 0}`;
  useLayoutEffect(() => {
    if (noFim.current && lista.current) lista.current.scrollTop = lista.current.scrollHeight;
  }, [assinatura, escala]);
  useEffect(() => {
    if (!noFim.current) setLongeDoFim(true);
  }, [comTexto.length]);

  return (
    <div className="q-leg" style={{ '--q-escala': escala } as React.CSSProperties}>
      <div className="q-historico" ref={lista} onScroll={aoRolar} aria-live="polite">
        {comTexto.length === 0 && <p className="q-espera">{t('Ouvindo… a legenda aparece aqui.')}</p>}
        {comTexto.map((fala) => {
          const traducao = fala.translatedText.trim();
          const original = fala.originalText.trim();
          const lang = fala.lang ?? idiomaPadrao;
          return (
            <div key={fala.id} className={fala === atual ? 'q-linha-da-fala atual' : 'q-linha-da-fala'}>
              <button
                type="button"
                className={fala === atual ? 'q-fala' : 'q-fala antiga'}
                onClick={() => aoTocar(fala, lang)}
              >
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
                    aria-label={t('Ouvir de novo')}
                    onClick={() => aoOuvir(fala)}
                  >
                    <Volume2 aria-hidden />
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
      </div>
      {longeDoFim && (
        <button type="button" className="q-ctl q-ir-para-o-fim" onClick={irParaOFim}>
          <ArrowDown aria-hidden /> {t('Ir para a fala atual')}
        </button>
      )}
    </div>
  );
}
