# Decisões desta mudança

## 1. O inventário da auditoria estava vencido — e foi refeito do zero

Esta change foi desenhada para rodar por último justamente porque o que sobra depende do que as
outras aproveitaram. A previsão se confirmou: dos itens que o relatório de 07/09 listava, **três dos
que ele dava como mortos ganharam importador** nas mudanças que vieram depois, e vários outros já
tinham sido removidos por elas.

Números medidos em 08/09, antes e depois de configurar as ferramentas:

| ferramenta | sem configuração | com configuração | real |
|---|---|---|---|
| knip — arquivos sem uso | 44 | 10 | 10 |
| knip — exports sem uso | 144 | 48 | 43 |
| knip — tipos sem uso | 97 | 24 | 11 |
| depcheck — deps sem uso | 8 | — | 2 |

**A diferença entre as colunas é o ponto.** Sem `knip.json`, a ferramenta não sabia que os testes,
os scripts e os três workers são pontos de entrada, e chamava de morto tudo que só eles usam. Rodar
uma ferramenta sem configurá-la e agir sobre a saída teria removido código vivo. Por isso o primeiro
trabalho desta change foi escrever a configuração; o segundo foi conferir símbolo por símbolo com
uma busca por palavra inteira, e só então remover.

Os oito "devDependencies sem uso" do depcheck eram sete falsos positivos (ferramentas de linha de
comando invocadas por `npx` e por script) e um verdadeiro.

## 2. As duas decisões que a tarefa 1.2 pedia

### `ocr.ts` + `tesseract.js`: REMOVER

O painel de OCR saiu da tela em 2026-07-24 por decisão do usuário. O comentário que ficou em
`LiveCapture.tsx` dizia que o motor continuava no repositório "para esse futuro uso", e que a
intenção estava especificada em `openspec/changes/vision-ocr-web`.

**Essa change nunca existiu** — nem aberta, nem arquivada. Eram 128 linhas e 1,7 MB de dependência
guardados por um futuro que ninguém escreveu, exatamente o padrão que a migração 0026 removeu do
banco. Quando o OCR voltar, volta com a mudança que o define e com a biblioteca da época.

### `@axe-core/playwright`: REMOVER

A tarefa dizia "usar no e2e ou remover". Um teste de acessibilidade tem valor real — e é uma
funcionalidade nova, não remoção de código morto. Instalar uma dependência "para usar depois" é
justamente o padrão que esta change existe para acabar; adicioná-la ao e2e agora seria fazer o
mesmo pelo outro lado, com pressa. **Uma catraca de acessibilidade merece a sua própria mudança**,
com decisão sobre o que fazer com as violações que ela certamente vai encontrar numa base que nunca
foi medida.

### `/api/admin/*`: FICAM, e a tarefa estava mal colocada

A auditoria listava as seis rotas de admin como "sem consumidor". Elas não têm UI, e não é a mesma
coisa: são um **console de operador**, chamadas por `curl` com um token de papel `admin`. Duas delas
nasceram nesta própria rodada de mudanças (`armazenamento/reconciliar`, na
`replica-sem-estado-local`; `billing/pendentes`, na `webhook-asaas-sem-pagamento-perdido`) e são o
caminho documentado para operar aquelas duas coisas. Há teste de integração provando o RBAC delas.

"Sem tela" não é "sem leitor".

## 3. Os dois ciclos de importação, e por que eles não eram inofensivos

| ciclo | como foi quebrado |
|---|---|
| `loja.ts` ↔ `desbloqueios.ts` | `nivelNecessario` foi para `loja.ts`, onde está o catálogo que ela lê; a liberação de desenvolvimento foi para `lib/liberacaoDev.ts`, um módulo que não importa nada |
| `filtro.ts` → `source.ts` | `FonteId` e `FonteDeItens` foram para `minigames/types.ts`, o contrato que os dois lados já conhecem |

O segundo era só de TIPO, e some no build — mas o grafo continua cíclico para qualquer ferramenta
que o leia, e um ciclo que "não incomoda hoje" é o que passa a incomodar quando alguém acrescenta um
valor à volta. O primeiro era de valor: dois módulos que só carregam se o outro já tiver carregado,
funcionando pela ordem em que o bundler decidiu avaliá-los.

## 4. O gate cobra ARQUIVO, DEPENDÊNCIA e CICLO — não export sem uso

Esta é a decisão de desenho mais importante da change, e ela é uma escolha, não uma limitação.

**O que entra no CI:** arquivo sem importador, dependência sem uso, import não declarado, ciclo de
importação, e lint com zero avisos. Nenhum desses tem leitura ambígua: são defeito, sempre.

**O que NÃO entra:** export sem chamador. Um barril (`index.ts`) reexporta o que cada tela importa
da origem, e a ferramenta chama isso de export morto — corretamente, do ponto de vista dela, e
inutilmente do ponto de vista de quem vai consertar. Gatear nisso produziria falha por algo que não
é defeito, e a resposta previsível seria alguém desligar o gate inteiro.

Os exports sem uso continuam sendo achado de `npx knip`, que fica no repositório configurado e
pronto para ser rodado à mão. O que não fica é uma catraca que grita por barril.

**Verificado que o gate morde:** um arquivo órfão injetado em `src/lib/` faz `npm run
morto:arquivos` sair com código 1, e o gate volta a passar quando ele é removido.

## 5. Os 155 avisos de lint: 142 mecânicos, 13 com decisão

Os avisos foram tratados guiados pela saída JSON do eslint, não a olho, e em três passadas com
transformação declarada: especificador de import sem uso sai; parâmetro sem uso vira `_nome`;
constante local de uma linha sai. Tudo o que tinha corpo ficou para decisão humana.

O que a decisão humana encontrou não era formatação:

- **`Reading.tsx`** guardava um tutor inteiro — estado de chat, histórico, prompt de sistema, chamada
  ao gateway de LLM, tratamento de erro — que **nada renderizava e nada chamava**. ~50 linhas com uma
  chamada de modelo dentro, esperando uma tela que não veio. O tutor que existe é o iChat global.
- **`Play.tsx`** mantinha um mapa de recordes "para o selo das cartas": o estado era escrito e nunca
  lido, e o efeito ia à REDE a cada toque no painel de recordes para jogar a resposta fora.
- Seis jogos calculavam `progressoPct` e não o desenhavam.
- `Reading.tsx` tinha `fontSize` como estado cujo setter ninguém chamava — um número com passos a
  mais.

### As três supressões de `exhaustive-deps` que ficaram, e por quê

Zero avisos não pode significar "adicionei tudo às dependências". Nos três casos, incluir a
dependência que falta PIORARIA o comportamento, e cada supressão diz isso na linha de cima:

| lugar | o que aconteceria se incluísse |
|---|---|
| `App.tsx` (popstate) | remover e registrar o ouvinte a cada render |
| `Play.tsx` (partida rápida) | o `useCallback` devolveria referência nova sempre, desligando a memorização |
| `LiveCapture.tsx` (retomada) | o efeito dispararia por causa da própria escrita, recarregando a transcrição a cada troca de idioma |

E uma supressão MORTA foi removida de `BlitzGame.tsx`: o próprio lint a reportava como inútil.
Supressão que não suprime nada é pior que nenhuma — quem lê presume que há uma regra sendo dobrada
e vai procurar o motivo.

## 6. Os jogos culturais saem do lint e do knip, não do repositório

Os nove estão ESTACIONADOS por decisão registrada (change `jogos-culturais-dentro-do-sistema`, com
README na pasta): nenhuma rota os importa, e eles ficam como matéria-prima até serem integrados.

Lintar código que ninguém executa produz aviso que ninguém pode agir sobre, e consertar as
dependências de efeito deles seria trabalho sobre um comportamento que não roda — no dia em que
voltarem, tudo neles muda de qualquer jeito. `tsc` continua cobrindo a pasta: eles têm de compilar.

## 7. Achados que a auditoria trazia e que já não existiam

Ditos aqui porque o valor de uma auditoria é o retrato do dia, e o retrato envelhece:

- **Os 7 `catch {}` de `soundFx.ts`**: hoje são 2, e os dois têm motivo escrito. A regra
  `catch-vazio` do ast-grep não acha nenhum no repositório inteiro.
- **`MinigamesShowcase.tsx` e os 12 arquivos de `gamificacao/versao*`**: saíram com as mudanças
  anteriores e com a limpeza da árvore.
- **`seedsDoCofreDoPasse`**: virou `valorDoCredito` na `seeds-e-creditos-fonte-unica`.
- **`distribuicao.ts` e `dificuldade.ts`**: ganharam importador; a segunda passou a ser chamada em
  produção quando `recalcularDificuldade` ganhou gatilho.

## 8. O que fica aberto, com nome

`jscpd` (clones) não entrou como gate. Os 58 clones exatos que a auditoria contou não foram
recontados nem tratados: um limiar de duplicação é uma discussão de arquitetura, não de remoção, e
escolher um número agora seria arbitrário. A ferramenta continua instalada e configurada para quem
quiser abrir esse assunto com dados.
