import { Captions, X } from 'lucide-react';

import { t } from '../../../lib/i18n';
import { langLabel } from '../../../lib/languages';
import { LangFlag } from '../../LangFlag';

/**
 * A OFERTA "LEGENDA SEM BAIXAR NADA: ESCOLHA O IDIOMA DO VÍDEO" (plano "Grátis sem travar", A9a) —
 * a faixa do início da captura no desktop fraco, quando escolher o idioma leva o áudio da aba ao
 * reconhecimento do próprio navegador, no aparelho (a decisão mora em `lib/captura/legendaSemBaixar`).
 *
 * O toque no idioma escolhe-o (a detecção automática desliga) e a captura, no Iniciar, vai à Web
 * Speech local: nenhum byte de Whisper. "Outro idioma" abre a escolha de idiomas de sempre. Com o
 * tradutor ainda a baixar (sem o do navegador para o par), a faixa não promete "nada": diz que a
 * transcrição é que não baixa. Carregada por `lazy` — só existe na tela de quem a vê.
 */
export default function LegendaSemBaixar({
  idioma,
  tradutorBaixa,
  aoEscolherIdioma,
  aoEscolherOutro,
  aoFechar,
}: {
  /** O idioma do vídeo que o navegador transcreve no aparelho (BCP-47, o "Idioma do conteúdo"). */
  idioma: string;
  /** O nosso tradutor ainda baixa para o par (sem o do navegador e fora do cache). */
  tradutorBaixa: boolean;
  aoEscolherIdioma: () => void;
  aoEscolherOutro: () => void;
  aoFechar: () => void;
}) {
  return (
    <div className="aviso-info" role="status" data-testid="legenda-sem-baixar">
      <Captions aria-hidden />
      <span style={{ flex: 1 }}>
        <strong>
          {tradutorBaixa
            ? t('Transcrição sem baixar nada: escolha o idioma do vídeo.')
            : t('Legenda sem baixar nada: escolha o idioma do vídeo.')}
        </strong>{' '}
        {t('Com o idioma certo, o próprio navegador transcreve no aparelho, e o computador não fica pesado.')}
      </span>
      <button type="button" className="btn btn-solid peq" onClick={aoEscolherIdioma}>
        <LangFlag code={idioma} className="w-4 h-3" />
        {langLabel(idioma)}
      </button>
      <button type="button" className="btn btn-outline peq" onClick={aoEscolherOutro}>
        {t('Outro idioma')}
      </button>
      <button type="button" className="btn btn-outline peq" aria-label={t('Fechar aviso')} onClick={aoFechar}>
        <X aria-hidden />
      </button>
    </div>
  );
}
