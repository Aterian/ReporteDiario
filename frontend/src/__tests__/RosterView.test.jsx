// [FN-00.03] Frontend Suite: Pruebas de Renderizado RBAC y Tarifas Locales en RosterView
import React, { act } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RosterView from '../components/RosterView';
import { api } from '../services/apiBridge';

// Mock de apiBridge para RosterView
vi.mock('../services/apiBridge', () => ({
  api: {
    obtenerServicios: vi.fn(),
    obtenerTodosUsuarios: vi.fn(),
    obtenerTarifasRoster: vi.fn(),
    obtenerRosters: vi.fn(),
    guardarRoster: vi.fn(),
    aplicarTarifaLocalRoster: vi.fn(),
    eliminarRoster: vi.fn(),
    purgarRostersLocales: vi.fn(),
    exportarRosterExcel: vi.fn(),
    maximizarVentana: vi.fn(),
    restaurarVentana: vi.fn(),
  }
}));

describe('RosterView - Suite de Integridad y Lógica de Roster', () => {
  const usuarioAdmin = {
    nombre: 'Iván Valentin',
    email: 'ivangvalentin97@gmail.com',
    dni: '40158951',
    area: 'A',
    rol_app: 'admin'
  };

  const usuarioSubAdmin = {
    nombre: 'Justina Bertolozzi',
    email: 'rrhh@ingeap.com',
    dni: '45411162',
    area: 'RRHH',
    rol_app: 'sub_admin'
  };

  const usuarioNoAutorizado = {
    nombre: 'Técnico Campo',
    email: 'campo@ingeap.com',
    dni: '33357062',
    area: 'N',
    rol_app: 'user_1'
  };

  const mockServicios = ['Gasoducto Norte', 'Lote 3 Minería'];

  const mockEmpleados = [
    { nombre: 'Gabriel Juarez', dni: '33357062', area: 'I' },
    { nombre: 'Maximiliano Kromm', dni: '35223765', area: 'I' },
    { nombre: 'Fernando Aimar', dni: '30866202', area: 'I' }
  ];

  const mockTarifas = [
    {
      id_proyecto: 'proy-gas',
      proyecto: 'Gasoducto Norte',
      dia_normal: 75000,
      domingo: 110000,
      subida: 45000,
      bajada: 45000
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    api.obtenerServicios.mockResolvedValue(mockServicios);
    api.obtenerTodosUsuarios.mockResolvedValue(mockEmpleados);
    api.obtenerTarifasRoster.mockResolvedValue(mockTarifas);
    api.obtenerRosters.mockResolvedValue([]);
    api.aplicarTarifaLocalRoster.mockResolvedValue({
      exito: true,
      precio_dia: 75000,
      precio_domingo: 110000,
      mensaje: 'Tarifa local asignada con éxito'
    });
  });

  it('1. Renderizado seguro: RosterView renderiza para admin y sub_admin sin errores de referencias nulas', async () => {
    // Renderizado como Admin
    const { unmount } = render(
      <RosterView usuario={usuarioAdmin} onVolver={vi.fn()} tema="light" />
    );

    expect(screen.getByText(/Gestión y Carga de Rosters/i)).toBeInTheDocument();
    expect(screen.queryByText(/Acceso denegado/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(api.obtenerServicios).toHaveBeenCalled();
      expect(api.obtenerTarifasRoster).toHaveBeenCalled();
    });

    unmount();

    // Renderizado como SubAdmin
    render(
      <RosterView usuario={usuarioSubAdmin} onVolver={vi.fn()} tema="light" />
    );
    expect(screen.getByText(/Gestión y Carga de Rosters/i)).toBeInTheDocument();
    expect(screen.queryByText(/Acceso denegado/i)).not.toBeInTheDocument();
  });

  it('1.1. Seguridad RBAC: Deniega acceso a usuarios no autorizados (user_1 / user_2)', () => {
    render(
      <RosterView usuario={usuarioNoAutorizado} onVolver={vi.fn()} tema="light" />
    );

    expect(screen.getByText(/Acceso denegado/i)).toBeInTheDocument();
    expect(screen.queryByText(/Gestión y Carga de Rosters/i)).not.toBeInTheDocument();
  });

  it('2. Cálculo y visualización de tarifas locales: asigna tarifa en $0,00 sin duplicar el turno', async () => {
    // Generar fechas en el mes activo del Gantt
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const fInicio = `${y}-${m}-01`;
    const fFin = `${y}-${m}-28`;

    // Simular turno cargado desde otra PC con tarifa local en $0,00
    const turnosEnOtraPC = [
      {
        id: 'turno-remoto-001',
        empleado: 'Gabriel Juarez',
        proyecto: 'Gasoducto Norte',
        fecha_inicio: fInicio,
        fecha_fin: fFin,
        tipo: 'Campo',
        precio_dia: 0,
        precio_domingo: 0
      }
    ];

    api.obtenerRosters.mockResolvedValue(turnosEnOtraPC);

    render(
      <RosterView usuario={usuarioAdmin} onVolver={vi.fn()} tema="light" />
    );

    // Esperar a que el turno se pinte en el Gantt
    const celdasTurno = await screen.findAllByTestId('gantt-bar-cell');
    expect(celdasTurno.length).toBeGreaterThan(0);

    const cantidadCeldasInicial = celdasTurno.length;

    // Simular apertura del modal de edición haciendo clic en la celda
    await act(async () => {
      fireEvent.click(celdasTurno[0]);
    });

    // Verificar que el modal de edición se abrió
    expect(screen.getByText(/Modificar Turno/i)).toBeInTheDocument();

    // Localizar el botón de Visualizar / Asignar Tarifa
    const botonTarifa = screen.getByRole('button', { name: /visualizar tarifa|asignar tarifas/i });
    expect(botonTarifa).toBeInTheDocument();

    // Verificar que antes de asignar tarifa el turno tiene $0
    expect(screen.getByText(/Normal: \$0/i)).toBeInTheDocument();

    // Simular clic en "Visualizar Tarifa" / "Asignar tarifas oficiales al turno"
    await act(async () => {
      fireEvent.click(botonTarifa);
    });

    // Verificar que se invocó aplicar_tarifa_local_roster con el ID del turno y las tarifas
    await waitFor(() => {
      expect(api.aplicarTarifaLocalRoster).toHaveBeenCalledTimes(1);
      expect(api.aplicarTarifaLocalRoster).toHaveBeenCalledWith(
        expect.objectContaining({
          id_roster: 'turno-remoto-001',
          empleado: 'Gabriel Juarez',
          proyecto: 'Gasoducto Norte',
          precio_dia: 75000,
          precio_domingo: 110000
        })
      );
    });

    // Verificar que el monto actualizado se visualiza en pantalla (en el modal y en el feedback)
    await waitFor(() => {
      const elementosNormal = screen.getAllByText(/Normal:\s*\$75/i);
      expect(elementosNormal.length).toBeGreaterThanOrEqual(1);

      const elementosDom = screen.getAllByText(/Dom:\s*\$110/i);
      expect(elementosDom.length).toBeGreaterThanOrEqual(1);
    });

    // Verificar que NO se duplicó el turno en el Gantt
    const celdasFinales = screen.getAllByTestId('gantt-bar-cell');
    expect(celdasFinales.length).toBe(cantidadCeldasInicial);
  });
});
