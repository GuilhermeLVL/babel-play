import type { Forca } from '../../core/learning/forcaDoCartao';
import { t } from '../../lib/i18n';

/** O nome da força na língua da interface (literais, para o extrator de i18n achar cada um). */
export function nomeDaForca(forca: Forca): string {
  switch (forca) {
    case 1:
      return t('nova');
    case 2:
      return t('reconhecida');
    case 3:
      return t('familiar');
    default:
      return t('firme');
  }
}

/** O texto acessível: "Força 3 de 4: familiar". */
export function rotuloDaForca(forca: Forca): string {
  return t('Força {n} de 4: {nome}', { n: forca, nome: nomeDaForca(forca) });
}

/**
 * A FORÇA DA PALAVRA como quatro tracinhos (1 = nova … 4 = firme), derivada do FSRS (`forcaDoCartao`). O texto
 * acessível diz a força por extenso; os tracinhos são só enfeite para quem enxerga (`aria-hidden`), e a cor
 * nunca é a única pista: o número de tracinhos cheios muda.
 */
export default function ForcaDaPalavra({ forca }: { forca: Forca }) {
  const rotulo = rotuloDaForca(forca);
  return (
    <span className="forca-palavra" role="img" aria-label={rotulo} title={rotulo} data-forca={forca}>
      {([1, 2, 3, 4] as const).map((n) => (
        <i key={n} aria-hidden="true" className={n <= forca ? 'cheio' : undefined} />
      ))}
    </span>
  );
}
