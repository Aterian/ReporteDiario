# [MOD-07] Contratos de entrada PostgreSQL
from datetime import date, time
from decimal import Decimal
from enum import StrEnum
from uuid import UUID
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


# [FN-07.02] Estados de asistencia y roster
class EstadoAsistencia(StrEnum):
    ACTIVO = "activo"
    FRANCO = "franco"
    VACACIONES = "vacaciones"
    LICENCIA = "licencia"


# [FN-07.02] Datos editables de un turno
class RosterCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id_usuario: UUID
    id_proyecto: UUID
    fecha_inicio: date
    fecha_fin: date
    tipo_turno: EstadoAsistencia

    @model_validator(mode="after")
    def validar_periodo(self):
        if self.fecha_fin < self.fecha_inicio:
            raise ValueError("La fecha final debe ser posterior o igual a la inicial.")
        if (self.fecha_fin - self.fecha_inicio).days > 366:
            raise ValueError("El turno no puede superar 367 días.")
        return self


# [FN-07.02] Actualización de un turno existente
class RosterUpdate(RosterCreate):
    id_roster: UUID


# [FN-07.03] Datos editables de una asistencia
class AsistenciaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id_usuario: UUID
    fecha: date
    activo_franco: EstadoAsistencia
    lugar: str = Field(pattern="^(oficina|obra)$")
    tipo_dia: str = Field(default="dia_normal", pattern="^(dia_normal|franco_trabajado|feriado_trabajado)$")
    dedicado_a: str = Field(pattern="^(areas|proyectos)$")
    hora_inicio: time | None = None
    hora_fin: time | None = None
    horas_dedicadas: Decimal = Field(default=Decimal("0"), ge=0, le=24, allow_inf_nan=False)
    id_proyecto: UUID | None = None
    costo_manual: bool = False
    costo_dia: Decimal | None = Field(default=None, ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def validar_modalidad(self):
        if self.activo_franco != EstadoAsistencia.ACTIVO and self.tipo_dia != "dia_normal":
            raise ValueError("Los estados no trabajados no admiten recargos.")
        if self.dedicado_a == "proyectos" and self.id_proyecto is None:
            raise ValueError("Seleccione un proyecto válido.")
        if self.costo_manual and self.costo_dia is None:
            raise ValueError("Indique el costo diario manual.")
        if not self.costo_manual and self.costo_dia is not None:
            raise ValueError("El costo automático es responsabilidad de PostgreSQL.")
        if (self.hora_inicio is None) != (self.hora_fin is None):
            raise ValueError("Indique ambas horas o ninguna.")
        if self.activo_franco != EstadoAsistencia.ACTIVO:
            self.horas_dedicadas = Decimal("0")
            self.hora_inicio = self.hora_fin = None
        return self


# [FN-07.03] Actualización de una asistencia existente
class AsistenciaUpdate(AsistenciaCreate):
    id_asistencia: UUID


# [FN-07.04] Respuesta de roster con importes calculados por PostgreSQL
class RosterResponse(BaseModel):
    id: UUID
    id_empleado: UUID
    id_proyecto: UUID
    id_tarifa: UUID | None
    empleado: str
    proyecto: str
    fecha_inicio: date
    fecha_fin: date
    tipo_turno: EstadoAsistencia
    tipo: Literal["Campo", "Franco", "Vacaciones", "Licencia"]
    precio_dia: Decimal | None
    precio_domingo: Decimal | None
    total_viaticos: Decimal
    subida: Decimal | None
    bajada: Decimal | None
    adicional_turno: Decimal | None


# [FN-07.06] Respuesta de adicionales sin campos editables de auditoría
class AdicionalResponse(BaseModel):
    id_adicional: UUID
    fecha: date
    cantidad_adicional: Decimal
    descripcion: str


# [FN-07.06] Respuesta de liquidación sin cálculos en Python
class LiquidacionResponse(BaseModel):
    id_calculo_sueldo: UUID
    id_sueldo: UUID
    id_usuario: UUID
    ciclo_cobro: str
    cant_dias_ofi: int
    cant_dias_obra: int
    subtotal_ofi: Decimal
    subtotal_obra: Decimal
    subtotal_estimado: Decimal | None
    total_real: Decimal
    total_adicionales: Decimal
    sueldo_total: Decimal | None
    cerrado: bool
    adicionales: list[AdicionalResponse]


# [FN-07.04] Creación de tarifa de proyecto para roster
class TarifaRosterCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id_proyecto: UUID
    dia_normal: Decimal = Field(ge=0, allow_inf_nan=False)
    dia_domingo: Decimal = Field(ge=0, allow_inf_nan=False)
    subida: Decimal = Field(default=Decimal("0"), ge=0, allow_inf_nan=False)
    bajada: Decimal = Field(default=Decimal("0"), ge=0, allow_inf_nan=False)
    adicional_turno: Decimal = Field(default=Decimal("0"), ge=0, allow_inf_nan=False)


# [FN-04.12] Edición administrativa de usuario y sueldo base
class UsuarioSueldoUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id_usuario: UUID
    nombre: str = Field(min_length=1, max_length=100)
    apellido: str = Field(default="", max_length=100)
    dni: str = Field(min_length=1, max_length=20)
    correo: str = Field(min_length=3, max_length=150)
    area: str = Field(min_length=1, max_length=50)
    rol_app: str = Field(default="user_1", pattern="^(admin|sub_admin|core|user_1|user_2)$")
    activo: bool = True
    sueldo_oficina: Decimal = Field(default=Decimal("0"), ge=0, allow_inf_nan=False)
    sueldo_obra: Decimal = Field(default=Decimal("0"), ge=0, allow_inf_nan=False)
    lugar_habitual: Literal["oficina", "obra"] = "oficina"
    cumpleanos: str | None = None
    vigente_desde: date | str | None = None

    @model_validator(mode="before")
    @classmethod
    def normalizar_campos(cls, data):
        if isinstance(data, dict):
            if "correo" not in data and "email" in data:
                data["correo"] = data["email"]
            if "nombre" not in data and "primer_nombre" in data:
                data["nombre"] = data["primer_nombre"]
        return data

