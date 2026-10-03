import type { AppMetrics } from '@core';
import { CloudOff, X } from 'lucide-react';
import { useState } from 'react';

import { useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
import { edicaoEstatica, urlDoAppCompleto } from '../../lib/edicaoEstatica';
import { t } from '../../lib/i18n';
import { estaAnonimo } from '../../lib/identidade';
import { avisoPendente, marcarVisto } from '../../lib/marcosDeConta';
import { usePedacoDoQuest } from './quest/usePedacoDoQuest';

const carregarFaixaDoQuest = () => import('./quest/FaixaDeAvisoDoQuest');

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
export default function AvisoDeConta({ metrics, onEntrar }: { metrics: AppMetrics | null; onEntrar: () => void }) {
  const [dispensado, setDispensado] = useState(false);
  const questNovo = useQuestNovo();
  /* Se o desenho do headset não chegar, vale o cartão de sempre (um aviso nunca recarrega a página). */
  const doQuest = usePedacoDoQuest(carregarFaixaDoQuest, questNovo);

  const aviso = avisoPendente({
    sessoes: metrics?.sessions ?? 0,
    palavras: metrics?.deckSize ?? 0,
    semConta: estaAnonimo(),
  });
  if (!aviso || dispensado) return null;
  /* Edição estática com `VITE_URL_APP_COMPLETO`: a conta existe na versão completa, noutro endereço. */
  const appCompleto = urlDoAppCompleto();

  const dispensar = () => {
    marcarVisto(aviso.marco);
    setDispensado(true);
  };

  /* QUEST: o mesmo aviso e as mesmas saídas, numa faixa do headset (`FaixaDeAvisoDoQuest`). */
  if (questNovo && doQuest.Componente) {
    const FaixaDeAvisoDoQuest = doQuest.Componente;
    return (
      <FaixaDeAvisoDoQuest
        icone={CloudOff}
        titulo={t(aviso.titulo)}
        texto={t(aviso.texto)}
        testId="aviso-de-conta"
        acoes={
          edicaoEstatica()
            ? [
                ...(appCompleto
                  ? [{ rotulo: t('Criar conta na versão completa'), href: appCompleto, principal: true }]
                  : []),
                { rotulo: t('Entendi'), aoClicar: dispensar },
              ]
            : [
                { rotulo: t('Criar conta ou entrar'), aoClicar: onEntrar, principal: true },
                { rotulo: t('Agora não'), aoClicar: dispensar },
              ]
        }
        aoDispensar={dispensar}
        rotuloDeDispensar={t('Dispensar aviso')}
      />
    );
  }
  /* O aviso não bloqueia nada: enquanto o desenho do headset não chega, ele só espera. */
  if (questNovo && !doQuest.falhou) return null;

  return (
    <section
      className="rounded-2xl border-2 border-accent/40 bg-accent-soft p-4 flex items-start gap-3"
      data-testid="aviso-de-conta"
    >
      <CloudOff className="w-5 h-5 text-accent shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="font-display font-black text-[14.5px] text-ink">{t(aviso.titulo)}</p>
        <p className="text-[12.5px] text-ink-muted mt-1 leading-relaxed max-w-[72ch]">{t(aviso.texto)}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {/* Edição estática: não há conta a criar AQUI — o aviso informa e, com a URL da versão
              completa no build, leva até lá; sem ela, a saída é só dispensar. */}
          {edicaoEstatica() ? (
            <>
              {appCompleto && (
                <a
                  href={appCompleto}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-solid !py-2 !text-[12.5px]"
                >
                  {t('Criar conta na versão completa')}
                </a>
              )}
              <button onClick={dispensar} className="btn-outline !py-2 !text-[12.5px]">
                {t('Entendi')}
              </button>
            </>
          ) : (
            <>
              <button onClick={onEntrar} className="btn-solid !py-2 !text-[12.5px]">
                {t('Criar conta ou entrar')}
              </button>
              <button onClick={dispensar} className="btn-outline !py-2 !text-[12.5px]">
                {t('Agora não')}
              </button>
            </>
          )}
        </div>
      </div>
      <button
        onClick={dispensar}
        aria-label={t('Dispensar aviso')}
        className="shrink-0 text-ink-faint hover:text-ink cursor-pointer"
      >
        <X className="w-4 h-4" aria-hidden />
      </button>
    </section>
  );
}
