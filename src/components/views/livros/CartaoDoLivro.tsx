import '../../../styles/questLivrosCapas.css';

import React, { useState } from 'react';

import { capaDoLivro } from '../../../core/livros/capas';
import type { LivroDoCatalogo } from '../../../core/livros/tipos';
import { t } from '../../../lib/i18n';
import { idDoCatalogo } from '../../../lib/livros/abrir';
import { useCapaLocal } from '../../../lib/livros/capasLocais';
import CapaTipografica from './CapaTipografica';
import { rotuloDoIdioma } from './rotulos';

export const autoresDe = (l: Pick<LivroDoCatalogo, 'autores'>) => l.autores.map((a) => a.nome).join(', ');

/**
 * A CAPA. Por baixo, sempre a tipográfica (SVG, `CapaTipografica`): é ela que aparece enquanto a imagem carrega,
 * se a imagem falhar e para os livros sem imagem. Por cima, a imagem, na ordem: a que a PESSOA escolheu ou veio
 * no arquivo dela (só neste aparelho), depois a do catálogo (Standard Ebooks, CC0). A caixa é 2:3 desde o
 * primeiro quadro, então nada se mexe quando a imagem chega.
 */
export function CapaDoLivro({
  livro,
  grande = false,
  decorativa = true,
}: {
  livro: LivroDoCatalogo;
  grande?: boolean;
  decorativa?: boolean;
}) {
  return (
    <CapaDesenhada
      id={idDoCatalogo(livro.id)}
      titulo={livro.titulo}
      autor={autoresDe(livro)}
      idioma={livro.idioma}
      grande={grande}
      decorativa={decorativa}
      imagemDoCatalogo={capaDoLivro(livro)?.url}
    />
  );
}

/** A mesma capa para quem não tem a ficha do catálogo (o livro que a pessoa trouxe): só precisa de id e título. */
export function CapaDesenhada({
  id,
  titulo,
  autor,
  idioma,
  grande = false,
  decorativa = true,
  imagemDoCatalogo,
}: {
  /** O id NA ESTANTE do aparelho (`cat:<id>` no catálogo, `meu-…` no trazido): chave da capa local. */
  id: string;
  titulo: string;
  autor?: string;
  idioma?: string;
  grande?: boolean;
  /** O título já aparece ao lado? Então a capa é só enfeite (`alt` vazio). */
  decorativa?: boolean;
  imagemDoCatalogo?: string;
}) {
  const local = useCapaLocal(id);
  const origem = local?.url ?? imagemDoCatalogo;
  const [falhou, setFalhou] = useState<string | null>(null);
  const alt = decorativa ? '' : t('Capa de {titulo}', { titulo });
  const mostrar = origem && falhou !== origem ? origem : null;
  return (
    <span
      className={`lv-capa${grande ? ' grande' : ''}`}
      data-capa={mostrar ? (local ? 'local' : 'catalogo') : 'tipografica'}
      {...(decorativa ? { 'aria-hidden': true } : mostrar ? {} : { role: 'img', 'aria-label': alt })}
    >
      <CapaTipografica id={id} titulo={titulo} autor={autor} idioma={idioma} />
      {mostrar && (
        <img
          key={mostrar}
          className="lv-capa-img"
          src={mostrar}
          alt={alt}
          width={350}
          height={525}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFalhou(mostrar)}
        />
      )}
    </span>
  );
}

export function rotuloDoTempo(minutos: number): string {
  if (minutos < 60) return t('{n} min', { n: minutos });
  const horas = Math.round(minutos / 60);
  return t('{n} h', { n: horas });
}

/** O livro numa prateleira ou na lista de resultados: um alvo só, que abre o detalhe. */
export default function CartaoDoLivro({
  livro,
  aoAbrir,
  tambemEm = [],
}: {
  livro: LivroDoCatalogo;
  aoAbrir: () => void;
  /** Os idiomas das OUTRAS edições visíveis desta obra (códigos); o próprio idioma do livro não entra. */
  tambemEm?: readonly string[];
}) {
  const nomes = tambemEm.map((i) => rotuloDoIdioma(i).toLowerCase());
  return (
    <li className="lv-item">
      <button type="button" className="lv-cartao" onClick={aoAbrir} data-livro={livro.id}>
        <CapaDoLivro livro={livro} />
        <span className="lv-cartao-texto">
          <b lang={livro.idioma}>{livro.titulo}</b>
          <span className="lv-autor">{autoresDe(livro)}</span>
          <span className="lv-selos">
            {livro.nivel && (
              <span className="lv-selo" title={t('Nível estimado')}>
                {livro.nivel}
              </span>
            )}
            <span className="lv-selo fraco">{rotuloDoTempo(livro.minutosEstimados)}</span>
          </span>
          {tambemEm.length > 0 && (
            <span
              className="lv-tambem"
              data-testid="tambem-em"
              title={t('Também em {idiomas}', { idiomas: nomes.join(', ') })}
            >
              <span className="sr-only">{t('Também em {idiomas}', { idiomas: nomes.join(', ') })}</span>
              {tambemEm.map((i) => (
                <span key={i} className="lv-selo idioma" aria-hidden>
                  {i}
                </span>
              ))}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
