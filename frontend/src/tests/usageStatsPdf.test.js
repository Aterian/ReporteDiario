// [MOD-11] [FN-11.05] Pruebas unitarias de agregación y generación de informe PDF de estadísticas de uso
import { describe, it, expect } from 'vitest';
import { construirDatosInformePdf, generarRangoFechasIso } from '../utils/usageReportStats';
import { generarInformeUsoPdf } from '../utils/usageStatsPdf';

const datosBase = {
  resumen_general: {
    fecha_inicio_medicion: '2026-10-01',
    fecha_corte_medicion: '2026-10-05',
    dias_corridos_calendario: 5,
    usuarios_activos_totales: 3,
    usuarios_con_registros: 3,
    porcentaje_adopcion_plantilla: 100,
    dias_calendario_esperados_empresa: 15,
    dias_unicos_cubiertos_empresa: 9,
    registros_de_franco_cargados: 2,
    total_registros_asistencia: 10,
    porcentaje_uso_sobre_dias_corridos: 60.0
  },
  detalle_empleados: [
    {
      id_usuario: 'u1',
      empleado: 'Ana Ingeniería',
      area: 'I',
      rol_app: 'user_1',
      dias_cargados: 5,
      dias_activos: 4,
      dias_franco: 1,
      dias_faltantes: 0,
      dias_corridos_esperados: 5,
      total_registros: 6,
      porcentaje_cumplimiento: 100.0,
      ultima_fecha: '2026-10-05',
      fechas_cubiertas: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']
    },
    {
      id_usuario: 'u2',
      empleado: 'Luis Ingeniería',
      area: 'I',
      rol_app: 'user_1',
      dias_cargados: 3,
      dias_activos: 2,
      dias_franco: 1,
      dias_faltantes: 2,
      dias_corridos_esperados: 5,
      total_registros: 3,
      porcentaje_cumplimiento: 60.0,
      ultima_fecha: '2026-10-03',
      fechas_cubiertas: ['2026-10-01', '2026-10-02', '2026-10-03']
    },
    {
      id_usuario: 'u3',
      empleado: 'Sofía Mensura',
      area: 'M',
      rol_app: 'user_2',
      dias_cargados: 1,
      dias_activos: 1,
      dias_franco: 0,
      dias_faltantes: 4,
      dias_corridos_esperados: 5,
      total_registros: 1,
      porcentaje_cumplimiento: 20.0,
      ultima_fecha: '2026-10-01',
      fechas_cubiertas: ['2026-10-01']
    }
  ],
  serie_diaria: [
    { fecha: '2026-10-01', usuarios_cubiertos: 3, usuarios_esperados: 3, porcentaje_diario: 100, dias_acumulados_cubiertos: 3, dias_acumulados_esperados: 3, porcentaje_acumulado: 100 },
    { fecha: '2026-10-02', usuarios_cubiertos: 2, usuarios_esperados: 3, porcentaje_diario: 66.67, dias_acumulados_cubiertos: 5, dias_acumulados_esperados: 6, porcentaje_acumulado: 83.33 },
    { fecha: '2026-10-03', usuarios_cubiertos: 2, usuarios_esperados: 3, porcentaje_diario: 66.67, dias_acumulados_cubiertos: 7, dias_acumulados_esperados: 9, porcentaje_acumulado: 77.78 },
    { fecha: '2026-10-04', usuarios_cubiertos: 1, usuarios_esperados: 3, porcentaje_diario: 33.33, dias_acumulados_cubiertos: 8, dias_acumulados_esperados: 12, porcentaje_acumulado: 66.67 },
    { fecha: '2026-10-05', usuarios_cubiertos: 1, usuarios_esperados: 3, porcentaje_diario: 33.33, dias_acumulados_cubiertos: 9, dias_acumulados_esperados: 15, porcentaje_acumulado: 60.0 }
  ]
};

describe('Informes PDF de Estadísticas de Uso ([FN-11.05])', () => {
  it('genera rangos de fechas corridos sin deriva de zona horaria', () => {
    expect(generarRangoFechasIso('2026-10-01', '2026-10-05')).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05'
    ]);
  });

  it('construye métricas consolidadas para alcance general y resumen por área', () => {
    const inf = construirDatosInformePdf({ datos: datosBase, alcance: 'general' });
    expect(inf.tituloAlcance).toBe('Total General Empresa');
    expect(inf.resumenAreas.length).toBe(2);
    expect(inf.resumenAreas[0].area).toBe('I');
    expect(inf.resumenAreas[0].pctUso).toBe(80.0);
    expect(inf.resumenAreas[1].area).toBe('M');
    expect(inf.resumenAreas[1].pctUso).toBe(20.0);
    expect(inf.empleadosTabla).toHaveLength(3);
  });

  it('calcula métricas y comparativa vs empresa para alcance por Área', () => {
    const inf = construirDatosInformePdf({
      datos: datosBase,
      alcance: 'area',
      areaSeleccionada: 'I',
      modoGrafico: 'acumulado'
    });
    expect(inf.tituloAlcance).toBe('Área I');
    expect(inf.totalesTabla.totalColab).toBe(2);
    expect(inf.totalesTabla.diasCargados).toBe(8);
    expect(inf.totalesTabla.pctUso).toBe(80.0);
    expect(inf.kpis[0].valor).toBe('80.00%');
    expect(inf.kpis[2].valor).toBe('+20.00 pp');
    expect(inf.evolucion.mostrarReferenciaGlobal).toBe(true);
  });

  it('detecta desglose mensual y días exactos sin registrar para alcance por Persona', () => {
    const inf = construirDatosInformePdf({
      datos: datosBase,
      alcance: 'persona',
      empleadoId: 'u2',
      modoGrafico: 'semanal'
    });
    expect(inf.personaDetalle.empleado.empleado).toBe('Luis Ingeniería');
    expect(inf.personaDetalle.desgloseMensual).toEqual([
      { mes: '2026-10', label: 'Octubre 2026', esperados: 5, cubiertos: 3, faltantes: 2, porcentaje: 60 }
    ]);
    expect(inf.personaDetalle.fechasFaltantes.map((f) => f.iso)).toEqual(['2026-10-04', '2026-10-05']);
  });

  it('selecciona estrictamente al colaborador elegido sin hacer fallback al índice 0 y rechaza IDs inexistentes', () => {
    const infTercero = construirDatosInformePdf({
      datos: datosBase,
      alcance: 'persona',
      empleadoId: 'u3',
      modoGrafico: 'acumulado'
    });
    expect(infTercero.tituloAlcance).toBe('Sofía Mensura (Área M)');
    expect(infTercero.personaDetalle.empleado.id_usuario).toBe('u3');
    expect(infTercero.personaDetalle.empleado.empleado).toBe('Sofía Mensura');
    expect(infTercero.empleadosTabla.map((e) => e.id_usuario)).toEqual(['u3']);
    expect(infTercero.kpis[0].valor).toBe('20.0%');
    expect(infTercero.personaDetalle.fechasFaltantes.map((f) => f.iso)).toEqual([
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05'
    ]);

    expect(() =>
      construirDatosInformePdf({
        datos: datosBase,
        alcance: 'persona',
        empleadoId: 'u-inexistente',
        modoGrafico: 'acumulado'
      })
    ).toThrow(/colaborador seleccionado/i);
  });

  it('genera documentos PDF binarios válidos (%PDF-) para General, Área y Persona', async () => {
    for (const cfg of [
      { alcance: 'general' },
      { alcance: 'area', areaSeleccionada: 'I' },
      { alcance: 'persona', empleadoId: 'u2', modoGrafico: 'semanal' }
    ]) {
      const informe = construirDatosInformePdf({ datos: datosBase, ...cfg });
      const res = await generarInformeUsoPdf({
        informe,
        opciones: { incluirGrafico: true, incluirDetalle: true },
        usuarioEmisor: { nombre: 'Iván Valentin' },
        logoUrl: null
      });
      expect(res.nombreArchivo.endsWith('.pdf')).toBe(true);
      expect(res.blob.type).toBe('application/pdf');
      expect(atob(res.base64).startsWith('%PDF-')).toBe(true);
    }
  });
});
