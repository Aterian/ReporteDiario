// [FN-07.15] Modal corporativo de consolidación de asistencias en turnos de Roster
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { NOMBRES_MESES } from './historyConstants';

const normalizar = (txt) =>
  String(txt || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

const resolverProyectoServicio = (servicioRaw, serviciosDisponibles) => {
  const sNorm = normalizar(servicioRaw);
  if (!sNorm || !Array.isArray(serviciosDisponibles) || serviciosDisponibles.length === 0) {
    return '';
  }
  const exacto = serviciosDisponibles.find((p) => normalizar(p) === sNorm);
  if (exacto) return exacto;

  const matchCod = sNorm.match(/^(\d{3}-[a-z]+-[a-z]+(?:-\d+)?)/);
  if (matchCod) {
    const prefijo = matchCod[1];
    const porPrefijo = serviciosDisponibles.find((p) => normalizar(p).includes(prefijo));
    if (porPrefijo) return porPrefijo;
  }

  if (sNorm.length >= 8) {
    const parcial = serviciosDisponibles.find((p) => {
      const pNorm = normalizar(p);
      return pNorm.includes(sNorm) || sNorm.includes(pNorm);
    });
    if (parcial) return parcial;
  }
  return '';
};

const clasificarTipoRoster = (reg) => {
  const estado = normalizar(reg.activo_franco);
  const tipoOcf = normalizar(reg.tipo_ocf || reg.lugar);
  if (estado === 'vacaciones' || estado === 'licencia' || tipoOcf === 'vacaciones' || tipoOcf === 'licencia') {
    return null;
  }
  if (estado === 'franco' || (tipoOcf.startsWith('franco') && !tipoOcf.includes('trabajado'))) {
    return 'Franco';
  }
  return 'Campo';
};

const calcularDiferenciaDias = (fechaIsoA, fechaIsoB) => {
  const [yA, mA, dA] = String(fechaIsoA).split('-').map(Number);
  const [yB, mB, dB] = String(fechaIsoB).split('-').map(Number);
  const utcA = Date.UTC(yA, mA - 1, dA);
  const utcB = Date.UTC(yB, mB - 1, dB);
  return Math.round((utcB - utcA) / 86400000);
};

export default function HistoryCreateRosterModal({
  abierto,
  onClose,
  empleadoAuditar,
  fechaCalendario,
  registros,
  serviciosDisponibles = [],
  diasSeleccionadosCalendario,
  seleccionados,
  creandoRoster,
  onConfirmarCreacion
}) {
  const tieneSeleccionManual =
    (diasSeleccionadosCalendario && diasSeleccionadosCalendario.size > 0) ||
    (seleccionados && seleccionados.size > 0);

  const [modoAlcance, setModoAlcance] = useState('mes_extendido');
  const [bloques, setBloques] = useState([]);
  const [proyectoGlobal, setProyectoGlobal] = useState('');

  // Atajo de cierre con tecla Escape
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape' && !creandoRoster) {
        onClose();
      }
    },
    [creandoRoster, onClose]
  );

  useEffect(() => {
    if (abierto) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [abierto, handleKeyDown]);

  useEffect(() => {
    if (abierto) {
      setModoAlcance(tieneSeleccionManual ? 'seleccion' : 'mes_extendido');
    }
  }, [abierto, tieneSeleccionManual]);

  const prefijoMes = useMemo(() => {
    if (!fechaCalendario) return '';
    return `${fechaCalendario.getFullYear()}-${String(fechaCalendario.getMonth() + 1).padStart(2, '0')}`;
  }, [fechaCalendario]);

  const nombreMesAnio = useMemo(() => {
    if (!fechaCalendario) return '';
    return `${NOMBRES_MESES[fechaCalendario.getMonth()]} ${fechaCalendario.getFullYear()}`;
  }, [fechaCalendario]);

  // Estadísticas del empleado auditado
  const estadisticasEmpleado = useMemo(() => {
    const empNorm = normalizar(empleadoAuditar);
    const delEmpleado = (registros || []).filter((r) => normalizar(r.empleado) === empNorm);
    const yaEnRoster = delEmpleado.filter((r) => Boolean(r.id_roster));
    const huerfanos = delEmpleado.filter((r) => !r.id_roster && clasificarTipoRoster(r) !== null);
    return { total: delEmpleado.length, yaEnRoster: yaEnRoster.length, huerfanos };
  }, [registros, empleadoAuditar]);

  // Construir bloques propuestos según el modoAlcance
  useEffect(() => {
    if (!abierto || !empleadoAuditar) return;

    let candidatos = [...estadisticasEmpleado.huerfanos];

    if (modoAlcance === 'seleccion') {
      candidatos = candidatos.filter(
        (r) =>
          (diasSeleccionadosCalendario && diasSeleccionadosCalendario.has(String(r.fecha))) ||
          (seleccionados && seleccionados.has(r.id))
      );
    } else if (modoAlcance === 'mes_estricto') {
      candidatos = candidatos.filter((r) => String(r.fecha || '').startsWith(prefijoMes));
    }

    // Ordenar por fecha ascendente y deduplicar por fecha
    candidatos.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

    const porFecha = new Map();
    candidatos.forEach((r) => {
      const f = String(r.fecha || '').slice(0, 10);
      if (!f) return;
      const proy = resolverProyectoServicio(r.servicio, serviciosDisponibles);
      const existente = porFecha.get(f);
      if (!existente || (!existente.proyectoDetectado && proy)) {
        porFecha.set(f, {
          ...r,
          fechaIso: f,
          tipoRoster: clasificarTipoRoster(r),
          proyectoDetectado: proy
        });
      }
    });

    const diasOrdenados = Array.from(porFecha.values()).sort((a, b) =>
      a.fechaIso.localeCompare(b.fechaIso)
    );

    // Determinar proyecto predominante del empleado para asignarlo como fallback en Francos sin proyecto
    const conteoProyectos = new Map();
    diasOrdenados.forEach((d) => {
      if (d.proyectoDetectado) {
        conteoProyectos.set(d.proyectoDetectado, (conteoProyectos.get(d.proyectoDetectado) || 0) + 1);
      }
    });
    let proyectoPredominante = '';
    let maxapariciones = 0;
    conteoProyectos.forEach((cant, proy) => {
      if (cant > maxapariciones) {
        maxapariciones = cant;
        proyectoPredominante = proy;
      }
    });
    if (!proyectoPredominante && serviciosDisponibles.length > 0) {
      proyectoPredominante = serviciosDisponibles[0];
    }
    setProyectoGlobal(proyectoPredominante);

    // Agrupar días contiguos (Gaps-and-Islands)
    const islas = [];
    let actual = null;

    diasOrdenados.forEach((d) => {
      const proyEfectivo = d.proyectoDetectado || proyectoPredominante;
      if (
        actual &&
        actual.tipo === d.tipoRoster &&
        actual.proyecto === proyEfectivo &&
        calcularDiferenciaDias(actual.fecha_fin, d.fechaIso) === 1
      ) {
        actual.fecha_fin = d.fechaIso;
        actual.dias += 1;
      } else {
        if (actual) islas.push(actual);
        actual = {
          id_temp: `${d.fechaIso}-${d.tipoRoster}-${islas.length}`,
          incluido: true,
          empleado: empleadoAuditar,
          tipo: d.tipoRoster,
          proyecto: proyEfectivo,
          fecha_inicio: d.fechaIso,
          fecha_fin: d.fechaIso,
          dias: 1
        };
      }
    });
    if (actual) islas.push(actual);

    // Si es 'mes_extendido', conservar únicamente los bloques que tocan el mes visible
    const filtradas =
      modoAlcance === 'mes_extendido'
        ? islas.filter(
            (b) =>
              b.fecha_inicio.startsWith(prefijoMes) ||
              b.fecha_fin.startsWith(prefijoMes) ||
              (b.fecha_inicio < `${prefijoMes}-01` && b.fecha_fin > `${prefijoMes}-31`)
          )
        : islas;

    setBloques(filtradas);
  }, [
    abierto,
    empleadoAuditar,
    modoAlcance,
    prefijoMes,
    estadisticasEmpleado,
    serviciosDisponibles,
    diasSeleccionadosCalendario,
    seleccionados
  ]);

  if (!abierto) return null;

  const handleActualizarBloque = (idTemp, campo, valor) => {
    setBloques((prev) =>
      prev.map((b) => {
        if (b.id_temp !== idTemp) return b;
        const actualizado = { ...b, [campo]: valor };
        if (campo === 'fecha_inicio' || campo === 'fecha_fin') {
          const diff = calcularDiferenciaDias(actualizado.fecha_inicio, actualizado.fecha_fin);
          actualizado.dias = diff >= 0 ? diff + 1 : 0;
        }
        return actualizado;
      })
    );
  };

  const handleAplicarProyectoGlobal = (nuevoProy) => {
    setProyectoGlobal(nuevoProy);
    if (!nuevoProy) return;
    setBloques((prev) => prev.map((b) => ({ ...b, proyecto: nuevoProy })));
  };

  const bloquesSeleccionados = bloques.filter((b) => b.incluido && b.proyecto && b.dias > 0);
  const totalDiasConsolidar = bloquesSeleccionados.reduce((acc, b) => acc + b.dias, 0);

  const modalContent = (
    <div
      className="modal-backdrop"
      style={{
        zIndex: 10000,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)'
      }}
      onClick={() => !creandoRoster && onClose()}
    >
      <div
        className="modal-roster-box"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-roster-title"
      >
        {/* Cabecera Corporativa del Modal */}
        <div className="modal-roster-header">
          <div className="modal-roster-header-left">
            <div className="modal-roster-icon-wrap" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <path d="M8 14h.01" />
                <path d="M12 14h.01" />
                <path d="M16 14h.01" />
                <path d="M8 18h.01" />
                <path d="M12 18h.01" />
                <path d="M16 18h.01" />
              </svg>
            </div>
            <div className="modal-roster-titles">
              <div className="modal-roster-title-row">
                <span id="modal-roster-title" className="modal-roster-title-text">
                  Crear Turnos de Roster desde Asistencias
                </span>
                <span className="modal-roster-colab-pill" title="Colaborador asignado">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>{empleadoAuditar}</span>
                </span>
              </div>
              <span className="modal-roster-subtitle">
                Consolida jornadas diarias en bloques continuos de <code>app_rrhh.b_1_roster</code> garantizando integridad contable.
              </span>
            </div>
          </div>

          <button
            type="button"
            className="modal-roster-close-btn"
            onClick={onClose}
            disabled={creandoRoster}
            aria-label="Cerrar modal"
            title="Cerrar (Esc)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Cuerpo del Modal con Scroll Suave */}
        <div className="modal-roster-body">
          {/* Tarjeta de Alcance y Proyecto Global */}
          <div className="modal-roster-config-card">
            <div className="modal-roster-field">
              <label htmlFor="roster-alcance-select" className="modal-roster-field-label">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                Alcance de Asistencias a Agrupar
              </label>
              <select
                id="roster-alcance-select"
                className="modal-roster-select"
                value={modoAlcance}
                onChange={(e) => setModoAlcance(e.target.value)}
                disabled={creandoRoster}
              >
                <option value="mes_extendido">
                  Mes {nombreMesAnio} (con extensión de turnos limítrofes)
                </option>
                <option value="mes_estricto">
                  Solo días estrictos de {nombreMesAnio}
                </option>
                <option value="todo_empleado">
                  Todo el historial sin Roster de {empleadoAuditar}
                </option>
                {tieneSeleccionManual && (
                  <option value="seleccion">
                    Solo días seleccionados manualmente ({diasSeleccionadosCalendario?.size || seleccionados?.size || 0})
                  </option>
                )}
              </select>
            </div>

            <div className="modal-roster-field">
              <label htmlFor="roster-proyecto-global-select" className="modal-roster-field-label">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                Proyecto por Defecto (Aplicar a todos)
              </label>
              <select
                id="roster-proyecto-global-select"
                className="modal-roster-select"
                value={proyectoGlobal}
                onChange={(e) => handleAplicarProyectoGlobal(e.target.value)}
                disabled={creandoRoster}
              >
                <option value="">Seleccionar proyecto...</option>
                {serviciosDisponibles.map((srv) => (
                  <option key={srv} value={srv}>
                    {srv}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Barra de Estadísticas y Resumen */}
          <div className="modal-roster-metrics-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className="modal-roster-metric-tag metric-amber">
                <span>⚠️</span>
                <span>{estadisticasEmpleado.huerfanos.length} asistencias sin Roster</span>
              </span>
              <span className="modal-roster-metric-tag metric-emerald">
                <span>✓</span>
                <span>{estadisticasEmpleado.yaEnRoster} ya vinculadas</span>
              </span>
            </div>

            <div>
              <span className="modal-roster-metric-tag metric-summary-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{bloquesSeleccionados.length} bloque(s) a crear ({totalDiasConsolidar} días en total)</span>
              </span>
            </div>
          </div>

          {/* Tabla de Bloques de Roster Propuestos */}
          {bloques.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                border: '1px dashed var(--border-input, #cbd5e1)',
                borderRadius: '12px',
                background: 'var(--bg-surface-elevated, #f8fafc)',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>
                No se detectaron asistencias pendientes de vincular a Roster para <strong>{empleadoAuditar}</strong> en el alcance seleccionado.
              </span>
            </div>
          ) : (
            <div className="modal-roster-table-card">
              <div className="modal-roster-table-scroll">
                <table className="modal-roster-table">
                  <thead>
                    <tr>
                      <th style={{ width: '44px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={bloques.length > 0 && bloques.every((b) => b.incluido)}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setBloques((prev) => prev.map((b) => ({ ...b, incluido: val })));
                          }}
                          style={{ accentColor: '#cc3333', cursor: 'pointer', width: '16px', height: '16px' }}
                          title="Seleccionar / deseleccionar todos los bloques"
                          aria-label="Seleccionar todos los bloques"
                        />
                      </th>
                      <th style={{ width: '150px' }}>Tipo Turno</th>
                      <th style={{ minWidth: '260px' }}>Proyecto de Roster</th>
                      <th style={{ width: '145px' }}>Fecha Inicio</th>
                      <th style={{ width: '145px' }}>Fecha Fin</th>
                      <th style={{ width: '75px', textAlign: 'center' }}>Días</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bloques.map((b) => (
                      <tr
                        key={b.id_temp}
                        className={b.incluido ? '' : 'modal-roster-row-excluded'}
                      >
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={b.incluido}
                            onChange={(e) => handleActualizarBloque(b.id_temp, 'incluido', e.target.checked)}
                            style={{ accentColor: '#cc3333', cursor: 'pointer', width: '16px', height: '16px' }}
                            aria-label={`Incluir bloque ${b.tipo} de ${b.fecha_inicio} a ${b.fecha_fin}`}
                          />
                        </td>
                        <td>
                          <select
                            className={`modal-roster-tipo-select ${
                              b.tipo === 'Campo' ? 'modal-roster-tipo-campo' : 'modal-roster-tipo-franco'
                            }`}
                            value={b.tipo}
                            onChange={(e) => handleActualizarBloque(b.id_temp, 'tipo', e.target.value)}
                            disabled={!b.incluido || creandoRoster}
                          >
                            <option value="Campo">🏕️ Campo</option>
                            <option value="Franco">🏠 Franco</option>
                          </select>
                        </td>
                        <td>
                          <select
                            className="modal-roster-select"
                            style={{ height: '34px', fontSize: '12px', minWidth: '240px' }}
                            value={b.proyecto}
                            onChange={(e) => handleActualizarBloque(b.id_temp, 'proyecto', e.target.value)}
                            disabled={!b.incluido || creandoRoster}
                          >
                            <option value="">Seleccione proyecto...</option>
                            {serviciosDisponibles.map((srv) => (
                              <option key={srv} value={srv}>
                                {srv}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="date"
                            className="modal-roster-date-input"
                            value={b.fecha_inicio}
                            onChange={(e) => handleActualizarBloque(b.id_temp, 'fecha_inicio', e.target.value)}
                            disabled={!b.incluido || creandoRoster}
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className="modal-roster-date-input"
                            value={b.fecha_fin}
                            onChange={(e) => handleActualizarBloque(b.id_temp, 'fecha_fin', e.target.value)}
                            disabled={!b.incluido || creandoRoster}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="modal-roster-dias-badge">
                            {b.dias}d
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Pie del Modal con Botones y Resumen */}
        <div className="modal-roster-footer">
          <div className="modal-roster-footer-info">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>
              {bloquesSeleccionados.length > 0
                ? `Se consolidarán ${totalDiasConsolidar} jornada(s) en ${bloquesSeleccionados.length} bloque(s) continuos`
                : 'Selecciona al menos un bloque con proyecto asignado para confirmar'}
            </span>
          </div>

          <div className="modal-roster-footer-actions">
            <button
              type="button"
              className="modal-btn-cancel"
              onClick={onClose}
              disabled={creandoRoster}
              style={{ height: '42px', padding: '0 18px', fontSize: '13px' }}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="modal-roster-confirm-btn"
              disabled={creandoRoster || bloquesSeleccionados.length === 0}
              onClick={() => onConfirmarCreacion(bloquesSeleccionados)}
            >
              {creandoRoster ? (
                <>
                  <div className="spinner" style={{ width: '15px', height: '15px', borderWidth: '2px', borderColor: '#ffffff', borderTopColor: 'transparent' }} />
                  <span>Consolidando en Roster...</span>
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Confirmar y Crear {bloquesSeleccionados.length} Turno(s)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
