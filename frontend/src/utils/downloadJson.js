// Los datos se descargan como JSON; nunca se interpretan como HTML.
export function descargarJson(datos, nombreArchivo) {
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json;charset=utf-8;' });
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
