# Auditoria: recompensas, personalização, conquistas e notificações (27/09/2026)

Três frentes em paralelo: inventário do código, ciclo de recompensa dos 18 mini games e pesquisa de
referências (jogos e legislação). Caminhos relativos à raiz do repositório.

## 1. Diagnóstico em uma frase

O catálogo é grande (130 itens) mas quase todo **invisível ou irrelevante para a ação principal**. As
recompensas que o usuário ganha jogando são pequenas, desconectadas do desempenho e mal comunicadas.
E há mecânicas que colidem com o ECA Digital e o Decreto 12.880/2026.

## 2. Achados

### 2.1 Catálogo (o que o usuário coleciona)
| Categoria | Itens | Problema |
|---|---|---|
| Cursor (emoji) | 27 | Emoji desenhado em SVG 28px (`src/lib/cursores.ts:64`). Só o próprio usuário vê; destoa do design (lucide + tokens) |
| Pack de emoji | 33 + 8 categorias + editor | Só aparece se a partícula ou o rastro "emoji" estiver equipado (`src/lib/motorDeParticulas.ts:248`). Na prática, invisível |
| Rastro do mouse | 25 | 5 formas; o resto é recolor (`src/core/loja.ts:1195`). Não existe no celular nem no Quest |
| Partículas | 8 | Só aparecem na comemoração |
| Temas | 8 | O item de maior impacto, mas são paletas estáticas; nenhum mexe em som, HUD ou comemoração |
| Letras | 8 | Todas grátis no nível 1, mas aparecem como item de catálogo |
| Aprimoramentos | 2 | Multiplicador de partícula e "sorte" — sutil demais para valer compra |

Nenhum item toca o que o usuário faz o tempo todo: **a legenda ao vivo, os cartões de vocabulário e o
momento do acerto nos jogos**.

### 2.2 Economia e baú
- O baú sai em **toda** rodada salva, inclusive com 0% de acerto (`server/routes/metrics.ts:263`). Não é
  prêmio por desempenho, esgota quando o usuário já tem os itens baratos e devolve `null` em silêncio.
- Seeds por rodada (~5–25) contra preços de 40–600: o usuário não sente progresso.
- O combo (×5, FEVER) só vale pontos; pontos não viram nada durável (`src/core/minigames/types.ts:85`).
- **Seeds por tempo de captura** (1 a cada 5 min) e por abrir o app (5/dia) — o Decreto 12.880, art. 9º,
  classifica "recompensas pelo tempo de uso" como incentivo ao uso compulsivo.

### 2.3 Conquistas (aba Desafios)
- O "69" da aba conta itens do catálogo que faltam, não desafios. Existem **14 conquistas**
  (`src/core/learning/conquistas.ts:62`; contagem em `src/components/views/Loja.tsx:495,529`).
- Na edição publicada a aba mostra "Disponível na versão completa" porque o portão `estaAnonimo()` ficou
  (`src/components/views/Loja.tsx:561`). O servidor em memória já credita as conquistas — elas são
  ganhas e escondidas.
- O modal de conquista usa `emoji` (`src/components/RecompensaDesbloqueada.tsx:207`), a grade usa lucide.
- `colecionador` é creditado sem conferência no servidor (`src/core/economiaAutoridade.ts:232`).

### 2.4 Mini games (o momento do acerto)
- Dois sistemas de "juice": os 9 jogos principais têm tom subindo com o combo, vibração e "+N" flutuante
  (`src/lib/gameFeel.ts:139`); os 9 culturais têm um som único e nada mais (`src/lib/juice.ts:76`).
- Taboo não comemora acerto; 6 jogos não comemoram o fim; 6 jogos vibram e soltam partículas **duas
  vezes** por acerto (ex.: `src/components/minigames/MemoryGame.tsx:124`).
- O HUD mostra "FEVER" em todos os jogos, mas só o Blitz tem FEVER.
- Blitz mostra duas telas de fim com regras de estrela diferentes (`blitzRegras.ts:75` × `fases.ts`).
- O ranking tem aba para os 18 jogos, mas só o Blitz envia pontuação: 17 abas vazias para sempre.
- Nível por jogo existe (a cada 3 rodadas) mas só aparece na antessala.

### 2.5 Notificações e comemorações
- A raspadinha mostra um XP diferente do creditado (mostra 2×acertos + itens; o servidor soma revisão e
  +15 da rodada perfeita).
- Subida de nível comemora duas vezes (`src/lib/estado/useRecompensas.ts:124,141`).
- Três motores de confete: `canvas-confetti`, o motor de partículas e o `.confete` em CSS.
- **Bug:** o aviso "ofensiva em risco" nunca dispara (`src/lib/progress.ts:142` ×
  `src/lib/estado/useNotificacoes.ts:98`).
- O fim da revisão (Estudar) não mostra Seeds, baú, ofensiva nem comemoração.
- Nenhum "você ganhou X" depois da rodada; nenhum lembrete de missão quase completa.

### 2.6 Dinheiro de verdade
- Créditos (R$ 9,90–49,90) compram 10 itens "dourados"; o Passe premium custa R$ 14,90.
- O Passe não tem data de fim: é "uma lente" sobre o nível da conta (`src/core/passe.ts:1`).

## 3. Marco legal que limita o desenho (não é parecer jurídico)
- **ECA Digital (Lei 15.211/2025, art. 20):** proíbe caixa de recompensa **paga** em produto de acesso
  provável por menores. Baú pago com dinheiro ou com moeda comprável: proibido.
- **Decreto 12.880/2026, art. 9º:** recompensa por tempo de uso e notificação excessiva contam como
  incentivo compulsivo. Fiscalização da ANPD a partir de jan/2027.
- **Art. 18:** supervisão parental precisa poder restringir compras.
- **Lojas (Apple 3.1.1, Google Play):** chances de qualquer item aleatório pago precisam ser divulgadas.

Consequência: **Seeds nunca podem ser compradas com dinheiro**; o baú só pode ser ganho; prêmio sempre por
resultado de aprendizagem, nunca por minutos.

## 4. Referências que funcionam
- **Valorant/Apex:** o cosmético mais valorizado muda a ação principal (efeito ao acertar, finalização)
  ou prova habilidade (badge de maestria que não se compra).
- **Brawl Stars 2023:** tirar toda aleatoriedade derrubou o DAU; voltar com recompensa aleatória **ganha
  jogando** (Starr Drops) + progressão determinística multiplicou receita 8,8× e DAU 3,9×.
- **Duolingo:** ligas semanais +25% de lições concluídas; streak freeze reduz a ansiedade.
- **Rocket League Blueprints:** compra direta com o item e o preço à vista substituiu as caixas pagas.

Fontes completas: pesquisa anexa na conversa de 27/09 (Planalto, Câmara, Game Developer, mobilegamer.biz,
Lenny's Newsletter, Valorant/Apex wikis, Zendle et al. 2019).

## 5. Direção proposta

### 5.1 Cortar
Cursores de emoji (27), packs e categorias de emoji (41), editor de pack, "cursor de qualquer emoji",
rastros recoloridos (fica 1 rastro por forma, só no desktop), aprimoramentos, emoji em conquistas e
perfis. Cerca de 90 itens saem; quem já tem recebe as Seeds de volta.

### 5.2 Criar (cosmético que aparece na ação principal)
1. **Estilos de legenda ao vivo** — o "skin da arma" do Babel Play: caixa, contorno, entrada da palavra,
   destaque da palavra aprendida.
2. **Efeitos de acerto e finalização por jogo** — o que acontece no acerto, no combo ×5 e na rodada
   perfeita. Ganho pela **maestria** daquele jogo.
3. **Temas completos (kits)** — paleta + sons + comemoração + HUD coerentes, com fundo animado leve.
   Ex.: estúdio de rádio, papel e tinta, neon noturno, fliperama.
4. **Cartões de vocabulário que evoluem** — a moldura muda de nova → aprendida → dominada; a coleção é o
   progresso.
5. **Molduras e títulos de maestria** — só se ganham ("Mestre do Termo", "1.000 palavras em EN").

### 5.3 Progressão
- **Maestria por jogo** (5 níveis por precisão e acertos, não por tempo), mostrada no fim da rodada.
- **Missões diárias** que incluem jogar e têm ponto de parada claro ("meta do dia concluída").
- **Temporada determinística** com datas, trilha grátis generosa e trilha paga sem item aleatório.
- **Ligas semanais** opcionais, sem nome real para menores.

### 5.4 Baú
Sai só com rodada de 2+ estrelas, limite diário, chances à vista, garantia de raro a cada N baús,
duplicata vira Seeds, nunca vendido.

### 5.5 Comemoração e notificações
Um só motor de comemoração com intensidade proporcional ao resultado; mesmo retorno nos 18 jogos; resumo
"você ganhou" honesto (XP e Seeds iguais aos creditados) também no fim da revisão; aviso de ofensiva
consertado, com teto diário e silêncio noturno.

## 6. Correções que não dependem do redesenho
1. Aba Desafios na edição publicada (`Loja.tsx:561`) e contagem real (14).
2. Aviso de ofensiva em risco que nunca dispara.
3. XP da raspadinha igual ao creditado.
4. Vibração e partícula em dobro em 6 jogos; subida de nível comemorada duas vezes.
5. Selo "FEVER" só no Blitz; tela única de fim do Blitz.
6. Esconder as 17 abas de ranking vazias (ou fazer os jogos enviarem pontuação).
7. Baú não sai com 0% e avisa quando a coleção acabar.
8. `colecionador` conferido no servidor.
