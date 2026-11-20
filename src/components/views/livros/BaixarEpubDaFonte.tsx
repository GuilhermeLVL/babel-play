import { Download } from 'lucide-react';
import React from 'react';

import { epubParaBaixar } from '../../../core/livros/epubDaFonte';
import type { LivroDoCatalogo } from '../../../core/livros/tipos';
import { t } from '../../../lib/i18n';

/** "Baixar EPUB": só para a Standard Ebooks (CC0), direto da fonte. Nos outros livros não aparece nada. */
export default function BaixarEpubDaFonte({ livro }: { livro: Pick<LivroDoCatalogo, 'fonte' | 'formatos'> }) {
  const url = epubParaBaixar(livro);
  if (!url) return null;
  return (
    <a className="q-chip" href={url} rel="noopener noreferrer" data-testid="baixar-epub-da-fonte">
      <Download aria-hidden /> {t('Baixar EPUB (Standard Ebooks)')}
    </a>
  );
}
