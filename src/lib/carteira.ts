import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../data/api'
import { authRequired } from './supabase'
import { hidratarPremium } from './loja'

/**
 * A CARTEIRA DE CRÉDITOS — leitura única compartilhada pelo cabeçalho, pelo Passe e pela Loja.
 *
 * POR QUE UM HOOK E NÃO UM ESTADO NO APP: crédito é a única moeda que o cliente NÃO pode derivar
 * sozinho (Seeds vêm de `progress`, que já é calculado no navegador). Quem sabe o saldo é o
 * servidor, porque quem concede é o webhook do pagamento. Um hook mantém a regra "o cliente lê,
 * nunca escreve" perto de quem consome, e evita três telas inventando três formas de perguntar.
 *
 * SEM BILLING NÃO HÁ CARTEIRA: self-host e modo sem conta devolvem `disponivel: false`, e aí a
 * interface esconde a moeda em vez de mostrar um zero que nunca sobe.
 */

export interface Carteira {
  /** Saldo de Créditos confirmado pelo servidor. `null` enquanto não se sabe. */
  creditos: number | null
  /** Se o Passe Premium desta temporada já é do usuário. */
  temPasse: boolean
  /** Falso em self-host/sem conta: não existe moeda comprada para mostrar. */
  disponivel: boolean
  recarregar: () => void
}

export function useCarteira(): Carteira {
  const [creditos, setCreditos] = useState<number | null>(null)
  const [temPasse, setTemPasse] = useState(false)
  const [disponivel, setDisponivel] = useState(authRequired)
  const [tick, setTick] = useState(0)
  const recarregar = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!authRequired) { setDisponivel(false); return }
    let vivo = true
    void apiFetch('/api/billing/creditos')
      .then(async (r) => (r.ok ? ((await r.json()) as { saldo: number; temPasse: boolean; itensPremium?: string[] }) : null))
      .then((e) => {
        if (!vivo) return
        // Resposta ausente NÃO vira zero: um saldo inventado faria a tela oferecer o que não dá.
        if (!e) { setDisponivel(false); return }
        setCreditos(e.saldo); setTemPasse(e.temPasse); setDisponivel(true)
        /* A posse do que se pagou com dinheiro vem SEMPRE daqui — o espelho local nunca é fonte
           (spec economia-de-creditos: nada comprado com dinheiro vive em localStorage). */
        hidratarPremium(e.itensPremium)
      })
      .catch(() => { if (vivo) setDisponivel(false) })
    return () => { vivo = false }
  }, [tick])

  return { creditos, temPasse, disponivel, recarregar }
}
