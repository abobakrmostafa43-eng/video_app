export interface DownloadJob {
  id: string;
  url: string;
  title: string;
  uploader: string;
  status: 'pending' | 'analyzing' | 'downloading' | 'processing' | 'completed' | 'failed';
  progress: number;
  speed: string;
  eta: string;
  quality: string;
  qualityName: string;
  filename: string;
  fileSize: string;
  error?: string;
  addedAt: number;
  filePath?: string;
}

export interface AppSettings {
  proxies: string[];
  activeProxy: string | null;
  cookies: string;
  useCookies: boolean;
  userAgents: string[];
  rotateUserAgents: boolean;
  defaultQuality: string;
  concurrentLimit: number;
}

export interface DownloadedFile {
  name: string;
  size: number;
  sizeFormatted: string;
  type: 'video' | 'audio' | 'unknown';
  createdAt: number;
  filePath: string;
}

export const QUALITY_OPTIONS: Record<string, { name: string; format: string; ext: string; args?: string[] }> = {
  "1": { name: "Best Quality (Video + Audio)", format: "bestvideo+bestaudio/best", ext: "mp4" },
  "2": { name: "1080p Full HD", format: "bestvideo[height<=1080]+bestaudio/best[height<=1080]", ext: "mp4" },
  "3": { name: "720p HD", format: "bestvideo[height<=720]+bestaudio/best[height<=720]", ext: "mp4" },
  "4": { name: "480p SD", format: "bestvideo[height<=480]+bestaudio/best[height<=480]", ext: "mp4" },
  "5": { name: "Audio Only (MP3)", format: "bestaudio/best", ext: "mp3", args: ["-x", "--audio-format", "mp3", "--audio-quality", "192K"] },
  "6": { name: "Audio Only (M4A)", format: "bestaudio/best", ext: "m4a", args: ["-x", "--audio-format", "m4a"] },
};
