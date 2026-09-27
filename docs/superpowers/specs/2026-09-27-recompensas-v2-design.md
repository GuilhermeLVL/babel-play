# Recompensas v2: cosméticos, maestria, temporada, conquistas e comemoração

**Data:** 27/09/2026 · **Estado:** direção aprovada pelo dono em 27/09 · **Branch:** `feat/recompensas-v2`
**Auditoria de origem:** `openspec/audits/2026-09-27-recompensas/relatorio.md`

## 1. Por quê

O app ficou moderno, mas a parte de recompensas ficou para trás: 130 itens de catálogo, a maioria de emoji
ou recolor, que ninguém mais vê e que não toca a ação principal. O baú sai até com 0% de acerto, as
conquistas estão escondidas na edição publicada e há Seeds por tempo de uso, o que o Decreto 12.880/2026
(art. 9º) trata como incentivo compulsivo.

**Objetivo:** o usuário quer praticar para desbloquear coisas que valem a pena ter e que aparecem onde ele
passa o tempo: na legenda ao vivo, nos cartões e no acerto dentro dos jogos.

**Sucesso:**

- Todo cosmético aparece na legenda, nos cartões, nos jogos ou no app inteiro (tema). Nenhum item "só no cursor".
- Toda recompensa vem de resultado de aprendizagem (acerto, precisão, palavra salva, meta cumprida), nunca de minutos.
- O que a tela diz que foi ganho é exatamente o que o servidor creditou.
- Os 18 jogos dão o mesmo nível de retorno no acerto e no fim.
- Nada aleatório é vendido, direta ou indiretamente.

## 2. Decisões do dono (27/09)

| Tema     | Decisão                                                                                                                                                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dinheiro | **Assinatura + compra direta.** Assinante ganha a trilha paga da temporada; a loja vende itens avulsos com prévia e preço à vista (Créditos). Maestria, molduras e títulos de conquista nunca à venda. Seeds nunca compráveis; baú nunca pago |
| Entrega  | **Especificação única, implementada em ondas** (seção 11)                                                                                                                                                                                     |
| Temas    | **Pele sobre a mesma estrutura:** layout, ícones lucide e componentes não mudam; o tema troca paleta, tipografia, textura, fundo animado leve, sons, comemoração e HUD dos jogos                                                              |
| Emojis   | Cortar cursores e packs de emoji                                                                                                                                                                                                              |

## 3. Restrições

- **Design:** manter cartões, tokens (`src/index.css`, `src/styles/prototipo.css`) e ícones lucide. Sem emoji na interface.
- **Legal (não é parecer jurídico):** ECA Digital art. 20 (sem caixa paga), Decreto 12.880 art. 9º (sem prêmio por
  tempo, sem notificação excessiva), art. 18 (compra sob controle do responsável). `perfilProtegido()`
  (`src/lib/protecaoDoMenor.ts:87`) continua valendo: sem ranking público, sem pressão de ofensiva, sem compra.
  O responsável compra pelo menor pela conta dele (fluxo já existente em `src/lib/assinatura.ts:74`).
- **Dispositivos:** `reduzirEfeitos()` / `html[data-modo-leve]` e `prefers-reduced-motion` desligam fundo
  animado, partículas pesadas e rastro. Quest e celular não têm rastro de mouse.
- **Edição estática:** tudo funciona no servidor em memória (`src/data/efemero/`); as rotas novas entram nos dois
  lados e no teste de paridade `tests/contratos/rotas-espelhadas.test.ts`. Sem cobrança na edição estática.
- **Autoridade:** preços, sorteios e créditos continuam decididos no servidor (`src/core/economiaAutoridade.ts`).

## 4. Abordagem técnica

**Evoluir o que existe.** O catálogo continua em `CATALOGO_DA_LOJA` (`src/core/loja.ts`), a posse continua
derivada dos motivos de crédito e gasto (`loja:`, `conquista:`, `drop:`, `premium:` + novos `maestria:`,
`temporada:`, `reembolso:`). Não há tabela de inventário nova. Tudo novo fica atrás da flag remota
**`recompensas_v2`** (migração nova em `server/db/migrations`, desligada por padrão; ligada na edição estática
quando a onda 5 fechar).

Alternativas descartadas:

- _Tabela de inventário nova e catálogo em banco:_ mais limpo, mas reescreve posse, hidratação e ~40 testes sem ganho para o usuário.
- _"v2" paralelo com troca total:_ duplica telas e economia durante meses.

## 5. Catálogo

### 5.1 Sai

| Item                                                                                                          | Qtde       | Destino                                         |
| ------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------- |
| Cursores de emoji                                                                                             | 27         | removidos; cursor volta ao do sistema           |
| Packs de emoji, categorias de emoji, editor de pack, "cursor de qualquer emoji"                               | 33 + 8 + 2 | removidos                                       |
| Rastros                                                                                                       | 25 → 5     | fica 1 por forma, só em ponteiro fino (desktop) |
| Aprimoramentos (tamanho de partícula, sorte)                                                                  | 2          | removidos                                       |
| Partícula "emoji"                                                                                             | 1          | removida                                        |
| Emoji em perfis visuais, conquistas, miniaturas (`perfis.ts`, `progressao.ts:105`, `MiniaturaDoItem.tsx:181`) | —          | trocados por lucide                             |

**Reembolso:** para cada gasto `loja:<id>` / `croma:<id>` / `aprimoramento:*` de item removido, o servidor
credita `reembolso:<id>` com o mesmo valor, uma vez (idempotente pelo motivo). Itens pagos com Créditos que
saírem viram o item equivalente do catálogo novo; nenhum Crédito se perde. O usuário vê um aviso único:
"Trocamos os cursores e emojis por recompensas novas. Suas Seeds voltaram: +N".

### 5.2 Entra

Cada tipo novo tem `alvo` (onde aparece), `origem` (seção 6) e prévia ao vivo.

1. **Estilo de legenda** (`tipo: 'legenda'`). Estende `TranscriptSettings` (`src/lib/transcriptUtils.ts`) com
   `estilo`: caixa (fundo, borda, raio), contorno do texto, entrada da palavra (nenhuma / surgir / digitar),
   destaque da palavra já aprendida (sublinhado, marca-texto, cor). Aplica em `LegendasFlutuantes.tsx`,
   `ChatTranscript.tsx` e `DocumentPiP.tsx`. Tamanho, cor de alto contraste e fonte continuam livres
   (acessibilidade não é recompensa). Lançamento: 8 estilos.
2. **Efeito de jogo** (`tipo: 'efeito-acerto' | 'efeito-combo' | 'finalizacao'`), com `jogo` opcional.
   Acerto = forma e som do acerto; combo = o que acontece ao subir o multiplicador; finalização = a animação
   da rodada perfeita. Os genéricos valem em todos os jogos; os de maestria valem no jogo de origem e podem
   ser equipados em qualquer jogo depois do nível 5 daquele jogo. Lançamento: 18 finalizações (1 por jogo,
   maestria), 6 acertos e 4 combos genéricos.
3. **Tema completo** (`tipo: 'tema'`). Um tema declara: tokens de cor claros e escuros, fonte de título,
   textura (CSS, sem imagem pesada), fundo animado leve (CSS, desligável), pacote de sons (`soundFx.ts`),
   forma de partícula e pele do HUD (`casca/HudDaRodada.tsx` lê tokens `--hud-*`). Os 8 temas atuais viram
   temas completos com o pacote padrão. Lançamento: +6 temas (Rádio, Papel e tinta, Neon noturno, Fliperama,
   Jardim, Observatório).
4. **Cartão de vocabulário** (`tipo: 'cartao'`). A moldura do cartão muda com o estado da palavra: nova →
   aprendida → dominada. A pele define as três variações. Aplica no Estudar, na Biblioteca e nos jogos que
   mostram cartões. Lançamento: 5 peles.
5. **Moldura e título de perfil** (`tipo: 'moldura' | 'titulo'`). Aparecem no perfil, no ranking (adulto) e no
   cabeçalho do Personalizar. Só por maestria, conquista ou temporada.

**Continua:** letras (viram opção livre de acessibilidade, fora do catálogo), posição do menu (livre),
partículas não-emoji, Estúdio, cromas (recolor de tema/legenda).

## 6. Como cada coisa se ganha

| Origem                              | O que libera                                             | Vendável?           |
| ----------------------------------- | -------------------------------------------------------- | ------------------- |
| **Maestria de jogo**                | efeito do jogo, moldura, finalização, título             | nunca               |
| **Conquista**                       | moldura, título, alguns temas                            | nunca               |
| **Temporada — trilha grátis**       | temas, legendas, cartões, Seeds                          | não se aplica       |
| **Temporada — trilha de assinante** | itens exclusivos da temporada                            | só pela assinatura  |
| **Nível da conta**                  | itens básicos de cada tipo                               | —                   |
| **Loja com Seeds**                  | comuns e raros de legenda, cartão, tema, efeito genérico | Seeds ganhas        |
| **Loja com Créditos**               | itens avulsos "de vitrine", com prévia e preço           | sim (compra direta) |
| **Baú**                             | comuns e raros de loja                                   | nunca               |

Perfil protegido: não vê a loja com Créditos nem ofertas; o responsável pode comprar pela conta dele.

## 7. Economia

### 7.1 Fontes de Seeds (`REGRAS`, `src/core/learning/economia.ts:31`)

| Sai                             | Entra                                                              |
| ------------------------------- | ------------------------------------------------------------------ |
| 1 a cada 5 min de captura       | **palavra nova salva da captura: 1** (teto 30/dia)                 |
| presença: 5 por dia             | **meta diária cumprida: 15**                                       |
| marco de 7 dias de ofensiva: 25 | mantido (ofensiva mede dias com prática real, não abertura do app) |
| —                               | **rodada de 3 estrelas: +5** (já existe como "rodada perfeita")    |
| —                               | **nível de maestria: 20 × nível**                                  |

Ficam: cartão criado 1, revisão certa 2, acerto em jogo 1. Os números finais são calibrados na onda 2 com a
meta de **um item comum a cada 2–3 dias de prática típica** (tabela no plano).

### 7.2 Ofensiva

Conta dias com pelo menos uma prática (revisão, rodada ou captura com palavra salva). Abrir o app não conta.
Congelamento de ofensiva: 1 ganho por semana com a meta diária, guarda até 2.

### 7.3 Baú

- Sai só com rodada de 2+ estrelas (precisão ≥ 75%), conferida no servidor pelo resultado salvo; no máximo 3 por dia.
- Chances à vista no próprio baú: 75% comum, 25% raro.
- Garantia: o 5º baú sem raro é raro.
- Repetido ou coleção completa: vira Seeds (comum 15, raro 40), com mensagem clara.
- Nunca vendido, nunca aberto com Créditos, nunca pulado com moeda comprável.

## 8. Progressão

### 8.1 Maestria por jogo

- Pontos de maestria por rodada = acertos × multiplicador de precisão (1,0 a 75%, 1,5 a 90%, 2,0 a 100%) +
  bônus de combo máximo (combo ÷ 3, teto 5). Nada por tempo.
- 5 níveis por jogo: Bronze, Prata, Ouro, Platina, Mestre (limiares no plano; Mestre ≈ 40 rodadas boas).
- Recompensas: 1 emblema no jogo, 2 efeito de acerto do jogo, 3 moldura, 4 finalização do jogo, 5 título
  "Mestre de <jogo>" e liberação da finalização em qualquer jogo.
- Mostrada no fim da rodada (barra de maestria com o ganho), na antessala e na aba Maestria.
- Guardada como créditos `maestria:<jogo>:<nivel>` + pontos derivados de `exercise_results` (servidor).

### 8.2 Missões diárias

3 missões por dia a partir de um conjunto (revisar N, salvar N palavras, jogar 1 rodada de 2+ estrelas,
praticar um jogo novo). Quando as 3 fecham: "Meta do dia concluída", recompensa e ponto de parada explícito
(sem sugestão de "mais uma"). Substituem as missões atuais (`src/lib/progress.ts:96`).

### 8.3 Temporada

- Com datas: 8 semanas, 30 níveis. Substitui o Passe "lente do nível" (`src/core/passe.ts`).
- XP de temporada vem dos mesmos resultados do XP da conta.
- Trilha grátis com item em todo nível par. Trilha de assinante com item em todo nível.
- Sem compra de nível. Itens de temporadas passadas voltam na loja com Seeds depois de 1 ano (reduz FOMO).
- Ao fim: um resumo da temporada e o início da próxima, sem contagem regressiva agressiva para perfil protegido.

### 8.4 Ligas

Fora desta especificação. Os rankings atuais continuam só no Blitz e só para adulto declarado.

## 9. Conquistas

- De 14 para ~40, em 4 pilares (Vocabulário, Escuta, Jogos, Constância), cada uma em bronze/prata/ouro quando
  fizer sentido (ex.: 100/500/2.000 palavras).
- Ícone lucide por conquista (sem campo `emoji`).
- Todas conferidas no servidor (`CONQUISTAS_CONFERIVEIS`) e no espelho.
- Cada conquista dá Seeds e XP; as de ouro dão moldura ou título.
- Visíveis na edição publicada.
- Conquistas "secretas": até 3, com dica vaga, reveladas ao ganhar.

## 10. Comemoração, avisos e telas

### 10.1 Motor único de comemoração

- Um módulo `src/lib/comemoracao/` com `celebrar(evento, intensidade)`. Eventos: acerto, erro, combo, recorde,
  rodada (1–3 estrelas), maestria, conquista, baú, nível.
- Substitui `gameFeel.ts`, `juice.ts` (comemorar) e `canvas-confetti`. A dependência sai.
- O tema equipado define sons e forma; os efeitos equipados definem acerto/combo/finalização.
- Intensidade proporcional: 1 estrela não solta confete; 3 estrelas solta a finalização.
- Os 18 jogos passam pelo mesmo caminho: tom subindo com o combo, vibração, "+N" flutuante, fim comemorado.
- `reduzirEfeitos()` e movimento reduzido trocam animação por um retorno discreto (cor e som curto).

### 10.2 Resumos e avisos

- **Fim de rodada:** estrelas, pontos, XP e Seeds creditados (mesma função do crédito), barra de maestria,
  progresso das missões, baú se houver.
- **Fim de revisão:** o mesmo resumo (Seeds, XP, missões, ofensiva).
- **Fila de recompensas:** uma por vez, nunca durante a rodada, agrupando quando vierem várias ("3 novidades").
- **Avisos (sino):** ofensiva em risco (1/dia, nunca entre 22h e 8h, nunca para perfil protegido), missão quase
  completa (1/dia), temporada nova. Nada de push nesta especificação.

### 10.3 Telas

O Personalizar ganha cinco abas, com o layout de cartões atual:

- **Coleção:** o que o usuário tem, por tipo, com prévia ao vivo (a legenda de exemplo muda na hora; o tema
  aplica em prévia).
- **Maestria:** os 18 jogos com nível, barra e próxima recompensa.
- **Temporada:** as duas trilhas.
- **Conquistas:** grade por pilar, com contagem real (ex.: "12/40").
- **Loja:** Seeds e Créditos, com prévia e preço; sem Créditos na edição estática e para perfil protegido.

O modal de recompensa (`RecompensaDesbloqueada.tsx`) mostra o item com prévia real (a legenda estilizada, o
cartão, o efeito tocando), não uma miniatura de emoji.

## 11. Ondas

| Onda | Conteúdo                                                                                     | Pronto quando                                              |
| ---- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 0    | 8 correções da auditoria (seção 6 do relatório)                                              | já em andamento                                            |
| 1    | Motor único de comemoração; 18 jogos no mesmo caminho; sai `canvas-confetti`                 | os 18 jogos passam no e2e com o mesmo retorno              |
| 2    | Economia (7.1–7.3), corte do catálogo (5.1), reembolso, aviso único                          | paridade servidor × espelho; reembolso idempotente testado |
| 3    | Maestria (8.1), efeitos de jogo e finalizações                                               | fim de rodada mostra maestria; 18 finalizações             |
| 4    | Temas completos (+6), estilos de legenda (8), peles de cartão (5)                            | prévia ao vivo; modo leve sem animação                     |
| 5    | Temporada (8.3), missões (8.2), conquistas (9), telas (10.3), flag ligada na edição estática | Personalizar novo no e2e desktop e celular                 |
| 6    | Loja com Créditos (compra direta), bloqueio para perfil protegido, compra pelo responsável   | fluxo de compra no e2e com o provedor em modo de teste     |

Cada onda: TDD, tsc 0, eslint 0, vitest completo, i18n, e2e desktop e celular da edição estática, verificação
no navegador, orçamento do bundle. Uma branch, commits por onda.

## 12. Testes-chave

- Exibição == crédito (rodada e revisão).
- Baú: estrelas mínimas, teto diário, garantia no 5º, repetido vira Seeds, sem rota de compra.
- Nenhuma Seed por tempo (teste que varre `REGRAS`).
- Reembolso idempotente e aviso único.
- Maestria: pontos e limiares, sem dependência de tempo; créditos `maestria:` conferidos no servidor.
- Paridade das rotas novas no espelho da edição estática.
- Perfil protegido: sem loja com Créditos, sem ranking, sem aviso de ofensiva.
- Modo leve e movimento reduzido: sem fundo animado e sem partículas pesadas.
- ECA art. 20: o teste existente (`tests/eca-art20-sem-recompensa-aleatoria-paga.test.ts`) passa a cobrir
  baú, temporada e loja nova.

## 13. Fora do escopo

Ligas semanais, push, trocas entre usuários, itens animados em 3D, cosméticos gerados por IA, preço
regionalizado.

## 14. Riscos

- **Calibragem:** Seeds e limiares errados deixam a coleção rápida ou lenta demais. Mitigação: simulação no plano
  (script com perfis de uso típico) antes de fixar números.
- **Peso:** temas com fundo animado no Quest. Mitigação: CSS puro, desligado no modo leve, orçamento de bundle.
- **Usuários com itens removidos:** reembolso e aviso; itens pagos viram equivalentes.
- **Leitura legal de "pagamento":** Seeds não compráveis e baú sem via paga tornam o baú ganho o caso mais seguro;
  validar com advogado antes de ligar a loja com Créditos (onda 6).
