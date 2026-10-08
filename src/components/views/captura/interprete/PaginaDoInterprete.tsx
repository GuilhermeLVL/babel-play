import {
  ArrowLeftRight,
  AudioLines,
  ChevronDown,
  Languages,
  Loader2,
  Lock,
  Mic,
  Monitor,
  Smartphone,
  Volume2,
} from 'lucide-react';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import { abrirContextoDoClique } from '../../../../lib/captura/contextoDoClique';
import type { LadoDoInterprete } from '../../../../lib/captura/tiposDaFala';
import { useQuestNovo } from '../../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../../lib/i18n';
import { langLabel } from '../../../../lib/languages';
import {
  aoMudarEstadoDaTela,
  distanciaDoPar,
  estadoDaTela,
  inverterEmArco,
  mudarEstadoDaTela,
  pedirConversa,
  tremer,
} from '../../../../lib/polimento/interprete';
import {
  aoMudarIdiomasDaVozDoQuest,
  atualizarIdiomasDaVozDoQuest,
  idiomasDaVozDoQuest,
  vozDoQuestFala,
} from '../../../../lib/voz/vozDoQuest';
import { LangFlag } from '../../../LangFlag';
import { CabecalhoDeTela, IconeEmBloco } from '../../../ui';
import ConversaDoPrototipo, { type MetadeDaConversa } from './ConversaDoPrototipo';
import { guardarModo, type ModoDaConversa, modoGuardado } from './modoDaConversa';
import type { AutomaticoNoPlano } from './ModoInterprete';

interface PropsDaPagina {
  idiomas: { meu: string; outro: string };
  /** Dois idiomas diferentes: sem isso não há conversa a traduzir. */
  possivel: boolean;
  /** O início está em curso (a folha do microfone, o modelo): o botão espera. */
  abrindo: boolean;
  /** O preparo dos dois lados (o tradutor do outro sentido baixando), uma linha. */
  aviso: string | null;
  /** O modo automático nesta conta: o padrão de quem o tem; com cadeado para quem não tem. */
  automatico?: AutomaticoNoPlano;
  /** A tela do Meta Quest (maquete de 01/10/2026): alvos de 60 px e um único botão principal. */
  noQuest?: boolean;
  /** O aparelho não tem voz de leitura: a tradução é só em texto, e a tela não promete voz. */
  semVoz?: boolean;
  /** A voz do site está ligada: no aparelho sem voz, ela lê a tradução nos idiomas que tem. */
  vozDoSite?: boolean;
  /** O cartão da nuvem do aparelho leve (`NuvemDoQuest`): no headset, é ela que faz a conversa andar. */
  avisos?: ReactNode;
  /** Abre os Planos (ausente no perfil protegido: nada de oferta). */
  aoConhecerOPremium?: (() => void) | undefined;
  aoComecar: () => void;
  /**
   * A CONVERSA VIRTUAL (Intérprete v3): traduz o áudio do computador (vídeo, Discord, jogo, chamada) e o
   * microfone, sem tocar em lado. Ausente = a opção não aparece (chave desligada, ou aparelho sem áudio do
   * computador). Pede o aviso de consentimento e, opcionalmente, o microfone ligado (de fone).
   */
  aoComecarVirtual?: (opcoes: { comMicrofone: boolean }) => void;
  aoEscolherIdiomas: () => void;
  aoInverter: () => void;
  /** DESENHO NOVO: o X da conversa volta para a tela de onde a pessoa veio (`direto.js:94`). */
  aoVoltar?: (() => void) | undefined;
  /** DESENHO NOVO: esta tela é só o preparo da conversa virtual (`direto.js:89-93`), já aberto. */
  preparoVirtual?: boolean;
}

/**
 * NO DESENHO NOVO o Intérprete abre DIRETO NA CONVERSA (`direto.js:8-14`), em todo aparelho: a tela de
 * começar deixa de ser um toque a mais e só continua existindo como preparo da conversa virtual.
 */
export default function PaginaDoInterprete(props: PropsDaPagina) {
  const novo = useQuestNovo();
  return novo ? <ConversaPronta {...props} /> : <PaginaDeEntrada {...props} />;
}

/** O tempo de a captura encerrar uma sessão vazia antes de a tela seguir para a origem ou os Planos. */
const ESPERA_DA_VOLTA = 400;

const outroLado = (lado: LadoDoInterprete): LadoDoInterprete => (lado === 'meu' ? 'outro' : 'meu');

/**
 * A CONVERSA PRONTA: a mesma tela da conversa em curso (`ConversaDoPrototipo`), parada. Nada é aberto
 * ao chegar: o primeiro toque em "Falar" começa a sessão (a folha do início, o teto, o microfone são os
 * de sempre) e a conversa em curso, que monta por cima, já começa ouvindo aquele lado.
 */
function ConversaPronta(props: PropsDaPagina) {
  const {
    idiomas,
    possivel,
    aviso,
    automatico = 'oculto',
    semVoz = false,
    vozDoSite = false,
    aoConhecerOPremium,
    aoComecar,
    aoComecarVirtual,
    aoEscolherIdiomas,
    aoVoltar,
  } = props;
  const tela = useSyncExternalStore(aoMudarEstadoDaTela, estadoDaTela, estadoDaTela);
  /* Sair da tela esquece os lados trocados e o preparo pedido: a próxima visita começa do desenho. */
  useEffect(() => () => mudarEstadoDaTela({ trocados: false, preparoVirtual: false, depois: null }), []);
  /* O X (ou "Conhecer o Premium") de uma conversa em que ninguém falou: a sessão encerra e a tela
     segue para onde foi pedido. A captura segura a navegação enquanto ainda fecha o microfone; o
     intervalo deixa isso terminar. */
  const saidas = useRef({ voltar: aoVoltar, planos: aoConhecerOPremium });
  saidas.current = { voltar: aoVoltar, planos: aoConhecerOPremium };
  useEffect(() => {
    const destino = tela.depois;
    if (tela.emCurso || !destino) return;
    const relogio = setTimeout(() => {
      mudarEstadoDaTela({ depois: null });
      saidas.current[destino]?.();
    }, ESPERA_DA_VOLTA);
    return () => clearTimeout(relogio);
  }, [tela.emCurso, tela.depois]);
  const comVozDoSite = semVoz && vozDoSite;
  useSyncExternalStore(
    aoMudarIdiomasDaVozDoQuest,
    () => idiomasDaVozDoQuest().join(),
    () => '',
  );
  useEffect(() => {
    if (comVozDoSite) void atualizarIdiomasDaVozDoQuest();
  }, [comVozDoSite]);
  const mudo = (idioma: string) => semVoz && !(comVozDoSite && vozDoQuestFala(idioma));

  const [lista, setLista] = useState(false);
  const [cadeado, setCadeado] = useState(false);
  const [modo, setModo] = useState<ModoDaConversa>(() =>
    automatico === 'disponivel' ? (modoGuardado() ?? 'automatico') : 'toque',
  );
  useEffect(() => {
    if (automatico !== 'disponivel') setModo('toque');
  }, [automatico]);
  const noAutomatico = modo === 'automatico';

  /* O preparo da conversa virtual: a tela de entrada de produção, com o painel já aberto. */
  if (tela.preparoVirtual && aoComecarVirtual)
    return <PaginaDeEntrada {...props} preparoVirtual aoComecar={() => mudarEstadoDaTela({ preparoVirtual: false })} />;

  const idiomaDe = (dono: LadoDoInterprete) => (dono === 'meu' ? idiomas.meu : idiomas.outro);
  const mudos = (['meu', 'outro'] as const).filter((l) => mudo(idiomaDe(l)));
  const rotuloDaVoz =
    mudos.length === 2
      ? t('Tradução em texto neste aparelho')
      : mudos.length === 1
        ? t('Voz em {comVoz} · {semVoz} em texto', {
            comVoz: langLabel(idiomaDe(outroLado(mudos[0]))),
            semVoz: langLabel(idiomaDe(mudos[0])),
          })
        : comVozDoSite
          ? t('Voz do site')
          : t('Voz do aparelho');

  const metade = (lado: LadoDoInterprete): MetadeDaConversa => {
    const dono = tela.trocados ? outroLado(lado) : lado;
    const lang = idiomaDe(dono);
    const nome = langLabel(lang);
    const semVozParaOOutro = mudo(idiomaDe(outroLado(dono)));
    return {
      lado,
      dono,
      lang,
      nome,
      frase: {
        tipo: 'dica',
        texto: semVozParaOOutro
          ? noAutomatico
            ? t('Toque em Ouvir e conversem. O app reconhece quem fala qual idioma e mostra a tradução.')
            : t('Toque em Falar e fale. A tradução aparece do outro lado, em texto.')
          : noAutomatico
            ? t('Toque em Ouvir e conversem. O app reconhece quem fala qual idioma e lê a tradução em voz alta.')
            : t('Toque em Falar e fale. A tradução aparece do outro lado e é lida em voz alta.'),
      },
      status: '',
      rotulo: noAutomatico ? t('Ouvir') : t('Falar'),
      rotuloParaLeitor: noAutomatico ? t('Ouvir a conversa') : t('Falar em {idioma}', { idioma: nome }),
      ouvindo: false,
      aoFalar: () => {
        /* Dentro do toque, antes de qualquer espera: no iPhone, o áudio criado depois fica mudo. */
        abrirContextoDoClique();
        pedirConversa(noAutomatico ? 'ouvir' : lado);
        aoComecar();
      },
      semVoz: mudo(lang),
    };
  };
  const avisoDoCadeado = cadeado && automatico === 'premium';

  return (
    <div style={{ display: tela.emCurso ? 'none' : 'contents' }} data-testid="pagina-do-interprete">
      <ConversaDoPrototipo
        cima={metade('outro')}
        baixo={metade('meu')}
        {...(automatico !== 'oculto'
          ? {
              automatico: {
                ligado: noAutomatico,
                comCadeado: automatico === 'premium',
                aoTocar: (botao: HTMLElement) => {
                  if (automatico !== 'disponivel') {
                    setCadeado(true);
                    tremer(botao);
                    return;
                  }
                  const novoModo: ModoDaConversa = noAutomatico ? 'toque' : 'automatico';
                  setModo(novoModo);
                  guardarModo(novoModo);
                },
              },
            }
          : {})}
        lista={{ aberta: lista, bolhas: [], aoAlternar: () => setLista((v) => !v), aoExportar: () => undefined }}
        voz={{ rotulo: rotuloDaVoz, natural: false, muda: mudos.length === 2 }}
        aviso={
          !possivel
            ? t('Escolha dois idiomas diferentes: um para você, outro para a outra pessoa.')
            : (aviso ??
              (avisoDoCadeado
                ? t('O modo automático faz parte do Premium: o app reconhece sozinho quem fala qual idioma.')
                : noAutomatico
                  ? t('Automático ligado: é só conversar. O app reconhece quem fala qual idioma.')
                  : ''))
        }
        aoConhecerOPremium={avisoDoCadeado && possivel && !aviso ? aoConhecerOPremium : undefined}
        aoTrocarLados={() => mudarEstadoDaTela({ trocados: !tela.trocados })}
        aoVirtual={aoComecarVirtual ? () => mudarEstadoDaTela({ preparoVirtual: true }) : undefined}
        aoEscolherIdioma={aoEscolherIdiomas}
        aoSair={() => aoVoltar?.()}
        comEntrada
        testid="conversa-pronta"
      />
    </div>
  );
}

/**
 * A TELA DO INTÉRPRETE NO MENU (pedido do dono, 30/09: no cabeçalho da captura, o botão passava
 * despercebido). É a porta de entrada da conversa frente a frente: os dois idiomas, o botão grande de
 * começar e o preparo dos dois lados. Tocar em "Começar conversa" abre a tela dividida
 * (`ModoInterprete`), e sair dela volta para cá.
 *
 * No visual da Captura, sem inventar peça nova: o cabeçalho de tela, o cartão escuro do estúdio com o
 * par de idiomas (`.par-idiomas` / `.campo-idioma`, os do diálogo de idiomas) e os três passos do
 * estado vazio (`.vazio` > `.passo`). Chega por `import()`: fora do JS inicial.
 */
function PaginaDeEntrada({
  idiomas,
  possivel,
  abrindo,
  aviso,
  automatico = 'oculto',
  noQuest = false,
  semVoz = false,
  vozDoSite = false,
  avisos,
  aoConhecerOPremium,
  aoComecar,
  aoComecarVirtual,
  aoEscolherIdiomas,
  aoInverter,
  preparoVirtual = false,
}: PropsDaPagina) {
  const comVozDoSite = semVoz && vozDoSite;
  const [virtualAberta, setVirtualAberta] = useState(preparoVirtual);
  /* INVERTER EM ARCO (`prototipo.js:1096-1130`, só no desenho novo): a distância é medida antes de os
     textos trocarem; com eles já trocados, cada um atravessa até o lugar novo. */
  const raiz = useRef<HTMLDivElement>(null);
  const arco = useRef<{ botao: HTMLElement; dx: number } | null>(null);
  useLayoutEffect(() => {
    const a = arco.current;
    arco.current = null;
    if (a && raiz.current) inverterEmArco(a.botao, raiz.current, a.dx);
  }, [idiomas.meu, idiomas.outro]);
  const [aceitou, setAceitou] = useState(false);
  const [deFone, setDeFone] = useState(false);
  useSyncExternalStore(
    aoMudarIdiomasDaVozDoQuest,
    () => idiomasDaVozDoQuest().join(),
    () => '',
  );
  useEffect(() => {
    if (comVozDoSite) void atualizarIdiomasDaVozDoQuest();
  }, [comVozDoSite]);
  /** Os idiomas da conversa que NÃO são lidos em voz alta neste aparelho. */
  const emTexto = semVoz ? [idiomas.meu, idiomas.outro].filter((i) => !(comVozDoSite && vozDoQuestFala(i))) : [];
  const campo = (rotulo: string, codigo: string) => (
    <button type="button" className="campo-idioma" onClick={aoEscolherIdiomas}>
      <span className="label-mono">{rotulo}</span>
      <span className="v">
        <LangFlag code={codigo} className="inline-block w-4 h-3 align-[-1px]" /> {langLabel(codigo)}
      </span>
      <ChevronDown aria-hidden />
    </button>
  );
  const passos = [
    { icone: Languages, texto: t('Escolha o seu idioma e o da outra pessoa') },
    { icone: Smartphone, texto: t('Toque em Começar e deixe o aparelho entre vocês') },
    automatico === 'disponivel'
      ? {
          icone: AudioLines,
          texto: t('Toque em Ouvir e conversem: o app reconhece quem fala e lê a tradução em voz alta'),
        }
      : { icone: Volume2, texto: t('Cada um toca a sua metade e fala: a tradução é lida em voz alta para o outro') },
  ];

  /* NO QUEST: os dois idiomas como alvos grandes, os passos à esquerda e UM botão principal de 120 px.
     O que é do plano pago vem dito antes do toque, ao lado do modo por toque, que funciona no grátis. */
  if (noQuest) {
    const lado = (rotulo: string, codigo: string) => (
      <button type="button" className="q-tile em-linha" onClick={aoEscolherIdiomas}>
        <span className="q-ic">
          <LangFlag code={codigo} className="inline-block w-6 h-4" />
        </span>
        <span>
          <span className="q-rotulo">{rotulo}</span>
          <b style={{ display: 'block', marginTop: 6 }}>{langLabel(codigo)}</b>
        </span>
      </button>
    );
    return (
      <div className="q-palco" data-testid="pagina-do-interprete">
        <div className="q-cab">
          <div>
            <p className="q-sobre">{t('Conversa frente a frente')}</p>
            <h1>{t('Intérprete')}</h1>
          </div>
          {emTexto.length === 2 && <span className="q-chip">{t('Tradução em texto neste aparelho')}</span>}
          {emTexto.length === 1 && (
            <span className="q-chip">
              {t('Voz só em {idioma}', { idioma: langLabel(emTexto[0] === idiomas.meu ? idiomas.outro : idiomas.meu) })}
            </span>
          )}
        </div>
        <div className="q-par">
          {lado(t('Você fala'), idiomas.meu)}
          <button type="button" className="q-ctl" aria-label={t('Inverter os idiomas')} onClick={aoInverter}>
            <ArrowLeftRight aria-hidden />
          </button>
          {lado(t('A outra pessoa fala'), idiomas.outro)}
        </div>
        {avisos}
        <div className="q-meio">
          <ol className="q-passos" aria-label={t('Como funciona')}>
            <li>
              <span aria-hidden>1</span>
              {t('Escolha o seu idioma e o da outra pessoa.')}
            </li>
            <li>
              <span aria-hidden>2</span>
              {t('Toque em Começar: a tela se divide em dois lados.')}
            </li>
            <li>
              <span aria-hidden>3</span>
              {emTexto.length === 2
                ? t('Cada pessoa toca o seu lado e fala. A tradução aparece em texto do outro lado.')
                : emTexto.length === 1
                  ? t(
                      'Cada pessoa toca o seu lado e fala. A tradução é lida em voz alta em {comVoz}; em {semVoz}, aparece em texto.',
                      {
                        comVoz: langLabel(emTexto[0] === idiomas.meu ? idiomas.outro : idiomas.meu),
                        semVoz: langLabel(emTexto[0]),
                      },
                    )
                  : t('Cada pessoa toca o seu lado e fala. A tradução é lida em voz alta para a outra.')}
            </li>
            <li className="q-nota" role="status">
              <span aria-hidden>
                <Languages />
              </span>
              <span>
                {!possivel
                  ? t('Escolha dois idiomas diferentes: um para você, outro para a outra pessoa.')
                  : (aviso ?? t('A tradução dos dois lados fica pronta no aparelho antes da primeira frase.'))}
              </span>
            </li>
          </ol>
          <div className="q-grande">
            <button
              type="button"
              className="q-botao"
              onClick={aoComecar}
              disabled={!possivel || abrindo}
              aria-label={t('Começar conversa')}
              data-testid="comecar-conversa"
            >
              {abrindo ? <Loader2 aria-hidden className="animate-spin" /> : <Mic aria-hidden />}
            </button>
            <b aria-hidden>{abrindo ? t('Abrindo o microfone…') : t('Começar conversa')}</b>
          </div>
        </div>
        {automatico === 'premium' && (
          <div className="q-aviso" data-testid="modo-da-pagina">
            <span>
              {t(
                'No Premium, o modo automático reconhece sozinho quem fala qual idioma. Aqui, cada um toca o seu lado.',
              )}
            </span>
            {aoConhecerOPremium && (
              <button type="button" className="q-ctl" onClick={aoConhecerOPremium}>
                {t('Conhecer o Premium')}
              </button>
            )}
          </div>
        )}
        {automatico === 'disponivel' && (
          <div className="q-aviso" data-testid="modo-da-pagina">
            <span>
              {t(
                'Modo automático: o app reconhece sozinho quem fala qual idioma. Dá para trocar para o toque na conversa.',
              )}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="tela larga entra" data-testid="pagina-do-interprete" ref={raiz}>
      <CabecalhoDeTela
        icone={Languages}
        sobrancelha={t('Conversa frente a frente')}
        titulo={t('Intérprete')}
        sub={t('Cada pessoa fala no seu idioma e ouve a tradução no dela, em voz alta.')}
      />
      <section className="cartao escuro estudio" aria-label={t('Começar a conversa')}>
        <div className="estudio-topo">
          <h2>
            <span className="ponto" />
            {t('Conversa')}
          </h2>
        </div>
        <div className="par-idiomas">
          {campo(t('Você fala'), idiomas.meu)}
          <button
            type="button"
            className="btn btn-outline icone"
            aria-label={t('Inverter os idiomas')}
            onClick={(e) => {
              if (preparoVirtual && raiz.current)
                arco.current = { botao: e.currentTarget, dx: distanciaDoPar(raiz.current) };
              aoInverter();
            }}
          >
            <ArrowLeftRight aria-hidden />
          </button>
          {campo(t('A outra pessoa fala'), idiomas.outro)}
        </div>
        <div className="estudio-acoes">
          <button
            type="button"
            className="btn btn-solid grande"
            onClick={aoComecar}
            disabled={!possivel || abrindo}
            data-testid="comecar-conversa"
          >
            {abrindo ? <Loader2 aria-hidden className="animate-spin" /> : <Mic aria-hidden />}
            {abrindo ? t('Abrindo o microfone…') : t('Começar conversa')}
          </button>
        </div>
        {aoComecarVirtual && (
          <div className="estudio-acoes" data-testid="conversa-virtual-entrada">
            <button
              type="button"
              className="btn btn-outline"
              aria-expanded={virtualAberta}
              onClick={() => setVirtualAberta((v) => !v)}
              disabled={!possivel || abrindo}
              data-testid="abrir-conversa-virtual"
            >
              <Monitor aria-hidden /> {t('Conversa virtual')}
            </button>
            {virtualAberta && (
              <div className="virtual-painel" data-testid="painel-conversa-virtual">
                <p className="mut" style={{ fontSize: 13 }}>
                  {t(
                    'Traduz o áudio do computador (vídeo, Discord, jogo, chamada) para você ler, e a sua voz para a outra pessoa. Você escolhe a aba ou a tela com áudio.',
                  )}
                </p>
                <label>
                  <input type="checkbox" checked={aceitou} onChange={(e) => setAceitou(e.target.checked)} />
                  <span>
                    {t(
                      'Tenho 18 anos ou mais e vou avisar quem estiver na conversa de que ela está sendo traduzida. Nada é gravado.',
                    )}
                  </span>
                </label>
                <label>
                  <input type="checkbox" checked={deFone} onChange={(e) => setDeFone(e.target.checked)} />
                  <span>
                    {t(
                      'Estou de fone: o microfone também traduz o que eu falo. Sem fone, ele fica desligado para não ouvir o computador.',
                    )}
                  </span>
                </label>
                <button
                  type="button"
                  className="btn btn-solid"
                  disabled={!aceitou}
                  onClick={() => aoComecarVirtual({ comMicrofone: deFone })}
                  data-testid="comecar-conversa-virtual"
                >
                  {t('Começar conversa virtual')}
                </button>
              </div>
            )}
          </div>
        )}
        <p className="mut orientacao-da-captura" style={{ fontSize: 12.5, marginTop: 6 }} role="status">
          {!possivel
            ? t('Escolha dois idiomas diferentes: um para você, outro para a outra pessoa.')
            : (aviso ?? t('A tradução dos dois lados fica pronta no aparelho antes da primeira frase.'))}
        </p>
        {automatico === 'disponivel' && (
          <p className="mut orientacao-da-captura" style={{ fontSize: 12.5 }} data-testid="modo-da-pagina">
            <AudioLines aria-hidden className="inline-block w-3.5 h-3.5 align-[-2px]" />{' '}
            {t(
              'Modo automático: o app reconhece sozinho quem fala qual idioma. Dá para trocar para o toque na conversa.',
            )}
          </p>
        )}
        {automatico === 'premium' && (
          <p className="mut orientacao-da-captura" style={{ fontSize: 12.5 }} data-testid="modo-da-pagina">
            <Lock aria-hidden className="inline-block w-3.5 h-3.5 align-[-2px]" />{' '}
            {t(
              'No Premium, o modo automático reconhece sozinho quem fala qual idioma. Aqui, cada um toca a sua metade.',
            )}{' '}
            {aoConhecerOPremium && (
              <button type="button" className="link" onClick={aoConhecerOPremium}>
                {t('Conhecer o Premium')}
              </button>
            )}
          </p>
        )}
      </section>
      <section className="cartao" aria-label={t('Como funciona')}>
        <div className="vazio">
          <IconeEmBloco icone={Languages} />
          <h3 style={{ color: 'inherit' }}>{t('Uma conversa, dois idiomas')}</h3>
          <p className="mut">{t('Três passos e pronto:')}</p>
          <div className="pilha" style={{ textAlign: 'left', marginTop: 6 }}>
            {passos.map((p, i) => (
              <div className="passo" key={i}>
                <IconeEmBloco icone={p.icone} />
                <span>
                  {i + 1} · {p.texto}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
