import React, { useEffect, useRef } from 'react';

import type { ThemeType } from '../lib/appearance';
import { BURST_SPECS, type BurstKind, type BurstSpec,onBurst, resolveParticleStyle } from '../lib/effects';
import { corDoCromaEquipado } from '../lib/galeria/cromas';
import { criarLacoDeParticulas, type MensagemDoLaco, type PedidoDeRajada } from '../lib/motorDeParticulas';

const PACK_DE_RESERVA = ['⭐', '✨'];

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

/**
 * ONDE O LAÇO RODA. Com `OffscreenCanvas` (Chrome, Edge, Firefox, Safari 17+), o canvas é
 * transferido para um Worker e a simulação e o desenho saem da thread principal — medido na
 * auditoria de performance do frontend (26/09/2026): o ambiente custava 9–11 ms de thread
 * principal por quadro num celular médio, em toda tela (ver `lib/motorDeParticulas.ts`). Sem ele (ou
 * se o Worker não subir), o MESMO laço roda na página, como antes. A decisão é por canvas: um canvas
 * transferido não volta.
 */
function podeUsarWorker(canvas: HTMLCanvasElement): boolean {
  return typeof Worker !== 'undefined' && typeof canvas.transferControlToOffscreen === 'function';
}

interface Canal {
  enviar: (m: MensagemDoLaco) => void;
  encerrar: () => void;
  usos: number;
}
/**
 * UM CANAL POR CANVAS, e não por execução do efeito: `transferControlToOffscreen` só pode ser
 * chamado uma vez por elemento, e o StrictMode do React (dev) roda o efeito, a limpeza e o efeito
 * de novo no MESMO canvas. A limpeza só encerra o laço se nenhum efeito voltar a usar o canal até a
 * próxima tarefa — no StrictMode ele volta na hora; numa desmontagem de verdade, não.
 */
const canais = new WeakMap<HTMLCanvasElement, Canal>();
function abrirCanal(canvas: HTMLCanvasElement): Canal | null {
  const existente = canais.get(canvas);
  if (existente) {
    existente.usos++;
    return existente;
  }
  let canal: Canal | null = null;
  if (podeUsarWorker(canvas)) {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('../lib/particulas.worker.ts', import.meta.url), { type: 'module' });
      const offscreen = canvas.transferControlToOffscreen();
      worker.postMessage({ tipo: 'iniciar', canvas: offscreen }, [offscreen]);
      const w = worker;
      canal = { enviar: (m) => w.postMessage(m), encerrar: () => w.terminate(), usos: 1 };
    } catch {
      worker?.terminate();
    }
  }
  if (!canal) {
    let ctx: CanvasRenderingContext2D | null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null; // canvas já transferido: não há onde desenhar
    }
    if (!ctx) return null;
    const laco = criarLacoDeParticulas({
      canvas,
      ctx,
      pedirQuadro: (fn) => requestAnimationFrame(fn),
      cancelarQuadro: (id) => cancelAnimationFrame(id),
      criarCanvas: (lado) => {
        const c = document.createElement('canvas');
        c.width = lado; c.height = lado;
        return c;
      },
    });
    canal = { enviar: (m) => laco.receber(m), encerrar: () => laco.encerrar(), usos: 1 };
  }
  canais.set(canvas, canal);
  return canal;
}
function fecharCanal(canvas: HTMLCanvasElement) {
  const canal = canais.get(canvas);
  if (!canal) return;
  canal.usos--;
  setTimeout(() => {
    if (canal.usos > 0 || canais.get(canvas) !== canal) return;
    canais.delete(canvas);
    canal.encerrar();
  }, 0);
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
 *
 * Este componente é a PONTA DA PÁGINA: lê o que só a página sabe (tokens de cor, skin, pack,
 * croma, tamanho do canvas) e manda ao laço, que simula e desenha (`lib/motorDeParticulas.ts`).
 */
export default function ParticleCanvas({ enabled, performanceMode, theme, darkMode, ambient }: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** O canal até o laço — `postMessage` do Worker ou o `receber` do laço na página. */
  const enviarRef = useRef<((m: MensagemDoLaco) => void) | null>(null);
  /** Pedidos que chegaram antes de o laço existir (o barramento liga antes do canal). */
  const pendingRef = useRef<MensagemDoLaco[]>([]);

  /**
   * `enabled` JÁ carrega a decisão resolvida: o App inicializa o interruptor a partir do
   * `prefers-reduced-motion` do sistema, mas deixa a escolha explícita do usuário vencer
   * (ver App.tsx). Reaplicar a media query aqui era o que fazia o botão dizer "ativado" e nada
   * acontecer — um veto invisível e sem recurso.
   */
  const active = enabled && !performanceMode;

  const enviar = (m: MensagemDoLaco) => {
    if (enviarRef.current) enviarRef.current(m);
    else pendingRef.current.push(m);
  };

  // O CANAL: sobe o laço (no Worker ou na página) enquanto o canvas existir.
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canal = abrirCanal(canvas);
    if (!canal) return;
    enviarRef.current = canal.enviar;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      enviarRef.current?.({ tipo: 'tamanho', largura: rect.width, altura: rect.height, dpr: Math.min(window.devicePixelRatio || 1, 2) });
    };
    resize();
    // O que chegou antes do canal (ambiente, rajadas) segue na ordem, depois do tamanho.
    for (const m of pendingRef.current) enviarRef.current?.(m);
    pendingRef.current = [];
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // Aba escondida: o laço dorme em vez de desenhar para ninguém.
    const aoMudarVisibilidade = () => enviarRef.current?.({ tipo: document.hidden ? 'pausar' : 'retomar' });
    document.addEventListener('visibilitychange', aoMudarVisibilidade);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      enviarRef.current = null;
      fecharCanal(canvas);
    };
  }, [active]);

  // O barramento fica ligado enquanto o canvas existir — inclusive quando o ambiente está off.
  useEffect(() => {
    if (!active) return;
    // Lido no pedido e não uma vez só: o seletor de cor do tema Customizado altera
    // `--custom-accent` sem mudar o `theme`.
    const readColor = (token: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#888888';
    return onBurst((e: { x: number; y: number; kind: BurstKind; sobrescrever?: Partial<BurstSpec> }) => {
      const spec: BurstSpec = e.sobrescrever ? { ...BURST_SPECS[e.kind], ...e.sobrescrever } : BURST_SPECS[e.kind];
      /* Os APRIMORAMENTOS (tamanho e quantidade) e os PACKS DE EMOJI saíram nas recompensas v2
         (27/09): a rajada sai do tamanho da spec, e a forma "emoji" dos eventos raros usa o par
         de reserva de sempre. */
      const countMul = 1;
      const sizeMul = 1;
      // As coordenadas da rajada chegam em VIEWPORT; o canvas pode não começar no topo da janela.
      const rect = canvasRef.current?.getBoundingClientRect();
      /* CROMA (mudança inventario-e-cromas): quando a pessoa desbloqueou e equipou uma cor para
         a skin de partículas, ela vence o token do tema. Sem croma equipado a função devolve
         null e tudo segue exatamente como antes. */
      const skin = document.documentElement.getAttribute('data-particulas');
      const croma = skin ? corDoCromaEquipado('part-' + skin) : null;
      const pedido: PedidoDeRajada = {
        x: e.x - (rect?.left ?? 0),
        y: e.y - (rect?.top ?? 0),
        spec,
        countMul,
        sizeMul,
        cor: croma ?? readColor(spec.colorToken),
        pack: PACK_DE_RESERVA,
        skin,
        modoPixel: document.documentElement.getAttribute('data-fonte') === 'pixel',
      };
      enviar({ tipo: 'rajada', pedido });
    });
  }, [active]);

  // O AMBIENTE do tema em vigor — recomeça a cada troca de tema/modo, como antes.
  useEffect(() => {
    if (!active) return;
    // Preset EFETIVO (com piso de opacidade e composição do modo) — nunca o preset cru.
    const preset = resolveParticleStyle(theme, darkMode);
    const readColor = () =>
      getComputedStyle(document.documentElement).getPropertyValue(preset.colorToken).trim() || '#888888';
    enviar({ tipo: 'ambiente', preset, cor: readColor(), ambient });

    /**
     * Reage a mudanças de TOKEN sem remontar. Padrão canônico do repositório (o mesmo de
     * `Metrics.tsx`, que já observa `['class','data-theme']` para os gráficos). Aqui entra
     * também `'style'`: é onde o seletor de cor do tema Customizado escreve `--custom-accent`,
     * e sem isso mudar a paleta ao vivo não repintava as partículas.
     */
    const temaObserver = new MutationObserver(() => enviar({ tipo: 'cor', cor: readColor() }));
    temaObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });
    return () => temaObserver.disconnect();
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
