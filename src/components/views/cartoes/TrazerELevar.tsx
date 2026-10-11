import { type MotivoDescarte, motivoLegivel, ROTULO_MOTIVO } from '@core';
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronRight,
  CircleCheck,
  CircleX,
  Download,
  Layers,
  Minus,
  Plus,
  TriangleAlert,
  Undo2,
  Upload,
  WalletCards,
} from 'lucide-react';
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';

import { ativarNotasDoBaralho, purgarBaralho } from '../../../data/apiAnki';
import { type ImportAnkiResposta, importarBaralhoAnki, soAColecao } from '../../../data/importarAnki';
import { numero, t, tp } from '../../../lib/i18n';
import { polido, reduz } from '../../../lib/polimento/base';
import { confete } from '../../../lib/polimento/planos';
import { sentir } from '../../../lib/polimento/sentidos';
import { toast } from '../../Toast';
import { fecharAFolhaDe, FolhaDeCartoes, LinhasDeMenu } from './pecas';

/**
 * "TRAZER E LEVAR", EM FOLHAS — porte de `ctAbrirTrazerELevar` e `ctAbrirAnki` (`cartoes.js:1011-1027,
 * 1062-1130` do protótipo enxuto). A aba virou folha do "…"; o Anki entra em dois passos.
 *
 * O FLUXO DO ANKI (`FluxoDoAnki`) é o MESMO aqui e em "Trazer uma fonte", dentro do catálogo de conteúdo
 * (`components/conteudo/CatalogoDeConteudo.tsx`), e o baralho novo já vira o conteúdo escolhido.
 *
 * O QUE O APP FAZ HOJE, dito como é (e por isso os passos não são os do protótipo ao pé da letra):
 *  · ler o arquivo JÁ GUARDA as notas no baralho (`POST /api/import/anki` grava ao ler); nenhuma vira
 *    cartão até a pessoa ativar. Não existe "ensaio sem gravar";
 *  · a agenda e o histórico do Anki NÃO vêm (o dono ainda não decidiu essa importação): não há a escolha
 *    "com a agenda | do zero", e o passo 1 diz que a agenda recomeça aqui;
 *  · áudio e imagens não vêm; o destino de cada campo é o que a rota leu, sem escolha.
 * "DESFAZER ESTA IMPORTAÇÃO" só aparece quando o app cumpre: o baralho nasceu desta leitura e nenhuma
 * nota virou cartão. Aí apagar o baralho (`DELETE /api/anki/decks/:id`) devolve tudo ao que era. Depois
 * de ativar, os cartões já estão no caderno e a purga não os tira: o desfazer some.
 *
 * FORA (o app não faz): colar uma lista de palavras, "Juntar a cena" em massa e escolher o destino de
 * cada campo.
 */

export type FormatoDeLevar = 'apkg' | 'csv' | 'tsv' | 'txt';

/** Quantas notas ativar por padrão, e o teto de uma vez só (o mesmo de `BaralhoAnki.tsx`). */
const ATIVAR_DE_INICIO = 20;
const TETO_DE_ATIVAR = 300;

/** Os arquivos que a rota do Anki lê. */
export const ARQUIVOS_DO_ANKI = '.apkg,.colpkg,.txt,.csv,.tsv';

/** Um item de "o que vem" e "o que não vem" (`ctItem`, `cartoes.js:510`). */
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

/** O baralho que chegou, como fonte de conteúdo. */
export interface BaralhoTrazido {
  tipo: 'anki';
  id: string;
  nome: string;
}

/**
 * O ANKI EM DOIS PASSOS, num diálogo: lê o arquivo ao abrir; passo 1, o que veio e o que não veio, e
 * quantas notas ativar; passo 2, o relatório.
 */
export function FluxoDoAnki({
  arquivo,
  idioma,
  idiomaNativo,
  aoMudou,
  aoTrouxe,
  aoVerNoCatalogo,
  aoFechar,
}: {
  arquivo: File;
  /** Os idiomas a atribuir ao que for trazido: o Anki não guarda isso de forma confiável. */
  idioma: string;
  idiomaNativo: string;
  /** O baralho mudou (notas trazidas, ativadas ou apagadas): as contagens precisam ser lidas de novo. */
  aoMudou?: () => void;
  /** Notas viraram cartão: o baralho novo vira o conteúdo escolhido (quem chama relê o catálogo). */
  aoTrouxe?: (fonte: BaralhoTrazido) => void | Promise<void>;
  /** "Ver no catálogo": fecha e abre o catálogo de conteúdo. */
  aoVerNoCatalogo?: () => void;
  aoFechar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const depois = useRef<(() => void) | null>(null);
  const [lido, setLido] = useState<ImportAnkiResposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ativar, setAtivar] = useState(ATIVAR_DE_INICIO);
  const [ocupado, setOcupado] = useState(false);
  /** `null` no passo 1; no passo 2, quantas viraram cartão. */
  const [ativadas, setAtivadas] = useState<number | null>(null);
  const [escolhido, setEscolhido] = useState(false);
  const nome = arquivo.name;

  /* Lê ao abrir. A leitura é idempotente no servidor (reimportar atualiza, sem duplicar), então o efeito
     em dobro do modo estrito só repete um pedido. */
  const avisar = useRef(aoMudou);
  avisar.current = aoMudou;
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await importarBaralhoAnki(await soAColecao(arquivo), idioma, idiomaNativo);
        if (!vivo) return;
        setLido(r);
        setAtivar(Math.min(ATIVAR_DE_INICIO, Math.max(0, r.resumo.notas - r.resumo.descartadas)));
        avisar.current?.();
      } catch (e) {
        if (vivo) setErro((e as Error).message || t('Não deu para trazer este arquivo do Anki.'));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [arquivo, idioma, idiomaNativo]);

  const nomeDoBaralho = lido?.baralhos?.[0] || nome.replace(/\.[^.]+$/, '');
  /** O que dá para ativar: tudo o que entrou, menos o que a régua de qualidade recusou. */
  const podeAtivar = lido ? Math.max(0, lido.resumo.notas - lido.resumo.descartadas) : 0;
  const tetoDeAgora = Math.min(TETO_DE_ATIVAR, podeAtivar);
  /** O baralho nasceu desta leitura (nada atualizado, nada igual): apagá-lo desfaz a importação inteira. */
  const baralhoNovo = !!lido && lido.resumo.atualizadas === 0 && lido.resumo.iguais === 0;
  const daParaDesfazer = baralhoNovo && (ativadas ?? 0) === 0;

  const confirmar = async () => {
    if (!lido || !ativar || ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await ativarNotasDoBaralho(lido.deckId, ativar);
      setAtivadas(r.ativadas);
      aoMudou?.();
      if (r.ativadas > 0) {
        sentir('sucesso');
        if (polido() && !reduz()) confete(60);
        if (aoTrouxe) {
          await aoTrouxe({ tipo: 'anki', id: lido.deckId, nome: nomeDoBaralho });
          setEscolhido(true);
        }
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  const desfazer = async () => {
    if (!lido || ocupado) return;
    setOcupado(true);
    try {
      const r = await purgarBaralho(lido.deckId);
      aoMudou?.();
      sentir('desliga');
      toast.ok(
        tp(
          r.notasApagadas,
          'Importação desfeita: {n} nota saiu e nada mais mudou.',
          'Importação desfeita: as {n} notas saíram e nada mais mudou.',
          { n: numero(r.notasApagadas) },
        ),
      );
      dialogo.current?.close();
    } catch (e) {
      setErro((e as Error).message);
      setOcupado(false);
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
  const linhaDeDesfazer = daParaDesfazer && lido && (
    <div className="q-ajuste ct-desfazer-importacao">
      <div>
        <b>{t('Desfazer esta importação')}</b>
        <small>
          {tp(
            lido.resumo.notas,
            'Enquanto nenhuma nota virou cartão. Tira a {n} nota lida e apaga o baralho.',
            'Enquanto nenhuma nota virou cartão. Tira as {n} notas lidas e apaga o baralho.',
            { n: numero(lido.resumo.notas) },
          )}
        </small>
      </div>
      <button type="button" className="q-ctl" disabled={ocupado} onClick={() => void desfazer()}>
        <Undo2 aria-hidden /> {t('Desfazer')}
      </button>
    </div>
  );
  const motivos = lido
    ? Object.entries(lido.resumo.porMotivo).map(
        ([m, n]) => [n, t(ROTULO_MOTIVO[m as MotivoDescarte]?.titulo ?? motivoLegivel(m))] as const,
      )
    : [];
  const fechar = () => {
    aoFechar();
    const f = depois.current;
    depois.current = null;
    f?.();
  };

  if (!lido) {
    /* A leitura (ou o erro dela). */
    return (
      <FolhaDeCartoes
        Icone={Upload}
        titulo={t('Trazer do Anki')}
        sub={nome}
        classe="ct-anki ct-anki-1"
        refDialogo={dialogo}
        aoFechar={fechar}
        pe={
          <button type="button" className="q-ctl" onClick={(e) => fecharAFolhaDe(e.currentTarget)}>
            {erro ? t('Fechar') : t('Cancelar')}
          </button>
        }
      >
        {erro ? (
          avisoDeErro
        ) : (
          <div className="q-vazio" role="status" data-testid="anki-lendo">
            <span className="q-ic">
              <Upload aria-hidden />
            </span>
            <h2>{t('Lendo {nome}…', { nome })}</h2>
            <p>{t('Baralho grande leva alguns segundos.')}</p>
          </div>
        )}
      </FolhaDeCartoes>
    );
  }

  const r = lido.resumo;

  if (ativadas !== null) {
    /* Passo 2, o relatório (`ctHtmlDoRelatorio`, `cartoes.js:1087-1098`). */
    return (
      <FolhaDeCartoes
        Icone={CircleCheck}
        titulo={t('Trazer do Anki')}
        sub={t('Passo 2 de 2: o relatório · {nome}', { nome: nomeDoBaralho })}
        classe="ct-anki ct-anki-2"
        refDialogo={dialogo}
        aoFechar={fechar}
        pe={
          <>
            {aoVerNoCatalogo && (
              <button
                type="button"
                className="q-ctl"
                onClick={() => {
                  depois.current = aoVerNoCatalogo;
                  dialogo.current?.close();
                }}
              >
                <Layers aria-hidden /> {t('Ver no catálogo')}
              </button>
            )}
            <button type="button" className="q-ctl pri" onClick={(e) => fecharAFolhaDe(e.currentTarget)}>
              <Check aria-hidden /> {t('Pronto')}
            </button>
          </>
        }
      >
        <div data-testid="anki-trazido" style={{ display: 'contents' }}>
          <div className="q-cartao fundo qr-fecho ct-relatorio-topo">
            <span className="q-ic">
              <CircleCheck aria-hidden />
            </span>
            <div>
              <h2>
                {t('{notas} notas trazidas, {ativadas} ativadas', {
                  notas: numero(r.notas),
                  ativadas: numero(ativadas),
                })}
              </h2>
              <p>
                {ativadas > 0
                  ? tp(ativadas, 'A primeira entra como nova.', 'As {n} primeiras entram como novas.')
                  : t('Nenhuma foi ativada: as notas ficam guardadas até você ativar.')}{' '}
                {escolhido
                  ? t('“{nome}” já é o conteúdo escolhido, nos Cartões e no Jogar.', { nome: nomeDoBaralho })
                  : t('“{nome}” virou um baralho.', { nome: nomeDoBaralho })}
              </p>
            </div>
          </div>
          <div className="q-grade g3 ct-relatorio-numeros">
            {(
              [
                [t('Vieram'), r.notas, 'bom'],
                [t('Ficaram de fora'), r.descartadas, r.descartadas ? 'aviso' : ''],
                [t('Viraram cartão'), ativadas, ''],
              ] as const
            ).map(([rotulo, valor, tom]) => (
              <div key={rotulo} className="q-num">
                <span className="q-rotulo">{rotulo}</span>
                <b className={tom}>{numero(valor)}</b>
              </div>
            ))}
          </div>
          <div className="q-cartao fundo">
            <p className="q-rotulo">{t('Ficaram de fora, e por quê')}</p>
            <ul className="ct-itens">
              {motivos.map(([n, motivo]) => (
                <Item
                  key={motivo}
                  veio={false}
                  titulo={`${numero(n)} · ${motivo}`}
                  detalhe={t('Fora da régua de qualidade. Continuam no seu arquivo.')}
                />
              ))}
              <Item veio={false} titulo={t('Áudio e imagens')} detalhe={t('O cartão usa a voz do aparelho.')} />
              <Item
                veio={false}
                titulo={t('A agenda do Anki')}
                detalhe={t('Intervalos e histórico ficam lá. Aqui as notas entram como novas e a agenda recomeça.')}
              />
            </ul>
          </div>
          {linhaDeDesfazer}
          {avisoDeErro}
        </div>
      </FolhaDeCartoes>
    );
  }

  /* Passo 1: o que veio e o que não veio, os campos e quantas ativar (`ctHtmlDoEnsaio`, `cartoes.js:1064-1085`). */
  const primeiro = lido.amostra[0];
  const destinos = [t('Palavra'), t('Tradução'), t('Frase de exemplo')];
  return (
    <FolhaDeCartoes
      Icone={Upload}
      titulo={t('Trazer do Anki')}
      sub={t('Passo 1 de 2: o que veio · {nome} · nenhuma nota virou cartão ainda', { nome })}
      classe="ct-anki ct-anki-1"
      refDialogo={dialogo}
      aoFechar={fechar}
      pe={
        <>
          <button type="button" className="q-ctl" disabled={ocupado} onClick={() => setAtivadas(0)}>
            {t('Deixar para depois')}
          </button>
          {podeAtivar > 0 && (
            <button type="button" className="q-ctl pri" disabled={ocupado || !ativar} onClick={() => void confirmar()}>
              <Check aria-hidden /> {t('Ativar {n}', { n: numero(ativar) })}
            </button>
          )}
        </>
      }
    >
      <div data-testid="anki-lido" style={{ display: 'contents' }}>
        <p className="qv-nota">
          {t(
            '{notas} notas lidas e guardadas no baralho: {novas} novas, {atualizadas} atualizadas, {iguais} iguais. Nenhuma virou cartão ainda.',
            {
              notas: numero(r.notas),
              novas: numero(r.novas),
              atualizadas: numero(r.atualizadas),
              iguais: numero(r.iguais),
            },
          )}
        </p>
        <div className="q-grade g2 ct-vem-nao-vem">
          <div className="q-cartao fundo">
            <p className="q-rotulo">{t('O que vem')}</p>
            <ul className="ct-itens">
              <Item
                veio
                titulo={tp(r.notas, '{n} nota, todos os campos', '{n} notas, todos os campos', { n: numero(r.notas) })}
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
            <p className="q-rotulo">{t('O que não vem')}</p>
            <ul className="ct-itens">
              <Item
                veio={false}
                titulo={t('A agenda do Anki')}
                detalhe={t('Intervalos e histórico ficam lá. Aqui as notas entram como novas e a agenda recomeça.')}
              />
              <Item veio={false} titulo={t('Áudio e imagens')} detalhe={t('O cartão usa a voz do aparelho.')} />
              {r.descartadas > 0 && (
                <Item
                  veio={false}
                  titulo={tp(r.descartadas, '{n} nota fora da régua de qualidade', '{n} notas fora da régua de qualidade', {
                    n: numero(r.descartadas),
                  })}
                  detalhe={motivos.map(([n, m]) => `${n} ${m.toLowerCase()}`).join(' · ') || undefined}
                />
              )}
              <Item
                veio={false}
                titulo={t('O desenho do cartão')}
                detalhe={t('Modelos com HTML e CSS não são usados: cada nota vira palavra, tradução e frase.')}
              />
            </ul>
          </div>
        </div>
        {(lido.campos.length > 0 || primeiro) && (
          <div className="q-secao">
            <header>
              <div>
                <h3>{t('De qual campo vem cada coisa')}</h3>
                <p>{t('O app leu os campos nesta ordem.')}</p>
              </div>
            </header>
            {lido.campos.length > 0 && (
              <div className="ct-mapear">
                {lido.campos.slice(0, destinos.length).map((campo, i) => (
                  <span key={campo} className="ct-campo-do-anki">
                    <span className="q-tag off">{campo}</span>
                    <ArrowRight aria-hidden />
                    <b>{destinos[i]}</b>
                  </span>
                ))}
              </div>
            )}
            {primeiro && (
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
            )}
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
        {linhaDeDesfazer}
        {avisoDeErro}
      </div>
    </FolhaDeCartoes>
  );
}

/**
 * A FOLHA "TRAZER E LEVAR" (`ctAbrirTrazerELevar`, `cartoes.js:1011-1027`): uma folha só para o que entra
 * e sai. Cada linha fecha a folha e segue: a palavra nova, o arquivo do Anki (o seletor de arquivos abre
 * no próprio toque) e exportar.
 */
export default function TrazerELevar({
  total,
  aoPalavraNova,
  aoExportar,
  aoFechar,
  entrada,
}: {
  /** Cartões no caderno; `null` enquanto não se sabe. Sem cartão não há o que exportar. */
  total: number | null;
  aoPalavraNova: () => void;
  aoExportar: () => void;
  aoFechar: () => void;
  /** O campo de arquivo, que fica com a tela (o "Trazer do Anki" de Hoje usa o mesmo): ao escolher, ela abre o `FluxoDoAnki`. */
  entrada: RefObject<HTMLInputElement | null>;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const depois = useRef<(() => void) | null>(null);
  const ir = (acao: () => void) => () => {
    depois.current = acao;
    dialogo.current?.close();
  };
  return (
    <FolhaDeCartoes
      Icone={ArrowLeftRight}
      titulo={t('Trazer e levar')}
      sub={t('Suas palavras são suas: entram e saem em formato aberto.')}
      classe="ct-menu ct-trazer"
      refDialogo={dialogo}
      aoFechar={() => {
        aoFechar();
        const f = depois.current;
        depois.current = null;
        f?.();
      }}
    >
      <LinhasDeMenu
        fim={ChevronRight}
        linhas={[
          {
            chave: 'nova',
            Icone: Plus,
            titulo: t('Palavra nova'),
            detalhe: t('Uma de cada vez, com a frase se quiser.'),
            acao: ir(aoPalavraNova),
          },
          {
            chave: 'anki',
            Icone: WalletCards,
            titulo: t('Arquivo do Anki'),
            detalhe: t('Arquivo .apkg, texto ou CSV. A tela diz o que vem e o que não vem.'),
            /* O seletor de arquivos precisa do toque: abre agora, com a folha ainda na tela. */
            acao: () => entrada.current?.click(),
          },
          {
            chave: 'exportar',
            Icone: Download,
            titulo: t('Exportar'),
            detalhe: total
              ? t('De volta ao Anki, planilha ou texto. O que você traz, você leva. {n} no caderno.', {
                  n: numero(total),
                })
              : t('De volta ao Anki, planilha ou texto. O que você traz, você leva.'),
            acao: ir(aoExportar),
            desligada: total === 0,
          },
        ]}
      />
    </FolhaDeCartoes>
  );
}
