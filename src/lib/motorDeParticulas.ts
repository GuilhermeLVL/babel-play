/**
 * O MOTOR DAS PARTÍCULAS — simulação e desenho do `ParticleCanvas`, sem DOM.
 *
 * ─── POR QUE ISTO SAIU DO COMPONENTE (auditoria de performance do frontend, 26/09/2026) ───
 *
 * O laço do ambiente roda a 60 quadros por segundo em TODA tela, e cada quadro redesenhado num
 * `<canvas>` da página custa duas vezes na thread principal: o `requestAnimationFrame` que desenha e o
 * "Commit" que entrega a camada ao compositor. Medido com `scripts/perf/telas/trace-tela.mjs` num
 * celular médio (CPU 4×), com a tela PARADA: 3,8–4,2 ms de rAF + 4,9–6,9 ms de Commit por quadro —
 * mais da metade do orçamento de 16,7 ms gasto num enfeite, e a tela de Jogar caía para 24 FPS e
 * respondia um toque em 760 ms (INP).
 *
 * Com o canvas transferido para um Worker (`OffscreenCanvas`), o desenho e a entrega da camada
 * acontecem FORA da thread principal: ela fica livre para responder ao toque. O desenho é o MESMO —
 * este arquivo é o corpo que estava em `ParticleCanvas.tsx`, movido sem mudar conta nenhuma — e roda
 * nos dois lugares: no Worker (`particulas.worker.ts`) e, onde o navegador não tem `OffscreenCanvas`,
 * na própria página, como antes.
 *
 * Tudo o que depende do DOM (cor lida do token do tema, skin e fonte no `<html>`, croma no
 * localStorage, intensidade da loja, retângulo do canvas) continua sendo resolvido na
 * página, no instante do pedido, e chega aqui já pronto na mensagem.
 */
import type { BurstSpec, FormaParticula, ResolvedParticleStyle } from './effects';

interface P {
  x: number; y: number; vx: number; vy: number;
  size: number; alpha: number; alphaDir: number;
  phase: number;
  /** Recém-nascida: não paga a vida do intervalo em que ainda não existia (ver `quadro`). */
  nova?: boolean;
  /**
   * Rajada: milissegundos restantes. `null` = partícula ambiente (não morre).
   *
   * É TEMPO e não contagem de quadros de propósito. Com quadros, uma rajada de 700ms viraria
   * 2,1s num PC a 20fps — e PCs modestos são justamente o público do Modo Desempenho. Medi isto
   * na prática: com a aba em segundo plano (RAF a ~2fps) a rajada durava mais de 15 segundos.
   */
  life: number | null;
  maxLife: number;
  color: string;
  /** Forma do desenho — ver o switch em `quadro`. */
  forma?: FormaParticula;
  /** Caractere para a forma 'emoji'. */
  emoji?: string;
  /** Rotação e velocidade angular — só o confete usa (é o que dá a leitura de papel caindo). */
  giro?: number;
  giroVel?: number;
  /** Gravidade própria da rajada (confete cai, faísca sobe). */
  gravidade?: number;
}

/** O que a página resolve no instante do pedido de rajada (tudo o que precisa de DOM). */
export interface PedidoDeRajada {
  /** Em coordenadas do CANVAS (a página já descontou o retângulo dele). */
  x: number;
  y: number;
  /** A especificação EFETIVA (com o `sobrescrever` do pedido já aplicado). */
  spec: BurstSpec;
  countMul: number;
  sizeMul: number;
  /** Croma equipado, ou a cor do token da especificação. */
  cor: string;
  /** `data-particulas` do `<html>`. */
  skin: string | null;
  /** `data-fonte="pixel"` no `<html>`. */
  modoPixel: boolean;
}

/** As mensagens que o laço entende — as mesmas no Worker e na página. */
export type MensagemDoLaco =
  | { tipo: 'tamanho'; largura: number; altura: number; dpr: number }
  | { tipo: 'ambiente'; preset: ResolvedParticleStyle; cor: string; ambient: boolean }
  | { tipo: 'cor'; cor: string }
  | { tipo: 'rajada'; pedido: PedidoDeRajada }
  | { tipo: 'pausar' }
  | { tipo: 'retomar' };

type Contexto2d = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Superficie = { width: number; height: number };
type CanvasDeEmoji = HTMLCanvasElement | OffscreenCanvas;

export interface AmbienteDoLaco {
  canvas: Superficie;
  ctx: Contexto2d;
  /** O `requestAnimationFrame` de quem hospeda (janela ou Worker). */
  pedirQuadro: (fn: (ts: number) => void) => number;
  cancelarQuadro: (id: number) => void;
  /** Um canvas para rasterizar emojis (`document.createElement` ou `new OffscreenCanvas`). */
  criarCanvas: (lado: number) => CanvasDeEmoji;
}

/**
 * O laço das partículas. Recebe mensagens (`receber`) e desenha por conta própria no
 * `requestAnimationFrame` de quem o hospeda. Dorme quando não há nada a desenhar e acorda na
 * próxima rajada ou troca de ambiente.
 */
export function criarLacoDeParticulas({ canvas, ctx, pedirQuadro, cancelarQuadro, criarCanvas }: AmbienteDoLaco) {
  let width = 0, height = 0, animFrameId = 0;
  const particles: P[] = [];
  let preset: ResolvedParticleStyle | null = null;
  let ambientColor = '#888888';
  let ambient = true;
  /** Fila de rajadas pedidas entre um quadro e outro; drenada no quadro seguinte. */
  const pendentes: PedidoDeRajada[] = [];
  let pausado = false;

  /**
   * POOL DE PARTÍCULAS (personalizar-v4 2.4). Rajadas em sequência criavam e abandonavam
   * centenas de objetos por comemoração — pressão de GC exatamente no momento do confete.
   * Partícula morta volta para cá e `novaParticula` a reveste em vez de alocar.
   */
  const pool: P[] = [];
  const novaParticula = (props: P): P => {
    const p = pool.pop();
    if (!p) return props;
    Object.assign(p, props);
    return p;
  };
  /** Remove por troca-e-pop (O(1), sem o deslocamento do splice) e devolve ao pool. */
  const matarParticula = (i: number) => {
    const morta = particles[i];
    const ultima = particles.pop()!;
    if (morta !== ultima) particles[i] = ultima;
    // Limpa o que é opcional: um emoji herdado apareceria na próxima faísca redonda.
    morta.emoji = undefined; morta.forma = undefined; morta.nova = undefined;
    if (pool.length < 512) pool.push(morta);
  };

  /**
   * CACHE DE EMOJI (personalizar-v4 2.4). `fillText` re-rasteriza o glifo A CADA QUADRO por
   * partícula — shaping de fonte é o custo dominante da chuva de emojis. Cada par
   * emoji×tamanho é desenhado UMA vez num canvas offscreen e depois só copiado (`drawImage`).
   * Tamanho em degraus de 4px para o cache não explodir com `rand(size)` contínuo.
   */
  const cacheDeEmoji = new Map<string, CanvasDeEmoji>();
  const emojiRasterizado = (emoji: string, px: number): CanvasDeEmoji => {
    const chave = `${emoji}:${px}`;
    const pronto = cacheDeEmoji.get(chave);
    if (pronto) return pronto;
    if (cacheDeEmoji.size > 256) cacheDeEmoji.clear(); // packs trocados ao vivo não acumulam
    // Folga de 25%: glifos com ascendente/descendente (🎈, 🎉) cortavam no quadrado exato.
    const lado = Math.ceil(px * 1.25);
    const off = criarCanvas(lado);
    const octx = off.getContext('2d') as Contexto2d;
    octx.font = `${px}px serif`;
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillText(emoji, lado / 2, lado / 2);
    cacheDeEmoji.set(chave, off);
    return off;
  };

  const rand = (a: number, b: number) => a + Math.random() * (b - a);

  const spawnAmbient = () => {
    particles.length = 0;
    if (!ambient || !preset) return;
    // Nasce dentro da faixa visível (metade de cima); fora dela o desvanecimento já zerou.
    for (let i = 0; i < preset.ambientCount; i++) {
      particles.push(novaParticula({
        x: Math.random() * width,
        y: Math.random() * height * 0.5,
        vx: preset.driftX * rand(-1, 1) * 2,
        vy: preset.driftY * rand(0.6, 1.4),
        size: rand(preset.size[0], preset.size[1]),
        alpha: rand(preset.alpha[0], preset.alpha[1]),
        alphaDir: Math.random() < 0.5 ? -1 : 1,
        phase: Math.random() * Math.PI * 2,
        life: null,
        maxLife: 0,
        color: ambientColor
      }));
    }
  };

  const spawnBurst = ({ x: ox, y: oy, spec, countMul, sizeMul, cor: color, skin, modoPixel }: PedidoDeRajada) => {
    // Aprimoramento + intensidade da loja: mais/maiores particulas para quem subiu de nivel;
    // o TETO de vivas continua valendo por cima, e o count multiplicado entra na poda e nos angulos.
    const countFinal = Math.max(1, Math.round(spec.count * countMul));
    // TETO DE PARTÍCULAS VIVAS. Sem ele, comemorações em sequência empilham milhares de objetos
    // e a animação engasga justamente na hora de comemorar — que é quando o travamento mais
    // estraga. Descarta as rajadas mais ANTIGAS em vez de recusar a nova.
    //
    // CUIDADO QUE JÁ CUSTOU CARO: as partículas de AMBIENTE moram no começo do array (são as
    // primeiras a nascer) e não têm `life`. Uma poda ingênua pelo início comeria justamente
    // elas, e o fundo do app iria esvaziando a cada comemoração até a próxima remontagem.
    const TETO = 420;
    const excesso = particles.length + countFinal - TETO;
    if (excesso > 0) {
      let removidas = 0;
      for (let i = 0; i < particles.length && removidas < excesso; i++) {
        if (particles[i].life === null) continue; // ambiente: nunca é podado
        matarParticula(i); // troca-e-pop: o slot i recebe outra e é reexaminado
        i--;
        removidas++;
      }
    }

    // A SKIN de particulas (Aparencia) decide a forma das rajadas comuns; a fonte Arcade forca
    // pixel quando a skin esta no padrao do tema. Rajadas com forma propria (eventos) nao mudam.
    const formaDaSkin: FormaParticula | null =
      skin === 'pixel' ? 'pixel'
      : skin === 'confete' ? 'confete'
      : skin === 'coracoes' ? 'coracao'
      : skin === 'estrelas' ? 'emoji'
      : skin === 'cometa' ? 'cometa'
      : null;
    // 'travessia': objetos que cruzam a tela voando; o lado de entrada e sorteado por rajada.
    const dirTravessia = Math.random() < 0.5 ? 1 : -1;
    for (let i = 0; i < countFinal; i++) {
      const chuva = spec.origem === 'chuva';
      const travessia = spec.origem === 'travessia';
      const cantos = spec.origem === 'cantos';
      const ang = (Math.PI * 2 * i) / countFinal + rand(-0.25, 0.25);
      const sp = spec.speed * rand(0.45, 1);
      const ms = spec.life * rand(0.7, 1);
      particles.push(novaParticula({
        // A chuva nasce ao longo do topo da tela; a radial, no ponto do acontecimento.
        x: chuva ? rand(0, width)
          : travessia ? (dirTravessia > 0 ? -60 : width + 60)
          : cantos ? (i % 2 === 0 ? rand(0, width * 0.12) : rand(width * 0.88, width))
          : ox,
        y: chuva ? rand(-40, -4)
          : travessia ? rand(height * 0.12, height * 0.72)
          : cantos ? (i % 4 < 2 ? rand(0, height * 0.15) : rand(height * 0.85, height))
          : oy,
        vx: chuva ? rand(-0.6, 0.6)
          : travessia ? dirTravessia * sp * rand(1.6, 2.6)
          : Math.cos(ang) * sp,
        vy: chuva ? rand(0.6, 1.8)
          : travessia ? rand(-0.35, 0.35)
          : Math.sin(ang) * sp - 0.6, // radial tem viés p/ cima: cai melhor aos olhos
        size: rand(spec.size[0], spec.size[1]) * sizeMul,
        alpha: 0.9,
        alphaDir: -1,
        phase: 0,
        nova: true,
        life: ms,
        maxLife: ms,
        color: spec.paleta ? spec.paleta[Math.floor(Math.random() * spec.paleta.length)] : color,
        forma: spec.forma ?? formaDaSkin ?? (modoPixel ? 'pixel' : 'circulo'),
        emoji: spec.emojis
          ? spec.emojis[Math.floor(Math.random() * spec.emojis.length)]
          /* O pack de emojis da loja (e a skin "Chuva de Emojis") saíram nas recompensas v2: forma
             emoji sem lista própria não existe mais. Só a skin 'estrelas' sorteia aqui. */
          : !spec.forma && skin === 'estrelas'
            ? (Math.random() < 0.5 ? '⭐' : '✨')
            : undefined,
        giro: rand(0, Math.PI * 2),
        giroVel: rand(-0.18, 0.18),
        gravidade: spec.gravidade,
      }));
    }
  };

  /* Normalização por tempo: `k` é quantos "quadros de 60fps" se passaram desde o último desenho.
     Sem isto, a velocidade de tudo dependeria do FPS da máquina, as partículas andariam em
     câmera lenta exatamente nos PCs modestos que o Modo Desempenho existe para atender.
     O teto de 3 evita que uma pausa da aba teleporte tudo de uma vez ao voltar. */
  let lastTs = 0;
  /* SONO DO LOOP. Com ambiente desligado (perfil sênior / painel de leitura) e nenhuma rajada
     viva, o rAF ficava limpando um canvas de viewport inteira a 60fps para sempre — custo de
     CPU/bateria por nada. Quando não há partícula nem pedido pendente, o loop PARA; um pedido novo
     o acorda. `lastTs` zera no despertar: um `dtReal` do tamanho do cochilo mataria a rajada nova
     antes do primeiro quadro. */
  let dormindo = true;
  const acordar = () => {
    if (!dormindo || pausado || !preset) return;
    dormindo = false;
    lastTs = 0;
    animFrameId = pedirQuadro(render);
  };

  const render = (ts: number) => {
    if (!preset) { dormindo = true; return; }
    /* DUAS MEDIDAS DE TEMPO, e a distinção não é preciosismo — foi um defeito medido.
       `dtReal` é tempo de RELÓGIO e governa a VIDA da rajada. `dt` é limitado a 50ms e governa
       o MOVIMENTO, para que uma pausa da aba não teleporte tudo de uma vez ao voltar.

       Antes a vida também usava o valor limitado. Consequência, medida numa janela sem foco (o
       Chrome derruba o rAF para ~3fps): uma chuva de confete de 2,2s continuava na tela DEZ
       SEGUNDOS depois, a comemoração virava sujeira grudada. Quanto mais fraca a máquina, pior
       ficava, que é exatamente ao contrário do que se quer. */
    const dtReal = lastTs ? ts - lastTs : 16.7;
    const dt = Math.min(dtReal, 50);
    lastTs = ts;
    const k = dt / 16.7;

    // Drena os pedidos acumulados desde o último quadro.
    if (pendentes.length) {
      for (const b of pendentes) spawnBurst(b);
      pendentes.length = 0;
    }

    ctx.clearRect(0, 0, width, height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      if (p.life !== null) {
        // ── Rajada: desacelera, esmaece e morre — em tempo de RELÓGIO (ver `dtReal` acima).
        // Exceto no quadro do NASCIMENTO: a partícula que acabou de entrar na fila não viveu o
        // intervalo medido por `dtReal`. Numa aba estrangulada (rAF ~1fps) esse intervalo é ~1s
        // e uma faísca de 650ms morria ANTES do primeiro desenho — rajada invisível.
        if (p.nova) p.nova = false;
        else p.life -= dtReal;
        // Troca-e-pop no laço DECRESCENTE: quem entra no slot i já foi processada neste quadro.
        if (p.life <= 0) { matarParticula(i); continue; }
        // Confete quase não tem atrito (ele PLANA); faísca desacelera rápido.
        const atrito = Math.pow(p.forma === 'confete' || p.forma === 'emoji' ? 0.995 : p.forma === 'fumaca' ? 0.97 : 0.94, k);
        p.vx *= atrito; p.vy *= atrito;
        p.vy += (p.gravidade ?? 0.045) * k;
        p.x += p.vx * k; p.y += p.vy * k;
        if (p.forma === 'confete') {
          p.giro = (p.giro ?? 0) + (p.giroVel ?? 0) * k;
          // Bamboleio horizontal: papel caindo não desce reto.
          p.x += Math.sin((p.giro ?? 0) * 1.5) * 0.5 * k;
        }
        // Some só no ÚLTIMO terço da vida: sumir desde o começo deixa a rajada anêmica.
        const restante = p.life / p.maxLife;
        p.alpha = 0.9 * Math.min(1, restante / 0.34);
      } else {
        // ── Ambiente: deriva contínua, com a oscilação do preset.
        p.phase += preset.wobbleSpeed * k;
        p.x += (p.vx + (preset.wobble ? Math.sin(p.phase) * preset.wobble * 0.1 : 0)) * k;
        p.y += p.vy * k;
        p.alpha += p.alphaDir * 0.0035 * k;
        if (p.alpha > preset.alpha[1]) { p.alpha = preset.alpha[1]; p.alphaDir = -1; }
        if (p.alpha < preset.alpha[0]) { p.alpha = preset.alpha[0]; p.alphaDir = 1; }
        // Reentra pelo lado oposto DENTRO DA FAIXA — se envolvesse pela altura total, a brasa
        // do `babel` (que sobe) reapareceria lá embaixo, onde o desvanecimento já a apagou, e
        // a faixa esvaziaria em poucos segundos.
        const band = height * 0.5;
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = band;
        if (p.y > band) p.y = -10;
      }

      /* DESVANECIMENTO VERTICAL — por partícula, e não por máscara na camada.
         Uma `mask-image` no <canvas> apagaria também as RAJADAS da metade de baixo, que é
         justamente onde ficam o botão de gravar e os exercícios. Aplicando o gradiente só ao
         ambiente, ele continua confinado à faixa do topo e a rajada aparece onde acontecer. */
      const fade = p.life === null
        ? Math.max(0, 1 - Math.max(0, p.y) / (height * 0.5))
        : 1;

      ctx.globalAlpha = Math.max(0, p.alpha * fade);
      ctx.fillStyle = p.color;
      // No escuro as partículas SOMAM luz (brasa); no claro, composição normal — somar cor a um
      // fundo claro satura em branco e o efeito desaparece. Ver `resolveParticleStyle`.
      ctx.globalCompositeOperation = preset.composite;
      if (preset.glow || p.life !== null) {
        ctx.shadowBlur = p.size * 3;
        ctx.shadowColor = p.color;
      } else {
        ctx.shadowBlur = 0;
      }
      if (p.forma === 'confete') {
        // Retângulo girando: a leitura de "papel picado" vem da rotação, não da cor.
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.giro ?? 0);
        ctx.fillRect(-p.size / 2, -p.size * 0.35, p.size, p.size * 0.7);
        ctx.restore();
      } else if (p.forma === 'pixel') {
        // Quadrado duro, sem glow e em coordenadas inteiras: pixel de verdade nao borra.
        ctx.shadowBlur = 0;
        const lado = Math.max(2, Math.round(p.size)) * 2;
        ctx.fillRect(Math.round(p.x) - lado / 2, Math.round(p.y) - lado / 2, lado, lado);
      } else if (p.forma === 'emoji') {
        ctx.shadowBlur = 0;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.giro ?? 0) * 0.6);
        // Glifo pré-rasterizado (degraus de 4px) copiado com drawImage — ver cacheDeEmoji.
        const px = Math.max(12, Math.round((p.size * 5) / 4) * 4);
        const glifo = emojiRasterizado(p.emoji ?? '⭐', px);
        ctx.drawImage(glifo, -glifo.width / 2, -glifo.height / 2);
        ctx.restore();
      } else if (p.forma === 'cometa') {
        // Cauda: três círculos decrescentes ATRÁS do vetor de velocidade, depois a cabeça.
        const vlen = Math.hypot(p.vx, p.vy) || 1;
        const ux = p.vx / vlen, uy = p.vy / vlen;
        const alphaBase = ctx.globalAlpha;
        for (let k = 3; k >= 1; k--) {
          ctx.globalAlpha = alphaBase * (0.18 * (4 - k));
          ctx.beginPath();
          ctx.arc(p.x - ux * p.size * 1.6 * k, p.y - uy * p.size * 1.6 * k, p.size * (1 - k * 0.22), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = alphaBase;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.forma === 'coracao') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.giro ?? 0) * 0.3);
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(0, s * 0.6);
        ctx.bezierCurveTo(-s * 1.4, -s * 0.5, -s * 0.5, -s * 1.4, 0, -s * 0.4);
        ctx.bezierCurveTo(s * 0.5, -s * 1.4, s * 1.4, -s * 0.5, 0, s * 0.6);
        ctx.fill();
        ctx.restore();
      } else if (p.forma === 'raio') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.giro ?? 0);
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(0, -s * 1.6);
        ctx.lineTo(s * 0.55, -s * 0.2);
        ctx.lineTo(s * 0.15, -s * 0.2);
        ctx.lineTo(s * 0.5, s * 1.6);
        ctx.lineTo(-s * 0.45, s * 0.1);
        ctx.lineTo(-0.05 * s, s * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.forma === 'fumaca') {
        // Cresce e esmaece: o raio sobe conforme a vida se esvai.
        const vivida = p.maxLife > 0 ? 1 - Math.max(0, p.life ?? 0) / p.maxLife : 0;
        ctx.globalAlpha = Math.max(0, ctx.globalAlpha * 0.35);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + 2.2 * vivida), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';

    if (particles.length === 0 && pendentes.length === 0) {
      dormindo = true; // o quadro que acabou de rodar já deixou o canvas limpo
      return;
    }
    animFrameId = pedirQuadro(render);
  };

  return {
    receber(m: MensagemDoLaco) {
      switch (m.tipo) {
        case 'tamanho': {
          width = m.largura; height = m.altura;
          canvas.width = Math.round(width * m.dpr);
          canvas.height = Math.round(height * m.dpr);
          ctx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
          return;
        }
        case 'ambiente': {
          // A troca de tema recomeça o ambiente do zero (era o que a remontagem do efeito fazia).
          preset = m.preset; ambientColor = m.cor; ambient = m.ambient;
          spawnAmbient();
          acordar();
          return;
        }
        case 'cor': {
          // Reage a mudanças de TOKEN sem recomeçar (o seletor de cor do tema Customizado).
          ambientColor = m.cor;
          for (const p of particles) if (p.life === null) p.color = ambientColor;
          return;
        }
        case 'rajada': {
          pendentes.push(m.pedido);
          acordar();
          return;
        }
        case 'pausar': {
          // Aba escondida: nada a desenhar para ninguém. O estado fica; o relógio recomeça na volta.
          pausado = true;
          if (!dormindo) { cancelarQuadro(animFrameId); dormindo = true; }
          return;
        }
        case 'retomar': {
          pausado = false;
          if (particles.length || pendentes.length) acordar();
          return;
        }
      }
    },
    /** Para o laço de vez (desmontagem). */
    encerrar() {
      cancelarQuadro(animFrameId);
      dormindo = true;
      preset = null;
    },
  };
}
