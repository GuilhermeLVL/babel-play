/**
 * O CATÁLOGO ("Escolher o conteúdo") — a MESMA folha em toda tela. Diálogo com o painel ao lado no
 * computador; folha de baixo, numa coluna, no celular (o CSS do protótipo e `lib/polimento/dialogos.ts`
 * cuidam das duas formas).
 *
 * Idioma no alto (quando há mais de um). Depois: Tudo, Difíceis · Das minhas sessões · Do Anki ·
 * Trilha do app. Cada linha: o nome inteiro, a contagem por extenso e de onde veio. UMA ação por linha:
 * Usar. No celular a linha inteira usa; no computador a linha mostra o painel ao lado e o botão da
 * ponta usa.
 *
 * A MARCAÇÃO É A DO PROTÓTIPO, função por função: `fxAbrirCatalogo()` (`seletor.js:301-323`),
 * `fsCorpoDoCatalogo()` (248-257), `fxListaDoCatalogo()` (211-226), `fxLinhaDaFonte()` (200-210),
 * `fxDetalheDaFonte()` (227-247), `fsCliqueNoCatalogo()` (265-300) e `fxAbrirTrazer()`
 * (`fontes.js:340-367`). O CSS é o dele (`seletor.css`, `fontes.css`, copiados).
 *
 * Este arquivo só é baixado quando a ficha é tocada (`SeletorDeConteudo` o importa com `lazy`).
 */
import {
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Ellipsis,
  Gamepad2,
  Layers,
  Lock,
  Mic,
  Plus,
  Search,
  Sparkles,
  Target,
  WalletCards,
  X,
  Youtube,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import type { ContagensDeConteudo } from '../../core/learning/contagensDeConteudo';
import type { MinigameId } from '../../core/minigames/types';
import { chaveDaFonte, type Conteudo, type FonteDeConteudo } from '../../lib/conteudo/estado';
import { jogoServe, jogosQueServem, type ServeOuNao } from '../../lib/conteudo/jogos';
import { numero, t, tp } from '../../lib/i18n';
import { fetchLangConfig } from '../../lib/langConfig';
import { anima, polido, reduz } from '../../lib/polimento/base';
import { nomeCurtoDoJogo } from '../minigames/polimento/textos';
import { toast } from '../Toast';
import { DialogoBase } from '../ui/Dialogo';
import { ARQUIVOS_DO_ANKI, FluxoDoAnki } from '../views/cartoes/TrazerELevar';
import {
  contagemPorExtenso,
  doisIdiomas,
  type GrupoDoCatalogo,
  type LinhaDoCatalogo,
  linhasDoCatalogo,
  nomeDoIdioma,
} from './fontes';

const celular = () => window.matchMedia?.('(max-width: 720px)').matches ?? false;

export interface AcoesDoCatalogo {
  /** "Revisar · N": a fonte já virou a escolha; quem recebe leva para a revisão. */
  aoRevisar?: (fonte: FonteDeConteudo) => void;
  /** "Praticar": a folha das práticas. */
  aoPraticar?: (fonte: FonteDeConteudo) => void;
  /** "Jogar": a fonte já virou a escolha; quem recebe leva para o Jogar. */
  aoJogar?: (fonte: FonteDeConteudo) => void;
  /** "Ver palavras": a lista de Palavras filtrada por esta fonte. */
  aoVerPalavras?: (fonte: FonteDeConteudo) => void;
  /** O "…" do painel: abrir a sessão, gerenciar, exportar. */
  aoMais?: (fonte: FonteDeConteudo, gatilho: HTMLElement) => void;
  /** "Capturar" (grupo vazio e "Trazer uma fonte"). */
  aoCapturar?: () => void;
  /** "Colar uma lista ou um texto", de "Trazer uma fonte". */
  aoColarLista?: () => void;
  /** "Vídeo, áudio ou PDF", de "Trazer uma fonte". */
  aoTrazerArquivo?: () => void;
}

/** O jogo que pediu o catálogo ("Ver o que serve"): o que não serve para ele vem marcado (`FX.paraJogo`). */
export interface JogoDoCatalogo {
  id: MinigameId;
  titulo: string;
  /** O que falta a ele no conteúdo de agora, como o cartão do jogo diz ("Precisa de 3 frases; aqui há 2."). */
  falta: string;
}

export interface PropsDoCatalogo extends AcoesDoCatalogo {
  conteudo: Conteudo;
  /** `null` enquanto a primeira leitura não chega. */
  contagens: ContagensDeConteudo | null;
  /** Escolhe (e o catálogo fecha). `idioma`: o idioma em que a fonte foi listada. */
  aoEscolher: (fonte: FonteDeConteudo, idioma: string) => void;
  aoMudarIdioma: (idioma: string) => void;
  /** Lê as contagens de novo (depois de trazer uma fonte). */
  aoRecarregar: () => Promise<ContagensDeConteudo | null>;
  aoFechar: () => void;
  /** Abre direto em "Trazer uma fonte". */
  abrirEm?: 'catalogo' | 'trazer';
  semRede?: boolean;
  paraJogo?: JogoDoCatalogo | null;
  /** A Trilha do app no idioma: ver `linhasDoCatalogo`. */
  trilhaDoApp?: { palavras: number; frases: number } | null;
}

const GRUPOS: Array<[GrupoDoCatalogo, string]> = [
  ['sessao', 'Das minhas sessões'],
  ['anki', 'Do Anki'],
  ['trilha', 'Trilha do app'],
];

/** `ctDica()` de `cartoes.js:193`. */
function Dica({ texto }: { texto: string }) {
  return (
    <button type="button" className="ct-dica" title={texto} aria-label={t('O que é isto')}>
      <CircleHelp aria-hidden />
    </button>
  );
}

/** O motivo de um jogo não abrir, em poucas palavras (`fxServe`, `fontes.js:100-105`), já em minúscula. */
function motivo(linha: LinhaDoCatalogo, serve: ServeOuNao): string {
  if (serve.ok) return '';
  const s = serve as Extract<ServeOuNao, { ok: false }>;
  if (s.pede === 'rede') return t('precisa de internet para ouvir a sua voz.');
  if (s.pede === 'palavras') return t('precisa de {min} palavras; aqui há {ha}.', { min: s.minimo, ha: s.ha });
  if (s.pede === 'frases-ou-palavras')
    return t('precisa de {min} frases ou palavras; aqui há {ha}.', { min: s.minimo, ha: s.ha });
  return linha.grupo === 'trilha'
    ? t('precisa de {min} frases; a Trilha só tem palavras soltas.', { min: s.minimo })
    : t('precisa de {min} frases; aqui há {ha}.', { min: s.minimo, ha: s.ha });
}

/** Uma linha do catálogo (`fxLinhaDaFonte()`, `seletor.js:200-210`). */
function Linha({
  linha,
  emUso,
  selecionada,
  naoServe,
  aoTocar,
  aoUsar,
}: {
  linha: LinhaDoCatalogo;
  emUso: boolean;
  selecionada: boolean;
  /** O motivo de a fonte não servir ao jogo que pediu o catálogo (`seletor.js:201-206`). */
  naoServe?: string;
  aoTocar: () => void;
  aoUsar: () => void;
}) {
  const { Icone } = linha;
  const contagem = contagemPorExtenso(linha);
  return (
    <div
      className={`ct-linha-caixa fx-linha-caixa ${naoServe ? 'fx-nao-serve' : ''} ${emUso ? 'fx-linha-em-uso' : ''}`}
    >
      <button
        type="button"
        className="q-linha ct-linha-b fx-linha"
        data-fx-fonte={linha.chave}
        aria-pressed={selecionada}
        data-em-uso={emUso ? '1' : undefined}
        onClick={aoTocar}
      >
        <span className="q-ic" aria-hidden>
          <Icone />
        </span>
        <span className="fx-linha-texto">
          <b>{linha.nome}</b>
          <small className="fx-linha-conta">{naoServe || contagem}</small>
          <small className="fx-linha-de">{linha.deOnde}</small>
        </span>
      </button>
      {naoServe ? (
        <span className="ct-em-dia fx-nao">
          <Lock aria-hidden />
          <span>{t('não serve')}</span>
        </span>
      ) : emUso ? (
        <span className="ct-em-dia fx-em-uso">
          <Check aria-hidden />
          <span>{t('em uso')}</span>
        </span>
      ) : (
        <button
          type="button"
          className="q-ctl ct-revisar fx-usar"
          data-fx-usar={linha.chave}
          aria-label={t('Usar {nome}: {contagem}', { nome: linha.nome, contagem })}
          onClick={aoUsar}
        >
          <span>{t('Usar')}</span>
          <ChevronRight aria-hidden />
        </button>
      )}
    </div>
  );
}

/** O painel da fonte selecionada (`fxDetalheDaFonte()`, `seletor.js:227-247`). */
function Detalhe({
  linha,
  emUso,
  comIdioma,
  semRede,
  aoUsar,
  aoAgir,
  acoes,
}: {
  linha: LinhaDoCatalogo;
  emUso: boolean;
  /** "Inglês", quando há dois idiomas. */
  comIdioma: string;
  semRede: boolean;
  aoUsar: () => void;
  /** Uma ação do painel: a fonte vira a escolha, o catálogo fecha e a ação leva. */
  aoAgir: (acao: (fonte: FonteDeConteudo) => void) => void;
  acoes: AcoesDoCatalogo;
}) {
  const { Icone } = linha;
  const { servem, total, fora } = jogosQueServem(linha, { semRede });
  const hoje = linha.paraHoje;
  return (
    <>
      <div className="q-bib-topo">
        <span className="q-ic" aria-hidden>
          <Icone />
        </span>
        <div>
          <p className="q-bib-tags">
            <span className="q-tag">{linha.tipo}</span>
            {comIdioma && <span className="q-tag off">{comIdioma}</span>}
            {emUso && <span className="q-tag ct-rv">{t('Em uso')}</span>}
          </p>
          <h2>{linha.nome}</h2>
        </div>
        {acoes.aoMais && (
          <button
            type="button"
            className="q-ctl ct-so-icone"
            aria-label={t('Mais ações deste conteúdo')}
            title={t('Gerenciar, exportar, compartilhar por link')}
            onClick={(e) => acoes.aoMais?.(linha.fonte, e.currentTarget)}
          >
            <Ellipsis aria-hidden />
          </button>
        )}
      </div>
      <dl className="q-bib-fatos ct-fatos3">
        {(
          [
            [t('Palavras'), numero(linha.palavras)],
            [t('Frases'), numero(linha.frases)],
            [t('Para hoje'), linha.palavras ? numero(hoje) : '—'],
          ] as const
        ).map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt>{rotulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
      {fora.length ? (
        <ul className="fx-fora">
          <li className="fx-fora-t">
            <Gamepad2 aria-hidden />
            <span>
              <b>{t('{n} de {total} jogos', { n: servem, total })}</b> {t('abrem com ele.')}
            </span>
          </li>
          {fora.slice(0, 2).map((id) => {
            const s = jogoServe(id, linha, { semRede });
            return (
              <li key={id}>
                <Lock aria-hidden />
                <span>
                  <b>{nomeCurtoDoJogo(id)}</b> {motivo(linha, s)}
                </span>
              </li>
            );
          })}
          {fora.length > 2 && (
            <li className="mais">
              <Lock aria-hidden />
              <span>
                {tp(fora.length - 2, 'e mais {n} jogo pelo mesmo motivo', 'e mais {n} jogos pelo mesmo motivo')}
              </span>
            </li>
          )}
        </ul>
      ) : (
        <p className="fx-todos">
          <Check aria-hidden />
          <span>{t('Os {n} jogos abrem com ele.', { n: total })}</span>
        </p>
      )}
      <div className="q-bib-acoes" role="toolbar" aria-label={t('O que fazer com este conteúdo')}>
        <button type="button" className="q-ctl pri" data-fx-usar={linha.chave} onClick={aoUsar}>
          <Check aria-hidden /> {emUso ? t('Continuar com este') : t('Usar este conteúdo')}
        </button>
        {(acoes.aoRevisar || acoes.aoPraticar || acoes.aoJogar || acoes.aoVerPalavras) && (
          <div className="q-acoes fs-acoes">
            {acoes.aoRevisar && (
              <button
                type="button"
                className="q-ctl"
                disabled={!hoje}
                title={hoje ? t('Abre a revisão por cartões') : t('Nada vence aqui hoje')}
                onClick={() => aoAgir(acoes.aoRevisar!)}
              >
                <Target aria-hidden /> {hoje ? t('Revisar · {n}', { n: numero(hoje) }) : t('Revisar')}
              </button>
            )}
            {acoes.aoPraticar && (
              <button type="button" className="q-ctl" onClick={() => aoAgir(acoes.aoPraticar!)}>
                <Sparkles aria-hidden /> {t('Praticar')}
              </button>
            )}
            {acoes.aoJogar && (
              <button type="button" className="q-ctl" disabled={!servem} onClick={() => aoAgir(acoes.aoJogar!)}>
                <Gamepad2 aria-hidden /> {t('Jogar')}
              </button>
            )}
            {acoes.aoVerPalavras && (
              <button type="button" className="q-ctl" onClick={() => aoAgir(acoes.aoVerPalavras!)}>
                <BookOpen aria-hidden /> {t('Ver palavras')}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/** O cabeçalho do diálogo (`ctDlg()`, `cartoes.js:168-169`, e `seletor.js:310`). */
function Cabeca({ Icone, titulo, sub }: { Icone: typeof Layers; titulo: string; sub: ReactNode }) {
  return (
    <div className="dlg-cab">
      <span className="q-ic" aria-hidden>
        <Icone />
      </span>
      <div>
        <h2>{titulo}</h2>
        <p className="qj-nota">{sub}</p>
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
  );
}

/**
 * "TRAZER UMA FONTE" (`fxAbrirTrazer()`, `fontes.js:340-367`): a porta única, dentro do catálogo. O que
 * entra por ela já vira o conteúdo escolhido.
 */
function TrazerUmaFonte({
  aoFechar,
  aoArquivoDoAnki,
  aoColarLista,
  aoTrazerArquivo,
  aoCapturar,
  semRede,
}: {
  aoFechar: () => void;
  /** O arquivo do Anki foi escolhido: o catálogo segue para o fluxo de trazer (`FluxoDoAnki`). */
  aoArquivoDoAnki: (arquivo: File) => void;
  aoColarLista?: () => void;
  aoTrazerArquivo?: () => void;
  aoCapturar?: () => void;
  semRede: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
  const sair = (depois?: () => void) => () => {
    dialogo.current?.close();
    depois?.();
  };
  /* `comuns` de `fontes.js:342-347`, na mesma ordem. */
  const linhas: Array<[typeof Layers, string, string, (() => void) | undefined, string]> = [
    [
      WalletCards,
      t('Arquivo do Anki'),
      t('Arquivo .apkg, texto ou CSV. A tela diz o que vem e o que não vem.'),
      () => entrada.current?.click(),
      'anki',
    ],
    [
      Clipboard,
      t('Colar uma lista ou um texto'),
      t('Uma palavra por linha, com ou sem tradução. Também lê CSV.'),
      aoColarLista && sair(aoColarLista),
      'lista',
    ],
    [
      Youtube,
      t('Vídeo, áudio ou PDF'),
      semRede
        ? t('Do aparelho funciona agora. Link (YouTube, página) espera a internet.')
        : t('Link do YouTube ou arquivo do aparelho. Vira uma sessão com legenda.'),
      aoTrazerArquivo && sair(aoTrazerArquivo),
      'arquivo',
    ],
    [
      Mic,
      t('Capturar agora'),
      t('Legende o que está tocando ou uma conversa. Ao encerrar, a sessão vira fonte.'),
      aoCapturar && sair(aoCapturar),
      'capturar',
    ],
  ];

  return (
    <DialogoBase
      classe="qj qj-painel medio ct-dlg ct-menu ct-trazer fx-trazer"
      rotulo={t('Trazer uma fonte')}
      aoFechar={aoFechar}
      refDialogo={dialogo}
    >
      <Cabeca
        Icone={Plus}
        titulo={t('Trazer uma fonte')}
        sub={t('O que você trouxer já vem escolhido como conteúdo, nos Cartões e no Jogar.')}
      />
      <div className="dlg-corpo qj-painel-corpo">
        <div className="q-lista ct-menu-lista">
          {linhas.map(
            ([Icone, titulo, detalhe, acao, chave]) =>
              acao && (
                <button key={chave} type="button" className="q-linha" data-ct-m={chave} onClick={acao}>
                  <span className="q-ic" aria-hidden>
                    <Icone />
                  </span>
                  <span>
                    <b>{titulo}</b>
                    <small>{detalhe}</small>
                  </span>
                  <span className="q-fim" aria-hidden>
                    <ChevronRight />
                  </span>
                </button>
              ),
          )}
        </div>
        <input
          ref={entrada}
          type="file"
          accept={ARQUIVOS_DO_ANKI}
          hidden
          aria-label={t('Arquivo do Anki')}
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = '';
            if (arquivo) aoArquivoDoAnki(arquivo);
          }}
        />
      </div>
    </DialogoBase>
  );
}

export default function CatalogoDeConteudo({
  conteudo,
  contagens,
  aoEscolher,
  aoMudarIdioma,
  aoRecarregar,
  aoFechar,
  abrirEm = 'catalogo',
  semRede = false,
  paraJogo = null,
  trilhaDoApp = null,
  ...acoes
}: PropsDoCatalogo) {
  const [vista, setVista] = useState<'catalogo' | 'trazer'>(abrirEm);
  /* O arquivo do Anki escolhido em "Trazer uma fonte", com os idiomas a dar ao que vier. */
  const [doAnki, setDoAnki] = useState<{ arquivo: File; idioma: string; idiomaNativo: string } | null>(null);
  const [busca, setBusca] = useState('');
  /* `FX.sel` (`seletor.js:305`): o painel abre na fonte em uso. */
  const [sel, setSel] = useState(() => chaveDaFonte(conteudo.fonte));
  const dialogo = useRef<HTMLDialogElement>(null);
  const painel = useRef<HTMLElement>(null);
  const animarPainel = useRef(false);

  const linhas = useMemo(
    () =>
      contagens
        ? linhasDoCatalogo(contagens, conteudo.fonte, trilhaDoApp)
            /* Quem ainda não tem palavra nenhuma: "Tudo" vazio não é uma escolha; fica a Trilha (`fsTodas`, `fontes.js:75`). */
            .filter((l, _i, todas) => l.chave !== 'tudo' || l.palavras > 0 || todas.length === 1)
        : [],
    [contagens, conteudo.fonte, trilhaDoApp],
  );
  const emUso = chaveDaFonte(conteudo.fonte);
  const selecionada = linhas.find((l) => l.chave === sel) ?? linhas.find((l) => l.chave === emUso) ?? linhas[0];
  const idioma = contagens?.idioma || conteudo.idioma;
  const dois = doisIdiomas(contagens);

  /* O movimento do painel ao trocar de linha (`seletor.js:276-279`). */
  useEffect(() => {
    if (!animarPainel.current) return;
    animarPainel.current = false;
    const det = painel.current;
    if (!det || !polido() || reduz()) return;
    anima(
      det,
      [
        { opacity: 0.2, transform: 'scale(0.97)', filter: 'blur(8px)' },
        { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
      ],
      { d: 460 },
    );
    det
      .querySelectorAll('.q-bib-fatos > div, .fx-fora li, .fx-todos, .q-bib-acoes > *, .fs-cobertura')
      .forEach((el, i) =>
        anima(
          el,
          [
            { opacity: 0, transform: 'translateY(12px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { d: 420, atraso: 60 + i * 40 },
        ),
      );
  }, [sel]);

  const usar = (linha: LinhaDoCatalogo) => {
    aoEscolher(linha.fonte, idioma);
    dialogo.current?.close();
  };
  /* `fsCliqueNoCatalogo()` de `seletor.js:270-281`: no celular a linha inteira usa; no computador mostra o painel. */
  /* `fxLinhaDaFonte()` de `seletor.js:201`: a fonte serve ao jogo que pediu o catálogo? */
  const naoServeA = (linha: LinhaDoCatalogo): string => {
    if (!paraJogo) return '';
    const m = motivo(linha, jogoServe(paraJogo.id, linha, { semRede }));
    return m ? m.charAt(0).toLocaleUpperCase() + m.slice(1) : '';
  };
  const tocar = (linha: LinhaDoCatalogo) => {
    if (celular()) {
      /* `seletor.js:271`. */
      if (naoServeA(linha))
        return void toast.warn(t('Este não serve para o jogo que você tocou. Escolha um sem cadeado.'));
      return usar(linha);
    }
    if (linha.chave === sel) return;
    animarPainel.current = true;
    setSel(linha.chave);
  };
  /* `seletor.js:282-285`: as ações do painel definem o conteúdo e levam. */
  const agir = (linha: LinhaDoCatalogo) => (acao: (fonte: FonteDeConteudo) => void) => {
    aoEscolher(linha.fonte, idioma);
    dialogo.current?.close();
    acao(linha.fonte);
  };

  /* O MESMO fluxo do Anki da tela Cartões (`views/cartoes/TrazerELevar.tsx`): o que vem e o que não vem,
     quantas ativar e o relatório. O baralho que ganhar cartões já vira o conteúdo escolhido. */
  if (doAnki)
    return (
      <FluxoDoAnki
        arquivo={doAnki.arquivo}
        idioma={doAnki.idioma}
        idiomaNativo={doAnki.idiomaNativo}
        aoMudou={() => void aoRecarregar()}
        aoTrouxe={async (fonte) => {
          const k = await aoRecarregar();
          aoEscolher(fonte, k?.idioma ?? idioma);
        }}
        aoFechar={aoFechar}
      />
    );
  if (vista === 'trazer')
    return (
      <TrazerUmaFonte
        aoFechar={aoFechar}
        semRede={semRede}
        aoColarLista={acoes.aoColarLista}
        aoTrazerArquivo={acoes.aoTrazerArquivo}
        aoCapturar={acoes.aoCapturar}
        aoArquivoDoAnki={(arquivo) => {
          void fetchLangConfig().then((idiomas) =>
            setDoAnki({ arquivo, idioma: idiomas.studying, idiomaNativo: idiomas.mine }),
          );
        }}
      />
    );

  /* `fxListaDoCatalogo()` de `seletor.js:211-226`. */
  const q = busca.trim().toLocaleLowerCase();
  const achadas = linhas.filter(
    (l) => !q || l.nome.toLocaleLowerCase().includes(q) || l.tipo.toLocaleLowerCase().includes(q),
  );
  const de = (g: GrupoDoCatalogo) => achadas.filter((l) => l.grupo === g);
  const semNadaSeu = !!contagens && !contagens.sessoes.length && !contagens.anki.length;
  const abrirTrazer = () => setVista('trazer');
  const fila = (lista: LinhaDoCatalogo[]) => (
    <div className="q-lista">
      {lista.map((l) => (
        <Linha
          key={l.chave}
          linha={l}
          emUso={l.chave === emUso}
          selecionada={l.chave === selecionada?.chave}
          naoServe={naoServeA(l)}
          aoTocar={() => tocar(l)}
          aoUsar={() => usar(l)}
        />
      ))}
    </div>
  );
  const vazio: Partial<Record<GrupoDoCatalogo, ReactNode>> = {
    sessao: (
      <p className="fx-grupo-vazio">
        {t('Nenhuma sessão ainda. Uma captura, um vídeo ou um texto viram conteúdo.')}
        <span>
          {acoes.aoCapturar && (
            <button
              type="button"
              className="ex-lig"
              onClick={() => {
                dialogo.current?.close();
                acoes.aoCapturar?.();
              }}
            >
              <Mic aria-hidden />
              {t('Capturar')}
            </button>
          )}
          <button type="button" className="ex-lig" onClick={abrirTrazer}>
            <Plus aria-hidden />
            {t('Trazer')}
          </button>
        </span>
      </p>
    ),
    anki: (
      <p className="fx-grupo-vazio">
        {t('Nenhum baralho do Anki.')}
        <span>
          <button type="button" className="ex-lig" onClick={abrirTrazer}>
            <WalletCards aria-hidden />
            {t('Trazer um arquivo do Anki')}
          </button>
        </span>
      </p>
    ),
  };

  return (
    <DialogoBase
      classe="qj qj-painel largo ct-dlg fx-catalogo"
      rotulo={t('Escolher o conteúdo')}
      aoFechar={aoFechar}
      refDialogo={dialogo}
    >
      <Cabeca
        Icone={Layers}
        titulo={t('Escolher o conteúdo')}
        sub={
          paraJogo ? (
            <>
              <b>{paraJogo.titulo}</b> {paraJogo.falta.charAt(0).toLocaleLowerCase() + paraJogo.falta.slice(1)}{' '}
              {t('O que não serve para ele está marcado.')}
            </>
          ) : (
            t('Vale para os Cartões e para o Jogar, e fica guardado.')
          )
        }
      />
      <div className="dlg-corpo qj-painel-corpo fx-cat-corpo">
        <div className="fx-cat-col">
          {dois && contagens && (
            <div className="fs-idiomas">
              <span className="q-rotulo">{t('Idioma')}</span>
              <div className="q-abas q-seg" role="group" aria-label={t('Idioma do conteúdo')}>
                {contagens.idiomas.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    className="q-aba"
                    aria-pressed={idioma === i.id}
                    data-fx-lang={i.id}
                    onClick={() => {
                      if (i.id === idioma) return;
                      setSel('tudo');
                      aoMudarIdioma(i.id);
                    }}
                  >
                    {nomeDoIdioma(i.id)}
                    <span className="n">{numero(i.palavras)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {!semNadaSeu && (
            <label className="q-campo q-bib-busca fx-busca">
              <Search aria-hidden />
              <input
                type="search"
                autoComplete="off"
                placeholder={t('Buscar sessão ou baralho')}
                aria-label={t('Buscar conteúdo pelo nome')}
                value={busca}
                data-fx-campo="busca"
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
          )}
          <div className="fx-cat-lista ct-bar-col" aria-busy={!contagens}>
            {q && !achadas.length ? (
              <div className="q-vazio fx-vazio">
                <h2>{t('Nada com “{busca}”', { busca })}</h2>
                <p>{t('Procure pelo nome da sessão ou do baralho.')}</p>
                <button type="button" className="q-ctl" onClick={() => setBusca('')}>
                  {t('Limpar a busca')}
                </button>
              </div>
            ) : (
              <>
                {de('topo').length > 0 && fila(de('topo'))}
                {GRUPOS.map(([g, titulo]) => {
                  const l = de(g);
                  if (!l.length && (q || !semNadaSeu || !vazio[g])) return null;
                  return (
                    <section key={g} className="q-secao ct-grupo">
                      <header>
                        <div>
                          <h3>
                            {t(titulo)}
                            {l.length > 8 && <span className="fx-grupo-n"> {numero(l.length)}</span>}
                          </h3>
                        </div>
                        {g === 'trilha' && (
                          <Dica
                            texto={t(
                              'Palavras prontas do app, por nível. Servem para quem ainda não tem as suas e para completar o que falta.',
                            )}
                          />
                        )}
                      </header>
                      {l.length ? fila(l) : vazio[g]}
                    </section>
                  );
                })}
              </>
            )}
          </div>
          <button type="button" className="q-linha q-bib-nova ct-novo-baralho fx-nova" onClick={abrirTrazer}>
            <span className="q-bib-nova-dentro">
              <span className="q-ic" aria-hidden>
                <Plus />
              </span>
              <span>
                <b>{t('Trazer uma fonte')}</b>
                <small>{t('Arquivo do Anki, lista ou texto colado, vídeo ou PDF. Ela já vem escolhida.')}</small>
              </span>
            </span>
          </button>
        </div>
        <section
          className="q-cartao q-bib-det ct-bar-det fx-cat-det"
          aria-label={t('Conteúdo selecionado')}
          ref={painel}
        >
          {selecionada && (
            <Detalhe
              linha={selecionada}
              emUso={selecionada.chave === emUso}
              comIdioma={dois ? nomeDoIdioma(idioma) : ''}
              semRede={semRede}
              aoUsar={() => usar(selecionada)}
              aoAgir={agir(selecionada)}
              acoes={acoes}
            />
          )}
        </section>
      </div>
    </DialogoBase>
  );
}
