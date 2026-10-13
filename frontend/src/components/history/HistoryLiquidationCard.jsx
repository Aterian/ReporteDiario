// [FN-02.03] Tarjeta calculadora de liquidación de haberes y exportación oficial
import React from 'react';
import { NOMBRES_MESES, formatMoneda } from './historyConstants';

export default function HistoryLiquidationCard({
  isRpg,
  empleadoAuditar,
  fechaCalendario,
  hayModoManual,
  totalDiasComputados,
  conteosLiquidacion,
  diasOficinaManual,
  setDiasOficinaManual,
  diasCampoManual,
  setDiasCampoManual,
  diasFrancoObraManual,
  setDiasFrancoObraManual,
  diasFrancoOficManual,
  setDiasFrancoOficManual,
  diasFeriadoManual,
  setDiasFeriadoManual,
  exportandoInforme,
  handleDescargarInformeLiquidacion,
  tarifas,
  handleTarifaChange,
  cantDiasOficina,
  subtotalOficina,
  cantDiasObra,
  subtotalObra,
  cantDiasFrancoObra,
  subtotalFrancoObra,
  cantDiasFrancoOfic,
  subtotalFrancoOfic,
  cantDiasFeriadoTrabajado,
  subtotalFeriado,
  totalLiquidar,
  diasSeleccionadosCalendario,
  seleccionados
}) {
  return (
    <div className={`liquidation-card ${isRpg ? 'rpg-liquidation-card' : ''}`}>
      <div className="liquidation-card-header">
        <div className="liquidation-card-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          <span>
            {isRpg
              ? `💰 Reparto de Botín y Recompensas • ${empleadoAuditar || 'Aventurero'}`
              : `Calculadora de Liquidación • ${empleadoAuditar || 'Empleado'}`} ({NOMBRES_MESES[fechaCalendario.getMonth()]} {fechaCalendario.getFullYear()})
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '12px', background: !hayModoManual ? '#dcfce7' : '#fef3c7', color: !hayModoManual ? '#15803d' : '#b45309', fontWeight: 600 }}>
            {!hayModoManual
              ? `⚡ Cálculo automático (${totalDiasComputados} d)`
              : '✏️ Modo manual / excepciones'}
          </span>
          {hayModoManual && (
            <button
              type="button"
              className="btn-action-ghost"
              style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--color-primary, #cc3333)' }}
              onClick={() => {
                setDiasOficinaManual('');
                setDiasCampoManual('');
                setDiasFrancoObraManual('');
                setDiasFrancoOficManual('');
                setDiasFeriadoManual('');
              }}
              title="Restablecer todos los campos al cálculo automático oficial"
            >
              ↺ Restablecer a cálculo auto
            </button>
          )}
          <button
            type="button"
            className="btn-action-primary"
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: '#16a34a',
              borderColor: '#16a34a',
              color: '#ffffff',
              fontWeight: 600,
              borderRadius: '6px'
            }}
            disabled={exportandoInforme}
            onClick={handleDescargarInformeLiquidacion}
            title="Descargar informe oficial en Excel con detalle de días, costos y proyectos auditados"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exportandoInforme ? 'Generando Excel...' : 'Descargar Informe'}
          </button>
        </div>
      </div>

      <div className="liquidation-grid">
        {/* Tarjeta 1: Día de oficina */}
        <div className="liquidation-item">
          <div className="liq-item-top">
            <span className="liq-label">Día de oficina</span>
            <span className="liq-count-badge" title="Incluye oficina y francos asignados a áreas internas">{conteosLiquidacion.diasOficina} detectado(s)</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              Cant. días:
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              className="form-input form-input-sm"
              style={{ width: '65px', height: '28px', padding: '2px 6px', fontWeight: 700 }}
              value={diasOficinaManual !== '' ? diasOficinaManual : conteosLiquidacion.diasOficina}
              onChange={(e) => setDiasOficinaManual(e.target.value)}
              title="Cantidad de días de oficina (editable con incrementos de 0.5)"
            />
            {diasOficinaManual !== '' && (
              <button
                type="button"
                className="btn-action-ghost"
                style={{ padding: '2px 5px', fontSize: '10px' }}
                onClick={() => setDiasOficinaManual('')}
                title="Restablecer al conteo automático del calendario"
              >
                ↺ Auto
              </button>
            )}
          </div>

          <div className="liq-input-row">
            <span className="liq-currency-symbol">$</span>
            <input
              type="number"
              min="0"
              step="100"
              placeholder="Precio día"
              className="form-input form-input-sm liq-input"
              value={tarifas.precioOficina || ''}
              onChange={(e) => handleTarifaChange('precioOficina', e.target.value)}
            />
          </div>
          <div className="liq-subtotal-row">
            <span>Subtotal ({cantDiasOficina} d):</span>
            <strong>{formatMoneda(subtotalOficina)}</strong>
          </div>
        </div>

        {/* Tarjeta 2: Día de obra */}
        <div className="liquidation-item">
          <div className="liq-item-top">
            <span className="liq-label">Día de obra</span>
            <span className="liq-count-badge" title="Incluye campo/obra y francos de obra">{conteosLiquidacion.diasObra} detectado(s)</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              Cant. días:
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              className="form-input form-input-sm"
              style={{ width: '65px', height: '28px', padding: '2px 6px', fontWeight: 700 }}
              value={diasCampoManual !== '' ? diasCampoManual : conteosLiquidacion.diasObra}
              onChange={(e) => setDiasCampoManual(e.target.value)}
              title="Cantidad de días de obra (editable con incrementos de 0.5)"
            />
            {diasCampoManual !== '' && (
              <button
                type="button"
                className="btn-action-ghost"
                style={{ padding: '2px 5px', fontSize: '10px' }}
                onClick={() => setDiasCampoManual('')}
                title="Restablecer al conteo automático del calendario"
              >
                ↺ Auto
              </button>
            )}
          </div>

          <div className="liq-input-row">
            <span className="liq-currency-symbol">$</span>
            <input
              type="number"
              min="0"
              step="100"
              placeholder="Precio día obra"
              className="form-input form-input-sm liq-input"
              value={tarifas.precioObra || ''}
              onChange={(e) => handleTarifaChange('precioObra', e.target.value)}
            />
          </div>
          <div className="liq-subtotal-row">
            <span>Subtotal ({cantDiasObra} d):</span>
            <strong>{formatMoneda(subtotalObra)}</strong>
          </div>
        </div>

        {/* Tarjeta 3: Franco de Obra Trabajado */}
        <div className="liquidation-item">
          <div className="liq-item-top">
            <span className="liq-label">Franco de obra trab.</span>
            <span className="liq-count-badge" title="Franco de obra trabajado (150% día obra)">{conteosLiquidacion.diasFrancoObraTrabajado} detectado(s)</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              Cant. días:
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              className="form-input form-input-sm"
              style={{ width: '65px', height: '28px', padding: '2px 6px', fontWeight: 700 }}
              value={diasFrancoObraManual !== '' ? diasFrancoObraManual : conteosLiquidacion.diasFrancoObraTrabajado}
              onChange={(e) => setDiasFrancoObraManual(e.target.value)}
              title="Cantidad de francos de obra trabajados (editable con incrementos de 0.5)"
            />
            {diasFrancoObraManual !== '' && (
              <button
                type="button"
                className="btn-action-ghost"
                style={{ padding: '2px 5px', fontSize: '10px' }}
                onClick={() => setDiasFrancoObraManual('')}
                title="Restablecer al conteo automático del calendario"
              >
                ↺ Auto
              </button>
            )}
          </div>

          <div className="liq-input-row">
            <span className="liq-currency-symbol">$</span>
            <input
              type="number"
              min="0"
              step="100"
              placeholder="Precio franco obra"
              className="form-input form-input-sm liq-input"
              value={tarifas.precioFrancoObraTrabajado || ''}
              onChange={(e) => handleTarifaChange('precioFrancoObraTrabajado', e.target.value)}
            />
          </div>
          <div className="liq-subtotal-row">
            <span>Subtotal ({cantDiasFrancoObra} d):</span>
            <strong>{formatMoneda(subtotalFrancoObra)}</strong>
          </div>
        </div>

        {/* Tarjeta 4: Franco de Oficina Trabajado */}
        <div className="liquidation-item">
          <div className="liq-item-top">
            <span className="liq-label">Franco de ofic. trab.</span>
            <span className="liq-count-badge" title="Franco de oficina trabajado (150% día oficina)">{conteosLiquidacion.diasFrancoOficTrabajado} detectado(s)</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              Cant. días:
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              className="form-input form-input-sm"
              style={{ width: '65px', height: '28px', padding: '2px 6px', fontWeight: 700 }}
              value={diasFrancoOficManual !== '' ? diasFrancoOficManual : conteosLiquidacion.diasFrancoOficTrabajado}
              onChange={(e) => setDiasFrancoOficManual(e.target.value)}
              title="Cantidad de francos de oficina trabajados (editable con incrementos de 0.5)"
            />
            {diasFrancoOficManual !== '' && (
              <button
                type="button"
                className="btn-action-ghost"
                style={{ padding: '2px 5px', fontSize: '10px' }}
                onClick={() => setDiasFrancoOficManual('')}
                title="Restablecer al conteo automático del calendario"
              >
                ↺ Auto
              </button>
            )}
          </div>

          <div className="liq-input-row">
            <span className="liq-currency-symbol">$</span>
            <input
              type="number"
              min="0"
              step="100"
              placeholder="Precio franco ofic."
              className="form-input form-input-sm liq-input"
              value={tarifas.precioFrancoOficTrabajado || ''}
              onChange={(e) => handleTarifaChange('precioFrancoOficTrabajado', e.target.value)}
            />
          </div>
          <div className="liq-subtotal-row">
            <span>Subtotal ({cantDiasFrancoOfic} d):</span>
            <strong>{formatMoneda(subtotalFrancoOfic)}</strong>
          </div>
        </div>

        {/* Tarjeta 5: Feriado trabajado */}
        <div className="liquidation-item">
          <div className="liq-item-top">
            <span className="liq-label">Feriado trabajado</span>
            <span className="liq-count-badge">{conteosLiquidacion.diasFeriadoTrabajado} detectado(s)</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              Cant. días:
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              className="form-input form-input-sm"
              style={{ width: '65px', height: '28px', padding: '2px 6px', fontWeight: 700 }}
              value={diasFeriadoManual !== '' ? diasFeriadoManual : conteosLiquidacion.diasFeriadoTrabajado}
              onChange={(e) => setDiasFeriadoManual(e.target.value)}
              title="Cantidad de feriados trabajados (editable con incrementos de 0.5)"
            />
            {diasFeriadoManual !== '' && (
              <button
                type="button"
                className="btn-action-ghost"
                style={{ padding: '2px 5px', fontSize: '10px' }}
                onClick={() => setDiasFeriadoManual('')}
                title="Restablecer al conteo automático del calendario"
              >
                ↺ Auto
              </button>
            )}
          </div>

          <div className="liq-input-row">
            <span className="liq-currency-symbol">$</span>
            <input
              type="number"
              min="0"
              step="100"
              placeholder="Precio feriado trab."
              className="form-input form-input-sm liq-input"
              value={tarifas.precioFeriadoTrabajado || ''}
              onChange={(e) => handleTarifaChange('precioFeriadoTrabajado', e.target.value)}
            />
          </div>
          <div className="liq-subtotal-row">
            <span>Subtotal ({cantDiasFeriadoTrabajado} d):</span>
            <strong>{formatMoneda(subtotalFeriado)}</strong>
          </div>
        </div>
      </div>

      {/* Total Liquidación Banner */}
      <div className="liquidation-total-banner">
        <div className="liq-total-info">
          <span className="liq-total-subtitle">Liquidación total correspondiente a {empleadoAuditar || 'empleado'}:</span>
          <span className="liq-total-period">
            {NOMBRES_MESES[fechaCalendario.getMonth()]} {fechaCalendario.getFullYear()}
            {diasSeleccionadosCalendario && diasSeleccionadosCalendario.size > 0 && ` (${diasSeleccionadosCalendario.size} días seleccionados en calendario)`}
            {seleccionados && seleccionados.size > 0 && ` (${seleccionados.size} registros seleccionados)`}
          </span>
          <span style={{ fontSize: '11px', color: !hayModoManual ? '#16a34a' : 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
            {!hayModoManual
              ? '✓ Calculado automáticamente (1 registro por día para el mismo tipo; computa ambos si combina oficina y campo).'
              : 'Recálculo manual aplicado según días y tarifas configuradas.'}
          </span>
        </div>
        <div className="liq-total-amount-box">
          <span className="liq-total-amount-label">{isRpg ? 'TESORO TOTAL A LIQUIDAR' : 'TOTAL A LIQUIDAR'}</span>
          <span className="liq-total-amount-value">{formatMoneda(totalLiquidar)}</span>
        </div>
      </div>
    </div>
  );
}
