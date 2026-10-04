/**
 * AS PEÇAS QUE A PORTA DE ENTRADA REPETE nos dois desenhos (o do headset, `.qen-*`, e o de sempre):
 * a mensagem com ações, os requisitos da senha nova, o "lembrar meu e-mail" e o painel "confira seu
 * e-mail" com reenvio. Só apresentação: o estado e as chamadas são de quem monta (`Login`, `ResetPassword`).
 */
import { Check, Circle, CircleAlert, CircleCheck, LoaderCircle, MailCheck } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import { ESPERA_DO_REENVIO, requisitosDaSenha } from '../../lib/authPorta';
import { t } from '../../lib/i18n';
import { T } from '../../lib/T';

/** Erro ou confirmação, com botões de saída embaixo (o que a pessoa pode fazer a respeito). */
export function Mensagem({
  tipo,
  quest,
  children,
  acoes,
}: {
  tipo: 'erro' | 'ok';
  quest: boolean;
  children: ReactNode;
  acoes?: ReactNode;
}) {
  const Icone = tipo === 'erro' ? CircleAlert : CircleCheck;
  if (quest)
    return (
      <div className={tipo === 'erro' ? 'qen-erro' : 'qen-ok'} role={tipo === 'erro' ? 'alert' : 'status'}>
        <Icone aria-hidden />
        <span>
          {children}
          {acoes && <span className="qen-saidas">{acoes}</span>}
        </span>
      </div>
    );
  return (
    <div
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${tipo === 'erro' ? 'bg-error-soft text-error-ink' : 'bg-good-soft text-good-ink'}`}
      role={tipo === 'erro' ? 'alert' : 'status'}
    >
      <Icone className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
      <span className="min-w-0 flex-1">
        {children}
        {acoes && <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{acoes}</span>}
      </span>
    </div>
  );
}

/** Um botão com cara de link, para as saídas de uma mensagem. */
export function Saida({ quest, onClick, children }: { quest: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={quest ? 'qen-link' : 'font-medium underline underline-offset-2'}>
      {children}
    </button>
  );
}

/** O que a senha nova já cumpre, marcado enquanto a pessoa digita. */
export function RequisitosDaSenha({ senha, minimo, quest }: { senha: string; minimo: number; quest: boolean }) {
  const r = requisitosDaSenha(senha, minimo);
  const itens: Array<[boolean, string]> = [
    [r.tamanho, t('Pelo menos {n} caracteres', { n: minimo })],
    [r.letra && r.numero, t('Letras e números (recomendado)')],
  ];
  return (
    <ul
      className={quest ? 'qen-requisitos' : 'grid gap-1 text-xs text-ink-muted'}
      aria-label={t('Requisitos da senha')}
    >
      {itens.map(([ok, frase]) => (
        <li
          key={frase}
          data-ok={ok}
          className={quest ? undefined : `flex items-center gap-1.5 ${ok ? 'text-good-ink' : ''}`}
        >
          {ok ? (
            <Check aria-hidden className={quest ? undefined : 'h-3.5 w-3.5'} />
          ) : (
            <Circle aria-hidden className={quest ? undefined : 'h-3.5 w-3.5'} />
          )}
          {frase}
        </li>
      ))}
    </ul>
  );
}

/** "Lembrar meu e-mail neste aparelho". A senha fica com o gerenciador do navegador, nunca conosco. */
export function LembrarEmail({
  marcado,
  onChange,
  quest,
}: {
  marcado: boolean;
  onChange: (v: boolean) => void;
  quest: boolean;
}) {
  return (
    <label className={quest ? 'qen-lembrar' : 'flex items-center gap-2 text-xs text-ink-muted'}>
      <input type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} />
      {t('Lembrar meu e-mail neste aparelho')}
    </label>
  );
}

/**
 * "CONFIRA SEU E-MAIL": o que aparece depois de criar a conta ou de pedir a recuperação. Diz para onde
 * foi, quanto vale o link, onde procurar, e deixa pedir de novo (com a espera que o Supabase impõe).
 */
export function ConfiraSeuEmail({
  quest,
  email,
  frase,
  onReenviar,
  onOutroEmail,
  onVoltar,
  captcha,
}: {
  quest: boolean;
  email: string;
  /** A frase de confirmação (a mesma que a tela mostrava antes: conta criada / link enviado). */
  frase: string;
  /** Pede o e-mail de novo. Devolve a frase do erro, ou `null` quando saiu. */
  onReenviar: () => Promise<string | null>;
  onOutroEmail: () => void;
  onVoltar: () => void;
  captcha?: ReactNode;
}) {
  const [resta, setResta] = useState(ESPERA_DO_REENVIO);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [reenviado, setReenviado] = useState(false);
  useEffect(() => {
    if (resta <= 0) return;
    const id = setTimeout(() => setResta((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resta]);

  async function reenviar() {
    setErro(null);
    setReenviado(false);
    setEnviando(true);
    const falha = await onReenviar();
    setEnviando(false);
    if (falha) setErro(falha);
    else setReenviado(true);
    setResta(ESPERA_DO_REENVIO);
  }

  const rotulo = enviando ? t('Aguarde…') : resta > 0 ? t('Reenviar em {n} s', { n: resta }) : t('Reenviar e-mail');
  const explicacao = (
    <T
      txt="Enviamos para <b>{email}</b>. O link vale por 1 hora e funciona uma vez só. Se não chegar em alguns minutos, olhe o Spam e a aba Promoções."
      val={{ email }}
    />
  );

  if (quest)
    return (
      <>
        <header className="qen-cab">
          <span className="qen-ic" aria-hidden>
            <MailCheck />
          </span>
          <div>
            <p className="qen-sobre">{t('Sua conta')}</p>
            <h1>{t('Confira seu e-mail')}</h1>
          </div>
        </header>
        <Mensagem tipo="ok" quest>
          {reenviado ? t('E-mail reenviado.') : frase}
        </Mensagem>
        <p className="qen-nota qen-nota-esq">{explicacao}</p>
        {captcha}
        {erro && (
          <Mensagem tipo="erro" quest>
            {erro}
          </Mensagem>
        )}
        <div className="qen-acoes par">
          <button type="button" className="qen-botao pri" onClick={reenviar} disabled={enviando || resta > 0}>
            {enviando && <LoaderCircle className="qen-gira" aria-hidden />}
            {rotulo}
          </button>
          <button type="button" className="qen-botao" onClick={onOutroEmail}>
            {t('Usar outro e-mail')}
          </button>
        </div>
        <p className="qen-rodape">
          <button type="button" className="qen-link" onClick={onVoltar}>
            {t('← Voltar ao login')}
          </button>
        </p>
      </>
    );

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-ink">{t('Confira seu e-mail')}</h1>
      <div className="mt-4 grid gap-4">
        <Mensagem tipo="ok" quest={false}>
          {reenviado ? t('E-mail reenviado.') : frase}
        </Mensagem>
        <p className="text-sm text-ink-muted">{explicacao}</p>
        {captcha}
        {erro && (
          <Mensagem tipo="erro" quest={false}>
            {erro}
          </Mensagem>
        )}
        <button
          type="button"
          className="btn-ink w-full justify-center disabled:opacity-60"
          onClick={reenviar}
          disabled={enviando || resta > 0}
        >
          {rotulo}
        </button>
        <button type="button" className="btn-outline w-full justify-center" onClick={onOutroEmail}>
          {t('Usar outro e-mail')}
        </button>
      </div>
      <div className="mt-6 border-t border-border-subtle pt-5 text-center text-xs text-ink-muted">
        <button type="button" onClick={onVoltar} className="font-medium text-accent-ink underline underline-offset-2">
          {t('← Voltar ao login')}
        </button>
      </div>
    </>
  );
}
