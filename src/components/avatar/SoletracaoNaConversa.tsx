import '../../styles/letrasDoPalco.css';

import { lazy, Suspense, useRef } from 'react';

import {
  type EstadoDoPalco,
  type ModoDeSoletracao,
  type MotivoDaPulada,
} from '../../core/avatar/sinais/soletracaoDoInterprete';
import type { Lingua } from '../../core/avatar/sinais/tipos';
import type { TierDoAvatar } from '../../core/avatar/tiers';
import { t, tp } from '../../lib/i18n';
import { useReceitaDoDono } from './AvatarDaConversa';
import type { AtualDoSinalizante } from './AvatarSinalizante';
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

/** O que está sendo soletrado agora (vem do palco, por `aoAtual`). */
export type AtualDaSoletracao = AtualDoSinalizante;

/**
 * AS MÃOS DO AVATAR-INTÉRPRETE: o palco da soletração que cobre o rosto do avatar enquanto a soletração está ligada.
 * SEMPRE à vista: sem nada a soletrar as mãos ficam em repouso (pose de descanso), e quando chega o texto elas soletram.
 * O mesmo modelo serve a tudo (o texto muda, o canvas não é recriado). Sem letra nem legenda aqui: a palavra e as letras
 * aparecem em `SoletracaoNaConversa`, e a legenda da conversa é a do Intérprete, que nunca sai de lá.
 */
export function PalcoDasMaos({
  ativa,
  alfabetoDeRepouso,
  espelhar,
  camera,
  tier,
  tamanho,
  aoAtual,
  aoFim,
}: {
  /** A soletração em curso, ou `null` (mãos em repouso). */
  ativa: SoletracaoEmCurso | null;
  /** O alfabeto a carregar enquanto nada é soletrado (o da conversa). */
  alfabetoDeRepouso: Lingua;
  espelhar: boolean;
  camera: 'corpo' | 'maos';
  tier: TierDoAvatar;
  /** O lado do palco, em pixels. */
  tamanho: number;
  aoAtual: (a: AtualDoSinalizante) => void;
  aoFim: (id: string) => void;
}) {
  const receita = useReceitaDoDono('outro');
  const idDoMomento = useRef<string | null>(null);
  idDoMomento.current = ativa?.id ?? null;
  if (!receita) return null;
  return (
    <Suspense fallback={null}>
      <PalcoDaSoletracao
        texto={ativa?.texto ?? ''}
        alfabeto={ativa?.alfabeto ?? alfabetoDeRepouso}
        receita={receita}
        tier={tier}
        velocidade={ativa?.velocidade ?? 1}
        espelhar={ativa?.espelhar ?? espelhar}
        camera={camera}
        tamanho={Math.max(64, tamanho - 8)}
        {...(ativa ? { tetoMs: ativa.tetoMs } : {})}
        soNomesProprios={ativa?.soNomesProprios ?? true}
        compacto
        maosEmPosicao
        semLegenda
        aoAtual={aoAtual}
        aoFim={() => {
          if (idDoMomento.current) aoFim(idDoMomento.current);
        }}
      />
    </Suspense>
  );
}

const AGUARDANDO: Record<ModoDeSoletracao, () => string> = {
  nomes: () => t('Aguardando um nome para soletrar…'),
  tudo: () => t('Aguardando uma fala para soletrar…'),
};

/** A forma curta do "Aguardando…", para caber ao lado do idioma no celular (a longa fica no `title`). */
const AGUARDANDO_CURTO: Record<ModoDeSoletracao, () => string> = {
  nomes: () => t('Aguardando um nome…'),
  tudo: () => t('Aguardando uma fala…'),
};

/**
 * "Aguardando…" do palco, numa linha só. No celular ela mora no TOPO da metade (embaixo do idioma, ao lado do círculo das
 * mãos), onde sobra espaço, porque cada pixel de altura conta para a frase da conversa.
 */
export function LinhaDoEstadoDoPalco({ modo }: { modo: ModoDeSoletracao }) {
  return (
    <p
      className="int-soletra-estado int-soletra-estado-topo"
      data-testid="soletracao-aguardando"
      title={AGUARDANDO[modo]()}
    >
      {AGUARDANDO_CURTO[modo]()}
    </p>
  );
}

/**
 * A SOLETRAÇÃO NA CONVERSA: embaixo do idioma da metade do avatar-intérprete. Os DOIS AVISOS FIXOS ficam sempre aqui
 * enquanto a opção está ligada (soletrando ou não); o estado do palco ("Aguardando…", "Soletrando: C-O-N-…", "pulada"),
 * as letras (feitas, a atual, as que faltam) e a contagem de palavras na fila ficam junto. É complemento: a legenda e a
 * voz da conversa nunca esperam por isto. Soletração do alfabeto manual, NÃO tradução.
 *
 * Para o leitor de tela: só a PALAVRA atual é anunciada (e só se a pessoa pediu o aviso por voz), nunca letra por letra.
 */
export default function SoletracaoNaConversa({
  estado,
  modo,
  palavrasNaFila,
  compacto,
  anunciar,
  aguardandoNoTopo = false,
  naoCouberam = 0,
}: {
  estado: EstadoDoPalco;
  modo: ModoDeSoletracao;
  /** Palavras desta fala que ainda esperam a vez de ser soletradas. */
  palavrasNaFila: number;
  compacto: boolean;
  anunciar: boolean;
  /** A linha "Aguardando…" é mostrada por quem monta, no topo da metade (`LinhaDoEstadoDoPalco`). */
  aguardandoNoTopo?: boolean;
  /** Quantas palavras não couberam no teto de tempo desta fala (ficam sem soletrar, com o motivo no palco). */
  naoCouberam?: number;
}) {
  const soletrando = estado.tipo === 'soletrando';
  const palavra = estado.tipo === 'soletrando' ? estado.palavra : null;
  return (
    <div
      className="int-soletra"
      data-testid="soletracao-na-conversa"
      data-modo={modo}
      data-soletracao-estado={soletrando ? 'soletrando' : estado.tipo === 'pulada' ? 'pulada' : 'parada'}
    >
      <AvisosDaSoletracao compacto={compacto} />
      {estado.tipo === 'aguardando' && !aguardandoNoTopo && (
        <p className="int-soletra-estado" data-testid="soletracao-aguardando">
          {AGUARDANDO[modo]()}
        </p>
      )}
      {estado.tipo === 'pulada' && (
        <p className="int-av-nota" data-testid="soletracao-pulada" role="status">
          {MOTIVO_DA_PULADA[estado.motivo]()}
        </p>
      )}
      {estado.tipo === 'soletrando' && (
        <div className="int-soletra-atual" data-testid="soletracao-atual" data-modo={modo}>
          <p className="int-soletra-estado" data-testid="soletracao-rotulo" aria-hidden="true">
            {estado.rotulo ? t('Soletrando: {letras}', { letras: estado.rotulo }) : t('Soletrando…')}
          </p>
          {estado.letras.length > 0 && !compacto && (
            <ol className="letras-palco" data-testid="soletracao-letras" aria-hidden="true">
              {estado.letras.map((l, i) => (
                <li key={`${i}-${l.letra}`} data-estado={l.estado} data-letra={l.letra}>
                  {l.letra}
                </li>
              ))}
            </ol>
          )}
          {palavra && (
            <span className="int-soletra-palavra" data-palavra-atual aria-current="true">
              {palavra}
            </span>
          )}
          <small data-testid="soletracao-fila">
            {tp(palavrasNaFila, '{n} palavra na fila', '{n} palavras na fila')}
          </small>
          {naoCouberam > 0 && (
            <small data-testid="soletracao-nao-soletradas">
              {modo === 'tudo'
                ? t('Palavras que não couberam na soletração: {n}', { n: naoCouberam })
                : t('Nomes que não couberam na soletração: {n}', { n: naoCouberam })}
            </small>
          )}
          <small data-testid="soletracao-nao-traducao">{t('Soletração, não tradução')}</small>
        </div>
      )}
      {/* Só a palavra, sem letra por letra: uma região educada e separada do visual. */}
      <p className="sr-only" aria-live={anunciar ? 'polite' : 'off'} data-testid="soletracao-anuncio">
        {anunciar && palavra ? t('Soletrando {palavra}', { palavra }) : ''}
      </p>
    </div>
  );
}
