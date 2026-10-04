# E-mails de autenticação, SMTP e login com Google

O app não envia e-mail de login nenhum: quem envia é o **Supabase Auth**. Este guia é o que se configura no
painel do Supabase (Authentication) para o fluxo da porta funcionar inteiro. Os textos dos e-mails estão em
`docs/auth/emails/`.

## 1. O que a porta faz (código)

| Situação | O que a pessoa vê |
|---|---|
| Criar conta | Senha duas vezes, requisitos marcados ao digitar, e o painel **Confira seu e-mail** com reenvio (espera de 60 s) |
| Criar conta com e-mail que já existe | "Este e-mail já tem conta", com as saídas **Entrar** e **Recuperar senha** |
| Entrar sem ter confirmado o e-mail | "Seu e-mail ainda não foi confirmado", com **Reenviar e-mail de confirmação** |
| Esqueci a senha | O painel **Confira seu e-mail** (frase genérica: não revela se a conta existe), com reenvio |
| Link vencido ou já usado | A porta abre dizendo que o link expirou e como pedir outro |
| Abrir o link de recuperação | Tela **Definir nova senha**, com requisitos e **Cancelar e voltar ao login** |
| Limite de e-mails ou de tentativas, sem rede | Frase própria para cada caso, em vez de erro em inglês |
| Lembrar | O e-mail fica lembrado no aparelho (caixa marcada por padrão); a **senha** é salva pelo gerenciador do navegador, que reconhece os campos |

## 2. URLs (Authentication → URL Configuration)

- **Site URL:** o endereço do app (`https://babel-play-staging.fly.dev` no staging).
- **Redirect URLs:** `<endereço do app>/auth/callback`. Confirmação, recuperação e Google voltam por aí.

## 3. Modelos de e-mail (Authentication → Emails → Templates)

De fábrica os e-mails saem em inglês. Para cada modelo, cole o **assunto** e o **corpo** do arquivo:

| Modelo no painel | Arquivo | Assunto |
|---|---|---|
| Confirm signup | `emails/confirmar-cadastro.html` | Confirme seu e-mail no Babel Play |
| Reset password | `emails/recuperar-senha.html` | Redefinir sua senha do Babel Play |
| Change email address | `emails/trocar-email.html` | Confirme seu novo e-mail no Babel Play |

Os modelos usam só `{{ .ConfirmationURL }}`, que o Supabase preenche.

## 4. SMTP: o limite que trava o lançamento

O envio embutido do Supabase serve só para teste: **poucos e-mails por hora no projeto inteiro** (o painel
mostra o número em Authentication → Rate Limits) e só é garantido para endereços da própria equipe. Com ele,
no dia do lançamento só as primeiras pessoas da hora conseguem criar conta.

Antes de abrir o cadastro em produção, ligue um SMTP próprio em Authentication → Emails → SMTP Settings.
Opções sem custo para o MVP:

| Opção | Limite grátis | Precisa de domínio? |
|---|---|---|
| Brevo | 300 e-mails/dia | Não: valida um remetente (um endereço seu) |
| Resend | 3.000/mês, 100/dia | Sim, para enviar a qualquer pessoa |
| Gmail (senha de app) | cerca de 500/dia | Não; entrega pior e o remetente é o seu Gmail |

Depois de ligar o SMTP, suba "Rate limit for sending emails" em Authentication → Rate Limits.

## 5. Login com Google

O botão **Continuar com Google** fica escondido no build com `VITE_LOGIN_GOOGLE=0` (o staging sobe assim)
porque o provedor não está ligado no Supabase. Para ligar:

1. No Google Cloud Console: criar um projeto, configurar a tela de consentimento (OAuth consent screen) e
   criar uma credencial **OAuth client ID** do tipo *Web application*.
2. Em *Authorized redirect URIs*, colocar a URL que o Supabase mostra em Authentication → Sign In /
   Providers → Google (`https://<projeto>.supabase.co/auth/v1/callback`).
3. Colar o Client ID e o Client Secret nesse mesmo lugar do Supabase e ativar o provedor.
4. Fazer o deploy sem `VITE_LOGIN_GOOGLE=0`.

## 6. O que conferir depois de configurar

1. Criar conta com um e-mail novo: o e-mail chega em português e o link volta para o app já logado.
2. "Esqueci": o e-mail chega, o link abre **Definir nova senha**, e a senha nova entra.
3. Abrir o mesmo link pela segunda vez: a porta avisa que ele expirou.
4. Reenviar antes de 60 s: o botão fica em contagem.
