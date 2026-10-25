import '../../../../styles/modoInterprete.css';

import {
  ArrowLeftRight,
  ArrowUpDown,
  ChevronDown,
  Download,
  Languages,
  ListChecks,
  Lock,
  type LucideIcon,
  MessageCircleReply,
  Mic,
  Monitor,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Fragment, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { MarcaNaLinha } from '../../../../core/assistente/telaDoAssistente';
import type { CorrecaoDaFala } from '../../../../data/apiDoAssistente';
import type { LadoDoInterprete } from '../../../../lib/captura/tiposDaFala';
import { noComputador } from '../../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../../lib/i18n';
import { direcaoDoTexto } from '../../../../lib/languages';
import { comNomeDoPlano, planoDoInterprete } from '../../../../lib/planoDeEntrada';
import {
  entradaDaConversa,
  entradaDasBolhas,
  palavraNova,
  topoDasMetades,
  traducaoChegou,
  trocaDeLados,
} from '../../../../lib/polimento/interprete';
import { sentir } from '../../../../lib/polimento/sentidos';
import type { LadoDaVoz } from '../../../../lib/voz/catalogoDeVozes';
import FolhaDasVozes from '../../../voz/FolhaDasVozes';
import { CartaoDaMarca, CorrecaoNaPagina } from '../assistente/AssistenteNaPagina';
import { TextoComMarcas } from '../assistente/TextoComMarcas';

/** O que a metade mostra no meio: a dica de começo, a fala de quem está nela, ou a tradução do outro. */
export type FraseDaMetade =
  | { tipo: 'dica'; texto: string }
  | { tipo: 'fala'; texto: string; lang: string; aoVivo: boolean; id?: string }
  | { tipo: 'traducao'; id: string; traducao: string; original: string; lang: string; langDoOriginal: string };

export interface MetadeDaConversa {
  /** O lado do MOTOR: `outro` é a metade de cima, `meu` a de baixo (quem segura o aparelho). */
  lado: LadoDoInterprete;
  /** De quem é a metade: ao trocar os lados, é ela que muda de lugar (`telas2.js:573-576`). */
  dono: LadoDoInterprete;
  lang: string;
  nome: string;
  frase: FraseDaMetade;
  status: string;
  /** O botão grande: o rótulo ("Falar", "Parar", "Ouvir") e se o microfone está aberto por ele. */
  rotulo: string;
  rotuloParaLeitor: string;
  ouvindo: boolean;
  aoFalar: () => void;
  /** Sem voz de leitura para o idioma desta metade: "Repetir" e "Parar voz" não têm o que fazer. */
  semVoz: boolean;
  /** O ícone do botão grande. Ausente = o microfone; na conversa virtual, o lado do computador usa o monitor. */
  icone?: LucideIcon;
  /** O botão grande só mostra o estado (o som do computador já está sendo ouvido): não há o que tocar. */
  travado?: boolean;
  /** A metade mostra uma tradução: "Repetir" tem o que repetir. Ausente = sempre à mostra (quem não sabe dizer). */
  podeRepetir?: boolean;
  /** A voz lê a tradução desta metade agora: "Parar voz" tem o que parar. Ausente = sempre à mostra. */
  lendo?: boolean;
  /** A tecla que fala por esta metade no computador ("1", "2"); aparece embaixo do botão. */
  atalho?: string;
}

/**
 * A ESCUTA DO AUTOMÁTICO, num botão só: no automático ninguém toca em lado, e dois botões iguais (um por
 * metade) eram dois controles para uma ação. No celular ele fica na faixa do meio, ao alcance das duas
 * pessoas; no computador, centrado embaixo das colunas, com a tecla.
 */
export interface EscutaDaConversa {
  ouvindo: boolean;
  rotulo: string;
  rotuloParaLeitor: string;
  aoTocar: () => void;
  atalho?: string;
}

/** Um botão de modo a mais na faixa, ao lado de "Conversa" (a conversa virtual: detectar idioma, ler em voz alta). */
export interface ModoDaFaixa {
  id: string;
  icone: LucideIcon;
  rotulo: string;
  rotuloParaLeitor: string;
  ligado: boolean;
  aoTocar: () => void;
}

export interface BolhaDaConversa {
  id: string;
  dono: LadoDoInterprete;
  fala: string;
  traducao: string;
  /** O idioma do que foi dito (as marcas do assistente cortam as palavras nele). */
  lang?: string;
}

/**
 * O ASSISTENTE AO VIVO NA CONVERSA (Fase C3): a mesma instância da captura e da janela flutuante. As marcas silenciosas
 * no que a outra pessoa disse, "Como respondo?" junto da última fala dela (e Alt+R), e a correção gentil embaixo das
 * falas da PRÓPRIA pessoa — o lado dela é o "você" (opt-in).
 */
export interface AssistenteNaConversa {
  marcas: ReadonlyMap<string, MarcaNaLinha[]>;
  correcoes: ReadonlyMap<string, CorrecaoDaFala>;
  /** A fala a que "Como respondo?" responde (a última da outra pessoa); ausente = sem o botão. */
  responderA?: string;
  aoComoRespondo?: (falaId: string) => void;
  /** Mostra o atalho (Alt+R) no botão: no computador. */
  comAtalho?: boolean;
}

const quem = (dono: LadoDoInterprete) => (dono === 'meu' ? t('Você') : t('A outra pessoa'));

/** Uma palavra da fala em andamento: entra sozinha quando aparece (`telas2.js:202-206`). */
function Palavra({ texto, animar }: { texto: string; animar: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (animar && ref.current) palavraNova(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na chegada da palavra
  }, []);
  return (
    <span className="int-w" ref={ref}>
      {texto + ' '}
    </span>
  );
}

/**
 * A CONVERSA DO INTÉRPRETE COMO NO PROTÓTIPO (`telas2.js:161-182`, `direto.js:68-74`): duas metades, a de
 * cima virada para a outra pessoa, e a faixa no meio, acompanhando o tema claro.
 *
 * NO COMPUTADOR (decisão do dono, `planos-v3-e-rota-inteligente/design.md` §11, item 14): duas colunas,
 * a faixa em cima, e NENHUMA metade virada. A metade virada é para o aparelho deitado entre duas
 * pessoas; num monitor as duas leem do mesmo lado. O desenho das colunas é o de
 * `.int[data-layout='computador']` (`modoInterprete.css`). No celular e no headset fica o frente a frente.
 *
 * Só desenha: quem decide o que cada metade diz é a tela pronta (`PaginaDoInterprete`), a conversa em
 * curso (`ModoInterprete`) ou a conversa virtual (`ConversaVirtual`), com o motor de sempre.
 */
export default function ConversaDoPrototipo({
  cima,
  baixo,
  escuta,
  automatico,
  modos,
  lista,
  voz,
  vozes,
  aviso,
  aoConhecerOPremium,
  aoTrocarLados,
  aoVirtual,
  aoEscolherIdioma,
  aoRepetir,
  aoPararVoz,
  aoSair,
  comEntrada = false,
  emDialogo = false,
  comTrilho = !emDialogo,
  fase,
  testid = 'modo-interprete',
  rotulo,
  rotuloDeSair,
  assistente,
  children,
}: {
  cima: MetadeDaConversa;
  baixo: MetadeDaConversa;
  /** O automático: um botão de escuta no lugar do "Falar" de cada metade. */
  escuta?: EscutaDaConversa | undefined;
  /** O botão "Automático": ausente onde não há plano que o tenha; com cadeado para quem não o tem. */
  automatico?: { ligado: boolean; comCadeado: boolean; aoTocar: (botao: HTMLElement) => void };
  /** Os modos que só uma das conversas tem (a virtual), no mesmo botão da faixa. */
  modos?: readonly ModoDaFaixa[];
  lista: {
    aberta: boolean;
    bolhas: BolhaDaConversa[];
    aoAlternar: () => void;
    aoExportar: () => void;
    /** O que vai ao lado de "Exportar", no alto da lista (os idiomas ouvidos, na conversa virtual). */
    topo?: ReactNode;
    /** A lista pronta, no lugar das bolhas simples: a que deixa ouvir, corrigir e guardar cada fala. */
    conteudo?: ReactNode;
  };
  voz: { rotulo: string; natural: boolean; muda: boolean };
  /**
   * A ESCOLHA DA VOZ: com os lados, a pílula da voz vira o botão que abre a folha das vozes (uma por
   * idioma da conversa). Ausente onde não há voz a escolher (o aparelho sem voz própria).
   */
  vozes?: { lados: readonly LadoDaVoz[] } | undefined;
  aviso: string;
  /** Com o aviso do cadeado na tela: o botão que leva aos Planos. */
  aoConhecerOPremium?: (() => void) | undefined;
  aoTrocarLados: () => void;
  aoVirtual?: (() => void) | undefined;
  aoEscolherIdioma?: (() => void) | undefined;
  aoRepetir?: (() => void) | undefined;
  aoPararVoz?: (() => void) | undefined;
  aoSair: () => void;
  /** A tela acabou de abrir pelo menu: metades, faixa e botões entram (`telas2.js:275-278`). */
  comEntrada?: boolean;
  /** A conversa em curso cobre a captura: é um diálogo para quem usa leitor de tela. */
  emDialogo?: boolean;
  /** Convive com o trilho (ao lado dele no computador, acima da barra no celular): a tela pronta e a
   *  conversa em curso. Só a conversa virtual cobre tudo. Ver `modoInterprete.css`. */
  comTrilho?: boolean;
  fase?: string | undefined;
  testid?: string;
  /** O nome da tela e o do X para o leitor de tela. Ausentes = os do modo intérprete. */
  rotulo?: string;
  rotuloDeSair?: string;
  /** O assistente ao vivo (Fase C3). Ausente = nada dele. */
  assistente?: AssistenteNaConversa | undefined;
  children?: ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  /** A marca aberta no cartão (toque ou Enter numa marca). */
  const [marcaAberta, setMarcaAberta] = useState<{ marca: MarcaNaLinha; lang?: string } | null>(null);
  /** O texto com as marcas do assistente; sem ele, o texto puro de sempre. */
  const comMarcas = (texto: string, lang: string | undefined, id: string | undefined) =>
    assistente ? (
      <TextoComMarcas
        texto={texto}
        lang={lang}
        marcas={id ? assistente.marcas.get(id) : undefined}
        interativa
        aoAbrir={(marca) => setMarcaAberta({ marca, lang })}
      />
    ) : (
      texto
    );
  /** "Como respondo?" para esta fala, quando é a última da outra pessoa. */
  const botaoResponder = (id: string | undefined, onde: 'metade' | 'bolha') =>
    assistente?.aoComoRespondo && id && assistente.responderA === id ? (
      <button
        type="button"
        className="int-modo asst-responder"
        data-onde={onde}
        data-para={id}
        aria-keyshortcuts="Alt+R"
        title={`${t('Sugestões para você responder com as suas palavras')} (Alt+R)`}
        onClick={() => assistente.aoComoRespondo?.(id)}
        data-testid="como-respondo-interprete"
      >
        <MessageCircleReply aria-hidden />
        <span>{t('Como respondo?')}</span>
        {assistente.comAtalho && <kbd aria-hidden>Alt+R</kbd>}
      </button>
    ) : null;
  /** No monitor: duas colunas e ninguém de cabeça para baixo. */
  const emColunas = noComputador();
  const [escolhendoVoz, setEscolhendoVoz] = useState(false);

  useEffect(() => {
    if (comEntrada && raiz.current) entradaDaConversa(raiz.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, []);

  /* TROCAR OS LADOS: mede antes do toque e, com as metades já no lugar novo, cada uma parte de onde estava. */
  const antes = useRef<Map<string, number> | null>(null);
  const trocar = () => {
    if (raiz.current) antes.current = topoDasMetades(raiz.current);
    aoTrocarLados();
  };
  useLayoutEffect(() => {
    const de = antes.current;
    antes.current = null;
    if (de && raiz.current) trocaDeLados(raiz.current, de);
  }, [cima.dono]);

  /* A TRADUÇÃO CHEGOU do lado de quem escuta: uma vez por fala, e não para a que já estava na tela. */
  const idDaTraducao = (m: MetadeDaConversa) => (m.frase.tipo === 'traducao' ? m.frase.id : '');
  const vistas = useRef<Record<string, string>>({ [cima.dono]: idDaTraducao(cima), [baixo.dono]: idDaTraducao(baixo) });
  const tirarMarca = useRef<Record<string, () => void>>({});
  const idDeCima = idDaTraducao(cima);
  const idDeBaixo = idDaTraducao(baixo);
  useEffect(() => {
    for (const m of [cima, baixo]) {
      const id = idDaTraducao(m);
      if (!id || vistas.current[m.dono] === id) continue;
      vistas.current[m.dono] = id;
      const el = raiz.current?.querySelector<HTMLElement>(`.int-metade[data-lado="${m.dono}"]`);
      if (!el || !raiz.current) continue;
      tirarMarca.current[m.dono]?.();
      tirarMarca.current[m.dono] = traducaoChegou(raiz.current, el);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando a fala em destaque muda
  }, [idDeCima, idDeBaixo]);
  useEffect(
    () => () => {
      for (const tirar of Object.values(tirarMarca.current)) tirar();
    },
    [],
  );

  /* A LISTA abriu: as bolhas entram pelo lado de quem falou (`telas2.js:256`). */
  useEffect(() => {
    if (lista.aberta && raiz.current) entradaDasBolhas(raiz.current);
  }, [lista.aberta]);

  const frase = (m: MetadeDaConversa) => {
    const f = m.frase;
    if (f.tipo === 'dica') return <p className="int-dica">{f.texto}</p>;
    if (f.tipo === 'fala')
      return (
        <p className="int-ao-vivo" lang={f.lang} dir={direcaoDoTexto(f.lang)}>
          {f.texto
            .split(' ')
            .filter(Boolean)
            .map((p, i) => (
              <Palavra key={i} texto={p} animar={f.aoVivo} />
            ))}
        </p>
      );
    return (
      <>
        <p className="int-traducao" lang={f.lang} dir={direcaoDoTexto(f.lang)}>
          {f.traducao}
        </p>
        {f.original && (
          <p className="int-original" lang={f.langDoOriginal} dir={direcaoDoTexto(f.langDoOriginal)}>
            {comMarcas(f.original, f.langDoOriginal, f.id)}
          </p>
        )}
      </>
    );
  };

  const metade = (m: MetadeDaConversa, virada: boolean) => (
    <section
      key={m.dono}
      className="int-metade"
      data-lado={m.dono}
      data-virada={virada && !emColunas ? '' : undefined}
      hidden={lista.aberta}
      aria-label={t('Lado de quem fala {idioma}', { idioma: m.nome })}
      data-testid={`interprete-${m.lado}`}
    >
      <p className="int-idioma">
        <span className="int-quem">{quem(m.dono)}</span>
        {aoEscolherIdioma ? (
          /* O NOME DO IDIOMA É O BOTÃO: o alvo é a palavra que a pessoa procura, e não um chevron ao lado. */
          <button
            type="button"
            className="int-idioma-btn"
            aria-label={t('{idioma}. Trocar este idioma', { idioma: m.nome })}
            onClick={aoEscolherIdioma}
          >
            <span>{m.nome}</span>
            <ChevronDown aria-hidden />
          </button>
        ) : (
          <span className="int-idioma-nome">{m.nome}</span>
        )}
      </p>
      <div className="int-frase" aria-live="polite">
        {frase(m)}
      </div>
      {/* O ASSISTENTE fica FORA da região anunciada: o botão e a correção não interrompem a conversa. Só na metade da
          pessoa: o "Como respondo?" junto da tradução do que a outra disse, a correção embaixo do que ela mesma disse. */}
      {assistente && m.dono === 'meu' && (
        <div className="int-assistente">
          {m.frase.tipo === 'traducao' && botaoResponder(m.frase.id, 'metade')}
          {m.frase.tipo === 'fala' && !m.frase.aoVivo && m.frase.id && (
            <CorrecaoNaPagina correcao={assistente.correcoes.get(m.frase.id)} lang={m.frase.lang} />
          )}
        </div>
      )}
      <p className="int-status" role="status">
        {m.status}
      </p>
      <div className="int-acoes">
        {/* "Repetir" e "Parar voz" só quando servem; escondidos (e não fora do fluxo) para o botão do
            meio não pular de lugar quando aparecem. */}
        {!m.semVoz && (
          <button
            type="button"
            className="int-ib"
            aria-label={t('Repetir a tradução')}
            onClick={aoRepetir}
            data-oculto={m.podeRepetir !== false ? undefined : ''}
            tabIndex={m.podeRepetir !== false ? undefined : -1}
            aria-hidden={m.podeRepetir !== false ? undefined : true}
          >
            <RotateCcw aria-hidden />
            <span>{t('Repetir')}</span>
          </button>
        )}
        {!escuta && (
          <button
            type="button"
            className="int-falar"
            data-ouvindo={m.ouvindo ? '' : undefined}
            /* Parado, o botão é laranja: o cursor do app passa à cor de tinta sobre ele (`cursor.ts`). */
            data-cursor={m.ouvindo ? undefined : 'tinta'}
            aria-pressed={m.ouvindo}
            aria-label={m.rotuloParaLeitor}
            disabled={m.travado}
            onClick={() => {
              if (!m.ouvindo) sentir('grava'); /* `telas2.js:213` */
              m.aoFalar();
            }}
            data-sfx="none"
            data-testid={`falar-${m.lado}`}
          >
            {m.icone ? <m.icone aria-hidden /> : <Mic aria-hidden />}
            <span aria-hidden>{m.rotulo}</span>
            {emColunas && m.atalho && <kbd aria-hidden>{m.atalho}</kbd>}
          </button>
        )}
        {!m.semVoz && (
          <button
            type="button"
            className="int-ib"
            aria-label={t('Parar a voz')}
            onClick={aoPararVoz}
            data-oculto={m.lendo !== false ? undefined : ''}
            tabIndex={m.lendo !== false ? undefined : -1}
            aria-hidden={m.lendo !== false ? undefined : true}
          >
            <Volume2 aria-hidden />
            <span>{t('Parar voz')}</span>
          </button>
        )}
      </div>
    </section>
  );

  const botaoDeEscuta = escuta && (
    <button
      type="button"
      className="int-falar int-escuta"
      data-ouvindo={escuta.ouvindo ? '' : undefined}
      data-cursor={escuta.ouvindo ? undefined : 'tinta'}
      aria-pressed={escuta.ouvindo}
      aria-label={escuta.rotuloParaLeitor}
      onClick={() => {
        if (!escuta.ouvindo) sentir('grava');
        escuta.aoTocar();
      }}
      data-sfx="none"
      data-testid="escuta-automatica"
    >
      <Mic aria-hidden />
      <span aria-hidden>{escuta.rotulo}</span>
      {emColunas && escuta.atalho && <kbd aria-hidden>{escuta.atalho}</kbd>}
    </button>
  );

  return (
    <div
      ref={raiz}
      className="int px-int"
      aria-label={rotulo ?? t('Modo intérprete')}
      {...(emDialogo ? { role: 'dialog', ...(comTrilho ? {} : { 'aria-modal': true }) } : {})}
      data-testid={testid}
      data-fase={fase}
      data-pagina={comTrilho ? '' : undefined}
      data-layout={emColunas ? 'computador' : undefined}
      data-escuta={escuta ? '' : undefined}
    >
      {metade(cima, true)}
      <div key="faixa" className="int-faixa" data-com-modo="">
        <div className="int-esq">
          <button type="button" className="int-ib peq" aria-label={t('Trocar os lados')} onClick={trocar}>
            {emColunas ? <ArrowLeftRight aria-hidden /> : <ArrowUpDown aria-hidden />}
          </button>
          {automatico && (
            <button
              type="button"
              className="int-modo"
              aria-pressed={automatico.ligado}
              aria-label={t('Modo automático: o app reconhece quem fala qual idioma')}
              onClick={(e) => automatico.aoTocar(e.currentTarget)}
              data-testid="modo-automatico"
            >
              {automatico.comCadeado ? <Lock aria-hidden /> : <Languages aria-hidden />}
              <span className="int-modo-txt" aria-hidden>
                {t('Automático')}
              </span>
            </button>
          )}
          <button
            type="button"
            className="int-modo"
            aria-pressed={lista.aberta}
            aria-label={t('Ver a conversa em lista')}
            onClick={lista.aoAlternar}
            data-testid="tela-conversa"
          >
            <ListChecks aria-hidden />
            <span className="int-modo-txt" aria-hidden>
              {t('Conversa')}
            </span>
          </button>
          {modos?.map((m) => (
            <button
              key={m.id}
              type="button"
              className="int-modo"
              aria-pressed={m.ligado}
              aria-label={m.rotuloParaLeitor}
              onClick={m.aoTocar}
              data-testid={m.id}
            >
              <m.icone aria-hidden />
              <span className="int-modo-txt" aria-hidden>
                {m.rotulo}
              </span>
            </button>
          ))}
          {aoVirtual && (
            <button
              type="button"
              className="int-modo"
              aria-label={t('Conversa virtual: traduzir uma chamada')}
              onClick={aoVirtual}
              data-testid="abrir-conversa-virtual"
            >
              <Monitor aria-hidden />
              <span className="int-modo-txt" aria-hidden>
                {t('Virtual')}
              </span>
            </button>
          )}
        </div>
        {!emColunas && botaoDeEscuta}
        <div className="int-centro">
          {vozes ? (
            <button
              type="button"
              className="int-voz"
              data-natural={voz.natural ? '' : undefined}
              data-testid="voz-em-uso"
              title={voz.rotulo}
              aria-haspopup="dialog"
              aria-label={t('{voz}. Escolher a voz', { voz: voz.rotulo })}
              onClick={() => setEscolhendoVoz(true)}
            >
              {voz.muda ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
              <span className="int-voz-txt">{voz.rotulo}</span>
            </button>
          ) : (
            <span
              className="int-voz"
              data-natural={voz.natural ? '' : undefined}
              data-testid="voz-em-uso"
              title={voz.rotulo}
            >
              {voz.muda ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
              <span className="int-voz-txt">{voz.rotulo}</span>
            </span>
          )}
          <span className="int-aviso" role="status" data-testid="aviso-do-interprete">
            {aviso}
          </span>
          {aoConhecerOPremium && (
            <button type="button" className="int-modo px-int-conhecer" onClick={aoConhecerOPremium}>
              {comNomeDoPlano(t('Conhecer o Premium'), planoDoInterprete())}
            </button>
          )}
        </div>
        <button
          type="button"
          className="int-ib peq"
          aria-label={rotuloDeSair ?? t('Sair do modo intérprete')}
          onClick={aoSair}
        >
          <X aria-hidden />
        </button>
      </div>
      {lista.aberta && (
        <section key="lista" className="int-conversa" aria-label={t('Conversa')} data-testid="interprete-conversa">
          <div className="int-conversa-topo">
            {lista.topo}
            <button type="button" className="int-modo" onClick={lista.aoExportar} data-testid="exportar-conversa">
              <Download aria-hidden />
              <span>{t('Exportar')}</span>
            </button>
          </div>
          {lista.conteudo || (
            <div className="int-bolhas">
              {lista.bolhas.length ? (
                lista.bolhas.map((b) => (
                  <Fragment key={b.id}>
                    <div className="int-bolha" data-lado={b.dono} data-bolha={b.id}>
                      <p className="int-bolha-idioma">{quem(b.dono)}</p>
                      {/* O idioma de cada linha nem sempre chega aqui: `auto` lê a direção do próprio texto. */}
                      <p className="int-bolha-fala" dir="auto" lang={b.lang}>
                        {b.dono === 'outro' ? comMarcas(b.fala, b.lang, b.id) : b.fala}
                      </p>
                      <p className="int-bolha-trad" dir="auto">
                        {b.traducao}
                      </p>
                      {assistente && b.dono === 'meu' && (
                        <CorrecaoNaPagina correcao={assistente.correcoes.get(b.id)} lang={b.lang} />
                      )}
                    </div>
                    {b.dono === 'outro' && botaoResponder(b.id, 'bolha')}
                  </Fragment>
                ))
              ) : (
                <p className="int-dica">{t('A conversa aparece aqui conforme vocês falam.')}</p>
              )}
            </div>
          )}
        </section>
      )}
      {metade(baixo, false)}
      {emColunas && botaoDeEscuta && <div className="int-base">{botaoDeEscuta}</div>}
      {children}
      {marcaAberta && (
        <CartaoDaMarca marca={marcaAberta.marca} lang={marcaAberta.lang} aoFechar={() => setMarcaAberta(null)} />
      )}
      {vozes && escolhendoVoz && <FolhaDasVozes lados={vozes.lados} aoFechar={() => setEscolhendoVoz(false)} />}
    </div>
  );
}
