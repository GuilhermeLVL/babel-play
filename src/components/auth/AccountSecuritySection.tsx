/**
 * Seção "Conta e Segurança" para a tela de Configurações. Só existe no modo com login (authRequired);
 * no self-host retorna null. Encapsula o SecurityPanel (2FA / trocar senha / sair) — wrapper testável
 * isolado do Settings (que é grande demais para montar em teste).
 */
import React from 'react'
import { Shield } from 'lucide-react'
import { authRequired } from '../../lib/supabase'
import SecurityPanel from './SecurityPanel'

export default function AccountSecuritySection() {
  if (!authRequired) return null
  return (
    <section>
      <div className="flex items-center gap-2 mb-4 text-ink">
        <Shield className="w-5 h-5" aria-hidden />
        <h2 className="font-display font-bold text-lg">Conta e Segurança</h2>
      </div>
      <SecurityPanel />
    </section>
  )
}
