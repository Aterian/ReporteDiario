// [FN-00.10] Consultar estado local sin generar consultas PostgreSQL
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/apiBridge';
import { INITIAL_DESKTOP_STATE } from '../services/desktopState';

export function useDesktopState() {
  const [visible, setVisible] = useState(null);
  const consulta = useQuery({
    queryKey: ['desktop-state'],
    queryFn: () => api.obtenerEstadoInicializacion(),
    retry: false,
    refetchInterval: (query) => query.state.data?.estado === 'disponible' ? 10000 : 1500,
    refetchIntervalInBackground: true,
  });
  useEffect(() => {
    const cambiar = (event) => setVisible(Boolean(event.detail?.visible));
    window.addEventListener('escritorio-visibilidad', cambiar);
    return () => window.removeEventListener('escritorio-visibilidad', cambiar);
  }, []);
  const conexion = consulta.data || INITIAL_DESKTOP_STATE;
  return { conexion, visible: visible ?? conexion.visible ?? true };
}
