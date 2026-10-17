## ADDED Requirements

### Requirement: Legendas importadas viram material de estudo sem custo de IA

O app SHALL aceitar arquivos .srt, .vtt, .ass e .ssa na importação de documentos, ler o texto no navegador e montar a sessão com uma
fala por linha, sem enviar o arquivo ao servidor nem usar transcrição ou tradução de nuvem para isso. O leitor MUST descartar
números de bloco, tempos, etiquetas de estilo e a repetição consecutiva da mesma fala, e MUST recusar o arquivo sem falas.

#### Scenario: SRT de série em japonês

- **WHEN** a pessoa importa um .srt com três blocos em japonês
- **THEN** a sessão tem três falas e o idioma detectado é o japonês, sem nenhuma chamada de rede para extrair o texto

#### Scenario: Arquivo que não é legenda

- **WHEN** o arquivo .srt está vazio ou não tem nenhum bloco com tempo
- **THEN** a importação falha com "Não achei falas nesta legenda." e nenhuma sessão vazia é criada
