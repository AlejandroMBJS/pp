#!/usr/bin/env bash
# =============================================================
#  Arquicheck — Script de despliegue completo para Hostinger VPS
#  Ejecutar como root: bash scripts/deploy.sh
#  Idempotente: se puede ejecutar varias veces sin problema
# =============================================================

set -euo pipefail

REPO_DIR="/opt/arquicheck"
SERVICE_NAME="arquicheck"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC} $*"; }
info() { echo -e "${BLUE}[--]${NC} $*"; }
warn() { echo -e "${YELLOW}[!!]${NC} $*"; }
die()  { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ------------------------------------------------------------
# 1. Verificar que se ejecuta como root
# ------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  die "Este script debe ejecutarse como root (sudo bash scripts/deploy.sh)"
fi

echo ""
echo "======================================================"
echo "  Arquicheck — Deploy de Producción"
echo "======================================================"
echo ""

# ------------------------------------------------------------
# 2. Instalar Docker si no está presente
# ------------------------------------------------------------
if ! command -v docker &>/dev/null; then
  info "Instalando Docker..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  log "Docker instalado correctamente"
else
  log "Docker ya está instalado ($(docker --version | cut -d' ' -f3 | tr -d ','))"
fi

# Verificar docker compose plugin
if ! docker compose version &>/dev/null; then
  die "docker compose plugin no encontrado. Instala docker-compose-plugin manualmente."
fi
log "Docker Compose disponible ($(docker compose version --short))"

# ------------------------------------------------------------
# 3. Copiar el proyecto a /opt/arquicheck
# ------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_SOURCE="$(dirname "$SCRIPT_DIR")"

if [[ "$PROJECT_SOURCE" == "$REPO_DIR" ]]; then
  info "El proyecto ya está en $REPO_DIR"
else
  info "Copiando proyecto a $REPO_DIR..."
  mkdir -p "$REPO_DIR"
  # rsync preserva permisos y es idempotente
  if command -v rsync &>/dev/null; then
    rsync -a --exclude='.git' --exclude='data/' --exclude='frontend/.next/' \
      "$PROJECT_SOURCE/" "$REPO_DIR/"
  else
    cp -r "$PROJECT_SOURCE/." "$REPO_DIR/"
  fi
  log "Proyecto copiado a $REPO_DIR"
fi

cd "$REPO_DIR"

# ------------------------------------------------------------
# 4. Configurar .env
# ------------------------------------------------------------
if [[ ! -f "$REPO_DIR/.env" ]]; then
  if [[ -f "$REPO_DIR/.env.example" ]]; then
    cp "$REPO_DIR/.env.example" "$REPO_DIR/.env"
    warn "Se creó .env desde .env.example"
    warn ""
    warn "  *** IMPORTANTE: Edita $REPO_DIR/.env antes de continuar ***"
    warn "  Cambia DB_PASSWORD, JWT_SECRET y PUBLIC_BASE_URL"
    warn ""
    warn "  Genera un JWT_SECRET seguro con:"
    warn "    openssl rand -hex 32"
    warn ""
    read -rp "  Presiona ENTER cuando hayas editado .env, o Ctrl+C para cancelar..." _dummy
  else
    die "No se encontró .env.example. Crea $REPO_DIR/.env manualmente."
  fi
else
  log ".env ya existe — usando configuración existente"
fi

# Validar que las variables críticas están seteadas
source "$REPO_DIR/.env"
[[ "${DB_PASSWORD:-}" == "CHANGE_ME"* ]] && die "DB_PASSWORD sigue siendo el valor de ejemplo. Edita .env"
[[ "${JWT_SECRET:-}" == "CHANGE_ME"* ]] && die "JWT_SECRET sigue siendo el valor de ejemplo. Edita .env"
[[ -z "${PUBLIC_BASE_URL:-}" ]] && die "PUBLIC_BASE_URL está vacío. Edita .env"
log "Variables de entorno validadas"

# ------------------------------------------------------------
# 5. Crear directorios de datos con permisos correctos
# ------------------------------------------------------------
mkdir -p "$REPO_DIR/data/backend/uploads/previews"
chmod -R 755 "$REPO_DIR/data"
log "Directorios de datos creados"

# ------------------------------------------------------------
# 6. Instalar y habilitar el servicio systemd
# ------------------------------------------------------------
info "Configurando servicio systemd..."
cp "$REPO_DIR/arquicheck.service" /etc/systemd/system/"$SERVICE_NAME".service
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
log "Servicio systemd '$SERVICE_NAME' habilitado (arrancará automáticamente al reiniciar)"

# ------------------------------------------------------------
# 7. Construir imágenes Docker
# ------------------------------------------------------------
info "Construyendo imágenes Docker (puede tardar varios minutos)..."
docker compose -f "$REPO_DIR/docker-compose.prod.yml" --env-file "$REPO_DIR/.env" build --no-cache
log "Imágenes construidas correctamente"

# ------------------------------------------------------------
# 8. Arrancar el stack
# ------------------------------------------------------------
info "Iniciando el stack de producción..."
systemctl start "$SERVICE_NAME"

# Esperar a que los servicios estén saludables
info "Esperando que los servicios estén listos..."
ATTEMPTS=0
MAX_ATTEMPTS=30
until docker compose -f "$REPO_DIR/docker-compose.prod.yml" exec -T gateway \
  wget -qO- http://localhost/healthz &>/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [[ $ATTEMPTS -ge $MAX_ATTEMPTS ]]; then
    warn "Health check no respondió en 30 intentos — revisa los logs:"
    warn "  docker compose -f $REPO_DIR/docker-compose.prod.yml logs"
    break
  fi
  sleep 3
done

# ------------------------------------------------------------
# 9. Resultado final
# ------------------------------------------------------------
echo ""
echo "======================================================"
echo -e "${GREEN}  Deploy completado exitosamente${NC}"
echo "======================================================"
echo ""
echo "  Stack corriendo:"
docker compose -f "$REPO_DIR/docker-compose.prod.yml" ps
echo ""
echo "  URL de la aplicación: ${PUBLIC_BASE_URL}"
echo ""
echo "  Comandos útiles:"
echo "    Ver logs:   docker compose -f $REPO_DIR/docker-compose.prod.yml logs -f"
echo "    Detener:    bash $REPO_DIR/scripts/stop.sh"
echo "    Iniciar:    bash $REPO_DIR/scripts/start.sh"
echo ""
