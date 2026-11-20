# Runbook: dia da aprovação do AdSense (anúncios no ar)

Põe no ar o Worker de anúncios `frasy-anuncios` em `https://ads.frasy.com.br` e prepara o app para embuti-lo.
Desenho e limites: `docs/deploy.md` → "Anúncios"; a flag: `docs/flags.md` → `anuncios`. Nada aqui liga a flag:
**ligar é ato do dono** (passo 9), e só depois do parecer jurídico (ECA Digital).

**Atenção:** a página de anúncios fala o GPT do **Google Ad Manager** (blocos `/<código da rede>/frasy-<espaço>`).
A aprovação do AdSense (`ca-pub-1486600930788406`) sozinha não basta: falta a conta do Ad Manager vinculada a
ele e o **código da rede** (só dígitos). Pôr o `ca-pub-…` em `VITE_ANUNCIOS_REDE_CONTA` faz o build falhar de
propósito.

## Antes (dono, nos painéis)

1. **AdSense:** confirmar que `frasy.com.br` está "Pronto" (Sites). O `/ads.txt` já está no ar
   (`google.com, pub-1486600930788406, DIRECT, f08c47fec0942fa0`).
2. **Ad Manager:** abrir o Google Ad Manager com a mesma conta Google e vinculá-lo ao AdSense. Anotar o
   **código da rede** (Admin → Configurações globais). Em Inventário → Sites, adicionar `frasy.com.br` (cobre o
   subdomínio `ads.`). Se o Ad Manager pedir no `ads.txt` uma linha diferente da acima, avisar o Claude (hoje o
   gerador grava uma linha só, a de `ADSENSE_PUB_ID`).
3. **Blocos de anúncio** (Inventário → Blocos de anúncios), código exatamente `frasy-<espaço>`:
   - nativos, tamanhos `300x250` e `fluid`: `frasy-inicio-nativo`, `frasy-bib-infeed`, `frasy-fim-bloco`,
     `frasy-trilha-oferecida`, `frasy-jogar-miniatura`, `frasy-jogar-faixa`, `frasy-loja-tema`, `frasy-ancora`,
     `frasy-estat-faixa`;
   - premiados (formato "Rewarded", fora da página): `frasy-fim-premiado`, `frasy-loja-seeds` (os outros premiados o
     provedor real esconde, R39).
4. Passar ao Claude **só o código da rede** (não é segredo: vai a todo navegador no `config.js`).

## No dia (Claude, do checkout da `main` atualizada, com o `wrangler` logado na conta do dono)

5. **Publicar a página de anúncios** (cria o Worker `frasy-anuncios`, o DNS e o certificado de `ads.frasy.com.br`):

   ```bash
   APP_URL=https://frasy.com.br VITE_ANUNCIOS_REDE_CONTA=<código da rede> npm run anuncios:build
   npx wrangler deploy -c wrangler.anuncios.jsonc --env=""
   ```

   Conferir (o certificado pode levar alguns minutos):

   ```bash
   curl -sI https://ads.frasy.com.br/espaco.html   # 200; CSP com "frame-ancestors https://frasy.com.br"; sem Cross-Origin-*
   curl -s  https://ads.frasy.com.br/config.js     # {"rede":"<código>","app":"https://frasy.com.br"}
   ```

6. **Origem no Worker do app** (secret, como no staging; sobrevive aos deploys):

   ```bash
   printf 'https://ads.frasy.com.br' | npx wrangler secret put ANUNCIOS_ORIGEM -c wrangler.jsonc --env=""
   ```

7. **Origem no build do app** e novo deploy:

   ```bash
   gh variable set VITE_ANUNCIOS_ORIGEM --env production --body https://ads.frasy.com.br
   gh workflow run deploy-worker.yml -f ambiente=production && gh run watch "$(gh run list -w deploy-worker.yml -L1 --json databaseId -q '.[0].databaseId')"
   ```

8. **Conferir com a flag desligada** (nada deve mudar para quem usa):

   ```bash
   curl -sI https://frasy.com.br/app | grep -i content-security-policy   # SEM ads.frasy.com.br (flag desligada)
   ```

   Nunca definir `VITE_ANUNCIOS_DEMONSTRACAO` no Environment `production`.

## Ligar (dono decide)

9. Pré-requisitos de `docs/flags.md` → `anuncios` (jurídico, rede aprovada, bancada com rede real). Ligar primeiro
   só para o dono (regra `ids`, `percentual: 0`) pelo **Admin → Flags** ou pela CLI de operação
   (`node dist-server/operacao.cjs flags definir anuncios '{"habilitada":true,"regras":{"ids":["<id do dono>"],"percentual":0}}'`).
10. **Conferir** (até 60 s depois, por isolate): a CSP do app passa a ter `frame-src … https://ads.frasy.com.br`;
    numa conta Grátis adulta com mais de 3 dias, aceitar a folha de consentimento e ver um espaço preenchido; no
    console, nenhuma violação de CSP; no Ad Manager, impressões no bloco. Depois, `percentual` aos poucos.

## Desligar

- **Rápido:** desligar a flag `anuncios` (sem deploy; a CSP volta em até 60 s e nenhum espaço renderiza).
- **Página:** publicar de novo sem rede (`APP_URL=https://frasy.com.br npm run anuncios:build` + o deploy do
  passo 5): a página só responde `vazio`.
