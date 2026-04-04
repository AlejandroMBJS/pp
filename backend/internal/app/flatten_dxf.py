#!/usr/bin/env python3
"""
Post-process a DXF file for web preview.
Explodes INSERT block references into primitives and writes a minimal DXF
containing only LINE, LWPOLYLINE, CIRCLE, ARC, SPLINE, ELLIPSE entities.
This converts a 100MB DXF (heavy BLOCKS section) into a few-MB flat DXF.
"""
import sys

MAX_ENTITIES = 40_000
KEEP_TYPES = {"LINE", "LWPOLYLINE", "POLYLINE", "CIRCLE", "ARC", "SPLINE", "ELLIPSE"}


def copy_entity(entity, out_msp):
    etype = entity.dxftype()
    dxf = entity.dxf
    try:
        if etype == "LINE":
            out_msp.add_line(dxf.start, dxf.end)
        elif etype == "LWPOLYLINE":
            pts = list(entity.get_points())
            if pts:
                out_msp.add_lwpolyline(
                    [(p[0], p[1]) for p in pts],
                    close=entity.closed,
                )
        elif etype == "POLYLINE":
            pts = [v.dxf.location for v in entity.vertices]
            if pts:
                out_msp.add_lwpolyline(
                    [(p[0], p[1]) for p in pts],
                    close=entity.is_closed,
                )
        elif etype == "CIRCLE":
            out_msp.add_circle(dxf.center, dxf.radius)
        elif etype == "ARC":
            out_msp.add_arc(dxf.center, dxf.radius, dxf.start_angle, dxf.end_angle)
        elif etype in ("SPLINE", "ELLIPSE"):
            pts = list(entity.flattening(0.01))
            if len(pts) >= 2:
                out_msp.add_lwpolyline([(p[0], p[1]) for p in pts])
    except Exception:
        pass


def flatten(input_path: str, output_path: str) -> bool:
    try:
        import ezdxf

        doc = ezdxf.readfile(input_path)
        msp = doc.modelspace()

        out_doc = ezdxf.new("R2010")
        out_msp = out_doc.modelspace()

        count = 0
        for entity in msp:
            if count >= MAX_ENTITIES:
                break
            try:
                etype = entity.dxftype()
                if etype == "INSERT":
                    for virtual in entity.virtual_entities():
                        if count >= MAX_ENTITIES:
                            break
                        if virtual.dxftype() in KEEP_TYPES:
                            copy_entity(virtual, out_msp)
                            count += 1
                elif etype in KEEP_TYPES:
                    copy_entity(entity, out_msp)
                    count += 1
            except Exception:
                pass

        out_doc.saveas(output_path)
        print(f"OK: {count} entities -> {output_path}", flush=True)
        return True
    except Exception as e:
        print(f"ERROR: {e}", flush=True)
        return False


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: flatten_dxf.py <input.dxf> <output.dxf>", flush=True)
        sys.exit(1)
    sys.exit(0 if flatten(sys.argv[1], sys.argv[2]) else 1)
