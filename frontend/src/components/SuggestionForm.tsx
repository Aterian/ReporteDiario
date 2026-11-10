// [FN-06.10] Formulario de participación y consulta
import { useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/apiBridge';
import {
  LIMITE_DESCRIPCION,
  LIMITE_NOMBRE,
  obtenerDatosSugerencias,
  prepararSugerencia,
  SUGGESTIONS_QUERY_KEY,
  TIPOS_SUGERENCIA,
} from '../types/suggestions';
import type { SugerenciaCreate, TipoSugerencia } from '../types/suggestions';

interface Props {
  onVolver: () => void;
}

export default function SuggestionForm({ onVolver }: Props) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoSugerencia | ''>('');
  const [descripcion, setDescripcion] = useState('');
  const [errorValidacion, setErrorValidacion] = useState('');
  const campoDescripcion = useRef<HTMLTextAreaElement>(null);
  const confirmacion = useRef<HTMLHeadingElement>(null);
  const enviando = useRef(false);
  const cliente = useQueryClient();
  const envio = useMutation({
    mutationFn: async (datos: SugerenciaCreate) => obtenerDatosSugerencias(
      await api.crearSugerencia(datos),
      'No se pudo confirmar el envío de la sugerencia.',
    ),
    retry: false,
    gcTime: 0,
    onSuccess: () => cliente.invalidateQueries({ queryKey: SUGGESTIONS_QUERY_KEY, refetchType: 'none' }),
    onSettled: () => { enviando.current = false; },
  });

  useLayoutEffect(() => {
    if (envio.data) confirmacion.current?.focus();
  }, [envio.data]);

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando.current) return;

    let datos: SugerenciaCreate;
    try {
      datos = prepararSugerencia(nombre, tipo, descripcion);
    } catch (error) {
      setErrorValidacion(error instanceof Error ? error.message : 'Revisá la descripción.');
      campoDescripcion.current?.focus();
      return;
    }

    setErrorValidacion('');
    enviando.current = true;
    envio.mutate(datos);
  }

  function enviarOtra() {
    setNombre('');
    setTipo('');
    setDescripcion('');
    envio.reset();
  }

  return (
    <main className="view-content sug-view">
      <div className="sug-layout">
        <header className="sug-header">
          <button className="sug-button" type="button" onClick={onVolver} disabled={envio.isPending}>
            <span aria-hidden="true">←</span> Volver a Inicio
          </button>
          <p className="sug-eyebrow">Participación y consulta</p>
          <h1>Buzón de sugerencias</h1>
          <p className="sug-muted">Compartí una propuesta, una consulta o una inquietud sobre tu trabajo.</p>
        </header>

        {envio.data ? (
          <section className="sug-card sug-confirmation" aria-labelledby="sug-confirmacion">
            <span className="sug-success-mark" aria-hidden="true">✓</span>
            <div>
              <h2 ref={confirmacion} tabIndex={-1} id="sug-confirmacion">¡Gracias por tu aporte!</h2>
              <p>Tu sugerencia se guardó correctamente.</p>
              <p className="sug-reference"><strong>Referencia</strong> {envio.data.id_participacion}</p>
            </div>
            <div className="sug-actions">
              <button className="sug-button sug-button-primary" type="button" onClick={onVolver}>Volver a Inicio</button>
              <button className="sug-button" type="button" onClick={enviarOtra}>Enviar otra</button>
            </div>
          </section>
        ) : (
          <div className="sug-form-layout">
            <form className="sug-card sug-form" onSubmit={enviar} noValidate>
              <div className="sug-card-heading">
                <h2>Nueva sugerencia</h2>
                <p className="sug-muted">Contanos qué observaste o qué proponés mejorar.</p>
              </div>
              <fieldset className="sug-fields" disabled={envio.isPending}>
                <label className="sug-field">
                  <span>Nombre <small>Opcional</small></span>
                  <input autoComplete="name" value={nombre} maxLength={LIMITE_NOMBRE} placeholder="Tu nombre y apellido"
                    onChange={evento => setNombre(evento.target.value)} />
                </label>
                <fieldset className="sug-type-field">
                  <legend>Tipo de sugerencia <small>Opcional</small></legend>
                  <div className="sug-type-options">
                    {TIPOS_SUGERENCIA.map(opcion => (
                      <label className="sug-type-option" key={opcion}>
                        <input type="radio" name="tipo-sugerencia" value={opcion} checked={tipo === opcion}
                          onChange={() => setTipo(opcion)} />
                        <span>{opcion}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="sug-field">
                  <label htmlFor="sug-descripcion">Descripción</label>
                  <textarea id="sug-descripcion" ref={campoDescripcion} value={descripcion} required maxLength={LIMITE_DESCRIPCION}
                    placeholder="Describí la situación y, si podés, explicá dónde ocurre y qué cambiarías."
                    aria-invalid={Boolean(errorValidacion)}
                    aria-describedby={errorValidacion ? 'sug-descripcion-error' : 'sug-contador'}
                    onChange={evento => {
                      setDescripcion(evento.target.value);
                      if (errorValidacion) setErrorValidacion('');
                    }} />
                  <small className="sug-counter" id="sug-contador">{descripcion.length} / {LIMITE_DESCRIPCION}</small>
                </div>
              </fieldset>
              {errorValidacion && <p className="sug-error" id="sug-descripcion-error" role="alert">{errorValidacion}</p>}
              {envio.error && !errorValidacion && <p className="sug-error" role="alert">{envio.error.message}</p>}
              <footer className="sug-card-footer">
                <p className="sug-muted">Si dejás el nombre vacío, el envío será anónimo.</p>
                <button className="sug-button sug-button-primary" type="submit" disabled={envio.isPending}>
                  {envio.isPending ? 'Enviando…' : 'Enviar sugerencia'}
                </button>
              </footer>
            </form>

            <aside className="sug-card sug-guidance" aria-labelledby="sug-seguimiento">
              <h2 id="sug-seguimiento">¿Qué pasa después?</h2>
              <ol>
                <li><strong>Enviás tu sugerencia</strong><span>Se registra en la bandeja.</span></li>
                <li><strong>Se revisa el aporte</strong><span>El equipo responsable evalúa la prioridad y los pasos a seguir.</span></li>
                <li><strong>Se registra el seguimiento</strong><span>El equipo puede dejar una respuesta o indicar la acción tomada.</span></li>
              </ol>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
