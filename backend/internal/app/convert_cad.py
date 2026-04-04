import bpy
import sys
import os

# Script para que Blender importe un archivo CAD y lo exporte como GLB
# Uso: blender --background --python convert_cad.py -- <input_file> <output_file>

def convert_cad_to_glb(input_path, output_path):
    # Limpiar escena inicial
    bpy.ops.wm.read_factory_settings(use_empty=True)
    
    # Intentar importar el archivo (DXF es el puente de DWG)
    # Blender soporta importar DXF por defecto
    try:
        # Nota: bpy.ops.import_scene.dxf requiere habilitar el addon "io_import_dxf"
        # Habilitar el addon necesario si no está
        bpy.ops.preferences.addon_enable(module="io_import_dxf")
        
        # Importar DXF
        bpy.ops.import_scene.dxf(filepath=input_path)
        
        # Exportar a GLB
        bpy.ops.export_scene.gltf(filepath=output_path, export_format='GLB')
        print(f"Conversión exitosa: {output_path}")
        return True
    except Exception as e:
        print(f"Error en Blender: {str(e)}")
        return False

if __name__ == "__main__":
    # Obtener argumentos después del --
    args = sys.argv[sys.argv.index("--") + 1:]
    if len(args) >= 2:
        convert_cad_to_glb(args[0], args[1])
