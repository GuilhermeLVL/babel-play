# Audiolivros: Supertonic 3 e Pocket TTS em CPU (Tarefa A1, 01/11/2026)

Avaliação dos dois motores locais com a bancada `scripts/eval-voz/`. Tudo abaixo marcado MEDIDO saiu de execução
nesta máquina (Apple Silicon arm64, 15 núcleos, 24 GB, CPU, sem GPU). SUPOSIÇÃO e NÃO VERIFICADO estão marcados.
Não é parecer jurídico.

## 1. Licenças (lidas nos repositórios oficiais antes do uso)

| Item                 | Licença                                                                                                                                                                                                                                                                                                                                                                                                                                       | Fonte                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Supertonic 3, código | MIT (Supertone Inc.)                                                                                                                                                                                                                                                                                                                                                                                                                          | https://github.com/supertone-inc/supertonic/blob/main/LICENSE (o repo foi movido; a API do GitHub respondeu 301)               |
| Supertonic 3, PESOS  | BigScience Open RAIL-M, 18/08/2022 (`license: openrail` no cartão). Uso comercial permitido, com restrições de uso (Anexo A) que devem ser repassadas: nada de explorar/prejudicar menores, rotular conteúdo como gerado por máquina, sem impersonação, sem explorar vulnerabilidade por idade. O LICENSE da revisão fixada pelo pacote (`724fb5ab`) é idêntico ao da `main` (mesmo SHA-1 do arquivo)                                         | https://huggingface.co/Supertone/supertonic-3/blob/main/LICENSE ; https://huggingface.co/Supertone/supertonic-3                |
| Pocket TTS, código   | MIT                                                                                                                                                                                                                                                                                                                                                                                                                                           | https://github.com/kyutai-labs/pocket-tts (API do GitHub: MIT; push de 31/10/2026)                                             |
| Pocket TTS, PESOS    | CC-BY-4.0 (atribuição obrigatória). O repo `kyutai/pocket-tts` é GATED (aceite de termos + login); NÃO foi usado. Usamos `kyutai/pocket-tts-without-voice-cloning` (mesma licença CC-BY-4.0, sem trava de acesso e SEM o codificador de clonagem de voz), que o pacote `pocket-tts` 4.0.1 escolhe sozinho para modelo e embeddings. O cartão mantém um aviso de uso proibido (sem clonagem/impersonação sem consentimento, sem desinformação) | https://huggingface.co/kyutai/pocket-tts-without-voice-cloning (revisão `a7056f50`) ; https://huggingface.co/kyutai/pocket-tts |
| Pacotes Python       | `supertonic` 1.3.1 (MIT), `pocket-tts` 4.0.1 (MIT)                                                                                                                                                                                                                                                                                                                                                                                            | https://pypi.org/project/supertonic/ ; https://pypi.org/project/pocket-tts/                                                    |

Nenhum dos dois usa espeak-ng: o Supertonic tokeniza por caractere (`unicode_indexer.json`); o Pocket TTS usa
`sentencepiece`/`tokenizers` e nenhuma dependência de fonemizador (conferido em `requires_dist` do PyPI). Sem componente GPL
no caminho. (SUPOSIÇÃO residual: só olhei metadados de dependência, não auditei o binário do `torch`/`onnxruntime`.)

### Vozes do Pocket TTS (pendência da pesquisa anterior)

Licença por voz, de https://huggingface.co/kyutai/tts-voices (README) e da tabela `_ORIGINS_OF_PREDEFINED_VOICES` do pacote:

| Vozes                                                                                 | Origem                                                                                                                              | Licença                                                                                                                                                                          | Uso comercial                                                           |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| marius, javert                                                                        | voice-donations                                                                                                                     | CC0                                                                                                                                                                              | sim                                                                     |
| bill_boerst, peter_yearsley, stuart_bell, caro_davy                                   | voice-zero (LibriVox)                                                                                                               | CC0                                                                                                                                                                              | sim                                                                     |
| alba                                                                                  | alba-mackenna                                                                                                                       | CC-BY-4.0                                                                                                                                                                        | sim, com atribuição                                                     |
| anna, vera, fantine, charles, paul, eponine, azelma, george, mary, jane, michael, eve | VCTK                                                                                                                                | CC-BY-4.0                                                                                                                                                                        | sim, com atribuição                                                     |
| cosette                                                                               | Expresso                                                                                                                            | CC-BY-NC-4.0                                                                                                                                                                     | NÃO                                                                     |
| jean                                                                                  | EARS                                                                                                                                | CC-BY-NC-4.0                                                                                                                                                                     | NÃO                                                                     |
| rafael (pt), lola (es), giovanni (it), juergen (de), daan (nl)                        | arquivos soltos no repo gated `kyutai/pocket-tts` (ex.: `g-Vi8PgmSY0-enhanced-v2.wav` para rafael; `common_voice_es_...` para lola) | NÃO DOCUMENTADA: não aparecem no README de `tts-voices`; o nome do arquivo de rafael parece um id de vídeo, e o de lola, do Common Voice (que costuma ser CC0, mas é inferência) | NÃO VERIFICADO: tratar como proibido em produção até a Kyutai responder |

Consequência: as vozes pt "oficiais" do Pocket TTS (rafael) NÃO estão liberadas. Como o modelo pt aceita os embeddings das
vozes limpas (inglesas), `marius` e `vera` falam pt; a qualidade (sotaque) é questão de escuta. `rafael` entra na escuta
só como referência de avaliação (`--incluir-nao-verificadas`). Aviso pendente ao dono: perguntar à Kyutai (issue no GitHub) a
licença de rafael/lola, ou gravar uma voz própria CC0 (via doação de voz) — mas isso exige o codificador de clonagem,
que está VEDADO no projeto; portanto só voz já embutida sob licença conhecida serve.

## 2. Como foi rodado

- Servidores locais no contrato HTTP da bancada: `scripts/audiolivros/spike/servidor-supertonic.py` e `servidor-pocket-tts.py`
  (Python, 127.0.0.1, lista fechada de vozes, recusa de qualquer campo/caminho de áudio de referência).
  Adaptadores Node: `scripts/audiolivros/sintetizador-local.mjs`; `sintetizar.mjs --motor supertonic|pocket-tts`.
- Executados em venvs (`uv venv` + `uv pip install supertonic==1.3.1 pocket-tts==4.0.1`), Python 3.12, `onnxruntime` 1.31.1, `torch` 2.15.0.
  A forma `uv run <script>` (metadados PEP 723 no cabeçalho) NÃO foi exercitada.
- Pesos baixados para fora do git (`.../tmp/audiolivros-motores/weights/`): Supertonic 385 MB; Pocket TTS 698 MB (modelos pt/es/en + embeddings).
- Pré-processador de texto da F1 ligado (`prepararTextoParaVoz`, versão do `resumo.json`). Whisper da bancada: `onnx-community/whisper-small` q8, CPU.
- Ajuste na bancada: `medir-roundtrip.mjs` descartava em silêncio a cauda de clipes acima de ~30 s (janela do Whisper), o que inflava CER/WER
  (pt-dom-casmurro-cap1 e pt-eca tinham 34-36 s). Agora clipes acima de 25 s são cortados nas pausas (`dividirPcm`) e as partes juntadas;
  primeira medição do Supertonic F1 em pt: CER 24,3% (com a cauda perdida) contra 4,5% (corrigido).

## 3. Resultados MEDIDOS (corpus de 23 frases: 14 pt, 5 en, 4 es; mesma voz em todos os idiomas)

| Candidato           | CER pt | WER pt | Itens pt | CER/WER en    | CER/WER es    | RTF mediano | RTF máx                            | Memória pico | Estab. longo (pt, ~16-18 min)            |
| ------------------- | ------ | ------ | -------- | ------------- | ------------- | ----------- | ---------------------------------- | ------------ | ---------------------------------------- |
| supertonic F1       | 4,5%   | 15,7%  | 81,6%    | 11,5% / 24,2% | 5,0% / 11,4%  | 0,251       | 0,34                               | 0,95 GB      | 1,82% (21 ins + 26 del em 2588 palavras) |
| supertonic M1       | 5,2%   | 17,6%  | 71,1%    | 11,5% / 23,6% | 10,1% / 23,6% | 0,242       | 0,26                               | 0,95 GB      | não medido                               |
| pocket-tts rafael\* | 7,9%   | 21,6%  | 68,4%    | 12,9% / 26,4% | 12,6% / 26,0% | 0,091       | 1,24 (1ª chamada: carga do modelo) | 2,31 GB      | 3,83% (65 ins + 34 del)                  |
| pocket-tts marius   | 8,1%   | 22,9%  | 60,5%    | 17,4% / 27,0% | 14,6% / 26,8% | 0,091       | 0,45                               | 2,31 GB      | não medido                               |
| pocket-tts vera     | 8,0%   | 22,6%  | 55,3%    | 11,0% / 20,2% | 15,3% / 26,0% | 0,090       | 0,37                               | 2,31 GB      | não medido                               |

\* licença não documentada, só avaliação.

- Nenhum candidato passa os limiares provisórios (CER pt ≤ 3%, WER ≤ 8%, itens ≥ 85%, estabilidade ≤ 1%). Relatório: `docs/auditoria/eval/voz-relatorio-fase-0.md`.
- RTF é de CPU de laptop (Apple Silicon), NÃO da GPU do lote nem de servidor x86: serve de ordem de grandeza. O Supertonic gastou ~4,2 min de síntese para ~17,8 min de áudio; o Pocket TTS ~1,4 min para ~16,0 min.
- `numeros e anos` pt: 81,8% (supertonic F1/M1, pocket vera), 90,9% (pocket rafael), 100% (pocket marius). Falhas inspecionadas ("mil duzentos" transcrito "um duzentos"
  nos dois motores; "vinte e um" transcrito "vinte i1" no Supertonic) parecem erro do Whisper, não do TTS (SUPOSIÇÃO: precisa de escuta).
- Siglas em pt (frase `pt-siglas`, MEDIDO em F1 e rafael): Supertonic F1 transcrito sem erro (CER 0); Pocket TTS rafael CER 0,52 ("nasa" -> "nas", "onu" -> "ono", "unicamp" -> "integram").
- Estrangeirismos em pt (frase `pt-estrangeirismo`, mesma amostra): Supertonic CER 0,03 ("brunch" -> "brunjo"); Pocket TTS rafael CER 0,09 ("workshop" -> "orxo", "feedback" -> "fedac", "deadline" -> "deadrine").

### Limites da medição (suposição, não resultado)

- O round-trip depende do Whisper-small q8, sem linha de base humana nem Web Speech/Piper nesta rodada (a saída do Web Speech não é capturável em Node). O piso de erro do próprio Whisper em pt não foi medido, então CER/WER absolutos superestimam o erro do TTS por uma quantidade desconhecida; use-os para COMPARAR motores, não para aprovar.
- As frases de Dom Casmurro e Eça estão na ortografia original ("quizer", "comnosco", "Paschoa"); o Whisper devolve a ortografia moderna, então parte do CER é ortografia, igual nos dois motores.
- Os limiares da spec 7.2 são provisórios; o relatório marca `GPL: não` pelo manifesto que eu escrevi, e `melhorQueAparelho` ficou sem informar (depende da escuta).
- Estabilidade do texto longo medida só em uma voz por motor. Segunda faixa en/es não foi sintetizada em texto longo.
- Qualidade percebida (naturalidade, sotaque das vozes inglesas falando pt no Pocket TTS, timbre) NÃO foi avaliada: depende da escuta cega do dono.
- Duração por frase: não há saída nativa pelos servidores (o Supertonic tem `duration_predictor.onnx`, mas o SDK só devolve a duração total). NÃO VERIFICADO para o Pocket TTS.
- Clonagem: nunca usada; o Pocket TTS rodou sem o codificador de clonagem.

## 4. Escuta cega

Formulário gerado por `gerar-formulario.mjs` com 15 amostras (3 frases pt × 5 vozes) + âncora degradada + 2 repetidas; semente 20261101. Pasta e chave
estão fora do repositório (caminhos no relatório da tarefa). Web Speech não entrou (não capturável em Node): se o dono quiser a comparação "melhor que a voz do aparelho em ≥ 0,5", ouvir manualmente a voz do navegador.
