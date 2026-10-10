import type { ReactNode } from 'react';

import type { ContagemDeFila } from '../../../core/learning/resumoDosCartoes';
import { numero, t } from '../../../lib/i18n';
import { langLabelNaUI } from '../../../lib/languages';

/**
 * AS PEÇAS PEQUENAS DA TELA CARTÕES — porte de `cartoes.js:146-155` ("Peças pequenas"). Só
 * apresentação: o número chega pronto de `GET /api/vocab/resumo`.
 */

/** As três contagens de uma linha: novas, aprendendo, a revisar (`ctTres`, `cartoes.js:147-150`). */
export function Tres({ n, comRotulo = false }: { n: ContagemDeFila; comRotulo?: boolean }) {
  const itens: Array<[string, number, string]> = [
    ['nv', n.novas, t('novas')],
    ['ap', n.aprendendo, t('aprendendo')],
    ['rv', n.revisar, t('a revisar')],
  ];
  return (
    <span
      className="ct-tres"
      aria-label={t('{novas} novas, {aprendendo} aprendendo, {revisar} a revisar', {
        novas: n.novas,
        aprendendo: n.aprendendo,
        revisar: n.revisar,
      })}
    >
      {itens.map(([classe, valor, rotulo]) => (
        <b key={classe} className={`${classe} ${valor ? '' : 'zero'}`}>
          {numero(valor)}
          {comRotulo && <small>{rotulo}</small>}
        </b>
      ))}
    </span>
  );
}

/** O cabeçalho de um cartão: título, frase e o que vai à direita (`ctCabecaDoCartao`, `cartoes.js:155`). */
export function CabecaDoCartao({
  titulo,
  sub,
  extra,
  nivel = 2,
}: {
  titulo: ReactNode;
  sub?: ReactNode;
  extra?: ReactNode;
  nivel?: 2 | 3;
}) {
  const H = nivel === 2 ? 'h2' : 'h3';
  return (
    <div className="q-secao">
      <header>
        <div>
          <H>{titulo}</H>
          {sub && <p>{sub}</p>}
        </div>
        {extra}
      </header>
    </div>
  );
}

/** O nome do idioma como título de linha: "Inglês", com a inicial maiúscula (`cartoes.js:70-71`). */
export function nomeDoIdioma(codigo: string): string {
  const nome = langLabelNaUI(codigo);
  return nome.charAt(0).toLocaleUpperCase() + nome.slice(1);
}

/** "17 ago": o dia e o mês curto, sem ponto nem preposição (os rótulos do protótipo, `cartoes.js:515`). */
export function diaEMes(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'short' }).replace('.', '')}`;
}

/** Os três nomes curtos de dia da semana, de domingo a sábado (`CT_DIAS7`, `cartoes.js:93`). */
export const diaCurto = (dia: number): string =>
  [t('dom'), t('seg'), t('ter'), t('qua'), t('qui'), t('sex'), t('sáb')][dia];
