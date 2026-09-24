/**
 * O ANALISTA DE VOCABULÁRIO DA SESSÃO — o `aside.analista` do protótipo aprovado, ao lado da
 * transcrição (aba Transcrição). Abre ao clicar numa palavra do texto ou da lista "Palavras desta
 * sessão", e volta à lista pelo X.
 *
 * Os blocos são os do desenho, com as fontes reais que o app já usava no painel antigo: tradução
 * (do cartão ou do tradutor, com o motor), o verbete do Wiktionary (nível, classe gramatical e o
 * primeiro sentido), a explicação guardada no cartão e o exemplo — a frase em que a palavra
 * apareceu. Bloco sem dado não aparece.
 */
import { Target, Volume2, X, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';

import { type DictionaryResult, lookup } from '../../../lib/dictionary';
import type { VocabWord } from '../../../types';

export default function AnalistaDaSessao({
  palavra,
  nivel,
  velocidade,
  aoTrocarVelocidade,
  aoOuvir,
  aoFechar,
  aoRevisar,
  aoDuelo,
  nota,
}: {
  palavra: VocabWord;
  /** Nível CEFR do cartão, quando a palavra já está no caderno. */
  nivel?: string;
  velocidade: number;
  aoTrocarVelocidade: (v: number) => void;
  aoOuvir: () => void;
  aoFechar: () => void;
  aoRevisar: () => void;
  aoDuelo: () => void;
  /** Por que não há tradução (sem motor para o par, o tradutor falhou). */
  nota?: string | null;
}) {
  const [verbete, setVerbete] = useState<DictionaryResult | null>(null);
  useEffect(() => {
    let vivo = true;
    setVerbete(null);
    if (palavra.lang) void lookup(palavra.word, palavra.lang).then((r) => vivo && setVerbete(r));
    return () => {
      vivo = false;
    };
  }, [palavra.word, palavra.lang]);
  const sentido = verbete?.status === 'found' ? verbete.entry.senses[0] : undefined;
  const dicionario = [nivel ?? palavra.cefr, sentido?.partOfSpeech, sentido?.definition].filter(Boolean).join(' · ');

  return (
    <aside className="cartao p5 analista entra" aria-label="Analista de vocabulário">
      <div className="entre">
        <span className="label-mono">Analista de vocabulário</span>
        <button type="button" className="btn btn-outline peq icone" aria-label="Fechar o analista" onClick={aoFechar}>
          <X aria-hidden />
        </button>
      </div>
      <h3 style={{ font: '900 26px var(--font-display)', marginTop: 8 }}>{palavra.word}</h3>
      <div className="linha" style={{ gap: 8, marginTop: 6 }}>
        <button type="button" className="btn btn-outline peq" onClick={aoOuvir}>
          <Volume2 aria-hidden /> Ouvir
        </button>
        <div className="seg" role="group" aria-label="Velocidade do áudio">
          {[0.5, 1].map((v) => (
            <button key={v} type="button" aria-pressed={velocidade === v} onClick={() => aoTrocarVelocidade(v)}>
              {String(v).replace('.', ',')}×
            </button>
          ))}
        </div>
      </div>
      <div className="pilha" style={{ marginTop: 14, fontSize: 13.5 }}>
        <div>
          <span className="label-mono">Tradução automática</span>
          <p style={{ font: '700 16px var(--font-display)', marginTop: 2 }}>
            {palavra.translation || <span className="mut">{nota || 'traduzindo…'}</span>}
          </p>
        </div>
        {dicionario && (
          <div>
            <span className="label-mono">Dicionário</span>
            <p className="mut">{dicionario}</p>
          </div>
        )}
        {palavra.explanation && (
          <div>
            <span className="label-mono">Explicação linguística</span>
            <p className="mut">{palavra.explanation}</p>
          </div>
        )}
        {palavra.example && (
          <div>
            <span className="label-mono">Exemplo prático</span>
            <p>“{palavra.example}”</p>
          </div>
        )}
      </div>
      <div className="linha" style={{ gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-solid peq"
          title="Adiciona ao caderno e abre a revisão agora"
          onClick={aoRevisar}
        >
          <Target aria-hidden /> Revisar agora
        </button>
        <button type="button" className="btn btn-outline peq" onClick={aoDuelo}>
          <Zap aria-hidden /> Duelo com esta palavra
        </button>
      </div>
    </aside>
  );
}
