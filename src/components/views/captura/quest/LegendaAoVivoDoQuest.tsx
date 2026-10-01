import type { SpeechSegment } from '../../../../lib/captura/tiposDaFala';
import { t } from '../../../../lib/i18n';

/**
 * A LEGENDA AO VIVO NO QUEST — a maquete aprovada pelo dono em 01/10/2026 (tela 2).
 *
 * No headset a legenda é lida de relance, ao lado de um vídeo ou de um jogo: a tela mostra a fala
 * ATUAL em destaque e a anterior esmaecida, e não a lista longa de balões do computador (diretriz de
 * legendas da Meta: duas linhas curtas, sobre fundo, entrada suave de ~0,5 s). A tradução é o texto
 * grande; o original fica acima, menor, para quem estuda. O histórico completo continua na sessão
 * salva. Tocar numa fala abre a mesma folha da captura enxuta (guardar palavras, ver a tradução).
 *
 * Só apresentação: recebe as falas prontas da `LiveCapture`. O tamanho vem da faixa de controles
 * (A− / A+), como `escala`.
 */
export default function LegendaAoVivoDoQuest({
  falas,
  escala,
  idiomaPadrao,
  aoTocar,
}: {
  falas: readonly SpeechSegment[];
  /** Multiplicador do tamanho do texto (0,75 a 2), escolhido na faixa. */
  escala: number;
  /** Idioma das falas que não trazem o próprio (o do conteúdo). */
  idiomaPadrao: string;
  aoTocar: (fala: SpeechSegment, lang: string) => void;
}) {
  const comTexto = falas.filter((f) => f.originalText.trim() || f.translatedText.trim());
  const visiveis = comTexto.slice(-2);
  const atual = visiveis[visiveis.length - 1];
  return (
    <div className="q-leg" style={{ '--q-escala': escala } as React.CSSProperties} aria-live="polite">
      {visiveis.length === 0 && <p className="q-espera">{t('Ouvindo… a legenda aparece aqui.')}</p>}
      {visiveis.map((fala) => {
        const traducao = fala.translatedText.trim();
        const original = fala.originalText.trim();
        return (
          <button
            key={fala.id}
            type="button"
            className={fala === atual ? 'q-fala' : 'q-fala antiga'}
            onClick={() => aoTocar(fala, fala.lang ?? idiomaPadrao)}
          >
            {/* Sem tradução ainda (ou fala já no idioma de destino): o original ocupa o lugar grande. */}
            {traducao && original && <span className="q-o">{original}</span>}
            <span className="q-t">{traducao || original}</span>
          </button>
        );
      })}
    </div>
  );
}
