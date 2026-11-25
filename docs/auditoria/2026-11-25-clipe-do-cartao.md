# Clipe do cartão: bytes por segundo (simulação offline)

Data: 2026-11-25. Fixtures: 23 falas em `tests/fixtures/interprete/falas`, 68.1 s no total.
Codificador: libopus (ffmpeg), mono 16 kHz, voip. Tempo = ffmpeg em Node (inclui subir o processo); NÃO é o WebCodecs no aparelho (tarefa 1.3 [R]).

| Formato            | Bytes/s | Tempo médio por clipe (ms) | Clipe de 3 s (KB) |
| ------------------ | ------: | -------------------------: | ----------------: |
| WAV 16 kHz/16 bits |   32015 |                        n/a |              93.8 |
| Opus 16 kbps       |    1880 |                         39 |               5.5 |
| Opus 24 kbps       |    2565 |                         39 |               7.5 |
| Opus 32 kbps       |    3233 |                         39 |               9.5 |

Critério da tarefa 1.1: Opus 24 kbps <= 4 KB/s: ATENDIDO (2565 B/s).

## Linha de base de "bytes baixados para tocar a fala original"

Hoje (`lib/audioDaSessao.ts`) tocar 3 s baixa o áudio INTEIRO da sessão. Estimativa pela proposta, NÃO medida em produção:
uma reunião de 40 min em Ogg Opus a ~32 kbps (~4 KB/s) pesa ~9,6 MB, baixados uma vez para os cartões da reunião.
Com clipes de 24 kbps, 20 cartões de ~3,3 s pesam ~0.16 MB.
A linha de base real (bytes por toque, em sessão de produção) fica para a sessão de bancada [B].
