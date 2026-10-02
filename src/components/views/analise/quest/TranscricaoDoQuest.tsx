import {
  AlertTriangle,
  BookOpen,
  Check,
  Cpu,
  Loader2,
  MessagesSquare,
  Mic,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';

import type { FalaDaAnalise } from '../../../../lib/analise/tiposDaAnalise';
import { t } from '../../../../lib/i18n';
import { tokenizarTexto } from '../../../../lib/vocabWord';
import TokensClicaveis, { ehPalavraDeConteudo } from '../../../TokensClicaveis';
import { Dialogo, fecharDialogoDe } from '../../../ui';
import SombraDaFala from '../SombraDaFala';

/** A correção de uma fala: o estado mora na `Analysis` (`criarEdicaoDeFala`) e chega inteiro aqui. */
interface EdicaoDaFalaNoQuest {
  /** A fala em edição (`null` = nenhuma). */
  id: string | null;
  origem: string;
  destino: string;
  aoMudarOrigem: (texto: string) => void;
  aoMudarDestino: (texto: string) => void;
  salvando: boolean;
  erro: string | null;
  iniciar: (id: string, origem: string, destino: string) => void;
  cancelar: () => void;
  salvar: (id: string) => void;
}

/** Um ajuste de "Ajustar exibição": o nome, as opções e a escolhida. */
export interface AjusteDeExibicao {
  rotulo: string;
  opcoes: ReadonlyArray<readonly [valor: string, rotulo: string]>;
  atual: string;
  aoEscolher: (valor: string) => void;
}

/** Uma palavra desta sessão que já está no caderno. */
interface PalavraDaSessao {
  id: string;
  word: string;
  translation?: string;
  cefrLevel?: string;
  sentence?: string;
}

/**
 * A ABA TRANSCRIÇÃO NO META QUEST.
 *
 * Conversa com a legenda ao vivo (`LegendaAoVivoDoQuest`): cada fala é um alvo inteiro, com "Ouvir" e
 * "Opções" à vista em 60 px. O que na tela de sempre dependia de mira fina ou de gesto que o controle
 * não tem mudou de forma, sem sumir:
 *   · clicar na fala para tocar dali  → o "Ouvir" da fala;
 *   · duplo clique para corrigir      → "Editar", nas opções da fala;
 *   · palavra clicável no meio do texto, e o cartão que abria por hover → as palavras viram botões
 *     nas opções da fala, e o toque abre a folha da palavra no centro;
 *   · a coluna "Palavras desta sessão" → um botão acima das falas, que abre a lista no centro;
 *   · o painel "Ajustar exibição" → um diálogo, com um ajuste por linha.
 *
 * Só apresentação: nenhuma regra mora aqui. A `Analysis` entrega as falas, o estado e as ações.
 */
export default function TranscricaoDoQuest({
  falas,
  estado,
  aoTentarDeNovo,
  documento,
  indiceAtivo,
  classes,
  traducaoPrimeiro,
  ocultarOriginal,
  traducaoDe,
  procedencia,
  polir,
  player,
  palavras,
  estaNoDeck,
  podeOuvir,
  aoOuvir,
  ouvirSegue,
  aoAbrirPalavra,
  edicao,
  sombraDe,
  aoAlternarSombra,
  idiomaDe,
  ajustes,
}: {
  falas: readonly FalaDaAnalise[];
  /** A transcrição ainda está vindo, chegou, ou o pedido falhou. */
  estado: 'carregando' | 'pronta' | 'erro';
  aoTentarDeNovo: () => void;
  /** Sessão de documento: sem player, sem tempo e sem prática de pronúncia. */
  documento: boolean;
  /** A fala que o player está tocando (`-1` = nenhuma). */
  indiceAtivo: number;
  /** As classes de "Ajustar exibição" (`t-sepia f-serif s-grande`), as mesmas da tela de sempre. */
  classes: string;
  traducaoPrimeiro: boolean;
  ocultarOriginal: boolean;
  /** A tradução que a fala mostra agora (a polida, quando é ela a escolhida). */
  traducaoDe: (fala: FalaDaAnalise) => { texto: string; polida: boolean };
  /** O selo de procedência da transcrição. */
  procedencia: string | null;
  /** "Polir a tradução da sessão" (`PolirSessao`), já montado. */
  polir?: ReactNode;
  /** A faixa do player (`PlayerInterativo`), já montada. Documento não tem. */
  player?: ReactNode;
  palavras: readonly PalavraDaSessao[];
  estaNoDeck: (palavra: string) => boolean;
  /** Há como ouvir esta fala aqui (o áudio gravado, ou uma voz para o idioma dela)? */
  podeOuvir: (fala: FalaDaAnalise) => boolean;
  aoOuvir: (fala: FalaDaAnalise) => void;
  /**
   * "Ouvir" segue tocando dali em diante (o áudio gravado, ou a narração da sessão sem áudio). `false`
   * = lê só aquela fala (documento, ou áudio gravado que não veio), e o rótulo diz isso.
   */
  ouvirSegue: boolean;
  aoAbrirPalavra: (palavra: string, frase: string) => void;
  edicao: EdicaoDaFalaNoQuest;
  /** A fala com a prática de pronúncia aberta (`null` = nenhuma). */
  sombraDe: number | null;
  aoAlternarSombra: (indice: number | null) => void;
  idiomaDe: (indice: number) => string;
  ajustes: readonly AjusteDeExibicao[];
}) {
  /** O índice (`fala.index`) da fala com as opções abertas. */
  const [aberta, setAberta] = useState<number | null>(null);
  const [verPalavras, setVerPalavras] = useState(false);
  const [ajustando, setAjustando] = useState(false);

  const falaAberta = aberta === null ? undefined : falas.find((f) => f.index === aberta);
  const editando = !!falaAberta?.id && edicao.id === falaAberta.id;

  const fecharOpcoes = () => {
    if (editando) edicao.cancelar();
    if (sombraDe !== null) aoAlternarSombra(null);
    setAberta(null);
  };

  const barra = (
    <div className="q-acoes qs-barra">
      {procedencia && (
        <span className="q-chip" data-testid="procedencia">
          <Cpu aria-hidden /> <span className="qs-rotulo-do-chip">{t('Procedência')}</span> {procedencia}
        </span>
      )}
      <span className="q-espaco" />
      <button type="button" className="q-chip" aria-haspopup="dialog" onClick={() => setVerPalavras(true)}>
        <BookOpen aria-hidden /> {t('Palavras desta sessão')}
        <span className="qs-n">{palavras.length}</span>
      </button>
      <button type="button" className="q-chip" aria-haspopup="dialog" onClick={() => setAjustando(true)}>
        <SlidersHorizontal aria-hidden /> {t('Ajustar exibição')}
      </button>
    </div>
  );

  return (
    <div className="qs-transcricao">
      {barra}
      {polir}

      {estado === 'carregando' ? (
        <div
          className="q-lista"
          aria-busy="true"
          aria-label={t('Carregando a transcrição')}
          data-testid="falas-carregando"
        >
          <div className="q-esqueleto qs-esqueleto" />
          <div className="q-esqueleto qs-esqueleto" />
          <div className="q-esqueleto qs-esqueleto" />
        </div>
      ) : estado === 'erro' ? (
        <div className="q-vazio" role="alert">
          <span className="q-ic">
            <AlertTriangle aria-hidden />
          </span>
          <h2>{t('Não deu para carregar a transcrição')}</h2>
          <p>{t('Confira a conexão e tente de novo. A gravação continua guardada.')}</p>
          <button type="button" className="q-ctl pri" onClick={aoTentarDeNovo}>
            <RotateCcw aria-hidden /> {t('Tentar de novo')}
          </button>
        </div>
      ) : falas.length === 0 ? (
        <div className="q-vazio">
          <span className="q-ic">
            <MessagesSquare aria-hidden />
          </span>
          <h2>{t('Sem texto nesta sessão')}</h2>
          <p>{t('Esta gravação não tem transcrição. Quando houver falas, elas aparecem aqui, com a tradução.')}</p>
        </div>
      ) : (
        <section
          className={`transcrito qs-falas ${classes}`}
          aria-label={documento ? t('Texto da sessão') : t('Transcrição da sessão')}
        >
          {falas.map((fala) => {
            const traducao = traducaoDe(fala);
            const original = !ocultarOriginal && (
              <span className="qs-o" lang={fala.lang || undefined}>
                {fala.original}
              </span>
            );
            const traduzida = traducao.texto && (
              <span className="qs-t" data-polida={traducao.polida ? '' : undefined}>
                {traducao.texto}
              </span>
            );
            const ativa = !documento && fala.index === indiceAtivo;
            return (
              <div key={fala.index} className={ativa ? 'qs-fala ativa' : 'qs-fala'} data-fala={fala.index}>
                <button
                  type="button"
                  className="qs-fala-texto"
                  aria-haspopup="dialog"
                  aria-current={ativa ? 'true' : undefined}
                  onClick={() => setAberta(fala.index)}
                >
                  <span className="qs-meta">
                    <span className="qs-quem">{fala.speaker}</span>
                    {fala.time && <span className="qs-tempo">{fala.time}</span>}
                    {traducao.polida && <span className="q-tag">{t('Polida')}</span>}
                  </span>
                  {traducaoPrimeiro ? (
                    <>
                      {traduzida}
                      {original}
                    </>
                  ) : (
                    <>
                      {original}
                      {traduzida}
                    </>
                  )}
                </button>
                <div className="qs-acoes-da-fala">
                  {podeOuvir(fala) && (
                    <button
                      type="button"
                      className="q-ctl"
                      aria-label={ouvirSegue ? t('Ouvir a partir deste trecho') : t('Ouvir este trecho')}
                      onClick={() => aoOuvir(fala)}
                    >
                      <Volume2 aria-hidden />
                    </button>
                  )}
                  <button
                    type="button"
                    className="q-ctl"
                    aria-label={t('Opções da fala')}
                    aria-haspopup="dialog"
                    onClick={() => setAberta(fala.index)}
                  >
                    <MoreHorizontal aria-hidden />
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {player}

      {/* AS OPÇÕES DA FALA: ouvir, praticar a pronúncia, editar e as palavras, no centro. */}
      {falaAberta && (
        <Dialogo
          icone={editando ? Pencil : MessagesSquare}
          titulo={editando ? t('Editar a fala') : t('Opções da fala')}
          sub={[falaAberta.speaker, falaAberta.time].filter((p) => p && p !== '-').join(' · ') || undefined}
          aoFechar={fecharOpcoes}
        >
          {editando ? (
            <>
              <div className="dlg-corpo qs-miolo qs-folha" data-testid="edicao-da-fala">
                <label className="q-campo">
                  <span>{t('Texto original (o que foi falado)')}</span>
                  <textarea
                    name="analysis-edit-source"
                    data-autofocus
                    value={edicao.origem}
                    onChange={(e) => edicao.aoMudarOrigem(e.target.value)}
                    disabled={edicao.salvando}
                  />
                </label>
                <label className="q-campo">
                  <span>{t('Tradução')}</span>
                  <textarea
                    name="analysis-edit-target"
                    value={edicao.destino}
                    onChange={(e) => edicao.aoMudarDestino(e.target.value)}
                    disabled={edicao.salvando}
                  />
                </label>
                {edicao.erro && (
                  <p className="qs-erro" role="alert">
                    <AlertTriangle aria-hidden /> {edicao.erro}
                  </p>
                )}
              </div>
              <div className="dlg-pe">
                <button
                  type="button"
                  className="q-ctl pri"
                  disabled={edicao.salvando}
                  onClick={() => falaAberta.id && edicao.salvar(falaAberta.id)}
                >
                  {edicao.salvando ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}{' '}
                  {t('Salvar')}
                </button>
                <button type="button" className="q-ctl" disabled={edicao.salvando} onClick={edicao.cancelar}>
                  {t('Cancelar')}
                </button>
              </div>
            </>
          ) : (
            <div className="dlg-corpo qs-miolo qs-folha" data-testid="opcoes-da-fala">
              <p className="qs-folha-texto" lang={falaAberta.lang || undefined}>
                {falaAberta.original}
              </p>
              {traducaoDe(falaAberta).texto && <p className="qs-folha-trad">{traducaoDe(falaAberta).texto}</p>}
              <div className="q-acoes">
                {podeOuvir(falaAberta) && (
                  <button type="button" className="q-ctl pri" onClick={() => aoOuvir(falaAberta)}>
                    <Volume2 aria-hidden /> {ouvirSegue ? t('Ouvir a partir daqui') : t('Ouvir esta fala')}
                  </button>
                )}
                {!documento && (
                  <button
                    type="button"
                    className="q-ctl"
                    aria-pressed={sombraDe === falaAberta.index}
                    onClick={() => aoAlternarSombra(sombraDe === falaAberta.index ? null : falaAberta.index)}
                  >
                    <Mic aria-hidden /> {t('Praticar a pronúncia')}
                  </button>
                )}
                {falaAberta.id && (
                  <button
                    type="button"
                    className="q-ctl"
                    onClick={() =>
                      falaAberta.id && edicao.iniciar(falaAberta.id, falaAberta.original, falaAberta.translation)
                    }
                  >
                    <Pencil aria-hidden /> {t('Editar')}
                  </button>
                )}
              </div>
              {!podeOuvir(falaAberta) && (
                <p className="qs-apoio" data-testid="fala-sem-voz">
                  {t(
                    'Não há como ouvir esta fala aqui: sem áudio gravado disponível e sem voz de leitura para o idioma dela.',
                  )}
                </p>
              )}
              {sombraDe === falaAberta.index && !documento && (
                <SombraDaFala
                  key={falaAberta.index}
                  texto={falaAberta.original}
                  idioma={idiomaDe(falaAberta.index)}
                  aoOuvirOriginal={podeOuvir(falaAberta) ? () => aoOuvir(falaAberta) : undefined}
                />
              )}
              {tokenizarTexto(falaAberta.original).some((tk) => ehPalavraDeConteudo(tk.clean)) && (
                <>
                  <span className="q-rotulo">{t('Toque numa palavra')}</span>
                  <TokensClicaveis
                    comoBotoes
                    tokens={tokenizarTexto(falaAberta.original)}
                    className="qs-palavras-da-fala"
                    estaNoDeck={estaNoDeck}
                    onMouseEnter={() => {}}
                    onMouseLeave={() => {}}
                    onExaminar={(palavra) => aoAbrirPalavra(palavra, falaAberta.original)}
                  />
                </>
              )}
            </div>
          )}
        </Dialogo>
      )}

      {/* AS PALAVRAS DESTA SESSÃO que já estão no caderno: a coluna lateral da tela de sempre. */}
      {verPalavras && (
        <Dialogo
          icone={BookOpen}
          titulo={t('Palavras desta sessão')}
          sub={t('As que esta gravação já pôs no seu caderno.')}
          aoFechar={() => setVerPalavras(false)}
        >
          {palavras.length ? (
            <div className="dlg-corpo qs-miolo q-lista">
              {palavras.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="q-linha"
                  onClick={(e) => {
                    fecharDialogoDe(e.currentTarget);
                    aoAbrirPalavra(c.word.toLowerCase(), c.sentence || c.word);
                  }}
                >
                  <span>
                    <b>{c.word}</b>
                    {c.translation && <small>{c.translation}</small>}
                  </span>
                  {c.cefrLevel && <span className="q-fim">{c.cefrLevel}</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="dlg-corpo qs-miolo">
              <p className="q-texto">
                {t(
                  'Nenhuma palavra desta sessão foi para o caderno ainda. Toque numa fala e depois numa palavra para analisá-la e guardá-la.',
                )}
              </p>
            </div>
          )}
        </Dialogo>
      )}

      {/* AJUSTAR EXIBIÇÃO: os mesmos cinco ajustes, um por linha. */}
      {ajustando && (
        <Dialogo
          icone={SlidersHorizontal}
          titulo={t('Ajustar exibição')}
          sub={t('Vale para o texto desta tela.')}
          aoFechar={() => setAjustando(false)}
        >
          <div className="dlg-corpo qs-miolo qs-ajustes">
            {ajustes.map((a) => (
              <div key={a.rotulo} className="q-ajuste">
                <b>{a.rotulo}</b>
                <div className="q-abas q-seg" role="group" aria-label={a.rotulo}>
                  {a.opcoes.map(([valor, rotulo]) => (
                    <button
                      key={valor}
                      type="button"
                      className="q-aba"
                      aria-pressed={a.atual === valor}
                      onClick={() => a.aoEscolher(valor)}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Dialogo>
      )}
    </div>
  );
}
