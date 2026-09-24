import { AtSign, Check, Circle, Info, KeyRound, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import { excluirConta, type ResultadoDaExclusao } from '../../../data/api';
import * as auth from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../Toast';
import { Dialogo, fecharDialogoDe } from '../../ui';
import { RelatorioDaExclusao } from '../perfil/AbaDados';

/**
 * OS DIÁLOGOS DA CONTA — `dialogoConta()` do protótipo aprovado (4197-4210): trocar e-mail, trocar
 * senha (com o medidor de força), ativar a verificação em duas etapas e excluir a conta.
 *
 * Nenhum fluxo de autenticação novo: e-mail, senha e 2FA passam por `lib/auth`/Supabase, os mesmos
 * que o painel de segurança já usava; a exclusão é a de sempre (`DELETE /api/me`). A senha atual é
 * conferida entrando de novo com ela antes da troca — o protótipo pede, e sem isso qualquer um com
 * o computador desbloqueado trocaria a senha.
 */

export type DialogoDaConta = 'email' | 'senha' | '2fa' | 'excluir';

/* ── Medidor de senha (`forcaSenha`/`medidorSenha` do protótipo) ── */
export function forcaDaSenha(s: string): number {
  let n = 0;
  if (s.length >= 8) n++;
  if (s.length >= 12) n++;
  if (/[A-Z]/.test(s) && /[a-z]/.test(s)) n++;
  if (/\d/.test(s)) n++;
  if (/[^\w\s]/.test(s)) n++;
  if (/^(12345678|senha123|password|qwerty)/i.test(s)) n = 0;
  return Math.min(4, n);
}
const FORCA: Array<[string, string]> = [
  ['Muito fraca', 'err'],
  ['Fraca', 'err'],
  ['Razoável', 'warn'],
  ['Boa', 'ok'],
  ['Forte', 'ok'],
];

function MedidorDeSenha({ senha }: { senha: string }) {
  const f = forcaDaSenha(senha);
  const req: Array<[string, boolean]> = [
    ['8 ou mais caracteres', senha.length >= 8],
    ['Letras e números', /[a-z]/i.test(senha) && /\d/.test(senha)],
    ['Não é uma senha comum', !!senha && !/^(12345678|senha123|password|qwerty)/i.test(senha)],
  ];
  return (
    <>
      <div className="forca" aria-live="polite">
        <div className="forca-barras">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} className={i < f ? FORCA[f][1] : ''} />
          ))}
        </div>
        <small className="mut">
          {senha ? (
            <>
              Força: <b>{FORCA[f][0]}</b>
            </>
          ) : (
            'Use uma frase que só você lembre'
          )}
        </small>
      </div>
      <ul className="requisitos">
        {req.map(([t, ok]) => (
          <li key={t} className={ok ? 'ok' : ''}>
            {ok ? <Check aria-hidden /> : <Circle aria-hidden />}
            {t}
          </li>
        ))}
      </ul>
    </>
  );
}

function Pe({ children }: { children: ReactNode }) {
  return (
    <div className="dlg-pe">
      <button type="button" className="btn btn-outline" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
        Cancelar
      </button>
      {children}
    </div>
  );
}

function Erro({ msg }: { msg: string | null }) {
  return msg ? (
    <p className="erro-auth" role="alert" style={{ marginTop: 10 }}>
      {msg}
    </p>
  ) : null;
}

/** Confere a senha atual entrando de novo com ela (não cria conta nem sessão nova de outro usuário). */
async function conferirSenha(email: string, senha: string): Promise<boolean> {
  if (!email || !senha) return false;
  return (await auth.signInEmail(email, senha)).ok;
}

function TrocarEmail({ emailAtual, aoFechar }: { emailAtual: string; aoFechar: () => void }) {
  const [novo, setNovo] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (el: HTMLElement) => {
    setErro(null);
    if (!/^\S+@\S+\.\S+$/.test(novo)) return setErro('Confira o e-mail novo.');
    setOcupado(true);
    try {
      if (!(await conferirSenha(emailAtual, senha))) return setErro('A senha atual não confere.');
      const r = await supabase?.auth.updateUser({ email: novo });
      if (!r || r.error) return setErro(r?.error?.message ?? 'Não deu para trocar o e-mail agora.');
      toast.ok('Link de confirmação enviado para o e-mail novo');
      fecharDialogoDe(el);
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Dialogo
      icone={AtSign}
      titulo="Trocar e-mail"
      sub="Mandamos um link de confirmação para o endereço novo. O antigo continua valendo até lá."
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo">
        <div className="form-l">
          <label htmlFor="dg-email">E-mail novo</label>
          <input
            className="campo"
            id="dg-email"
            type="email"
            autoComplete="email"
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
          />
        </div>
        <div className="form-l">
          <label htmlFor="dg-senha">Sua senha atual</label>
          <input
            className="campo"
            id="dg-senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>
        <Erro msg={erro} />
      </div>
      <Pe>
        <button
          type="button"
          className="btn btn-solid"
          disabled={ocupado}
          onClick={(e) => void enviar(e.currentTarget)}
        >
          {ocupado && <Loader2 className="gira" aria-hidden />} Enviar confirmação
        </button>
      </Pe>
    </Dialogo>
  );
}

function TrocarSenha({ email, aoFechar }: { email: string; aoFechar: () => void }) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const trocar = async (el: HTMLElement) => {
    setErro(null);
    if (forcaDaSenha(nova) < 2) return setErro('A senha nova está fraca demais. Veja os requisitos abaixo.');
    setOcupado(true);
    try {
      if (!(await conferirSenha(email, atual))) return setErro('A senha atual não confere.');
      const r = await auth.updatePassword(nova);
      if (!r.ok) return setErro(r.message ?? 'Não deu para trocar a senha agora.');
      await supabase?.auth.signOut({ scope: 'others' });
      toast.ok('Senha trocada. Os outros aparelhos saíram da conta.');
      fecharDialogoDe(el);
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Dialogo
      icone={KeyRound}
      titulo="Trocar senha"
      sub="Os outros aparelhos saem da conta depois da troca."
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo">
        <div className="form-l">
          <label htmlFor="dg-atual">Senha atual</label>
          <input
            className="campo"
            id="dg-atual"
            type="password"
            autoComplete="current-password"
            value={atual}
            onChange={(e) => setAtual(e.target.value)}
          />
        </div>
        <div className="form-l">
          <label htmlFor="dg-nova">Senha nova</label>
          <input
            className="campo"
            id="dg-nova"
            type="password"
            autoComplete="new-password"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
          />
        </div>
        <div id="dg-medidor">
          <MedidorDeSenha senha={nova} />
        </div>
        <Erro msg={erro} />
      </div>
      <Pe>
        <button
          type="button"
          className="btn btn-solid"
          disabled={ocupado}
          onClick={(e) => void trocar(e.currentTarget)}
        >
          {ocupado && <Loader2 className="gira" aria-hidden />} Trocar senha
        </button>
      </Pe>
    </Dialogo>
  );
}

function AtivarDuasEtapas({ aoFechar, aoAtivar }: { aoFechar: () => void; aoAtivar: () => void }) {
  const [enroll, setEnroll] = useState<auth.MfaEnroll | null>(null);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    void auth.enrollTotp().then((r) => (r.ok ? setEnroll(r) : setErro(r.message ?? 'Não deu para iniciar agora.')));
  }, []);
  const confirmar = async (el: HTMLElement) => {
    if (!enroll?.factorId) return;
    setErro(null);
    setOcupado(true);
    const r = await auth.confirmTotp(enroll.factorId, codigo.trim());
    setOcupado(false);
    if (!r.ok) return setErro(r.message ?? 'Código inválido.');
    toast.ok('Verificação em duas etapas ativada');
    aoAtivar();
    fecharDialogoDe(el);
  };
  const qr = enroll?.qrSvg ?? '';
  return (
    <Dialogo
      icone={ShieldCheck}
      titulo="Ativar a verificação em duas etapas"
      sub="Leia o QR code com um app autenticador (Google Authenticator, Authy, 1Password)."
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo">
        <div className="pix" style={{ background: 'var(--canvas)' }}>
          {!enroll ? (
            <Loader2 className="gira" aria-hidden />
          ) : (
            /* O Supabase devolve o QR como SVG cru ou data URL. Em <img> o SVG não executa nada. */
            <img
              src={
                qr.startsWith('data:') || qr.startsWith('http')
                  ? qr
                  : `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`
              }
              alt="QR code do autenticador"
              style={{ width: 150, height: 150 }}
            />
          )}
          <div style={{ flex: 1, minWidth: 200 }}>
            <p className="mut" style={{ fontSize: 13 }}>
              Não consegue ler? Digite a chave:
            </p>
            <code className="chave">{enroll?.secret ?? '…'}</code>
            <div className="form-l" style={{ marginTop: 12 }}>
              <label htmlFor="dg-totp">Código de 6 dígitos do app</label>
              <input
                className="campo"
                id="dg-totp"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </div>
        </div>
        <Erro msg={erro} />
      </div>
      <Pe>
        <button
          type="button"
          className="btn btn-solid"
          disabled={ocupado || codigo.length < 6 || !enroll}
          onClick={(e) => void confirmar(e.currentTarget)}
        >
          {ocupado && <Loader2 className="gira" aria-hidden />} Confirmar e ativar
        </button>
      </Pe>
    </Dialogo>
  );
}

function ExcluirConta({ aoFechar, aoIrParaPrivacidade }: { aoFechar: () => void; aoIrParaPrivacidade: () => void }) {
  const [confirma, setConfirma] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDaExclusao | null>(null);
  const excluir = async () => {
    setOcupado(true);
    const r = await excluirConta();
    setOcupado(false);
    setResultado(r);
    if (r.ok) toast.ok('Conta excluída.');
  };
  return (
    <Dialogo
      icone={Trash2}
      titulo="Excluir a sua conta"
      sub="Isso apaga sessões, palavras, progresso e preferências."
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo">
        {resultado ? (
          <RelatorioDaExclusao resultado={resultado} />
        ) : (
          <>
            {/* Os itens dizem o que a exclusão FAZ neste servidor: apaga na hora, sem prazo de arrependimento. */}
            <ul className="lista-x">
              {[
                'Tudo sai do servidor na hora: sessões, transcrições, palavras, progresso e áudios',
                'Não dá para desfazer, e não guardamos cópia',
                'Assinatura ativa não é cancelada por aqui: cancele antes em Planos',
              ].map((t) => (
                <li key={t}>
                  <Info aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 13.5, marginTop: 12 }}>
              Quer levar seus dados antes?{' '}
              <button
                type="button"
                className="link"
                onClick={(e) => {
                  fecharDialogoDe(e.currentTarget);
                  aoIrParaPrivacidade();
                }}
              >
                Baixar uma cópia
              </button>
            </p>
            <div className="form-l" style={{ marginTop: 12 }}>
              <label htmlFor="dg-confirma">
                Para confirmar, digite <b>EXCLUIR</b>
              </label>
              <input
                className="campo"
                id="dg-confirma"
                autoComplete="off"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
              />
            </div>
          </>
        )}
      </div>
      {resultado ? (
        <div className="dlg-pe">
          <button
            type="button"
            className="btn btn-solid"
            onClick={(e) => {
              fecharDialogoDe(e.currentTarget);
              if (resultado.ok) window.location.assign('/');
            }}
          >
            Fechar
          </button>
        </div>
      ) : (
        <Pe>
          <button
            type="button"
            className="btn btn-outline perigo"
            disabled={confirma.trim().toUpperCase() !== 'EXCLUIR' || ocupado}
            onClick={() => void excluir()}
          >
            {ocupado ? <Loader2 className="gira" aria-hidden /> : <Trash2 aria-hidden />} Excluir a conta
          </button>
        </Pe>
      )}
    </Dialogo>
  );
}

export default function DialogosDaConta({
  qual,
  email,
  aoFechar,
  aoMudar,
  aoIrParaPrivacidade,
}: {
  qual: DialogoDaConta;
  email: string;
  aoFechar: () => void;
  /** Algo da conta mudou (2FA ativado): a aba relê o estado. */
  aoMudar: () => void;
  aoIrParaPrivacidade: () => void;
}) {
  if (qual === 'email') return <TrocarEmail emailAtual={email} aoFechar={aoFechar} />;
  if (qual === 'senha') return <TrocarSenha email={email} aoFechar={aoFechar} />;
  if (qual === '2fa') return <AtivarDuasEtapas aoFechar={aoFechar} aoAtivar={aoMudar} />;
  return <ExcluirConta aoFechar={aoFechar} aoIrParaPrivacidade={aoIrParaPrivacidade} />;
}
