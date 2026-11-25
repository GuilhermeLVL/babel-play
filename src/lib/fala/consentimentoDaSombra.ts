/**
 * O "pode baixar o modelo?" da sombra local (openspec `sombra-sem-web-speech`, 3.2): por aparelho e por motor, em
 * `localStorage` (acesso protegido). Nada vai ao servidor; é só para não perguntar de novo. Sem armazenamento, pergunta
 * a cada visita.
 */
import type { MotorDaSombra } from '../../core/fala/motorDaSombra';

const chave = (motor: MotorDaSombra) => `babel.sombraLocal.aceitou.${motor}`;

export function aceitouBaixar(motor: MotorDaSombra): boolean {
  try {
    return localStorage.getItem(chave(motor)) === '1';
  } catch {
    return false;
  }
}

export function guardarAceite(motor: MotorDaSombra): void {
  try {
    localStorage.setItem(chave(motor), '1');
  } catch {
    /* vale só nesta visita */
  }
}
