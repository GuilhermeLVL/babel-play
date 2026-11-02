import { lazy, type ReactNode, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { avatarDoPip } from '../../core/avatar/interprete';
import { TIER_DO_PIP } from '../../core/avatar/tiers';
import { ladoDoAvatarNaJanela } from '../../core/legendas/janelaFlutuante';
import { FLAG_AVATAR_3D } from '../../core/planos';
import { useAvatarDoPip } from '../../lib/avatar/avatarDoPip';
import { useFlag } from '../../lib/flags';
import { fundoResolvido, lerAparencia } from '../views/captura/legendas/aparenciaDaLegenda';
import AvatarDaConversa from './AvatarDaConversa';
import { useReceitaDoDono } from './AvatarDaConversa';
import AvisosDaSoletracao from './AvisosDaSoletracao';
import { type SoletracaoEmCurso, useSoletracaoAtiva } from './useSoletracaoAtiva';

const PalcoDaSoletracao = lazy(() => import('./PalcoDaSoletracao'));

/** O fundo da faixa do avatar acompanha o fundo da legenda (o mesmo que o quadro do PiP de vídeo usa). */
const FUNDOS = { escuro: '#141210', preto: '#000000', claro: '#f6f1e8' } as const;

const SEM_DECISAO = { tipo: 'desligada' } as const;

/** Largura da janela a partir da qual o avatar fica AO LADO da legenda; abaixo, em cima dela. */
const LARGURA_PARA_FICAR_AO_LADO = 520;

/** O lado do círculo, pela regra pura de `core/legendas/janelaFlutuante` (testada sem DOM). */
export function ladoDoAvatarNoPip(largura: number, altura: number, aoLado: boolean): number {
  return ladoDoAvatarNaJanela({ largura, altura }, aoLado);
}

/**
 * O AVATAR NO DOCUMENT PiP. Envolve a legenda flutuante: sem a flag `avatar_3d` devolve só os filhos (a janela é a de
 * sempre); com ela, e com o Intérprete publicando avatares (`lib/avatar/avatarDoPip`), mostra UM avatar (o intérprete, com o
 * estado de maior atividade) ao lado da legenda, ou em cima dela numa janela estreita.
 *
 * O renderer é NOVO e vive DENTRO da janela do PiP (canvas criado no documento dela, `requestAnimationFrame` dela, tier
 * `fraco`, sem spring bones). Nada é movido entre documentos: o avatar da página continua lá, e ao fechar a janela a
 * sessão daqui é descartada (renderer, geometrias e contexto). O guarda de `webglcontextlost` é do próprio motor: o laço
 * pausa e, se o contexto não volta, o avatar cai na foto/iniciais.
 */
export default function ComAvatarNoPip({ janela, children }: { janela: Window | null; children: ReactNode }) {
  const ligada = useFlag(FLAG_AVATAR_3D);
  const av = useAvatarDoPip();
  const [largura, setLargura] = useState(() => janela?.innerWidth ?? LARGURA_PARA_FICAR_AO_LADO);
  const [altura, setAltura] = useState(() => janela?.innerHeight ?? 0);
  useEffect(() => {
    if (!janela) return;
    const medir = () => {
      setLargura(janela.innerWidth);
      setAltura(janela.innerHeight);
    };
    medir();
    janela.addEventListener('resize', medir);
    return () => janela.removeEventListener('resize', medir);
  }, [janela]);

  const sol = av.soletracao ?? null;
  const { ativa } = useSoletracaoAtiva(sol?.decisao ?? SEM_DECISAO, sol?.itemId ?? null);
  /* Os dois avisos fixos moram em cima da janela inteira; o círculo do avatar usa a altura que sobra. */
  const caixaDosAvisos = useRef<HTMLDivElement>(null);
  const [alturaDosAvisos, setAlturaDosAvisos] = useState(0);
  useLayoutEffect(() => {
    const el = caixaDosAvisos.current;
    setAlturaDosAvisos(sol && el ? el.offsetHeight : 0);
  }, [sol, largura, altura]);

  if (!ligada || !janela) return <>{children}</>;
  const aoLado = largura >= LARGURA_PARA_FICAR_AO_LADO;
  const { dono, estado } = avatarDoPip(av.estados);
  const lado = ladoDoAvatarNoPip(largura, Math.max(0, altura - alturaDosAvisos), aoLado);
  const janelaComAvatar = (
    <div
      data-pip-com-avatar={av.ativo ? '' : undefined}
      style={{
        display: 'flex',
        flexDirection: aoLado ? 'row' : 'column',
        width: '100%',
        ...(sol ? { flex: 1, minHeight: 0 } : { height: '100%' }),
      }}
    >
      {av.ativo && (
        <div
          data-testid="avatar-no-pip"
          data-dono={dono}
          data-soletrando={ativa ? '' : undefined}
          style={{
            flex: 'none',
            display: 'grid',
            placeItems: 'center',
            padding: 4,
            background:
              FUNDOS[fundoResolvido(lerAparencia().fundo, document.documentElement.classList.contains('dark'))],
          }}
        >
          {ativa && sol ? (
            <PalcoNoPip ativa={ativa} camera={sol.camera} tamanho={Math.max(64, lado - 30)} janela={janela} />
          ) : (
            <div style={{ borderRadius: '50%', overflow: 'hidden', lineHeight: 0 }}>
              <AvatarDaConversa
                dono={dono}
                estado={estado}
                fonteDaBoca={estado === 'falando' ? av.boca : null}
                tamanho={lado}
                tier={TIER_DO_PIP}
                anunciar={false}
                janela={janela}
              />
            </div>
          )}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>{children}</div>
    </div>
  );
  if (!sol) return janelaComAvatar;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <div ref={caixaDosAvisos} data-testid="avisos-da-soletracao-no-pip">
        <AvisosDaSoletracao compacto />
      </div>
      {janelaComAvatar}
    </div>
  );
}

/** O palco da soletração dentro do PiP. Separado para que a receita só seja lida quando há um nome a soletrar. */
function PalcoNoPip({
  ativa,
  camera,
  tamanho,
  janela,
}: {
  ativa: SoletracaoEmCurso;
  camera: 'corpo' | 'maos';
  tamanho: number;
  janela: Window;
}) {
  const receita = useReceitaDoDono('outro');
  if (!receita) return null;
  return (
    <div data-testid="soletracao-no-pip" style={{ lineHeight: 0 }}>
      <Suspense fallback={null}>
        <PalcoDaSoletracao
          key={ativa.id}
          texto={ativa.texto}
          alfabeto={ativa.alfabeto}
          receita={receita}
          tier={TIER_DO_PIP}
          velocidade={ativa.velocidade}
          espelhar={ativa.espelhar}
          camera={camera}
          tamanho={tamanho}
          tetoMs={ativa.tetoMs}
          compacto
          janela={janela}
        />
      </Suspense>
    </div>
  );
}
