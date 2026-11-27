import '../../../styles/etiquetas.css';

import { Check, Loader2, Repeat2 } from 'lucide-react';
import { useState } from 'react';

import type { Forca } from '../../../core/learning/forcaDoCartao';
import { FORCAS_ESCOLHIVEIS, infoDaPalavra } from '../../../core/leitura/destaqueDeVocabulario';
import { chavesDeLema } from '../../../core/leitura/textoDaLeitura';
import { useSnapshotDasEtiquetas } from '../../../lib/etiquetas/indiceDeEtiquetas';
import { t } from '../../../lib/i18n';
import { definirForcaDaPalavra } from '../../../lib/leitor/forcaDaPalavra';
import type { VocabCard } from '../../../types';
import { toast } from '../../Toast';

/** O que o leitor entrega ao cartão da palavra para ligar o controle de força (a flag `leitor_destaque_vocab`). */
export interface VocabularioDoCartao {
  /** Guarda a palavra com a frase do livro e devolve o cartão criado. */
  fichar: () => Promise<VocabCard | undefined>;
  /** Vai estudar (a revisão). Ausente = sem o botão "Revisar agora". */
  aoRevisar?: () => void;
}

const dicaDaForca = (f: Forca): string =>
  f === 1
    ? t('Força 1: guardada, ainda sem revisão')
    : f === 2
      ? t('Força 2: reconhecida')
      : f === 3
        ? t('Força 3: familiar')
        : t('Força 4: firme');

/** A força atual da palavra (0 = sem cartão) e se ela já foi revisada, lidas do índice de etiquetas. */
export function useForcaDaPalavra(palavra: string, idioma: string) {
  const s = useSnapshotDasEtiquetas();
  const info = infoDaPalavra(s, chavesDeLema(palavra, idioma), idioma);
  return { forca: info.forca, status: info.status, marcada: info.status === 'conhecida' || info.status === 'ignorada' };
}

/**
 * A FORÇA EM 1 TOQUE no cartão da palavra do leitor (flag `leitor_destaque_vocab`; openspec `leitura-assistida`, C5).
 * "Não sei" (1) guarda a palavra; 2, 3 e 4 guardam já com essa firmeza (só para palavra sem revisões: a firmeza de quem já
 * foi revisada é o histórico dela). "Já sei" e "Ignorar" seguem no `MarcarPalavra`, logo abaixo, e "Revisar agora" leva ao estudo.
 * O destaque do capítulo se atualiza sozinho: a escrita passa pelo índice de etiquetas.
 */
export default function ControleDeForcaDaPalavra({
  palavra,
  idioma,
  vocabulario,
}: {
  palavra: string;
  idioma: string;
  vocabulario: VocabularioDoCartao;
}) {
  const { forca } = useForcaDaPalavra(palavra, idioma);
  const [ocupada, setOcupada] = useState<Forca | null>(null);

  const escolher = async (f: Forca) => {
    if (ocupada) return;
    setOcupada(f);
    const r = await definirForcaDaPalavra({ palavra, idioma, forca: f, fichar: vocabulario.fichar });
    setOcupada(null);
    if (!('motivo' in r)) return;
    if (r.motivo === 'ja-revisada') toast.info(t('Esta palavra já foi revisada: a força dela vem das revisões.'));
    else if (r.motivo === 'falhou') toast.warn(t('Não deu para guardar a palavra agora.'));
  };

  return (
    <div className="cartao-palavra-forca" role="group" aria-label={t('Quanto você sabe esta palavra')}>
      <div className="cartao-palavra-forca-degraus">
        {FORCAS_ESCOLHIVEIS.map((f) => (
          <button
            key={f}
            type="button"
            className="cartao-palavra-chip cartao-palavra-forca-degrau"
            aria-pressed={forca === f}
            data-forca={f}
            title={dicaDaForca(f)}
            disabled={!!ocupada}
            onClick={() => void escolher(f)}
          >
            {ocupada === f ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : forca === f ? (
              <Check aria-hidden />
            ) : null}
            {f === 1 ? t('Não sei') : String(f)}
          </button>
        ))}
      </div>
      {forca > 0 && vocabulario.aoRevisar && (
        <button type="button" className="cartao-palavra-chip" onClick={vocabulario.aoRevisar}>
          <Repeat2 aria-hidden /> {t('Revisar agora')}
        </button>
      )}
    </div>
  );
}
