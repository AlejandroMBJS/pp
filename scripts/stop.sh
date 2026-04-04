#!/usr/bin/env bash
# =============================================================
#  Arquicheck — Detener servicios
#  Detiene el stack sin deshabilitar el auto-start en reboot.
#  Los servicios volverán a arrancar la próxima vez que
#  se ejecute start.sh o al reiniciar el servidor.
#  Uso: bash scripts/stop.sh
# =============================================================

set -euo pipefail

REPO_DIR="/opt/arquicheck"
SERVICE_NAME="arquicheck"

# Si se ejecuta desde el directorio del proyecto (no desde /opt)
if [[ ! -f "$REPO_DIR/docker-compose.prod.yml" ]]; then
  REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

cd "$REPO_DIR"

echo "[--] Deteniendo Arquicheck..."

if command -v systemctl &>/dev/null && systemctl list-unit-files "$SERVICE_NAME.service" &>/dev/null; then
  # Detener via systemd (no deshabilitar — seguirá activo en el próximo reboot)
  systemctl stop "$SERVICE_NAME" || true
  echo "[OK] Servicio systemd '$SERVICE_NAME' detenido (auto-start en reboot sigue activo)"
else
  docker compose -f "$REPO_DIR/docker-compose.prod.yml" down
fi

echo "[OK] Arquicheck detenido."
