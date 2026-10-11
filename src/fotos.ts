import { MAX_BYTES_FOTO } from '../shared/catalogos.js';

const LADO_MAX = 1600;

// Reduce la foto a máx. 1600 px por lado y la convierte a JPEG para que
// subir 5 fotos sea rápido incluso con datos móviles.
export async function comprimirFoto(archivo: File): Promise<File> {
  const imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  const escala = Math.min(1, LADO_MAX / Math.max(imagen.width, imagen.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(imagen.width * escala);
  canvas.height = Math.round(imagen.height * escala);
  canvas.getContext('2d')!.drawImage(imagen, 0, 0, canvas.width, canvas.height);
  imagen.close();

  for (const calidad of [0.82, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', calidad));
    if (blob && blob.size <= MAX_BYTES_FOTO) {
      const nombre = archivo.name.replace(/\.[^.]+$/, '') + '.jpg';
      return new File([blob], nombre, { type: 'image/jpeg' });
    }
  }
  throw new Error('La foto es demasiado grande.');
}
