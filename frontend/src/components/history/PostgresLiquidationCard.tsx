// [FN-07.06] Liquidación mensual canónica y adicionales
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/apiBridge';
import type { RespuestaLiquidacion } from '../../types/postgres';

interface Props {
  empleadoAuditar: string;
  fechaCalendario: Date;
}

const moneda = (valor: string | null) => valor === null ? '—' : new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2
}).format(Number(valor));

export default function PostgresLiquidationCard({ empleadoAuditar, fechaCalendario }: Props) {
  const ciclo = `${fechaCalendario.getFullYear()}-${String(fechaCalendario.getMonth() + 1).padStart(2, '0')}`;
  const [exportando, setExportando] = useState(false);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['liquidacion', empleadoAuditar, ciclo],
    enabled: Boolean(empleadoAuditar),
    queryFn: async () => {
      const respuesta = await api.obtenerLiquidacion(empleadoAuditar, ciclo) as RespuestaLiquidacion;
      if (!respuesta.exito) throw new Error(respuesta.error || 'No se pudo consultar la liquidación.');
      return respuesta.liquidacion ?? null;
    }
  });

  const exportar = async () => {
    setExportando(true);
    try {
      await api.exportarInformeLiquidacion({ empleado: empleadoAuditar, ciclo_cobro: ciclo });
    } finally {
      setExportando(false);
    }
  };

  return (
    <section className="liquidation-card pg-liquidation" aria-label="Liquidación mensual">
      <div className="pg-liquidation-heading">
        <div><h3>Liquidación mensual</h3><p>{empleadoAuditar || 'Seleccione un colaborador'} · {ciclo}</p></div>
        <button type="button" className="btn-refresh" onClick={() => void refetch()} disabled={!empleadoAuditar || isPending}>Actualizar liquidación</button>
      </div>
      {isPending && empleadoAuditar && <p role="status">Consultando liquidación…</p>}
      {error && <p role="alert" className="alert-error">{error.message}</p>}
      {!isPending && !error && !data && <p>No hay liquidación registrada para este ciclo.</p>}
      {data && !error && <>
        <p>{data.cant_dias_ofi} días de oficina · {data.cant_dias_obra} días de obra · {data.cerrado ? 'Ciclo cerrado' : 'Ciclo abierto'}</p>
        <dl className="pg-liquidation-totals">
          <div><dt>Subtotal estimado</dt><dd>{moneda(data.subtotal_estimado)}</dd></div>
          <div><dt>Total real</dt><dd>{moneda(data.total_real)}</dd></div>
          <div><dt>Total adicionales</dt><dd>{moneda(data.total_adicionales)}</dd></div>
          <div className="pg-salary-total"><dt>Sueldo total</dt><dd>{moneda(data.sueldo_total)}</dd></div>
        </dl>
        <h4>Adicionales</h4>
        {data.adicionales.length ? <div className="pg-table-scroll"><table>
          <thead><tr><th scope="col">Fecha</th><th scope="col">Descripción</th><th scope="col">Importe</th></tr></thead>
          <tbody>{data.adicionales.map(a => <tr key={a.id_adicional}><td>{a.fecha}</td><td>{a.descripcion}</td><td>{moneda(a.cantidad_adicional)}</td></tr>)}</tbody>
        </table></div> : <p>Sin adicionales registrados.</p>}
        <button type="button" className="btn-refresh" onClick={() => void exportar()} disabled={exportando}>{exportando ? 'Exportando…' : 'Descargar liquidación'}</button>
      </>}
    </section>
  );
}
