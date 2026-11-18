import { useState } from 'react';

import type { MotivoDaPratica, PalavraParaPraticar } from '../../../core/leitura/palavrasParaPraticar';
import { t, tp } from '../../../lib/i18n';

export interface FatosDaLeitura {
  frasesLidas: number;
  totalDeFrases: number;
  ms: number;
  /** Só na voz alta. */
  estrelas: number | null;
  certas: number;
  totalDePerguntas: number;
  /** "Cerca de N palavras por minuto": só adulto, só voz alta. */
  palavrasPorMinuto: number | null;
}

function duracao(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(s / 60);
  return min ? t('{min} min {s} s', { min, s: s % 60 }) : t('{s} s', { s });
}

function porque(m: MotivoDaPratica): string {
  if (m === 'pulada') return t('O Frasy não ouviu bem');
  if (m === 'tocada') return t('você tocou nela');
  return t('nova');
}

/**
 * T6 — O RESUMO (spec `leitura-ativa-perguntas-e-pratica`; Microsoft Reading Coach). Fatos, não nota: frases lidas,
 * tempo, estrelas e perguntas. Nada de precisão em porcentagem nem nota 0–100. As palavras para praticar vêm
 * marcadas ("Vai para a sua revisão"), com desmarcar em um toque; sem conta, o aviso e nenhum cartão no servidor.
 */
export default function ResumoDaLeitura(props: {
  titulo: string;
  fatos: FatosDaLeitura;
  palavras: PalavraParaPraticar[];
  temConta: boolean;
  aoPraticar: (palavras: string[]) => Promise<number>;
  aoLerOutro: () => void;
  aoLerDeNovo: () => void;
}) {
  const { fatos, temConta } = props;
  const [marcadas, setMarcadas] = useState(
    () => new Set(props.palavras.filter((p) => p.marcada).map((p) => p.palavra)),
  );
  const [salvando, setSalvando] = useState(false);
  const [salvas, setSalvas] = useState<number | null>(null);

  const partes = [
    t('{n} de {total} frases', { n: fatos.frasesLidas, total: fatos.totalDeFrases }),
    duracao(fatos.ms),
    ...(fatos.estrelas !== null ? [tp(fatos.estrelas, '★ {n} estrela', '★ {n} estrelas')] : []),
    t('{n} de {total} perguntas', { n: fatos.certas, total: fatos.totalDePerguntas }),
  ];

  return (
    <div className="la-coluna" data-testid="leitura-ativa-resumo">
      <header>
        <p className="q-sobre">{t('Texto concluído')}</p>
        <h1 className="la-titulo" lang="en">
          {props.titulo}
        </h1>
      </header>
      <p className="la-fatos">{partes.join(' · ')}</p>
      {fatos.palavrasPorMinuto !== null && (
        <p className="la-meta">{t('cerca de {n} palavras por minuto', { n: fatos.palavrasPorMinuto })}</p>
      )}

      <section className="q-secao" aria-labelledby="la-praticar">
        <header>
          <h2 id="la-praticar">{t('Palavras para praticar')}</h2>
        </header>
        {props.palavras.length === 0 ? (
          <p className="la-meta">{t('Nenhuma palavra para praticar. Você leu tudo com clareza!')}</p>
        ) : (
          <>
            <ul className="la-praticar" data-testid="leitura-ativa-praticar">
              {props.palavras.map((p) => (
                <li key={p.palavra}>
                  <label>
                    <input
                      type="checkbox"
                      checked={marcadas.has(p.palavra)}
                      onChange={(e) => {
                        const nova = new Set(marcadas);
                        if (e.target.checked) nova.add(p.palavra);
                        else nova.delete(p.palavra);
                        setMarcadas(nova);
                      }}
                    />
                    <span lang="en">{p.palavra}</span>
                    <small>{porque(p.motivo)}</small>
                  </label>
                </li>
              ))}
            </ul>
            <p className="la-meta">{t('As marcadas vão para a sua revisão.')}</p>
          </>
        )}
        {!temConta && <p className="la-aviso">{t('Entre para guardar estas palavras e ganhar XP.')}</p>}
        {salvas !== null && (
          <p className="la-aviso" role="status">
            {tp(salvas, 'Pronto! {n} palavra está na sua revisão.', 'Pronto! {n} palavras estão na sua revisão.')}
          </p>
        )}
      </section>

      <div className="q-acoes">
        {temConta && marcadas.size > 0 && salvas === null && (
          <button
            type="button"
            className="q-ctl pri"
            disabled={salvando}
            onClick={() => {
              setSalvando(true);
              void props.aoPraticar([...marcadas]).then((n) => {
                setSalvas(n);
                setSalvando(false);
              });
            }}
          >
            {t('Praticar estas palavras')}
          </button>
        )}
        <button type="button" className="q-ctl" onClick={props.aoLerOutro}>
          {t('Ler outro texto')}
        </button>
        <button type="button" className="q-ctl" onClick={props.aoLerDeNovo}>
          {t('Ler de novo')}
        </button>
      </div>
    </div>
  );
}
