import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';

import { avatarDoPip } from '../../core/avatar/interprete';
import { TIER_DO_PIP } from '../../core/avatar/tiers';
import { useAvatarDoPip } from '../../lib/avatar/avatarDoPip';
import { janelaPorTemporizador } from '../../lib/avatar/janelaPorTemporizador';
import type { SessaoDeAvatar } from '../../lib/avatar/motor';
import type { LegendaEmVideo as Controlador } from '../../lib/legendas/legendaEmVideo';
import AvatarDaConversa, { useReceitaDoDono } from './AvatarDaConversa';
import { type SoletracaoEmCurso } from './useSoletracaoAtiva';
import { useSoletracaoAtiva } from './useSoletracaoAtiva';

const PalcoDaSoletracao = lazy(() => import('./PalcoDaSoletracao'));
const SEM_DECISAO = { tipo: 'desligada' } as const;

/** Parado, o avatar só repinta o quadro do vídeo a cada tantos quadros do motor (cada pintura gera um quadro de vídeo). */
const UM_A_CADA_PARADO = 4;

/**
 * A PONTE DO AVATAR PARA O PiP DE VÍDEO (Safari, sem Document PiP). O vídeo da janelinha é só o canvas 2D da legenda
 * (`lib/legendas/legendaEmVideo`); aqui o avatar vive num canvas WebGL OCULTO (fora da tela, mas no layout) e, a cada
 * quadro que o motor desenha, o `aoQuadro` o copia para o quadro do vídeo na MESMA tarefa. O laço de desenho é de
 * temporizador (15 quadros/s, tier fraco): o `requestAnimationFrame` para quando a aba está em segundo plano, e é
 * exatamente nesse caso que o PiP de vídeo é usado.
 */
export default function PonteDoAvatarNoVideo({ controlador, lado }: { controlador: Controlador; lado: number }) {
  const av = useAvatarDoPip();
  const { dono, estado } = avatarDoPip(av.estados);
  const janela = useMemo(() => janelaPorTemporizador(15), []);
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const sol = av.soletracao ?? null;
  const { ativa } = useSoletracaoAtiva(sol?.decisao ?? SEM_DECISAO, sol?.itemId ?? null);

  const aoSessao = useCallback(
    (s: SessaoDeAvatar | null) => {
      if (!s) {
        controlador.limparAvatar();
        return;
      }
      let n = 0;
      s.motor.definirAoQuadro((canvas) => {
        n += 1;
        if (estadoRef.current === 'parado' && n % UM_A_CADA_PARADO !== 0) return;
        controlador.pintarAvatar(canvas);
      });
    },
    [controlador],
  );
  useEffect(() => () => controlador.limparAvatar(), [controlador]);

  return (
    <div
      aria-hidden="true"
      data-testid="avatar-ponte-do-video"
      style={{ position: 'fixed', left: -10000, top: 0, width: lado, height: lado, pointerEvents: 'none' }}
    >
      {ativa && sol ? (
        <PalcoDoVideo ativa={ativa} camera={sol.camera} lado={lado} janela={janela} aoSessao={aoSessao} />
      ) : (
        <AvatarDaConversa
          dono={dono}
          estado={estado}
          fonteDaBoca={estado === 'falando' ? av.boca : null}
          tamanho={lado}
          tier={TIER_DO_PIP}
          anunciar={false}
          janela={janela}
          aoSessao={aoSessao}
        />
      )}
    </div>
  );
}

/** O avatar das mãos no canvas oculto: o quadro do vídeo copia só o canvas (o texto do quadro é desenhado à parte). */
function PalcoDoVideo({
  ativa,
  camera,
  lado,
  janela,
  aoSessao,
}: {
  ativa: SoletracaoEmCurso;
  camera: 'corpo' | 'maos';
  lado: number;
  janela: ReturnType<typeof janelaPorTemporizador>;
  aoSessao: (s: SessaoDeAvatar | null) => void;
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
        tier={TIER_DO_PIP}
        velocidade={ativa.velocidade}
        espelhar={ativa.espelhar}
        camera={camera}
        tamanho={lado}
        tetoMs={ativa.tetoMs}
        compacto
        janela={janela}
        aoSessao={aoSessao}
      />
    </Suspense>
  );
}
