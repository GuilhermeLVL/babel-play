/**
 * A RESPOSTA AO APONTAR, NO HEADSET (pedido do dono, 01/10/2026).
 *
 * No Quest o "mouse" é um raio que sai do controle: sem retorno, a pessoa não sabe se o raio está em
 * cima de algo que dá para acionar. Um listener só, para o app inteiro (a regra de `sfxDelegate.ts`:
 * nada espalhado por botão), faz três coisas quando o ponteiro ENTRA num alvo:
 *
 *   1. um pulso curto no controle (Gamepad API: `vibrationActuator`, ou `hapticActuators` onde só ele
 *      existe), e um pulso mais forte no clique;
 *   2. onde o navegador não entrega motor nenhum, um tique sonoro quase inaudível no lugar do pulso;
 *   3. a posição do ponteiro dentro do alvo (`--mx`, `--my`), que o CSS usa no brilho que o acompanha.
 *
 * O realce visual é do CSS (`styles/quest.css`); nada aqui é necessário para USAR o app, e nenhuma
 * função depende de hover. Só é instalado com as telas novas do Quest, e a intensidade é da pessoa
 * (`lerVibracaoDoQuest`: desligada, suave ou forte).
 */
import { SELETOR_DO_ACIONAVEL } from '../sfxDelegate';
import { play } from '../soundFx';
import { lerVibracaoDoQuest, type VibracaoDoQuest } from './telaNovaDoQuest';

/** Além do que soa ao clicar: os cartões-alvo, as linhas, os campos e as listas de escolha. */
const SELETOR = `${SELETOR_DO_ACIONAVEL}, select, summary, input:not([type="hidden"]), textarea, [data-tocavel]`;

/** [intensidade de 0 a 1, duração em ms] de cada gesto. */
const PULSOS: Record<Exclude<VibracaoDoQuest, 'desligada'>, { apontar: [number, number]; clicar: [number, number] }> = {
  suave: { apontar: [0.35, 16], clicar: [0.6, 26] },
  forte: { apontar: [0.75, 24], clicar: [1, 44] },
};
/** O raio treme: sem intervalo, a borda entre dois alvos vira uma metralhadora de pulsos. */
const INTERVALO_MS = 70;

type MotorAntigo = { pulse?: (intensidade: number, ms: number) => Promise<unknown> };
type ControleComMotor = Gamepad & { hapticActuators?: readonly MotorAntigo[] };

function controles(): ControleComMotor[] {
  try {
    return [...(navigator.getGamepads?.() ?? [])].filter((c): c is ControleComMotor => !!c);
  } catch {
    return [];
  }
}

const temMotor = (c: ControleComMotor): boolean => !!c.vibrationActuator || !!c.hapticActuators?.length;

/** Um pulso num controle. `true` se o pedido saiu (o navegador não diz se o controle tremeu). */
export function pulsarControle(c: ControleComMotor, intensidade: number, ms: number): boolean {
  try {
    if (c.vibrationActuator?.playEffect) {
      void c.vibrationActuator
        .playEffect('dual-rumble', { duration: ms, strongMagnitude: intensidade, weakMagnitude: intensidade })
        .catch(() => {});
      return true;
    }
    const antigo = c.hapticActuators?.[0];
    if (antigo?.pulse) {
      void antigo.pulse(intensidade, ms)?.catch?.(() => {});
      return true;
    }
  } catch {
    /* motor recusou: sem pulso */
  }
  return false;
}

/** O que o teste de `/diagnostico` e a prévia de Ajustes mostram depois de um pulso de prova. */
export interface ProvaDeVibracao {
  /** Controles que a página enxerga. */
  controles: number;
  /** Deles, os que têm motor. */
  comMotor: number;
  /** O pedido de pulso saiu para algum (o navegador não diz se o controle tremeu). */
  pediu: boolean;
}

/** Um pulso de prova em todos os controles, na intensidade pedida (o do clique, o mais forte dela). */
export function provarVibracao(nivel: Exclude<VibracaoDoQuest, 'desligada'>): ProvaDeVibracao {
  const todos = controles();
  const comMotor = todos.filter(temMotor);
  const [intensidade, ms] = PULSOS[nivel].clicar;
  let pediu = false;
  for (const c of comMotor) pediu = pulsarControle(c, intensidade, ms * 3) || pediu;
  return { controles: todos.length, comMotor: comMotor.length, pediu };
}

/** O alvo acionável sob o ponteiro; `null` em texto, fundo ou alvo desabilitado. */
export function alvoSobOPonteiro(origem: EventTarget | null): HTMLElement | null {
  if (!(origem instanceof Element)) return null;
  const el = origem.closest<HTMLElement>(SELETOR);
  if (!el) return null;
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return null;
  if (el.closest('[data-sem-resposta], .apagado')) return null;
  return el;
}

let instalada = false;

/** Instala o listener global. Idempotente; devolve a limpeza. */
export function instalarRespostaAoApontar(): () => void {
  if (instalada || typeof document === 'undefined') return () => {};
  instalada = true;

  let atual: HTMLElement | null = null;
  let ultimoPulso = 0;
  /** O controle que clicou por último: é o que aponta. Antes do primeiro clique, vibram os dois. */
  let maoQueAponta: number | null = null;
  let quadro = 0;

  const pulsar = (gesto: 'apontar' | 'clicar') => {
    const nivel = lerVibracaoDoQuest();
    if (nivel === 'desligada') return;
    const agora = performance.now();
    if (gesto === 'apontar' && agora - ultimoPulso < INTERVALO_MS) return;
    ultimoPulso = agora;
    const [intensidade, ms] = PULSOS[nivel][gesto];
    const comMotor = controles().filter(temMotor);
    const daMao = comMotor.filter((c) => c.index === maoQueAponta);
    let pulsou = false;
    for (const c of daMao.length ? daMao : comMotor) pulsou = pulsarControle(c, intensidade, ms) || pulsou;
    /* Sem motor à vista (o navegador não entrega o controle à página): o tique sonoro faz o papel. O
       clique já tem o próprio som (`sfxDelegate`). */
    if (!pulsou && gesto === 'apontar') play('apontar');
  };

  const aoEntrar = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const el = alvoSobOPonteiro(e.target);
    if (el === atual) return;
    atual = el;
    if (el) pulsar('apontar');
  };

  const aoMover = (e: PointerEvent) => {
    const el = atual;
    if (!el || quadro) return;
    quadro = requestAnimationFrame(() => {
      quadro = 0;
      if (!el.isConnected) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${Math.round(e.clientX - r.left)}px`);
      el.style.setProperty('--my', `${Math.round(e.clientY - r.top)}px`);
    });
  };

  const aoApertar = (e: PointerEvent) => {
    /* Quem está com o gatilho apertado agora é a mão que aponta. */
    const apertando = controles().find((c) => c.buttons?.some((b) => b.pressed));
    if (apertando) maoQueAponta = apertando.index;
    if (alvoSobOPonteiro(e.target)) pulsar('clicar');
  };

  const aoSair = () => {
    atual = null;
  };

  document.addEventListener('pointerover', aoEntrar, { capture: true, passive: true });
  document.addEventListener('pointermove', aoMover, { capture: true, passive: true });
  document.addEventListener('pointerdown', aoApertar, { capture: true, passive: true });
  document.documentElement.addEventListener('pointerleave', aoSair);

  return () => {
    document.removeEventListener('pointerover', aoEntrar, true);
    document.removeEventListener('pointermove', aoMover, true);
    document.removeEventListener('pointerdown', aoApertar, true);
    document.documentElement.removeEventListener('pointerleave', aoSair);
    if (quadro) cancelAnimationFrame(quadro);
    instalada = false;
  };
}
