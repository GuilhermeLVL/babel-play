import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

import type { SuporteDaPaleta } from '../../core/avatar/aparencia';
import type { EmocaoDoAvatar, EstadoDoAvatar } from '../../core/avatar/estados';
import type { ReceitaDeAvatar } from '../../core/avatar/receita';
import type { TierDoAvatar } from '../../core/avatar/tiers';
import { aplicarAparencia, type AvatarAplicavel } from '../../lib/avatar/aparencia';
import { temWebGL2 } from '../../lib/avatar/detectarTier';
import { descritorDoFallback, type MotivoDoFallback } from '../../lib/avatar/fallback2d';
import { fonteDaReceita } from '../../lib/avatar/fontes';
import { capturarMiniatura } from '../../lib/avatar/miniatura';
import type { SessaoDeAvatar } from '../../lib/avatar/motor';
import type { FonteDaBoca } from '../../lib/avatar/renderer';
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
  /** Entrega a sessão aberta (ou `null` ao fechar): diagnóstico e medição. Não é para a tela do produto. */
  aoSessao?: (sessao: SessaoDeAvatar | null) => void;
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
  const vivo = useRef({ estado, emocao, fonteDaBoca: fonteDaBoca ?? null });
  vivo.current = { estado, emocao, fonteDaBoca: fonteDaBoca ?? null };
  const aoSessaoRef = useRef(aoSessao);
  aoSessaoRef.current = aoSessao;
  useEffect(() => sessao.current?.motor.definirBoca(fonteDaBoca ?? null), [fonteDaBoca]);
  useEffect(() => sessao.current?.motor.definirEstado(estado), [estado]);
  useEffect(() => sessao.current?.motor.definirEmocao(emocao), [emocao]);

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
    const canvas = document.createElement('canvas');
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
        aoFalhar: () => falhar('contexto_perdido'),
      });
      if (fechado) {
        s.dispose();
        return;
      }
      sessao.current = s;
      canvasAtual.current = canvas;
      s.motor.definirBoca(vivo.current.fonteDaBoca);
      aoSessaoRef.current?.(s);
      setMotivo(null);
    })().catch((e) => {
      if (controle.signal.aborted) return;
      falhar(e instanceof Error && e.message === 'webgl indisponível' ? 'sem_webgl2' : 'erro_de_carga');
    });

    return () => {
      fechado = true;
      controle.abort();
      if (sessao.current) aoSessaoRef.current?.(null);
      sessao.current?.dispose();
      sessao.current = null;
      canvas.remove();
    };
    // `receita`/`fonte` entram pela chave; o tamanho é tratado no efeito abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaFonte, tier]);

  useEffect(() => sessao.current?.motor.redimensionar(tamanho, tamanho), [tamanho]);

  // Paleta e ajustes da receita entram no modelo JÁ aberto, sem reabrir a sessão (prévia imediata).
  useEffect(() => {
    const s = sessao.current;
    if (!s || motivo) return;
    aoAparenciaRef.current?.(aplicarAparencia(s.avatar as unknown as AvatarAplicavel, receita));
    // Pede um quadro novo mesmo com movimento reduzido (o laço só redesenha quando algo muda).
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
      s.motor.amostrarPixels(); // desenha um quadro agora; o canvas WebGL só é legível na mesma tarefa
      return capturarMiniatura(c);
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
