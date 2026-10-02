import {
  ArrowLeft,
  ArrowRight,
  Brain,
  ChartColumn,
  Check,
  CheckCircle2,
  Eye,
  Gamepad2,
  Home,
  Mic,
  Minus,
  PartyPopper,
  Pause,
  Pencil,
  PenLine,
  Plus,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Target,
  Undo2,
  Volume2,
  X,
  XCircle,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { t } from '../../../../lib/i18n';
import type { VocabCard } from '../../../../types';
import FraseComLacuna from '../../../FraseComLacuna';
import { Dialogo, fecharDialogoDe } from '../../../ui';

/**
 * A REVISÃO NO META QUEST (maquete aprovada pelo dono em 01/10/2026, tela 8; segunda rodada: todos os
 * estados da tela no mesmo desenho).
 *
 * Só apresentação. `Study.tsx` continua dono do baralho, da fila, das notas (FSRS no servidor), do
 * desfazer, do suspender e das preferências; aqui chega tudo pronto e cada toque volta por uma função.
 *
 * O que muda de forma no headset:
 *  · o topo é uma linha só (voltar, progresso, "10 / 18", opções, encerrar);
 *  · o cartão ocupa o miolo, e o único botão principal da tela mora nele;
 *  · as ações do cartão (desfazer, ouvir, editar, suspender) ficam na faixa do pé;
 *  · os atalhos de teclado não aparecem (não há teclado físico); no formato Digitar, o teclado do
 *    sistema sobe quando o campo ganha foco, e por isso o campo NÃO pega o foco sozinho.
 *
 * O MESMO DESENHO NO COMPUTADOR (02/10/2026): o último item é limite do APARELHO, não do desenho. Com
 * teclado físico (`atalhos`, que `Study.tsx` lê de `recursos.ts`) as teclas voltam a aparecer (Espaço,
 * 1 a 4, Z: os atalhos em si nunca saíram, moram em `Study.tsx`) e o campo de digitar pega o foco.
 */

/** O cabeçalho das telas que não são a rodada: voltar, sobrancelha, título e, à direita, as ações. */
function Cabecalho({ titulo, aoVoltar, acoes }: { titulo: string; aoVoltar: () => void; acoes?: ReactNode }) {
  return (
    <header className="q-cab">
      <button type="button" className="q-ctl q-voltar" aria-label={t('Voltar ao Vocabulário')} onClick={aoVoltar}>
        <ArrowLeft aria-hidden />
      </button>
      <div>
        <p className="q-sobre">{t('Revisão')}</p>
        <h1>{titulo}</h1>
      </div>
      {acoes}
    </header>
  );
}

/** O baralho ainda não chegou: a forma do cartão e da faixa, no lugar de um "Carregando…" solto. */
export function EsperaDaRevisaoNoQuest({ titulo, aoVoltar }: { titulo: string; aoVoltar: () => void }) {
  return (
    <div className="q-palco q-revisao" data-testid="revisao-no-quest" data-estado="carregando">
      <Cabecalho titulo={titulo} aoVoltar={aoVoltar} />
      <div className="qr-espera" role="status" aria-busy aria-label={t('Carregando o seu baralho…')}>
        <div className="q-esqueleto" />
        <div className="q-esqueleto" />
      </div>
    </div>
  );
}

/** Baralho vazio: de onde as palavras vêm, e o único passo para sair daqui. */
export function BaralhoVazioNoQuest({
  titulo,
  motivo,
  aoVoltar,
  aoCapturar,
  children,
}: {
  titulo: string;
  /** A frase do perfil ("Seu baralho está vazio"). */
  motivo: string;
  aoVoltar: () => void;
  aoCapturar?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="q-palco q-revisao" data-testid="revisao-no-quest" data-estado="vazio">
      <Cabecalho titulo={titulo} aoVoltar={aoVoltar} />
      <div className="q-vazio">
        <span className="q-ic">
          <Brain aria-hidden />
        </span>
        <h2>{motivo}</h2>
        <p>
          {t(
            'Toque numa palavra de qualquer transcrição para mandá-la ao baralho. A revisão espaçada aparece aqui assim que houver cartões.',
          )}
        </p>
        {aoCapturar && (
          <button type="button" className="q-ctl pri" onClick={aoCapturar}>
            <Mic aria-hidden /> {t('Capturar uma sessão')}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * PRODUÇÃO ATIVA. Na tela de sempre ela só abre pela paleta de comandos (teclado) ou vinda de outra tela;
 * no headset não há teclado, então ganha um botão: fora da rodada e nas opções. Sem palavra madura o
 * bastante, o botão aparece desligado e o motivo fica escrito.
 */
export interface ProducaoAtivaNoQuest {
  rotulo: string;
  /** "12 palavras prontas para escrever de memória". */
  dica: string;
  /** Por que ainda não abre (nenhuma palavra com estabilidade suficiente). */
  bloqueio?: string;
  aoComecar: () => void;
}

/** Fora de uma rodada (a pessoa encerrou sem sair da tela): quantas esperam, e começar. */
export function ForaDaRodadaNoQuest({
  titulo,
  quantas,
  chamada,
  explicacao,
  producao,
  aoComecar,
  aoOpcoes,
  aoVoltar,
  children,
}: {
  titulo: string;
  /** As vencidas agora, ou o baralho inteiro quando nada vence. */
  quantas: number;
  chamada: string;
  explicacao: string;
  producao?: ProducaoAtivaNoQuest;
  aoComecar: () => void;
  aoOpcoes: () => void;
  aoVoltar: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="q-palco q-revisao" data-testid="revisao-no-quest" data-estado="fora">
      <Cabecalho
        titulo={titulo}
        aoVoltar={aoVoltar}
        acoes={
          <button type="button" className="q-ctl" aria-label={t('Opções da revisão')} onClick={aoOpcoes}>
            <Settings2 aria-hidden /> {t('Opções')}
          </button>
        }
      />
      <div className="q-vazio">
        <span className="qr-contagem">{quantas}</span>
        <h2>{chamada}</h2>
        <p>{explicacao}</p>
        <button type="button" className="q-ctl pri" onClick={aoComecar}>
          <Target aria-hidden /> {titulo}
        </button>
        {producao && (
          <div className="qr-segundo" data-testid="producao-ativa-fora">
            <button type="button" className="q-ctl" disabled={!!producao.bloqueio} onClick={producao.aoComecar}>
              <PenLine aria-hidden /> {producao.rotulo}
            </button>
            <small>{producao.bloqueio ?? producao.dica}</small>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/** O fim da rodada: o que foi feito, em números, e os três caminhos de saída. */
export function FimDaRodadaNoQuest({
  feitoEm,
  proximo,
  revisoes,
  acerto,
  tempo,
  xp,
  seeds,
  resumo,
  podeDesfazer,
  aoDesfazer,
  aoJogar,
  aoEstatisticas,
  aoInicio,
  aoVoltar,
  atalhos = false,
  children,
}: {
  /** Há teclado físico: a tecla do desfazer (Z) aparece no botão. */
  atalhos?: boolean;
  /** "As 12 palavras foram revisadas." */
  feitoEm: string;
  /** "A próxima abre amanhã com 3 palavras." */
  proximo: string;
  revisoes: number;
  acerto: string;
  tempo: string;
  xp: number;
  /** Só com as recompensas v2; `null` não mostra o ladrilho. */
  seeds: number | null;
  /** As missões do dia e a ofensiva (`ResumoDaPratica`), quando há. */
  resumo?: ReactNode;
  podeDesfazer: boolean;
  aoDesfazer: () => void;
  aoJogar: () => void;
  aoEstatisticas: () => void;
  aoInicio: () => void;
  aoVoltar: () => void;
  children?: ReactNode;
}) {
  const numeros: Array<{ rotulo: string; valor: string; tom?: string; seeds?: number }> = [
    { rotulo: t('Revisões'), valor: String(revisoes) },
    { rotulo: t('Acerto'), valor: acerto, tom: 'bom' },
    { rotulo: t('Tempo'), valor: tempo },
    { rotulo: 'XP', valor: `+${xp}`, tom: 'acento' },
    ...(seeds !== null ? [{ rotulo: 'Seeds', valor: `+${seeds}`, tom: 'bom', seeds }] : []),
  ];
  return (
    <div className="q-palco q-revisao" data-testid="revisao-no-quest" data-estado="fim">
      <Cabecalho titulo={t('Rodada concluída')} aoVoltar={aoVoltar} />
      <div className="q-cartao fundo qr-fecho">
        <span className="q-ic">
          <PartyPopper aria-hidden />
        </span>
        <div>
          <h2>{t('Você fechou a rodada')}</h2>
          <p>
            {feitoEm} {proximo}
          </p>
        </div>
      </div>
      <div className="qr-numeros">
        {numeros.map((n) => (
          <div key={n.rotulo} className="q-num" data-seeds-da-revisao={n.seeds}>
            <span className="q-rotulo">{n.rotulo}</span>
            <b className={n.tom}>{n.valor}</b>
          </div>
        ))}
      </div>
      {resumo}
      <div className="q-faixa" role="toolbar" aria-label={t('O que fazer agora')}>
        <button type="button" className="q-ctl pri" onClick={aoJogar}>
          <Gamepad2 aria-hidden /> {t('Jogar com as mesmas')}
        </button>
        <button type="button" className="q-ctl" onClick={aoEstatisticas}>
          <ChartColumn aria-hidden /> {t('Ver estatísticas')}
        </button>
        <button type="button" className="q-ctl" onClick={aoInicio}>
          <Home aria-hidden /> {t('Voltar ao início')}
        </button>
        <span className="q-espaco" />
        {/* No computador é a tecla Z; sem teclado, o desfazer da última nota ganha um botão. */}
        <button type="button" className="q-ctl" disabled={!podeDesfazer} onClick={aoDesfazer}>
          <Undo2 aria-hidden /> {t('Desfazer a última')}
          {atalhos && <kbd data-precisa="teclado">Z</kbd>}
        </button>
      </div>
      {children}
    </div>
  );
}

export type FormatoDaRodada = 'cloze' | 'typing' | 'mc' | 'active-production';

export interface NotaDoQuest {
  id: string;
  /** `e`, `d`, `b`, `f`: a cor da nota (a mesma classe da tela de sempre). */
  classe: string;
  rotulo: string;
  /** O intervalo que o FSRS dá a esta nota ("3,5 d"). */
  detalhe: string;
  /** A tecla que dá esta nota no computador ("1" a "4"); só aparece onde há teclado físico. */
  tecla?: string;
  aoDar: (origem: Element) => void;
}

/** A RODADA: o progresso em cima, um cartão grande no meio, as ações do cartão na faixa. */
export function RodadaDoQuest({
  titulo,
  rotulo,
  indice,
  total,
  cartao,
  selo,
  pele,
  origemDaFrase,
  formato,
  notas,
  mostrandoResposta,
  aoMostrarResposta,
  tentativa,
  aoDigitar,
  verificado,
  certo,
  aoVerificar,
  alternativas,
  aoEscolher,
  aoAvancar,
  producao,
  podeDesfazer,
  aoDesfazer,
  aoOuvir,
  aoEditar,
  aoSuspender,
  aoOpcoes,
  aoEncerrar,
  aoVoltar,
  atalhos = false,
  children,
}: {
  /**
   * Há teclado físico (o computador): as teclas aparecem (Espaço mostra a resposta, 1 a 4 dão a nota,
   * Z desfaz) e o campo de digitar pega o foco sozinho. No headset, não: ali o foco faria o teclado
   * do sistema subir sobre o cartão.
   */
  atalhos?: boolean;
  /** O título da tela (fica na página para o leitor de tela; quem olha lê o rótulo e o cartão). */
  titulo: string;
  /** "Revisão de hoje". */
  rotulo: string;
  indice: number;
  total: number;
  cartao: VocabCard;
  /** "B1 · Sessão". */
  selo: string;
  /** As classes da pele de cartão equipada, no estado da palavra. */
  pele: string;
  /** O título da sessão de onde a frase saiu, quando é a sessão aberta. */
  origemDaFrase?: string;
  formato: FormatoDaRodada;
  notas: NotaDoQuest[];
  mostrandoResposta: boolean;
  aoMostrarResposta: () => void;
  /** Digitar e Escolher: o que a pessoa respondeu e se já foi conferido. */
  tentativa: string;
  aoDigitar: (valor: string) => void;
  verificado: boolean;
  certo: boolean;
  aoVerificar: () => void;
  alternativas: string[];
  aoEscolher: (opcao: string) => void;
  aoAvancar: (origem: Element) => void;
  /** O exercício de produção ativa, inteiro (ele tem o próprio estado). */
  producao?: ReactNode;
  podeDesfazer: boolean;
  aoDesfazer: () => void;
  /** Sem voz para o idioma da palavra, o botão não existe. */
  aoOuvir?: () => void;
  aoEditar: () => void;
  aoSuspender: () => void;
  aoOpcoes: () => void;
  aoEncerrar: () => void;
  aoVoltar: () => void;
  children?: ReactNode;
}) {
  const dica =
    formato === 'cloze'
      ? t('Tente lembrar a tradução antes de mostrar a resposta. Depois diga o quanto foi fácil.')
      : formato === 'typing'
        ? t('Escreva a tradução da palavra e confira.')
        : formato === 'mc'
          ? t('Escolha a palavra que completa a frase.')
          : t('Escreva de memória a palavra que falta na frase.');
  const frase = cartao.sentence ? (
    <p className="exemplo">
      “{cartao.sentence}”{origemDaFrase && <span className="rev-origem"> · {origemDaFrase}</span>}
    </p>
  ) : null;

  const resultado = (texto: string) => (
    <div className="resp qr-resultado" data-certo={certo}>
      <p className={`qr-veredito ${certo ? 'certo' : 'errado'}`} role="status">
        {certo ? <CheckCircle2 aria-hidden /> : <XCircle aria-hidden />}
        <span>{texto}</span>
      </p>
      <button type="button" className="q-ctl pri qr-principal" onClick={(e) => aoAvancar(e.currentTarget)}>
        {t('Avançar')} <ArrowRight aria-hidden />
      </button>
    </div>
  );

  return (
    <div className="q-palco q-revisao" data-testid="revisao-no-quest" data-estado="rodada" data-formato={formato}>
      <header className="q-cab qr-topo">
        <button type="button" className="q-ctl q-voltar" aria-label={t('Voltar ao Vocabulário')} onClick={aoVoltar}>
          <ArrowLeft aria-hidden />
        </button>
        <div className="qr-progresso">
          <span className="q-rotulo">{rotulo}</span>
          <span
            className="q-barra"
            role="progressbar"
            aria-label={t('Progresso da rodada')}
            aria-valuenow={indice}
            aria-valuemin={0}
            aria-valuemax={total}
          >
            <span style={{ width: `${(indice / Math.max(1, total)) * 100}%` }} />
          </span>
          <span className="qr-conta">
            {indice + 1} / {total}
          </span>
        </div>
        <button type="button" className="q-ctl qr-botao-opcoes" aria-label={t('Opções da revisão')} onClick={aoOpcoes}>
          <Settings2 aria-hidden /> {t('Opções')}
        </button>
        <button type="button" className="q-ctl" onClick={aoEncerrar}>
          <X aria-hidden /> {t('Encerrar')}
        </button>
      </header>
      <h1 className="sr">{titulo}</h1>
      <p className="q-texto qr-dica">{dica}</p>

      <section className={`q-cartao qr-cartao flash ${pele}`} aria-label={t('Cartão')}>
        <span className="q-tag off qr-selo">{selo}</span>

        {formato === 'active-production' ? (
          producao
        ) : formato === 'typing' ? (
          <>
            <div className="termo">{cartao.word}</div>
            {frase}
            {!verificado ? (
              <div className="resp qr-sem-linha qr-digitar">
                <label className="q-campo">
                  <span>{t('Digite a tradução')}</span>
                  <input
                    id="rev-digitar"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="off"
                    value={tentativa}
                    placeholder={atalhos ? t('Digite a tradução…') : t('Toque para escrever')}
                    autoFocus={atalhos}
                    onChange={(e) => aoDigitar(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tentativa.trim()) aoVerificar();
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="q-ctl pri qr-principal"
                  disabled={!tentativa.trim()}
                  onClick={aoVerificar}
                >
                  <Check aria-hidden /> {t('Verificar')}
                </button>
              </div>
            ) : (
              resultado(
                certo
                  ? t('Correto! A tradução era “{traducao}”.', { traducao: cartao.translation })
                  : t('Incorreto. A tradução era “{traducao}” (você escreveu “{tentativa}”).', {
                      traducao: cartao.translation || '—',
                      tentativa,
                    }),
              )
            )}
          </>
        ) : formato === 'mc' ? (
          <>
            <div className="qr-lacuna">
              <FraseComLacuna sentence={cartao.sentence} word={cartao.word} />
            </div>
            <p className="exemplo">{cartao.translation}</p>
            {!verificado ? (
              <div className="qr-opcoes" role="group" aria-label={t('Qual palavra completa a frase')}>
                {alternativas.map((opcao, i) => (
                  <button key={i} type="button" className="qr-opcao" onClick={() => aoEscolher(opcao)}>
                    {opcao}
                  </button>
                ))}
              </div>
            ) : (
              resultado(
                certo
                  ? t('Correto!')
                  : t('Incorreto. Você selecionou “{tentativa}”. A resposta correta era “{palavra}”.', {
                      tentativa,
                      palavra: cartao.word,
                    }),
              )
            )}
          </>
        ) : (
          /* LEMBRAR: a palavra e a frase; a tradução só depois. */
          <>
            <div className="termo">{cartao.word}</div>
            {frase}
            {mostrandoResposta ? (
              <div className="resp">
                <b>{cartao.translation || '—'}</b>
                {cartao.explanation && <p>{cartao.explanation}</p>}
                <div
                  className="fsrs"
                  role="group"
                  aria-label={t('Quão fácil foi lembrar')}
                  style={{ '--n': notas.length } as CSSProperties}
                >
                  {notas.map((n) => (
                    <button key={n.id} type="button" className={n.classe} onClick={(e) => n.aoDar(e.currentTarget)}>
                      {n.rotulo}
                      <small>{n.detalhe}</small>
                      {atalhos && n.tecla && <kbd data-precisa="teclado">{n.tecla}</kbd>}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="resp qr-sem-linha">
                <button type="button" className="q-ctl pri qr-principal" onClick={aoMostrarResposta}>
                  <Eye aria-hidden /> {t('Mostrar resposta')}
                </button>
                {atalhos && (
                  <p className="qr-atalho" data-precisa="teclado">
                    {t('ou aperte')} <kbd>{t('Espaço')}</kbd>
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <div className="q-faixa" role="toolbar" aria-label={t('Ações do cartão')}>
        <button type="button" className="q-ctl" disabled={!podeDesfazer} onClick={aoDesfazer}>
          <Undo2 aria-hidden /> {t('Desfazer')}
          {atalhos && <kbd data-precisa="teclado">Z</kbd>}
        </button>
        {aoOuvir && (
          <button type="button" className="q-ctl" onClick={aoOuvir}>
            <Volume2 aria-hidden /> {t('Ouvir')}
          </button>
        )}
        <span className="q-espaco" />
        <button type="button" className="q-ctl" onClick={aoEditar}>
          <Pencil aria-hidden /> {t('Editar cartão')}
        </button>
        <button type="button" className="q-ctl" onClick={aoSuspender}>
          <Pause aria-hidden /> {t('Suspender')}
        </button>
      </div>

      {children}
    </div>
  );
}

/* ── OPÇÕES DA REVISÃO ─────────────────────────────────────────────────────────────────────────── */

export type TipoDeCartaoDoQuest = 'lembrar' | 'digitar' | 'escolha';
export type OrdemDoQuest = 'vencidas' | 'misturar';
export interface ValoresDaRevisaoNoQuest {
  novas: number;
  revisoes: number;
  ordem: OrdemDoQuest;
  tipo: TipoDeCartaoDoQuest;
  ouvir: boolean;
  retencao: number;
}

/** Número com menos e mais: escrever um número com o teclado do headset é o caminho lento. */
function Passo({
  rotulo,
  valor,
  min,
  max,
  passo,
  aoTrocar,
}: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  passo: number;
  aoTrocar: (n: number) => void;
}) {
  const limitar = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  return (
    <span className="qr-passo">
      <button
        type="button"
        className="q-ctl"
        aria-label={t('Diminuir: {rotulo}', { rotulo })}
        disabled={valor <= min}
        onClick={() => aoTrocar(limitar(valor - passo))}
      >
        <Minus aria-hidden />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={valor}
        aria-label={rotulo}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) aoTrocar(limitar(n));
        }}
      />
      <button
        type="button"
        className="q-ctl"
        aria-label={t('Aumentar: {rotulo}', { rotulo })}
        disabled={valor >= max}
        onClick={() => aoTrocar(limitar(valor + passo))}
      >
        <Plus aria-hidden />
      </button>
    </span>
  );
}

/** Escolha entre poucos, com as pílulas do headset. */
function Escolha<T extends string>({
  rotulo,
  atual,
  opcoes,
  aoTrocar,
}: {
  rotulo: string;
  atual: T;
  opcoes: Array<[T, string]>;
  aoTrocar: (v: T) => void;
}) {
  return (
    <div className="q-abas q-seg" role="group" aria-label={rotulo}>
      {opcoes.map(([v, r]) => (
        <button key={v} type="button" className="q-aba" aria-pressed={atual === v} onClick={() => aoTrocar(v)}>
          {r}
        </button>
      ))}
    </div>
  );
}

/** As seis opções da revisão, uma por linha, todas valendo de verdade (as mesmas da tela de sempre). */
export function OpcoesDaRevisaoNoQuest({
  valores,
  padrao,
  temVoz,
  producao,
  aoTrocar,
  aoFechar,
}: {
  valores: ValoresDaRevisaoNoQuest;
  padrao: ValoresDaRevisaoNoQuest;
  /** Há voz para o idioma estudado neste aparelho? Sem ela, "ouvir ao mostrar" diz o motivo. */
  temVoz: boolean;
  producao?: ProducaoAtivaNoQuest;
  aoTrocar: (v: Partial<ValoresDaRevisaoNoQuest>) => void;
  aoFechar: () => void;
}) {
  const descricao: Record<TipoDeCartaoDoQuest, string> = {
    lembrar: t('Você pensa e mostra a resposta.'),
    digitar: t('Você escreve a tradução.'),
    escolha: t('Quatro alternativas.'),
  };
  return (
    <Dialogo
      icone={SlidersHorizontal}
      titulo={t('Opções da revisão')}
      sub={t('Valem para todas as rodadas. A agenda é do FSRS.')}
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo qr-opcoes-dlg">
        <div className="q-ajuste">
          <div>
            <b>{t('Novas por dia')}</b>
            <small>{t('Quantas palavras nunca vistas entram por dia.')}</small>
          </div>
          <Passo
            rotulo={t('Novas por dia')}
            valor={valores.novas}
            min={0}
            max={200}
            passo={5}
            aoTrocar={(novas) => aoTrocar({ novas })}
          />
        </div>
        <div className="q-ajuste">
          <div>
            <b>{t('Revisões por dia')}</b>
            <small>{t('Um teto para dias de atraso; o resto fica para amanhã.')}</small>
          </div>
          <Passo
            rotulo={t('Revisões por dia')}
            valor={valores.revisoes}
            min={10}
            max={999}
            passo={10}
            aoTrocar={(revisoes) => aoTrocar({ revisoes })}
          />
        </div>
        <div className="q-ajuste">
          <div>
            <b>{t('Ordem')}</b>
          </div>
          <Escolha<OrdemDoQuest>
            rotulo={t('Ordem')}
            atual={valores.ordem}
            aoTrocar={(ordem) => aoTrocar({ ordem })}
            opcoes={[
              ['vencidas', t('Vencidas primeiro')],
              ['misturar', t('Misturar')],
            ]}
          />
        </div>
        <div className="q-ajuste">
          <div>
            <b>{t('Tipo de cartão')}</b>
            <small>{descricao[valores.tipo]}</small>
          </div>
          <Escolha<TipoDeCartaoDoQuest>
            rotulo={t('Tipo de cartão')}
            atual={valores.tipo}
            aoTrocar={(tipo) => aoTrocar({ tipo })}
            opcoes={[
              ['lembrar', t('Lembrar')],
              ['digitar', t('Digitar')],
              ['escolha', t('Escolher')],
            ]}
          />
        </div>
        <div className="q-ajuste">
          <div>
            <b>{t('Ouvir a palavra ao mostrar')}</b>
            {!temVoz && <small>{t('Este aparelho não tem voz para o idioma que você estuda.')}</small>}
          </div>
          <button
            type="button"
            className="q-interruptor"
            role="switch"
            aria-checked={valores.ouvir}
            aria-label={t('Ouvir a palavra ao mostrar')}
            onClick={() => aoTrocar({ ouvir: !valores.ouvir })}
          />
        </div>
        <div className="q-ajuste">
          <div>
            <b>{t('Meta de retenção · {n}%', { n: valores.retencao })}</b>
            <small>{t('Mais alta = palavras voltam mais cedo, mais revisões por dia.')}</small>
          </div>
          <span className="qr-passo">
            <button
              type="button"
              className="q-ctl"
              aria-label={t('Diminuir: {rotulo}', { rotulo: t('Meta de retenção') })}
              disabled={valores.retencao <= 80}
              onClick={() => aoTrocar({ retencao: Math.max(80, valores.retencao - 1) })}
            >
              <Minus aria-hidden />
            </button>
            <input
              type="range"
              min={80}
              max={97}
              value={valores.retencao}
              aria-label={t('Meta de retenção')}
              onChange={(e) => aoTrocar({ retencao: Number(e.target.value) })}
            />
            <button
              type="button"
              className="q-ctl"
              aria-label={t('Aumentar: {rotulo}', { rotulo: t('Meta de retenção') })}
              disabled={valores.retencao >= 97}
              onClick={() => aoTrocar({ retencao: Math.min(97, valores.retencao + 1) })}
            >
              <Plus aria-hidden />
            </button>
          </span>
        </div>
        {/* Não é um ajuste: é o outro exercício desta tela, que no computador só abre pelo teclado. */}
        {producao && (
          <div className="q-ajuste" data-testid="producao-ativa-nas-opcoes">
            <div>
              <b>{producao.rotulo}</b>
              <small>{producao.bloqueio ?? producao.dica}</small>
            </div>
            <button
              type="button"
              className="q-ctl"
              disabled={!!producao.bloqueio}
              onClick={(e) => {
                fecharDialogoDe(e.currentTarget);
                producao.aoComecar();
              }}
            >
              <PenLine aria-hidden /> {t('Começar')}
            </button>
          </div>
        )}
      </div>
      <div className="dlg-pe">
        <button type="button" className="q-ctl" style={{ marginRight: 'auto' }} onClick={() => aoTrocar({ ...padrao })}>
          <RotateCcw aria-hidden /> {t('Voltar ao padrão')}
        </button>
        <button type="button" className="q-ctl pri" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
          <Check aria-hidden /> {t('Pronto')}
        </button>
      </div>
    </Dialogo>
  );
}
