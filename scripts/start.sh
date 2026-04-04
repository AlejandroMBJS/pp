#!/usr/bin/env bash
# =============================================================
#  Arquicheck — Iniciar servicios
#  Arranca el stack y asegura que el servicio systemd esté
#  habilitado para reiniciar automáticamente tras un reboot.
#  Uso: bash scripts/start.sh
# =============================================================

set -euo pipefail

REPO_DIR="/opt/arquicheck"
SERVICE_NAME="arquicheck"

# Si se ejecuta desde el directorio del proyecto (no desde /opt)
if [[ ! -f "$REPO_DIR/docker-compose.prod.yml" ]]; then
  REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

cd "$REPO_DIR"

echo "[--] Iniciando Arquicheck..."

# Asegurar que systemd service esté habilitado (auto-restart en reboot)
if command -v systemctl &>/dev/null && systemctl list-unit-files "$SERVICE_NAME.service" &>/dev/null; then
  systemctl enable "$SERVICE_NAME" 2>/dev/null || true
  systemctl start "$SERVICE_NAME"
  echo "[OK] Servicio systemd '$SERVICE_NAME' iniciado y habilitado para auto-start"
else
  # Fallback: arrancar directamente con docker compose
  docker compose -f "$REPO_DIR/docker-compose.prod.yml" up -d --remove-orphans
  echo "[OK] Stack iniciado via docker compose"
fi

echo ""
docker compose -f "$REPO_DIR/docker-compose.prod.yml" ps
echo ""
echo "[OK] Arquicheck corriendo."
