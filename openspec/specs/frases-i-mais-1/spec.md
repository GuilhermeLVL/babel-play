# frases-i-mais-1 Specification

## Purpose
Painel 'Para estudar desta sessão': frases i+1 e palavras novas por frequência. Criada pela change `frases-i-mais-1` (arquivada em 2026-11-23); veja `openspec/changes/archive/2026-11-23-frases-i-mais-1/proposal.md` para o porquê.

## Requirements

### Requirement: Frases com uma palavra nova

O app SHALL listar, para a sessão aberta, as frases com exatamente UMA palavra desconhecida (distinta), com 4 a 22 palavras,
mostrando a palavra-alvo destacada por negrito e sublinhado (não só por cor). Palavras funcionais, nomes próprios e palavras já
conhecidas (caderno "aprendendo"/"dominada" ou marcadas "Já sei", com a flexão) MUST NOT contar como desconhecidas. Cada
palavra-alvo SHALL aparecer em uma frase só (a de tamanho mais próximo de 10 palavras). A ordem MUST ser: palavra mais frequente
na sessão primeiro, depois nível CEFR mais baixo (quando houver), depois alfabética.

#### Scenario: Uma desconhecida

- **WHEN** a sessão tem "I cook very delicious food." e só "delicious" é desconhecida
- **THEN** a frase aparece em "Frases com 1 palavra nova" com "delicious" destacada

#### Scenario: Duas desconhecidas

- **WHEN** a frase tem duas palavras desconhecidas
- **THEN** a frase não aparece nas frases, mas as duas palavras aparecem em "Palavras novas"

#### Scenario: Mais frequente primeiro

- **WHEN** "delicious" aparece 3 vezes e "yummy" 1 vez, cada uma numa frase i+1
- **THEN** a frase de "delicious" vem antes

### Requirement: Palavras novas da sessão

O app SHALL listar as palavras desconhecidas da sessão por frequência (quantas vezes aparece), com o nível CEFR quando a lista do
idioma tiver a palavra, sem as conhecidas, as ignoradas, as funcionais e os nomes próprios.

#### Scenario: Contagem e nível

- **WHEN** "wonderful" aparece duas vezes na sessão em inglês
- **THEN** a lista mostra "wonderful", "2 vezes" e "A1"

### Requirement: Guardar e marcar a partir da lista

"Guardar como cartão" SHALL criar o cartão da palavra com a frase da lista como contexto, pelo mesmo fluxo da folha da palavra
(sem rota nova), e a linha MUST passar a dizer "Guardado" mesmo que o caderno passe a contar a palavra como conhecida.
"Já sei" SHALL marcar a palavra sem criar cartão. A falha MUST avisar e manter o botão. O toque na frase SHALL levar o player
até a fala quando houver player.

#### Scenario: Guardar com a frase

- **WHEN** a pessoa toca "Guardar como cartão" numa frase
- **THEN** o cartão é criado com a palavra-alvo e essa frase como exemplo, e a linha mostra "Guardado"

#### Scenario: Já sei

- **WHEN** a pessoa toca "Já sei" numa palavra nova
- **THEN** a palavra é marcada como conhecida, sem cartão, e sai da lista

### Requirement: Portão de honestidade

A seção MUST NOT aparecer sem conta, com menos de `SESSOES_MINIMAS_PARA_NOVA` sessões no idioma, em idioma que não separa
palavras por espaço (ja, zh, th, lo, km, my), com menos de 30 palavras, nem sem idioma confiável. Falas de outro idioma
MUST NOT entrar na conta. A seção SHALL vir recolhida, com o resumo "N frases com 1 palavra nova".

#### Scenario: Sem histórico

- **WHEN** a conta tem 0 sessões no idioma da sessão
- **THEN** a seção não aparece
