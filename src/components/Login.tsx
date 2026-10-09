/**
 * Porta de entrada (front-door split). Só aparece no modo público (VITE_AUTH_REQUIRED=1 com Supabase
 * configurado); no self-host o App nunca a monta. Três modos: entrar · criar conta · recuperar senha.
 * Social (Google/Facebook) + e-mail/senha. Toda a lógica de auth vem de `src/lib/auth.ts` (mensagens
 * genéricas por segurança). Após entrar, o `onAuthStateChange` no App troca a tela sozinho.
 */
import { Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import React, { Suspense, useEffect, useState } from 'react';

import { lerAbertura } from '../data/rotas/idade';
import * as auth from '../lib/auth';
import * as porta from '../lib/authPorta';
import { t } from '../lib/i18n';
import { lazyComRecarga } from '../lib/lazyComRecarga';
import { supabase } from '../lib/supabase';
import { T } from '../lib/T';
import { chaveDoTurnstile } from '../lib/turnstile';
import PasswordField from './auth/PasswordField';
import { ConfiraSeuEmail, LembrarEmail, Mensagem, RequisitosDaSenha, Saida } from './auth/PecasDaPorta';
import CascaDeEntradaDoQuest from './auth/quest/CascaDeEntradaDoQuest';

/* O widget do captcha só é baixado quando a porta abre num build com `VITE_TURNSTILE_SITE_KEY`. */
const CaptchaDaPorta = lazyComRecarga(() => import('./auth/CaptchaDaPorta'));

type Mode = 'login' | 'signup' | 'forgot';

/* As frases do captcha moram aqui (a porta é carregada sob demanda), não em `lib/auth.ts`. */
const CAPTCHA_PENDENTE = 'Conclua a verificação de segurança para continuar.';
/** O código com que o Supabase recusa a resposta do desafio (vencida, repetida ou ausente). */
const CAPTCHA_FALHOU = 'captcha_failed';
const CAPTCHA_RECUSADO = 'A verificação de segurança não foi aceita. Refaça a verificação e tente de novo.';

/* As tabelas guardam a CHAVE (o português); quem traduz é o ponto de uso, `t(TITULO[modo])` —
   traduzir aqui, na carga do módulo, prenderia a frase ao idioma daquele instante. */
const TITULO: Record<Mode, string> = { login: 'Entrar', signup: 'Criar conta', forgot: 'Recuperar senha' };
const SUB: Record<Mode, string> = {
  login: 'Bem-vindo de volta.',
  signup: 'Comece em segundos, sua conta, seus dados.',
  forgot: 'Enviamos um link de redefinição por e-mail.',
};

/**
 * ENTRAR COM GOOGLE (mudança porta-de-entrada, decisão do dono: e-mail+senha e Google).
 *
 * Era uma constante `false` com os handlers já escritos — pronto e desligado. Agora deriva do
 * ambiente: existe quando existe Supabase configurado, que é a mesma condição que faz a tela
 * inteira funcionar. Um botão que aparece sem provedor por trás seria pior do que não aparecer.
 *
 * FACEBOOK saiu do lançamento por decisão do dono (`src/lib/auth.ts` continua aceitando os dois —
 * é um botão de voltar, não um retrabalho).
 */

interface LoginProps {
  /**
   * Soft gate (D10): quando presente, a porta oferece seguir SEM conta — transcrição, tradução e
   * jogos sobre a sessão atual rodam inteiros no navegador. Ausente no fluxo de recuperação.
   */
  onContinuarSemConta?: () => void;
}

export default function Login({ onContinuarSemConta }: LoginProps = {}) {
  const [modo, setModo] = useState<Mode>('login');
  /* O e-mail lembrado neste aparelho já vem preenchido; a senha é do gerenciador do navegador. */
  const [email, setEmail] = useState(porta.emailLembrado);
  const [lembrar, setLembrar] = useState(true);
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  /* Depois de criar a conta ou pedir a recuperação: o painel "confira seu e-mail", com reenvio. */
  const [pendente, setPendente] = useState<{ tipo: 'confirmar' | 'recuperar'; frase: string } | null>(null);
  /* O que o erro da vez deixa a pessoa fazer (entrar, recuperar, reenviar a confirmação). */
  const [saidas, setSaidas] = useState<'conta-existe' | 'nao-confirmado' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  /* SIGNUP_ENABLED=0 no servidor (Fase 3 — chave de emergência): a porta de "Criar conta" some e a
     tela explica. Quem já tem conta continua entrando; o servidor recusa conta nova de qualquer jeito. */
  const [cadastroAberto, setCadastroAberto] = useState(true);
  useEffect(() => {
    let vivo = true;
    void lerAbertura().then((a) => {
      if (!vivo) return;
      setCadastroAberto(a.cadastro);
      if (!a.cadastro) setModo((m) => (m === 'signup' ? 'login' : m));
    });
    return () => {
      vivo = false;
    };
  }, []);

  const configurado = !!supabase;
  /* CAPTCHA (Turnstile): só existe com a chave pública no build. A resposta do desafio vale para UM
     envio — depois dele `rodadaDoCaptcha` muda e o widget recomeça. Quem confere é o Supabase. */
  const chaveDoCaptcha = configurado ? chaveDoTurnstile() : null;
  const [respostaDoCaptcha, setRespostaDoCaptcha] = useState<string | null>(null);
  const [rodadaDoCaptcha, setRodadaDoCaptcha] = useState(0);
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;

  /* Link de confirmação ou de recuperação vencido: a porta abre dizendo o que houve. */
  useEffect(() => {
    const doLink = porta.consumirErroDoLink();
    if (doLink) setErro(doLink);
  }, []);

  function trocaModo(m: Mode) {
    setModo(m);
    setErro(null);
    setAviso(null);
    setSaidas(null);
    setPendente(null);
    setConfirma('');
  }

  /** A resposta do desafio vale para UM envio: depois dele o widget recomeça. */
  function gastarCaptcha() {
    if (!chaveDoCaptcha) return;
    setRespostaDoCaptcha(null);
    setRodadaDoCaptcha((n) => n + 1);
  }

  /** O reenvio do painel "confira seu e-mail". Devolve a frase do erro, ou `null` quando saiu. */
  async function reenviar(): Promise<string | null> {
    if (chaveDoCaptcha && !respostaDoCaptcha) return t(CAPTCHA_PENDENTE);
    const comCaptcha = chaveDoCaptcha && respostaDoCaptcha ? { captchaToken: respostaDoCaptcha } : undefined;
    const r =
      pendente?.tipo === 'recuperar'
        ? await auth.sendPasswordReset(email, redirectTo, ...(comCaptcha ? [comCaptcha] : []))
        : await porta.reenviarConfirmacao(email, comCaptcha);
    gastarCaptcha();
    if (r.ok && !r.code) return null;
    return (
      porta.mensagemDoCodigo(r.code) ??
      (chaveDoCaptcha ? t(CAPTCHA_RECUSADO) : t('Não foi possível reenviar agora. Tente de novo em instantes.'))
    );
  }

  async function social(provider: 'google') {
    setErro(null);
    setCarregando(true);
    const r = await auth.signInWithProvider(provider, redirectTo);
    if (!r.ok) {
      setErro(r.message ?? t('Falha no login social.'));
      setCarregando(false);
    }
    // sucesso → o browser é redirecionado ao provedor; nada a fazer aqui.
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setSaidas(null);
    setCarregando(true);
    /* Sem captcha as chamadas saem com os MESMOS argumentos de sempre: a resposta só entra, como
       último argumento, quando existe. */
    const comCaptcha: [] | [auth.OpcoesDeCaptcha] =
      chaveDoCaptcha && respostaDoCaptcha ? [{ captchaToken: respostaDoCaptcha }] : [];
    let gastouOCaptcha = false;
    try {
      if (chaveDoCaptcha && !comCaptcha.length) {
        setErro(t(CAPTCHA_PENDENTE));
        return;
      }
      if (modo === 'login') {
        gastouOCaptcha = true;
        const r = await auth.signInEmail(email, senha, ...comCaptcha);
        if (r.ok) porta.lembrarEmail(lembrar ? email : null);
        else {
          setErro(
            r.code === CAPTCHA_FALHOU
              ? t(CAPTCHA_RECUSADO)
              : (porta.mensagemDoCodigo(r.code) ?? r.message ?? t('Falha ao entrar.')),
          );
          if (r.code === porta.EMAIL_NAO_CONFIRMADO) setSaidas('nao-confirmado');
        }
      } else if (modo === 'signup') {
        // O mínimo do Supabase de produção, conferido aqui: o `minLength` do campo não segura um
        // envio programático, e o erro do servidor chegaria em inglês.
        if (senha.length < auth.SENHA_MINIMA) {
          setErro(t(auth.SENHA_CURTA, { n: auth.SENHA_MINIMA }));
          return;
        }
        if (senha !== confirma) {
          setErro(t('As senhas não coincidem.'));
          return;
        }
        gastouOCaptcha = true;
        const r = await auth.signUpEmail(email, senha, ...comCaptcha);
        // No cadastro o erro do Supabase passa como veio (`auth.ts`): a recusa do captcha se reconhece pela palavra.
        if (!r.ok) {
          setErro(
            /captcha/i.test(r.message ?? '')
              ? t(CAPTCHA_RECUSADO)
              : (porta.mensagemDoCodigo(r.code) ?? r.message ?? t('Falha ao criar conta.')),
          );
          if (r.code === auth.EMAIL_JA_CADASTRADO) setSaidas('conta-existe');
        } else if (r.needsEmailConfirm) {
          // Convidado virando conta: a frase dele (a senha é definida depois) fica no formulário.
          if (r.message) setAviso(r.message);
          else {
            porta.lembrarEmail(lembrar ? email : null);
            setPendente({
              tipo: 'confirmar',
              frase: t('Conta criada! Confirme pelo link enviado ao seu e-mail para entrar.'),
            });
          }
        }
      } else {
        gastouOCaptcha = true;
        const r = await auth.sendPasswordReset(email, redirectTo, ...comCaptcha);
        // A recuperação só devolve `ok: false` quando o captcha foi recusado (nada foi enviado).
        if (!r.ok && chaveDoCaptcha) setErro(t(CAPTCHA_RECUSADO));
        // Limite de envio ou sem rede: nada foi enviado, e dizer "enviamos" seria mentira.
        else if (r.code) setErro(porta.mensagemDoCodigo(r.code) ?? t('Falha ao enviar o e-mail.'));
        else setPendente({ tipo: 'recuperar', frase: r.message ?? t('Se existir uma conta, enviamos um link.') });
      }
    } finally {
      setCarregando(false);
      if (gastouOCaptcha) gastarCaptcha();
    }
  }

  /* O mesmo widget nos três modos; o espaço fica reservado enquanto ele chega. */
  const widgetDoCaptcha = chaveDoCaptcha ? (
    <Suspense fallback={<div className="min-h-[65px]" />}>
      <CaptchaDaPorta sitekey={chaveDoCaptcha} rodada={rodadaDoCaptcha} onToken={setRespostaDoCaptcha} />
    </Suspense>
  ) : null;

  const heroRecuperar = {
    // A quebra de linha mora na frase: em outro idioma ela cai onde o tradutor puser o `<br>`.
    title: <T txt="Sem<br>estresse." />,
    subtitle: t('Enviamos um link seguro pro seu e-mail, você define uma nova senha e volta em segundos.'),
  };

  /* As saídas do erro da vez: quem já tem conta entra ou recupera; quem não confirmou pede o e-mail de novo. */
  const saidasDoErro = (quest: boolean) =>
    saidas === 'conta-existe' ? (
      <>
        <Saida quest={quest} onClick={() => trocaModo('login')}>
          {t('Entrar')}
        </Saida>
        <Saida quest={quest} onClick={() => trocaModo('forgot')}>
          {t('Recuperar senha')}
        </Saida>
      </>
    ) : saidas === 'nao-confirmado' ? (
      <Saida
        quest={quest}
        onClick={() => {
          setErro(null);
          setSaidas(null);
          setPendente({ tipo: 'confirmar', frase: t('Peça um novo e-mail de confirmação abaixo.') });
        }}
      >
        {t('Reenviar e-mail de confirmação')}
      </Saida>
    ) : undefined;

  const painelDoEmail = (quest: boolean) =>
    pendente && (
      <ConfiraSeuEmail
        quest={quest}
        email={email}
        frase={pendente.frase}
        onReenviar={reenviar}
        onOutroEmail={() => trocaModo(pendente.tipo === 'recuperar' ? 'forgot' : 'signup')}
        onVoltar={() => trocaModo('login')}
        captcha={widgetDoCaptcha}
      />
    );

  /* QUEST: os mesmos três modos, provedores, erros e saídas, nas medidas do headset. UM botão
     principal (o do formulário); Google e "sem conta" vêm depois, como alternativas. A lógica acima é a
     mesma: aqui só muda a marcação (`questEntrada.css`). */
  const trocarDeModo =
    modo === 'login' && cadastroAberto ? (
      <p className="qen-rodape">
        {t('Não tem conta?')}
        <button type="button" className="qen-link" onClick={() => trocaModo('signup')}>
          {t('Criar uma conta')}
        </button>
      </p>
    ) : modo === 'login' ? (
      <p className="qen-aviso" role="note">
        <Info aria-hidden />
        <span>
          {t(
            'O cadastro de contas novas está pausado temporariamente. Você pode usar o app sem conta, no seu aparelho.',
          )}
        </span>
      </p>
    ) : modo === 'signup' ? (
      <p className="qen-rodape">
        {t('Já tem conta?')}
        <button type="button" className="qen-link" onClick={() => trocaModo('login')}>
          {t('Entrar')}
        </button>
      </p>
    ) : (
      <p className="qen-rodape">
        {/* A seta fica DENTRO da frase, como na tela de sempre (em árabe e hebraico ela vira). */}
        <button type="button" className="qen-link" onClick={() => trocaModo('login')}>
          {t('← Voltar ao login')}
        </button>
      </p>
    );

  return (
    <CascaDeEntradaDoQuest hero={modo === 'forgot' ? heroRecuperar : undefined} testId="login-do-quest">
      {pendente ? (
        painelDoEmail(true)
      ) : (
        <>
          <header className="qen-cab">
            <div>
              <p className="qen-sobre">{t('Sua conta')}</p>
              <h1>{t(TITULO[modo])}</h1>
              <p>{t(SUB[modo])}</p>
            </div>
          </header>

          {!configurado && (
            <p className="qen-aviso alerta" role="alert">
              <TriangleAlert aria-hidden />
              <span>
                <T
                  txt="Login não configurado neste ambiente, defina as variáveis <code>{variaveis}</code> no <code>{arquivo}</code>."
                  val={{ variaveis: 'VITE_SUPABASE_*', arquivo: '.env' }}
                />
              </span>
            </p>
          )}

          <form onSubmit={submit} className="qen-form">
            <div className="qen-campo">
              <label htmlFor="auth-email">{t('E-mail')}</label>
              <input
                id="auth-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('voce@exemplo.com')}
              />
            </div>

            {modo !== 'forgot' && (
              <div className="qen-campo">
                <div className="qen-rotulo">
                  <label htmlFor="auth-senha">{t('Senha')}</label>
                  {modo === 'login' && (
                    <button type="button" className="qen-link" onClick={() => trocaModo('forgot')}>
                      {t('Esqueci')}
                    </button>
                  )}
                </div>
                <PasswordField
                  id="auth-senha"
                  name="senha"
                  required
                  minLength={modo === 'signup' ? auth.SENHA_MINIMA : undefined}
                  autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder={t('mínimo {n} caracteres', { n: auth.SENHA_MINIMA })}
                />
              </div>
            )}

            {modo === 'signup' && (
              <>
                <RequisitosDaSenha senha={senha} minimo={auth.SENHA_MINIMA} quest />
                <div className="qen-campo">
                  <label htmlFor="auth-confirma">{t('Confirmar senha')}</label>
                  <PasswordField
                    id="auth-confirma"
                    name="confirmar-senha"
                    required
                    autoComplete="new-password"
                    value={confirma}
                    onChange={(e) => setConfirma(e.target.value)}
                    placeholder={t('repita a senha')}
                  />
                </div>
              </>
            )}

            {modo === 'login' && <LembrarEmail marcado={lembrar} onChange={setLembrar} quest />}

            {widgetDoCaptcha}

            {erro && (
              <Mensagem tipo="erro" quest acoes={saidasDoErro(true)}>
                {erro}
              </Mensagem>
            )}
            {aviso && (
              <Mensagem tipo="ok" quest>
                {aviso}
              </Mensagem>
            )}

            <button type="submit" disabled={carregando || !configurado} className="qen-botao pri">
              {carregando && <LoaderCircle className="qen-gira" aria-hidden />}
              {carregando
                ? t('Aguarde…')
                : modo === 'login'
                  ? t('Entrar')
                  : modo === 'signup'
                    ? t('Criar conta')
                    : t('Enviar link')}
            </button>
          </form>

          {modo !== 'forgot' && (configurado || onContinuarSemConta) && (
            <>
              <p className="qen-divisor">{t('ou')}</p>
              <div className="qen-acoes par">
                {configurado && auth.googleLigado() && (
                  <button type="button" onClick={() => social('google')} disabled={carregando} className="qen-botao">
                    {t('Continuar com Google')}
                  </button>
                )}
                {onContinuarSemConta && (
                  <button type="button" onClick={onContinuarSemConta} className="qen-botao">
                    {t('Continuar sem conta')}
                  </button>
                )}
              </div>
            </>
          )}

          {trocarDeModo}
        </>
      )}

      {onContinuarSemConta && modo !== 'forgot' && !pendente && (
        <>
          <p className="qen-nota">
            <T
              txt="Ao criar uma conta você concorda com os <termos>termos de uso</termos> e a <privacidade>política de privacidade</privacidade>."
              tags={{
                termos: <a href="/termos.html" target="_blank" rel="noopener" />,
                privacidade: <a href="/privacidade.html" target="_blank" rel="noopener" />,
              }}
            />
          </p>
          <p className="qen-nota">
            {t('Transcreva, traduza e jogue com a sessão atual. Nada sai deste navegador até você criar uma conta.')}
          </p>
        </>
      )}
    </CascaDeEntradaDoQuest>
  );
}
