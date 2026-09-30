// @vitest-environment jsdom
/**
 * SaaS Fatia 5 — ResetPassword (redefinir senha via link de recuperação). Verifica: senhas divergentes
 * → erro e NÃO redefine; iguais + sucesso → chama updatePassword e onDone; falha do servidor → mensagem
 * e NÃO conclui. Supabase e serviço de auth mockados (não toca a rede).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach,describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  updatePassword: vi.fn(),
  SENHA_MINIMA: 8,
  SENHA_CURTA: 'A senha precisa ter pelo menos 8 caracteres.',
}));
vi.mock('../src/lib/supabase', () => ({ supabase: {}, authRequired: true, getAccessToken: async () => null }));
vi.mock('../src/lib/auth', () => m);

import ResetPassword from '../src/components/auth/ResetPassword';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function preencher(nova: string, confirma: string) {
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: nova } });
  fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: confirma } });
  fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));
}

describe('SaaS Fatia 5 — ResetPassword', () => {
  it('senhas divergentes → erro e NÃO redefine', async () => {
    const onDone = vi.fn();
    render(<ResetPassword onDone={onDone} />);
    preencher('abc12345', 'abc99999');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('não coincidem'));
    expect(m.updatePassword).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('menos de 8 caracteres (o mínimo do Supabase de produção) → erro e NÃO redefine', async () => {
    render(<ResetPassword onDone={vi.fn()} />);
    expect((screen.getByLabelText('Nova senha') as HTMLInputElement).placeholder).toBe('mínimo 8 caracteres');
    preencher('abc1234', 'abc1234');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('pelo menos 8 caracteres'));
    expect(m.updatePassword).not.toHaveBeenCalled();
  });

  it('senhas iguais + sucesso → redefine e conclui', async () => {
    m.updatePassword.mockResolvedValue({ ok: true });
    const onDone = vi.fn();
    render(<ResetPassword onDone={onDone} />);
    preencher('novaSenha1', 'novaSenha1');
    await waitFor(() => expect(m.updatePassword).toHaveBeenCalledWith('novaSenha1'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('falha do servidor → mostra mensagem e NÃO conclui', async () => {
    m.updatePassword.mockResolvedValue({ ok: false, message: 'Sessão expirada.' });
    const onDone = vi.fn();
    render(<ResetPassword onDone={onDone} />);
    preencher('novaSenha1', 'novaSenha1');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Sessão expirada'));
    expect(onDone).not.toHaveBeenCalled();
  });
});
