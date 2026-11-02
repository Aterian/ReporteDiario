# [MOD-07] Contrato de escrituras exclusivas de roster
import ast
from pathlib import Path


# [FN-07.04] Impedir generación manual de asistencias o viáticos en el servicio roster
def test_roster_no_escribe_asistencias():
    modulo = ast.parse((Path(__file__).parents[1]/"postgres_repository.py").read_text(encoding="utf-8"))
    funcion = next(n for n in modulo.body if isinstance(n,ast.FunctionDef) and n.name=="guardar_rosters_atomicos")
    literales = [n.value for n in ast.walk(funcion) if isinstance(n,ast.Constant) and isinstance(n.value,str)]
    assert any("INSERT INTO app_rrhh.b_1_roster" in s for s in literales)
    assert not any("INSERT INTO app_rrhh.b_1_asistencias" in s for s in literales)
    assert not any("SET total_viaticos" in s for s in literales)
