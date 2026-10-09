# Suíte e2e (Playwright)

## Como rodar

```bash
npm run test:e2e        # a suíte inteira, nos três viewports (headless, Chromium)
npm run test:e2e:ui     # modo UI do Playwright (útil para depurar)
npx playwright test --project=mobile-375 tests/e2e/seeds.e2e.ts   # um arquivo, um viewport
bash scripts/testes/matriz-e2e.sh                                  # a matriz em lotes (ver abaixo)
```

O `playwright.config.ts` sobe o app sozinho (`npm run dev:local`, porta 3100, sem login) via
`webServer` e espera responder antes de começar. Se você já tem `npm run dev:local` rodando num
terminal, o Playwright reaproveita esse servidor (`reuseExistingServer`, fora de CI) em vez de
subir um segundo — não precisa parar o seu.

**Três viewports, um motor.** Os projetos são `mobile-375` (375×812, com toque), `tablet-768`
(768×1024) e `desktop-1280` (1280×800). A navegação é uma só, o trilho de ícones
(`nav.q-trilho`), mas ela muda com a largura: abaixo de 720 px vira a barra de cinco destinos, e
Estatísticas e Personalizar passam ao painel "Mais". Um projeto só, de desktop, nunca tocaria na
barra. Os testes falam por papel e nome acessível (`getByRole`) e por `data-testid`, então o mesmo
teste vale nos três; onde a tela muda de verdade com a largura, o teste diz o que espera em cada uma.

**Banco.** O servidor usa o `DATABASE_URL` do ambiente e, sem ele, o padrão `file:./data/babel.db`
— o SEU banco. Os testes gravam de verdade (filtro, recorte, rodadas, compras de Seeds). Rode
contra uma cópia:

```bash
cp data/babel.db /tmp/e2e.db          # (e os -wal/-shm, se existirem)
DATABASE_URL=file:/tmp/e2e.db AUDIO_DIR=/tmp/e2e-audio npm run test:e2e
```

**`globalSetup`** (`_global-setup.ts`) marca `settings.ui.onboarded` pelo mesmo `PUT /api/settings`
que o Onboarding usa. Sem isso, um banco novo — o caso da CI — abre a app no Onboarding, que não
tem `<main>`, e 20 de 26 testes falhavam antes do primeiro passo. Era por isso que a suíte passava
na máquina de quem a escreveu e nunca na CI.

**Fixtures por API, não pela tela** (`_fixtures.ts`): as suítes que precisam de baralho, rodada ou
saldo semeiam por `POST /api/vocab/bulk-add` e `POST /api/exercises/rodada` no `beforeAll`, e as
que precisam de um baralho do Anki importam o `.apkg` de exemplo (`tests/fixtures/`) por
`POST /api/import/anki`. Criar o mesmo estado pela interface amarraria cada suíte ao formulário de
outra tela.

**Rótulos.** Os seletores seguem os rótulos acessíveis atuais (desenho de 09/10/2026, o único): o
painel da fonte ("O que você vai praticar") abre pelo chip **"Trocar: …"** do cabeçalho do lobby, a
importação pelo botão **"Trazer do Anki"** e a tela de baralhos por **"Gerenciar baralhos"**, os
dois dentro do painel. Os caminhos que as suítes dividem estão em `_helpers.ts` (casca, lobby,
painel "Mais"), `_jogos.ts` (do cartão ao fim da rodada) e `_captura.ts` (iniciar e encerrar).
Quando um rótulo muda na tela, o teste falha no mesmo commit e é atualizado junto — nunca desligado.

## O que a suíte cobre

| Arquivo                                | Fluxo                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `fumaca.e2e.ts`                        | a casca carrega e a navegação principal leva a `/jogar`                        |
| `grade-so-com-jogos-do-sistema.e2e.ts` | a grade só anuncia jogo que registra progresso                                 |
| `sessao-de-jogo.e2e.ts`                | Memória, Termo e Bao (cultural) do início ao fim da rodada                     |
| `fsrs-revisao.e2e.ts`                  | avaliar um cartão move o `due` no servidor                                     |
| `seeds.e2e.ts`                         | o saldo da tela é o do servidor; o item mais barato diz o preço ou o que falta |
| `dois-dispositivos.e2e.ts`             | a mesma conta em dois navegadores; compra simultânea não fura o saldo          |
| `estatisticas.e2e.ts`                  | os contadores batem com `GET /api/vocab`                                       |
| `tema.e2e.ts`                          | o tema escuro sobrevive ao F5 e a um navegador limpo                           |
| `transcricao.e2e.ts`                   | a tela de captura e o painel de motor renderizam                               |
| `baralhos.e2e.ts`                      | importação Anki e a tela de baralhos                                           |
| `facetas.e2e.ts`                       | o recorte no painel da fonte, e o recorte por baralho que persiste no F5       |
| `trilha-carregamento.e2e.ts`           | a contagem do curso nunca passa por zero                                       |
| `idioma-da-interface.e2e.ts`           | o seletor só oferece idioma com tradução pronta                                |
| `pseudo-localizacao.e2e.ts`            | nada corta com texto 40% mais longo                                            |
| `duas-superficies-alcancaveis.e2e.ts`  | as cinco abas de Personalizar, e os endereços de antes                         |
| `fundacao.e2e.ts`                      | acessibilidade (axe) de Início e Ajustes, o trilho e o "Mais", o iChat fixo    |
| `planos-pagamento.e2e.ts`              | Planos, checkout e confirmação no self-host: nada a cobrar                     |
| `fim-da-captura.e2e.ts`                | 600 falas salvas em lotes; sair não trava nem duplica                          |
| `legendas-flutuantes.e2e.ts`           | a janela flutuante dentro do app: espelho, pausar, fechar                      |
| `captura-no-celular.e2e.ts`            | a captura num Pixel 7 sem captura de tela: Rápido e Privado                    |
| `modo-interprete.e2e.ts`               | a conversa frente a frente: por toque, com voz natural, automático             |
| `sessao-direta.e2e.ts`                 | `/sessao/<id>` aberta direto, com a lista atrasada                             |
| `rota-de-aquisicao.e2e.ts`             | a peça trancada diz como se consegue                                           |

## O que ela NÃO cobre, e por quê

Cada um destes é um `test.skip` com o motivo escrito no próprio arquivo — nunca um teste
silenciosamente ausente:

- **Login real** (`login.e2e.ts`): exige um projeto Supabase de teste com URL e chave compilados no
  bundle. O caminho está coberto no nível HTTP em `tests/caracterizacao/auth-e-conta.test.ts`, com
  JWT ES256 assinado localmente (401 sem token, 403 suspenso, isolamento entre dois usuários).
- **Gravar e transcrever** (`transcricao.e2e.ts`): exige microfone e modelo local.
- **Tetos do modo sem conta** (`limites-anonimo.e2e.ts`): `estaAnonimo()` só é verdade com
  `VITE_AUTH_REQUIRED=1` e projeto Supabase configurado, e `dev:local` força `0`. A regra está
  coberta no core (vitest).
- **Verificação visual/exploratória**: continua por inspeção com o MCP chrome-devtools. Esta suíte
  prova que os caminhos funcionam, não que estão bonitos.

Os testes de `baralhos` e `facetas` que dependem de haver baralho importado **não pulam mais**: a
fixture `semearBaralhoAnki` importa o baralho de exemplo quando o servidor não tem nenhum.

## Quando o processo do Playwright morre

Numa máquina de desenvolvimento Windows, o processo morre quando um único comando passa de ~30
testes: medido em 9/114 e em 32/38, sempre **sem falha de asserção** e sempre com o JSON por
escrever. Não é o teste, é o processo. Para rodar a matriz inteira localmente use
`scripts/testes/matriz-e2e.sh`, que a quebra em cinco lotes por projeto e grava um JSON por lote —
a morte de um lote não apaga o resultado dos outros. Na CI (Ubuntu) o comando único segue valendo.

## Convenção de arquivos

- `*.e2e.ts` nesta pasta → Playwright (`testMatch` em `playwright.config.ts`).
- `_helpers.ts`, `_fixtures.ts`, `_global-setup.ts` → apoio, não são testes (o `_` os mantém fora
  do `testMatch`).
- `tests/**/*.test.ts` → Vitest (`npm test`), inclusive `tests/caracterizacao/`, que exercita as
  mesmas rotas por HTTP sem navegador.
