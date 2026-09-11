import React, { useState } from 'react';
import { api } from '../services/apiBridge';
import logoIngeap from '../assets/Logo_Ingeap1.png';

export default function LoginView({ onLoginSuccess }) {
  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nombre.trim() || !dni.trim()) {
      setError('Por favor completa todos los campos.');
      return;
    }

    setCargando(true);
    setError('');

    try {
      const res = await api.iniciarSesion(nombre, dni);
      if (res.exito && res.usuario) {
        onLoginSuccess(res.usuario);
      } else {
        setError(res.error || 'No se pudo iniciar sesión.');
      }
    } catch (err) {
      setError('Ocurrió un error al conectar con el sistema.');
      console.error(err);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-brand">
        <img
          src={logoIngeap}
          alt="Ingeap - Ingeniería Aplicada"
          className="login-logo-img"
        />
        <h1 className="brand-title">
          Check<span>Diario</span>
        </h1>
        <p className="brand-subtitle">Ingeniería Aplicada</p>
      </div>

      <div className="login-card">
        {error && (
          <div className="alert alert-error">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="nombre">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Nombre y Apellido
            </label>
            <input
              id="nombre"
              type="text"
              className="form-input"
              placeholder="Ej. Sergio Juarez"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={cargando}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="dni">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="12" x2="13" y2="12" />
              </svg>
              DNI
            </label>
            <input
              id="dni"
              type="text"
              className="form-input"
              placeholder="Ej. 33357062"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              disabled={cargando}
            />
          </div>

          <button type="submit" className="btn-submit" disabled={cargando}>
            {cargando ? (
              <>
                <div className="spinner" />
                <span>Verificando...</span>
              </>
            ) : (
              <>
                <span>Ingresar al Sistema</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </>
            )}
          </button>
        </form>
      </div>

      <div className="login-footer">
        Ingreso exclusivo para personal autorizado
      </div>
    </div>
  );
}
