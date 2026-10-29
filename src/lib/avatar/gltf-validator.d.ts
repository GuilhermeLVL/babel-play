/** O mínimo do `gltf-validator` (Khronos, Apache-2.0) que o importador usa. O pacote não traz tipos. */
declare module 'gltf-validator' {
  export function version(): string;
  export function validateBytes(
    data: Uint8Array,
    options?: {
      uri?: string;
      format?: 'glb' | 'gltf';
      maxIssues?: number;
      externalResourceFunction?: (uri: string) => Promise<Uint8Array>;
    },
  ): Promise<{
    issues?: { numErrors?: number; messages?: Array<{ severity: number; code: string; pointer?: string }> };
  }>;
}
