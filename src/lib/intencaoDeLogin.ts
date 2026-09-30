/**
 * A INTENÇÃO QUE SOBREVIVE AO LOGIN (funil de venda, 2026-09-29).
 *
 * O teste de ponta a ponta com o Asaas mostrou o furo: quem entra pelo Google, ou confirma o e-mail
 * numa aba nova, caía no Início e perdia o "eu ia assinar o Pro". A tela guarda AQUI, antes de
 * mandar para o login, a rota para onde a pessoa ia (`/plano/assinar`, ou a tela em que ela estava);
 * quem termina o login (a mesma aba, o `/auth/callback` do Google, a aba da confirmação do e-mail)
 * consome e navega para ela.
 *
 * `localStorage`, e não `sessionStorage`: a confirmação do e-mail abre OUTRA aba. Com prazo (a
 * intenção de ontem não sequestra o login de hoje) e só rotas internas (nada de redirecionar para
 * fora a partir de algo que outra aba escreveu). Todo acesso ao armazenamento é protegido: navegação
 * privada pode recusá-lo, e aí só se perde a volta, nunca o login.
 */

const CHAVE = 'babel.intencaoDeLogin';

/** Depois disto a intenção não vale mais (o login que demora uma hora já é outra visita). */
export const VALIDADE_DA_INTENCAO_MS = 60 * 60 * 1000;

export interface IntencaoDeLogin {
  /** A rota interna para onde voltar, com a busca: `/plano/assinar`, `/capturar`… */
  rota: string;
  /** O plano escolhido, quando a intenção é assinar. */
  plano?: string;
  criadaEm: number;
}

/** Só caminho interno do próprio app: começa com uma barra e não com duas (`//evil.com`). */
function rotaInterna(rota: unknown): rota is string {
  return (
    typeof rota === 'string' &&
    rota.startsWith('/') &&
    !rota.startsWith('//') &&
    !rota.includes('\\') &&
    rota.length <= 200
  );
}

export function guardarIntencao(i: { rota: string; plano?: string }, agora: number = Date.now()): void {
  if (!rotaInterna(i.rota)) return;
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ rota: i.rota, plano: i.plano, criadaEm: agora }));
  } catch {
    /* sem armazenamento: o login funciona, só não volta ao lugar */
  }
}

/** A intenção guardada e ainda válida, sem apagá-la. */
export function lerIntencao(agora: number = Date.now()): IntencaoDeLogin | null {
  let bruto: string | null;
  try {
    bruto = localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
  if (!bruto) return null;
  try {
    const i = JSON.parse(bruto) as Partial<IntencaoDeLogin>;
    if (!rotaInterna(i.rota) || typeof i.criadaEm !== 'number') return null;
    if (agora - i.criadaEm > VALIDADE_DA_INTENCAO_MS || i.criadaEm > agora + 60_000) return null;
    return { rota: i.rota, plano: typeof i.plano === 'string' ? i.plano : undefined, criadaEm: i.criadaEm };
  } catch {
    return null;
  }
}

export function esquecerIntencao(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* nada a apagar */
  }
}

/** Lê e apaga: a volta acontece UMA vez. */
export function consumirIntencao(agora: number = Date.now()): IntencaoDeLogin | null {
  const i = lerIntencao(agora);
  esquecerIntencao();
  return i;
}
