import { BookmarkPlus, MessageCircleReply } from 'lucide-react';
import { useState } from 'react';

import type { RecursosDoAssistente } from '../../../../core/assistente/telaDoAssistente';
import type { FalhaDoAssistente } from '../../../../data/apiDoAssistente';
import { t } from '../../../../lib/i18n';
import { notaDasGlosasAutomaticas, rotuloDoNivel, rotuloDoTipo } from './copyDoAssistente';
import type { ItemDoGlossario } from './useAssistenteAoVivo';

/**
 * A ABA "ASSISTENTE" da janela flutuante (Fase C2, pela costura `abasExtras`): o GLOSSÁRIO da sessão — as expressões,
 * os termos e as palavras acima do nível que apareceram, os mais novos primeiro — cada um com "Salvar" (o mesmo
 * fichamento FSRS da palavra tocada). Uma linha por item: lista longa não cabe em ~440×300, então a aba rola e o resto
 * fica para o app. "Como respondo?" também mora aqui (nas janelas de conversa e estudo).
 */
export default function AbaDoAssistente({
  itens,
  recursos,
  paradoPorCota,
  aoSalvar,
  aoComoRespondo,
}: {
  itens: ReadonlyArray<ItemDoGlossario>;
  recursos: RecursosDoAssistente;
  paradoPorCota: FalhaDoAssistente | null;
  aoSalvar?: (item: { palavra: string; frase?: string; lang?: string; traducao?: string }) => Promise<string>;
  aoComoRespondo?: () => void;
}) {
  const [status, setStatus] = useState<Record<string, string>>({});
  const nota = notaDasGlosasAutomaticas(paradoPorCota);

  const salvar = (i: ItemDoGlossario) => {
    if (!aoSalvar) return;
    setStatus((s) => ({ ...s, [i.chave]: t('Salvando…') }));
    aoSalvar({ palavra: i.texto, frase: i.frase, lang: i.lang, traducao: i.sentido }).then(
      (msg) => setStatus((s) => ({ ...s, [i.chave]: msg })),
      () => setStatus((s) => ({ ...s, [i.chave]: t('Não deu para salvar agora.') })),
    );
  };

  return (
    <div className="leg-assistente" data-testid="aba-assistente">
      {recursos.comoRespondo && aoComoRespondo && (
        <button type="button" className="leg-acao-texto leg-assistente-responder" onClick={aoComoRespondo}>
          <MessageCircleReply aria-hidden /> {t('Como respondo?')}
        </button>
      )}
      {nota && <p className="leg-nota">{nota}</p>}
      {!itens.length ? (
        <p className="leg-assistente-vazio">
          {recursos.nuvem
            ? t('As expressões, os termos e as palavras acima do seu nível desta sessão aparecem aqui.')
            : t('As palavras acima do seu nível desta sessão aparecem aqui.')}
        </p>
      ) : (
        <ul className="leg-glossario" aria-label={t('Destaques desta sessão')}>
          {itens.map((i) => (
            <li key={i.chave} className="leg-glossario-item" data-marca={i.tipo}>
              <div className="leg-glossario-txt">
                <b lang={i.lang || undefined}>{i.texto}</b>{' '}
                <span className="leg-glossario-tipo">
                  {i.tipo === 'nivel' ? rotuloDoNivel(i.nivel, i.escala) : rotuloDoTipo(i.tipo)}
                </span>
                {i.sentido && <span className="leg-glossario-sentido">{i.sentido}</span>}
                {status[i.chave] && (
                  <span className="leg-glossario-status" role="status">
                    {status[i.chave]}
                  </span>
                )}
              </div>
              {aoSalvar && (
                <button
                  type="button"
                  className="leg-glossario-salvar"
                  aria-label={t('Salvar “{palavra}” no vocabulário', { palavra: i.texto })}
                  title={t('Salvar no vocabulário')}
                  onClick={() => salvar(i)}
                >
                  <BookmarkPlus aria-hidden /> <span>{t('Salvar')}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
