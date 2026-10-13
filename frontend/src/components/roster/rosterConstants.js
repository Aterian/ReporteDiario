// [FN-03.07] Constantes y utilidades de dominio para Roster
export const COLABORADORES_GANTT_INGENIERIA = [
  'Gabriel Juarez',
  'Maximiliano Kromm',
  'Fernando Aimar',
  'Norberto José Luis Botto',
  'Ivan Emanuel Altamirano',
  'Alejo Ferrero',
  'Facundo Ezequiel Calgaro',
  'Rodolfo Julian Lescano',
  'Agustina Ferrante',
  'José María Zufiaurre'
];

export const normalizarTexto = (valor) => {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
};

export const buscarTarifaRoster = (proyectoBuscado, tarifas) => {
  if (!proyectoBuscado || !Array.isArray(tarifas) || tarifas.length === 0) {
    return null;
  }

  const busquedaNorm = normalizarTexto(proyectoBuscado);

  // 1. Coincidencia por ID de Proyecto (UUID)
  const matchPorId = tarifas.find((t) => {
    const idTarifa = normalizarTexto(t.id_proyecto);
    return idTarifa !== '' && (idTarifa === busquedaNorm || busquedaNorm.includes(idTarifa) || idTarifa.includes(busquedaNorm));
  });

  if (matchPorId) return matchPorId;

  // 2. Coincidencia por Denominación Exacta
  const matchDenominacionExacta = tarifas.find((t) => {
    const nombreTarifa = normalizarTexto(t.denominacion || t.proyecto);
    return nombreTarifa !== '' && nombreTarifa === busquedaNorm;
  });

  if (matchDenominacionExacta) return matchDenominacionExacta;

  // 3. Coincidencia por Inclusión Parcial
  const matchParcial = tarifas.find((t) => {
    const nombreTarifa = normalizarTexto(t.denominacion || t.proyecto);
    return nombreTarifa !== '' && (busquedaNorm.includes(nombreTarifa) || nombreTarifa.includes(busquedaNorm));
  });

  if (matchParcial) return matchParcial;

  return null;
};

export const NOMBRES_MESES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];
