// [FN-00.10] Conexión no bloqueante del escritorio
import React, { useState } from 'react';
import { api } from '../services/apiBridge';

export default function ConnectionScreen({ conexion }) {
  const [solicitando, setSolicitando] = useState(false);
  const conectando = conexion.estado === 'iniciando';
  const reintentar = async () => {
    setSolicitando(true);
    try {
      await api.reintentarConexion();
    } finally {
      setSolicitando(false);
    }
  };
  return (
    <div className="app-container">
      <div className="loading-screen" role="status" aria-live="polite">
        {conectando && <div className="spinner" style={{ width: 32, height: 32 }} />}
        <h2>{conectando ? 'Conectando con Ingeap' : 'Conexión pendiente'}</h2>
        <p>{conexion.mensaje || 'Podés mantener abierta la aplicación. Reintentaremos automáticamente.'}</p>
        {conexion.reintento_en != null && <p>Próximo intento en {conexion.reintento_en} segundos.</p>}
        <button className="btn-primary" type="button" disabled={conectando || solicitando} onClick={reintentar}>
          Reintentar conexión
        </button>
      </div>
    </div>
  );
}
