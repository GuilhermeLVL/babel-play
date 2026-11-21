/**
 * O FUNIL DA PORTA OBRIGATÓRIA (acesso sem conta v2, flag `acesso_restrito_sem_conta`), sem saber quem é a pessoa.
 *
 *   porta_exibida → porta_cadastro_iniciado → conta_criada_pela_porta
 *                 ↘ porta_faixa_menor
 *
 * Vai pelo mesmo caminho do funil das ofertas (`instrumentacao.ts` → `POST /api/metricas/ofertas` → contador
 * Prometheus, nada gravado) e com as mesmas travas: "Métricas de uso anônimas" desligada, conta de menor
 * restrita e edição estática não mandam nada. Os rótulos são FIXOS (`ROTULOS_DA_PORTA`): o evento é a única
 * coisa que varia. Sem id, sem texto, sem e-mail.
 *
 * MENOR (decisão desta etapa). A regra que já existe proíbe instrumentar a CONTA de menor restrita; o visitante
 * sem conta conta, porque o evento não carrega nada dele. Quem diz ter menos de 18 na porta conta UMA vez, como
 * `porta_faixa_menor` (é o que mede quantos caem no ramo do menor), e, com a faixa `menor` guardada neste
 * aparelho, nenhum outro evento da porta sai daqui.
 *
 * `conta_criada_pela_porta`: o cadastro por e-mail conta quando o Supabase aceita a conta (com ou sem a
 * confirmação por e-mail pendente). O Google sai do site: o clique deixa um marcador neste aparelho
 * (`babel.porta.cadastro_google`, 1 h) e a conta conta quando a sessão volta. É uma aproximação: quem já tinha
 * conta Google e tocou em "Criar conta" também conta.
 */
import type { EventoDaPorta } from '../../core/ofertas';
import { SEM_OFERTA } from '../../core/ofertas';
import { lerFaixaSemConta } from '../faixaSemConta';
import { registrarEventoDeOferta, type RotulosDaOferta } from './instrumentacao';

export const ROTULOS_DA_PORTA: RotulosDaOferta = {
  gatilho: SEM_OFERTA,
  componente: SEM_OFERTA,
  plano_atual: 'convidado',
  plano_sugerido: 'conta',
  variante: SEM_OFERTA,
};

const CHAVE_GOOGLE = 'babel.porta.cadastro_google';
const VALIDADE_DO_GOOGLE_MS = 60 * 60_000;

export function registrarEventoDaPorta(evento: EventoDaPorta): void {
  try {
    if (evento !== 'porta_faixa_menor' && lerFaixaSemConta() === 'menor') return;
  } catch {
    return;
  }
  registrarEventoDeOferta(evento, ROTULOS_DA_PORTA);
}

/** O cadastro começou na porta: o envio do formulário ou o toque em "Google" no modo "Criar conta". */
export function registrarCadastroIniciadoNaPorta(via: 'email' | 'google', agora = Date.now()): void {
  registrarEventoDaPorta('porta_cadastro_iniciado');
  if (via !== 'google') return;
  try {
    localStorage.setItem(CHAVE_GOOGLE, String(agora));
  } catch {
    /* sem storage: a conta do Google não é contada, e isso é preferível a contar errado */
  }
}

/** A sessão chegou (`useGateDeConta`): conta a conta do Google pedida na porta, uma vez. */
export function contarContaDoGooglePelaPorta(agora = Date.now()): void {
  let em: number;
  try {
    const bruto = localStorage.getItem(CHAVE_GOOGLE);
    if (!bruto) return;
    localStorage.removeItem(CHAVE_GOOGLE);
    em = Number(bruto);
  } catch {
    return;
  }
  if (Number.isFinite(em) && agora - em >= 0 && agora - em < VALIDADE_DO_GOOGLE_MS)
    registrarEventoDaPorta('conta_criada_pela_porta');
}
