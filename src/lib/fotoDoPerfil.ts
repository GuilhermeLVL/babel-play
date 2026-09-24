import { useEffect, useState } from 'react';

/**
 * A FOTO DO PERFIL — "Enviar foto" de Perfil → Você.
 *
 * O servidor NÃO tem rota de upload de imagem (nem armazenamento de arquivo para isso), então a foto
 * fica NESTE aparelho: reduzida para 192×192 (corte central, JPEG) e guardada como data URL no
 * `localStorage`, por usuário. É pequena (~10–20 KB), não vai para o servidor e some se o
 * armazenamento do navegador for limpo — o que a tela não esconde.
 *
 * Store de módulo com inscrição, para o avatar do shell poder mostrar a mesma foto (`useFotoDoPerfil`).
 */

const chave = (usuario: string | null | undefined) => `babel.fotoDoPerfil.${usuario || 'local'}`;
const LADO = 192;

const inscritos = new Set<() => void>();
const avisar = () => inscritos.forEach((f) => f());

export function lerFoto(usuario: string | null | undefined): string | null {
  try {
    return localStorage.getItem(chave(usuario));
  } catch {
    return null;
  }
}

/** Grava (ou apaga, com `null`). Devolve `false` se o navegador recusou (cota cheia, modo privado). */
export function gravarFoto(usuario: string | null | undefined, dataUrl: string | null): boolean {
  try {
    if (dataUrl) localStorage.setItem(chave(usuario), dataUrl);
    else localStorage.removeItem(chave(usuario));
    avisar();
    return true;
  } catch {
    return false;
  }
}

/** Lê o arquivo, corta ao centro e reduz para 192×192. Rejeita o que não for imagem. */
export function reduzirFoto(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!arquivo.type.startsWith('image/')) return reject(new Error('não é imagem'));
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('não deu para ler o arquivo'));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('imagem inválida'));
      img.onload = () => {
        const lado = Math.min(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = LADO;
        c.height = LADO;
        const g = c.getContext('2d');
        if (!g) return reject(new Error('sem canvas'));
        g.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, LADO, LADO);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(leitor.result);
    };
    leitor.readAsDataURL(arquivo);
  });
}

export function useFotoDoPerfil(usuario: string | null | undefined): string | null {
  const [foto, setFoto] = useState(() => lerFoto(usuario));
  useEffect(() => {
    const reler = () => setFoto(lerFoto(usuario));
    reler();
    inscritos.add(reler);
    return () => {
      inscritos.delete(reler);
    };
  }, [usuario]);
  return foto;
}
