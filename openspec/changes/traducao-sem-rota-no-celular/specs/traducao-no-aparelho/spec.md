## ADDED Requirements

### Requirement: Todo par entre pt, es, fr, it e de traduz no aparelho

Quando o tradutor nativo do navegador não atende o par e a nuvem não está autorizada, o app SHALL traduzir no aparelho
qualquer par entre português, espanhol, francês, italiano e alemão. Se não houver modelo direto, a tradução MUST passar pelo
inglês. A rota pelo inglês MUST NOT ser usada quando houver uma rota melhor disponível (direta, nativa ou nuvem autorizada).

#### Scenario: Visitante no celular, espanhol para português (CEL-01)

- **WHEN** um visitante (perfil protegido, sem nuvem) no Chrome Android ou no Safari do iPhone legenda espanhol para
  português
- **THEN** cada fala final recebe tradução em português
- **AND** a rodada `node celular/medir-celular.mjs --aparelho iphone14 --cenario mercado` (e `--aparelho pixel7`) termina
  com `linhasSemTraducao` = 0 em `analise.json`, contra 9/9 da auditoria

#### Scenario: Matriz de pares

- **WHEN** o teste de unidade consulta a rota local de cada um dos 20 pares ordenados entre {pt, es, fr, it, de}, sem nativo
  e sem nuvem
- **THEN** os 20 têm rota (`direta` ou `pelo-ingles`), e nenhum devolve `sem-rota`

#### Scenario: Rota melhor tem prioridade

- **WHEN** o Translator nativo do Chrome desktop está pronto para es→pt
- **THEN** a fala é traduzida pelo nativo, e nenhum modelo da rota pelo inglês é baixado

#### Scenario: Qualidade mínima do pivô (META ABERTA em 25/11/2026)

- **WHEN** o juiz automático (`celular/juiz-traducao.mjs`, via `claude -p`, sem créditos de API) avalia as traduções es→pt do
  cenário mercado feitas pela rota pelo inglês
- **THEN** a nota média é de pelo menos 3/5 (medido: 2,33 e 2,56 com opus-mt, 2,89 com Bergamot es-en; a meta passa a ser
  perseguida por `traducao-local-por-direcao`, e o piso aceito até lá é decisão do dono, tarefa 6.1)

### Requirement: O par sem tradução no aparelho é anunciado antes de começar

Antes de Iniciar, a escolha de idiomas e o botão Iniciar SHALL informar quando o par escolhido não terá tradução neste
aparelho, com a saída possível (autorizar a nuvem, quando a política do perfil permitir), e SHALL informar o tamanho do
download quando a tradução depender de baixar modelos.

#### Scenario: Par sem rota

- **WHEN** a pessoa escolhe um par sem nenhuma rota disponível (por exemplo, hindi para português sem nuvem)
- **THEN** a tela mostra "Sem tradução neste aparelho para hindi → português" antes de Iniciar, e a legenda funciona só com
  a transcrição

#### Scenario: Par com rota pelo inglês

- **WHEN** a pessoa escolhe espanhol para português sem os modelos em cache
- **THEN** a confirmação de download soma as duas pernas (es→en e en→pt) e mostra o total em MB

### Requirement: A linha sem tradução não finge que traduziu

Quando a tradução de uma fala final falha ou não tem rota, o app MUST NOT mostrar o texto original no lugar da tradução. A
linha SHALL mostrar o motivo ("Sem tradução neste aparelho" ou "Tradução indisponível agora", com "Tentar de novo"). A
exportação, a voz e os cartões MUST tratar essa tradução como ausente.

#### Scenario: Falha da cadeia

- **WHEN** todos os motores falham numa fala "Perdón, ¿dónde está la salida?"
- **THEN** a linha mostra o original e, no lugar da tradução, "Tradução indisponível agora · Tentar de novo"
- **AND** o DOM da linha não contém "(Perdón, ¿dónde está la salida?)"

#### Scenario: Exportação

- **WHEN** a conversa com essa fala é exportada
- **THEN** a fala sai sem linha de tradução, e não com o original repetido

### Requirement: A 2ª sessão não traduz mais devagar que a 1ª

Com os modelos em cache, a latência do fim da fala até a tradução SHALL ficar, na 2ª sessão, no máximo 1,2× a da 1ª sessão
(p50), e o máximo de uma sessão de referência SHALL ficar abaixo de 8 s.

#### Scenario: Rodada do visitante

- **WHEN** `celular/rodar-visitante.sh` roda 5 pares de sessões (1ª com perfil novo, 2ª com o mesmo perfil), alternando a
  ordem dos aparelhos, numa máquina sem outra carga, e `celular/latencias.mjs` resume
- **THEN** o p50 "fim da fala → tradução" da 2ª sessão é no máximo 1,2× o da 1ª no iPhone e no Pixel emulados (a auditoria
  mediu 2,4× e 4,8×)
- **AND** o máximo fica abaixo de 8 s (a auditoria mediu 19,6 s)

#### Scenario: Oferta do regulador

- **WHEN** o regulador chega ao fim da escada local
- **THEN** a tela mostra o aviso correspondente, ou o log não registra a oferta
