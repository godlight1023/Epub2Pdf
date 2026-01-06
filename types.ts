export enum ConversionStatus {
  IDLE = 'IDLE',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export type Language = 'en' | 'zh';

export interface EpubFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: ConversionStatus;
  progress: number;
  errorMessage?: string;
  summary?: string;
  pdfUrl?: string;
}

export interface SummaryResult {
  title: string;
  summary: string;
  keywords: string[];
}