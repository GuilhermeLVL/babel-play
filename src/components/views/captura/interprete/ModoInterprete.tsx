import '../../../../styles/modoInterprete.css';

import { ArrowUpDown, AudioLines, Loader2, Lock, Mic, RotateCcw, Square, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  type ControleDoInterprete,
  criarControleDoInterprete,
  type EstadoDoControle,
  type PonteDoInterprete,
} from '../../../../lib/captura/controleDoInterprete';
import { direcaoDoLado, ESTADO_INICIAL, type IdiomasDoInterprete } from '../../../../lib/captura/interprete';
import type { LadoDoInterprete, SpeechSegment } from '../../../../lib/captura/tiposDaFala';
import { t } from '../../../../lib/i18n';
import { langLabel } from '../../../../lib/languages';
import { nativeTts } from '../../../../lib/tts';
import { tempoAteAVoz } from '../../../../lib/voz/tempoAteAVoz';
import { criarVozDaNuvem, destravarVozDaNuvem, type VozDaNuvem } from '../../../../lib/voz/vozDaNuvem';

/** A fala, no que a tela precisa. */
export type FalaDoInterprete = Pick<SpeechSegment, 'id' | 'originalText' | 'translatedText' | 'isPartial' | 'lado'>;

const ESTADO_DA_TELA: EstadoDoControle = { ...ESTADO_INICIAL, falando: null };

const outro = (lado: LadoDoInterprete): LadoDoInterprete => (lado === 'meu' ? 'outro' : 'meu');

/** Como a conversa anda: o app ouve e reconhece quem fala (automático), ou cada um toca a sua metade. */
export type ModoDaConversa = 'automatico' | 'toque';
/**
 * O automático NESTA conta: `disponivel` (o plano o tem), `premium` (não tem: o botão aparece com
 * cadeado e diz de que plano é) ou `oculto` (o site sem servidor, o perfil protegido: nem aparece).
 */
export type AutomaticoNoPlano = 'disponivel' | 'premium' | 'oculto';

/* A última escolha da pessoa, neste aparelho. Conveniência: sem armazenamento, vale o padrão. */
const CHAVE_DO_MODO = 'babel.interprete.modo';
function modoGuardado(): ModoDaConversa | null {
  try {
    const v = localStorage.getItem(CHAVE_DO_MODO);
    return v === 'automatico' || v === 'toque' ? v : null;
  } catch {
    return null;
  }
}
function guardarModo(modo: ModoDaConversa) {
  try {
    localStorage.setItem(CHAVE_DO_MODO, modo);
  } catch {
    /* sem armazenamento: a escolha vale só nesta tela */
  }
}

/** A última fala de um lado (a que a metade do OUTRO mostra traduzida). */
function ultimaDoLado(falas: ReadonlyArray<FalaDoInterprete>, lado: LadoDoInterprete, parcial: boolean) {
  for (let i = falas.length - 1; i >= 0; i--) {
    const f = falas[i];
    if (f.lado === lado && !!f.isPartial === parcial && f.originalText.trim()) return f;
  }
  return undefined;
}

/**
 * O MODO INTÉRPRETE (E3 da Fase E) — a maquete aprovada pelo dono (2026-09-30), no visual da captura
 * (tokens, cartão escuro, ícones lucide):
 *
 *  · CELULAR: a tela dividida frente a frente. A metade de cima fica VIRADA 180° para a pessoa do
 *    outro lado da mesa. Cada metade mostra o idioma dela, a última frase do outro TRADUZIDA GRANDE
 *    com o original pequeno embaixo, e um botão redondo grande "Falar". Na faixa do meio: trocar os
 *    lados, a voz em uso ("Voz do aparelho" ou "Voz natural · Premium") e sair.
 *  · OUVINDO: o botão de quem fala vira "Parar", com anel.
 *  · FALANDO: a metade de quem ouve mostra "Repetir" e "Parar voz".
 *  · COMPUTADOR: duas colunas lado a lado, com atalhos de teclado (1 e 2 falam, R repete, P para a
 *    voz, Esc sai).
 *  · QUEST (maquete de 01/10/2026): as duas colunas do computador, sem atalhos (não há teclado), com a
 *    faixa embaixo e alvos de 60 px. Sem voz de leitura no aparelho (`semVoz`), a tela diz que a
 *    tradução é em texto, em vez de prometer leitura em voz alta, e "Repetir" não aparece.
 *  · AUTOMÁTICO (E7, o padrão de quem o tem no plano): ninguém toca em lado. Um botão só, "Ouvir a
 *    conversa", na metade de quem segura o aparelho; o app reconhece o idioma de cada fala, mostra a
 *    tradução na metade de quem ouve, lê em voz alta e volta a ouvir. O botão "Automático" da faixa
 *    do meio alterna com o modo por toque (para a rua barulhenta); sem ele no plano, aparece com
 *    cadeado e diz de que plano é.
 *
 * O estado e os efeitos são do `controleDoInterprete.ts`. A captura (`LiveCapture`) abre a sessão,
 * repassa as falas e liga a ponte (`registrarPonte`): o pipeline e as fontes leem a direção do
 * microfone dela, e o fim de cada fala e a tradução de cada final chegam por ela.
 */
export default function ModoInterprete({
  idiomas,
  falas,
  microfone,
  registrarPonte,
  vozNaturalDisponivel,
  velocidade,
  layout,
  semVoz = false,
  abrindo,
  aviso,
  automatico = 'oculto',
  aoSair,
  aoFalharMicrofone,
}: {
  idiomas: IdiomasDoInterprete;
  falas: ReadonlyArray<FalaDoInterprete>;
  microfone: { abrir: () => Promise<void> | void; fechar: () => void };
  registrarPonte: (ponte: PonteDoInterprete | null) => void;
  /** O Premium com a voz natural (entitlement `vozNatural` e flag `voz_natural`). */
  vozNaturalDisponivel: boolean;
  velocidade?: number;
  layout: 'celular' | 'computador' | 'quest';
  /** O aparelho não tem voz de leitura (`recursosDoAparelho`): a conversa é só em texto. */
  semVoz?: boolean;
  /** O microfone está abrindo (a permissão, o modelo): o botão de quem fala mostra a espera. */
  abrindo?: boolean;
  /**
   * O que a captura diria por baixo (o tradutor do outro sentido baixando, um aviso do microfone): a
   * tela do intérprete a cobre inteira, então a linha aparece aqui, na faixa do meio.
   */
  aviso?: string | null;
  /** O modo automático nesta conta (o entitlement `interpreteAutomatico`). Ausente = não aparece. */
  automatico?: AutomaticoNoPlano;
  aoSair: () => void;
  aoFalharMicrofone?: (erro: unknown) => void;
}) {
  const idiomasRef = useRef(idiomas);
  idiomasRef.current = idiomas;
  const microfoneRef = useRef(microfone);
  microfoneRef.current = microfone;
  const aoFalharRef = useRef(aoFalharMicrofone);
  aoFalharRef.current = aoFalharMicrofone;

  /* O CONTROLE nasce no efeito, e não no render: no StrictMode o efeito monta, desmonta e monta de
     novo — um controle criado no render seria desligado na primeira desmontagem e ficaria morto. */
  const controleRef = useRef<ControleDoInterprete | null>(null);
  const vozRef = useRef<VozDaNuvem | null>(null);
  const [estado, setEstado] = useState<EstadoDoControle>(ESTADO_DA_TELA);
  const velocidadeRef = useRef(velocidade);
  velocidadeRef.current = velocidade;

  useEffect(() => {
    const voz = vozNaturalDisponivel ? criarVozDaNuvem() : null;
    const velocidadeInicial = velocidadeRef.current;
    const controle = criarControleDoInterprete({
      idiomas: () => idiomasRef.current,
      microfone: {
        abrir: () => microfoneRef.current.abrir(),
        fechar: () => microfoneRef.current.fechar(),
      },
      motor: () => voz ?? nativeTts,
      nomeDoMotor: () => voz?.motorDaUltimaFala() ?? 'voz-do-aparelho',
      ...(voz ? { destravarVoz: destravarVozDaNuvem } : {}),
      ...(velocidadeInicial && velocidadeInicial !== 1 ? { opcoesDeFala: { rate: velocidadeInicial } } : {}),
      aoMudar: setEstado,
      aoFalharMicrofone: (erro) => aoFalharRef.current?.(erro),
    });
    controleRef.current = controle;
    vozRef.current = voz;
    tempoAteAVoz.zerar();
    registrarPonte(controle);
    setEstado(controle.estado());
    return () => {
      registrarPonte(null);
      controle.sair();
      if (controleRef.current === controle) controleRef.current = null;
    };
  }, [vozNaturalDisponivel, registrarPonte]);
  const atual = estado;

  /* O MODO. Quem tem o automático começa nele (decisão do dono), a menos que tenha escolhido o toque
     da última vez. Sem ele no plano, é sempre por toque. */
  const [modo, setModo] = useState<ModoDaConversa>(() =>
    automatico === 'disponivel' ? (modoGuardado() ?? 'automatico') : 'toque',
  );
  useEffect(() => {
    if (automatico !== 'disponivel') setModo('toque');
  }, [automatico]);
  /** O aviso da própria tela (o cadeado do automático), por alguns segundos. */
  const [avisoDaTela, setAvisoDaTela] = useState<string | null>(null);
  useEffect(() => {
    if (!avisoDaTela) return;
    const relogio = setTimeout(() => setAvisoDaTela(null), 7000);
    return () => clearTimeout(relogio);
  }, [avisoDaTela]);
  const trocarModo = () => {
    if (automatico !== 'disponivel') {
      setAvisoDaTela(t('O modo automático faz parte do Premium: o app reconhece sozinho quem fala qual idioma.'));
      return;
    }
    /* Trocar no meio da conversa fecha o microfone e cala a voz: o modo novo começa do zero. */
    if (controleRef.current && controleRef.current.estado().fase !== 'parado') controleRef.current.parar();
    const novo: ModoDaConversa = modo === 'automatico' ? 'toque' : 'automatico';
    setModo(novo);
    guardarModo(novo);
  };
  const noAutomatico = modo === 'automatico';
  /** "Ouvir a conversa" / "Parar": o botão único do automático. */
  const alternarEscuta = () => {
    const c = controleRef.current;
    if (!c) return;
    if (c.estado().automatico) c.parar();
    else c.ouvir();
  };

  const controle = {
    tocar: (lado: LadoDoInterprete) => controleRef.current?.tocar(lado),
    repetir: () => controleRef.current?.repetir(),
    pararVoz: () => controleRef.current?.pararVoz(),
    trocarLados: () => controleRef.current?.trocarLados(),
    sair: () => controleRef.current?.sair(),
  };

  const sair = () => {
    controle.sair();
    aoSair();
  };

  /* OS ATALHOS do computador. No celular não há teclado a ouvir. */
  const sairRef = useRef(sair);
  sairRef.current = sair;
  const noAutomaticoRef = useRef(noAutomatico);
  noAutomaticoRef.current = noAutomatico;
  const alternarEscutaRef = useRef(alternarEscuta);
  alternarEscutaRef.current = alternarEscuta;
  useEffect(() => {
    if (layout !== 'computador') return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
      const tecla = e.key.toLowerCase();
      /* No automático não há lados a tocar: o 1 liga e desliga a escuta, e o 2 não faz nada. */
      if (tecla === '1') {
        if (noAutomaticoRef.current) alternarEscutaRef.current();
        else controle.tocar('meu');
      } else if (tecla === '2') {
        if (noAutomaticoRef.current) return;
        controle.tocar('outro');
      } else if (tecla === 'r') controle.repetir();
      else if (tecla === 'p') controle.pararVoz();
      else if (tecla === 'escape') sairRef.current();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `controle` só lê o ref
  }, [layout]);

  const vozNatural = !!vozRef.current && vozRef.current.motorDaUltimaFala() === 'voz-da-nuvem';
  /** Lado a lado (computador e Quest); no celular, frente a frente com a metade de cima virada. */
  const ladoALado = layout !== 'celular';
  const computador = layout === 'computador';

  const metade = (lado: LadoDoInterprete) => {
    const direcao = direcaoDoLado(lado, idiomas, atual.trocados);
    const nome = langLabel(direcao.fala);
    const doOutro = ultimaDoLado(falas, outro(lado), false);
    /* No automático a escuta não é de um lado: as duas metades dizem o mesmo, cada uma virada para
       quem a lê. */
    const escutando = atual.automatico && atual.fase === 'ouvindo';
    const ouvindo = !atual.automatico && atual.fase === 'ouvindo' && atual.lado === lado;
    const traduzindo = atual.fase === 'traduzindo' && (atual.automatico || atual.lado === lado);
    const vozParaMim = !!atual.falando && atual.falando.lado === outro(lado);
    const minhaAoVivo = ouvindo ? ultimaDoLado(falas, lado, true) : undefined;
    const atalho = lado === 'meu' ? '1' : '2';
    return (
      <section
        className="int-metade"
        data-lado={lado}
        data-virada={!ladoALado && lado === 'outro' ? true : undefined}
        data-ouvindo={ouvindo || escutando || undefined}
        aria-label={t('Lado de quem fala {idioma}', { idioma: nome })}
        data-testid={`interprete-${lado}`}
      >
        <p className="int-idioma" lang={direcao.fala}>
          {nome}
        </p>
        <div className="int-frase" aria-live="polite">
          {minhaAoVivo ? (
            <p className="int-ao-vivo" lang={direcao.fala}>
              {minhaAoVivo.originalText}
            </p>
          ) : doOutro ? (
            <>
              <p className="int-traducao" lang={direcao.fala}>
                {doOutro.translatedText && doOutro.translatedText !== '…' ? doOutro.translatedText : '…'}
              </p>
              <p className="int-original">{doOutro.originalText}</p>
            </>
          ) : (
            <p className="int-dica">
              {semVoz
                ? noAutomatico
                  ? t('Toque em Ouvir e conversem. O app reconhece quem fala qual idioma e mostra a tradução.')
                  : t('Toque em Falar e fale. A tradução aparece do outro lado, em texto.')
                : noAutomatico
                  ? t('Toque em Ouvir e conversem. O app reconhece quem fala qual idioma e lê a tradução em voz alta.')
                  : t('Toque em Falar e fale. A tradução aparece do outro lado e é lida em voz alta.')}
            </p>
          )}
        </div>
        <p className="int-status" role="status">
          {ouvindo || escutando
            ? abrindo
              ? t('Abrindo o microfone…')
              : escutando
                ? t('Ouvindo a conversa…')
                : t('Ouvindo…')
            : traduzindo
              ? t('Traduzindo…')
              : vozParaMim
                ? t('Lendo a tradução')
                : ''}
        </p>
        <div className="int-acoes">
          {!semVoz && (vozParaMim || (atual.fase === 'parado' && doOutro)) && (
            <button
              type="button"
              className="int-ib"
              onClick={() => controle.repetir()}
              aria-label={t('Repetir a tradução')}
            >
              <RotateCcw aria-hidden />
              <span>{t('Repetir')}</span>
              {computador && <kbd>R</kbd>}
            </button>
          )}
          {noAutomatico ? (
            /* O botão único do automático fica na metade de quem segura o aparelho; a outra pessoa só fala. */
            lado === 'meu' && (
              <button
                type="button"
                className="int-falar"
                data-ouvindo={escutando || undefined}
                onClick={alternarEscuta}
                aria-pressed={atual.automatico}
                aria-label={atual.automatico ? t('Parar de ouvir a conversa') : t('Ouvir a conversa')}
                data-sfx="none"
                data-testid="ouvir-a-conversa"
              >
                {atual.automatico ? (
                  escutando && abrindo ? (
                    <Loader2 aria-hidden className="animate-spin" />
                  ) : (
                    <Square aria-hidden />
                  )
                ) : (
                  <AudioLines aria-hidden />
                )}
                <span aria-hidden>{atual.automatico ? t('Parar') : t('Ouvir')}</span>
                {computador && <kbd aria-hidden>1</kbd>}
              </button>
            )
          ) : (
            <button
              type="button"
              className="int-falar"
              data-ouvindo={ouvindo || undefined}
              onClick={() => controle.tocar(lado)}
              aria-pressed={ouvindo}
              aria-label={ouvindo ? t('Parar de ouvir') : t('Falar em {idioma}', { idioma: nome })}
              data-sfx="none"
            >
              {ouvindo ? (
                abrindo ? (
                  <Loader2 aria-hidden className="animate-spin" />
                ) : (
                  <Square aria-hidden />
                )
              ) : (
                <Mic aria-hidden />
              )}
              <span aria-hidden>{ouvindo ? t('Parar') : t('Falar')}</span>
              {computador && <kbd aria-hidden>{atalho}</kbd>}
            </button>
          )}
          {!semVoz && vozParaMim && (
            <button type="button" className="int-ib" onClick={() => controle.pararVoz()} aria-label={t('Parar a voz')}>
              <VolumeX aria-hidden />
              <span>{t('Parar voz')}</span>
              {computador && <kbd>P</kbd>}
            </button>
          )}
        </div>
      </section>
    );
  };

  return (
    <div
      className="int"
      data-layout={layout}
      role="dialog"
      aria-modal="true"
      aria-label={t('Modo intérprete')}
      data-testid="modo-interprete"
      data-fase={atual.fase}
      data-modo={modo}
    >
      {ladoALado ? metade('meu') : metade('outro')}
      <div className="int-faixa" data-com-modo={automatico !== 'oculto' || undefined}>
        <div className="int-esq">
          <button
            type="button"
            className="int-ib peq"
            onClick={() => controle.trocarLados()}
            aria-label={t('Trocar os lados')}
          >
            <ArrowUpDown aria-hidden />
          </button>
          {automatico !== 'oculto' && (
            <button
              type="button"
              className="int-modo"
              onClick={trocarModo}
              aria-pressed={noAutomatico}
              aria-label={t('Modo automático: o app reconhece quem fala qual idioma')}
              data-bloqueado={automatico === 'premium' || undefined}
              data-testid="modo-automatico"
            >
              {automatico === 'premium' ? <Lock aria-hidden /> : <AudioLines aria-hidden />}
              <span aria-hidden>{t('Automático')}</span>
            </button>
          )}
        </div>
        <div className="int-centro">
          <span
            className="int-voz"
            data-natural={vozNatural || undefined}
            data-testid="voz-em-uso"
            title={
              semVoz
                ? t('Tradução em texto neste aparelho')
                : vozNatural
                  ? t('Voz natural · Premium')
                  : t('Voz do aparelho')
            }
          >
            {semVoz ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
            <span className="int-voz-txt">
              {semVoz
                ? t('Tradução em texto neste aparelho')
                : vozNatural
                  ? t('Voz natural · Premium')
                  : t('Voz do aparelho')}
            </span>
          </span>
          <span className="int-aviso" role="status" data-testid="aviso-do-interprete">
            {avisoDaTela ?? aviso ?? ''}
          </span>
        </div>
        <button type="button" className="int-ib peq" onClick={sair} aria-label={t('Sair do modo intérprete')}>
          <X aria-hidden />
        </button>
      </div>
      {ladoALado ? metade('outro') : metade('meu')}
    </div>
  );
}
