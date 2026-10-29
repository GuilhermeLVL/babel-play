import { type CSSProperties, lazy, Suspense } from 'react';

import type { MotivoDaPulada } from '../../core/avatar/sinais/soletracaoDoInterprete';
import type { Lingua } from '../../core/avatar/sinais/tipos';
import type { TierDoAvatar } from '../../core/avatar/tiers';
import { t } from '../../lib/i18n';
import { useReceitaDoDono } from './AvatarDaConversa';
import AvisosDaSoletracao from './AvisosDaSoletracao';
import type { SoletracaoEmCurso } from './useSoletracaoAtiva';

const PalcoDaSoletracao = lazy(() => import('./PalcoDaSoletracao'));

export const MOTIVO_DA_PULADA: Record<MotivoDaPulada, () => string> = {
  fila: () => t('Soletração pulada: a voz está atrasada.'),
  sem_alfabeto: () => t('Soletração pulada: sem alfabeto manual para este idioma.'),
};

/**
 * O PALCO EM REPOUSO: com a soletração ligada e nenhum nome a soletrar, as mãos ficam à vista na pose de repouso (texto
 * vazio = nenhum passo, só o repouso), para a pessoa ver o que o recurso faz antes de o primeiro nome aparecer.
 */
export function soletracaoEmRepouso(alfabeto: Lingua, espelhar: boolean): SoletracaoEmCurso {
  return { tipo: 'soletrar', id: 'repouso', texto: '', alfabeto, nomes: [], velocidade: 1, tetoMs: 1_000, espelhar };
}

const VISUALMENTE_ESCONDIDO: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/** O que está sendo soletrado agora (vem do palco, por `aoAtual`). */
export interface AtualDaSoletracao {
  palavra: string | null;
  letra: string;
  naoSoletradas: number;
}

/**
 * AS MÃOS DO AVATAR-INTÉRPRETE: o quadro da soletração que cobre o círculo do avatar enquanto há um nome a soletrar
 * (o rosto fica por baixo, vivo, e volta quando a soletração acaba). Sem letra nem legenda: a palavra atual aparece
 * em `SoletracaoNaConversa`, e a legenda da conversa é a do Intérprete, que nunca sai de lá.
 */
export function PalcoNaConversa({
  ativa,
  camera,
  tier,
  tamanho,
  aoAtual,
  aoFim,
}: {
  ativa: SoletracaoEmCurso;
  camera: 'corpo' | 'maos';
  tier: TierDoAvatar;
  /** O lado do círculo, em pixels. */
  tamanho: number;
  aoAtual: (a: AtualDaSoletracao) => void;
  aoFim: (id: string) => void;
}) {
  const receita = useReceitaDoDono('outro');
  if (!receita) return null;
  return (
    <Suspense fallback={null}>
      <PalcoDaSoletracao
        key={ativa.id}
        texto={ativa.texto}
        alfabeto={ativa.alfabeto}
        receita={receita}
        tier={tier}
        velocidade={ativa.velocidade}
        espelhar={ativa.espelhar}
        camera={camera}
        tamanho={Math.max(64, tamanho - 8)}
        tetoMs={ativa.tetoMs}
        compacto
        semLegenda
        aoAtual={aoAtual}
        aoFim={() => aoFim(ativa.id)}
      />
    </Suspense>
  );
}

/**
 * A SOLETRAÇÃO NA CONVERSA: embaixo do idioma da metade do avatar-intérprete. Os DOIS AVISOS FIXOS ficam sempre aqui
 * enquanto a opção está ligada (soletrando ou não); a palavra atual só aparece enquanto soletra. É complemento: a
 * legenda e a voz da conversa nunca esperam por isto.
 */
export default function SoletracaoNaConversa({
  soletrando,
  pulada,
  atual,
  compacto,
  anunciar,
}: {
  soletrando: boolean;
  pulada: MotivoDaPulada | null;
  atual: AtualDaSoletracao | null;
  compacto: boolean;
  anunciar: boolean;
}) {
  return (
    <div
      className="int-soletra"
      data-testid="soletracao-na-conversa"
      data-soletracao-estado={soletrando ? 'soletrando' : pulada ? 'pulada' : 'parada'}
    >
      <AvisosDaSoletracao compacto={compacto} />
      {pulada && (
        <p className="int-av-nota" data-testid="soletracao-pulada" role="status">
          {MOTIVO_DA_PULADA[pulada]()}
        </p>
      )}
      {!soletrando && !pulada && (
        <p
          className="int-soletra-aguarda"
          data-testid="soletracao-aguardando"
          role="status"
          /* No celular a altura é do texto da conversa: a frase fica só para o leitor de tela (as mãos em repouso já mostram o estado). */
          style={compacto ? VISUALMENTE_ESCONDIDO : { margin: '4px 0 0', fontSize: 14 }}
        >
          {t('Aguardando um nome…')}
        </p>
      )}
      {soletrando && atual && (
        <p
          className="int-soletra-atual"
          data-testid="soletracao-atual"
          aria-live={anunciar ? 'polite' : 'off'}
          aria-label={t('Soletrando')}
        >
          <strong data-sinais-letra-atual aria-hidden="true">
            {atual.letra}
          </strong>
          {atual.palavra && (
            <span className="int-soletra-palavra" data-palavra-atual aria-current="true">
              {atual.palavra}
            </span>
          )}
          {atual.naoSoletradas > 0 && (
            <small data-testid="soletracao-nao-soletradas">
              {t('Nomes que não couberam na soletração: {n}', { n: atual.naoSoletradas })}
            </small>
          )}
        </p>
      )}
    </div>
  );
}
