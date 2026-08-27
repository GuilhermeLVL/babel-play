import React, { useEffect, useRef } from 'react';
import type { ThemeType } from '../lib/appearance';
import { resolveParticleStyle, BURST_SPECS, onBurst, type BurstKind } from '../lib/effects';

interface ParticleCanvasProps {
  /** Interruptor do usuário (Animações e efeitos). */
  enabled: boolean;
  performanceMode: boolean;
  /** Tema em vigor — define a personalidade da partícula (ver lib/effects). */
  theme: ThemeType;
  /** Muda quando o modo claro/escuro alterna, para reler a cor computada. */
  darkMode: boolean;
  /**
   * `false` desliga só a camada AMBIENTE. As rajadas continuam: são curtas, pontuais e confirmam
   * uma ação que o usuário acabou de fazer — informação, não enfeite. É o caso do perfil sênior,
   * onde movimento contínuo sobre texto atrapalha mas o retorno de uma ação ajuda.
   */
  ambient: boolean;
}

interface P {
  x: number; y: number; vx: number; vy: number;
  size: number; alpha: number; alphaDir: number;
  phase: number;
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
  /** Confete é retângulo girando; o resto é círculo. */
  forma?: 'circulo' | 'confete';
  /** Rotação e velocidade angular — só o confete usa (é o que dá a leitura de papel caindo). */
  giro?: number;
  giroVel?: number;
  /** Gravidade própria da rajada (confete cai, faísca sobe). */
  gravidade?: number;
}

/**
 * Duas camadas de partícula.
 *
 * A versão anterior desenhava uma poeira genérica sobre a tela INTEIRA, igual nos seis temas.
 * Aqui:
 *   • AMBIENTE — só a faixa superior, com máscara que desvanece para baixo. Fica atrás do
 *     cabeçalho e nunca sobre o corpo de texto. O comportamento (sobe? oscila? afunda?) vem do
 *     preset do tema.
 *   • RAJADA — nasce no ponto de um acontecimento real, expande e morre em <1,3s.
 *
 * Continua respeitando o que a fase 1 acertou: cor lida do token do tema, escala por DPR,
 * `prefers-reduced-motion` e o desligamento pelo Modo Desempenho.
 */
export default function ParticleCanvas({ enabled, performanceMode, theme, darkMode, ambient }: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Fila de rajadas pedidas entre um quadro e outro (o listener não pode tocar no estado do loop). */
  const pendingRef = useRef<Array<{ x: number; y: number; kind: BurstKind }>>([]);

  /**
   * `enabled` JÁ carrega a decisão resolvida: o App inicializa o interruptor a partir do
   * `prefers-reduced-motion` do sistema, mas deixa a escolha explícita do usuário vencer
   * (ver App.tsx). Reaplicar a media query aqui era o que fazia o botão dizer "ativado" e nada
   * acontecer — um veto invisível e sem recurso.
   */
  const active = enabled && !performanceMode;

  // O barramento fica ligado enquanto o canvas existir — inclusive quando o ambiente está off.
  useEffect(() => {
    if (!active) return;
    return onBurst((e) => { pendingRef.current.push(e); });
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Preset EFETIVO (com piso de opacidade e composição do modo) — nunca o preset cru.
    const preset = resolveParticleStyle(theme, darkMode);
    // Lido a cada quadro-chave e não uma vez só: o seletor de cor do tema Customizado altera
    // `--custom-accent` sem mudar o `theme`, então uma leitura única congelava a cor antiga.
    const readColor = (token: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#888888';
    let ambientColor = readColor(preset.colorToken);

    let width = 0, height = 0, animFrameId = 0;
    const particles: P[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width; height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    /**
     * Reage a mudanças de TOKEN sem remontar. Padrão canônico do repositório (o mesmo de
     * `Metrics.tsx`, que já observa `['class','data-theme']` para os gráficos). Aqui entra
     * também `'style'`: é onde o seletor de cor do tema Customizado escreve `--custom-accent`,
     * e sem isso mudar a paleta ao vivo não repintava as partículas.
     */
    const releituraTema = () => {
      ambientColor = readColor(preset.colorToken);
      for (const p of particles) if (p.life === null) p.color = ambientColor;
    };
    const temaObserver = new MutationObserver(releituraTema);
    temaObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    const spawnAmbient = () => {
      particles.length = 0;
      if (!ambient) return;
      // Nasce dentro da faixa visível (metade de cima); fora dela o desvanecimento já zerou.
      for (let i = 0; i < preset.ambientCount; i++) {
        particles.push({
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
        });
      }
    };
    spawnAmbient();

    /** As coordenadas da rajada chegam em VIEWPORT; o canvas pode não começar no topo da janela. */
    const spawnBurst = (vx: number, vy: number, kind: BurstKind) => {
      const spec = BURST_SPECS[kind];
      const rect = canvasRef.current!.getBoundingClientRect();
      const ox = vx - rect.left;
      const oy = vy - rect.top;
      const color = readColor(spec.colorToken);
      // TETO DE PARTÍCULAS VIVAS. Sem ele, comemorações em sequência empilham milhares de objetos
      // e a animação engasga justamente na hora de comemorar — que é quando o travamento mais
      // estraga. Descarta as rajadas mais ANTIGAS em vez de recusar a nova.
      //
      // CUIDADO QUE JÁ CUSTOU CARO: as partículas de AMBIENTE moram no começo do array (são as
      // primeiras a nascer) e não têm `life`. Uma poda ingênua pelo início comeria justamente
      // elas, e o fundo do app iria esvaziando a cada comemoração até a próxima remontagem.
      const TETO = 420;
      const excesso = particles.length + spec.count - TETO;
      if (excesso > 0) {
        let removidas = 0;
        for (let i = 0; i < particles.length && removidas < excesso; i++) {
          if (particles[i].life === null) continue; // ambiente: nunca é podado
          particles.splice(i, 1);
          i--;
          removidas++;
        }
      }

      for (let i = 0; i < spec.count; i++) {
        const chuva = spec.origem === 'chuva';
        const ang = (Math.PI * 2 * i) / spec.count + rand(-0.25, 0.25);
        const sp = spec.speed * rand(0.45, 1);
        const ms = spec.life * rand(0.7, 1);
        particles.push({
          // A chuva nasce ao longo do topo da tela; a radial, no ponto do acontecimento.
          x: chuva ? rand(0, width) : ox,
          y: chuva ? rand(-40, -4) : oy,
          vx: chuva ? rand(-0.6, 0.6) : Math.cos(ang) * sp,
          vy: chuva ? rand(0.6, 1.8) : Math.sin(ang) * sp - 0.6, // radial tem viés p/ cima: cai melhor aos olhos
          size: rand(spec.size[0], spec.size[1]),
          alpha: 0.9,
          alphaDir: -1,
          phase: 0,
          life: ms,
          maxLife: ms,
          color,
          forma: spec.forma ?? 'circulo',
          giro: rand(0, Math.PI * 2),
          giroVel: rand(-0.18, 0.18),
          gravidade: spec.gravidade,
        });
      }
    };

    /* Normalização por tempo: `k` é quantos "quadros de 60fps" se passaram desde o último desenho.
       Sem isto, a velocidade de tudo dependeria do FPS da máquina, as partículas andariam em
       câmera lenta exatamente nos PCs modestos que o Modo Desempenho existe para atender.
       O teto de 3 evita que uma pausa da aba teleporte tudo de uma vez ao voltar. */
    let lastTs = 0;

    const render = (ts: number) => {
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
      if (pendingRef.current.length) {
        for (const b of pendingRef.current) spawnBurst(b.x, b.y, b.kind);
        pendingRef.current.length = 0;
      }

      ctx.clearRect(0, 0, width, height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        if (p.life !== null) {
          // ── Rajada: desacelera, esmaece e morre — em tempo de RELÓGIO (ver `dtReal` acima).
          p.life -= dtReal;
          if (p.life <= 0) { particles.splice(i, 1); continue; }
          // Confete quase não tem atrito (ele PLANA); faísca desacelera rápido.
          const atrito = Math.pow(p.forma === 'confete' ? 0.99 : 0.94, k);
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
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';

      animFrameId = requestAnimationFrame(render);
    };
    animFrameId = requestAnimationFrame(render);

    return () => {
      observer.disconnect();
      temaObserver.disconnect();
      cancelAnimationFrame(animFrameId);
    };
  }, [active, theme, darkMode, ambient]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      /* A camada cobre a JANELA inteira para que a RAJADA possa nascer em qualquer ponto. O que
         confina o AMBIENTE ao topo é o desvanecimento por partícula no loop, não uma máscara.
         `fixed` e não `absolute`: dentro do `<main>` (que é `overflow-hidden`) toda rajada perto
         da barra de navegação era CORTADA, e as coordenadas de viewport usadas por `emitBurst`
         não batiam com a caixa do main.

         SUBIU DE 30 PARA 38, e a régua continua a mesma: abaixo dos modais (z-50+) e abaixo do
         "+10" flutuante (z-40), que precisa ficar legível por cima do confete. A 30 ela empatava
         com o `MobileNav`, e, empatando, quem vem depois na árvore ganha, então no celular a
         rajada já sumia atrás da barra. Agora também passa por baixo da partida em tela cheia
         embutida na sessão (z-[35]), que senão engoliria o confete justo onde ele mais importa:
         o acerto e o cartão de raspar. Camada decorativa e `pointer-events-none`, cobrir a
         interface é o trabalho dela, não um efeito colateral. */
      className="fixed inset-0 w-full h-full pointer-events-none z-[38]"
    />
  );
}
