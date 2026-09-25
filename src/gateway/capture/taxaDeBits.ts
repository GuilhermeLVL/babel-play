/**
 * TAXA DE BITS DO ÁUDIO DA SESSÃO (bits/s) — o gravador ao vivo E a mistura sistema+microfone.
 *
 * Sem ela o MediaRecorder usa o padrão do navegador, que no Chrome é ~128 kbps — dimensionado para
 * MÚSICA, não para uma aula ou chamada. Opus de fala a 24–32 kbps é transparente para
 * re-transcrição (é o que a literatura de ASR sobre áudio comprimido mede), e o arquivo cai para
 * ~1/4: ~14 MB por hora em vez de ~58.
 *
 * CONFIRMADO NA BANCADA DE 2026-09 (docs/auditoria/eval/bancada-2026-09.md): retranscrever pela nuvem
 * 100 falas FLEURS pt recodificadas em Opus deu WER 4,0% a 16, 24 E 32 kbps — contra 4,1% no WAV
 * original. 24 kbps fica: 25% menos armazenamento que 32 (~11 MB/h), com folga sobre os 16 para quem
 * REOUVE a própria fala, que é uso do produto e não só re-transcrição.
 *
 * É UMA constante, num módulo-folha, porque afinar tem de ser uma linha só — nos dois lugares que
 * gravam áudio. Folha para a mistura (`lib/misturarAudios`) não arrastar o VAD e o ONNX só para ler
 * um número.
 */
export const TAXA_DE_BITS_DA_GRAVACAO = 24_000;
