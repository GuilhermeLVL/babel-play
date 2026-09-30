import '../../../../styles/modoInterprete.css';

import { ArrowUpDown, Loader2, Mic, RotateCcw, Square, Volume2, VolumeX, X } from 'lucide-react';
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
  abrindo,
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
  layout: 'celular' | 'computador';
  /** O microfone está abrindo (a permissão, o modelo): o botão de quem fala mostra a espera. */
  abrindo?: boolean;
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
  useEffect(() => {
    if (layout !== 'computador') return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
      const tecla = e.key.toLowerCase();
      if (tecla === '1') controle.tocar('meu');
      else if (tecla === '2') controle.tocar('outro');
      else if (tecla === 'r') controle.repetir();
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
  const computador = layout === 'computador';

  const metade = (lado: LadoDoInterprete) => {
    const direcao = direcaoDoLado(lado, idiomas, atual.trocados);
    const nome = langLabel(direcao.fala);
    const doOutro = ultimaDoLado(falas, outro(lado), false);
    const ouvindo = atual.fase === 'ouvindo' && atual.lado === lado;
    const traduzindo = atual.fase === 'traduzindo' && atual.lado === lado;
    const vozParaMim = !!atual.falando && atual.falando.lado === outro(lado);
    const minhaAoVivo = ouvindo ? ultimaDoLado(falas, lado, true) : undefined;
    const atalho = lado === 'meu' ? '1' : '2';
    return (
      <section
        className="int-metade"
        data-lado={lado}
        data-virada={!computador && lado === 'outro' ? true : undefined}
        data-ouvindo={ouvindo || undefined}
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
              {t('Toque em Falar e fale. A tradução aparece do outro lado e é lida em voz alta.')}
            </p>
          )}
        </div>
        <p className="int-status" role="status">
          {ouvindo
            ? abrindo
              ? t('Abrindo o microfone…')
              : t('Ouvindo…')
            : traduzindo
              ? t('Traduzindo…')
              : vozParaMim
                ? t('Lendo a tradução')
                : ''}
        </p>
        <div className="int-acoes">
          {(vozParaMim || (atual.fase === 'parado' && doOutro)) && (
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
          {vozParaMim && (
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
    >
      {computador ? metade('meu') : metade('outro')}
      <div className="int-faixa">
        <button
          type="button"
          className="int-ib peq"
          onClick={() => controle.trocarLados()}
          aria-label={t('Trocar os lados')}
        >
          <ArrowUpDown aria-hidden />
        </button>
        <span className="int-voz" data-natural={vozNatural || undefined} data-testid="voz-em-uso">
          <Volume2 aria-hidden />
          {vozNatural ? t('Voz natural · Premium') : t('Voz do aparelho')}
        </span>
        <button type="button" className="int-ib peq" onClick={sair} aria-label={t('Sair do modo intérprete')}>
          <X aria-hidden />
          {computador && <kbd aria-hidden>Esc</kbd>}
        </button>
      </div>
      {computador ? metade('outro') : metade('meu')}
    </div>
  );
}
