# [MOD-07] Integración Google Sheets retirada
from error_handler import ValidacionError


# [FN-07.08] Impedir reactivar una cola de sincronización retirada
def sincronizar_pendientes():
    raise ValidacionError("Google Sheets fue retirado; utilice la conexión PostgreSQL.")
