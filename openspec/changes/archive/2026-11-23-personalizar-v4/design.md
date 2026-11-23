## Context

`estadoDaColecao` (`progressao.ts:63-77`) já é a fonte única de verdade — o problema é 100%%
de apresentação: cada aba inventou um chrome. A etapa 1 existe porque escolher direção de
design sem ver custa retrabalho; o protótipo usa dados reais do catálogo para a avaliação ser
honesta.

## Decisão do dono (31/08, 2ª rodada de protótipo)

Não é uma direção só: é a JUNÇÃO das três, em 4 áreas com um card/raridade únicos:

1. **Passe** (de A): 100 níveis, 2 recompensas por nível, TRILHA DUPLA — Grátis para todos e
   Premium comprável em Créditos que DEVOLVE mais créditos do que custa ao longo da trilha
   (modelo Fortnite: quem completa recompra o próximo ou gasta na Loja). Os itens do catálogo
   atual (nível 1-10) viram os marcos ★ de dezena; o meio devolve moeda e impulsos. "Temporada"
   nomeia capítulo — nada ganho expira.
2. **Biblioteca** (de B/C): só o que é do usuário; é onde ele monta o visual (equipar por
   categoria, resumo vivo do equipado).
3. **Loja**: vitrine ROTATIVA — prateleira de atalhos em Seeds + prateleira de exclusivos em
   Créditos; o destaque pode apontar para um Desafio (exclusividade que não se compra).
4. **Desafios**: recompensa EXCLUSIVA por minijogo, com desafios das métricas que o app já grava
   (tempo por item, attempts, hinted, estrelas, frequência, rodadas perfeitas) — completar os
   desafios do jogo libera o item dele. As conquistas gerais atuais mantêm o mesmo formato.

Implicação de economia: o Passe Premium pago depende da moeda comprada — implementação fica
ATRÁS da spec `economia-de-creditos` (inventário server-side primeiro). A etapa 2 desta mudança
implementa as 4 áreas com a economia ATUAL (Seeds + nível + conquistas); a fileira Premium entra
desenhada mas desativada até a economia de créditos existir.

## Estratégia de conteúdo e taxonomia de EDITABILIDADE (decisão do dono, 31/08, 3ª rodada)

O feedback sobre o protótipo: "muita moedinha, poucos itens — o passe parece fraco". A resposta
tem duas partes: encher o passe com o que JÁ existe, e uma taxonomia para gerar conteúdo novo
sem abrir brecha de edição.

### 1. Conteúdo antes de moeda (implementado)

Os ~60 itens não-exclusivos do catálogo preenchem os slots do passe primeiro (`galeria/passe.ts`);
Seeds são a SOBRA, não o recheio — teste prende essa proporção. Exclusivos de conquista nunca
entram no passe.

### 2. Taxonomia de editabilidade — cada item declara QUANTO o usuário pode mexer

| Grau | Nome | O que é | Exemplos hoje | Raridade típica |
|---|---|---|---|---|
| E0 | Fechado | Peça pronta, zero parâmetro | temas prontos, cursores, packs fixos | comum–raro |
| E1 | Paramétrico curado | UM eixo de escolha dentro de conjunto NOSSO | paletas (estilo × 30 matizes), rastros `gen:<forma>:<paleta>` | comum–épico |
| E2 | Composição de partes curadas | montar com peças do catálogo | editor de pack (emojis do catálogo), perfis salvos | raro–épico |
| E3 | Edição livre sob contrato | valores livres DENTRO de invariantes técnicas | Estúdio/tema-custom (4 tokens de cor, contraste validado) | lendário |

Regras de segurança que a taxonomia impõe (todas já têm precedente no código):
- **Todo caminho passa pela régua** (`estadoDoItem`/`acessoAoItem`) — invariante da spec
  galeria-gating-fechado; grau maior de edição = gate mais alto.
- **E3 nunca expõe CSS/HTML cru**: o Estúdio só escreve os 4 tokens (`applyCustomColors`), nunca
  seletor, tamanho ou layout arbitrário — o teto do que o usuário controla é o contrato de
  tokens, e é isso que impede um item de "quebrar a aplicação".
- **E1/E2 só compõem do catálogo** (fail-closed para id desconhecido — brecha B3 já fechada).
- Item novo DEVE nascer com grau declarado; sem grau, trata-se como E0.

### 3. Geração de conteúdo em escala (roadmap)

- **E1 multiplica de graça**: 6 estilos × 30 matizes = 180 paletas já existem; rastros
  `gen:forma:paleta` geram dezenas — variantes nomeadas dessas combinações viram itens de passe
  e vitrine sem nenhum sistema novo.
- **Decoração média** = combinações E2 empacotadas por nós (ex.: "Kit Neon Noturno" = tema +
  partículas + rastro coerentes) — um id, várias peças, mesma régua.
- **Tema completo** = E0 novo no catálogo (o caminho `ThemeType` já existe).
- **Exclusivos por minijogo** (desafios com métricas reais: tempo, hinted, estrelas, frequência)
  entram quando o rastreio de desafio existir — mesmo desenho `exclusivoDe` das conquistas.
