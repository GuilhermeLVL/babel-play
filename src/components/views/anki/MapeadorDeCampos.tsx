import '../../../styles/mapeadorDeCampos.css';

import { ArrowRight, CircleHelp, Info, Undo2 } from 'lucide-react';
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  type EstruturaLida,
  PAPEIS_NA_IMPORTACAO,
  type PapelNaImportacao,
  preverNotas,
  trocarPapel,
} from '../../../core/anki';
import { FLAG_ANKI_MAPEADOR } from '../../../core/planos';
import type { OpcoesDoMapeador } from '../../../data/importarAnki';
import { useFlag } from '../../../lib/flags';
import { numero, t, tp } from '../../../lib/i18n';

/**
 * O MAPEADOR DE CAMPOS (openspec `motor-anki-mapeador`, flag `anki_mapeador`): aparece ANTES do primeiro lote, só quando
 * o app não tem certeza de qual campo é a palavra e qual é o significado (confiança baixa, tipo de nota com mais de dois
 * campos). A pessoa vê os campos reais do baralho com uma amostra, troca o papel de qualquer um e confere o resultado.
 * O que ela confirma fica só neste aparelho (`src/lib/anki/perfisDeMapeamento.ts`); nada disto vai ao servidor.
 */

const ROTULO_DO_PAPEL: Record<PapelNaImportacao, () => string> = {
  palavra: () => t('Palavra'),
  significado: () => t('Tradução'),
  frase: () => t('Frase de exemplo'),
  leitura: () => t('Leitura'),
  audio: () => t('Áudio'),
  imagem: () => t('Imagem'),
  nenhum: () => t('Não usar'),
};

/** O mapeamento serve se há de onde tirar a frente (palavra ou frase) e o verso. */
const completo = (papeis: PapelNaImportacao[]) =>
  (papeis.includes('palavra') || papeis.includes('frase')) && papeis.includes('significado');

function DeUmTipo({
  estrutura,
  papeis,
  aoTrocar,
}: {
  estrutura: EstruturaLida;
  papeis: PapelNaImportacao[];
  aoTrocar: (indice: number, papel: PapelNaImportacao) => void;
}) {
  const id = useId();
  const previa = useMemo(() => preverNotas(estrutura.amostra, papeis), [estrutura.amostra, papeis]);
  const campos = papeis.map((_, i) => estrutura.campos[i] || t('Campo {n}', { n: numero(i + 1) }));
  const duvidosos = new Set(
    (['palavra', 'significado'] as const)
      .map((p) => estrutura.palpites[p])
      .filter((p) => p?.confianca === 'baixa')
      .map((p) => p!.indice),
  );
  return (
    <section className="mapeador-tipo" aria-labelledby={`${id}-titulo`}>
      <h3 id={`${id}-titulo`}>
        {estrutura.notetype ? t('Tipo de nota {tipo}', { tipo: estrutura.notetype }) : t('Campos do baralho')}{' '}
        <small>{tp(estrutura.notas, '{n} nota', '{n} notas', { n: numero(estrutura.notas) })}</small>
      </h3>
      <ul className="mapeador-campos">
        {campos.map((nome, i) => {
          const amostra = estrutura.amostra
            .map((linha) => linha[i])
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={i} className={duvidosos.has(i) ? 'duvida' : undefined}>
              <div className="mapeador-nome">
                <code>{nome}</code>
                {duvidosos.has(i) && (
                  <span className="mapeador-selo">
                    <CircleHelp aria-hidden /> {t('Conferir')}
                  </span>
                )}
              </div>
              <span className="mapeador-amostra">{amostra || '—'}</span>
              <select
                aria-label={t('Papel do campo {campo}', { campo: nome })}
                value={papeis[i]}
                onChange={(e) => aoTrocar(i, e.target.value as PapelNaImportacao)}
              >
                {PAPEIS_NA_IMPORTACAO.map((p) => (
                  <option key={p} value={p}>
                    {ROTULO_DO_PAPEL[p]()}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
      <div className="mapeador-previa" aria-live="polite">
        <span className="label-mono">{t('Como vai ficar')}</span>
        {completo(papeis) ? (
          <ul>
            {previa.map((n, i) => (
              <li key={i}>
                <b>{n.frente || '—'}</b> <ArrowRight aria-hidden /> <span>{n.verso || '—'}</span>
                {n.exemplo && <small>{n.exemplo}</small>}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('Falta escolher a palavra e a tradução: sem as duas, nenhuma nota vira cartão.')}</p>
        )}
      </div>
    </section>
  );
}

/** O painel: um bloco por tipo de nota em dúvida e os dois botões. */
export function MapeadorDeCampos({
  estruturas,
  aoConfirmar,
  aoCancelar,
  introducao,
  rotuloConfirmar,
  ocupado = false,
}: {
  estruturas: EstruturaLida[];
  aoConfirmar: (escolhas: Record<string, PapelNaImportacao[]>) => void;
  aoCancelar: () => void;
  /** O parágrafo de cima. Sem ele, o da importação ("nada foi enviado ainda"). */
  introducao?: string;
  /** O botão de confirmar. Sem ele, "Importar assim". */
  rotuloConfirmar?: string;
  /** Enquanto o pedido está em andamento, os dois botões ficam parados. */
  ocupado?: boolean;
}) {
  const [escolhas, setEscolhas] = useState<Record<string, PapelNaImportacao[]>>(() =>
    Object.fromEntries(estruturas.map((e) => [e.hash, [...e.papeis]])),
  );
  const pronto = estruturas.every((e) => completo(escolhas[e.hash] ?? []));
  return (
    <div className="mapeador" role="group" aria-label={t('Confira os campos')} data-testid="anki-mapeador">
      <header>
        <h2>{t('Confira os campos')}</h2>
        <p className="aviso-info">
          <Info aria-hidden />
          <span>
            {introducao ??
              t(
                'Não deu para ter certeza de qual campo é a palavra e qual é a tradução. Ajuste se precisar: nada foi enviado ainda, e o que você escolher fica só neste aparelho.',
              )}
          </span>
        </p>
      </header>
      {estruturas.map((e) => (
        <DeUmTipo
          key={e.hash}
          estrutura={e}
          papeis={escolhas[e.hash] ?? e.papeis}
          aoTrocar={(i, papel) =>
            setEscolhas((antes) => ({ ...antes, [e.hash]: trocarPapel(antes[e.hash] ?? e.papeis, i, papel) }))
          }
        />
      ))}
      <p className="mapeador-nota">
        {t('Campos que ficam sem papel continuam guardados na nota, com o nome que têm no Anki.')}
      </p>
      <div className="mapeador-acoes">
        <button type="button" className="q-ctl" disabled={ocupado} onClick={aoCancelar}>
          {t('Cancelar')}
        </button>
        <button type="button" className="q-ctl pri" disabled={!pronto || ocupado} onClick={() => aoConfirmar(escolhas)}>
          {rotuloConfirmar ?? t('Importar assim')}
        </button>
      </div>
    </div>
  );
}

/**
 * A ponte entre a importação (promessa) e a tela (estado). Com a flag desligada `opcoes` é `undefined` e o fluxo é o de
 * sempre. Com ela ligada, `opcoes.aoConferir` faz `painel` aparecer e só resolve quando a pessoa confirma ou cancela.
 */
export function useConferenciaDoMapeador(): {
  opcoes: OpcoesDoMapeador | undefined;
  painel: ReactNode;
  conferindo: boolean;
} {
  const ligado = useFlag(FLAG_ANKI_MAPEADOR);
  const [pendente, setPendente] = useState<{
    estruturas: EstruturaLida[];
    resolver: (escolhas: Record<string, PapelNaImportacao[]> | null) => void;
  } | null>(null);
  /* Fechar a tela com o painel aberto cancela a importação em vez de deixar a promessa pendurada. */
  const pendenteRef = useRef(pendente);
  pendenteRef.current = pendente;
  useEffect(() => () => pendenteRef.current?.resolver(null), []);
  const opcoes = useMemo<OpcoesDoMapeador | undefined>(
    () =>
      ligado
        ? { aoConferir: (estruturas) => new Promise((resolver) => setPendente({ estruturas, resolver })) }
        : undefined,
    [ligado],
  );
  const painel = pendente ? (
    <MapeadorDeCampos
      estruturas={pendente.estruturas}
      aoConfirmar={(escolhas) => {
        pendente.resolver(escolhas);
        setPendente(null);
      }}
      aoCancelar={() => {
        pendente.resolver(null);
        setPendente(null);
      }}
    />
  ) : null;
  return { opcoes, painel, conferindo: !!pendente };
}

/** Depois de importar: este tipo de nota foi lido pelo mapeamento que a pessoa salvou antes, e ela pode esquecê-lo. */
export function AvisoDePerfilReconhecido({
  reconhecidos,
  aoEsquecer,
}: {
  reconhecidos: Array<{ hash: string; notetype: string }>;
  aoEsquecer: (hash: string) => void;
}) {
  const [esquecidos, setEsquecidos] = useState<string[]>([]);
  if (!reconhecidos.length) return null;
  return (
    <ul className="mapeador-perfis" data-testid="anki-perfil-reconhecido">
      {reconhecidos.map((r) => (
        <li key={r.hash} className="aviso-info">
          <Info aria-hidden />
          <span>
            {esquecidos.includes(r.hash)
              ? t('Esquecido. Na próxima vez o app volta a adivinhar os campos deste tipo de nota.')
              : t('Campos lidos pelo mapeamento de um baralho anterior ({tipo}).', { tipo: r.notetype || '—' })}
          </span>
          {!esquecidos.includes(r.hash) && (
            <button
              type="button"
              className="q-ctl"
              onClick={() => {
                aoEsquecer(r.hash);
                setEsquecidos((antes) => [...antes, r.hash]);
              }}
            >
              <Undo2 aria-hidden /> {t('Esquecer')}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
