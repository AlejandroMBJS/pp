export type ViewerFileType = 'dxf' | 'stl' | '3mf' | 'step';

export interface FileData {
  data: string | ArrayBuffer;
  type: ViewerFileType;
  name: string;
}

export const SUPPORTED_FILE_LABELS = ['DXF', 'DWG', 'STL', 'STP', 'STEP', '3MF'] as const;

export function getFileTypeFromName(fileName: string): ViewerFileType | 'dwg' | null {
  const extension = fileName.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'dxf':
      return 'dxf';
    case 'dwg':
      return 'dwg';
    case 'stl':
      return 'stl';
    case '3mf':
      return '3mf';
    case 'step':
    case 'stp':
      return 'step';
    default:
      return null;
  }
}
