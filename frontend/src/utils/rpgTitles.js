/**
 * Asigna los títulos honoríficos de fantasía medieval para los miembros del gremio
 */
export function getTituloRpg(nombre) {
  if (!nombre) return '🧙‍♂️ Desarrollador Arcano';
  const n = nombre.toLowerCase().trim();

  // Marco Regis - Hechicero Líder del gremio
  if (n.includes('marco') || n.includes('regis')) {
    return '🧙‍♂️ Hechicero Líder del gremio';
  }

  // Lionel Juarez - Paladín del frontend
  if (n.includes('lionel') || n.includes('juarez')) {
    return '🛡️ Paladín del frontend';
  }

  // Iván Valentin - Alquimista de automatizaciones
  if (n.includes('iván') || n.includes('ivan') || n.includes('valentin')) {
    return '⚗️ Alquimista de automatizaciones';
  }

  return '🧙‍♂️ Desarrollador Arcano (Gremio Aplicaciones)';
}
