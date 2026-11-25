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

## Revisão de 25/11/2026

- **Estado: precisa decisão (a fatia 1 está pronta; as seguintes esperam prioridade).** A fatia 1 foi entregue em 10/10 e a revisão enxuta (bloco 3) logo depois. Depois disso a tela mudou: a aba "Baralhos" saiu em 11/10 e deu lugar à ficha de conteúdo (seletor único para Cartões, Jogar e Biblioteca), e hoje há as abas Hoje e Palavras, com Memória e "Trazer e levar" fora da faixa. O servidor já guarda `resposta_ms` por revisão, etiquetas e força 1 a 4; a Memória ainda diz que o app "não mede" tempo. Esta change não tinha `specs/`; foi criado `specs/cartoes/spec.md` com o que as fatias abertas prometem.
- **O que ficou velho:** a descrição "cinco abas" e "aba Baralhos" (proposal e bloco 4); a ideia de que o Anki é lido no servidor (bloco 7); 3.7 (tempo) e 6.1/6.2 (filtros e etiquetas) já têm base no servidor; 4.1 está coberto pela ficha de conteúdo e foi marcado como feito. Recomendação: **fatiar**, não tratar as 31 tarefas como uma entrega. Fazer só o bloco 2 (limites e confiança na revisão) e as pontas de Anki (7.2, 7.3); o resto (blocos 5, 6, 8, 9) vira backlog por demanda.
- **Esforço: G no total (31 tarefas); a fatia recomendada (2.1 a 2.6, 7.2 e 7.3) é M.** 2.2 e 4.3 mexem em dado gravado (migração e backup).
- **Valor para quem usa: alto no bloco 2** (limite de verdade e nota que não se perde são o que a pessoa nota na revisão diária, o núcleo do produto); médio para Anki (7.x); baixo a médio no restante (descoberta, navegador, sequência).
- **Dependências:** `modelo-do-aluno-e-dados` vem DEPOIS (seletor único de revisão) e divide 2.1, 2.2, 3.7 e 8.3; `motor-anki-mapeador` (7.1) e `motor-anki-jogos` antes do bloco 7; `polimento-movimento` antes de 9.3. Arquivos de conflito: `src/lib/revisao/preferencias.ts`, `Study.tsx`, `RevisaoDoQuest.tsx`, `src/components/views/Cartoes.tsx` e `views/cartoes/*`, `server/routes/vocab.ts`, `server/db/repositories/resumoDosCartoes.ts`. Planos v4: o limite diário não é cota; se o dono quiser limite por plano (por exemplo, menos revisões no Grátis), isso entra em `src/core/planos.ts` e é decisão de produto, não desta change.
- **Decisões do dono:**
  1. Priorizar a revisão espaçada frente às outras frentes? (a) sim, só o bloco 2 e as pontas de Anki, em PRs pequenos (recomendado); (b) esperar `polimento-movimento` terminar; (c) manter só a fatia 1 e arquivar o resto como backlog.
  2. Opções da revisão na conta (2.2), com migração nova: (a) sim, com backup e ensaio (recomendado, destrava os dois aparelhos); (b) manter no aparelho e fazer só o limite diário no servidor; (c) não guardar nada novo na conta.
  3. Dois botões como padrão da revisão (D.5 de `modelo-do-aluno-e-dados`): (a) manter quatro como padrão e oferecer dois nas Opções (recomendado agora); (b) dois como padrão para quem é novo; (c) só dois.
  4. Guardar o tempo de resposta (3.7): (a) sim, só para a pessoa ver, fora de anúncio e de perfil (recomendado); (b) guardar sem mostrar; (c) não guardar. Pede o mesmo parecer de privacidade dos anúncios.
