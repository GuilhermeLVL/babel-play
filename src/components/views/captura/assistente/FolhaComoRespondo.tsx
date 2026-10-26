import { Cloud, Copy, RotateCcw, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { TomDaSugestao } from '../../../../data/apiDoAssistente';
import { t } from '../../../../lib/i18n';
import { fraseDaFalhaDoAssistente } from './copyDoAssistente';
import type { EstadoDoComoRespondo } from './useAssistenteAoVivo';

const ROTULO_DO_TOM: Readonly<Record<TomDaSugestao, string>> = {
  neutro: 'Neutro',
  informal: 'Informal',
  formal: 'Formal',
};

/**
 * "COMO RESPONDO?" — a folha compacta da janela flutuante (Fase C2): 2 ou 3 sugestões curtas no idioma da conversa,
 * cada uma com a tradução, "Copiar" e "Ouvir". É AJUDA DE IDIOMA, sob pedido: nada de "oculto" nem "entrevista"
 * (`copy-br-etica`). Nada para digitar.
 *
 * A espera é honesta: "Pensando em respostas…", e depois de 2,5 s sem a primeira sugestão diz que está demorando e
 * oferece cancelar. As sugestões chegam EM FLUXO: a primeira aparece assim que fica pronta, e as outras completam a
 * lista (`parcial`, com os pontinhos embaixo dela); os avisos de espera só valem antes da primeira. Fechar cancela o
 * pedido. Se o fluxo falhar depois de alguma sugestão, as que chegaram ficam (com Copiar e Ouvir) e uma nota discreta
 * diz que não deu para completar. O aviso (`role="status"`) fica sempre montado e só o texto troca.
 */
export default function FolhaComoRespondo({
  estado,
  protegido,
  aoFechar,
  aoTentarDeNovo,
  aoAutorizar,
  aoOuvir,
}: {
  estado: Exclude<EstadoDoComoRespondo, { estado: 'fechado' }>;
  protegido: boolean;
  aoFechar: () => void;
  aoTentarDeNovo: () => void;
  aoAutorizar: () => void;
  aoOuvir?: (texto: string, lang: string | undefined, lenta: boolean) => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const fechar = useRef<HTMLButtonElement>(null);
  const [copiada, setCopiada] = useState<number | null>(null);
  useEffect(() => {
    fechar.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (copiada === null) return;
    const id = setTimeout(() => setCopiada(null), 2000);
    return () => clearTimeout(id);
  }, [copiada]);

  const copiar = (texto: string, i: number) => {
    /* A área de transferência da janela onde a pessoa está (na PiP é a dela). */
    const nav = raiz.current?.ownerDocument.defaultView?.navigator ?? navigator;
    nav.clipboard?.writeText(texto).then(
      () => setCopiada(i),
      () => setCopiada(-1),
    );
  };

  const status =
    estado.estado === 'carregando'
      ? estado.lento
        ? t('Está demorando um pouco mais que o normal…')
        : t('Pensando em respostas…')
      : estado.estado === 'erro'
        ? fraseDaFalhaDoAssistente(estado.motivo, protegido)
        : copiada === -1
          ? t('Não deu para copiar.')
          : copiada !== null
            ? t('Texto copiado')
            : '';

  return (
    <div
      ref={raiz}
      className="leg-folha"
      role="dialog"
      aria-label={t('Como respondo?')}
      data-testid="folha-como-respondo"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          aoFechar();
        }
      }}
    >
      <div className="leg-folha-topo">
        <div>
          <b>{t('Como respondo?')}</b>
          <p className="leg-folha-sub">{t('Sugestões para você responder com as suas palavras')}</p>
        </div>
        <button ref={fechar} type="button" aria-label={t('Fechar as sugestões')} title={t('Fechar')} onClick={aoFechar}>
          <X aria-hidden />
        </button>
      </div>
      <p className="leg-folha-frase" lang={estado.lang || undefined}>
        “{estado.frase}”
      </p>

      {estado.estado === 'consentimento' && (
        <>
          <p className="leg-folha-nota">{t('As sugestões usam a IA de nuvem, que você ainda não autorizou.')}</p>
          <button type="button" className="leg-acao-texto" onClick={aoAutorizar}>
            <Cloud aria-hidden /> {t('Autorizar IA de nuvem')}
          </button>
        </>
      )}

      {estado.estado === 'carregando' && (
        <div className="leg-folha-esperando" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      )}

      {estado.estado === 'ok' && (
        <ul className="leg-sugestoes" aria-label={t('Sugestões de resposta')} aria-busy={estado.parcial || undefined}>
          {estado.sugestoes.map((s, i) => (
            <li key={i} className="leg-sugestao">
              <p className="leg-sugestao-texto" lang={estado.lang || undefined}>
                {s.texto}
              </p>
              <p className="leg-sugestao-trad">{s.traducao}</p>
              <div className="leg-sugestao-acoes">
                <span className="leg-sugestao-tom">{t(ROTULO_DO_TOM[s.tom])}</span>
                <button type="button" className="leg-acao-texto" onClick={() => copiar(s.texto, i)}>
                  <Copy aria-hidden /> {copiada === i ? t('Copiado') : t('Copiar')}
                </button>
                {aoOuvir && (
                  <button type="button" className="leg-acao-texto" onClick={() => aoOuvir(s.texto, estado.lang, false)}>
                    <Volume2 aria-hidden /> {t('Ouvir')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {/* Em fluxo: o lugar das que ainda vêm (até 3), sem aviso nenhum ao leitor de tela. */}
      {estado.estado === 'ok' && estado.parcial && estado.sugestoes.length < 3 && (
        <div className="leg-folha-esperando" aria-hidden data-testid="como-respondo-chegando">
          {Array.from({ length: 3 - estado.sugestoes.length }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      )}

      <p className="leg-folha-status" role="status">
        {status}
      </p>
      {estado.estado === 'carregando' && estado.lento && (
        <button type="button" className="leg-acao-texto" onClick={aoFechar}>
          {t('Cancelar')}
        </button>
      )}
      {estado.estado === 'erro' && (estado.motivo === 'nuvem_ocupada' || estado.motivo === 'indisponivel') && (
        <button type="button" className="leg-acao-texto" onClick={aoTentarDeNovo}>
          <RotateCcw aria-hidden /> {t('Tentar de novo')}
        </button>
      )}
      {estado.estado === 'ok' && estado.incompleta && (
        <p className="leg-folha-nota" data-testid="como-respondo-incompleta">
          {t('Não deu para completar as sugestões.')}
        </p>
      )}
      {estado.estado === 'ok' && <p className="leg-folha-nota">{t('Isto é uma IA e pode errar.')}</p>}
    </div>
  );
}
