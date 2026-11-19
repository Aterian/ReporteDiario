// Descarga segura de archivos generados localmente (JSON / PDF) sin interpretar como HTML.
export function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  try {
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    enlace.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function descargarJson(datos, nombreArchivo) {
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json;charset=utf-8;' });
  descargarBlob(blob, nombreArchivo);
}

// [FN-11.05] Descarga PDF vía Blob o decodificando Base64 como fallback web
export function descargarPdfBlob(blob, nombreArchivo, contenidoBase64 = '') {
  if (blob instanceof Blob) {
    descargarBlob(blob, nombreArchivo);
    return;
  }
  const limpio = String(contenidoBase64 || '').replace(/^data:[^,]+,/, '');
  const binario = atob(limpio);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i);
  }
  descargarBlob(new Blob([bytes], { type: 'application/pdf' }), nombreArchivo);
}
