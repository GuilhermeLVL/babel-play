# Babel Play

**Aprenda um idioma com o que você já assiste, joga e conversa.** Transcrição e tradução ao vivo
de qualquer áudio do computador — rodando **dentro do navegador** — transformadas em jogos de
vocabulário e revisão espaçada.

[English](README.md) · [Experimente sem conta](#experimente) · [Como funciona](#como-funciona) · [O que ainda não funciona](#o-que-ainda-não-funciona)

> Demo: `https://<domínio>` — chega com o deploy público. Até lá: rode localmente em 3 comandos.

## Experimente

```bash
npm install          # também copia os binários do ONNX Runtime / Silero VAD para public/
cp .env.example .env # defina PORT; nenhuma chave de API é necessária para o pipeline local
npm run dev          # → http://localhost:<PORT>   (abra via localhost: contexto seguro para os modelos)
```

Escolha **Continuar sem conta**: o pipeline inteiro roda localmente e **nenhuma requisição**
chega ao servidor — isso é medido, não prometido.

## O que faz

- **Captura** uma aba do navegador, o som do sistema (loopback no Windows, sem configurar) ou o microfone.
- **Transcreve** com Whisper no navegador (WebGPU, fallback WASM) — inglês no `whisper-tiny`,
  outros idiomas num modelo maior; o perfil *privado* nunca toca a nuvem.
- **Traduz** com Opus-MT local, a Translator API do Chrome, ou um LLM de nuvem quando você está
  logado e num plano pago — sempre com cadeia de fallback, nunca legenda vazia.
- **Ensina**: cada palavra ouvida pode virar cartão; nove jogos curtos e revisão FSRS-5 sobre o
  *seu* vocabulário, com trilha CEFR (listas reais, nunca nível chutado).
- **Conta é opcional**: sem ela, os dados ficam no IndexedDB; ao criar conta, sobem uma vez.

## Como funciona

Um único funil HTTP (`src/data/api.ts#apiFetch`). Sem conta, ele responde por um servidor em
memória sobre IndexedDB (`src/data/efemero/`) com as mesmas formas do servidor real. Três eixos
independentes: identidade (anônimo · conta · self-host), plano (só o servidor decide), papel.
Servidor: Express + Drizzle em libsql/SQLite (pronto para Turso), JWT do Supabase (JWKS),
isolamento por usuário em todo repositório, rate limit, Zod em toda fronteira, guarda anti-SSRF.

Mais em [docs/arquitetura.md](docs/arquitetura.md).

## Medido, não prometido

- Modo sem conta: **0 requisições a `/api`** no fluxo completo (sonda com `fetch` contador).
- Contraste: 0 nós abaixo do WCAG AA em 14 combinações; 0 alvos abaixo de 24 px.
- Capacidade (um processo, cpuset de 4 CPUs, carga de escrita): ~300 req/s; mais workers de
  cluster **reduzem** a vazão — o SQLite tem um escritor só.
- Auth: 7 vetores de token forjado recusados pelo verificador real, e um controle positivo aceito.
- 1.850+ testes; typecheck, lint, build e auditoria de dependências a cada push.

## O que ainda não funciona

- Opus-MT int8/fp16 falha em alguns dispositivos (ONNX Runtime `qdq_actions`); cai para o
  próximo tradutor, que pode não existir sem conta.
- Áudio de compartilhamento de tela no Windows pode dar `NotReadableError`; use aba ou loopback.
- Rodadas jogadas sem conta não migram para a conta (sessões, áudio e cartões migram).
- Banco de escritor único: serve para beta, não para escala.
- Sem cobrança ainda — o plano é definido pelo admin.

## Verificar

```bash
npm run typecheck && npm run typecheck:core && npm run lint && npm test && npm run build
```

[Contribuir](CONTRIBUTING.md) · [Segurança](SECURITY.md) · [MIT](LICENSE)
