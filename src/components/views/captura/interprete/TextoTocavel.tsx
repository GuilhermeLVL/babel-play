import { Pencil, Star, Turtle, Volume2 } from 'lucide-react';
import { Fragment, useMemo, useRef } from 'react';

import { trechosTocaveis } from '../../../../lib/captura/trechosTocaveis';
import { t } from '../../../../lib/i18n';
import { direcaoDoTexto } from '../../../../lib/languages';

/** O trecho que a voz está lendo por causa de um toque (para marcar a palavra na tela). */
export interface TrechoEmLeitura {
  texto: string;
  lang: string;
}

/** Ouvir um trecho: a palavra tocada, ou a frase inteira (`lento` = o modo devagar). */
export type AoOuvirTrecho = (texto: string, lang: string, opcoes?: { lento?: boolean }) => void;

/** Quanto tempo o dedo fica na frase para abrir a edição (tocar e segurar). */
export const TEMPO_DE_SEGURAR_MS = 550;

/**
 * UM TEXTO QUE SE TOCA PARA OUVIR (Intérprete v3, Fase 1): cada palavra é um botão que lê a palavra no
 * idioma do PRÓPRIO texto, e botões pequenos leem a frase inteira (normal e devagar). `mudo` = este
 * idioma não é lido em voz alta neste aparelho: o texto fica só texto, sem prometer voz.
 *
 * Só o ORIGINAL (o que o reconhecimento ouviu) pode ser corrigido (`aoEditar`: tocar e segurar, ou o lápis)
 * e guardado para estudo (`aoGuardar`).
 */
export function TextoTocavel({
  texto,
  lang,
  mudo,
  lendo,
  aoOuvir,
  className,
  aoEditar,
  aoGuardar,
}: {
  texto: string;
  lang: string;
  mudo: boolean;
  lendo: TrechoEmLeitura | null;
  aoOuvir: AoOuvirTrecho;
  className: string;
  aoEditar?: () => void;
  aoGuardar?: () => void;
}) {
  const trechos = useMemo(() => trechosTocaveis(texto, lang), [texto, lang]);
  /* TOCAR E SEGURAR abre a edição; o clique que vem depois do gesto longo não lê a palavra. */
  const relogio = useRef<ReturnType<typeof setTimeout>>(undefined);
  const segurou = useRef(false);
  const largar = () => clearTimeout(relogio.current);
  const segurar = aoEditar
    ? {
        onPointerDown: () => {
          segurou.current = false;
          relogio.current = setTimeout(() => {
            segurou.current = true;
            aoEditar();
          }, TEMPO_DE_SEGURAR_MS);
        },
        onPointerUp: largar,
        onPointerLeave: largar,
        onPointerCancel: largar,
        onClickCapture: (e: { stopPropagation: () => void; preventDefault: () => void }) => {
          if (!segurou.current) return;
          segurou.current = false;
          e.stopPropagation();
          e.preventDefault();
        },
        onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
      }
    : {};

  const acoesDeEdicao = (
    <>
      {aoEditar && (
        <button type="button" className="int-ouvir" aria-label={t('Corrigir o que foi reconhecido')} onClick={aoEditar}>
          <Pencil aria-hidden />
        </button>
      )}
      {aoGuardar && (
        <button type="button" className="int-ouvir" aria-label={t('Guardar para estudar')} onClick={aoGuardar}>
          <Star aria-hidden />
        </button>
      )}
    </>
  );

  if (mudo) {
    return (
      <p className={className} lang={lang} dir={direcaoDoTexto(lang)} {...segurar}>
        {texto}
        {(aoEditar || aoGuardar) && <span className="int-fr-acoes">{acoesDeEdicao}</span>}
      </p>
    );
  }
  const lendoIsto = (x: string) => (lendo && lendo.texto === x && lendo.lang === lang ? true : undefined);
  /* Sem segmentador (chinês, japonês...): o alvo do toque é a frase inteira, e não um caractere. */
  const fraseInteira = trechos.every((x) => !x.palavra) && /\p{L}/u.test(texto);
  return (
    <p className={className} lang={lang} dir={direcaoDoTexto(lang)} {...segurar}>
      {fraseInteira ? (
        <button type="button" className="int-w" data-lendo={lendoIsto(texto)} onClick={() => aoOuvir(texto, lang)}>
          {texto}
        </button>
      ) : (
        trechos.map((trecho, i) =>
          trecho.palavra ? (
            <button
              key={i}
              type="button"
              className="int-w"
              data-lendo={lendoIsto(trecho.texto)}
              onClick={() => aoOuvir(trecho.texto, lang)}
            >
              {trecho.texto}
            </button>
          ) : (
            <Fragment key={i}>{trecho.texto}</Fragment>
          ),
        )
      )}
      <span className="int-fr-acoes">
        <button
          type="button"
          className="int-ouvir"
          data-lendo={lendoIsto(texto)}
          aria-label={t('Ouvir a frase')}
          onClick={() => aoOuvir(texto, lang)}
        >
          <Volume2 aria-hidden />
        </button>
        <button
          type="button"
          className="int-ouvir"
          aria-label={t('Ouvir devagar')}
          onClick={() => aoOuvir(texto, lang, { lento: true })}
        >
          <Turtle aria-hidden />
        </button>
        {acoesDeEdicao}
      </span>
    </p>
  );
}
