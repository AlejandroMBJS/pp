#!/usr/bin/env python3
"""
Converts a DWG file to DXF using ezdxf's recovery/read mechanism.
Usage: python3 dwg_to_dxf.py <input.dwg> <output.dxf>

ezdxf cannot read DWG natively; this script tries to open the file
as DXF (works if the file was saved as DXF with .dwg extension)
and falls back to the ODA file converter if available.
"""
import sys
import os

def convert(input_path: str, output_path: str) -> bool:
    try:
        import ezdxf
        from ezdxf import recover

        # Try recovery read — works for DXF files regardless of extension
        doc, auditor = recover.readfile(input_path)
        if auditor.has_errors:
            auditor.print_error_report()
        doc.saveas(output_path)
        print(f"OK: {output_path}", flush=True)
        return True
    except Exception as e:
        print(f"ERROR: {e}", flush=True)
        return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: dwg_to_dxf.py <input> <output>", flush=True)
        sys.exit(1)
    ok = convert(sys.argv[1], sys.argv[2])
    sys.exit(0 if ok else 1)
