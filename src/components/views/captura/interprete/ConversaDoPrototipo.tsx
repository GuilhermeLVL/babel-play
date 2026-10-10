import '../../../../styles/modoInterprete.css';

import {
  ArrowUpDown,
  ChevronDown,
  Download,
  Languages,
  ListChecks,
  Lock,
  type LucideIcon,
  Mic,
  Monitor,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';

import type { LadoDoInterprete } from '../../../../lib/captura/tiposDaFala';
import { noComputador } from '../../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../../lib/i18n';
import {
  entradaDaConversa,
  entradaDasBolhas,
  palavraNova,
  topoDasMetades,
  traducaoChegou,
  trocaDeLados,
} from '../../../../lib/polimento/interprete';
import { sentir } from '../../../../lib/polimento/sentidos';

/** O que a metade mostra no meio: a dica de começo, a fala de quem está nela, ou a tradução do outro. */
export type FraseDaMetade =
  | { tipo: 'dica'; texto: string }
  | { tipo: 'fala'; texto: string; lang: string; aoVivo: boolean }
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
  automatico,
  modos,
  lista,
  voz,
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
  fase,
  testid = 'modo-interprete',
  rotulo,
  rotuloDeSair,
  children,
}: {
  cima: MetadeDaConversa;
  baixo: MetadeDaConversa;
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
  fase?: string | undefined;
  testid?: string;
  /** O nome da tela e o do X para o leitor de tela. Ausentes = os do modo intérprete. */
  rotulo?: string;
  rotuloDeSair?: string;
  children?: ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  /** No monitor: duas colunas e ninguém de cabeça para baixo. */
  const emColunas = noComputador();

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
        <p className="int-ao-vivo" lang={f.lang}>
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
        <p className="int-traducao" lang={f.lang}>
          {f.traducao}
        </p>
        {f.original && (
          <p className="int-original" lang={f.langDoOriginal}>
            {f.original}
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
        {' · '}
        {m.nome}
        {aoEscolherIdioma && (
          <>
            {' '}
            <button
              type="button"
              className="int-modo px-int-idioma"
              aria-label={t('Trocar este idioma')}
              onClick={aoEscolherIdioma}
            >
              <ChevronDown aria-hidden />
            </button>
          </>
        )}
      </p>
      <div className="int-frase" aria-live="polite">
        {frase(m)}
      </div>
      <p className="int-status" role="status">
        {m.status}
      </p>
      <div className="int-acoes">
        {!m.semVoz && (
          <button type="button" className="int-ib" aria-label={t('Repetir a tradução')} onClick={aoRepetir}>
            <RotateCcw aria-hidden />
            <span>{t('Repetir')}</span>
          </button>
        )}
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
        </button>
        {!m.semVoz && (
          <button type="button" className="int-ib" aria-label={t('Parar a voz')} onClick={aoPararVoz}>
            <Volume2 aria-hidden />
            <span>{t('Parar voz')}</span>
          </button>
        )}
      </div>
    </section>
  );

  return (
    <div
      ref={raiz}
      className="int px-int"
      aria-label={rotulo ?? t('Modo intérprete')}
      {...(emDialogo ? { role: 'dialog', 'aria-modal': true } : {})}
      data-testid={testid}
      data-fase={fase}
      data-layout={emColunas ? 'computador' : undefined}
    >
      {metade(cima, true)}
      <div key="faixa" className="int-faixa" data-com-modo="">
        <div className="int-esq">
          <button type="button" className="int-ib peq" aria-label={t('Trocar os lados')} onClick={trocar}>
            <ArrowUpDown aria-hidden />
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
              <span aria-hidden>{t('Automático')}</span>
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
        <div className="int-centro">
          <span
            className="int-voz"
            data-natural={voz.natural ? '' : undefined}
            data-testid="voz-em-uso"
            title={voz.rotulo}
          >
            {voz.muda ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
            <span className="int-voz-txt">{voz.rotulo}</span>
          </span>
          <span className="int-aviso" role="status" data-testid="aviso-do-interprete">
            {aviso}
          </span>
          {aoConhecerOPremium && (
            <button type="button" className="int-modo px-int-conhecer" onClick={aoConhecerOPremium}>
              {t('Conhecer o Premium')}
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
                  <div key={b.id} className="int-bolha" data-lado={b.dono}>
                    <p className="int-bolha-idioma">{quem(b.dono)}</p>
                    <p className="int-bolha-fala">{b.fala}</p>
                    <p className="int-bolha-trad">{b.traducao}</p>
                  </div>
                ))
              ) : (
                <p className="int-dica">{t('A conversa aparece aqui conforme vocês falam.')}</p>
              )}
            </div>
          )}
        </section>
      )}
      {metade(baixo, false)}
      {children}
    </div>
  );
}
