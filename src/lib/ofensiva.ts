/**
 * OFENSIVA — "estudou hoje?" e "posso avisar que a ofensiva está em risco?".
 *
 * `practicedToday` era `streakDays > 0`. Só que a ofensiva exibida é a MAIOR entre revisar e
 * aparecer, e as duas contagens terminam HOJE: ofensiva > 0 já queria dizer "fez algo hoje". O
 * aviso "ofensiva em risco" exigia `streakDays > 0 && !practicedToday` — uma contradição, então
 * nunca saía.
 *
 * Aqui "estudou hoje" é ATIVIDADE DATADA DE HOJE, no dia local de quem olha:
 *   · uma revisão de hoje em `metrics.revisoesRecentes` (os carimbos que os dois servidores mandam);
 *   · uma rodada gravada hoje neste navegador (`marcarEstudoHoje`, chamada quando a rodada grava).
 * Abrir o app (presença) NÃO conta: o aviso pede "uma revisão ou uma rodada", e é isso que se mede.
 */
import { diaLocal } from '@core';

const CHAVE_ESTUDO = 'babel.estudo_dia';
const CHAVE_AVISO = 'babel.ofensiva_avisada';

/** A partir desta hora uma ofensiva sem estudo no dia é dita "em risco". */
export const HORA_DO_RISCO = 18;
/** Silêncio entre 22h e 8h: aviso de ofensiva não acorda ninguém. */
export const HORA_DO_SILENCIO = 22;
export const HORA_DO_FIM_DO_SILENCIO = 8;

function lerDia(chave: string): number | null {
  try {
    const v = localStorage.getItem(chave);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

function gravarDia(chave: string, dia: number): void {
  try {
    localStorage.setItem(chave, String(dia));
  } catch {
    /* sem storage: o pior caso é um aviso a mais, nunca um a menos de estudo */
  }
}

/** Uma rodada acabou de ser gravada: hoje houve estudo. */
export function marcarEstudoHoje(agora = Date.now()): void {
  gravarDia(CHAVE_ESTUDO, diaLocal(agora));
}

/** Houve revisão ou rodada HOJE (dia local)? */
export function estudouHoje(revisoesRecentes: readonly number[] | undefined, agora = Date.now()): boolean {
  const hoje = diaLocal(agora);
  if (lerDia(CHAVE_ESTUDO) === hoje) return true;
  return (revisoesRecentes ?? []).some((t) => diaLocal(t) === hoje);
}

/**
 * O aviso sai só com ofensiva ativa, nada estudado hoje, entre 18h e 22h locais, e no máximo UMA
 * vez por dia — o teto mora aqui (e não só na chave da central de notificações, que guarda 40
 * itens e poderia esquecer o aviso de hoje).
 */
export function podeAvisarOfensiva(estado: { streakDays: number; estudouHoje: boolean }, agora = new Date()): boolean {
  if (estado.streakDays <= 0 || estado.estudouHoje) return false;
  const h = agora.getHours();
  if (h < HORA_DO_RISCO || h >= HORA_DO_SILENCIO || h < HORA_DO_FIM_DO_SILENCIO) return false;
  return lerDia(CHAVE_AVISO) !== diaLocal(agora.getTime());
}

export function registrarAvisoDeOfensiva(agora = new Date()): void {
  gravarDia(CHAVE_AVISO, diaLocal(agora.getTime()));
}
