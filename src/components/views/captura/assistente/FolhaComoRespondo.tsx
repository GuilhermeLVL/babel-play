import { Cloud, Copy, Mic, RotateCcw, Volume2, X } from 'lucide-react';
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
 * A espera é honesta: "Pensando em respostas…", e depois de 2,5 s (o p95 medido é ~3,8 s) diz que está demorando e
 * oferece cancelar. O aviso (`role="status"`) fica sempre montado e só o texto troca.
 */
export default function FolhaComoRespondo({
  estado,
  protegido,
  aoFechar,
  aoTentarDeNovo,
  aoAutorizar,
  aoOuvir,
  aoFalar,
}: {
  estado: Exclude<EstadoDoComoRespondo, { estado: 'fechado' }>;
  protegido: boolean;
  aoFechar: () => void;
  aoTentarDeNovo: () => void;
  aoAutorizar: () => void;
  aoOuvir?: (texto: string, lang: string | undefined, lenta: boolean) => void;
  /**
   * "FALAR ESTA" (a prática da conversa no Intérprete): a pessoa lê a sugestão em voz alta — o microfone abre na metade
   * dela, e a fala é comparada com a sugestão. Ausente = sem o botão (fora da prática, e na janela flutuante).
   */
  aoFalar?: (texto: string) => void;
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
        <ul className="leg-sugestoes" aria-label={t('Sugestões de resposta')}>
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
                {aoFalar && (
                  <button
                    type="button"
                    className="leg-acao-texto"
                    aria-label={t('Falar esta: {frase}', { frase: s.texto })}
                    onClick={() => aoFalar(s.texto)}
                    data-testid="falar-esta"
                  >
                    <Mic aria-hidden /> {t('Falar esta')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
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
      {estado.estado === 'ok' && <p className="leg-folha-nota">{t('Isto é uma IA e pode errar.')}</p>}
    </div>
  );
}
