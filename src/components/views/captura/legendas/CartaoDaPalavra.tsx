import { BookmarkPlus, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { t } from '../../../../lib/i18n';

/** A palavra tocada na legenda: o que o cartão precisa para consultar, ouvir e fichar. */
export interface PalavraTocada {
  palavra: string;
  /** A fala de onde ela saiu — é dela que sai o idioma real (`vocabWord.resolveWord`). */
  frase: string;
  lang?: string;
}

/** Sem resposta nisto (MT fora, rede lenta), o cartão diz "sem tradução" em vez de esperar para sempre. */
const PACIENCIA_MS = 8000;

/**
 * O CARTÃO DA PALAVRA — tocar uma palavra da legenda abre isto dentro da própria janelinha: a
 * glosa (o mesmo caminho do Analista da captura: dicionário local → Wiktionary → MT), "Ouvir"
 * (a voz do navegador) e "Salvar no vocabulário" (o mesmo fichamento FSRS da conversa).
 *
 * O resultado do "Salvar" é o que o fichamento DISSE (entrou, repetida, recusada), nunca um
 * "salvo" otimista: a régua pode recusar a palavra.
 */
export default function CartaoDaPalavra({
  alvo,
  noAlto = false,
  aoConsultar,
  aoOuvir,
  aoSalvar,
  aoFechar,
}: {
  alvo: PalavraTocada;
  /** Abre no alto da janela (a palavra veio de uma fala de baixo). */
  noAlto?: boolean;
  aoConsultar?: (palavra: string, frase: string, lang?: string) => Promise<{ traducao: string }>;
  aoOuvir?: (texto: string, lang: string | undefined, lenta: boolean) => void;
  aoSalvar?: (item: { palavra: string; frase?: string; lang?: string; traducao?: string }) => Promise<string>;
  aoFechar: () => void;
}) {
  const [glosa, setGlosa] = useState<string | null>(aoConsultar ? null : '');
  const [status, setStatus] = useState('');
  const [salvando, setSalvando] = useState(false);
  const fechar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fechar.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!aoConsultar) return;
    let vivo = true;
    setGlosa(null);
    setStatus('');
    const desistir = setTimeout(() => vivo && setGlosa((g) => g ?? ''), PACIENCIA_MS);
    aoConsultar(alvo.palavra, alvo.frase, alvo.lang).then(
      (r) => vivo && setGlosa(r.traducao || ''),
      () => vivo && setGlosa(''),
    );
    return () => {
      vivo = false;
      clearTimeout(desistir);
    };
  }, [alvo, aoConsultar]);

  const salvar = async () => {
    if (!aoSalvar || salvando) return;
    setSalvando(true);
    try {
      setStatus(
        await aoSalvar({ palavra: alvo.palavra, frase: alvo.frase, lang: alvo.lang, traducao: glosa || undefined }),
      );
    } catch {
      setStatus(t('Não deu para salvar agora.'));
    }
    setSalvando(false);
  };

  return (
    <div
      className={`leg-cartao ${noAlto ? 'no-alto' : ''}`}
      role="dialog"
      aria-label={t('Palavra: {palavra}', { palavra: alvo.palavra })}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          aoFechar();
        }
      }}
    >
      <div className="leg-cartao-topo">
        <b lang={alvo.lang || undefined}>{alvo.palavra}</b>
        <button ref={fechar} type="button" aria-label={t('Fechar o cartão da palavra')} title={t('Fechar')} onClick={aoFechar}>
          <X aria-hidden />
        </button>
      </div>
      <p className="leg-cartao-glosa" aria-live="polite">
        {glosa === null ? t('Consultando…') : glosa || t('Sem tradução para esta palavra.')}
      </p>
      <div className="leg-cartao-acoes">
        {aoOuvir && (
          <button type="button" className="leg-acao-texto" onClick={() => aoOuvir(alvo.palavra, alvo.lang, false)}>
            <Volume2 aria-hidden /> {t('Ouvir')}
          </button>
        )}
        {aoSalvar && (
          <button type="button" className="leg-acao-texto" disabled={salvando} onClick={() => void salvar()}>
            <BookmarkPlus aria-hidden /> {t('Salvar no vocabulário')}
          </button>
        )}
      </div>
      {status && (
        <p className="leg-cartao-status" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
