FROM golang:1.25-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o /out/api ./cmd/api

# Build dwg2dxf from LibreDWG source — only reliable open-source DWG→DXF binary converter
FROM debian:bookworm AS libredwg-build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    autoconf \
    automake \
    libtool \
    pkg-config \
    libpcre2-dev \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN wget -q https://ftp.gnu.org/gnu/libredwg/libredwg-0.12.5.tar.xz \
    && tar xf libredwg-0.12.5.tar.xz \
    && cd libredwg-0.12.5 \
    && ./configure --prefix=/opt/libredwg --disable-shared \
    && make -j$(nproc) \
    && make install

# Runtime image
FROM debian:bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    curl \
    && pip3 install --break-system-packages ezdxf \
    && rm -rf /var/lib/apt/lists/*

COPY --from=libredwg-build /opt/libredwg/bin/dwg2dxf /usr/local/bin/dwg2dxf
COPY --from=build /out/api /app/api
COPY internal/app/dwg_to_dxf.py /app/dwg_to_dxf.py
COPY internal/app/flatten_dxf.py /app/flatten_dxf.py
COPY scripts/convert-dwg.sh /app/scripts/convert-dwg.sh
RUN chmod +x /app/scripts/convert-dwg.sh

# Drop privileges. The bind-mounted /app/data has to be owned/writable by uid
# 1000 on the host (the deploy script chowns it on VPS), so the host path
# /srv/projpul/data/backend must match. See audit-findings.md F3.
RUN useradd --system --uid 1000 --user-group --home-dir /app --no-create-home app \
 && mkdir -p /app/data \
 && chown -R app:app /app
USER app

EXPOSE 8080
CMD ["/app/api"]
