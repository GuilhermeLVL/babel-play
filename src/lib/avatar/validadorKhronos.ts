/**
 * A PONTE para o validador da Khronos, que roda num Worker (`validadorKhronos.worker.ts`).
 *
 * ESCOLHA (documentada): `import('gltf-validator')` dentro de um Worker do Vite, e não um arquivo solto em
 * `public/vendor/` com SRI. O pacote fica FIXADO por versão exata no `package-lock.json` (com `integrity`), é
 * empacotado num chunk lazy do mesmo domínio e só é buscado quando a pessoa traz um arquivo; um `public/vendor/`
 * duplicaria o código fora do lock e do `npm audit`. Tamanho: ver o relatório do build (chunk do worker).
 */
import type { ValidadorKhronos } from '../../core/avatar/importador/validar';

const PRAZO_MS = 30_000;

type Resposta =
  | { ok: true; mensagens: Array<{ severity: number; code: string; pointer: string }> }
  | { ok: false; erro: string };

/** `null` quando o navegador não tem Worker (a validação estrutural fica incompleta e a tela avisa). */
export function criarValidadorKhronos(): ValidadorKhronos | null {
  if (typeof Worker === 'undefined') return null;
  return {
    validateBytes: (bytes) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./validadorKhronos.worker.ts', import.meta.url), { type: 'module' });
        const fim = () => {
          clearTimeout(relogio);
          worker.terminate();
        };
        const relogio = setTimeout(() => {
          fim();
          reject(new Error('tempo esgotado'));
        }, PRAZO_MS);
        worker.onmessage = (e: MessageEvent<Resposta>) => {
          fim();
          if (e.data.ok) resolve({ issues: { messages: e.data.mensagens } });
          else reject(new Error('erro' in e.data ? e.data.erro : 'falhou'));
        };
        worker.onerror = () => {
          fim();
          reject(new Error('o validador não carregou'));
        };
        // Cópia transferida: o arquivo da pessoa continua inteiro na página.
        const copia = bytes.slice().buffer as ArrayBuffer;
        worker.postMessage({ bytes: copia }, [copia]);
      }),
  };
}
