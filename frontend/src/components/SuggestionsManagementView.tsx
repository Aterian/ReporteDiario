// [FN-06.10] Bandeja de gestión de sugerencias
import { useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/apiBridge';
import {
  actualizarSugerenciaEnBandeja,
  ErrorSugerencias,
  ESTADOS_SUGERENCIA,
  obtenerDatosSugerencias,
  PRIORIDADES_SUGERENCIA,
  SUGGESTIONS_QUERY_KEY,
} from '../types/suggestions';
import type {
  BandejaSugerencias,
  ContadoresSugerencias,
  EstadoSugerencia,
  FiltrosSugerencias,
  PrioridadSugerencia,
  Sugerencia,
  SugerenciaUpdate,
} from '../types/suggestions';

interface Props {
  onVolver: () => void;
  sessionKey: string;
}

interface EditorProps {
  sugerencia: Sugerencia;
  pendiente: boolean;
  error: Error | null;
  onCerrar: () => void;
  onGuardar: (datos: SugerenciaUpdate) => void;
}

const FILTROS_INICIALES: FiltrosSugerencias = {
  busqueda: '',
  estado_revision: null,
  nivel_urgencia: null,
  pagina: 1,
  limite: 20,
};

const CONTADORES: ReadonlyArray<readonly [keyof ContadoresSugerencias, string]> = [
  ['nuevas', 'Nuevas sin ver'],
  ['urgentes_abiertas', 'Urgentes abiertas'],
  ['para_aplicar', 'Para aplicar'],
  ['resueltas', 'Resueltas'],
];

const formatoFecha = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Argentina/Buenos_Aires',
});

function nombreVisible(sugerencia: Sugerencia) {
  return sugerencia.nombre === 'Anonimo' ? 'Anónimo' : sugerencia.nombre;
}

function EditorSugerencia({ sugerencia, pendiente, error, onCerrar, onGuardar }: EditorProps) {
  const [estado, setEstado] = useState(sugerencia.estado_revision);
  const [prioridad, setPrioridad] = useState(sugerencia.nivel_urgencia);
  const [respuesta, setRespuesta] = useState(sugerencia.respuesta ?? '');
  const dialogo = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const elemento = dialogo.current;
    elemento?.showModal();
    return () => elemento?.close();
  }, []);

  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    onGuardar({
      id_participacion: sugerencia.id_participacion,
      estado_revision: estado,
      nivel_urgencia: prioridad,
      respuesta: respuesta === (sugerencia.respuesta ?? '') ? sugerencia.respuesta : respuesta,
      original: {
        estado_revision: sugerencia.estado_revision,
        nivel_urgencia: sugerencia.nivel_urgencia,
        respuesta: sugerencia.respuesta,
      },
    });
  }

  return (
    <dialog className="sug-dialog" aria-labelledby="sug-detalle" ref={dialogo} onCancel={evento => {
      evento.preventDefault();
      if (!pendiente) onCerrar();
    }}>
      <form className="sug-form" onSubmit={guardar}>
        <header className="sug-card-heading">
          <p className="sug-eyebrow">{sugerencia.tipo_sugerencia}</p>
          <h2 id="sug-detalle">Detalle de la sugerencia</h2>
        </header>
        <div className="sug-detail">
          <p className="sug-detail-text">{sugerencia.descripcion_sugerencia}</p>
          <p className="sug-muted">
            {nombreVisible(sugerencia)} · {formatoFecha.format(new Date(sugerencia.fecha_hora_registro))}
          </p>
        </div>
        <fieldset className="sug-fields sug-edit-fields" disabled={pendiente}>
          <label className="sug-field">
            <span>Estado</span>
            <select value={estado} autoFocus onChange={evento => setEstado(evento.target.value as EstadoSugerencia)}>
              {Object.entries(ESTADOS_SUGERENCIA).map(([valor, etiqueta]) =>
                <option key={valor} value={valor}>{etiqueta}</option>,
              )}
            </select>
          </label>
          <label className="sug-field">
            <span>Prioridad</span>
            <select value={prioridad} onChange={evento => setPrioridad(evento.target.value as PrioridadSugerencia)}>
              {Object.entries(PRIORIDADES_SUGERENCIA).map(([valor, etiqueta]) =>
                <option key={valor} value={valor}>{etiqueta}</option>,
              )}
            </select>
          </label>
          <label className="sug-field sug-wide">
            <span>Respuesta o acción tomada</span>
            <textarea value={respuesta} placeholder="Registrá la respuesta o la acción tomada."
              onChange={evento => setRespuesta(evento.target.value)} />
          </label>
        </fieldset>
        {sugerencia.fecha_hora_resolucion && (
          <p className="sug-resolution">
            <strong>Fecha de resolución</strong> {formatoFecha.format(new Date(sugerencia.fecha_hora_resolucion))}
          </p>
        )}
        {error && <p className="sug-error" role="alert">{error.message}</p>}
        <footer className="sug-card-footer sug-actions">
          <button className="sug-button" type="button" onClick={onCerrar} disabled={pendiente}>Cancelar</button>
          <button className="sug-button sug-button-primary" type="submit" disabled={pendiente}>
            {pendiente ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

export default function SuggestionsManagementView({ onVolver, sessionKey }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [seleccionada, setSeleccionada] = useState<Sugerencia | null>(null);
  const [aviso, setAviso] = useState<{ mensaje: string; error: boolean } | null>(null);
  const guardando = useRef(false);
  const cliente = useQueryClient();
  const claveSesion = [...SUGGESTIONS_QUERY_KEY, sessionKey] as const;
  const clave = [...claveSesion, filtros] as const;
  const bandeja = useQuery({
    queryKey: clave,
    queryFn: async () => obtenerDatosSugerencias(
      await api.obtenerSugerencias(filtros),
      'No se pudo consultar la bandeja de sugerencias.',
    ),
    retry: false,
  });
  const cambio = useMutation({
    mutationFn: async (datos: SugerenciaUpdate) => obtenerDatosSugerencias(
      await api.actualizarSugerencia(datos),
      'No se pudo guardar la sugerencia.',
    ),
    retry: false,
    gcTime: 0,
    onMutate: async ({ id_participacion, estado_revision, nivel_urgencia, respuesta }) => {
      await cliente.cancelQueries({ queryKey: clave, exact: true });
      const anterior = cliente.getQueryData<BandejaSugerencias>(clave);
      const optimista = anterior && cliente.setQueryData(clave,
        actualizarSugerenciaEnBandeja(anterior, id_participacion, {
          estado_revision, nivel_urgencia, respuesta,
        }),
      );
      return { anterior, optimista, clave };
    },
    onError: (error, _datos, contexto) => {
      if (contexto?.anterior && cliente.getQueryData(contexto.clave) === contexto.optimista) {
        cliente.setQueryData(contexto.clave, contexto.anterior);
      }
      if (error instanceof ErrorSugerencias &&
          (error.codigo === 'ERROR_CONCURRENCIA' || error.codigo === 'NO_ENCONTRADO')) {
        setSeleccionada(null);
        setAviso({ mensaje: error.message, error: true });
        return cliente.invalidateQueries({ queryKey: claveSesion });
      }
    },
    onSuccess: (sugerencia, _datos, contexto) => {
      cliente.setQueryData<BandejaSugerencias>(contexto.clave, pagina =>
        pagina && pagina === contexto.optimista
          ? actualizarSugerenciaEnBandeja(pagina, sugerencia.id_participacion, sugerencia)
          : pagina,
      );
      setSeleccionada(null);
      setAviso({ mensaje: 'Cambios guardados.', error: false });
      return cliente.invalidateQueries({ queryKey: claveSesion });
    },
    onSettled: () => { guardando.current = false; },
  });

  const total = bandeja.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / filtros.limite));

  function buscar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setFiltros(previos => ({ ...previos, busqueda: busqueda.trim(), pagina: 1 }));
  }

  function guardar(datos: SugerenciaUpdate) {
    if (guardando.current) return;
    guardando.current = true;
    setAviso(null);
    cambio.mutate(datos);
  }

  return (
    <main className="view-content sug-view">
      <div className="sug-layout">
        <header className="sug-header">
          <button className="sug-button" type="button" onClick={onVolver}>
            <span aria-hidden="true">←</span> Volver a Inicio
          </button>
          <p className="sug-eyebrow">Participación y consulta</p>
          <h1>Bandeja de sugerencias</h1>
          <p className="sug-muted">Revisá las sugerencias y registrá las acciones tomadas.</p>
        </header>

        <dl className="sug-kpis" aria-label="Resumen de sugerencias">
          {CONTADORES.map(([campo, titulo]) => (
            <div className="sug-card sug-kpi" key={campo} data-contador={campo}>
              <dt>{titulo}</dt><dd>{bandeja.data?.contadores[campo] ?? '—'}</dd>
            </div>
          ))}
        </dl>

        <section className="sug-card sug-inbox" aria-labelledby="sug-recibidas">
          <header className="sug-card-heading sug-inbox-heading">
            <div>
              <h2 id="sug-recibidas">Sugerencias recibidas</h2>
              {bandeja.data && <p className="sug-muted">{total === 1 ? '1 sugerencia' : `${total} sugerencias`}</p>}
            </div>
            <button className="sug-button" type="button" disabled={bandeja.isFetching || cambio.isPending}
              onClick={() => void bandeja.refetch()}>Actualizar</button>
          </header>
          <form className="sug-filters" aria-label="Buscar y filtrar sugerencias" onSubmit={buscar}>
            <label className="sug-field sug-search">
              <span>Buscar</span>
              <input type="search" placeholder="Texto, nombre o tipo" value={busqueda} maxLength={150}
                onChange={evento => setBusqueda(evento.target.value)} />
            </label>
            <button className="sug-button" type="submit">Buscar</button>
            <label className="sug-field">
              <span>Estado</span>
              <select value={filtros.estado_revision ?? ''} onChange={evento => {
                const estado = evento.target.value as EstadoSugerencia | '';
                setFiltros(previos => ({ ...previos, estado_revision: estado || null, pagina: 1 }));
              }}>
                <option value="">Todos los estados</option>
                {Object.entries(ESTADOS_SUGERENCIA).map(([valor, etiqueta]) =>
                  <option key={valor} value={valor}>{etiqueta}</option>,
                )}
              </select>
            </label>
            <label className="sug-field">
              <span>Prioridad</span>
              <select value={filtros.nivel_urgencia ?? ''} onChange={evento => {
                const prioridad = evento.target.value as PrioridadSugerencia | '';
                setFiltros(previos => ({ ...previos, nivel_urgencia: prioridad || null, pagina: 1 }));
              }}>
                <option value="">Todas las prioridades</option>
                {Object.entries(PRIORIDADES_SUGERENCIA).map(([valor, etiqueta]) =>
                  <option key={valor} value={valor}>{etiqueta}</option>,
                )}
              </select>
            </label>
          </form>
          {aviso && <p className={aviso.error ? 'sug-error' : 'sug-notice'} role={aviso.error ? 'alert' : 'status'}>
            {aviso.mensaje}
          </p>}
          {bandeja.isPending && <p className="sug-empty" role="status">Consultando sugerencias…</p>}
          {bandeja.error && <p className="sug-error" role="alert">{bandeja.error.message}</p>}
          {bandeja.data && (bandeja.data.sugerencias.length ? (
            <ul className="sug-results">
              {bandeja.data.sugerencias.map(sugerencia => (
                <li key={sugerencia.id_participacion}>
                  <button type="button" className="sug-result" aria-disabled={cambio.isPending} onClick={() => {
                    if (cambio.isPending) return;
                    cambio.reset();
                    setAviso(null);
                    setSeleccionada(sugerencia);
                  }}>
                    <span className="sug-result-copy">
                      <span className="sug-result-type">{sugerencia.tipo_sugerencia}</span>
                      <strong>{sugerencia.descripcion_sugerencia}</strong>
                      <span className="sug-muted">
                        {nombreVisible(sugerencia)} · {formatoFecha.format(new Date(sugerencia.fecha_hora_registro))}
                      </span>
                    </span>
                    <span className="sug-tags">
                      <span className="sug-badge" data-estado={sugerencia.estado_revision}>
                        {ESTADOS_SUGERENCIA[sugerencia.estado_revision]}
                      </span>
                      <span className="sug-badge" data-prioridad={sugerencia.nivel_urgencia}>
                        {PRIORIDADES_SUGERENCIA[sugerencia.nivel_urgencia]}
                      </span>
                    </span>
                    <span className="sug-result-arrow" aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="sug-empty">No hay sugerencias para esta página y estos filtros.</p>)}
          {(paginas > 1 || filtros.pagina > 1) && (
            <nav className="sug-pagination" aria-label="Páginas de sugerencias">
              <button className="sug-button" type="button" disabled={filtros.pagina <= 1 || bandeja.isPending}
                onClick={() => setFiltros(previos => ({ ...previos, pagina: previos.pagina - 1 }))}>
                Anterior
              </button>
              <span className="sug-muted" aria-live="polite">Página {filtros.pagina} de {Math.max(filtros.pagina, paginas)}</span>
              <button className="sug-button" type="button" disabled={filtros.pagina >= paginas || bandeja.isPending}
                onClick={() => setFiltros(previos => ({ ...previos, pagina: previos.pagina + 1 }))}>
                Siguiente
              </button>
            </nav>
          )}
        </section>
      </div>
      {seleccionada && <EditorSugerencia sugerencia={seleccionada} pendiente={cambio.isPending} error={cambio.error}
        onCerrar={() => setSeleccionada(null)} onGuardar={guardar} />}
    </main>
  );
}
