import { type MotivoDescarte, motivoLegivel, ROTULO_MOTIVO } from '@core';
import {
  ArrowRight,
  ChartColumn,
  Check,
  CircleCheck,
  CircleX,
  FileText,
  Layers,
  Minus,
  Plus,
  Table2,
  TriangleAlert,
  Upload,
  WalletCards,
  X,
} from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';

import { ativarNotasDoBaralho } from '../../../data/apiAnki';
import { type ImportAnkiResposta, importarBaralhoAnki, soAColecao } from '../../../data/importarAnki';
import { noHeadset } from '../../../lib/dispositivo/telaNovaDoQuest';
import { numero, t, tp } from '../../../lib/i18n';
import type { AbaDeCartoes } from '../../../lib/rotas';
import { CabecaDoCartao } from './pecas';

/**
 * A ABA "TRAZER E LEVAR" — porte de `ctAnki` e `ctTrazer` (`cartoes.js:438-497`).
 *
 * TRAZER é o fluxo que já existia em `BaralhoAnki.tsx`, com o desenho novo e o relatório do que veio e
 * do que não veio. Uma diferença do protótipo, que é do comportamento real: no app a leitura do
 * arquivo JÁ GUARDA as notas no baralho (`POST /api/import/anki` grava ao ler). O que a pessoa decide
 * depois é quantas viram cartão agora. Por isso o relatório diz "veio", e o botão é "Ativar".
 *
 * LEVAR são os quatro formatos de `ExportarVocabulario`, que já saem de verdade.
 *
 * FORA DESTA FATIA (`fidelidade/ficou-de-fora.md`): colar uma lista, escolher o destino de cada campo
 * do Anki, a demonstração "nasceu da legenda", as anotações da Leitura e levar só um baralho.
 */

export type FormatoDeLevar = 'apkg' | 'csv' | 'tsv' | 'txt';

/** Quantas notas ativar por padrão, e o teto de uma vez só (o mesmo de `BaralhoAnki.tsx`). */
const ATIVAR_DE_INICIO = 20;
const TETO_DE_ATIVAR = 300;

/** Um item de "o que veio" e "o que não veio" (`ctItem`, `cartoes.js:441`). */
function Item({ veio, titulo, detalhe }: { veio: boolean; titulo: ReactNode; detalhe?: ReactNode }) {
  return (
    <li className={veio ? 'vem' : 'nao'}>
      {veio ? <CircleCheck aria-hidden /> : <CircleX aria-hidden />}
      <span>
        <b>{titulo}</b>
        {detalhe && <small>{detalhe}</small>}
      </span>
    </li>
  );
}

export default function TrazerELevar({
  idioma,
  idiomaNativo,
  total,
  aoIrAba,
  aoMudou,
  aoLevar,
}: {
  /** Os idiomas a atribuir ao que for trazido: o Anki não guarda isso de forma confiável. */
  idioma: string;
  idiomaNativo: string;
  /** Cartões no baralho; `null` enquanto não se sabe (sem conta, ou carregando). */
  total: number | null;
  aoIrAba: (aba: AbaDeCartoes) => void;
  /** O baralho mudou (notas trazidas ou ativadas): as contagens precisam ser lidas de novo. */
  aoMudou: () => void;
  /** Abre a exportação no formato escolhido. */
  aoLevar: (formato: FormatoDeLevar) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState('');
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [lido, setLido] = useState<ImportAnkiResposta | null>(null);
  const [ativar, setAtivar] = useState(ATIVAR_DE_INICIO);
  const [ativando, setAtivando] = useState(false);
  const [ativadas, setAtivadas] = useState<number | null>(null);

  /* A ordem em que a rota lê os campos: o primeiro é a palavra, o segundo a tradução, o terceiro a frase. */
  const destinos = [t('Palavra'), t('Tradução'), t('Frase de exemplo')];

  const recomecar = () => {
    setLido(null);
    setAtivadas(null);
    setErro(null);
    setNome('');
  };
  const escolher = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    recomecar();
    setNome(arquivo.name);
    setLendo(true);
    try {
      const r = await importarBaralhoAnki(await soAColecao(arquivo), idioma, idiomaNativo);
      setLido(r);
      const pode = Math.max(0, r.resumo.notas - r.resumo.descartadas);
      setAtivar(Math.min(ATIVAR_DE_INICIO, pode));
      aoMudou();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLendo(false);
    }
  };
  /** O que dá para ativar: tudo o que entrou, menos o que a régua de qualidade recusou. */
  const podeAtivar = lido ? Math.max(0, lido.resumo.notas - lido.resumo.descartadas) : 0;
  const tetoDeAgora = Math.min(TETO_DE_ATIVAR, podeAtivar);
  const confirmar = async () => {
    if (!lido || !ativar) return;
    setAtivando(true);
    setErro(null);
    try {
      const r = await ativarNotasDoBaralho(lido.deckId, ativar);
      setAtivadas(r.ativadas);
      aoMudou();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setAtivando(false);
    }
  };

  const avisoDeErro = erro && (
    <div className="q-aviso" role="alert">
      <span className="qv-aviso-texto">
        <TriangleAlert aria-hidden />
        <span>{erro}</span>
      </span>
    </div>
  );

  let anki: ReactNode;
  if (lido && ativadas !== null) {
    /* Pronto (`cartoes.js:446-448`). */
    anki = (
      <section className="q-cartao ct-anki" data-testid="anki-trazido">
        <div className="q-cartao fundo qr-fecho">
          <span className="q-ic">
            <CircleCheck aria-hidden />
          </span>
          <div>
            <h2>
              {t('{notas} notas trazidas, {ativadas} ativadas', {
                notas: numero(lido.resumo.notas),
                ativadas: numero(ativadas),
              })}
            </h2>
            <p>
              {t('“{nome}” virou um baralho.', { nome: lido.baralhos?.[0] || nome })}{' '}
              {ativadas > 0
                ? tp(ativadas, 'A primeira entra como nova.', 'As {n} primeiras entram como novas.')
                : t('Nenhuma foi ativada: as notas ficam guardadas até você ativar.')}
            </p>
          </div>
        </div>
        <div className="q-acoes">
          <button type="button" className="q-ctl pri" onClick={() => aoIrAba('baralhos')}>
            <Layers aria-hidden /> {t('Ver nos baralhos')}
          </button>
          <button type="button" className="q-ctl" onClick={recomecar}>
            <Upload aria-hidden /> {t('Trazer outro')}
          </button>
        </div>
      </section>
    );
  } else if (lido) {
    /* O relatório do que veio e do que não veio (`cartoes.js:449-465`), com o que a rota devolveu. */
    const r = lido.resumo;
    const primeiro = lido.amostra[0];
    const motivos = Object.entries(r.porMotivo)
      .map(([m, n]) => `${n} ${t(ROTULO_MOTIVO[m as MotivoDescarte]?.titulo ?? motivoLegivel(m)).toLowerCase()}`)
      .join(' · ');
    anki = (
      <section className="q-cartao ct-anki" data-testid="anki-lido">
        <CabecaDoCartao
          titulo={nome}
          sub={t(
            '{notas} notas lidas e guardadas no baralho: {novas} novas, {atualizadas} atualizadas, {iguais} iguais. Nenhuma virou cartão ainda.',
            {
              notas: numero(r.notas),
              novas: numero(r.novas),
              atualizadas: numero(r.atualizadas),
              iguais: numero(r.iguais),
            },
          )}
          extra={
            <button type="button" className="q-ctl" onClick={recomecar}>
              <X aria-hidden /> {t('Trocar arquivo')}
            </button>
          }
        />
        <div className="q-grade g2 ct-vem-nao-vem">
          <div className="q-cartao fundo">
            <p className="q-rotulo">{t('O que veio')}</p>
            <ul className="ct-itens">
              <Item
                veio
                titulo={tp(r.notas, '{n} nota, todos os campos', '{n} notas, todos os campos', {
                  n: numero(r.notas),
                })}
                detalhe={
                  lido.campos.length > 0
                    ? t('Guardados pelo nome que têm no Anki: {campos}.', { campos: lido.campos.join(', ') })
                    : undefined
                }
              />
              <Item veio titulo={t('As etiquetas')} detalhe={t('Ficam guardadas em cada nota.')} />
              {lido.notetype && (
                <Item
                  veio
                  titulo={t('O tipo de nota')}
                  detalhe={t('{tipo}. Reimportar atualiza as notas, sem duplicar.', { tipo: lido.notetype })}
                />
              )}
            </ul>
          </div>
          <div className="q-cartao fundo">
            <p className="q-rotulo">{t('O que não veio')}</p>
            <ul className="ct-itens">
              <Item veio={false} titulo={t('Áudio e imagens')} detalhe={t('O cartão usa a voz do aparelho.')} />
              <Item
                veio={false}
                titulo={t('A agenda do Anki')}
                detalhe={t('Intervalos e histórico ficam lá. Aqui as notas entram como novas e a agenda recomeça.')}
              />
              <Item
                veio={false}
                titulo={t('O desenho do cartão')}
                detalhe={t('Modelos com HTML e CSS não são usados: cada nota vira palavra, tradução e frase.')}
              />
              {r.descartadas > 0 && (
                <Item
                  veio={false}
                  titulo={tp(
                    r.descartadas,
                    '{n} nota fora da régua de qualidade',
                    '{n} notas fora da régua de qualidade',
                    {
                      n: numero(r.descartadas),
                    },
                  )}
                  detalhe={motivos || undefined}
                />
              )}
            </ul>
          </div>
        </div>
        {lido.campos.length > 0 && (
          <div className="q-secao">
            <header>
              <div>
                <h3>{t('De qual campo vem cada coisa')}</h3>
                <p>{t('O app leu os campos nesta ordem.')}</p>
              </div>
            </header>
            <div className="ct-mapear">
              {lido.campos.slice(0, destinos.length).map((campo, i) => (
                <span key={campo} className="ct-campo-do-anki">
                  <span className="q-tag off">{campo}</span>
                  <ArrowRight aria-hidden />
                  <b>{destinos[i]}</b>
                </span>
              ))}
            </div>
          </div>
        )}
        {primeiro && (
          <div className="q-secao">
            <header>
              <div>
                <h3>{t('Como fica o primeiro cartão')}</h3>
              </div>
            </header>
            <div className="ct-previa">
              <div>
                <span className="q-rotulo">{t('Frente')}</span>
                <b lang={idioma || undefined}>{primeiro.frente}</b>
                {primeiro.exemplo && <small lang={idioma || undefined}>“{primeiro.exemplo}”</small>}
              </div>
              <div>
                <span className="q-rotulo">{t('Verso')}</span>
                <b>{primeiro.verso}</b>
              </div>
            </div>
          </div>
        )}
        {lido.truncado && (
          <div className="q-aviso" role="note">
            <span className="qv-aviso-texto">
              <TriangleAlert aria-hidden />
              <span>
                {t(
                  'Este arquivo tem {total} notas, mais do que dá para ler de uma vez; só as primeiras {lidas} entraram. Traga o mesmo arquivo de novo para o resto.',
                  { total: numero(lido.totalNoArquivo), lidas: numero(r.notas) },
                )}
              </span>
            </span>
          </div>
        )}
        {podeAtivar === 0 ? (
          <div className="q-aviso" role="note">
            <span className="qv-aviso-texto">
              <TriangleAlert aria-hidden />
              <span>
                {t(
                  'Nenhuma nota deste baralho passou pela régua de qualidade. Reveja os campos no arquivo original e traga de novo.',
                )}
              </span>
            </span>
          </div>
        ) : (
          <div className="q-ajuste">
            <div>
              <b>{t('Quantas ativar agora')}</b>
              <small>
                {t('As outras ficam guardadas no baralho e você ativa aos poucos. Nunca entram todas de uma vez.')}
              </small>
            </div>
            <span className="qr-passo">
              <button
                type="button"
                className="q-ctl"
                aria-label={t('Diminuir: {rotulo}', { rotulo: t('Notas para ativar') })}
                disabled={ativar <= 5}
                onClick={() => setAtivar((v) => Math.max(Math.min(5, tetoDeAgora), v - 5))}
              >
                <Minus aria-hidden />
              </button>
              <input type="number" inputMode="numeric" value={ativar} aria-label={t('Notas para ativar')} readOnly />
              <button
                type="button"
                className="q-ctl"
                aria-label={t('Aumentar: {rotulo}', { rotulo: t('Notas para ativar') })}
                disabled={ativar >= tetoDeAgora}
                onClick={() => setAtivar((v) => Math.min(tetoDeAgora, v + 5))}
              >
                <Plus aria-hidden />
              </button>
            </span>
          </div>
        )}
        {avisoDeErro}
        <div className="q-acoes">
          {podeAtivar > 0 && (
            <button type="button" className="q-ctl pri" disabled={ativando} onClick={() => void confirmar()}>
              <Check aria-hidden /> {t('Ativar {n}', { n: numero(ativar) })}
            </button>
          )}
          <button type="button" className="q-ctl" onClick={() => setAtivadas(0)}>
            {t('Deixar para depois')}
          </button>
        </div>
      </section>
    );
  } else {
    /* A área de soltar (`cartoes.js:443-445`). */
    anki = (
      <section className="q-cartao ct-anki" data-testid="anki-escolher">
        <CabecaDoCartao
          titulo={t('Baralho do Anki (.apkg)')}
          sub={t('Os três formatos do Anki, inclusive o atual. Depois de ler, a tela diz o que veio e o que não veio.')}
          extra={<span className="q-tag">Anki</span>}
        />
        <input
          ref={entrada}
          type="file"
          className="sr"
          accept=".apkg,.txt,.csv,.tsv"
          aria-label={t('Arquivo do baralho')}
          data-testid="anki-arquivo"
          onChange={(e) => {
            void escolher(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="ct-soltar"
          disabled={lendo}
          aria-busy={lendo}
          onClick={() => entrada.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void escolher(e.dataTransfer.files?.[0]);
          }}
        >
          <span className="q-ic">
            <Upload aria-hidden />
          </span>
          {lendo ? (
            <b role="status">{t('Lendo {nome}…', { nome })}</b>
          ) : (
            <b>{noHeadset() ? t('Toque para escolher o arquivo') : t('Solte o arquivo .apkg aqui')}</b>
          )}
          <small>
            {lendo
              ? t('Baralho grande leva alguns segundos.')
              : t('ou toque para escolher · também .txt, .csv e .tsv · até 200 MB')}
          </small>
        </button>
        {avisoDeErro}
      </section>
    );
  }

  const formatos: Array<[typeof WalletCards, string, string, FormatoDeLevar]> = [
    [
      WalletCards,
      t('Anki (.apkg)'),
      t('Abre no Anki de qualquer aparelho. Vai sem mídia e sem a agenda daqui.'),
      'apkg',
    ],
    [Table2, t('Planilha (CSV)'), t('Palavra, tradução, frase e nível.'), 'csv'],
    [FileText, t('Texto para o Quizlet'), t('Uma linha por palavra, pronta para colar.'), 'tsv'],
    [ChartColumn, t('Relatório'), t('O resumo do seu progresso, para ler ou mandar ao professor.'), 'txt'],
  ];

  return (
    <>
      {/* Uma coluna só: o cartão "Colar uma lista", que dividia a linha no protótipo, é fatia seguinte. */}
      <div className="q-grade g2 ct-trazer-topo ct-lendo">{anki}</div>
      <section className="q-secao ct-levar" data-testid="levar">
        <header>
          <div>
            <h2>{t('Levar')}</h2>
            <p>{t('Suas palavras são suas. Saem inteiras, em formato aberto, quando você quiser.')}</p>
          </div>
          {total !== null && total > 0 && <span className="q-chip">{t('Tudo · {n}', { n: numero(total) })}</span>}
        </header>
        <div className="q-grade g4">
          {formatos.map(([Icone, titulo, detalhe, formato]) => (
            <button key={formato} type="button" className="q-tile" onClick={() => aoLevar(formato)}>
              <span className="q-ic">
                <Icone aria-hidden />
              </span>
              <b>{titulo}</b>
              <span className="q-d">{detalhe}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
