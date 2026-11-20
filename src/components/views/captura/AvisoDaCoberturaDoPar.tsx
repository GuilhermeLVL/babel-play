import { Info, TriangleAlert } from 'lucide-react';

import type { CoberturaNoAparelho } from '../../../core/traducao/coberturaNoAparelho';
import { t } from '../../../lib/i18n';
import { langLabelNaUI } from '../../../lib/languages';

/**
 * O PAR TEM TRADUÇÃO NESTE APARELHO? Dito ANTES de Iniciar, na escolha de idiomas e no espaço de gravação (CEL-01,
 * auditoria de 17/11/2026: o visitante legendou espanhol → português no celular e nenhuma fala foi traduzida, sem aviso).
 *
 *  • `sem-rota`: o fato e a saída — a legenda segue só com a transcrição; autorizar a tradução pela internet, quando a
 *    política do perfil permite (o perfil protegido sem responsável não tem essa saída, e a tela não a oferece).
 *  • `pelo-ingles`: informa que o par passa pelo inglês, no aparelho, e quanto baixa na primeira vez.
 *  • `nuvem`: o aviso de sempre, a tradução usa a internet.
 *  • nativo, direta e mesmo idioma: nada a dizer.
 */
export default function AvisoDaCoberturaDoPar({
  de,
  para,
  cobertura,
  podeAutorizarNuvem,
}: {
  de: string;
  para: string;
  cobertura: CoberturaNoAparelho | null;
  /** A política do perfil permite autorizar a nuvem (ainda não autorizada)? */
  podeAutorizarNuvem: boolean;
}) {
  if (!cobertura) return null;
  const idiomas = { de: langLabelNaUI(de), para: langLabelNaUI(para) };
  if (cobertura.rota === 'sem-rota')
    return (
      <div className="aviso-info warn" role="status" data-testid="aviso-sem-rota">
        <TriangleAlert aria-hidden />
        <span>
          {t('Sem tradução neste aparelho para {de} → {para}. A legenda segue só com a transcrição.', idiomas)}
          {podeAutorizarNuvem && (
            <> {t('Para traduzir, autorize a tradução pela internet em Ajustes → Privacidade.')}</>
          )}
        </span>
      </div>
    );
  if (cobertura.rota === 'pelo-ingles')
    return (
      <div className="aviso-info" data-testid="aviso-pelo-ingles">
        <Info aria-hidden />
        <span>
          {t('A tradução de {de} → {para} passa pelo inglês, no aparelho: cerca de {mb} MB na primeira vez.', {
            ...idiomas,
            mb: cobertura.mb,
          })}
        </span>
      </div>
    );
  if (cobertura.rota === 'nuvem')
    return (
      <div className="aviso-info warn">
        <TriangleAlert aria-hidden />
        <span>{t('Ainda não há tradutor no aparelho para este par: a tradução usa a internet.')}</span>
      </div>
    );
  return null;
}
