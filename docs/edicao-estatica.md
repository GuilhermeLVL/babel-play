# Edição estática (Cloudflare Pages)

A edição estática é o Babel Play publicado **só como arquivos**, sem o servidor Node: é o que roda
em <https://babel-play.pages.dev/>. Tudo acontece no navegador — transcrição e tradução locais
(Whisper/Moonshine + Opus-MT via WebGPU/WASM), jogos, repetição espaçada — e os dados ficam no
IndexedDB do próprio navegador (`babel-local`).

Ela é ligada no build por `VITE_EDICAO_ESTATICA=1` (`src/lib/edicaoEstatica.ts`). Sem a variável,
o build normal (`npm run build`) não muda em nada.

## Publicar

```bash
npm run build:estatica
npx wrangler login            # uma vez, na conta Cloudflare do dono
npx wrangler pages deploy dist --project-name babel-play
```

`npm run build:estatica` (`scripts/build-estatica.mjs`):

- roda só o `vite build` (o `dist-server/` não existe no Pages), com `VITE_EDICAO_ESTATICA=1` e as
  variáveis `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_AUTH_REQUIRED` **vazias**, mesmo
  que o ambiente de quem compila as tenha;
- confere o `dist/` e falha se algo estiver fora do lugar: `index.html` e `_headers` presentes
  (COOP `same-origin` + COEP `credentialless`, vindos de `public/_headers`), nenhum arquivo de
  protótipo nem `lucide.min.js`, nenhuma URL de projeto Supabase no bundle.

O `wrangler login` abre o navegador para autorizar a conta Cloudflare — é um passo do dono, não
do build.

## O que muda na edição estática

| Área                                                                   | Build normal                                     | Edição estática                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| Identidade                                                             | `selfhost`, `carregando` → `anonimo`/`conta`     | `anonimo` desde o arranque, e não muda                         |
| Rede `/api`                                                            | servidor real (ou servidor em memória sem conta) | **nunca**: tudo no servidor em memória (`src/data/efemero`)    |
| Flags (`/api/flags`)                                                   | perguntadas ao servidor                          | cache/padrão embutido, sem pergunta nem refresh                |
| Métricas de oferta e de captura                                        | enviadas                                         | descartadas em silêncio (nem beacon)                           |
| Login, criar conta, menu com "Entrar"                                  | presentes                                        | ausentes                                                       |
| Planos, checkout, compra de Créditos, ofertas de plano                 | presentes                                        | ausentes; `/plano` mostra "Disponível na versão completa"      |
| IA de nuvem (Groq Whisper, LLM do servidor, iChat, "Usar a sua chave") | oferecida                                        | indisponível; o roteador de STT nunca escolhe nuvem            |
| Importação pelo servidor (YouTube, web, documentos, Anki)              | presente                                         | ausente                                                        |
| Ranking global                                                         | presente                                         | ausente (só os recordes do aparelho)                           |
| Biblioteca, Vocabulário, Análise, Perfil                               | telas completas com conta                        | cartão "Disponível na versão completa", com "Voltar ao início" |
| Teto local (5 gravações, 80 palavras)                                  | mensagem convida a criar conta                   | mesmo teto; a mensagem diz que é a edição de demonstração      |

## Limitações

- **Os dados moram só neste navegador.** Limpar os dados do site ou trocar de aparelho leva tudo
  junto; não há sincronização nem cópia de segurança.
- **Teto de demonstração:** até 5 gravações e 80 palavras no caderno (`src/core/tetoAnonimo.ts`).
- **Sem Biblioteca, Vocabulário, Análise e Perfil** — essas telas guardam dados no servidor e só
  existem na versão completa. Jogar, Capturar, Estatísticas, Personalizar, Ajustes, Sobre e Ajuda
  funcionam.
- **Sem IA de nuvem:** transcrição e tradução são sempre locais (o primeiro uso baixa o modelo,
  com barra de progresso). O MyMemory (API pública de tradução, sem chave) continua na cadeia
  como reserva.
- **Sem importação** de YouTube, páginas web, documentos ou baralhos Anki.
- **Captura do áudio do sistema pelo servidor local (WASAPI/loopback)** não existe; a captura de
  aba/tela do navegador e o microfone continuam.
- **Sem cadastro, planos, pagamento, ranking global e suporte com conta.**

## Verificação

```bash
npm run build:estatica
npx playwright test -c playwright.estatica.config.ts
```

A e2e (`tests/e2e-estatica/`) serve o `dist/` com um servidor estático que imita o Pages
(`_servidor-estatico.mjs`: fallback de SPA para o `index.html`, inclusive em `/api/*`, e os
cabeçalhos globais de `_headers`) e, em 1280 px e 375 px, confere: zero requisições a `/api`,
zero erros no console, nenhum botão de login/planos à vista, o cartão honesto nas telas que só
existem na versão completa, e uma rodada inteira de jogo sem microfone (palavras da Trilha)
gravada no IndexedDB. As regras de unidade estão em `tests/edicao-estatica.test.ts` e
`tests/edicao-estatica-telas.test.tsx`.
