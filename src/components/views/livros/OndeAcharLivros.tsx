import { ExternalLink } from 'lucide-react';
import React from 'react';

import { FONTES_LEGAIS } from '../../../core/livros/fontesLegais';
import { t } from '../../../lib/i18n';

/** Uma linha do que cada fonte tem. Literais em `t()` para o extrator de i18n achar. */
const O_QUE_TEM: Record<string, () => string> = {
  gutenberg: () => t('Clássicos em domínio público, em EPUB.'),
  'standard-ebooks': () => t('Clássicos revisados e bem formatados.'),
  wikisource: () => t('Textos de domínio público transcritos por voluntários.'),
  wikibooks: () => t('Livros didáticos livres.'),
  'internet-archive': () =>
    t('Livros antigos e de licença aberta. Use só os itens de domínio público ou de licença aberta.'),
  'open-library': () => t('Catálogo para descobrir livros. O empréstimo de lá não é domínio público: não abre aqui.'),
  librivox: () => t('Audiolivros gratuitos de domínio público (áudio; o texto você acha nas outras fontes).'),
  'dominio-publico-mec': () => t('Obras em português, de domínio público ou com divulgação autorizada.'),
  bndigital: () => t('Acervo histórico brasileiro, com obras antigas.'),
  hathitrust: () => t('Biblioteca digital de universidades; muitas obras são de domínio público só nos EUA.'),
  'biblioteca-digital-mundial': () => t('Documentos e livros históricos de bibliotecas do mundo.'),
  feedbooks: () => t('Uma parte da loja é de domínio público.'),
  manybooks: () => t('Domínio público e autores independentes, cada um com a sua licença.'),
  'faded-page': () => t('Obras de domínio público no Canadá, não necessariamente no Brasil.'),
};

/**
 * "ONDE ENCONTRAR LIVROS LEGAIS": só fontes de domínio público e licença aberta. O botão abre a página da
 * fonte em outra aba (sem rastreio); o livro baixado volta pela zona de soltar. As fontes "amarelas" levam a
 * ressalva do prazo brasileiro (70 anos depois da morte do autor).
 */
export default function OndeAcharLivros({ aoIrParaFonte }: { aoIrParaFonte?: () => void }) {
  const grupo = (g: 'verde' | 'amarelo') => FONTES_LEGAIS.filter((f) => f.grupo === g);
  const lista = (g: 'verde' | 'amarelo') => (
    <ul className="lv-fontes">
      {grupo(g).map((f) => (
        <li key={f.id} className="lv-fonte" data-testid={`fonte-${f.id}`}>
          <div className="lv-fonte-texto">
            <b>{f.nome}</b> <small>{f.idiomas}</small>
            <span>{O_QUE_TEM[f.id]()}</span>
          </div>
          <a
            className="q-ctl"
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => aoIrParaFonte?.()}
            aria-label={t('Abrir {nome} em outra aba', { nome: f.nome })}
          >
            <ExternalLink aria-hidden /> {t('Abrir')}
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="q-cartao lv-onde" aria-labelledby="lv-onde-titulo" data-testid="onde-achar-livros">
      <h3 id="lv-onde-titulo">{t('Onde encontrar livros legais')}</h3>
      <p className="lv-nota">
        {t('Abra a fonte, baixe o EPUB (ou o PDF) e volte aqui: é só soltar o arquivo na área acima.')}
      </p>
      <h4>{t('Domínio público e licença aberta')}</h4>
      {lista('verde')}
      <h4>{t('Confira a obra antes')}</h4>
      <p className="lv-nota">
        {t(
          'No Brasil, a obra só é de domínio público 70 anos depois da morte do autor, e quem traduziu tem direito sobre a tradução. Nestas fontes, uma obra pode ser livre em outro país e não aqui.',
        )}
      </p>
      {lista('amarelo')}
    </section>
  );
}
