---
trigger: always_on
---

# Directivas de Desarrollo Agéntico (FastAPI + React/TS + PostgreSQL)

## 0. Persona y Deliberación Cognitiva
Rule [AGENT-01] (Tone & Conciseness): Mantén un tono técnico, conciso y libre de cortesías o introducciones conversacionales. Prioriza decisiones de arquitectura, diffs limpios y comandos ejecutables.
Rule [COGNITIVE-01] (Pre-Execution Analysis): Antes de generar endpoints, migraciones o componentes de UI, inicializa un bloque "### Thought Process" evaluando cuellos de botella, condiciones de carrera y valores nulos.
Rule [COGNITIVE-02] (AppSheet Migration Scaffolding): Al migrar formularios de AppSheet, diseña siempre bajo el patrón Mobile-First, previendo captura de fotos, validación en cliente e inputs táctiles de al menos 44px.

---

## 1. Trazabilidad y Nomenclatura
Rule [NAMING-01]: Identifica módulos mediante [MOD-XX] y funcionalidades mediante [FN-XX.YY].
Rule [ANNOTATION-01]: En archivos fuente (.py, .tsx, .sql), incluye ÚNICAMENTE una etiqueta de una línea en la cabecera del componente/función (ej. `# [FN-01.02] Crear Inspeccion` o `// [MOD-02] SelectorCroquis`).
Rule [ANNOTATION-02]: Prohibido escribir comentarios redundantes sobre sintaxis básica. Delega explicaciones a `.agents/functional_catalog.md`.

---

## 2. Memoria y Catálogo Funcional
Rule [CATALOG-01] (Lean Registry): Tras completar una funcionalidad, actualiza `.agents/functional_catalog.md` registrando únicamente:
  - Feature ID y Nombre: [FN-XX.YY] Nombre
  - Módulo: [MOD-XX]
  - Flujo Operativo: Resumen (máx. 4 líneas)
  - Tablas afectadas: Esquemas y tablas
  - Reglas de negocio e invariantes
Rule [SKILLS-01] (Progressive Disclosure): Procedimientos complejos (migraciones Alembic complejas, subida de binarios a Cloudflare R2, seeds) deben encapsularse en `.agents/skills/<skill-name>/SKILL.md`.

---

## 3. Seguridad y Entorno
Rule [SANDBOX-01]: Operación confinada estrictamente a la raíz del workspace local.
Rule [SANDBOX-02] (Comandos Críticos): Operaciones destructivas (`rm -rf`, `DROP TABLE`, ejecuciones `sudo`) requieren autorización explícita (ASK_USER).
Rule [CREDENTIALS-01]: Prohibido hardcodear secretos, API keys o URLs de base de datos. Lee siempre desde variables de entorno (`.env` con respaldo en `.env.example`).
Rule [SAFETY-GIT-01]: Verifica estado limpio en Git o genera un commit antes de modificaciones masivas de código o esquemas.
Rule [GIT-BRANCH-01] (Feature Branches & Versioning): Cada nueva actualización o funcionalidad debe desarrollarse en una rama Git dedicada (`feat/<nombre>` o `fix/<nombre>`). Implementar Conventional Commits (`feat:`, `fix:`, `chore:`, etc.), documentar avances en `REGISTRO_DE_VERSIONES.md`, registrar en `.agents/functional_catalog.md` e incrementar la versión del proyecto según SemVer.

---

## 4. Estándares de Base de Datos (PostgreSQL & DBeaver)
Rule [TOOL-MCP-01] (Schema Introspection): Consulta el esquema real mediante el servidor MCP de Postgres antes de redactar modelos o queries para prevenir alucinaciones de columnas.
Rule [SEC-SQL-01]: Todas las interacciones deben ejecutarse mediante SQLAlchemy 2.0 Async o consultas parametrizadas.
Rule [SOFT-DELETE-01]: Tablas operativas deben implementar borrado lógico con `deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL`.
Rule [SOFT-DELETE-02]: Prohibido el uso de `DELETE FROM` en lógica de aplicación. Reservado exclusivamente para scripts de purga manual.
Rule [DB-INDEX-01]: Las restricciones de unicidad sobre tablas con soft-delete deben usar índices parciales (`WHERE deleted_at IS NULL`).

---

## 5. Backend (FastAPI & SQLAlchemy 2.0)
Rule [FASTAPI-ASYNC]: Todos los endpoints y llamadas a base de datos deben ser asíncronos utilizando `AsyncSession` y `asyncpg`.
Rule [ORM-FILTER-01]: Aplica el filtrado global de soft-delete en SQLAlchemy mediante `with_loader_criteria` en el evento `do_orm_execute`.
Rule [API-SCHEMA-01]: Segrega estrictamente los DTOs de Pydantic: `EntityCreate`, `EntityUpdate` y `EntityResponse`. Los esquemas de entrada jamás deben exponer campos de auditoría (`fecha_hora`, `usuario_id`, `deleted_at`).
Rule [AUDIT-01]: Extracción del usuario operador directamente desde las claims del JWT/sesión autenticada en las dependencias de FastAPI (`Depends(get_current_user)`).
Rule [STORAGE-R2]: Para subida de fotos (calzada, croquis), el backend debe generar URLs prefirmadas (Presigned URLs) hacia Cloudflare R2 vía `boto3`/`aioboto3`. No proceses streams pesados de imágenes a través del proceso web principal.

---

## 6. Frontend (React 19 + TypeScript + Tailwind CSS)
Rule [FRONT-TS-STRICT]: TypeScript estricto. Prohibido el uso de `any`. Define tipos sincronizados con los schemas Pydantic.
Rule [FRONT-BRAND-01]: Respeto estricto del sistema de diseño corporativo:
  - Color Primario (Acción/Estados clave): `#cc3333`
  - Color Secundario (Bordes/Textos secundarios): `#999999`
  - Fondos y contrastes aptos para visualización bajo luz solar directa en campo.
Rule [FRONT-STATE-01]: Estado de servidor gestionado exclusivamente mediante TanStack Query (React Query) con mutaciones optimistas. El estado local debe limitarse a `useState` o tiendas ligeras (`Zustand`).
Rule [FRONT-COMPILER]: Diseña componentes funcionales puros alineados al React Compiler; evita envoltorios manuales con `useMemo` o `useCallback` a menos que una auditoría de rendimiento lo justifique.

---

## 7. Verificación y Testing
Rule [SELF-HEAL-01]: Si un test o comando falla, diagnostica el stack trace, aplica una corrección y reintenta UNA (1) sola vez antes de solicitar intervención humana (ASK_USER).
Rule [VERIFY-PYTEST]: Todo endpoint o servicio debe contar con tests de integración automatizados con `pytest` y base transaccional de prueba.
Rule [FRONT-VERIFY]: Valida interfaces mediante el subagente de Browser de Antigravity para descartar errores en consola, problemas de viewport móvil y fuentes rotas de croquis.