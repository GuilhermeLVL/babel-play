import { Copy, Languages, Mic, Snail, Volume2 } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';

import { t } from '../../../../lib/i18n';
import { toast } from '../../../Toast';
import FolhaDeBaixo from './FolhaDeBaixo';

const SombraDaFala = lazy(() => import('../../analise/SombraDaFala'));
/* A Tradução Nuance da frase (D4): "Outras formas" e Formal/Informal chegam por `lazy()`. */
const NuanceDaFrase = lazy(() => import('../nuance/NuanceDaFrase'));

/** O que a folha precisa para a Tradução Nuance da frase (D4 da Fase D). */
export interface NuanceNaFolhaDaFrase {
  /** A pessoa tem a Tradução Nuance (`traducaoNuance`); sem ela, os botões vêm com cadeado. */
  disponivel: boolean;
  /** O idioma da tradução (o "outro" idioma do par). */
  destino: string;
  /** As falas anteriores (≤ 3). */
  contexto?: ReadonlyArray<string>;
  /** Fala do microfone (o prompt do intérprete). */
  falada?: boolean;
  /** O convite ao Premium — ausente no perfil protegido. */
  aoConhecer?: () => void;
  /** A pessoa escolheu uma forma: quem chama troca a tradução da fala. */
  aoEscolher: (traducao: string) => void;
}

/** A fala tocada, no que a folha precisa. */
export interface FalaTocada {
  id: string;
  texto: string;
  traducao: string;
  /** Idioma REAL da fala (BCP-47): o da voz do navegador e o do reconhecimento na prática. */
  lang: string;
  /** Idioma da tradução (BCP-47): o de "Ouvir tradução". Ausente = sem o botão. */
  langDaTraducao?: string;
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
 * 2026-09-29). Os ícones de 14 px da conversa viram botões de 56 px: Ouvir, Ouvir devagar, Ouvir
 * tradução (no idioma dela; o Ouvir fala o original), Repetir eu (o shadowing de `SombraDaFala`, a mesma nota por texto da Análise) e Copiar. As palavras viram
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
  nuance,
}: {
  fala: FalaTocada;
  aoOuvir: (texto: string, lang: string, lenta: boolean) => void;
  aoTocarPalavra: (palavra: string) => void;
  ehNova?: (palavra: string) => boolean;
  aoPraticar?: () => void;
  aoFechar: () => void;
  /** A Tradução Nuance da frase (D4). Ausente = a folha de sempre. */
  nuance?: NuanceNaFolhaDaFrase;
}) {
  const [praticando, setPraticando] = useState(false);
  const palavras = palavrasDaFrase(fala.texto);
  const temTraducao = !!fala.traducao && fala.traducao !== '…';

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
      {temTraducao && (
        <p className="folha-frase-trad" lang={fala.langDaTraducao}>
          {fala.traducao}
        </p>
      )}
      <div className="folha-grade">
        <button type="button" className="folha-acao pri" onClick={() => aoOuvir(fala.texto, fala.lang, false)}>
          <Volume2 aria-hidden /> {t('Ouvir')}
        </button>
        <button type="button" className="folha-acao" onClick={() => aoOuvir(fala.texto, fala.lang, true)}>
          <Snail aria-hidden /> {t('Ouvir devagar')}
        </button>
        {temTraducao && fala.langDaTraducao && (
          <button
            type="button"
            className="folha-acao"
            onClick={() => aoOuvir(fala.traducao, fala.langDaTraducao!, false)}
          >
            <Languages aria-hidden /> {t('Ouvir tradução')}
          </button>
        )}
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
          <SombraDaFala
            texto={fala.texto}
            idioma={fala.lang}
            aoOuvirOriginal={() => aoOuvir(fala.texto, fala.lang, false)}
          />
        </Suspense>
      )}
      {nuance && (
        <Suspense fallback={null}>
          <NuanceDaFrase
            fala={fala}
            destino={nuance.destino}
            contexto={nuance.contexto}
            falada={nuance.falada}
            disponivel={nuance.disponivel}
            aoConhecer={nuance.aoConhecer}
            aoEscolher={nuance.aoEscolher}
          />
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
