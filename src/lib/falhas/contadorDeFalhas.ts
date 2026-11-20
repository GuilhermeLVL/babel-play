/**
 * O CONTADOR ANÔNIMO DE FALHAS DO VISITANTE (DISP-06, change `modelos-confiaveis-e-offline`, opção "a"
 * aprovada pelo dono).
 *
 * O time não via nenhuma falha do visitante: o Sentry só existe com conta, o relatório de erros passa pelo
 * funil `apiFetch` (que, sem conta, não sai do navegador) e as falhas tratadas na tela ("Não foi possível
 * preparar o modelo") não eram reportadas para ninguém. Este módulo manda UM número por tipo de falha:
 *
 *   `{ tipo, aparelho, modelo }`  três valores de listas FECHADAS (`core/falhas/mensagemDeFalha.ts` e
 *                                 `perfilDoDispositivo().tipo`). Sem id, sem pathname, sem texto, sem hora.
 *
 * Vai por `navigator.sendBeacon` para `POST /api/erros-do-cliente/falha` (pública, ANTES do auth: sem conta
 * também conta, e com conta o servidor nem sabe quem é). No máximo 1 envio por tipo por página. O servidor
 * só incrementa `cliente_falha_total{tipo,aparelho,modelo}`, sem gravar IP (`server/routes/erros.ts`).
 *
 * QUANDO NÃO VAI NADA: "Métricas de uso anônimas" desligada em Ajustes → Privacidade (a mesma promessa da
 * telemetria de captura), ou perfil de menor RESTRITO (sem o responsável). Toda falha do envio é silenciosa.
 */
import { classificarFalha, modeloDoContador, type TipoDeFalha } from '../../core/falhas/mensagemDeFalha';
import { perfilDoDispositivo } from '../dispositivo/perfil';
import { lerPreferencias } from '../preferencias';
import { estadoDaProtecao } from '../protecaoDoMenor';

export const ROTA_DO_CONTADOR = '/api/erros-do-cliente/falha';

const enviados = new Set<TipoDeFalha>();

function podeContar(): boolean {
  try {
    if (lerPreferencias().consentimentos.metricas === false) return false;
    return estadoDaProtecao()?.restrita !== true;
  } catch {
    return false;
  }
}

/** Conta uma falha de preparo. Idempotente por tipo nesta página. */
export function contarFalha(tipo: TipoDeFalha, modelo?: string | null): void {
  if (enviados.has(tipo)) return;
  try {
    if (!podeContar()) return;
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return;
    enviados.add(tipo);
    const corpo = JSON.stringify({ tipo, aparelho: perfilDoDispositivo().tipo, modelo: modeloDoContador(modelo) });
    navigator.sendBeacon(ROTA_DO_CONTADOR, new Blob([corpo], { type: 'application/json' }));
  } catch {
    /* contador que falha morre aqui: nunca vira erro na tela */
  }
}

/**
 * Conta a falha de um ERRO de preparo: classifica e, se for de uma classe conhecida, conta. O modelo sai da
 * própria mensagem (o worker escreve o id do modelo depois da marca `[falha:…]`), reduzido à lista fechada.
 */
export function contarFalhaDoErro(erro: unknown): void {
  try {
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    const tipo = classificarFalha(erro, { online });
    if (tipo === 'desconhecida') return;
    contarFalha(tipo, String((erro as Error)?.message ?? erro));
  } catch {
    /* idem */
  }
}

/** Só para os testes: a página "recarrega". */
export function _zerarContadorDeFalhas(): void {
  enviados.clear();
}
