#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <input.dwg> <output.dxf>" >&2
  exit 2
fi

input_path="$1"
output_path="$2"

if [ ! -f "$input_path" ]; then
  echo "Input DWG file not found: $input_path" >&2
  exit 2
fi

input_dir="$(mktemp -d)"
output_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$input_dir" "$output_dir"
}
trap cleanup EXIT

input_name="$(basename "$input_path")"
input_stem="${input_name%.*}"
expected_output="$output_dir/$input_stem.dxf"

cp "$input_path" "$input_dir/$input_name"

if command -v ODAFileConverter >/dev/null 2>&1; then
  if command -v xvfb-run >/dev/null 2>&1; then
    xvfb-run -a ODAFileConverter "$input_dir" "$output_dir" ACAD2018 DXF 0 1 "$input_name"
  else
    ODAFileConverter "$input_dir" "$output_dir" ACAD2018 DXF 0 1 "$input_name"
  fi
elif command -v dwg2dxf >/dev/null 2>&1; then
  dwg2dxf "$input_path" "$output_path"
  exit 0
else
  echo "No DWG converter is installed. Install ODA File Converter or dwg2dxf." >&2
  exit 1
fi

if [ ! -f "$expected_output" ]; then
  alt_output="$(find "$output_dir" -maxdepth 1 -type f \( -iname "$input_stem.dxf" -o -iname '*.dxf' \) | head -n 1)"
  if [ -z "$alt_output" ]; then
    echo "The DWG converter did not produce a DXF file." >&2
    exit 1
  fi
  expected_output="$alt_output"
fi

mkdir -p "$(dirname "$output_path")"
cp "$expected_output" "$output_path"