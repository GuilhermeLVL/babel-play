import type { CefrLevel, EscolhaDaPratica, EscopoDeGravacoes, OrigemDaPratica } from '@core';
import { Check as IconeCheck, FileAudio, Flame, Globe, GraduationCap, Layers, Mic, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { type EscalaDaTrilha, nomeDaEscala, rotuloDaEtapa } from '../../core/learning/trilha';
import { idiomaInicialDaSala } from '../../core/minigames/source';
import { empilharCamada } from '../../lib/camadasDeEscape';
import { numero, t, tp } from '../../lib/i18n';
import { langLabelNaUI } from '../../lib/languages';
import type { AgeProfileType } from '../../lib/profile';
import LangPicker from '../LangPicker';
import { OpcoesDoQuest } from '../views/play/quest/pecasDoQuest';
import { TabelaDaCobertura } from './CoberturaDosIdiomas';

/**
 * A SALA DE ESCOLHA — o que você vai jogar, decidido antes de a tela encher de cartas.
 *
 * O DEFEITO QUE ELA CONSERTA. A escolha de fonte vivia num `<details>` recolhido, cujo resumo era
 * "Praticar · Minhas palavras · ajustar" em texto pequeno. Ninguém abria. Quem abria encontrava um
 * seletor de idioma, três botões de fonte e um chevron que revelava uma lista de gravações
 * renderizada FORA do próprio `<details>` — que continuava na tela depois de fechá-lo. E a opção
 * "Trilha" simplesmente não aparecia quando o idioma praticado não era inglês, sem dizer por quê.
 *
 * AQUI A ESCOLHA É A PRIMEIRA COISA QUE ACONTECE, e é binária: as palavras vêm das SUAS GRAVAÇÕES
 * ou da TRILHA. Nada de três fontes em que uma continha a outra — `cartoesDaFonte` agora
 * particiona o baralho de verdade, então a pergunta tem duas respostas exclusivas.
 *
 * UM CLIQUE, NÃO UM FORMULÁRIO. Ela abre com a última escolha já marcada e o foco no botão de
 * jogar: quem não quer mudar nada aperta Enter. Isso é o que permite que ela apareça a cada
 * entrada sem virar pedágio.
 *
 * A TRILHA APARECE SEMPRE, desabilitada com o motivo quando não existe lista para o idioma. Foi
 * exatamente escondê-la que produziu o relato "faltou a parte de dar trilha aqui".
 *
 * `z-[45]`: acima do dock (30) e da camada de pontuação (40); abaixo da ficha "como se joga" (90),
 * do tour (95) e dos avisos (100). Ela nunca coexiste com uma partida — ver o orçamento de camadas
 * documentado em `Play.tsx`.
 */

/**
 * ONDE O PAINEL MORA NO DESENHO NOVO: em `main`, ao lado da tela e não dentro dela (`abrirFolha('fonte')`,
 * `prototipo.js:466-470`). A tela de trás recua e desfoca enquanto ele está aberto (`main.px-recuado
 * .px-tela`), e um painel dentro dela recuava e desfocava junto: a primeira coisa que a pessoa via no
 * Jogar era um painel borrado. O lugar fica ANTES da tela, como a sala sempre veio antes do lobby, e
 * não some: a saída do painel (`lib/polimento/folha.ts`) ainda precisa dele por um instante.
 */
function lugarDaSala(): HTMLElement {
  const main = document.querySelector('main') ?? document.body;
  let lugar = main.querySelector<HTMLElement>(':scope > .qj-sala-lugar');
  if (!lugar) {
    lugar = document.createElement('div');
    lugar.className = 'qj-sala-lugar';
    lugar.style.display = 'contents';
    main.prepend(lugar);
  }
  return lugar;
}

export interface IdiomaOferecido {
  lang: string;
  total: number;
  jogaveis: number;
}

export interface GravacaoOferecida {
  id: string;
  title: string;
  audioUrl?: string;
}

interface SalaProps {
  escolhaAtual: EscolhaDaPratica;
  idiomas: IdiomaOferecido[];
  gravacoes: GravacaoOferecida[];
  /**
   * A trilha DO IDIOMA CONSULTADO — função, e não valor pronto.
   *
   * Precisa ser função porque a sala pergunta pelo idioma SELECIONADO nela, que ainda não foi
   * aplicado. Com um valor calculado a partir do idioma vigente, escolher "inglês" na sala deixava
   * a Trilha bloqueada dizendo "ainda não existe trilha em português" — o idioma da frase era o
   * antigo, e a pessoa via a opção recusar exatamente o que ela acabou de pedir.
   */
  trilhaDe: (lang: string) => {
    niveis: CefrLevel[];
    total: number;
    porNivel?: Partial<Record<CefrLevel, number>>;
    escala?: EscalaDaTrilha | null;
  };
  /** Aquece a trilha do idioma enquanto a pessoa ainda decide — o clique em Jogar já a encontra. */
  prefetchTrilha?: (lang: string) => void;
  /** Tamanho do ranking de palavras difíceis (servidor). Menos de 4 = sem rodada possível. */
  dificeis: number;
  ageProfile: AgeProfileType;
  aoConfirmar: (e: EscolhaDaPratica) => void;
  aoFechar: () => void;
}

export default function SalaDeEscolha({
  escolhaAtual,
  idiomas,
  gravacoes,
  trilhaDe,
  prefetchTrilha,
  dificeis,
  ageProfile,
  aoConfirmar,
  aoFechar,
}: SalaProps) {
  const [lang, setLangEstado] = useState(() => idiomaInicialDaSala(escolhaAtual, idiomas));
  /** A pessoa já escolheu o idioma nesta sala? Então a regra de abertura não mexe mais nele. */
  const idiomaEscolhidoRef = useRef(false);
  const setLang = (l: string) => {
    idiomaEscolhidoRef.current = true;
    setLangEstado(l);
  };
  const [origem, setOrigem] = useState<OrigemDaPratica>(escolhaAtual.origem);
  const [escopo, setEscopo] = useState<EscopoDeGravacoes>(escolhaAtual.escopo);
  const [sessionId, setSessionId] = useState(escolhaAtual.sessionId);
  const [nivel, setNivel] = useState<CefrLevel | undefined>(escolhaAtual.nivel);
  const [trocandoIdioma, setTrocandoIdioma] = useState(false);
  /* META QUEST: "O que cada idioma tem" abre e fecha num botão (no computador é um `<details>`). */
  const [verCobertura, setVerCobertura] = useState(false);

  const botaoJogar = useRef<HTMLButtonElement | null>(null);
  const dialogo = useRef<HTMLDivElement | null>(null);

  // Sempre sobre o idioma SELECIONADO — ver o docblock de `trilhaDe`.
  const { niveis: niveisDaTrilha, total: totalDaTrilha, porNivel: tamanhoDoNivel, escala } = trilhaDe(lang);
  const porFrequencia = escala === 'frequencia';
  const temTrilha = niveisDaTrilha.length > 0;

  /**
   * O IDIOMA CHEGA DEPOIS — a sala abre antes de o servidor responder.
   *
   * `fonte.lang` nasce vazio e só é preenchido quando `fetchLangConfig` + `fetchSettings` voltam.
   * Como a sala é montada fora da cascata de carregamento (de propósito: esperar o baralho faria a
   * tela saltar logo na entrada), ela abriria com idioma vazio — e aí nenhum idioma casaria,
   * "Minhas gravações" mostraria 0 e o rodapé anunciaria "não tem palavras prontas" sobre um
   * baralho cheio. Foi o que aconteceu na primeira medição.
   *
   * A sincronia só acontece enquanto o valor local está VAZIO. Depois disso a sala é dona do seu
   * estado: uma prop que chegasse atrasada não pode desfazer o idioma que a pessoa acabou de
   * escolher.
   */
  useEffect(() => {
    if (!lang && escolhaAtual.lang) setLangEstado(idiomaInicialDaSala(escolhaAtual, idiomas));
  }, [escolhaAtual, lang, idiomas]);

  /* Os chips de idioma chegam DEPOIS da primeira pintura (o baralho carrega em paralelo): enquanto a
     pessoa não mexeu no idioma, a abertura é refeita com os dados que chegaram. */
  useEffect(() => {
    if (idiomaEscolhidoRef.current || !idiomas.length) return;
    const inicial = idiomaInicialDaSala({ lang: escolhaAtual.lang || lang, origem }, idiomas);
    if (inicial && inicial !== lang) setLangEstado(inicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idiomas]);

  /* Trocar de idioma pode tirar a trilha do mapa (só existe lista para inglês). Voltar para as
     gravações é melhor que deixar selecionada uma fonte que acabou de deixar de existir. */
  useEffect(() => {
    if (origem === 'trilha' && !temTrilha) setOrigem('gravacoes');
  }, [temTrilha, origem]);

  /* O download começa enquanto a sala ainda está aberta: quem confirma encontra a trilha pronta,
     em vez do esqueleto de carregamento na primeira pintura da grade. */
  useEffect(() => {
    if (temTrilha) prefetchTrilha?.(lang);
  }, [lang, temTrilha, prefetchTrilha]);

  /**
   * Foco inicial no botão que a maioria vai apertar. `preventScroll` não é detalhe: sem ele o
   * navegador rola o diálogo para dentro da vista e esconde as linhas de cima — o mesmo cuidado
   * está documentado em `ComoSeJoga`.
   */
  useEffect(() => {
    botaoJogar.current?.focus({ preventScroll: true });
  }, []);

  // Esc fecha. Sem isto, um diálogo que aparece a cada entrada vira armadilha para quem usa teclado.
  useEffect(() => empilharCamada(aoFechar), [aoFechar]);

  /**
   * Armadilha de foco. `ComoSeJoga` não tem, e passa — é uma ficha de leitura. Esta sala tem seis
   * grupos de controle e decide o que a próxima rodada vai ser: tabular para fora dela deixaria a
   * pessoa mexendo na tela de trás sem ver o que está tocando.
   */
  function aoTabular(e: React.KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const focaveis = dialogo.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focaveis?.length) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  const doIdioma = idiomas.find((i) => i.lang === lang);
  /* O número do rodapé é o que a escolha ATUAL oferece — não um total genérico. É a única forma de
     a pessoa perceber, antes de confirmar, que escolheu um recorte vazio. */
  const quantasPromete = origem === 'trilha' ? totalDaTrilha : (doIdioma?.jogaveis ?? 0);

  const gravacaoEscolhida = gravacoes.find((g) => g.id === sessionId);

  function confirmar() {
    aoConfirmar({ origem, escopo, lang, sessionId, nivel });
  }

  /* META QUEST (segunda rodada, 01/10/2026): a mesma sala, no centro, com uma decisão por seção e as
     opções em pílulas grandes. O motivo de cada opção travada é escrito abaixo do grupo, e o pé com o
     único botão principal fica à vista enquanto o miolo rola. Estado, foco e Esc são os de sempre. */
  const tituloDaEscala = t('{escala} da trilha', { escala: t(nomeDaEscala(escala)) });
  return createPortal(
    <div
      className="q-mais-fundo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sala-titulo"
        onKeyDown={aoTabular}
        className="q-mais qj qj-sala"
      >
        <div className="q-cab">
          <div>
            <p className="q-sobre">{t('Antes de jogar')}</p>
            <h2 id="sala-titulo">
              {ageProfile === 'kids' ? t('Com o que você quer jogar?') : t('O que você vai praticar')}
            </h2>
          </div>
          <button type="button" className="q-ctl" aria-label={t('Fechar sem mudar nada')} onClick={aoFechar}>
            <X aria-hidden />
          </button>
        </div>

        <div className="qj-sala-corpo">
          <section className="q-secao" data-secao="idioma">
            <header>
              <div>
                <h3>{t('Idioma')}</h3>
                <p>{t('A contagem é de palavras prontas para jogar, não do que está guardado.')}</p>
              </div>
            </header>
            {idiomas.length > 0 ? (
              <OpcoesDoQuest
                rotulo={t('Idioma que você vai praticar')}
                exclusiva
                valor={[lang]}
                aoTrocar={(l) => {
                  setLang(l);
                  setNivel(undefined);
                }}
                opcoes={idiomas.map((i) => ({
                  id: i.lang,
                  rotulo: langLabelNaUI(i.lang),
                  contagem: i.jogaveis,
                  /* O que o número quer dizer: no computador é a dica ao parar o ponteiro. */
                  dica: t('{prontas} prontas para jogo de par, de {total} no idioma', {
                    prontas: numero(i.jogaveis),
                    total: numero(i.total),
                  }),
                  motivoBloqueio:
                    i.jogaveis === 0
                      ? t(
                          'você tem {total} palavras neste idioma, mas nenhuma com tradução, sem ela os jogos de par não montam',
                          { total: i.total },
                        )
                      : undefined,
                }))}
              />
            ) : (
              <p className="qj-nota">{t('Ainda não há palavras no seu caderno.')}</p>
            )}
            <div className="q-acoes">
              <button
                type="button"
                className="q-chip"
                aria-expanded={trocandoIdioma}
                onClick={() => setTrocandoIdioma((v) => !v)}
              >
                <Globe aria-hidden />
                {trocandoIdioma ? t('Esconder a lista completa') : t('Escolher outro idioma')}
              </button>
              <button
                type="button"
                className="q-chip"
                aria-expanded={verCobertura}
                onClick={() => setVerCobertura((v) => !v)}
              >
                <Layers aria-hidden />
                {t('O que cada idioma tem')}
              </button>
            </div>
            {trocandoIdioma && (
              <div className="qj-idiomas-todos">
                <LangPicker
                  id="sala-idioma"
                  ariaLabel={t('Escolher outro idioma')}
                  block
                  value={lang}
                  onPick={({ code }) => {
                    if (code) {
                      setLang(code);
                      setNivel(undefined);
                      setTrocandoIdioma(false);
                    }
                  }}
                />
              </div>
            )}
            {verCobertura && (
              <>
                <TabelaDaCobertura baralho={idiomas} />
                <p className="qj-nota">
                  {t(
                    'Sem trilha, o idioma joga com o que você gravou ou importou. A voz depende do seu sistema: sem ela, os jogos de escuta ficam de fora até você gravar a sua.',
                  )}
                </p>
              </>
            )}
          </section>

          <section className="q-secao" data-secao="origem">
            <header>
              <div>
                <h3>{t('De onde vêm as palavras')}</h3>
              </div>
            </header>
            <OpcoesDoQuest
              rotulo={t('De onde vêm as palavras')}
              exclusiva
              valor={[origem]}
              aoTrocar={(o) => setOrigem(o as OrigemDaPratica)}
              opcoes={[
                {
                  id: 'gravacoes',
                  rotulo: ageProfile === 'kids' ? t('O que eu gravei') : t('Minhas gravações'),
                  icone: <Mic aria-hidden />,
                  contagem: doIdioma?.jogaveis ?? 0,
                },
                {
                  id: 'trilha',
                  rotulo: t('Trilha'),
                  icone: <GraduationCap aria-hidden />,
                  contagem: temTrilha ? totalDaTrilha : undefined,
                  motivoBloqueio: temTrilha
                    ? undefined
                    : t('ainda não existe trilha em {idioma}', { idioma: langLabelNaUI(lang) }),
                },
                {
                  id: 'dificeis',
                  rotulo: ageProfile === 'kids' ? t('As que eu mais erro') : t('Palavras difíceis'),
                  icone: <Flame aria-hidden />,
                  contagem: dificeis >= 4 ? dificeis : undefined,
                  motivoBloqueio:
                    dificeis >= 4
                      ? undefined
                      : t('revise mais um pouco — o ranking de difíceis ainda não tem material para uma rodada'),
                },
              ]}
            />
          </section>

          {origem === 'gravacoes' ? (
            <section className="q-secao" data-secao="gravacoes">
              <header>
                <div>
                  <h3>{t('Quais gravações')}</h3>
                </div>
              </header>
              <OpcoesDoQuest
                rotulo={t('Quais gravações entram')}
                exclusiva
                valor={[escopo]}
                aoTrocar={(e) => setEscopo(e as EscopoDeGravacoes)}
                opcoes={[
                  { id: 'todas', rotulo: t('Todas as gravações'), icone: <Layers aria-hidden /> },
                  {
                    id: 'uma',
                    rotulo: t('Uma gravação'),
                    icone: <FileAudio aria-hidden />,
                    motivoBloqueio: gravacoes.length ? undefined : t('você ainda não tem gravações salvas'),
                  },
                ]}
              />
              {escopo === 'uma' && gravacoes.length > 0 && (
                <div className="q-lista" role="group" aria-label={t('Gravações')}>
                  {gravacoes.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className="q-linha"
                      aria-pressed={sessionId === g.id}
                      onClick={() => setSessionId(g.id)}
                      /* O título inteiro ao parar o ponteiro (a linha corta com reticências). */
                      title={g.title}
                    >
                      <span className="q-ic" aria-hidden>
                        <FileAudio />
                      </span>
                      <span>
                        <b>{g.title}</b>
                      </span>
                      {/* Sem áudio, três jogos ficam de fora: dito ANTES da escolha. */}
                      {!g.audioUrl && <span className="q-fim">{t('sem áudio')}</span>}
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : origem === 'trilha' ? (
            <section className="q-secao" data-secao="trilha">
              <header>
                <div>
                  <h3>{tituloDaEscala}</h3>
                  <p>
                    {nivel
                      ? t('{escala} {etapa}: a trilha combinada tem {total} palavras no total.', {
                          escala: t(nomeDaEscala(escala)),
                          etapa: rotuloDaEtapa(nivel, escala),
                          total: numero(totalDaTrilha),
                        })
                      : t('Sem escolher, a trilha joga com {faixas} de uma vez.', {
                          faixas: porFrequencia ? t('todas as faixas') : t('todos os níveis'),
                        })}
                  </p>
                </div>
              </header>
              <OpcoesDoQuest
                rotulo={tituloDaEscala}
                exclusiva
                valor={nivel ? [nivel] : []}
                aoTrocar={(n) => setNivel(n as CefrLevel)}
                opcoes={niveisDaTrilha.map((n) => ({
                  id: n,
                  rotulo: rotuloDaEtapa(n, escala),
                  contagem: tamanhoDoNivel?.[n],
                }))}
              />
              {porFrequencia && (
                <p className="qj-nota">
                  {t('Faixas por frequência de uso, não níveis do CEFR — a 1 traz as palavras mais comuns.')}
                </p>
              )}
            </section>
          ) : null}
        </div>

        <div className="qj-sala-pe">
          <p className="qj-total">
            {quantasPromete > 0 ? (
              <>
                <b>{numero(quantasPromete)}</b> {tp(quantasPromete, 'palavra pronta', 'palavras prontas')}
                {origem === 'gravacoes' && escopo === 'uma' && gravacaoEscolhida && (
                  <span> · {gravacaoEscolhida.title}</span>
                )}
              </>
            ) : (
              <span className="qj-total-aviso">{t('Esta escolha não tem palavras prontas ainda.')}</span>
            )}
          </p>
          <button ref={botaoJogar} type="button" className="q-ctl pri" onClick={confirmar}>
            <IconeCheck aria-hidden />
            {ageProfile === 'kids' ? t('Usar estas!') : t('Usar estas palavras')}
          </button>
        </div>
      </div>
    </div>,
    lugarDaSala(),
  );
}
