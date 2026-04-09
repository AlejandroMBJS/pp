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

EXPOSE 8080
CMD ["/app/api"]
