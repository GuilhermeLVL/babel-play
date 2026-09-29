import { BookmarkPlus, Copy, Languages, Snail, Volume2 } from 'lucide-react';
import { memo, type MouseEvent } from 'react';

import { pedacosDaLegenda } from '../../../../lib/estilosDeLegenda';
import { t } from '../../../../lib/i18n';
import type { Modo, Traducao } from './aparenciaDaLegenda';

/** Uma fala real da captura, pronta para a legenda. `lado` = de quem é (sistema = eles). */
export interface LegendaAoVivo {
  id: string;
  quem: string;
  original: string;
  traducao: string;
  lado: 'eles' | 'voce';
  /** Idioma declarado da fala (o da linha): ponto de partida do idioma da palavra tocada. */
  lang?: string;
  /** Ainda sendo falada (parcial do streaming): não é anunciada ao leitor de tela. */
  parcial?: boolean;
  /** Deixada sem tradução pela preferência "Tradução" (Só quando eu pedir / Só frases com palavra
   *  nova): no lugar da tradução, o mesmo "Mostrar tradução" da conversa. */
  sobDemanda?: boolean;
}

/** A palavra de um pedaço do texto, sem a pontuação colada ("today?" → "today"). */
export function limparPalavra(pedaco: string): string {
  return pedaco.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** O texto em pedaços tocáveis: cada palavra é um `span[data-palavra]`, os espaços ficam como texto. */
function Palavras({ texto, aprendidas }: { texto: string; aprendidas?: ReadonlySet<string> }) {
  const marcadas = new Set(
    pedacosDaLegenda(texto, aprendidas)
      .filter((p) => p.aprendida)
      .map((p) => p.texto),
  );
  return (
    <>
      {texto.split(/(\s+)/).map((p, i) => {
        const palavra = limparPalavra(p);
        if (!palavra) return p;
        return (
          <span key={i} data-palavra={palavra} data-aprendida={marcadas.has(p) ? '' : undefined}>
            {p}
          </span>
        );
      })}
    </>
  );
}

/**
 * UMA FALA DA JANELINHA: o original com as palavras tocáveis, a tradução (conforme o modo e a
 * troca desta fala) e as ações da fala — ouvir (normal e devagar, a voz do navegador, não o áudio
 * original), tradução só desta fala, copiar e salvar a frase. As ações aparecem ao passar o mouse
 * ou ao focar; na fala em foco elas ficam sempre à vista (é o que funciona no toque).
 */
function LinhaDaLegenda({
  fala,
  modo,
  modoDaTraducao,
  traducaoVisivel,
  emFoco,
  aprendidas,
  aoTocarPalavra,
  aoAlternarTraducao,
  aoRevelarTraducao,
  aoOuvir,
  aoCopiar,
  aoSalvarFrase,
}: {
  fala: LegendaAoVivo;
  modo: Modo;
  modoDaTraducao: Traducao;
  traducaoVisivel: boolean;
  emFoco: boolean;
  aprendidas?: ReadonlySet<string>;
  aoTocarPalavra: (palavra: string, fala: LegendaAoVivo) => void;
  /** Ausente = a fala não tem tradução para trocar (mesmo idioma, sem "sob demanda"). */
  aoAlternarTraducao?: (fala: LegendaAoVivo) => void;
  aoRevelarTraducao?: (id: string) => void;
  aoOuvir?: (fala: LegendaAoVivo, lenta: boolean) => void;
  aoCopiar: (fala: LegendaAoVivo) => void;
  aoSalvarFrase?: (fala: LegendaAoVivo) => void;
}) {
  const tocar = (e: MouseEvent<HTMLElement>) => {
    const alvo = (e.target as HTMLElement).closest<HTMLElement>('[data-palavra]');
    if (alvo?.dataset.palavra) {
      e.stopPropagation();
      aoTocarPalavra(alvo.dataset.palavra, fala);
    }
  };
  /* "Ao tocar": tocar a fala fora de uma palavra mostra (ou esconde) a tradução dela. */
  const tocarNaFala =
    modoDaTraducao === 'toque' && aoAlternarTraducao
      ? (e: MouseEvent<HTMLElement>) => {
          if (!(e.target as HTMLElement).closest('button,[data-palavra]')) aoAlternarTraducao(fala);
        }
      : undefined;
  const classeDoLado = modo === 'conversa' ? (fala.lado === 'eles' ? 'eles' : 'eles b') : '';

  return (
    <div
      data-fala={fala.id}
      className={`leg-fala ${classeDoLado} ${emFoco ? 'atual' : 'anterior'}`}
      aria-current={emFoco ? 'true' : undefined}
      onClick={tocarNaFala}
    >
      {modo === 'conversa' && <span className="leg-quem">{fala.quem}</span>}
      <span className="leg-o" lang={fala.lang || undefined} onClick={tocar}>
        <Palavras texto={fala.original} aprendidas={aprendidas} />
      </span>
      {modoDaTraducao !== 'oculta' && !fala.traducao && fala.sobDemanda && aoRevelarTraducao ? (
        /* Compacto, na cor e no tamanho da linha de tradução que ele substitui. */
        <button
          type="button"
          className={`leg-t ${modoDaTraducao} link leg-revelar`}
          onClick={() => aoRevelarTraducao(fala.id)}
        >
          <Languages aria-hidden /> {t('Mostrar tradução')}
        </button>
      ) : (
        traducaoVisivel &&
        fala.traducao && (
          <span className={`leg-t ${modoDaTraducao === 'discreta' ? 'discreta' : 'sempre'}`}>{fala.traducao}</span>
        )
      )}
      <div className="leg-acoes" role="group" aria-label={t('Ações da fala')}>
        {aoOuvir && (
          <>
            <button type="button" aria-label={t('Ouvir a frase')} title={t('Ouvir a frase')} onClick={() => aoOuvir(fala, false)}>
              <Volume2 aria-hidden />
            </button>
            <button
              type="button"
              aria-label={t('Ouvir devagar')}
              title={t('Ouvir devagar')}
              onClick={() => aoOuvir(fala, true)}
            >
              <Snail aria-hidden />
            </button>
          </>
        )}
        {aoAlternarTraducao && (
          <button
            type="button"
            aria-pressed={traducaoVisivel && !!fala.traducao}
            aria-label={t('Tradução desta fala')}
            title={t('Tradução desta fala')}
            onClick={() => aoAlternarTraducao(fala)}
          >
            <Languages aria-hidden />
          </button>
        )}
        <button type="button" aria-label={t('Copiar o texto')} title={t('Copiar o texto')} onClick={() => aoCopiar(fala)}>
          <Copy aria-hidden />
        </button>
        {aoSalvarFrase && (
          <button
            type="button"
            aria-label={t('Salvar a frase')}
            title={t('Salvar a frase')}
            onClick={() => aoSalvarFrase(fala)}
          >
            <BookmarkPlus aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(LinhaDaLegenda);
