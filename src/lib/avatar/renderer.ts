/**
 * O MOTOR DE DESENHO DO AVATAR: um renderer WebGL2 próprio (three), um laço de quadros que respeita a aba e o
 * movimento reduzido, e a limpeza completa.
 *
 * Esta é a ÚNICA porta de `three` no app além do carregador, e só é alcançada por `import()` (ver
 * `motor.ts`): o arranque do app não paga o chunk. Padrão do RELATORIO-P4 do protótipo:
 *  · guarda a extensão `WEBGL_lose_context` na criação (depois de perdido, `getExtension` devolve `null`);
 *  · `webglcontextlost` com `preventDefault` pausa o laço; `webglcontextrestored` retoma (o `three` refaz sozinho
 *    os recursos da GPU). Sem restauração em `prazoDeRestauracaoMs`, avisa `aoFalhar('contexto_perdido')` e a UI
 *    cai no 2D;
 *  · `dispose` desfaz TUDO: laço, listeners, geometrias, materiais, texturas, renderer e o contexto.
 *
 * Movimento reduzido: sem suavização e sem laço contínuo — desenha só quando algo muda (estado, emoção,
 * tamanho, restauração do contexto). EXCEÇÃO consciente (M3): enquanto o avatar FALA com uma fonte de boca
 * ligada, a boca é o próprio conteúdo da fala e desenha a no máximo 12 quadros/s, sem suavização; respiração,
 * piscar, olhar e balanço continuam desligados.
 *
 * Fala (M3): `definirBoca(fonte)` liga uma função `(agoraMs) => pose | null` lida a cada quadro (a ligação com o
 * motor de voz está em `fala.ts`); as vogais do VRM (aa, ih, ou, ee, oh) vencem a expressão de emoção (que cede
 * pela abertura da boca), e a emoção cai para a expressão vizinha quando o modelo não tem a pedida. A vida
 * ociosa (respiração, piscar, olhar, balanço) vem de `core/avatar/vida.ts`. Aba oculta: o laço pausa.
 */
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  type Object3D,
  PerspectiveCamera,
  Scene,
  type SkinnedMesh,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';

import {
  type ExpressaoDeVogal,
  EXPRESSOES_DE_VOGAL,
  pesosDaBoca,
  type PoseDaBoca,
  suavizar,
} from '../../core/avatar/boca';
import { cederABoca, expressaoDaEmocao, type ExpressaoEscolhida, EXPRESSOES_DE_EMOCAO } from '../../core/avatar/emocao';
import {
  caixaDoRostoPorCabeca,
  camerasAutomaticas,
  type CamerasDoModelo,
  FOV_PADRAO,
  type MedidasDoModelo,
  type ModoDeCamera,
} from '../../core/avatar/enquadramento';
import {
  ehEmocaoDoAvatar,
  ehEstadoDoAvatar,
  type EmocaoDoAvatar,
  type EstadoDoAvatar,
} from '../../core/avatar/estados';
import { ORCAMENTOS, type TierDoAvatar } from '../../core/avatar/tiers';
import { criarEstadoDaVida, passoDaVida } from '../../core/avatar/vida';
import type { AvatarCarregado } from './carregador';

/**
 * A caixa da CABEÇA medida nos vértices: os que a malha pesa (>= 50%) no osso da cabeça ou num filho dele (cabelo,
 * chifres, orelhas), já com a pose de repouso aplicada. Dá a largura e a altura reais da cabeça, em vez de uma
 * estimativa pela altura do osso. `null` sem malha com pesos (GLB sem esqueleto): quem chama usa a estimativa.
 */
function caixaDosVerticesDaCabeca(raiz: Object3D, osso: Object3D): Box3 | null {
  const caixa = new Box3();
  const v = new Vector3();
  const ehDaCabeca = new Map<Object3D, boolean>();
  const daCabeca = (b: Object3D): boolean => {
    let r = ehDaCabeca.get(b);
    if (r === undefined) {
      r = false;
      for (let p: Object3D | null = b; p; p = p.parent) {
        if (p === osso) {
          r = true;
          break;
        }
      }
      ehDaCabeca.set(b, r);
    }
    return r;
  };
  raiz.traverse((no) => {
    const m = no as SkinnedMesh;
    if (!m.isSkinnedMesh || !m.skeleton) return;
    m.skeleton.update();
    const idx = m.geometry.getAttribute('skinIndex');
    const peso = m.geometry.getAttribute('skinWeight');
    if (!idx || !peso) return;
    for (let i = 0; i < idx.count; i++) {
      let da = 0;
      for (let k = 0; k < 4; k++) {
        const osso_ = m.skeleton.bones[idx.getComponent(i, k)];
        if (osso_ && daCabeca(osso_)) da += peso.getComponent(i, k);
      }
      if (da < 0.5) continue;
      m.getVertexPosition(i, v);
      v.applyMatrix4(m.matrixWorld);
      caixa.expandByPoint(v);
    }
  });
  if (caixa.isEmpty() || caixa.max.y - caixa.min.y < 0.02) return null;
  return caixa;
}

export type MotivoDeFalha = 'webgl' | 'contexto_perdido';

/**
 * O MÍNIMO que o motor usa de uma janela: o relógio de quadros, o `devicePixelRatio` e o documento (visibilidade e
 * criação de elementos). Uma `Window` de verdade serve (o Document PiP); `janelaPorTemporizador` serve de janela de
 * mentira para quando a página está em segundo plano (a ponte do PiP de vídeo).
 */
export interface JanelaDoMotor {
  requestAnimationFrame(cb: FrameRequestCallback): number;
  cancelAnimationFrame(id: number): void;
  devicePixelRatio: number;
  document: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener' | 'createElement'>;
}

export interface OpcoesDoMotor {
  canvas: HTMLCanvasElement;
  tier: TierDoAvatar;
  movimentoReduzido?: boolean;
  aoFalhar?: (motivo: MotivoDeFalha) => void;
  prazoDeRestauracaoMs?: number;
  /**
   * A janela dona do canvas, quando NÃO é a página (o Document PiP): é dela o `requestAnimationFrame` (o da página pode
   * parar quando ela fica em segundo plano), o `devicePixelRatio` e o `visibilitychange`. Padrão: `window`.
   */
  janela?: JanelaDoMotor;
}

/** De onde o motor lê a boca a cada quadro: `null` = sem fala (boca fechada). */
export type FonteDaBoca = (agoraMs: number) => PoseDaBoca | null;

/** M4b: escreve nos ossos a cada quadro (depois da vida ociosa, antes de `humanoid.update()`). `dt` em segundos. */
export type GanchoDosOssos = (dt: number, agoraMs: number) => void;

/** Enquadramento próprio (ex.: só as mãos): ponto de mira no mundo e altura visível em metros. */
export interface EnquadramentoDoAvatar {
  alvo: { x: number; y: number; z: number };
  altura: number;
}

export interface CustoDosQuadros {
  quadros: number;
  mediaMs: number;
  p95Ms: number;
  maxMs: number;
}

export interface MotorDeAvatar {
  /**
   * Põe o avatar em cena. `enquadramento`: as câmeras calibradas do modelo (catálogo); sem elas (modelo trazido),
   * a câmera sai das medidas do próprio arquivo.
   */
  mostrar(avatar: AvatarCarregado, enquadramento?: CamerasDoModelo | null): void;
  /** `corpo` (inteiro, sem corte) ou `rosto` (busto, para a miniatura). Reenquadra na hora. */
  definirModo(modo: ModoDeCamera): void;
  /** Refaz o enquadramento (depois de mudar a escala do modelo). */
  reenquadrar(): void;
  /** Caixa do corpo e do rosto em posição neutra e escala 1 (metros), para calibrar a câmera. `null` sem avatar. */
  medirModelo(): MedidasDoModelo | null;
  /** Liga (ou desliga com `null`) a fonte da boca da fala. */
  definirBoca(fonte: FonteDaBoca | null): void;
  /**
   * Chamada logo depois de cada quadro desenhado, NA MESMA TAREFA (único momento em que um canvas WebGL sem
   * `preserveDrawingBuffer` ainda pode ser lido por `drawImage`). É a ponte do PiP de vídeo. `null` desliga.
   */
  definirAoQuadro(cb: ((canvas: HTMLCanvasElement) => void) | null): void;
  /**
   * Para medição: desenha `n` quadros em sequência (o laço fica parado) e devolve o custo por quadro em ms.
   * `sincronizarGpu: false` mede só a SUBMISSÃO de CPU (como o protótipo); `true` espera a GPU (`gl.finish`).
   */
  medirQuadros(n: number, opcoes?: { sincronizarGpu?: boolean }): CustoDosQuadros;
  /** M4b: liga (ou desliga com `null`) o gancho que escreve nos ossos (mãos que soletram). */
  definirGanchoDosOssos(gancho: GanchoDosOssos | null): void;
  /** Pede um quadro novo (com movimento reduzido o laço só desenha quando algo muda). */
  invalidar(): void;
  /** Enquadramento próprio; `null` volta ao busto. */
  definirEnquadramento(e: EnquadramentoDoAvatar | null): void;
  definirEstado(estado: EstadoDoAvatar): void;
  definirEmocao(emocao: EmocaoDoAvatar): void;
  redimensionar(largura: number, altura: number): void;
  /** Desenha um quadro agora e conta os pixels do canvas (total e não transparentes). Para teste e diagnóstico. */
  amostrarPixels(): { total: number; naoVazios: number };
  estatisticas(): {
    quadros: number;
    perdasDeContexto: number;
    pausado: boolean;
    perdido: boolean;
    /** O contexto foi criado com MSAA (conforme o tier). */
    antialias: boolean;
    pixelRatio: number;
  };
  /** Para teste e diagnóstico: força a perda e a restauração do contexto (`WEBGL_lose_context`). */
  simularPerdaDeContexto(): void;
  simularRestauracaoDeContexto(): void;
  dispose(): void;
}

/** Inclinação da cabeça (rad) por estado: pose simples, sem animação de clipe. */
const CABECA: Record<EstadoDoAvatar, { x: number; z: number }> = {
  parado: { x: 0, z: 0 },
  ouvindo: { x: 0.04, z: 0.1 },
  pensando: { x: -0.1, z: -0.12 },
  falando: { x: 0, z: 0 },
};

export function criarMotor(opcoes: OpcoesDoMotor): MotorDeAvatar {
  const { canvas, tier } = opcoes;
  const jan: JanelaDoMotor = opcoes.janela ?? window;
  const doc = jan.document;
  const orc = ORCAMENTOS[tier];
  const reduzido = opcoes.movimentoReduzido === true;
  const prazo = opcoes.prazoDeRestauracaoMs ?? 3000;

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: tier !== 'fraco',
      powerPreference: tier === 'fraco' ? 'low-power' : 'default',
    });
  } catch {
    opcoes.aoFalhar?.('webgl');
    throw new Error('webgl indisponível');
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(
    Math.min(typeof jan.devicePixelRatio === 'number' ? jan.devicePixelRatio : 1, orc.pixelRatioMax),
  );

  /**
   * Pixel ratio: o fraco nunca passa do dispositivo (teto 1). Forte e médio desenham SUPERAMOSTRADOS (no teto do
   * tier, mesmo em tela 1x) quando o quadro é pequeno (<= 480 px, custo desprezível): junto do MSAA, tira o
   * serrilhado das bordas. Quadro grande: o do aparelho, até o teto.
   */
  const razaoDoPixel = (lado: number) => {
    const aparelho = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
    if (tier === 'fraco' || lado > 480) return Math.min(aparelho, orc.pixelRatioMax);
    return orc.pixelRatioMax;
  };

  const gl = renderer.getContext();
  const perdaDeContexto = gl.getExtension('WEBGL_lose_context');

  const cena = new Scene();
  cena.add(new AmbientLight(0xffffff, 1.2));
  const sol = new DirectionalLight(0xffffff, 1.6);
  sol.position.set(0.8, 1.2, 2);
  cena.add(sol);
  const camera = new PerspectiveCamera(24, 1, 0.05, 50);

  let atual: AvatarCarregado | null = null;
  let estado: EstadoDoAvatar = 'parado';
  const pesoDaEmocao = new Map<string, number>();
  let emocaoAlvo: EmocaoDoAvatar = 'neutro';
  const cabeca = { x: 0, z: 0 };
  // M3: fala e vida.
  let fonteDaBoca: FonteDaBoca | null = null;
  // M4b: mãos que soletram.
  let ganchoDosOssos: GanchoDosOssos | null = null;
  let enquadramentoProprio: EnquadramentoDoAvatar | null = null;
  const pesoDaVogal: Record<ExpressaoDeVogal, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  let aberturaSuave = 0;
  let disponiveis = new Set<string>();
  let expressaoDaEmocaoAtual: ExpressaoEscolhida = expressaoDaEmocao('neutro', disponiveis);
  let temBlink = false;
  const vida = criarEstadoDaVida();
  const configDaVida = { tier, movimentoReduzido: reduzido };

  let disposed = false;
  let perdido = false;
  let quadros = 0;
  let perdas = 0;
  let raf = 0;
  let ultimo = 0;
  let sujo = true;
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  let enquadramento: CamerasDoModelo | null = null;
  let modo: ModoDeCamera = 'corpo';
  const antialias = renderer.getContext().getContextAttributes()?.antialias === true;

  /** Caixa do corpo e do rosto com o modelo na escala 1 (a escala da receita não entra na medida). */
  const medir = (): MedidasDoModelo | null => {
    if (!atual) return null;
    const o = atual.objeto;
    const escala = o.scale.clone();
    o.scale.set(1, 1, 1);
    o.updateMatrixWorld(true);
    const caixa = new Box3().setFromObject(o);
    const osso = atual.vrm?.humanoid?.getRawBoneNode('head');
    let alturaDaCabeca = caixa.max.y - (caixa.max.y - caixa.min.y) * 0.15;
    if (osso) alturaDaCabeca = osso.getWorldPosition(new Vector3()).y;
    const olhoE = atual.vrm?.humanoid?.getRawBoneNode('leftEye');
    const olhoD = atual.vrm?.humanoid?.getRawBoneNode('rightEye');
    const pe = olhoE?.getWorldPosition(new Vector3());
    const pd = olhoD?.getWorldPosition(new Vector3());
    const cabecaMedida = osso ? caixaDosVerticesDaCabeca(o, osso) : null;
    o.scale.copy(escala);
    o.updateMatrixWorld(true);
    const arred = (v: number) => Math.round(v * 1000) / 1000;
    const c = {
      min: [arred(caixa.min.x), arred(caixa.min.y), arred(caixa.min.z)] as const,
      max: [arred(caixa.max.x), arred(caixa.max.y), arred(caixa.max.z)] as const,
    };
    const rosto = {
      cabecaY: arred(alturaDaCabeca),
      ...(pe && pd
        ? { olhoY: arred((pe.y + pd.y) / 2), olhoX: arred(Math.abs(pe.x - pd.x) / 2), olhoZ: arred((pe.z + pd.z) / 2) }
        : {}),
    };
    const caixaDoRosto = cabecaMedida
      ? {
          min: [arred(cabecaMedida.min.x), arred(cabecaMedida.min.y), arred(cabecaMedida.min.z)] as const,
          max: [arred(cabecaMedida.max.x), arred(cabecaMedida.max.y), arred(cabecaMedida.max.z)] as const,
        }
      : caixaDoRostoPorCabeca(c, alturaDaCabeca);
    return { caixa: c, caixaDoRosto, rosto };
  };

  const enquadrar = () => {
    if (!atual) return;
    if (enquadramentoProprio) {
      const { alvo, altura } = enquadramentoProprio;
      const d = altura / 2 / Math.tan((camera.fov * Math.PI) / 360) / Math.min(1, camera.aspect);
      camera.position.set(alvo.x, alvo.y, alvo.z + d);
      camera.lookAt(alvo.x, alvo.y, alvo.z);
      camera.updateProjectionMatrix();
      return;
    }
    const e = atual.objeto.scale;
    let cam;
    let ajusteDeAspecto = 1;
    if (enquadramento) {
      cam = enquadramento[modo];
      // As câmeras do catálogo são calibradas para um quadro quadrado: num quadro mais estreito, afasta.
      ajusteDeAspecto = 1 / Math.min(1, camera.aspect);
    } else {
      const medidas = medir();
      if (!medidas) return;
      cam = camerasAutomaticas(medidas, camera.aspect)[modo];
    }
    const k = Math.max(e.x, e.y, e.z, 0.01);
    const alvo = { x: cam.alvo[0] * e.x, y: cam.alvo[1] * e.y, z: cam.alvo[2] * e.z };
    camera.fov = cam.fov ?? FOV_PADRAO;
    camera.position.set(alvo.x, alvo.y, alvo.z + cam.distancia * k * ajusteDeAspecto);
    camera.lookAt(alvo.x, alvo.y, alvo.z);
    camera.updateProjectionMatrix();
  };

  const aplicarPose = (dt: number) => {
    const vrm = atual?.vrm;
    if (!vrm) {
      // GLB puro: sem expressões nem vida; só as mãos que soletram (se ligadas)
      ganchoDosOssos?.(dt, performance.now());
      return;
    }
    const k = reduzido ? 1 : 1 - Math.exp(-dt * 8);
    const alvo = CABECA[estado];
    cabeca.x += (alvo.x - cabeca.x) * k;
    cabeca.z += (alvo.z - cabeca.z) * k;
    const osso = vrm.humanoid?.getNormalizedBoneNode('head');
    if (osso) {
      osso.rotation.x = cabeca.x;
      osso.rotation.z = cabeca.z;
    }
    const gerente = vrm.expressionManager;
    const falando = estado === 'falando';

    // Boca: a pose do quadro (só falando) vira peso das vogais. Movimento reduzido: sem suavização.
    const pose = falando && fonteDaBoca ? fonteDaBoca(performance.now()) : null;
    const alvoDaBoca = pesosDaBoca(pose ?? { vogal: 'F', abertura: 0, acabou: true }, tier === 'fraco');
    let abertura = 0;
    for (const nome of EXPRESSOES_DE_VOGAL) {
      const w = reduzido ? alvoDaBoca[nome] : suavizar(pesoDaVogal[nome], alvoDaBoca[nome], dt * 1000);
      pesoDaVogal[nome] = w;
      if (w > abertura) abertura = w;
      if (gerente && disponiveis.has(nome)) gerente.setValue(nome, w);
    }
    aberturaSuave = abertura;

    // Emoção: a vogal vence (cede pela abertura), e a intensidade nunca passa do limite de `emocao.ts`.
    if (gerente) {
      const ceder = cederABoca(aberturaSuave);
      for (const nome of EXPRESSOES_DE_EMOCAO) {
        if (!disponiveis.has(nome)) continue;
        const alvoPeso = nome === expressaoDaEmocaoAtual.nome ? expressaoDaEmocaoAtual.intensidade * ceder : 0;
        const w = pesoDaEmocao.get(nome) ?? 0;
        const novo = w + (alvoPeso - w) * k;
        pesoDaEmocao.set(nome, novo);
        gerente.setValue(nome, novo);
      }
    }

    // Vida ociosa (nada com movimento reduzido; tier fraco sem olhar nem balanço).
    const v = passoDaVida(vida, dt * 1000, configDaVida, estado);
    if (!reduzido) {
      const tronco = vrm.humanoid?.getNormalizedBoneNode('spine');
      if (tronco) {
        tronco.rotation.x = v.respiracao;
        tronco.rotation.z = v.balanco;
      }
      if (gerente && temBlink) gerente.setValue('blink', v.piscar);
      if (tier !== 'fraco' && vrm.lookAt) {
        vrm.lookAt.yaw = v.olhar.yaw;
        vrm.lookAt.pitch = v.olhar.pitch;
      }
    }
    ganchoDosOssos?.(dt, performance.now());
    if (orc.molas) vrm.update(dt);
    else {
      vrm.humanoid?.update();
      vrm.expressionManager?.update();
      vrm.nodeConstraintManager?.update();
    }
  };

  let aoQuadro: ((c: HTMLCanvasElement) => void) | null = null;
  const desenhar = (dt: number) => {
    aplicarPose(dt);
    renderer.render(cena, camera);
    quadros += 1;
    aoQuadro?.(canvas);
  };

  const quadro = (agora: number) => {
    raf = jan.requestAnimationFrame(quadro);
    // Reduzido + falando com boca ligada: a boca é o conteúdo, a 12 quadros/s e sem suavização.
    const falandoReduzido = reduzido && estado === 'falando' && fonteDaBoca !== null;
    const passo = falandoReduzido ? 1000 / 12 : 1000 / orc.fps;
    if (ultimo && agora - ultimo < passo - 2) return;
    const dt = ultimo ? Math.min((agora - ultimo) / 1000, 0.1) : 1 / orc.fps;
    ultimo = agora;
    if (reduzido && !sujo && !falandoReduzido) return;
    sujo = false;
    desenhar(dt);
  };

  /** Descobre o que o modelo atual tem (as vogais, as emoções, o `blink`) e resolve a expressão da emoção. */
  const inventariar = () => {
    const g = atual?.vrm?.expressionManager;
    disponiveis = new Set<string>();
    if (g) {
      for (const nome of [...EXPRESSOES_DE_EMOCAO, ...EXPRESSOES_DE_VOGAL, 'blink']) {
        if (g.getExpression(nome)) disponiveis.add(nome);
      }
    }
    // Sem a expressão `blink` o modelo simplesmente não pisca (documentado em design.md; sem plano B por osso).
    temBlink = disponiveis.has('blink');
    expressaoDaEmocaoAtual = expressaoDaEmocao(emocaoAlvo, disponiveis);
  };

  const parar = () => {
    if (raf) jan.cancelAnimationFrame(raf);
    raf = 0;
    ultimo = 0;
  };
  const retomar = () => {
    if (disposed || perdido || raf || doc.hidden) return;
    sujo = true;
    raf = jan.requestAnimationFrame(quadro);
  };

  const aoMudarVisibilidade = () => (doc.hidden ? parar() : retomar());
  const aoPerder = (e: Event) => {
    e.preventDefault();
    perdido = true;
    perdas += 1;
    parar();
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      if (perdido && !disposed) opcoes.aoFalhar?.('contexto_perdido');
    }, prazo);
  };
  const aoRestaurar = () => {
    clearTimeout(temporizador);
    perdido = false;
    sujo = true;
    retomar();
  };
  canvas.addEventListener('webglcontextlost', aoPerder);
  canvas.addEventListener('webglcontextrestored', aoRestaurar);
  doc.addEventListener('visibilitychange', aoMudarVisibilidade);

  const motor: MotorDeAvatar = {
    mostrar(avatar, cameras) {
      if (disposed) {
        avatar.dispose();
        return;
      }
      if (atual) {
        cena.remove(atual.objeto);
        atual.dispose();
      }
      atual = avatar;
      enquadramento = cameras ?? null;
      pesoDaEmocao.clear();
      for (const nome of EXPRESSOES_DE_VOGAL) pesoDaVogal[nome] = 0;
      inventariar();
      cena.add(avatar.objeto);
      enquadrar();
      sujo = true;
      retomar();
    },
    definirModo(m) {
      modo = m;
      enquadrar();
      sujo = true;
    },
    reenquadrar() {
      enquadrar();
      sujo = true;
    },
    medirModelo: medir,
    definirEstado(e) {
      if (!ehEstadoDoAvatar(e)) return;
      estado = e;
      sujo = true;
    },
    definirEmocao(e) {
      if (!ehEmocaoDoAvatar(e)) return;
      emocaoAlvo = e;
      expressaoDaEmocaoAtual = expressaoDaEmocao(e, disponiveis);
      sujo = true;
    },
    definirBoca(fonte) {
      fonteDaBoca = fonte;
      sujo = true;
    },
    definirAoQuadro(cb) {
      aoQuadro = cb;
      sujo = true;
    },
    definirGanchoDosOssos(gancho) {
      ganchoDosOssos = gancho;
      sujo = true;
    },
    invalidar() {
      sujo = true;
    },
    definirEnquadramento(e) {
      enquadramentoProprio = e;
      enquadrar();
      sujo = true;
    },
    medirQuadros(n, opc) {
      const total = Math.max(1, Math.floor(n));
      const eraPausado = raf === 0;
      parar();
      const tempos: number[] = [];
      for (let i = 0; i < total; i += 1) {
        const ini = performance.now();
        desenhar(1 / orc.fps);
        if (opc?.sincronizarGpu) gl.finish();
        tempos.push(performance.now() - ini);
      }
      if (!eraPausado) retomar();
      const ordenados = [...tempos].sort((x, y) => x - y);
      const media = tempos.reduce((acc, x) => acc + x, 0) / total;
      return {
        quadros: total,
        mediaMs: media,
        p95Ms: ordenados[Math.min(total - 1, Math.floor(total * 0.95))],
        maxMs: ordenados[total - 1],
      };
    },
    redimensionar(largura, altura) {
      const l = Math.max(1, Math.floor(largura));
      const a = Math.max(1, Math.floor(altura));
      renderer.setPixelRatio(razaoDoPixel(Math.max(l, a)));
      renderer.setSize(l, a, false);
      camera.aspect = l / a;
      enquadrar();
      sujo = true;
    },
    amostrarPixels() {
      if (disposed || perdido) return { total: 0, naoVazios: 0 };
      desenhar(1 / orc.fps);
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let naoVazios = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 0) naoVazios += 1;
      return { total: w * h, naoVazios };
    },
    estatisticas: () => ({
      quadros,
      perdasDeContexto: perdas,
      pausado: raf === 0,
      perdido,
      antialias,
      pixelRatio: renderer.getPixelRatio(),
    }),
    simularPerdaDeContexto: () => perdaDeContexto?.loseContext(),
    simularRestauracaoDeContexto: () => perdaDeContexto?.restoreContext(),
    dispose() {
      if (disposed) return;
      disposed = true;
      parar();
      clearTimeout(temporizador);
      canvas.removeEventListener('webglcontextlost', aoPerder);
      canvas.removeEventListener('webglcontextrestored', aoRestaurar);
      doc.removeEventListener('visibilitychange', aoMudarVisibilidade);
      if (atual) {
        cena.remove(atual.objeto);
        atual.dispose();
        atual = null;
      }
      cena.clear();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  return motor;
}
