// @vitest-environment jsdom
/**
 * SaaS Fatia 5 — SecurityPanel (Conta/Segurança). Verifica os estados do 2FA: sem fator mostra
 * "Habilitar 2FA"; com fator verificado mostra "Ativo" + "Desativar". Supabase e serviço de auth
 * mockados (não toca a rede).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({
  listTotpFactors: vi.fn(async () => [] as any[]),
  enrollTotp: vi.fn(),
  confirmTotp: vi.fn(),
  unenrollTotp: vi.fn(),
  updatePassword: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: {}, authRequired: true, getAccessToken: async () => null }));
vi.mock('../src/lib/auth', () => m);

import SecurityPanel from '../src/components/auth/SecurityPanel';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('SaaS Fatia 5 — SecurityPanel (2FA)', () => {
  it('sem fator → oferece "Habilitar 2FA"', async () => {
    m.listTotpFactors.mockResolvedValue([]);
    render(<SecurityPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Habilitar 2FA' })).toBeTruthy());
    // e tem a seção de trocar senha
    expect(screen.getByLabelText('Nova senha')).toBeTruthy();
  });

  it('com fator verificado → mostra "Ativo" e "Desativar"', async () => {
    m.listTotpFactors.mockResolvedValue([{ id: 'f1', verified: true }]);
    render(<SecurityPanel />);
    await waitFor(() => expect(screen.getByText('Ativo')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Desativar' })).toBeTruthy();
  });
});
