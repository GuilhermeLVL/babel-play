import { CircleHelp, type LucideIcon, X } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';

import type { ContagemDeFila } from '../../../core/learning/resumoDosCartoes';
import { numero, t } from '../../../lib/i18n';
import { langLabelNaUI } from '../../../lib/languages';
import { toast } from '../../Toast';
import { DialogoBase } from '../../ui/Dialogo';

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

/**
 * A dica no ícone (`ctDica`, `cartoes.js:193`): o parágrafo explicativo mora aqui. Com o ponteiro, é a
 * dica do navegador; no toque (e no teclado), vira aviso (`cartoes.js:176`).
 */
export function Dica({ texto }: { texto: string }) {
  return (
    <button
      type="button"
      className="ct-dica"
      title={texto}
      aria-label={t('O que é isto')}
      onClick={() => toast.info(texto, { duration: 5200 })}
    >
      <CircleHelp aria-hidden />
    </button>
  );
}

/**
 * O diálogo das folhas da tela (`ctDlg`, `cartoes.js:168-169`): painel no computador, folha que sobe no
 * celular (o CSS do protótipo e `lib/polimento/dialogos.ts` cuidam das duas formas). `pe` são os botões
 * do rodapé.
 */
export function FolhaDeCartoes({
  Icone,
  titulo,
  sub,
  classe = '',
  pe,
  aoFechar,
  refDialogo,
  children,
}: {
  Icone: LucideIcon;
  titulo: string;
  sub?: ReactNode;
  classe?: string;
  pe?: ReactNode;
  aoFechar: () => void;
  refDialogo?: RefObject<HTMLDialogElement | null>;
  children: ReactNode;
}) {
  return (
    <DialogoBase
      classe={`qj qj-painel medio ct-dlg ${classe}`.trim()}
      rotulo={titulo}
      aoFechar={aoFechar}
      refDialogo={refDialogo}
    >
      <div className="dlg-cab">
        <span className="q-ic" aria-hidden>
          <Icone />
        </span>
        <div>
          <h2>{titulo}</h2>
          {sub && <p className="qj-nota">{sub}</p>}
        </div>
        <button
          type="button"
          className="x"
          aria-label={t('Fechar')}
          onClick={(e) => e.currentTarget.closest('dialog')?.close()}
        >
          <X aria-hidden />
        </button>
      </div>
      <div className="dlg-corpo qj-painel-corpo">{children}</div>
      {pe && <div className="dlg-pe">{pe}</div>}
    </DialogoBase>
  );
}

/** Fecha a folha em que o botão está (o movimento de saída é do diálogo). */
export const fecharAFolhaDe = (el: Element) => el.closest('dialog')?.close();

/** Uma linha de menu das folhas (`ctLinhasDeMenu`, `cartoes.js:973-978`). */
export interface LinhaDeMenu {
  chave: string;
  Icone: LucideIcon;
  titulo: string;
  detalhe?: string;
  acao: () => void;
  desligada?: boolean;
}

export function LinhasDeMenu({ linhas, fim }: { linhas: Array<LinhaDeMenu | false | null | undefined>; fim: LucideIcon }) {
  const Fim = fim;
  return (
    <div className="q-lista ct-menu-lista">
      {linhas.map(
        (l) =>
          l && (
            <button
              key={l.chave}
              type="button"
              className="q-linha"
              data-ct-m={l.chave}
              disabled={l.desligada}
              onClick={l.acao}
            >
              <span className="q-ic" aria-hidden>
                <l.Icone />
              </span>
              <span>
                <b>{l.titulo}</b>
                {l.detalhe && <small>{l.detalhe}</small>}
              </span>
              <span className="q-fim" aria-hidden>
                <Fim />
              </span>
            </button>
          ),
      )}
    </div>
  );
}
