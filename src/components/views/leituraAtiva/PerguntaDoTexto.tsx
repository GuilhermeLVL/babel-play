import { useState } from 'react';

import type { PerguntaDoTexto as Pergunta } from '../../../core/leitura/fichaDeTexto';
import type { ResultadoDaPergunta } from '../../../core/leitura/rodadaDaLeitura';
import { t } from '../../../lib/i18n';

/** Como a pergunta terminou: certa de primeira, de segunda, não acertou, ou pulada (a regra mora no core). */
export type { ResultadoDaPergunta };

/**
 * T4 — UMA PERGUNTA DE COMPREENSÃO (spec `leitura-ativa-perguntas-e-pratica`; Duolingo Stories, Read Along).
 * Corrigida no aparelho, sem IA. Acerto: "Isso!" e "Continuar". Erro: a opção some e a segunda tentativa fica
 * liberada ("Quase. Releia o texto e tente de novo." — a ficha ainda não diz qual trecho responde, então a tela
 * não promete um destaque que não existe). Depois da segunda: a resposta certa com a explicação da ficha.
 * Nunca "errado", nunca som de erro. "Pular" sempre visível. No Nível 1 o enunciado vem nos dois idiomas.
 */
export default function PerguntaDoTexto(props: {
  pergunta: Pergunta;
  numero: number;
  total: number;
  bilingue: boolean;
  aoTerminar: (r: ResultadoDaPergunta) => void;
}) {
  const { pergunta: p, numero, total, aoTerminar } = props;
  const [traduzida, setTraduzida] = useState(props.bilingue);
  const [tiradas, setTiradas] = useState<number[]>([]);
  const [fim, setFim] = useState<ResultadoDaPergunta | null>(null);

  const escolher = (i: number) => {
    if (fim) return;
    if (i === p.correta) {
      setFim(tiradas.length === 0 ? 'primeira' : 'segunda');
      return;
    }
    if (tiradas.length === 0) setTiradas([i]);
    else {
      setTiradas([...tiradas, i]);
      setFim('nenhuma');
    }
  };

  return (
    <section
      className="q-cartao la-pergunta"
      aria-labelledby={`la-pergunta-${numero}`}
      data-testid="leitura-ativa-pergunta"
    >
      <p className="la-meta">{t('Pergunta {n} de {total}', { n: numero, total })}</p>
      <h3 id={`la-pergunta-${numero}`} lang="en">
        {p.pergunta}
      </h3>
      {traduzida ? (
        <p className="la-traducao">{p.traducao}</p>
      ) : (
        <button type="button" className="q-ctl" onClick={() => setTraduzida(true)}>
          {t('Ver em português')}
        </button>
      )}
      <div className="la-opcoes" role="group" aria-label={t('Opções')}>
        {p.opcoes.map((o, i) =>
          tiradas.includes(i) ? null : (
            <button
              key={i}
              type="button"
              lang="en"
              className="la-opcao"
              data-certa={fim && i === p.correta ? 'true' : undefined}
              disabled={!!fim}
              onClick={() => escolher(i)}
            >
              {o}
            </button>
          ),
        )}
      </div>
      <div aria-live="polite">
        {fim === 'primeira' || fim === 'segunda' ? (
          <p className="la-retorno">{t('Isso!')}</p>
        ) : fim === 'nenhuma' ? (
          <p className="la-retorno">
            {t('A resposta era: “{resposta}”.', { resposta: p.opcoes[p.correta] })} {p.explicacao}
          </p>
        ) : tiradas.length === 1 ? (
          <p className="la-retorno">{t('Quase. Releia o texto e tente de novo.')}</p>
        ) : null}
      </div>
      <div className="q-acoes">
        {fim ? (
          <button type="button" className="q-ctl pri" onClick={() => aoTerminar(fim)}>
            {t('Continuar')}
          </button>
        ) : (
          <button type="button" className="q-ctl" onClick={() => aoTerminar('pulada')}>
            {t('Pular')}
          </button>
        )}
      </div>
    </section>
  );
}
