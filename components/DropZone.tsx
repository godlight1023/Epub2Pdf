import React, { useCallback } from 'react';
import { UploadCloud } from 'lucide-react';

interface DropZoneProps {
  onFilesAdded: (files: File[]) => void;
  t: {
    dropTitle: string;
    dropSubtitle: string;
    dropHint: string;
    dropAlert: string;
  };
}

export const DropZone: React.FC<DropZoneProps> = ({ onFilesAdded, t }) => {
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files).filter((f: any) => f.name.toLowerCase().endsWith('.epub')) as File[];
      if (filesArray.length > 0) {
        onFilesAdded(filesArray);
      } else {
        alert(t.dropAlert);
      }
    }
  }, [onFilesAdded, t]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files).filter((f: any) => f.name.toLowerCase().endsWith('.epub')) as File[];
      onFilesAdded(filesArray);
    }
  };

  return (
    <div 
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="border-2 border-dashed border-slate-300 rounded-xl p-10 flex flex-col items-center justify-center bg-white hover:bg-slate-50 transition-colors cursor-pointer text-center group"
      onClick={() => document.getElementById('fileInput')?.click()}
    >
      <input 
        type="file" 
        id="fileInput" 
        className="hidden" 
        multiple 
        accept=".epub"
        onChange={handleFileInput}
      />
      <div className="bg-blue-100 p-4 rounded-full mb-4 group-hover:bg-blue-200 transition-colors">
        <UploadCloud className="w-8 h-8 text-blue-600" />
      </div>
      <h3 className="text-lg font-semibold text-slate-700">{t.dropTitle}</h3>
      <p className="text-sm text-slate-500 mt-2">{t.dropSubtitle}</p>
      <p className="text-xs text-slate-400 mt-4">{t.dropHint}</p>
    </div>
  );
};