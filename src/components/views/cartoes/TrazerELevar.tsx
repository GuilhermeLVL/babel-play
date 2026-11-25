import { type MotivoDescarte, motivoLegivel, ROTULO_MOTIVO } from '@core';
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronRight,
  CircleCheck,
  CircleX,
  ClipboardPaste,
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
import {
  type BaralhoLido,
  enviarBaralhoLido,
  type ImportAnkiResposta,
  lerBaralhoParaImportar,
  type ProgressoDaImportacao,
} from '../../../data/importarAnki';
import { esquecerPerfil } from '../../../lib/anki/perfisDeMapeamento';
import { numero, t, tp } from '../../../lib/i18n';
import { polido, reduz } from '../../../lib/polimento/base';
import { confete } from '../../../lib/polimento/planos';
import { sentir } from '../../../lib/polimento/sentidos';
import { toast } from '../../Toast';
import { AvisoDePerfilReconhecido, useConferenciaDoMapeador } from '../anki/MapeadorDeCampos';
import { fecharAFolhaDe, FolhaDeCartoes, LinhasDeMenu } from './pecas';

/**
 * "TRAZER E LEVAR", EM FOLHAS — porte de `ctAbrirTrazerELevar` e `ctAbrirAnki` (`cartoes.js:1011-1027,
 * 1062-1130` do protótipo enxuto). A aba virou folha do "…"; o Anki entra em dois passos.
 *
 * O FLUXO DO ANKI (`FluxoDoAnki`) é o MESMO aqui e em "Trazer uma fonte", dentro do catálogo de conteúdo
 * (`components/conteudo/CatalogoDeConteudo.tsx`), e o baralho novo já vira o conteúdo escolhido.
 *
 * O QUE O APP FAZ HOJE, dito como é (e por isso os passos não são os do protótipo ao pé da letra):
 *  · ler o arquivo JÁ GUARDA as notas no baralho (o protocolo em lotes, `/api/anki/imports`, grava ao fechar); nenhuma vira
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
 * O ANKI NUM DIÁLOGO: lê o arquivo ao abrir, SÓ NO NAVEGADOR, e mostra o que achou ANTES de trazer (nada foi ao
 * servidor); ao confirmar, envia; passo 1, o que veio e o que não veio, e quantas notas ativar; passo 2, o relatório.
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
  /* Devolve `false` quando o baralho ficou sem cartão nenhum (nada a escolher): a tela não diz que escolheu. */
  aoTrouxe?: (fonte: BaralhoTrazido) => boolean | void | Promise<boolean | void>;
  /** "Ver no catálogo": fecha e abre o catálogo de conteúdo. */
  aoVerNoCatalogo?: () => void;
  aoFechar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const depois = useRef<(() => void) | null>(null);
  const [lido, setLido] = useState<ImportAnkiResposta | null>(null);
  /** O arquivo lido no navegador, esperando a confirmação: o servidor ainda não recebeu nada. */
  const [previa, setPrevia] = useState<BaralhoLido | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ativar, setAtivar] = useState(ATIVAR_DE_INICIO);
  const [ocupado, setOcupado] = useState(false);
  const [progresso, setProgresso] = useState<ProgressoDaImportacao | null>(null);
  /** `null` no passo 1; no passo 2, quantas viraram cartão. */
  const [ativadas, setAtivadas] = useState<number | null>(null);
  const [escolhido, setEscolhido] = useState(false);
  const nome = arquivo.name;
  const { opcoes: mapeador, painel: painelDoMapeador } = useConferenciaDoMapeador();
  /* O Mapeador é lido no PRIMEIRO pedido do arquivo: a flag liga ou desliga o fluxo na hora de abrir a folha. */
  const mapeadorRef = useRef(mapeador);
  mapeadorRef.current = mapeador;

  /* Lê ao abrir, UMA VEZ POR ARQUIVO. O efeito roda em dobro no modo estrito (desenvolvimento), e o servidor
     só aceita um envio grande por pessoa de cada vez: o segundo pedido, que era o que a tela esperava,
     voltava com "já existe um envio grande seu em andamento", e o fluxo abria no erro. O pedido fica
     guardado por arquivo, e as duas passadas do efeito esperam o mesmo. */
  const avisar = useRef(aoMudou);
  avisar.current = aoMudou;
  const leitura = useRef<{ de: string; pedido: Promise<BaralhoLido> } | null>(null);
  useEffect(() => {
    let vivo = true;
    const de = `${arquivo.name}|${arquivo.size}|${arquivo.lastModified}`;
    if (leitura.current?.de !== de)
      leitura.current = { de, pedido: lerBaralhoParaImportar(arquivo, setProgresso, mapeadorRef.current) };
    const pedido = leitura.current.pedido;
    void (async () => {
      try {
        const r = await pedido;
        if (vivo) setPrevia(r);
      } catch (e) {
        if (vivo) setErro((e as Error).message || t('Não deu para ler este arquivo do Anki.'));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [arquivo]);

  /* O ENVIO É DA PESSOA: só sai uma requisição ao servidor depois de "Trazer". */
  const trazer = async () => {
    if (!previa || enviando) return;
    setEnviando(true);
    setErro(null);
    setProgresso(null);
    try {
      const r = await enviarBaralhoLido(previa, idioma, idiomaNativo, setProgresso);
      setLido(r);
      setAtivar(Math.min(ATIVAR_DE_INICIO, Math.max(0, r.resumo.notas - r.resumo.descartadas)));
      avisar.current?.();
    } catch (e) {
      setErro((e as Error).message || t('Não deu para trazer este arquivo do Anki.'));
    } finally {
      setEnviando(false);
    }
  };

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
      /* A LEITURA JÁ ATIVA O PRIMEIRO LOTE (`resumo.ativadas` da importação): num baralho pequeno o pedido de
         ativar volta com zero, porque não sobrou nota arquivada. Contar só o que ESTE pedido ativou fazia o
         relatório dizer "0 ativadas" de um baralho com cartões, e o baralho não virava o conteúdo escolhido. */
      const comCartao = r.ativadas + (lido.resumo.ativadas ?? 0);
      setAtivadas(comCartao);
      aoMudou?.();
      if (comCartao > 0) {
        sentir('sucesso');
        if (polido() && !reduz()) confete(60);
      }
      /* O BARALHO VIRA O CONTEÚDO ESCOLHIDO SEMPRE QUE TEM CARTÃO, também quando nada foi ativado AGORA: trazer
         de novo um arquivo que já estava inteiro ativado (a reimportação) não ativa nada, e a pessoa trouxe
         o baralho para usá-lo. Quem sabe se ele tem cartão é o catálogo relido por quem chama. */
      if (aoTrouxe) {
        const escolheu = await aoTrouxe({ tipo: 'anki', id: lido.deckId, nome: nomeDoBaralho });
        setEscolhido(escolheu !== false);
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

  if (!lido && previa && !enviando && !erro) {
    const l = previa.leitura;
    const n = l.notas.length;
    const amostra = l.notas.slice(0, 3);
    return (
      <FolhaDeCartoes
        Icone={Upload}
        titulo={t('Trazer do Anki')}
        sub={t('Conferir antes de trazer · {nome} · nada foi enviado ainda', { nome })}
        classe="ct-anki ct-anki-0"
        refDialogo={dialogo}
        aoFechar={fechar}
        pe={
          <>
            <button type="button" className="q-ctl" onClick={(e) => fecharAFolhaDe(e.currentTarget)}>
              {t('Cancelar')}
            </button>
            {n > 0 && (
              <button type="button" className="q-ctl pri" onClick={() => void trazer()}>
                <Check aria-hidden /> {tp(n, 'Trazer {n} nota', 'Trazer {n} notas', { n: numero(n) })}
              </button>
            )}
          </>
        }
      >
        <div data-testid="anki-previa" style={{ display: 'contents' }}>
          <p className="qv-nota">
            {n > 0
              ? tp(
                  n,
                  'Li {n} nota neste aparelho. Nada foi ao servidor: elas só entram quando você confirmar.',
                  'Li {n} notas neste aparelho. Nada foi ao servidor: elas só entram quando você confirmar.',
                  { n: numero(n) },
                )
              : t('Não achei nenhuma nota neste arquivo. Nada foi enviado.')}
          </p>
          {l.campos.length > 0 && (
            <p className="qv-nota">{t('Campos do arquivo: {campos}.', { campos: l.campos.join(', ') })}</p>
          )}
          {amostra.length > 0 && (
            <ul className="ct-itens">
              {amostra.map((a, i) => (
                <Item key={`${a.guid}-${i}`} veio titulo={a.frente.slice(0, 80)} detalhe={a.verso.slice(0, 80)} />
              ))}
            </ul>
          )}
          {l.temMidia && (
            <div className="q-aviso" role="note">
              <span className="qv-aviso-texto">
                <TriangleAlert aria-hidden />
                <span>{t('O áudio e as imagens do arquivo não vêm: o cartão usa a voz do aparelho.')}</span>
              </span>
            </div>
          )}
          {l.truncado && (
            <div className="q-aviso" role="note">
              <span className="qv-aviso-texto">
                <TriangleAlert aria-hidden />
                <span>
                  {t(
                    'Este arquivo tem {total} notas, mais do que dá para ler de uma vez; só as primeiras {lidas} entram. Traga o mesmo arquivo de novo para o resto.',
                    { total: numero(l.totalNoArquivo ?? n), lidas: numero(n) },
                  )}
                </span>
              </span>
            </div>
          )}
        </div>
      </FolhaDeCartoes>
    );
  }

  if (!lido) {
    /* A leitura, o envio (ou o erro deles). */
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
        ) : painelDoMapeador ? (
          painelDoMapeador
        ) : (
          <div className="q-vazio" role="status" data-testid="anki-lendo">
            <span className="q-ic">
              <Upload aria-hidden />
            </span>
            <h2>
              {progresso?.etapa === 'enviando'
                ? t('Enviando {feitas} de {total} notas…', {
                    feitas: numero(progresso.feitas),
                    total: numero(progresso.total),
                  })
                : progresso?.etapa === 'concluindo'
                  ? t('Concluindo…')
                  : previa
                    ? t('Enviando {nome}…', { nome })
                    : t('Lendo {nome}…', { nome })}
            </h2>
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
                  titulo={tp(
                    r.descartadas,
                    '{n} nota fora da régua de qualidade',
                    '{n} notas fora da régua de qualidade',
                    {
                      n: numero(r.descartadas),
                    },
                  )}
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
        {lido.reconhecidos && <AvisoDePerfilReconhecido reconhecidos={lido.reconhecidos} aoEsquecer={esquecerPerfil} />}
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
  aoColar,
  aoExportar,
  aoFechar,
  entrada,
}: {
  /** Cartões no caderno; `null` enquanto não se sabe. Sem cartão não há o que exportar. */
  total: number | null;
  aoPalavraNova: () => void;
  /** "Colar uma lista": abre a folha onde o texto é colado (`ColarUmaLista`). */
  aoColar: () => void;
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
            chave: 'colar',
            Icone: ClipboardPaste,
            titulo: t('Colar uma lista'),
            detalhe: t('Uma palavra e a tradução por linha, separadas por vírgula ou tabulação.'),
            acao: ir(aoColar),
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

/** O texto colado vira um arquivo `.txt` em memória, que segue o MESMO caminho de um arquivo escolhido (lê, confere, traz). */
export function arquivoDeListaColada(texto: string): File {
  return new File([texto], 'lista-colada.txt', { type: 'text/plain' });
}

/**
 * "COLAR UMA LISTA" (cartões 7.3): uma palavra e a tradução por linha (vírgula ou tabulação; a terceira coluna é a
 * frase). Nada sai do aparelho aqui: "Continuar" entrega o texto ao mesmo fluxo do arquivo, que lê, mostra o
 * que achou e só envia depois da confirmação.
 */
export function ColarUmaLista({
  aoContinuar,
  aoFechar,
}: {
  aoContinuar: (arquivo: File) => void;
  aoFechar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const depois = useRef<(() => void) | null>(null);
  const [texto, setTexto] = useState('');
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim()).length;
  return (
    <FolhaDeCartoes
      Icone={ClipboardPaste}
      titulo={t('Colar uma lista')}
      sub={t('Uma palavra e a tradução por linha. Nada sai do aparelho antes de você confirmar.')}
      classe="ct-menu ct-colar"
      refDialogo={dialogo}
      aoFechar={() => {
        aoFechar();
        const f = depois.current;
        depois.current = null;
        f?.();
      }}
      pe={
        <>
          <button type="button" className="q-ctl" onClick={(e) => fecharAFolhaDe(e.currentTarget)}>
            {t('Cancelar')}
          </button>
          <button
            type="button"
            className="q-ctl pri"
            disabled={linhas === 0}
            onClick={() => {
              depois.current = () => aoContinuar(arquivoDeListaColada(texto));
              dialogo.current?.close();
            }}
          >
            <Check aria-hidden /> {t('Continuar')}
          </button>
        </>
      }
    >
      <label className="q-campo">
        <span className="q-rotulo">{t('A lista')}</span>
        <textarea
          rows={8}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={'house, casa\nwater, água'}
          spellCheck={false}
          autoFocus
          data-testid="lista-colada"
        />
      </label>
      <p className="qv-nota">
        {linhas > 0
          ? tp(linhas, '{n} linha para conferir.', '{n} linhas para conferir.', { n: numero(linhas) })
          : t('Cole ou escreva a lista aqui.')}
      </p>
    </FolhaDeCartoes>
  );
}
