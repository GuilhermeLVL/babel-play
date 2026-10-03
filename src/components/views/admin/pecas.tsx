import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../lib/i18n';
import Ladrilho from '../../ui/Ladrilho';
import Vazio from '../../ui/Vazio';
import type { Carga } from './useCarga';

/**
 * AS PEÇAS DA ADMINISTRAÇÃO, nos dois desenhos. A tela tem UMA lógica; cada peça só escolhe a
 * apresentação: o desenho novo usa as peças `.q-*` (alvos de 56 px, `.q-tabela`, `.q-num`), o de
 * sempre usa as de `ui/` e as classes do protótipo aprovado. CSS próprio, só em `styles/admin.css`.
 */

export type Tom = 'neutro' | 'bom' | 'atencao' | 'erro';

export function Etiqueta({ tom = 'neutro', children }: { tom?: Tom; children: ReactNode }) {
  return <span className={`ad-tag ad-tag-${tom}`}>{children}</span>;
}

export function Botao({
  children,
  aoClicar,
  desabilitado,
  tom,
  titulo,
}: {
  children: ReactNode;
  aoClicar: () => void;
  desabilitado?: boolean;
  /** `principal` é a ação da tela; `perigo` é a que tira acesso ou mexe em dinheiro. */
  tom?: 'principal' | 'perigo';
  titulo?: string;
}) {
  const questNovo = useQuestNovo();
  const classe = questNovo
    ? `q-ctl ${tom === 'principal' ? 'pri' : tom === 'perigo' ? 'perigo' : ''}`
    : `ad-btn ${tom === 'principal' ? 'btn-solid' : 'btn-outline'} ${tom === 'perigo' ? 'ad-perigo' : ''}`;
  return (
    <button type="button" className={classe} onClick={aoClicar} disabled={desabilitado} title={titulo}>
      {children}
    </button>
  );
}

/** Um número de resumo. `null` = ainda não chegou (esqueleto, nunca "0"). */
export function Kpi({
  rotulo,
  valor,
  nota,
  tom,
}: {
  rotulo: string;
  valor: string | number | null;
  nota?: string;
  tom?: 'ink' | 'good' | 'warn' | 'error';
}) {
  const questNovo = useQuestNovo();
  if (!questNovo) return <Ladrilho rotulo={rotulo} valor={valor} nota={nota} tom={tom} />;
  return (
    <div className="q-num ad-kpi" data-tom={tom}>
      <b>{valor ?? '…'}</b>
      <span>{rotulo}</span>
      {nota && <small>{nota}</small>}
    </div>
  );
}

export function Secao({
  titulo,
  sub,
  acoes,
  children,
}: {
  titulo: string;
  sub?: string;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  const questNovo = useQuestNovo();
  return (
    <section className={questNovo ? 'q-secao ad-secao' : 'ad-secao'}>
      <header className="ad-secao-cab">
        <div>
          {questNovo ? <h2>{titulo}</h2> : <h2 className="ad-h2">{titulo}</h2>}
          {sub && <p>{sub}</p>}
        </div>
        {acoes && <div className="ad-secao-acoes">{acoes}</div>}
      </header>
      {children}
    </section>
  );
}

/** A tabela que, estreita, vira lista: cada `td` leva `data-rotulo` e o CSS o mostra antes do valor. */
export function Tabela({ rotulo, colunas, children }: { rotulo: string; colunas: string[]; children: ReactNode }) {
  const questNovo = useQuestNovo();
  return (
    <div
      className={`${questNovo ? 'q-tabela-caixa' : 'ad-caixa'} ad-caixa-lista`}
      role="region"
      aria-label={rotulo}
      tabIndex={0}
    >
      <table className={`${questNovo ? 'q-tabela' : 'ad-tabela'} ad-tabela-lista`}>
        <thead>
          <tr>
            {colunas.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Um estado sem lista (vazio, erro): a peça de sempre, ou o `.q-vazio` do desenho novo. */
export function Aviso({
  icone,
  titulo,
  explicacao,
  acao,
}: {
  icone: ReactNode;
  titulo: string;
  explicacao?: string;
  acao?: { rotulo: string; aoClicar: () => void };
}) {
  const questNovo = useQuestNovo();
  if (!questNovo)
    return <Vazio icone={icone} titulo={titulo} explicacao={explicacao} acao={acao} className="ad-vazio" />;
  return (
    <div className="q-vazio ad-vazio" role="status">
      <span className="q-ic" aria-hidden>
        {icone}
      </span>
      <h2>{titulo}</h2>
      {explicacao && <p>{explicacao}</p>}
      {acao && (
        <button type="button" className="q-ctl pri" onClick={acao.aoClicar}>
          {acao.rotulo}
        </button>
      )}
    </div>
  );
}

/**
 * Carregando, erro, vazio ou o conteúdo. Nunca tela em branco: cada estado diz o que houve e, no
 * erro, oferece tentar de novo.
 */
export function Estado<T>({
  carga,
  vazio,
  estaVazio,
  children,
}: {
  carga: Carga<T>;
  vazio?: { icone: ReactNode; titulo: string; explicacao: string };
  estaVazio?: (dados: T) => boolean;
  children: (dados: T) => ReactNode;
}) {
  const questNovo = useQuestNovo();
  if (carga.estado === 'carregando')
    return (
      <div className={questNovo ? 'q-carregando ad-carregando' : 'carregando-da-tela ad-carregando'} role="status">
        {t('Carregando…')}
      </div>
    );
  if (carga.estado === 'erro' || carga.dados === null)
    return (
      <Aviso
        icone={<CircleAlert aria-hidden />}
        titulo={t('Não foi possível carregar')}
        explicacao={carga.erro}
        acao={{ rotulo: t('Tentar de novo'), aoClicar: carga.recarregar }}
      />
    );
  if (vazio && estaVazio?.(carga.dados))
    return <Aviso icone={vazio.icone} titulo={vazio.titulo} explicacao={vazio.explicacao} />;
  return <div aria-busy={carga.atualizando}>{children(carga.dados)}</div>;
}
