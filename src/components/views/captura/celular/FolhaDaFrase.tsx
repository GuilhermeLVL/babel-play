import { Copy, Mic, Snail, Volume2 } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';

import { t } from '../../../../lib/i18n';
import { toast } from '../../../Toast';
import FolhaDeBaixo from './FolhaDeBaixo';

const SombraDaFala = lazy(() => import('../../analise/SombraDaFala'));

/** A fala tocada, no que a folha precisa. */
export interface FalaTocada {
  id: string;
  texto: string;
  traducao: string;
  /** Idioma REAL da fala (BCP-47): o da voz do navegador e o do reconhecimento na prática. */
  lang: string;
}

/** As palavras da frase como botões: sem pontuação nas pontas, sem repetir a mesma palavra. */
export function palavrasDaFrase(texto: string): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const bruto of texto.split(/\s+/)) {
    const p = bruto.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
    if (!p || !/\p{L}/u.test(p)) continue;
    const chave = p.toLocaleLowerCase();
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    saida.push(p);
  }
  return saida;
}

/**
 * A FOLHA DA FRASE — tocar num balão da conversa, no celular (maquete aprovada pelo dono,
 * 2026-09-29). Os ícones de 14 px da conversa viram botões de 56 px: Ouvir, Ouvir devagar, Repetir
 * eu (o shadowing de `SombraDaFala`, a mesma nota por texto da Análise) e Copiar. As palavras viram
 * botões — o dedo não acerta uma palavra solta no texto — e a que a pessoa ainda não conhece vem
 * marcada (`ehNova`, a mesma régua do sublinhado da conversa).
 *
 * `aoPraticar`: a prática vai abrir o microfone de novo; quem chama emudece a captura antes (e a
 * devolve ao fechar a folha), para as duas não disputarem o mesmo microfone.
 */
export default function FolhaDaFrase({
  fala,
  aoOuvir,
  aoTocarPalavra,
  ehNova,
  aoPraticar,
  aoFechar,
}: {
  fala: FalaTocada;
  aoOuvir: (texto: string, lang: string, lenta: boolean) => void;
  aoTocarPalavra: (palavra: string) => void;
  ehNova?: (palavra: string) => boolean;
  aoPraticar?: () => void;
  aoFechar: () => void;
}) {
  const [praticando, setPraticando] = useState(false);
  const palavras = palavrasDaFrase(fala.texto);

  const copiar = () => {
    const texto = fala.traducao ? `${fala.texto}\n${fala.traducao}` : fala.texto;
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(texto))
      .then(
        () => toast.info(t('Frase copiada')),
        () => toast.warn(t('Não deu para copiar neste navegador.')),
      );
  };

  return (
    <FolhaDeBaixo titulo={t('Ações da frase')} tituloVisivel={false} aoFechar={aoFechar} classe="folha-da-frase">
      <p className="folha-frase" lang={fala.lang}>
        {fala.texto}
      </p>
      {fala.traducao && fala.traducao !== '…' && <p className="folha-frase-trad">{fala.traducao}</p>}
      <div className="folha-grade">
        <button type="button" className="folha-acao pri" onClick={() => aoOuvir(fala.texto, fala.lang, false)}>
          <Volume2 aria-hidden /> {t('Ouvir')}
        </button>
        <button type="button" className="folha-acao" onClick={() => aoOuvir(fala.texto, fala.lang, true)}>
          <Snail aria-hidden /> {t('Ouvir devagar')}
        </button>
        <button
          type="button"
          className="folha-acao"
          aria-pressed={praticando}
          onClick={() => {
            if (!praticando) aoPraticar?.();
            setPraticando((v) => !v);
          }}
        >
          <Mic aria-hidden /> {t('Repetir eu')}
        </button>
        <button type="button" className="folha-acao" onClick={copiar}>
          <Copy aria-hidden /> {t('Copiar')}
        </button>
      </div>
      {praticando && (
        <Suspense fallback={null}>
          <SombraDaFala texto={fala.texto} idioma={fala.lang} aoOuvirOriginal={() => aoOuvir(fala.texto, fala.lang, false)} />
        </Suspense>
      )}
      {palavras.length > 0 && (
        <>
          <p className="folha-rotulo">{t('Toque numa palavra')}</p>
          <div className="folha-palavras">
            {palavras.map((p) => (
              <button
                key={p}
                type="button"
                lang={fala.lang}
                data-nova={ehNova?.(p) ? true : undefined}
                onClick={() => aoTocarPalavra(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </>
      )}
    </FolhaDeBaixo>
  );
}
