import { HelpCircle, Upload } from 'lucide-react';
import React from 'react';

import { buscarExcluidos } from '../../../core/livros/catalogo';
import type { LivroExcluido } from '../../../core/livros/tipos';
import { t } from '../../../lib/i18n';
import { rotuloDoMotivo } from './rotulos';

/**
 * "POR QUE ESTE LIVRO NÃO ESTÁ?" (CAT09). A busca sem resultado mostra o que a fonte tem e o catálogo deixou de
 * fora, com o motivo de cada um; e sempre a regra dos 70 anos e o caminho de trazer o próprio arquivo.
 */
export default function PorQueNaoEsta({
  busca,
  exclusoes,
  anoLimite,
  ano,
  menor,
  aoTrazer,
}: {
  busca: string;
  exclusoes: readonly LivroExcluido[];
  anoLimite: number;
  ano: number;
  menor: boolean;
  aoTrazer: () => void;
}) {
  /* Para menor de idade, nenhum título excluído aparece (pode ser obra adulta): só a explicação geral. */
  const achados = menor ? [] : buscarExcluidos(exclusoes, busca);
  return (
    <section className="q-cartao lv-porque" aria-labelledby="lv-porque-titulo" data-testid="por-que-nao-esta">
      <h2 id="lv-porque-titulo">
        <HelpCircle aria-hidden /> {t('Por que este livro não está?')}
      </h2>
      {achados.length > 0 && (
        <ul className="lv-excluidos">
          {achados.map((e) => (
            <li key={`${e.titulo}|${e.motivo}|${e.fonte}`}>
              <b lang={e.idioma}>{e.titulo}</b>
              {e.autores.length > 0 && <span className="lv-autor"> · {e.autores.join(', ')}</span>}
              <span className="lv-motivo">
                {rotuloDoMotivo(e.motivo)}: {e.detalhe}.
              </span>
            </li>
          ))}
        </ul>
      )}
      <p>
        {t(
          'Aqui só entram livros em domínio público no Brasil: a obra fica livre 70 anos depois do ano seguinte à morte do autor. Em {ano}, isso vale para quem morreu até {limite}. Uma tradução tem os próprios direitos, então o tradutor segue a mesma regra.',
          { ano, limite: anoLimite },
        )}
      </p>
      <p>
        {t(
          'Quando não sabemos o ano de morte do autor ou do tradutor, o livro fica de fora. Na dúvida, preferimos não publicar.',
        )}
      </p>
      {menor && <p>{t('Alguns livros só aparecem aqui depois que uma pessoa revisa a faixa etária deles.')}</p>}
      <div className="q-acoes">
        <button type="button" className="q-ctl" onClick={aoTrazer}>
          <Upload aria-hidden /> {t('Trazer o seu')}
        </button>
      </div>
    </section>
  );
}
