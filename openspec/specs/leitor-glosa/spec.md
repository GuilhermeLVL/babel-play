# leitor-glosa Specification

## Purpose

Glosa (tradução curta sobre palavras novas) no leitor, que some conforme a palavra é aprendida. Criada pela change `glosa-no-leitor` (arquivada em 2026-11-23); veja `openspec/changes/archive/2026-11-23-glosa-no-leitor/proposal.md` para o porquê.

## Requirements

### Requirement: O ajuste "Mostrar tradução das palavras novas"

O painel de Aparência do leitor SHALL oferecer o ajuste "Mostrar tradução das palavras novas", desligado por padrão e
guardado no aparelho. O ajuste SHALL NOT aparecer em PDF. Desligado, o leitor SHALL NOT montar nenhum código da glosa
nem assinar o índice de etiquetas por causa dela.

#### Scenario: Primeira abertura

- **WHEN** a pessoa abre um livro EPUB sem nunca ter mexido no ajuste
- **THEN** nenhuma glosa aparece e o ajuste está desligado em Aparência

#### Scenario: Ligar e lembrar

- **WHEN** a pessoa liga o ajuste e reabre o livro neste aparelho
- **THEN** o ajuste continua ligado e a glosa aparece no capítulo

#### Scenario: PDF

- **WHEN** a pessoa abre o painel de Aparência de um PDF
- **THEN** o ajuste não é oferecido

### Requirement: A glosa vai só nas palavras novas, vinda do dicionário local

Com o ajuste ligado, cada palavra do capítulo visível que a pessoa não conhece SHALL poder ganhar uma glosa curta acima.
"Não conhece" SHALL seguir a régua da cobertura: ficam de fora as palavras funcionais do idioma, os nomes próprios, as
conhecidas (caderno aprendendo/dominada, com a flexão) e as marcadas "Já sei" ou ignoradas. A glosa SHALL vir somente do
dicionário local do par de idiomas, sem rede nem custo; sem glosa local, a palavra SHALL ficar sem glosa.

#### Scenario: Palavra nova com glosa local

- **WHEN** "lantern" é nova para a pessoa e o dicionário local en→pt a traduz como "lanterna"
- **THEN** "lanterna" aparece sobre "lantern" no capítulo

#### Scenario: Palavra sem glosa local

- **WHEN** a palavra é nova mas o dicionário local não a conhece
- **THEN** nada aparece sobre ela e nenhuma requisição de rede é feita

#### Scenario: Palavra que a pessoa já conhece ou ignorou

- **WHEN** a palavra é funcional, nome próprio, "Já sei", ignorada ou está no caderno como aprendendo/dominada
- **THEN** ela não ganha glosa

#### Scenario: Caderno ainda não carregado

- **WHEN** o caderno da pessoa ainda não chegou
- **THEN** nenhuma glosa é desenhada (para não mostrar tudo como novo e depois apagar)

### Requirement: A glosa não polui a página

A glosa SHALL respeitar a densidade máxima de uma glosa a cada 4 palavras seguidas. Uma palavra repetida SHALL ganhar
glosa somente nas 2 primeiras ocorrências do capítulo. Quando nem todas as candidatas couberem, SHALL ter prioridade as
mais frequentes do capítulo.

#### Scenario: Muitas palavras novas seguidas

- **WHEN** doze palavras novas, todas com glosa, aparecem em sequência
- **THEN** no máximo três delas ganham glosa e duas glosas nunca ficam a menos de 4 palavras uma da outra

#### Scenario: Palavra repetida

- **WHEN** a mesma palavra nova aparece quatro vezes no capítulo
- **THEN** só as duas primeiras ocorrências ganham glosa

#### Scenario: Disputa pela mesma janela

- **WHEN** duas palavras novas disputam a mesma janela de 4 palavras e uma é mais frequente no capítulo
- **THEN** a mais frequente ganha a glosa

### Requirement: A glosa some quando a palavra vira conhecida

Quando a pessoa marcar "Já sei" ou a palavra entrar no caderno como aprendendo/dominada, a glosa dela SHALL sumir sem
recarregar o capítulo, e as glosas restantes SHALL ser refeitas pela mesma regra (uma palavra que ficou de fora por
densidade pode aparecer).

#### Scenario: Marcar "Já sei"

- **WHEN** a pessoa marca "Já sei" numa palavra glosada
- **THEN** a glosa dela some do capítulo atual sem recarga

### Requirement: A glosa é apoio visual, não conteúdo

A glosa SHALL ser desenhada fora do documento do capítulo (overlayer), `aria-hidden`, de modo que o texto do livro
continue selecionável e copiável SEM a glosa misturada, o CFI e a paginação não mudem e o leitor de tela não leia a
glosa. A cor SHALL vir do tema do leitor (claro, sépia, creme, escuro, cinza, contraste) com contraste de leitura.

#### Scenario: Copiar texto

- **WHEN** a pessoa seleciona e copia uma frase com palavras glosadas
- **THEN** o texto copiado contém só o texto do livro

#### Scenario: Leitor de tela

- **WHEN** um leitor de tela percorre o capítulo
- **THEN** nenhuma glosa é anunciada

#### Scenario: Trocar de tema ou de tamanho

- **WHEN** a pessoa troca o tema ou o tamanho da letra
- **THEN** a glosa é redesenhada com a cor do novo tema e acompanha a repaginação

### Requirement: Custo sob controle

O cálculo SHALL rodar em tempo ocioso, por capítulo, sem bloquear a virada de página, sobre no máximo 120 mil
caracteres do capítulo.

#### Scenario: Virar a página

- **WHEN** a pessoa vira a página dentro do capítulo
- **THEN** nenhum cálculo da glosa roda (as glosas já desenhadas acompanham a repaginação)
