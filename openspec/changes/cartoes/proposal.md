> **Cartões, em fatias.** Pesquisa e conceito: `docs/auditoria/2026-10-10-cartoes-e-descoberta.md`. Protótipo
> aprovado: `docs/prototipos/cartoes.html` (fontes em `cartoes-src/`: `cartoes.js` a tela, `cartoes2.js` a revisão,
> `cartoes3.js` a navegação). A fatia 1 está feita (10/10/2026); as outras estão em `tasks.md`.

## Why

A revisão espaçada é o que o produto existe para fazer, e não tinha lugar: `/revisar` era uma pseudo-aba da
sessão, sem item de menu, aparecia no Início só com palavra vencendo e voltava para o Vocabulário, que estava
dentro do "Mais". Os baralhos do Anki ficavam a três toques, com o desenho antigo. As estatísticas da memória
estavam espalhadas entre Estatísticas e Vocabulário, e o que `review_logs` guarda (retenção medida, botões
usados) não tinha tela nenhuma.

Dois defeitos saíram junto, medidos na leitura do código:

- sem `id`, a rodada ficava presa à sessão mais recente (`Analysis` passava a gravação para `Study`, que
  filtrava por ela): "Revisar agora" do Início revisava só as palavras da última gravação;
- sem gravação nenhuma (quem só tem baralho do Anki), a revisão abria "Nenhuma sessão ainda".

## What Changes

**Fatia 1 (feita): a tela, a porta e o que já tem dado real.**

- **Tela `/cartoes`** com as cinco abas do protótipo: Hoje, Baralhos, Palavras, Trazer e levar, Memória
  (`/cartoes/<aba>`). A aparência é a do protótipo (`cartoes.css` copiado por `scripts/polimento/trazer-css.mjs`);
  o dado é o do app.
- **A revisão mora na tela**: `/cartoes/estudar[/<sessão>]` abre a rodada que já existia (sem redesenho) e o
  voltar dela volta para Cartões. `/revisar` e `/vocabulario` continuam valendo e levam ao lugar novo.
- **Uma leitura só, pequena**: `GET /api/vocab/resumo` (contagens por fase e por baralho, previsão de 30 dias,
  calendário de 84 dias, retenção medida, botões usados), com ETag pela versão dos dados. Abrir a tela não baixa
  mais o baralho inteiro.
- **Navegação**: no computador o trilho passa a ser Início, Capturar, Intérprete, Biblioteca, Cartões, Jogar;
  Estatísticas e Personalizar descem para o "Mais". No celular a barra é Início, Praticar, Capturar, Intérprete,
  Mais, e "Praticar" tem as abas Cartões e Jogos (a última usada é lembrada).
- **Início**: o ladrilho dos Cartões é fixo, com o número do dia.
- **Revisão**: aceita o recorte "Só 10 agora" e "Mais N novas" (`rodada` em `Study`), além do recorte por sessão
  que já existia. As opções da revisão saíram de dentro de `Study` para `lib/revisao/preferencias`.

**Fatias seguintes** (o que o protótipo mostra e o app ainda não faz de verdade; nada disso aparece na tela com
número inventado): ver `tasks.md` e `openspec/changes/polimento-movimento/fidelidade/ficou-de-fora.md`, seção
"Cartões: fatias seguintes".

## Impact

- Código: `src/components/views/Cartoes.tsx` e `views/cartoes/*`, `src/lib/cartoes/*`, `src/lib/revisao/*`,
  `src/lib/rotas.ts`, `src/lib/estado/useNavegacao.ts`, `src/components/shell/*`, `InicioDoQuest.tsx`,
  `Study.tsx`, `Analysis.tsx` (a revisão saiu de dentro da sessão), `Metrics.tsx` e `VocabularioDoQuest.tsx`
  (modo embutido), `server/routes/vocab.ts`, `server/db/repositories/resumoDosCartoes.ts`.
- Rotas: nova `GET /api/vocab/resumo` (só com conta; sem conta a tela abre no estado vazio e não a chama).
- Endereços: `/cartoes`, `/cartoes/<aba>`, `/cartoes/estudar[/<id>]`; `/revisar` e `/vocabulario` viram
  endereços de leitura.
- Sem migração de banco.
