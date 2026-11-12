// [FN-00.10] Estado y visibilidad del escritorio
import { createContext } from 'react';

export const DesktopActivityContext = createContext(true);
export const INITIAL_DESKTOP_STATE = { estado: 'iniciando', revision: 0, visible: true };

export function normalizarEstadoEscritorio(respuesta) {
  if (!respuesta || respuesta.exito === false) {
    return { ...INITIAL_DESKTOP_STATE, estado: 'sin_conexion', mensaje: respuesta?.error || 'El escritorio todavía no está disponible.' };
  }
  return { ...INITIAL_DESKTOP_STATE, ...(respuesta.datos || respuesta) };
}
