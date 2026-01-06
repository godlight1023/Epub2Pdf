import React from 'react';
import { FileText, Loader2, CheckCircle, AlertCircle, FileOutput, Sparkles } from 'lucide-react';
import { EpubFile, ConversionStatus } from '../types';

interface FileItemProps {
  fileData: EpubFile;
  onAnalyze: (id: string) => void;
  onDownload: (id: string) => void;
  onRemove: (id: string) => void;
  t: {
    ready: string;
    remove: string;
    analyze: string;
    download: string;
    geminiInsights: string;
  };
}

export const FileItem: React.FC<FileItemProps> = ({ fileData, onAnalyze, onDownload, onRemove, t }) => {
  const isProcessing = fileData.status === ConversionStatus.PROCESSING;
  const isCompleted = fileData.status === ConversionStatus.COMPLETED;
  const isError = fileData.status === ConversionStatus.ERROR;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 mb-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4 flex-1">
          <div className={`p-2 rounded-lg ${isError ? 'bg-red-100' : isCompleted ? 'bg-green-100' : 'bg-slate-100'}`}>
            {isProcessing ? (
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            ) : isCompleted ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : isError ? (
              <AlertCircle className="w-5 h-5 text-red-600" />
            ) : (
              <FileText className="w-5 h-5 text-slate-600" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-slate-900 truncate" title={fileData.name}>{fileData.name}</h4>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-xs text-slate-500">{(fileData.size / 1024 / 1024).toFixed(2)} MB</span>
              {isError && <span className="text-xs text-red-500 font-medium">• {fileData.errorMessage}</span>}
              {isCompleted && <span className="text-xs text-green-500 font-medium">• {t.ready}</span>}
            </div>
            
            {/* Progress Bar */}
            {(isProcessing || fileData.status === ConversionStatus.QUEUED) && (
               <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                 <div 
                   className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" 
                   style={{ width: `${fileData.progress}%` }}
                 />
               </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2 ml-4">
          {/* AI Feature */}
          <button 
            onClick={() => onAnalyze(fileData.id)}
            disabled={!isCompleted}
            className={`p-2 rounded-full hover:bg-purple-50 transition-colors group relative ${!isCompleted ? 'opacity-30 cursor-not-allowed' : ''}`}
            title={t.analyze}
          >
            <Sparkles className="w-4 h-4 text-purple-600" />
          </button>

          {/* Download */}
          <button 
            onClick={() => onDownload(fileData.id)}
            disabled={!isCompleted}
            className={`p-2 rounded-full hover:bg-blue-50 transition-colors ${!isCompleted ? 'opacity-30 cursor-not-allowed' : ''}`}
            title={t.download}
          >
            <FileOutput className="w-4 h-4 text-blue-600" />
          </button>

          {/* Remove */}
          <button 
            onClick={() => onRemove(fileData.id)}
            className="text-xs text-slate-400 hover:text-red-500 px-2 py-1"
          >
            {t.remove}
          </button>
        </div>
      </div>

      {/* AI Summary Section */}
      {fileData.summary && (
        <div className="mt-3 bg-purple-50 rounded-md p-3 text-xs border border-purple-100">
          <div className="flex items-center space-x-2 mb-1">
            <Sparkles className="w-3 h-3 text-purple-600" />
            <span className="font-semibold text-purple-800">{t.geminiInsights}</span>
          </div>
          <p className="text-purple-900 leading-relaxed">{fileData.summary}</p>
        </div>
      )}
    </div>
  );
};