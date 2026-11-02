/**
 * Asigna los títulos honoríficos de fantasía medieval para los miembros del gremio
 */
export function getTituloRpg(nombre, area = '') {
  if (!nombre) return '🗡️ Aventurero del Gremio';
  const n = nombre.toLowerCase().trim();
  const a = (area || '').toUpperCase().trim();

  // Justina Bertolozzi - Gran Canciller
  if (n.includes('justina') || n.includes('bertolozzi')) {
    return '⚖️ Gran Canciller de Recompensas y Honorarios';
  }

  // Iván Valentin - Alquimista de automatizaciones
  if (n.includes('iván') || n.includes('ivan') || n.includes('valentin')) {
    return '⚗️ Alquimista Supremo de Automatizaciones';
  }

  // Gabriel Canavesio - Erudito Deambulante
  if (n.includes('gabriel') || n.includes('canavesio')) {
    return '📜 Erudito Deambulante y Archivero Real';
  }

  // Marco Regis - Hechicero Líder del gremio
  if (n.includes('marco') || n.includes('regis')) {
    return '🧙‍♂️ Hechicero Supremo del Gremio';
  }

  // Lionel Juarez - Paladín del frontend
  if (n.includes('lionel') || n.includes('juarez')) {
    return '🛡️ Paladín Ilustre del Frontend';
  }

  // Matías / Camilo / Topógrafos / Mensura
  if (a === 'M' || n.includes('mensura')) {
    return '🧭 Cartógrafo de Tierras Salvajes y Mojones';
  }

  // Ingeniería
  if (a === 'I' || n.includes('ingenier')) {
    return '⚒️ Gran Artífice de Fortalezas y Estructuras';
  }

  // Núcleo
  if (a === 'N' || n.includes('nucleo') || n.includes('núcleo')) {
    return '⚔️ Comandante de Vanguardia de Obras';
  }

  // Ventas y Marketing
  if (a === 'VYM' || n.includes('ventas') || n.includes('marketing')) {
    return '🎪 Heraldo de las Cuatro Regiones Comerciales';
  }

  // SIG
  if (a === 'SIG' || n.includes('sig')) {
    return '🗺️ Astrónomo de Mapas Celestiales y Territoriales';
  }

  // RRHH
  if (a === 'RRHH' || n.includes('rrhh') || n.includes('recursos')) {
    return '📜 Escribano Mayor de Registros y Reclutas';
  }

  return '🗡️ Aventurero Valiente del Gremio Ingeap';
}

