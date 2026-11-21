/**
 * "MODO DE ESCUTA": o seletor compacto do player e o passo da frase em foco.
 *
 * A lógica (ordem dos passos, sugestão por nível) é de `core/learning/escutaGuiada`; o estado e o
 * teclado, de `lib/analise/escutaGuiada`. Aqui só o desenho. Sem tempo, sem pontos, sem prêmio:
 * "Próximo passo" é da pessoa, no ritmo dela.
 */
import type { CefrLevel } from '../../../core/learning/contract';
import { type EtapaDeEscuta, type ModoDeEscuta, MODOS_DE_ESCUTA } from '../../../core/learning/escutaGuiada';
import type { EscutaGuiadaDaTela } from '../../../lib/analise/escutaGuiada';
import { t } from '../../../lib/i18n';

export function nomeDoModoDeEscuta(modo: ModoDeEscuta): string {
  switch (modo) {
    case 'ouvir-primeiro':
      return t('Ouvir antes de ler');
    case 'ler-primeiro':
      return t('Ler antes de ouvir');
    default:
      return t('Livre');
  }
}

export function descricaoDaEtapa(etapa: EtapaDeEscuta): string {
  switch (etapa) {
    case 'ouvir-sem-texto':
      return t('Passo: ouça sem ver o texto');
    case 'ler':
      return t('Passo: leia a frase');
    default:
      return t('Passo: ouça de novo, com o texto');
  }
}

export default function EscutaGuiada({ escuta, nivel }: { escuta: EscutaGuiadaDaTela; nivel: CefrLevel | null }) {
  const { modo, sugerido, etapa, oculto, noFim } = escuta;
  const sugestao = nivel
    ? t('Sugerido para {nivel}: {modo}', { nivel, modo: nomeDoModoDeEscuta(sugerido) })
    : t('Sugerido: {modo}', { modo: nomeDoModoDeEscuta(sugerido) });
  return (
    <div className="px-escuta" data-modo={modo}>
      <label className="px-escuta-modo">
        <span>{t('Modo de escuta')}</span>
        <select
          className="px-escuta-select"
          value={modo}
          onChange={(e) => escuta.mudarModo(e.target.value as ModoDeEscuta)}
        >
          {MODOS_DE_ESCUTA.map((m) => (
            <option key={m} value={m}>
              {nomeDoModoDeEscuta(m)}
            </option>
          ))}
        </select>
      </label>
      <span className="px-escuta-dica">{sugestao}</span>
      {/* Sempre no DOM (vazia em `livre`): uma região viva criada junto com o texto não é anunciada. */}
      <span className="px-escuta-passo" role="status">
        {etapa ? descricaoDaEtapa(etapa) : ''}
      </span>
      {etapa && (
        <>
          {oculto && (
            <button type="button" className="q-chip px-escuta-revelar" onClick={escuta.revelar}>
              {t('Texto oculto — toque para revelar')}
            </button>
          )}
          <button type="button" className="q-ctl pri px-escuta-proximo" disabled={noFim} onClick={escuta.proximo}>
            {t('Próximo passo')}
          </button>
        </>
      )}
    </div>
  );
}
