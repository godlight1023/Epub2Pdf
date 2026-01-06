import React, { useState, useCallback, useRef } from 'react';
import JSZip from 'https://esm.sh/jszip@3.10.1';
import { DropZone } from './components/DropZone';
import { FileItem } from './components/FileItem';
import { EpubFile, ConversionStatus, Language } from './types';
import { convertEpubToPdf, setCustomFont, isCustomFontLoaded } from './utils/epubToPdf';
import { summarizeBookContent } from './services/gemini';
import { BookOpen, AlertTriangle, FolderOpen, Loader2, Languages, Type, Check, Download } from 'lucide-react';

const translations = {
  en: {
    appTitle: "Epub2Pdf Pro",
    converter: "Converter",
    settings: "Settings",
    fontSettings: "Font Settings",
    loadFont: "Load Local Font (.ttf)",
    fontLoaded: "Custom Font Active",
    webNote: "Note: This is the Web Version. For the standalone Windows .exe, wrap this PWA with Electron.",
    queueTitle: "Conversion Queue",
    queueSubtitle: "Convert EPUB books to PDF with AI-enhanced summaries",
    clearAll: "Clear All",
    startBatch: "Start Batch Conversion",
    batchDownload: "Download All (ZIP)",
    processing: "Processing...",
    processingBadge: "Processing",
    dropTitle: "Drag & Drop EPUB files here",
    dropSubtitle: "or click to browse folders",
    dropHint: "Supports batch processing",
    dropAlert: "Please drop .epub files only.",
    filesTitle: "Files",
    overallProgress: "Overall Progress",
    done: "Done",
    ready: "Ready",
    remove: "Remove",
    analyze: "Analyze with Gemini AI",
    download: "Download PDF",
    geminiInsights: "Gemini Insights",
    geminiAnalyzing: "Analyzing content with Gemini...",
    geminiFailed: "Failed to analyze.",
    alertConvertFirst: "Please convert the file first to extract text for analysis."
  },
  zh: {
    appTitle: "Epub2Pdf 专业版",
    converter: "转换器",
    settings: "设置",
    fontSettings: "字体设置",
    loadFont: "加载本地字体 (.ttf)",
    fontLoaded: "已加载自定义字体",
    webNote: "注意：这是Web版本。如需独立的Windows .exe文件，请使用Electron封装此PWA。",
    queueTitle: "转换队列",
    queueSubtitle: "将EPUB电子书转换为PDF，并提供AI增强摘要功能",
    clearAll: "清空全部",
    startBatch: "开始批量转换",
    batchDownload: "批量下载 (ZIP)",
    processing: "处理中...",
    processingBadge: "处理中",
    dropTitle: "拖拽 EPUB 文件到这里",
    dropSubtitle: "或点击选择文件夹",
    dropHint: "支持批量处理",
    dropAlert: "请仅拖放 .epub 文件。",
    filesTitle: "文件列表",
    overallProgress: "总进度",
    done: "完成",
    ready: "就绪",
    remove: "移除",
    analyze: "使用 Gemini AI 分析",
    download: "下载 PDF",
    geminiInsights: "Gemini 洞察",
    geminiAnalyzing: "Gemini 正在分析内容...",
    geminiFailed: "分析失败。",
    alertConvertFirst: "请先转换文件以提取文本进行分析。"
  }
};

const App: React.FC = () => {
  const [files, setFiles] = useState<EpubFile[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [language, setLanguage] = useState<Language>('zh'); // Default to Chinese for Chinese user
  const [customFontActive, setCustomFontActive] = useState(false);
  const fontInputRef = useRef<HTMLInputElement>(null);

  const t = translations[language];

  // Calculate overall progress
  const overallProgress = files.length > 0 
    ? Math.round(files.reduce((acc, f) => acc + f.progress, 0) / files.length)
    : 0;
    
  const hasCompletedFiles = files.some(f => f.status === ConversionStatus.COMPLETED);

  const addFiles = (newFiles: File[]) => {
    const newEpubFiles: EpubFile[] = newFiles.map(f => ({
      id: Math.random().toString(36).substring(7),
      file: f,
      name: f.name,
      size: f.size,
      status: ConversionStatus.IDLE,
      progress: 0
    }));
    setFiles(prev => [...prev, ...newEpubFiles]);
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const updateFileStatus = (id: string, updates: Partial<EpubFile>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (!file.name.toLowerCase().endsWith('.ttf')) {
        alert("Please select a .ttf font file.");
        return;
      }
      try {
        await setCustomFont(file);
        setCustomFontActive(true);
        alert(language === 'zh' ? "字体加载成功！现在转换将使用此字体。" : "Font loaded successfully! Conversion will now use this font.");
      } catch (err) {
        alert("Failed to load font.");
      }
    }
  };

  const startConversion = async () => {
    const idleFiles = files.filter(f => f.status === ConversionStatus.IDLE);
    if (idleFiles.length === 0) return;

    setIsConverting(true);

    // Process concurrently-ish
    for (const fileData of files) {
      if (fileData.status !== ConversionStatus.IDLE) continue;

      updateFileStatus(fileData.id, { status: ConversionStatus.PROCESSING, progress: 0 });

      try {
        const { blob, textPreview } = await convertEpubToPdf(fileData.file, (progress) => {
          updateFileStatus(fileData.id, { progress });
        });

        const url = URL.createObjectURL(blob);
        (fileData as any)._textPreview = textPreview; 

        updateFileStatus(fileData.id, { 
          status: ConversionStatus.COMPLETED, 
          progress: 100,
          pdfUrl: url
        });

      } catch (error: any) {
        console.error(`Failed to convert ${fileData.name}`, error);
        updateFileStatus(fileData.id, { 
          status: ConversionStatus.ERROR, 
          errorMessage: error.message || "Unknown error",
          progress: 0 
        });
      }
    }

    setIsConverting(false);
  };

  const handleDownload = (id: string) => {
    const file = files.find(f => f.id === id);
    if (file && file.pdfUrl) {
      const a = document.createElement('a');
      a.href = file.pdfUrl;
      a.download = file.name.replace('.epub', '.pdf');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleBatchDownload = async () => {
    const completedFiles = files.filter(f => f.status === ConversionStatus.COMPLETED && f.pdfUrl);
    if (completedFiles.length === 0) return;

    // Single file download directly
    if (completedFiles.length === 1) {
      handleDownload(completedFiles[0].id);
      return;
    }

    setIsZipping(true);
    try {
      const zip = new JSZip();
      
      await Promise.all(completedFiles.map(async (file) => {
        if (file.pdfUrl) {
          const response = await fetch(file.pdfUrl);
          const blob = await response.blob();
          const fileName = file.name.replace(/\.epub$/i, '.pdf');
          zip.file(fileName, blob);
        }
      }));

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `epub2pdf_batch_${new Date().toISOString().slice(0,10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to zip files", e);
      alert("Failed to create zip file.");
    } finally {
      setIsZipping(false);
    }
  };

  const handleAnalyze = async (id: string) => {
    const file = files.find(f => f.id === id);
    if (!file || !(file as any)._textPreview) {
      alert(t.alertConvertFirst);
      return;
    }

    updateFileStatus(id, { summary: t.geminiAnalyzing });
    
    try {
      const result = await summarizeBookContent((file as any)._textPreview, language);
      updateFileStatus(id, { summary: `${result.title}: ${result.summary}` });
    } catch (e) {
      updateFileStatus(id, { summary: t.geminiFailed });
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-slate-300 p-6 flex flex-col hidden md:flex">
        <div className="flex items-center space-x-2 mb-8 text-white">
          <BookOpen className="w-6 h-6 text-blue-500" />
          <h1 className="text-xl font-bold tracking-tight">{t.appTitle}</h1>
        </div>
        
        <nav className="flex-1 space-y-2">
          <div className="bg-slate-800 text-white p-3 rounded-lg text-sm font-medium flex items-center space-x-3 cursor-pointer">
            <FolderOpen className="w-4 h-4" />
            <span>{t.converter}</span>
          </div>
          
          {/* Font Settings Section */}
          <div className="pt-4 mt-4 border-t border-slate-800">
             <h3 className="text-xs uppercase text-slate-500 font-semibold mb-3 px-2">{t.fontSettings}</h3>
             
             <button 
               onClick={() => fontInputRef.current?.click()}
               className={`w-full p-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition-colors ${
                 customFontActive 
                   ? 'bg-green-900/30 text-green-400 border border-green-800' 
                   : 'hover:bg-slate-800 text-slate-400'
               }`}
             >
               {customFontActive ? <Check className="w-4 h-4" /> : <Type className="w-4 h-4" />}
               <span>{customFontActive ? t.fontLoaded : t.loadFont}</span>
             </button>
             <input 
               type="file" 
               accept=".ttf" 
               ref={fontInputRef} 
               className="hidden" 
               onChange={handleFontUpload}
             />
             <p className="text-[10px] text-slate-600 mt-2 px-2">
               {language === 'zh' 
                 ? "解决乱码：加载 Arial.ttf 或 微软雅黑.ttf 等本地字体文件"
                 : "Fix Mojibake: Load local .ttf font (e.g., Arial, SimHei)"}
             </p>
          </div>
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-800">
          <p className="text-xs text-slate-500 leading-relaxed">
            {t.webNote}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-slate-50 h-full overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between shadow-sm z-10 relative">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-slate-900">{t.queueTitle}</h2>
              {isConverting && (
                 <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                   {t.processingBadge}
                 </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-1">{t.queueSubtitle}</p>
          </div>
          
          <div className="flex space-x-3 items-center">
             {/* Language Toggle */}
             <button 
               onClick={() => setLanguage(prev => prev === 'en' ? 'zh' : 'en')}
               className="flex items-center space-x-1 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors mr-2"
               title="Switch Language"
             >
               <Languages className="w-4 h-4" />
               <span>{language === 'en' ? 'EN' : '中'}</span>
             </button>

             <div className="h-6 w-px bg-slate-300 mx-2"></div>

             {/* Batch Download Button */}
             {hasCompletedFiles && (
               <button
                 onClick={handleBatchDownload}
                 disabled={isZipping}
                 className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-2"
               >
                 {isZipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                 {t.batchDownload}
               </button>
             )}

             <button 
               onClick={() => setFiles([])}
               className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-red-600 transition-colors"
               disabled={isConverting}
             >
               {t.clearAll}
             </button>
             <button 
               onClick={startConversion}
               disabled={isConverting || files.length === 0}
               className={`px-6 py-2 rounded-lg text-sm font-semibold text-white shadow-md transition-all flex items-center space-x-2
                 ${isConverting || files.length === 0 
                   ? 'bg-slate-400 cursor-not-allowed' 
                   : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg active:scale-95'}`}
             >
               {isConverting && <Loader2 className="w-4 h-4 animate-spin" />}
               <span>
                 {isConverting ? `${t.processing} ${overallProgress}%` : t.startBatch}
               </span>
             </button>
          </div>

          {/* Overall Progress Bar */}
          {files.length > 0 && (
            <div className="absolute bottom-0 left-0 w-full h-1 bg-slate-100">
              <div 
                className={`h-full transition-all duration-500 ease-out ${overallProgress === 100 ? 'bg-green-500' : 'bg-blue-600'}`}
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          )}
        </header>

        <main className="flex-1 overflow-auto p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            <DropZone onFilesAdded={addFiles} t={t} />

            {files.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-800">{t.filesTitle} ({files.length})</h3>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono text-slate-400">
                      {t.overallProgress}: {overallProgress}%
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      {files.filter(f => f.status === ConversionStatus.COMPLETED).length} / {files.length} {t.done}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {files.map(file => (
                    <FileItem 
                      key={file.id} 
                      fileData={file} 
                      onAnalyze={handleAnalyze}
                      onDownload={handleDownload}
                      onRemove={removeFile}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;