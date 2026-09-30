/**
 * Seção "Conta e Segurança" para a tela de Configurações. Só existe no modo com login (authRequired);
 * no self-host retorna null. Encapsula o SecurityPanel (2FA / trocar senha / sair) — wrapper testável
 * isolado do Settings (que é grande demais para montar em teste).
 */
import { Shield } from 'lucide-react';
import React from 'react';

import { t } from '../../lib/i18n';
import { authRequired } from '../../lib/supabase';
import { TituloDeSecao } from '../ui';
import SecurityPanel from './SecurityPanel';

export default function AccountSecuritySection() {
  if (!authRequired) return null;
  return (
    <section>
      <TituloDeSecao icone={Shield} titulo={t('Conta e Segurança')} />
      <SecurityPanel />
    </section>
  );
}
