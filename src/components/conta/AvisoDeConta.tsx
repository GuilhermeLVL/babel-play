import { useState } from 'react';
import { CloudOff, X } from 'lucide-react';
import { avisoPendente, marcarVisto } from '../../lib/marcosDeConta';
import { estaAnonimo } from '../../lib/identidade';
import type { AppMetrics } from '@core';
import { t } from '../../lib/i18n';

/**
 * O AVISO POR MARCO DE USO — pedir a conta quando a pessoa TEM ALGO A PERDER.
 *
 * Até 01/09 o app pedia a conta na PORTA (a primeira visita abria no login) e depois calava: o
 * convite aparecia uma vez por visita e só por ação que exigia rede. Quem gravou dez sessões e
 * fichou cem palavras sem conta nunca ouvia que ia perder tudo ao trocar de navegador.
 *
 * A porta se inverteu, e este componente é a outra metade da troca. Ele NÃO bloqueia nada: é um
 * cartão dispensável, no Hub, que aparece quando há motivo concreto — o acervo chegando no teto,
 * o caderno chegando no teto, a segunda gravação salva. A regra de QUANDO mora em
 * `lib/marcosDeConta` (função pura, testada); aqui só se diz como ela aparece.
 *
 * Some sozinho com conta, e some para sempre quando dispensado: quem já respondeu não precisa ser
 * perguntado de novo.
 */
export default function AvisoDeConta({ metrics, onEntrar }: {
  metrics: AppMetrics | null;
  onEntrar: () => void;
}) {
  const [dispensado, setDispensado] = useState(false);

  const aviso = avisoPendente({
    sessoes: metrics?.sessions ?? 0,
    palavras: metrics?.deckSize ?? 0,
    semConta: estaAnonimo(),
  });
  if (!aviso || dispensado) return null;

  const dispensar = () => { marcarVisto(aviso.marco); setDispensado(true); };

  return (
    <section className="rounded-2xl border-2 border-accent/40 bg-accent-soft p-4 flex items-start gap-3" data-testid="aviso-de-conta">
      <CloudOff className="w-5 h-5 text-accent shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="font-display font-black text-[14.5px] text-ink">{t(aviso.titulo)}</p>
        <p className="text-[12.5px] text-ink-muted mt-1 leading-relaxed max-w-[72ch]">{t(aviso.texto)}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={onEntrar} className="btn-solid !py-2 !text-[12.5px]">{t('Criar conta ou entrar')}</button>
          <button onClick={dispensar} className="btn-outline !py-2 !text-[12.5px]">{t('Agora não')}</button>
        </div>
      </div>
      <button onClick={dispensar} aria-label="Dispensar aviso" className="shrink-0 text-ink-faint hover:text-ink cursor-pointer">
        <X className="w-4 h-4" aria-hidden />
      </button>
    </section>
  );
}
