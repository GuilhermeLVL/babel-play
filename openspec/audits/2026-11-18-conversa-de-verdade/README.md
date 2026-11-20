# Conversa de verdade: medições (18/11/2026)

Change `openspec/changes/conversa-de-verdade`. Duas medições:

1. **O roteiro da auditoria** (`scripts/eval-fala/jantar/jantar.mjs`, cópia adaptada de
   `reports/auditoria-qualidade/conversa/jantar.mjs`). Dois falantes sintéticos num microfone falso, conversa por
   toque, contra o **app local** (`npm run dev:local`, `http://localhost:3100`), com o código desta branch. Desktop
   1280×800 e Pixel 7 emulado (412×839), mais uma rodada em 375×667. As rodadas estão em `rodadas/*.json` e são o
   `resumo.json` de cada uma (`scripts/eval-fala/jantar/resumir.mjs`).
2. **A bancada dos modelos do celular** (`scripts/eval-fala/medir-interprete.sh`). Roda em Node, com o mesmo decode
   do `whisperWorker.ts`, sobre o conjunto `tests/fixtures/interprete/` (10 pt e 10 en em 2 vozes, mais 3 em es) e as
   falas da auditoria, limpas e com ruído. Os resultados estão em `bancada/*.json`.

A coluna **antes** vem da auditoria de 17/11 (produção, `reports/auditoria-qualidade/conversa/rodadas`). A coluna
**depois** vem das rodadas locais com esta branch. As vozes são as mesmas, e os WAV também: a pasta `falas` da
auditoria e o conjunto novo.

**Limite honesto.** O "celular" é o Chrome do Mac emulando um Pixel 7: o modelo e o layout são os do celular, mas a
CPU e a memória são as do Mac. Latência e memória de um aparelho de verdade **não foram medidas**.

## Cenários da spec

| Cenário | Antes (auditoria) | Depois (local) | Passa |
|---|---|---|---|
| Pausa de 1,5 s (CONV-02), `desktop-cache-pausa` | 2 falas ("Então..." → "Then." lido + "Acho que vou pedir a sobremesa."); microfone fechou **1,4 s antes** do fim da fala | 1 fala: "Então, acho que vou pedir a sobremesa de chocolate."; microfone fechou **2,43 s depois** do fim; voz depois do microfone fechado | sim |
| Segundo toque, `desktop-cache-terminei` | não havia | "Terminei" fecha o microfone em **35 a 53 ms**; voz 0,9 a 1,2 s depois do fim da fala | sim (≤ 300 ms) |
| Fala dita no download (CONV-01), `desktop-vazio-limpo` | pt1 como "outro"/en ("Anota, que bom que tu vieres com."); en1 cortada ("Thank you so much."), `fimDaFalaAteMicFecharMs` −3013 | pt1 com dono "Você", pt, "Good night! Glad you came to dinner with us."; en1 inteira; `fimDaFalaAteMicFecharMs` de en1 = +2388 | sim |
| Primeiro uso (CONV-09), `desktop-vazio-limpo` | "Ouvindo…" aos 3,8 s com 0%; microfone não fechou sozinho (toque extra) | "Preparando N%" de 3,1 s até ficar pronto; nenhum "Ouvindo…" antes (`ouvindoComPreparo: false`); microfone fechou sozinho 2,43 s depois da fala, sem toque extra | sim |
| Trocar os lados (CONV-07), `desktop-cache-limpo` | as 2 primeiras falas em pt viraram "outro" | 6/6 falas com o autor de quando foram ditas (pt sempre "Você"); Markdown com os mesmos autores (teste de tela) | sim |
| Espanhol no lado do inglês (CONV-03), `desktop-cache-ruido` | "Sorry, I want to go to the bathroom." → lido "Desculpe, quero ir ao banheiro." | metade: "Não parece inglês — repetir?"; nenhuma leitura; a lista guarda sem tradução | sim |
| Sem falso bloqueio | — | 0 de 20 falas do par (e 0 de 12 falas da auditoria, com e sem ruído), em todo limiar de 0,6 a 0,9 | sim |
| Celular, metade de baixo (CONV-08), `celular-cache-limpo` e `celular-375-limpo` | tradução de 2 frases cortada; microfone da barra a ~100 px do "Falar" | toda frase cabe (`scrollHeight ≤ clientHeight`) ou rola, sem corte no topo; fonte 26 px (412) e 18 px (375); barra escondida, nenhum microfone fora das metades | sim |
| pt no Pixel 7 (CONV-04) | 2 de 3 frases em pt erradas ("vir o tinto", "My vomiting taught…") | base q8 no navegador: WER pt **17,5%** no conjunto de 10 (outra rodada: 10,0%), 0 da lista de constrangedoras, mas pt02 "Você preferiu ver o Chintou Sua Silva." e o pt2 da auditoria segue "vir o tinto" | parcial: vale a **conferência da transcrição** |
| Tamanho anunciado (CONV-11) | celular 224 MB, desktop 353 MB | celular **224 MB** (base q8 + tradutores), desktop 353 MB | já estava certo |

O custo de esperar o silêncio de 2,5 s no fim do turno sem o toque: o tempo do fim da fala até a voz subiu de 0,7 a 0,8 s
para 2,4 a 2,5 s (desktop). Com o "Terminei", fica em 0,9 a 1,2 s.

## Modelo do celular (5.3)

Bancada em Node: CPU do Mac, um processo por modelo. Os números de RSS são do processo Node, não da aba.

| Modelo | Download | WER pt (10) | WER en (10) | Falas pt da auditoria | Constrangedoras | Decode p50 (Mac) | RSS |
|---|---|---|---|---|---|---|---|
| whisper-base q8 (padrão do celular) | 80 MB | 10,0% | 4,4% | pt2 "vir o tinto"; pt3 com ruído "vônia" | 1 (pt2 da auditoria) | 230 ms | 1,2 GB |
| whisper-small q8 | 252 MB | 5,0% | 2,2% | 6/6 certas | 0 | 507 ms | 2,0 GB |
| whisper-small híbrido (desktop) | 589 MB | 3,7% | 2,2% | 6/6 certas | 0 | 579 ms | 1,9 GB |
| Parakeet v3 int8 | 672 MB | 15,0% | 0,0% | 6/6 certas | 0, mas pt08 virou "The skupmy, podzielby z Devagar?" (outro idioma) | 77 ms | 1,7 GB |

No navegador (Pixel 7 emulado, base q8), o WER em pt foi de 10,0% e 17,5% em duas rodadas do conjunto.

**Decisão.** Nenhum modelo foi provado dentro de todos os critérios (WER ≤ 20%, 0 constrangedoras, 1ª tradução p50 ≤ 3 s
e memória da aba < 2,0 GB num celular). O base q8 cabe, mas erra o português de um jeito que constrange. O small q8
acerta, mas o download é 3× maior e a memória e a latência num celular real não foram medidas (no Mac, 0,5 s por frase
e 2,0 GB de RSS). Por isso vale a regra da spec: **no celular com o base q8, fora do inglês, a pessoa confere a
transcrição antes da leitura** ("Ler a tradução", "Corrigir" ou "Descartar"; `conferenciaDaTranscricao.ts`). O
roteador não mudou.

**Para o dono:**

1. Trocar o padrão do Intérprete no celular para o whisper-small q8 (252 MB), depois de medir memória e latência num
   Pixel ou iPhone de verdade, e assim desligar a conferência. A outra opção é manter a conferência.
2. STT em nuvem para quem paga, no Intérprete do celular: não foi ligado e fica documentado (custo; skill `custo-de-ia`).
3. Gravar as 10 frases com vozes humanas (prefixo `humano-` em `tests/fixtures/interprete/`).

## Limiar da conferência de idioma (3.3)

| Limiar | Falsos bloqueios (20 do par + 12 da auditoria) | es pegos: small híbrido (desktop) | es pegos: small q8 | es pegos: base q8 (celular) |
|---|---|---|---|---|
| 0,6 | 0 | 5/5 | 5/5 | 2/5 |
| 0,7 | 0 | 5/5 | 5/5 | 2/5 |
| **0,8 (adotado)** | 0 | 5/5 | 2/5 | 1/5 |
| 0,9 | 0 | 2/5 | 2/5 | 1/5 |

O 0,8 da spec ficou: no desktop pega todo o espanhol, sem falso bloqueio. No celular, o base q8 quase não reconhece o
espanhol desse jeito ("Perdón, ¿alguien quiere más pan?" sai com 0,19 de confiança). Ali quem protege é a
conferência da transcrição (pt) e, para o inglês, o limiar alto. Baixar para 0,7 só ajudaria o small q8, e o conjunto
é pequeno e sintético. Fica a recomendação de revisar com as gravações humanas.
