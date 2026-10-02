#!/usr/bin/env node
/**
 * SUPABASE AUTH FALSO para o e2e com `AUTH_REQUIRED=1` (Fase 5 do lançamento).
 *
 * O e2e comum roda sem login (`npm run dev:local`), então o caminho que a produção de fato usa —
 * login pelo supabase-js no navegador, token ES256, servidor verificando pelo JWKS — nunca era
 * exercitado por um navegador. Projeto Supabase de verdade no CI significaria segredo no CI e rede
 * externa em cada execução. Este servidor fala o pedaço do protocolo do GoTrue que o app usa, com um
 * par de chaves gerado na hora — o mesmo truque do harness de caracterização
 * (`tests/caracterizacao/_app.ts`), agora do lado do navegador:
 *
 *   GET  /auth/v1/.well-known/jwks.json              a chave pública (o servidor do app verifica por ela)
 *   POST /auth/v1/token?grant_type=password          login com e-mail e senha
 *   POST /auth/v1/token?grant_type=refresh_token     renovação
 *   GET  /auth/v1/user                               o usuário do token (com os fatores de 2FA)
 *   POST /auth/v1/logout                             sair
 *   POST /auth/v1/factors/:id/challenge              desafio do TOTP
 *   POST /auth/v1/factors/:id/verify                 código certo → sessão aal2
 *   GET  /auth/v1/admin/users/:id                    Admin API (o servidor pergunta se a conta tem 2FA)
 *
 * Contas: `e2e@babel.test` (sem 2FA) e `e2e-2fa@babel.test` (com TOTP; o código aceito é 123456),
 * ambas com a senha `senha-e2e-123`.
 *
 *   node tests/e2e-publico/_supabase-falso.mjs            (porta 54399, ou SUPABASE_FALSO_PORTA)
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { URLSearchParams } from 'node:url';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const PORTA = Number(process.env.SUPABASE_FALSO_PORTA || 54399);
const BASE = `http://127.0.0.1:${PORTA}`;
const SENHA = 'senha-e2e-123';
const CODIGO_TOTP = '123456';

const USUARIOS = {
  'e2e@babel.test': { id: '00000000-0000-4000-8000-00000000e2e1', fatores: [] },
  'e2e-2fa@babel.test': {
    id: '00000000-0000-4000-8000-00000000e2e2',
    fatores: [{ id: 'fator-totp-e2e', factor_type: 'totp', status: 'verified', friendly_name: 'App autenticador' }],
  },
};
const porId = (id) => Object.entries(USUARIOS).find(([, u]) => u.id === id);

/**
 * MODO VITRINE (`npm run vitrine`, `scripts/vitrine/`). Com `SUPABASE_FALSO_CONTAS` apontando para
 * um JSON de contas, este mesmo servidor serve de login para o app completo rodando na máquina do
 * dono, com uma conta por estado de plano. Sem a variável nada muda: o e2e segue com as duas contas
 * acima e sem as rotas abaixo.
 *
 *   GET  /vitrine/entrar?email=…&para=…    "entrar como": devolve ao app já com a sessão na URL
 *   POST /auth/v1/signup                   criar conta (confirmada na hora, sem e-mail)
 *   POST /auth/v1/recover                  recuperar senha (aceita e não envia nada)
 *   PUT  /auth/v1/user                     trocar e-mail ou senha
 *
 * As contas criadas pela tela ficam em `SUPABASE_FALSO_ESTADO` (se definida), para sobreviverem a
 * um reinício junto com o banco da vitrine.
 */
const ARQUIVO_DE_CONTAS = process.env.SUPABASE_FALSO_CONTAS || '';
const ARQUIVO_DE_ESTADO = process.env.SUPABASE_FALSO_ESTADO || '';
const VITRINE = !!ARQUIVO_DE_CONTAS;
const FATOR_DA_VITRINE = { factor_type: 'totp', status: 'verified', friendly_name: 'App autenticador' };

if (VITRINE) {
  for (const c of JSON.parse(readFileSync(ARQUIVO_DE_CONTAS, 'utf8'))) {
    USUARIOS[c.email] = {
      id: c.id,
      fatores: c.doisFatores ? [{ ...FATOR_DA_VITRINE, id: `fator-totp-${c.id.slice(-4)}` }] : [],
    };
  }
  if (ARQUIVO_DE_ESTADO && existsSync(ARQUIVO_DE_ESTADO)) {
    try {
      Object.assign(USUARIOS, JSON.parse(readFileSync(ARQUIVO_DE_ESTADO, 'utf8')));
    } catch {
      console.warn('[supabase-falso] estado da vitrine ilegível; seguindo só com as contas prontas');
    }
  }
}

/** Guarda só as contas criadas pela tela (as que têm senha própria). */
function guardarCriadas() {
  if (!ARQUIVO_DE_ESTADO) return;
  const criadas = Object.fromEntries(Object.entries(USUARIOS).filter(([, u]) => u.senha));
  writeFileSync(ARQUIVO_DE_ESTADO, JSON.stringify(criadas, null, 2));
}

/** O destino do "entrar como" só pode ser o app na própria máquina. */
function destinoLocal(bruto) {
  try {
    const u = new URL(bruto);
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1') ? u : null;
  } catch {
    return null;
  }
}

const { publicKey, privateKey } = await generateKeyPair('ES256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'chave-e2e', alg: 'ES256', use: 'sig' };

function usuarioPublico(email, u) {
  const agora = new Date().toISOString();
  return {
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: agora,
    confirmed_at: agora,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    factors: u.fatores.map((f) => ({ ...f, created_at: agora, updated_at: agora })),
    created_at: agora,
    updated_at: agora,
  };
}

async function sessao(email, aal) {
  const u = USUARIOS[email];
  const agora = Math.floor(Date.now() / 1000);
  const amr = [
    { method: 'password', timestamp: agora },
    ...(aal === 'aal2' ? [{ method: 'totp', timestamp: agora }] : []),
  ];
  const access_token = await new SignJWT({ email, role: 'authenticated', aal, amr, session_id: randomUUID() })
    .setProtectedHeader({ alg: 'ES256', kid: jwk.kid, typ: 'JWT' })
    .setSubject(u.id)
    .setAudience('authenticated')
    .setIssuer(`${BASE}/auth/v1`)
    .setIssuedAt(agora)
    .setExpirationTime(agora + 3600)
    .sign(privateKey);
  return {
    access_token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: agora + 3600,
    refresh_token: `r|${email}|${aal}|${randomUUID()}`,
    user: usuarioPublico(email, u),
  };
}

/** Decodifica (sem verificar — este É o emissor) o token do cabeçalho. */
function doToken(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) return null;
  try {
    const payload = JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString('utf8'));
    const achado = porId(payload.sub);
    return achado ? { email: achado[0], u: achado[1], payload } : null;
  } catch {
    return null;
  }
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

function responder(res, status, corpo) {
  res.writeHead(status, { 'content-type': 'application/json', ...CORS });
  res.end(corpo === undefined ? '' : JSON.stringify(corpo));
}

async function lerCorpo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  const texto = Buffer.concat(partes).toString('utf8');
  try {
    return texto ? JSON.parse(texto) : {};
  } catch {
    return {};
  }
}

const desafios = new Map();

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const p = url.pathname;
  if (req.method === 'OPTIONS') return responder(res, 204);

  if (p === '/auth/v1/.well-known/jwks.json') return responder(res, 200, { keys: [jwk] });

  if (p === '/auth/v1/token' && req.method === 'POST') {
    const corpo = await lerCorpo(req);
    const tipo = url.searchParams.get('grant_type');
    if (tipo === 'password') {
      if (!USUARIOS[corpo.email] || corpo.password !== (USUARIOS[corpo.email].senha ?? SENHA)) {
        return responder(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      }
      return responder(res, 200, await sessao(corpo.email, 'aal1'));
    }
    if (tipo === 'refresh_token') {
      const [, email, aal] = String(corpo.refresh_token || '').split('|');
      if (!USUARIOS[email])
        return responder(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
      return responder(res, 200, await sessao(email, aal === 'aal2' ? 'aal2' : 'aal1'));
    }
    return responder(res, 400, { code: 400, msg: 'grant_type não suportado' });
  }

  if (p === '/auth/v1/user' && req.method === 'GET') {
    const t = doToken(req);
    return t
      ? responder(res, 200, usuarioPublico(t.email, t.u))
      : responder(res, 401, { code: 401, msg: 'invalid JWT' });
  }

  if (p === '/auth/v1/logout') return responder(res, 204);

  if (VITRINE) {
    if (p === '/vitrine/entrar' && req.method === 'GET') {
      const email = url.searchParams.get('email') || '';
      const para = destinoLocal(url.searchParams.get('para') || '');
      if (!USUARIOS[email] || !para) return responder(res, 400, { msg: 'conta ou destino inválido' });
      const s = await sessao(email, 'aal1');
      para.hash = new URLSearchParams({
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_in: String(s.expires_in),
        expires_at: String(s.expires_at),
        token_type: 'bearer',
        type: 'magiclink',
      }).toString();
      res.writeHead(302, { location: para.href, 'cache-control': 'no-store' });
      return res.end();
    }

    if (p === '/auth/v1/signup' && req.method === 'POST') {
      const corpo = await lerCorpo(req);
      const email = String(corpo.email || '')
        .trim()
        .toLowerCase();
      if (!email.includes('@') || String(corpo.password || '').length < 6) {
        return responder(res, 422, {
          code: 422,
          error_code: 'validation_failed',
          msg: 'Signup requires a valid password',
        });
      }
      if (USUARIOS[email]) {
        return responder(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
      }
      USUARIOS[email] = { id: randomUUID(), fatores: [], senha: String(corpo.password) };
      guardarCriadas();
      return responder(res, 200, await sessao(email, 'aal1'));
    }

    if (p === '/auth/v1/recover' && req.method === 'POST') return responder(res, 200, {});

    if (p === '/auth/v1/user' && req.method === 'PUT') {
      const t = doToken(req);
      if (!t) return responder(res, 401, { code: 401, msg: 'invalid JWT' });
      const corpo = await lerCorpo(req);
      if (corpo.password) {
        t.u.senha = String(corpo.password);
        guardarCriadas();
      }
      return responder(res, 200, usuarioPublico(t.email, t.u));
    }
  }

  const desafio = /^\/auth\/v1\/factors\/([^/]+)\/(challenge|verify)$/.exec(p);
  if (desafio && req.method === 'POST') {
    const t = doToken(req);
    if (!t || !t.u.fatores.some((f) => f.id === desafio[1]))
      return responder(res, 404, { code: 404, msg: 'Factor not found' });
    if (desafio[2] === 'challenge') {
      const id = randomUUID();
      desafios.set(id, t.email);
      return responder(res, 200, { id, type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
    }
    const corpo = await lerCorpo(req);
    if (desafios.get(corpo.challenge_id) !== t.email || corpo.code !== CODIGO_TOTP) {
      return responder(res, 422, {
        code: 422,
        error_code: 'mfa_verification_failed',
        msg: 'Invalid TOTP code entered',
      });
    }
    desafios.delete(corpo.challenge_id);
    return responder(res, 200, await sessao(t.email, 'aal2'));
  }

  const admin = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(p);
  if (admin && req.method === 'GET') {
    const achado = porId(decodeURIComponent(admin[1]));
    return achado
      ? responder(res, 200, usuarioPublico(achado[0], achado[1]))
      : responder(res, 404, { code: 404, msg: 'User not found' });
  }
  // Excluir a conta (vitrine): o servidor do app desfaz o vínculo de login pela Admin API.
  if (VITRINE && admin && req.method === 'DELETE') {
    const achado = porId(decodeURIComponent(admin[1]));
    if (!achado) return responder(res, 404, { code: 404, msg: 'User not found' });
    delete USUARIOS[achado[0]];
    guardarCriadas();
    return responder(res, 200, {});
  }

  responder(res, 404, { code: 404, msg: `rota falsa inexistente: ${req.method} ${p}` });
});

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`[supabase-falso] ouvindo em ${BASE}`);
});
