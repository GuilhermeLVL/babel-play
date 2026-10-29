import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

import type { SuporteDaPaleta } from '../../core/avatar/aparencia';
import type { CamerasDoModelo, ModoDeCamera } from '../../core/avatar/enquadramento';
import type { EmocaoDoAvatar, EstadoDoAvatar } from '../../core/avatar/estados';
import type { ReceitaDeAvatar } from '../../core/avatar/receita';
import type { TierDoAvatar } from '../../core/avatar/tiers';
import { modeloDaColecao } from '../../data/avatar/colecao';
import { aplicarAparencia, type AvatarAplicavel } from '../../lib/avatar/aparencia';
import { temWebGL2 } from '../../lib/avatar/detectarTier';
import { descritorDoFallback, type MotivoDoFallback } from '../../lib/avatar/fallback2d';
import { fonteDaReceita } from '../../lib/avatar/fontes';
import { capturarMiniatura } from '../../lib/avatar/miniatura';
import type { SessaoDeAvatar } from '../../lib/avatar/motor';
import type { RelatorioDePecas } from '../../lib/avatar/pecas3d';
import { aplicarPecasNaSessao, liberarPecasDaSessao, type PecasDoAvatar } from '../../lib/avatar/pecasNaSessao';
import type { FonteDaBoca, JanelaDoMotor } from '../../lib/avatar/renderer';
import { useFotoDoPerfil } from '../../lib/fotoDoPerfil';
import { t } from '../../lib/i18n';
import { movimentoReduzido } from '../../lib/movimento/reduzido';

export interface AvatarCanvasProps {
  receita: ReceitaDeAvatar;
  estado: EstadoDoAvatar;
  emocao: EmocaoDoAvatar;
  tier: TierDoAvatar;
  /** Lado do quadrado, em pixels. */
  tamanho: number;
  /** Chamado uma vez por falha (sem WebGL2, erro de carga, contexto perdido). O fallback 2D já aparece sozinho. */
  aoErro?: (motivo: MotivoDoFallback) => void;
  /** Substitui a fonte da receita (a coleção de teste e o harness usam). */
  fonte?: string | Blob;
  /** Quem é a pessoa, para a foto do fallback (`babel.fotoDoPerfil.<id>`). */
  usuarioId?: string | null;
  /** Depois de o modelo carregar, avisa quais controles da paleta ELE permite (pele, cabelo, olhos). */
  aoAparencia?: (suporte: SuporteDaPaleta) => void;
  /** Entrega (ou retira, com `null`) a função que captura a miniatura de 192 px do quadro atual. */
  aoPronto?: (capturar: (() => string | null) | null) => void;
  /** De onde a boca lê a pose a cada quadro (`LigacaoDaFala.pose`); `null`/ausente = boca parada. */
  fonteDaBoca?: FonteDaBoca | null;
  /** `corpo` (inteiro, o padrão) ou `rosto` (busto). Troca sem reabrir o modelo. */
  modo?: ModoDeCamera;
  /**
   * As câmeras do modelo. Ausente: as do catálogo quando a base é da coleção e a `fonte` não foi substituída;
   * senão, o motor calcula pelas medidas do arquivo (modelo trazido pela pessoa).
   */
  enquadramento?: CamerasDoModelo | null;
  /** Entrega a sessão aberta (ou `null` ao fechar): diagnóstico e medição. Não é para a tela do produto. */
  aoSessao?: (sessao: SessaoDeAvatar | null) => void;
  /**
   * A janela onde o canvas vive, quando não é a página (o Document PiP): o canvas nasce no documento DELA, o laço de
   * desenho usa o `requestAnimationFrame` DELA e o contexto é próprio (nada é movido entre documentos).
   */
  janela?: JanelaDoMotor;
  /** M6: peças do Estúdio (ids na ordem e cores). Sem a prop nada é carregado. */
  pecas?: PecasDoAvatar;
  /** M6: o que foi montado e o que foi cortado (tier, osso que falta). */
  aoPecas?: (relatorio: RelatorioDePecas) => void;
}

const ROTULO: Record<EstadoDoAvatar, () => string> = {
  parado: () => t('Avatar em repouso'),
  ouvindo: () => t('Avatar ouvindo'),
  pensando: () => t('Avatar pensando'),
  falando: () => t('Avatar falando'),
};

/**
 * O AVATAR 3D, com o motor (three + three-vrm) carregado por `import()` só quando o componente monta: o
 * arranque do app não paga o chunk. Enquanto carrega, e em qualquer falha, mostra o fallback 2D (foto do
 * perfil ou iniciais). Não recebe foco e não tem controle: é só imagem, descrita por `aria-label`. O avatar
 * nunca é o único caminho para o conteúdo (a legenda em texto continua sendo a fonte).
 */
export default function AvatarCanvas({
  receita,
  estado,
  emocao,
  tier,
  tamanho,
  aoErro,
  fonte,
  usuarioId,
  aoAparencia,
  aoPronto,
  fonteDaBoca,
  aoSessao,
  modo = 'corpo',
  enquadramento,
  janela,
  pecas,
  aoPecas,
}: AvatarCanvasProps) {
  const palco = useRef<HTMLDivElement>(null);
  const sessao = useRef<SessaoDeAvatar | null>(null);
  const canvasAtual = useRef<HTMLCanvasElement | null>(null);
  const aoErroRef = useRef(aoErro);
  aoErroRef.current = aoErro;
  const aoAparenciaRef = useRef(aoAparencia);
  aoAparenciaRef.current = aoAparencia;
  const aoProntoRef = useRef(aoPronto);
  aoProntoRef.current = aoPronto;
  const [motivo, setMotivo] = useState<MotivoDoFallback | null>('carregando');
  const foto = useFotoDoPerfil(usuarioId);

  // Estado e emoção entram no motor já aberto sem reabrir nada.
  const camerasDoCatalogo =
    enquadramento !== undefined
      ? enquadramento
      : fonte === undefined && receita.base.origem === 'colecao'
        ? (modeloDaColecao(receita.base.id)?.camera ?? null)
        : null;
  const vivo = useRef({ estado, emocao, fonteDaBoca: fonteDaBoca ?? null, modo, cameras: camerasDoCatalogo });
  vivo.current = { estado, emocao, fonteDaBoca: fonteDaBoca ?? null, modo, cameras: camerasDoCatalogo };
  const aoSessaoRef = useRef(aoSessao);
  aoSessaoRef.current = aoSessao;
  useEffect(() => sessao.current?.motor.definirBoca(fonteDaBoca ?? null), [fonteDaBoca]);
  useEffect(() => sessao.current?.motor.definirEstado(estado), [estado]);
  useEffect(() => sessao.current?.motor.definirEmocao(emocao), [emocao]);
  // `data-camera-pronta` = o modo de câmera que o motor JÁ aplicou (os testes esperam por ele, em vez de por tempo).
  const [cameraPronta, setCameraPronta] = useState<ModoDeCamera | null>(null);
  useEffect(() => {
    const s = sessao.current;
    if (!s) return;
    s.motor.definirModo(modo);
    setCameraPronta(modo);
  }, [modo]);

  const chaveDaFonte = fonte instanceof Blob ? fonte : (fonte ?? `${receita.base.origem}/${receita.base.id}`);
  useEffect(() => {
    const host = palco.current;
    if (!host) return;
    const controle = new AbortController();
    let fechado = false;
    const falhar = (m: MotivoDoFallback) => {
      if (fechado) return;
      setMotivo(m);
      aoErroRef.current?.(m);
    };
    setMotivo('carregando');

    if (!temWebGL2()) {
      falhar('sem_webgl2');
      return;
    }
    // Canvas NOVO por sessão: um canvas cujo contexto foi perdido de propósito (`dispose`) não serve de novo.
    const canvas = (janela?.document ?? document).createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    host.appendChild(canvas);

    (async () => {
      const origem = fonte ?? (await fonteDaReceita(receita));
      if (!origem) return falhar('sem_modelo');
      const { abrirSessaoDeAvatar } = await import('../../lib/avatar/motor');
      if (fechado) return;
      const s = await abrirSessaoDeAvatar({
        canvas,
        fonte: origem,
        tier,
        sinalDeAborto: controle.signal,
        movimentoReduzido: movimentoReduzido(),
        largura: tamanho,
        altura: tamanho,
        estado: vivo.current.estado,
        emocao: vivo.current.emocao,
        enquadramento: vivo.current.cameras,
        modo: vivo.current.modo,
        aoFalhar: () => falhar('contexto_perdido'),
        ...(janela ? { janela } : {}),
      });
      if (fechado) {
        s.dispose();
        return;
      }
      sessao.current = s;
      canvasAtual.current = canvas;
      s.motor.definirBoca(vivo.current.fonteDaBoca);
      aoSessaoRef.current?.(s);
      setCameraPronta(vivo.current.modo);
      setMotivo(null);
    })().catch((e) => {
      if (controle.signal.aborted) return;
      falhar(e instanceof Error && e.message === 'webgl indisponível' ? 'sem_webgl2' : 'erro_de_carga');
    });

    return () => {
      fechado = true;
      controle.abort();
      if (sessao.current) aoSessaoRef.current?.(null);
      liberarPecasDaSessao(sessao.current);
      sessao.current?.dispose();
      sessao.current = null;
      canvas.remove();
    };
    // `receita`/`fonte` entram pela chave; o tamanho é tratado no efeito abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaFonte, tier]);

  useEffect(() => sessao.current?.motor.redimensionar(tamanho, tamanho), [tamanho]);

  // M6: peças do Estúdio entram na sessão aberta (carregadas por import() só se houver peça).
  const aoPecasRef = useRef(aoPecas);
  aoPecasRef.current = aoPecas;
  const chaveDasPecas = JSON.stringify(pecas ?? null);
  useEffect(
    () =>
      aplicarPecasNaSessao(
        motivo ? null : sessao.current,
        pecas,
        tier,
        () => sessao.current?.motor.definirEstado(vivo.current.estado),
        (r) => aoPecasRef.current?.(r),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [motivo, chaveDasPecas, tier],
  );

  // Paleta e ajustes da receita entram no modelo JÁ aberto, sem reabrir a sessão (prévia imediata).
  useEffect(() => {
    const s = sessao.current;
    if (!s || motivo) return;
    aoAparenciaRef.current?.(aplicarAparencia(s.avatar as unknown as AvatarAplicavel, receita));
    // A escala da receita muda o tamanho do corpo: reenquadra (e pede quadro novo, mesmo com movimento reduzido).
    s.motor.reenquadrar();
    s.motor.definirEstado(vivo.current.estado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motivo, receita.paleta, receita.ajustes]);

  useEffect(() => {
    const s = sessao.current;
    const c = canvasAtual.current;
    if (motivo || !s || !c) {
      aoProntoRef.current?.(null);
      return;
    }
    aoProntoRef.current?.(() => {
      // A miniatura é sempre o ROSTO (busto), qualquer que seja o modo da prévia; depois a câmera volta.
      s.motor.definirModo('rosto');
      s.motor.amostrarPixels(); // desenha um quadro agora; o canvas WebGL só é legível na mesma tarefa
      const url = capturarMiniatura(c);
      s.motor.definirModo(vivo.current.modo);
      return url;
    });
    return () => aoProntoRef.current?.(null);
  }, [motivo]);

  const fallback = useMemo(
    () => (motivo ? descritorDoFallback({ usuario: usuarioId, nome: receita.meta.nome, motivo }) : null),
    // `foto` muda quando a pessoa troca a foto do perfil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [motivo, usuarioId, receita.meta.nome, foto],
  );

  const caixa: CSSProperties = { position: 'relative', width: tamanho, height: tamanho, overflow: 'hidden' };
  return (
    <div
      role="img"
      aria-label={ROTULO[estado]()}
      style={caixa}
      data-avatar-estado={estado}
      data-avatar-pronto={!motivo}
      data-camera-pronta={cameraPronta ?? undefined}
    >
      <div
        ref={palco}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, visibility: motivo ? 'hidden' : 'visible' }}
      />
      {fallback && (
        <div
          aria-hidden="true"
          data-avatar-fallback={fallback.motivo}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: '50%',
            background: 'rgba(127,127,127,0.18)',
            fontWeight: 700,
            fontSize: Math.max(12, tamanho * 0.36),
            userSelect: 'none',
          }}
        >
          {fallback.tipo === 'foto' ? (
            <img
              src={fallback.src}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
            />
          ) : (
            fallback.texto
          )}
        </div>
      )}
    </div>
  );
}
