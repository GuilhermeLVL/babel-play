# Lançamento do Babel Play — indie, build in public, custo zero

**Decisão (2026-08-25):** lançar como *pessoa que constrói e mostra*, não como startup pedindo
programa. Reconhecimento e público vêm de publicar o produto, o código e a história técnica —
com honestidade e medição. Programas de startup (incubadora, créditos, editais) ficam
**condicionados à tração**: só entram se o lançamento mostrar uso real.

Por quê: sem nome e sem equipe, os programas ou rejeitam (Google Accelerator exige receita e ≥5
funcionários; Cientista Empreendedor exige incubadora) ou cobram burocracia sem retorno agora. A
trilha indie começa do zero sem pedir permissão — e é ela que gera o nome que os programas depois
pedem. Pesquisa completa (fontes) no repositório privado de auditoria.

## O princípio
**Build in public é rotina, não evento.** Um post curto por semana sobre uma decisão real do
projeto vale mais em 3 meses do que qualquer prêmio. Cada post: um problema, o que foi medido, o
que foi decidido, o que ainda não funciona.

## As 3 semanas até o lançamento

### Semana 1 — existir (você) + subir (eu)
- **Você:** registrar domínio `.com.br` + e-mail no domínio; criar o repositório no GitHub e
  fazer o push (fecha F0-07, CI roda). Dizer se o projeto Supabase é novo (fecha F15-01).
- **Eu:** front em Cloudflare Pages (banda ilimitada — o app serve modelos ONNX de dezenas de
  MB por visitante), API em Google Cloud Run (free tier, não dorme), banco em Turso (mesmo
  driver, sem port), `AUTH_REQUIRED=1`, modo sem conta como porta de entrada. Landing de uma
  tela: o que é · "experimente sem conta" · link do repo · política de privacidade.
  Analytics sem cookie (Cloudflare Web Analytics) para ter números depois.

### Semana 2 — abrir o código + contar a história
- **Eu:** repositório público do núcleo — `src/core/` (isomórfico), `src/gateway/` (Whisper
  WebGPU/WASM, Opus-MT, Translator API do Chrome, VAD, captura), `src/data/efemero/` (servidor
  em memória: zero requisições sem conta). Licença MIT. README com GIF, demo, arquitetura e os
  números medidos. Servidor/billing continuam privados.
- **Eu:** demo pública sem login também em **Hugging Face Static Space** (grátis).
- **Você, com meu esqueleto:** o write-up técnico na sua voz —
  *"Whisper + Opus-MT no navegador via WebGPU: o que quebra na prática"* — latências medidas,
  o cluster que PIORA a vazão (SQLite), o modo sem conta com 0 requisições, os defeitos que a
  auditoria pegou no próprio instrumento. Esqueleto no repositório privado.
- Vídeo de 60 s: transcrição ao vivo com o **DevTools Network vazio** — a prova visual.

### Semana 3 — lançar
- **Terça, 05:01 BRT:** Product Hunt (conta pessoal — empresa é proibida). Sem pedir upvote;
  responder todo comentário.
- **Quinta (D+2):** **Show HN** com link direto para a demo sem login; primeiro comentário
  seu: por que construiu, o que NÃO funciona ainda, números reais.
- **Mesma semana:** o write-up no Dev.to/Hashnode + LinkedIn (em português) ; post no grupo
  `chrome-ai-dev-preview-discuss` (o DevRel do Chrome AI responde lá); PRs em `awesome-webgpu`
  e nos exemplos do `transformers.js`.
- **Grátis e pequeno, vale fazer:** GESAwards Brasil (formulário até 15/09) — uma hora de
  trabalho; rascunho no repositório privado.

## Depois do lançamento — rotina
1 post/semana (decisão real + número). Responder issues do repo. Medir: visitantes, quem chega
a capturar, quem cria conta. Esses três números decidem tudo abaixo.

## Programas — só se houver tração (não antes)
| Se acontecer… | então vale… |
|---|---|
| Show HN/PH com centenas de visitas e gente voltando | créditos de nuvem (Cloudflare Tier 3, Google Start) — expiram, pedir só com carga |
| Primeiros usuários pagando o Pro (plano muda pelo admin até ter billing) | incubadora em MG (INOVA UFMG/BHTec) → Cientista Empreendedor 2027 |
| Repo com estrelas e contribuições | GitHub Accelerator quando abrir cohort |
| Chrome Built-in AI Challenge 2026 anunciado (histórico set–nov) | inscrever — o app já usa a Translator API |

## Custo
Domínio ~R$ 40/ano. Todo o resto R$ 0 (Pages, Cloud Run, Turso, HF, Supabase free com ping
anti-pausa). Supabase Pro US$ 25 só se quiser garantia na semana do lançamento.

## Não fazer agora
Pedir créditos · escrever para incubadora · editais · Postgres/RLS · billing real · extensão Chrome.

## Verificação
Demo no ar sem login com 0 requisições a `/api` (sonda anônima); CI verde no GitHub; repo
público com README e demo; write-up publicado; PH e Show HN feitos; analytics recebendo.
