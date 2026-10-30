// [FN-03.09] Modal de Carga de Tarifas de Roster
import React, { useState } from 'react';
import { api } from '../../services/apiBridge';

export default function RosterTarifaModal({
  isOpen,
  onClose,
  proyectosDisponibles = [],
  onGuardadoExitoso,
  isRpg = false
}) {
  const [proyecto, setProyecto] = useState(proyectosDisponibles[0] || '');
  const [diaNormal, setDiaNormal] = useState('');
  const [diaDomingo, setDiaDomingo] = useState('');
  const [subida, setSubida] = useState('0');
  const [bajada, setBajada] = useState('0');
  const [adicionalTurno, setAdicionalTurno] = useState('0');
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!proyecto) {
      setErrorMsg('Debe seleccionar un proyecto.');
      return;
    }
    if (diaNormal === '' || isNaN(Number(diaNormal)) || Number(diaNormal) < 0) {
      setErrorMsg('El valor de día normal es obligatorio y debe ser mayor o igual a 0.');
      return;
    }
    if (diaDomingo === '' || isNaN(Number(diaDomingo)) || Number(diaDomingo) < 0) {
      setErrorMsg('El valor de día domingo es obligatorio y debe ser mayor o igual a 0.');
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        proyecto: proyecto.trim(),
        dia_normal: parseFloat(diaNormal) || 0,
        dia_domingo: parseFloat(diaDomingo) || 0,
        subida: parseFloat(subida) || 0,
        bajada: parseFloat(bajada) || 0,
        adicional_turno: parseFloat(adicionalTurno) || 0
      };

      const res = await api.guardarTarifaRoster(payload);
      if (res && res.exito) {
        if (onGuardadoExitoso) {
          onGuardadoExitoso(res.tarifa || payload);
        }
        onClose();
      } else {
        setErrorMsg(res?.error || 'No se pudo guardar la tarifa de roster.');
      }
    } catch (err) {
      console.error('Error al guardar tarifa de roster:', err);
      setErrorMsg('Error de conexión al guardar la tarifa en PostgreSQL.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(3px)'
      }}
    >
      <div
        className="modal-container"
        style={{
          width: '100%',
          maxWidth: '520px',
          background: 'var(--card-bg, #ffffff)',
          color: 'var(--text-primary, #1e293b)',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
          padding: '24px',
          margin: '16px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#cc3333' }}>⚙</span>
            {isRpg ? '📜 Fijar Tarifas de Gremio para Proyecto' : 'Cargar Tarifas de Roster'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: '#999999',
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              padding: '10px 14px',
              marginBottom: '16px',
              borderRadius: '8px',
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              fontSize: '13px',
              border: '1px solid #fecaca'
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Enum desplegable de proyecto */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Proyecto / Servicio <span style={{ color: '#cc3333' }}>*</span>
            </label>
            <select
              value={proyecto}
              onChange={(e) => setProyecto(e.target.value)}
              required
              disabled={guardando}
              style={{
                width: '100%',
                height: '44px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                backgroundColor: 'var(--input-bg, #ffffff)',
                color: 'inherit'
              }}
            >
              <option value="" disabled>Seleccione un proyecto...</option>
              {proyectosDisponibles.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
            {/* dia_normal (Obligatorio) */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Día Normal ($) <span style={{ color: '#cc3333' }}>*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                placeholder="0.00"
                value={diaNormal}
                onChange={(e) => setDiaNormal(e.target.value)}
                disabled={guardando}
                style={{
                  width: '100%',
                  height: '44px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* dia_domingo (Obligatorio) */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Día Domingo ($) <span style={{ color: '#cc3333' }}>*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                placeholder="0.00"
                value={diaDomingo}
                onChange={(e) => setDiaDomingo(e.target.value)}
                disabled={guardando}
                style={{
                  width: '100%',
                  height: '44px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* Opcionales: subida, bajada, adicional_turno */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '22px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                Subida ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={subida}
                onChange={(e) => setSubida(e.target.value)}
                disabled={guardando}
                style={{
                  width: '100%',
                  height: '44px',
                  padding: '0 10px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                Bajada ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={bajada}
                onChange={(e) => setBajada(e.target.value)}
                disabled={guardando}
                style={{
                  width: '100%',
                  height: '44px',
                  padding: '0 10px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                Adicional Turno ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={adicionalTurno}
                onChange={(e) => setAdicionalTurno(e.target.value)}
                disabled={guardando}
                style={{
                  width: '100%',
                  height: '44px',
                  padding: '0 10px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={guardando}
              style={{
                minHeight: '44px',
                padding: '0 18px',
                borderRadius: '8px',
                border: '1px solid #999999',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              style={{
                minHeight: '44px',
                padding: '0 20px',
                borderRadius: '8px',
                border: 'none',
                background: '#cc3333',
                color: '#ffffff',
                cursor: 'pointer',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {guardando ? 'Guardando...' : 'Guardar Tarifa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
