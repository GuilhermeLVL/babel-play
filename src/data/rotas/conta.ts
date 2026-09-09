/**
 * O CLIENTE DAS ROTAS DE CONTA (LGPD — portado da cópia de engenharia, E5).
 *
 * O backend destas duas rotas existia desde a auditoria, com rate-limit dedicado em `server.ts`,
 * e NENHUMA tela o chamava — a obrigação legal estava implementada e inalcançável. Estas funções
 * são a ponte que faltava; a interface vive em `views/perfil/AbaDados.tsx`.
 *
 * Do outro lado, `src/data/efemero/rotas/conta.ts` só responde `entitlements`: exportar e excluir
 * a conta não têm espelho porque a conta é justamente o que não existe sem ela — motivo escrito em
 * `tests/contratos/rotas-espelhadas.test.ts`.
 *
 * Rotas: GET `/api/me/exportar`, DELETE `/api/me`.
 */
import { apiFetch } from '../funil'

/** O que o servidor devolve ao excluir a conta: o relatório por tabela e o que NÃO deu certo. */
export interface ResultadoDaExclusao {
  ok: boolean
  linhasPorTabela?: Record<string, number>
  totalDeLinhas?: number
  arquivos?: { apagados: number; falhas: { arquivo: string; erro: string }[] }
  /**
   * O vínculo de login pode sobreviver às linhas (sem SUPABASE_SERVICE_ROLE_KEY, por exemplo).
   * Quando isso acontece o servidor DIZ, em vez de confirmar o que não aconteceu — e a tela
   * precisa repassar esse aviso ao titular, senão ele acha que sumiu tudo.
   */
  login?: { desvinculado: boolean; motivo?: string; aviso?: string }
  error?: string
}

/**
 * Portabilidade: baixa tudo o que o sistema guarda sobre o titular, em JSON.
 *
 * O binário do áudio NÃO vem aqui (só os nomes dos arquivos) e os segredos saem como metadado —
 * decisões do servidor, documentadas em `db/repositories/conta.ts`. Como a rota exige o header de
 * autenticação, não dá para apontar um `<a href>` para ela: é preciso buscar e materializar o
 * blob no cliente.
 */
export async function exportarConta(): Promise<Blob | null> {
  try {
    const res = await apiFetch('/api/me/exportar', { timeoutMs: 60_000 })
    if (!res.ok) return null
    return await res.blob()
  } catch {
    return null
  }
}

/**
 * Exclusão. O `confirmar: true` é exigido pelo schema do servidor (`excluirContaSchema`) — é a
 * trava que impede um DELETE acidental com corpo vazio.
 *
 * Diferente do resto da camada de dados, o erro NÃO vira `null`: quando a exclusão falha pela
 * metade (arquivo que não saiu, vínculo de login que sobreviveu) o corpo da resposta é justamente
 * o que o titular precisa ler. Engolir isso seria esconder o que não aconteceu.
 */
export async function excluirConta(): Promise<ResultadoDaExclusao> {
  try {
    const res = await apiFetch('/api/me', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmar: true }),
      timeoutMs: 60_000,
    })
    const corpo = (await res.json().catch(() => ({}))) as Partial<ResultadoDaExclusao>
    return { ...corpo, ok: res.ok && corpo.ok !== false }
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err) }
  }
}
