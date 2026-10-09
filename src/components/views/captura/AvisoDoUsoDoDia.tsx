import { Gauge, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { type AvisoDoDia, marcarAvisoDoDia, verificarUsoDoDia } from '../../../lib/avisoDoUsoDoDia';
import { t } from '../../../lib/i18n';
import { navegarPara } from '../../../lib/rotas';
import { duracaoLegivel } from '../../../lib/uso';
import { usePedacoDoQuest } from '../../conta/quest/usePedacoDoQuest';

const carregarFaixaDoQuest = () => import('../../conta/quest/FaixaDeAvisoDoQuest');

/** A frase do aviso: funcional, sem venda, sem porcentagem, e sempre com o que acontece depois. */
function fraseDoAviso(a: AvisoDoDia): string {
  if (a.contador === 'ia')
    return a.esgotado
      ? t('O limite de IA de hoje chegou ao fim e volta amanhã. A legenda segue no aparelho.')
      : t('O limite de IA de hoje está perto do fim. Amanhã ele volta.');
  const usado = duracaoLegivel(a.usadoSegundos);
  const teto = duracaoLegivel(a.tetoSegundos);
  return a.esgotado
    ? t('A nuvem de hoje chegou ao limite ({teto}) e volta amanhã. A legenda segue no aparelho.', { teto })
    : t('A nuvem de hoje está perto do limite: {usado} de {teto}. Passando disso, a legenda segue no aparelho.', {
        usado,
        teto,
      });
}

/**
 * O RECADO DO USO JUSTO DO DIA NA CAPTURA PARADA — "a nuvem de hoje está perto do limite", uma vez por dia.
 *
 * Mora no lugar do aviso do fim da captura (`avisoDoFim` em `LiveCapture`), que só existe com a captura
 * PARADA: durante a captura ou a rodada ele nem monta (regra de `docs/ofertas.md`), e por isso não tapa a
 * legenda. Informação funcional, não oferta: quem chega aqui já assina. Dispensável; a ação é uma só.
 *
 * O quando e o quanto (80 %, uma vez por dia, a pergunta espaçada) moram em `lib/avisoDoUsoDoDia`.
 */
export default function AvisoDoUsoDoDia() {
  const [aviso, setAviso] = useState<AvisoDoDia | null>(null);
  const [dispensado, setDispensado] = useState(false);
  const doQuest = usePedacoDoQuest(carregarFaixaDoQuest, !!aviso);

  useEffect(() => {
    let vivo = true;
    void verificarUsoDoDia().then((a) => {
      if (!vivo || !a) return;
      marcarAvisoDoDia();
      setAviso(a);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (!aviso || dispensado) return null;
  const texto = fraseDoAviso(aviso);
  const verConsumo = () => navegarPara({ view: 'planos' });

  if (doQuest.Componente) {
    const FaixaDeAvisoDoQuest = doQuest.Componente;
    return (
      <FaixaDeAvisoDoQuest
        icone={Gauge}
        texto={texto}
        testId="aviso-do-uso-do-dia"
        acoes={[{ rotulo: t('Ver consumo'), aoClicar: verConsumo }]}
        aoDispensar={() => setDispensado(true)}
        rotuloDeDispensar={t('Dispensar aviso')}
      />
    );
  }
  /* Enquanto a faixa não chega, o aviso só espera: nunca recarrega a página. */
  if (!doQuest.falhou) return null;

  /* A faixa não carregou (rede): o recado sai assim mesmo, na peça que já está na página. */
  return (
    <section className="aviso-info" role="status" data-testid="aviso-do-uso-do-dia" style={{ margin: '12px 0 0' }}>
      <Gauge aria-hidden />
      <span style={{ flex: 1, minWidth: 0 }}>{texto}</span>
      <button type="button" className="btn btn-outline peq" onClick={verConsumo}>
        {t('Ver consumo')}
      </button>
      <button
        type="button"
        className="shrink-0 text-ink-faint hover:text-ink cursor-pointer"
        aria-label={t('Dispensar aviso')}
        onClick={() => setDispensado(true)}
      >
        <X className="w-4 h-4" aria-hidden />
      </button>
    </section>
  );
}
