import { useState, useEffect, FormEvent } from 'react';
import { 
  Download, 
  Search, 
  Settings, 
  Folder, 
  Play, 
  Trash2, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  RefreshCw, 
  Sliders, 
  Globe, 
  FileAudio, 
  FileVideo, 
  Plus, 
  Server, 
  Cpu, 
  ListChecks, 
  Volume2, 
  FileText, 
  Clock, 
  Eye, 
  Check,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DownloadJob, AppSettings, DownloadedFile, QUALITY_OPTIONS } from './types';

export default function App() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'cockpit' | 'media' | 'settings'>('cockpit');

  // Server state
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [queue, setQueue] = useState<DownloadJob[]>([]);
  const [files, setFiles] = useState<DownloadedFile[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Analysis state
  const [singleUrl, setSingleUrl] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<{
    title: string;
    uploader: string;
    thumbnail: string;
    duration: number;
    view_count: number;
    url: string;
  } | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<string>('1');
  const [customFilename, setCustomFilename] = useState<string>('');
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Batch states
  const [batchUrls, setBatchUrls] = useState<string>('');
  const [batchQuality, setBatchQuality] = useState<string>('1');
  const [isBatchAdding, setIsBatchAdding] = useState<boolean>(false);

  // Active Player state
  const [playingFile, setPlayingFile] = useState<DownloadedFile | null>(null);

  // Settings states
  const [newProxy, setNewProxy] = useState<string>('');
  const [cookiesText, setCookiesText] = useState<string>('');
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  // Stats
  const [serverStats, setServerStats] = useState({
    activeDownloads: 0,
    totalFilesCount: 0,
    totalStorageUsed: '0 MB'
  });

  // Polling intervals - primitives used for tracking
  const [pollTrigger, setPollTrigger] = useState<number>(0);

  // Fetch settings once on boot
  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        setCookiesText(data.cookies || '');
      })
      .catch(err => {
        console.error("Error fetching settings:", err);
        setIsConnected(false);
      });
  }, []);

  // Fetch files and queue periodically
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [queueRes, filesRes] = await Promise.all([
          fetch('/api/queue'),
          fetch('/api/files')
        ]);
        
        if (!queueRes.ok || !filesRes.ok) throw new Error("Server error");
        
        const queueData = await queueRes.json();
        const filesData = await filesRes.json();

        setQueue(queueData);
        setFiles(filesData);
        setIsConnected(true);

        // Compute local stats
        const activeCount = queueData.filter((j: DownloadJob) => j.status === 'downloading' || j.status === 'analyzing').length;
        const totalSize = filesData.reduce((acc: number, f: DownloadedFile) => acc + f.size, 0);
        
        setServerStats({
          activeDownloads: activeCount,
          totalFilesCount: filesData.length,
          totalStorageUsed: formatBytes(totalSize)
        });
      } catch (err) {
        console.error("Connection polling failed:", err);
        setIsConnected(false);
      }
    };

    fetchData();
    const timer = setInterval(() => {
      setPollTrigger(prev => prev + 1);
    }, 2000);

    return () => clearInterval(timer);
  }, [pollTrigger]);

  // Handle single link analysis
  const handleAnalyze = async (e: FormEvent) => {
    e.preventDefault();
    if (!singleUrl.trim()) return;

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: singleUrl })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");

      setAnalysisResult({
        ...data,
        url: singleUrl
      });
      setCustomFilename(data.title);
    } catch (err: any) {
      setAnalysisError(err.message || "An unexpected error occurred during URL parsing.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Enqueue parsed URL
  const handleEnqueueSingle = async () => {
    if (!analysisResult) return;

    try {
      const res = await fetch('/api/download/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: analysisResult.url,
          quality: selectedQuality,
          title: customFilename || analysisResult.title,
          uploader: analysisResult.uploader
        })
      });

      if (!res.ok) throw new Error("Failed to enqueue job");

      // Reset
      setSingleUrl('');
      setAnalysisResult(null);
      // Switch tab/scroll to queue
      const cockpitTab = document.getElementById('queue-section');
      if (cockpitTab) cockpitTab.scrollIntoView({ behavior: 'smooth' });
    } catch (err: any) {
      alert("Error adding video to queue: " + err.message);
    }
  };

  // Enqueue batch list
  const handleEnqueueBatch = async (e: FormEvent) => {
    e.preventDefault();
    const urls = batchUrls.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;

    setIsBatchAdding(true);

    try {
      for (const url of urls) {
        await fetch('/api/download/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            quality: batchQuality,
            title: url,
            uploader: "Batch Queue Input"
          })
        });
      }
      setBatchUrls('');
      alert(`Success: ${urls.length} URLs successfully added to the download queue!`);
    } catch (err: any) {
      alert("Error queueing batch links: " + err.message);
    } finally {
      setIsBatchAdding(false);
    }
  };

  // Delete/Cancel Queue item
  const handleCancelJob = async (id: string) => {
    try {
      await fetch(`/api/queue/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error("Failed to cancel job:", err);
    }
  };

  // Clear completed queue logs
  const handleClearQueueLogs = async () => {
    try {
      await fetch('/api/queue/clear', { method: 'POST' });
    } catch (err) {
      console.error("Failed to clear queue:", err);
    }
  };

  // Delete downloaded file
  const handleDeleteFile = async (name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;

    try {
      const res = await fetch(`/api/files/${name}`, { method: 'DELETE' });
      if (res.ok) {
        if (playingFile?.name === name) setPlayingFile(null);
        setFiles(prev => prev.filter(f => f.name !== name));
      }
    } catch (err) {
      console.error("Failed to delete file:", err);
    }
  };

  // Save changes to settings
  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setIsSavingSettings(true);
    try {
      const updated = {
        ...settings,
        cookies: cookiesText
      };

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });

      const data = await res.json();
      if (res.ok) {
        setSettings(data.settings);
        alert("Settings saved successfully!");
      }
    } catch (err) {
      alert("Failed to save settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Helper formats
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [
      h > 0 ? h : null,
      (h > 0 ? String(m).padStart(2, '0') : m),
      String(s).padStart(2, '0')
    ].filter(v => v !== null).join(':');
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-cyan-500/20 selection:text-cyan-300">
      
      {/* Dynamic Grid Background Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293708_1px,transparent_1px),linear-gradient(to_bottom,#1f293708_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      {/* Top Banner / Navigation */}
      <header className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col md:flex-row justify-between items-center gap-4">
          
          {/* Logo & Brand title */}
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-cyan-600 to-emerald-500 p-2 rounded-xl shadow-lg shadow-cyan-950/40">
              <Download className="w-6 h-6 text-neutral-950 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight bg-gradient-to-r from-white via-neutral-100 to-neutral-400 bg-clip-text text-transparent">
                Termux Video Downloader Pro
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="font-mono text-[10px] text-neutral-400 tracking-wider uppercase">
                  {isConnected ? 'Server Engine Live' : 'Server Offline'}
                </span>
              </div>
            </div>
          </div>

          {/* Core App Navigation Tabs */}
          <nav className="flex items-center bg-neutral-900 border border-neutral-800 p-1.5 rounded-xl">
            <button
              onClick={() => setActiveTab('cockpit')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${activeTab === 'cockpit' ? 'bg-cyan-500 text-neutral-950 font-bold shadow-md shadow-cyan-950/20' : 'text-neutral-400 hover:text-white'}`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Downloader Cockpit
            </button>
            <button
              onClick={() => setActiveTab('media')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${activeTab === 'media' ? 'bg-cyan-500 text-neutral-950 font-bold shadow-md shadow-cyan-950/20' : 'text-neutral-400 hover:text-white'}`}
            >
              <Folder className="w-3.5 h-3.5" />
              Saved Media ({files.length})
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${activeTab === 'settings' ? 'bg-cyan-500 text-neutral-950 font-bold shadow-md shadow-cyan-950/20' : 'text-neutral-400 hover:text-white'}`}
            >
              <Settings className="w-3.5 h-3.5" />
              Engine Options
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
        
        {/* Connection warning */}
        {!isConnected && (
          <div className="mb-6 bg-red-950/40 border border-red-800/80 px-4 py-3 rounded-xl flex items-center gap-3 text-red-300">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 animate-bounce" />
            <p className="text-sm font-medium">
              Connection issues detected. Ensure the server is running properly or reload the page.
            </p>
          </div>
        )}

        {/* Dynamic Status / Stats Bar */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl flex items-center gap-4">
            <div className="bg-cyan-950/80 p-3 rounded-xl border border-cyan-800/40">
              <Download className="w-5 h-5 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <p className="text-neutral-400 text-xs font-medium">Active Downloads</p>
              <p className="font-mono text-xl font-bold text-cyan-400 mt-0.5">
                {serverStats.activeDownloads}
              </p>
            </div>
          </div>
          
          <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl flex items-center gap-4">
            <div className="bg-emerald-950/80 p-3 rounded-xl border border-emerald-800/40">
              <Folder className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-neutral-400 text-xs font-medium">Completed Files</p>
              <p className="font-mono text-xl font-bold text-emerald-400 mt-0.5">
                {serverStats.totalFilesCount}
              </p>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl flex items-center gap-4">
            <div className="bg-yellow-950/80 p-3 rounded-xl border border-yellow-800/40">
              <Server className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-neutral-400 text-xs font-medium">Server Storage Used</p>
              <p className="font-mono text-xl font-bold text-yellow-400 mt-0.5">
                {serverStats.totalStorageUsed}
              </p>
            </div>
          </div>
        </section>

        {/* Tab Sections */}
        <AnimatePresence mode="wait">
          
          {/* TAB 1: COCKPIT */}
          {activeTab === 'cockpit' && (
            <motion.div
              key="cockpit"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="space-y-8"
            >
              {/* Single Downloader Input Card */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Section A: Analyzer & Single Job */}
                <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl shadow-xl shadow-black/40 space-y-6">
                  <div>
                    <h2 className="font-display text-lg font-bold flex items-center gap-2">
                      <Search className="w-5 h-5 text-cyan-400" />
                      Single Link Analyzer
                    </h2>
                    <p className="text-neutral-400 text-xs mt-1">
                      Paste a URL from YouTube, TikTok, Instagram, Twitter/X, etc. to scan formats.
                    </p>
                  </div>

                  <form onSubmit={handleAnalyze} className="flex gap-2">
                    <input
                      type="url"
                      placeholder="Paste single link here (e.g. https://www.youtube.com/...)"
                      value={singleUrl}
                      onChange={(e) => setSingleUrl(e.target.value)}
                      className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm font-mono text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                      disabled={isAnalyzing}
                    />
                    <button
                      type="submit"
                      disabled={isAnalyzing || !singleUrl.trim()}
                      className="bg-cyan-500 hover:bg-cyan-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950 text-xs font-bold px-5 rounded-xl transition-all flex items-center gap-2"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4" />
                          Analyze
                        </>
                      )}
                    </button>
                  </form>

                  {/* Analysis Result Card */}
                  <AnimatePresence>
                    {analysisError && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-red-950/30 border border-red-900/60 p-4 rounded-xl text-red-300 text-xs"
                      >
                        <p className="font-bold flex items-center gap-2 mb-1">
                          <X className="w-4 h-4" /> Error Analyzing URL
                        </p>
                        <p className="font-mono">{analysisError}</p>
                      </motion.div>
                    )}

                    {analysisResult && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl space-y-4"
                      >
                        {/* Video Metadata Panel */}
                        <div className="flex gap-4">
                          <div className="relative w-28 h-16 sm:w-36 sm:h-20 bg-neutral-900 rounded-lg overflow-hidden border border-neutral-800 flex-shrink-0">
                            {analysisResult.thumbnail ? (
                              <img
                                src={analysisResult.thumbnail}
                                alt={analysisResult.title}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <FileVideo className="w-6 h-6 text-neutral-600" />
                              </div>
                            )}
                            <div className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 rounded text-[10px] font-mono text-neutral-300">
                              {formatDuration(analysisResult.duration)}
                            </div>
                          </div>
                          
                          <div className="space-y-1">
                            <h3 className="font-display text-sm font-semibold text-neutral-100 line-clamp-2">
                              {analysisResult.title}
                            </h3>
                            <p className="text-[11px] text-neutral-400 flex items-center gap-1.5">
                              <Globe className="w-3 h-3 text-neutral-500" />
                              {analysisResult.uploader}
                            </p>
                            <p className="text-[11px] text-neutral-500">
                              Views: {analysisResult.view_count.toLocaleString()}
                            </p>
                          </div>
                        </div>

                        {/* File customization settings */}
                        <div className="space-y-3 pt-2 border-t border-neutral-900">
                          <div>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1.5">
                              Target Quality / Format
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(QUALITY_OPTIONS).map(([key, option]) => (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => setSelectedQuality(key)}
                                  className={`px-3 py-2 text-left text-xs rounded-lg border transition-all ${selectedQuality === key ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400 font-medium' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'}`}
                                >
                                  {option.name}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1.5">
                              Custom Filename (Optional)
                            </label>
                            <input
                              type="text"
                              value={customFilename}
                              onChange={(e) => setCustomFilename(e.target.value)}
                              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-medium text-neutral-200"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={handleEnqueueSingle}
                            className="w-full bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/20"
                          >
                            <Download className="w-4 h-4" />
                            Send to Active Download Queue
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Section B: Batch Multi-Link Downloader */}
                <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl shadow-xl shadow-black/40 flex flex-col justify-between">
                  <div>
                    <h2 className="font-display text-lg font-bold flex items-center gap-2">
                      <ListChecks className="w-5 h-5 text-emerald-400" />
                      Batch Video Queue (Multi-URL)
                    </h2>
                    <p className="text-neutral-400 text-xs mt-1">
                      Paste multiple URLs (one per line) to parse and download in parallel.
                    </p>
                  </div>

                  <form onSubmit={handleEnqueueBatch} className="space-y-4 mt-4 flex-1 flex flex-col justify-between">
                    <textarea
                      placeholder="https://youtube.com/watch?v=123&#10;https://tiktok.com/@user/video/456&#10;https://instagram.com/reel/789"
                      value={batchUrls}
                      onChange={(e) => setBatchUrls(e.target.value)}
                      rows={6}
                      className="w-full flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-xs font-mono text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all resize-none"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div>
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
                          Default Download Quality
                        </label>
                        <select
                          value={batchQuality}
                          onChange={(e) => setBatchQuality(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-300"
                        >
                          {Object.entries(QUALITY_OPTIONS).map(([key, opt]) => (
                            <option key={key} value={key}>{opt.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-end">
                        <button
                          type="submit"
                          disabled={isBatchAdding || !batchUrls.trim()}
                          className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950 font-bold py-2.5 rounded-lg text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/20"
                        >
                          {isBatchAdding ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Adding to Queue...
                            </>
                          ) : (
                            <>
                              <Plus className="w-4 h-4" />
                              Enqueue Batch Links
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>

              {/* SECTION C: ACTIVE DOWNLOAD QUEUE */}
              <div id="queue-section" className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl shadow-xl shadow-black/40 space-y-4">
                <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
                  <div>
                    <h2 className="font-display text-lg font-bold flex items-center gap-2">
                      <RefreshCw className="w-5 h-5 text-cyan-400" />
                      Active Download Queue ({queue.length})
                    </h2>
                    <p className="text-neutral-400 text-xs mt-0.5">
                      Jobs are executed concurrently based on limits. Live download speed is shown.
                    </p>
                  </div>

                  {queue.length > 0 && (
                    <button
                      onClick={handleClearQueueLogs}
                      className="text-neutral-400 hover:text-white text-xs flex items-center gap-1 bg-neutral-950 hover:bg-neutral-800 px-3 py-1.5 rounded-lg border border-neutral-800 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear Inactive Logs
                    </button>
                  )}
                </div>

                {queue.length === 0 ? (
                  <div className="text-center py-10 text-neutral-500 space-y-2">
                    <Download className="w-8 h-8 mx-auto stroke-1" />
                    <p className="text-sm">The download queue is currently empty.</p>
                    <p className="text-xs text-neutral-600">Analyze a link above to spin up a new download task.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {queue.map((job) => (
                      <div 
                        key={job.id} 
                        className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-neutral-700 transition-all"
                      >
                        {/* Title, Format, URL */}
                        <div className="space-y-1 max-w-xl">
                          <h4 className="font-display text-sm font-semibold text-neutral-200 line-clamp-1">
                            {job.title}
                          </h4>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                            <span className="text-cyan-400 bg-cyan-950/55 px-2 py-0.5 rounded border border-cyan-800/20">
                              {job.qualityName}
                            </span>
                            <span className="text-neutral-500 truncate max-w-xs">{job.url}</span>
                          </div>
                          {job.error && (
                            <p className="text-[10px] text-red-400 font-mono flex items-center gap-1 bg-red-950/10 p-1.5 rounded border border-red-900/10">
                              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                              {job.error}
                            </p>
                          )}
                        </div>

                        {/* Status, Speed & Progress Bars */}
                        <div className="flex items-center gap-4 w-full sm:w-auto flex-shrink-0">
                          <div className="text-right space-y-1 flex-1 sm:flex-initial">
                            <div className="flex items-center justify-between sm:justify-end gap-2 text-xs">
                              {/* Status Pill */}
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                job.status === 'completed' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40' :
                                job.status === 'failed' ? 'bg-red-950 text-red-400 border border-red-800/40' :
                                job.status === 'downloading' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/40 animate-pulse' :
                                'bg-neutral-800 text-neutral-400 border border-neutral-700'
                              }`}>
                                {job.status}
                              </span>

                              {job.status === 'downloading' && (
                                <span className="font-mono text-neutral-400 text-[11px]">
                                  {job.speed} • {job.eta} ETA
                                </span>
                              )}
                            </div>

                            {/* Progress bar */}
                            {(job.status === 'downloading' || job.status === 'completed') && (
                              <div className="w-full sm:w-48 h-2 bg-neutral-900 rounded-full overflow-hidden mt-1.5">
                                <div 
                                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-300" 
                                  style={{ width: `${job.progress}%` }}
                                />
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => handleCancelJob(job.id)}
                            className="text-neutral-500 hover:text-red-400 p-2 hover:bg-neutral-900 rounded-xl transition-all"
                            title={job.status === 'downloading' ? 'Cancel active download' : 'Remove log'}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB 2: COMPLETED MEDIA */}
          {activeTab === 'media' && (
            <motion.div
              key="media"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="space-y-8"
            >
              {/* Media Player Showcase */}
              <AnimatePresence>
                {playingFile && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl shadow-xl shadow-black/40 space-y-4 overflow-hidden"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-[10px] bg-cyan-950 text-cyan-400 px-2.5 py-1 rounded-full uppercase tracking-wider font-bold">
                          Now Playing / Streaming
                        </span>
                        <h3 className="font-display text-base font-semibold text-neutral-100 mt-2 line-clamp-1">
                          {playingFile.name}
                        </h3>
                      </div>
                      <button
                        onClick={() => setPlayingFile(null)}
                        className="text-neutral-500 hover:text-white p-2 hover:bg-neutral-800 rounded-xl transition-all"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="bg-black rounded-2xl overflow-hidden border border-neutral-800 max-h-[480px] flex items-center justify-center relative">
                      {playingFile.type === 'video' ? (
                        <video
                          src={`/api/stream/${encodeURIComponent(playingFile.name)}`}
                          controls
                          autoPlay
                          className="w-full max-h-[450px]"
                        />
                      ) : (
                        <div className="w-full p-10 flex flex-col items-center justify-center space-y-4 bg-gradient-to-b from-neutral-900 to-neutral-950">
                          <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 shadow-inner">
                            <Volume2 className="w-8 h-8 text-cyan-400 animate-bounce" />
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-neutral-400">Audio Extracted Stream</p>
                            <p className="text-xs font-mono text-neutral-500 mt-1">{playingFile.sizeFormatted}</p>
                          </div>
                          <audio
                            src={`/api/stream/${encodeURIComponent(playingFile.name)}`}
                            controls
                            autoPlay
                            className="w-full max-w-md"
                          />
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* List of Downloaded Files */}
              <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl shadow-xl shadow-black/40 space-y-4">
                <div>
                  <h2 className="font-display text-lg font-bold flex items-center gap-2">
                    <Folder className="w-5 h-5 text-emerald-400" />
                    Downloaded Media Explorer
                  </h2>
                  <p className="text-neutral-400 text-xs mt-1">
                    Play, stream, or download your captured media files directly to this device.
                  </p>
                </div>

                {files.length === 0 ? (
                  <div className="text-center py-12 text-neutral-500 space-y-2">
                    <Folder className="w-10 h-10 mx-auto stroke-1" />
                    <p className="text-sm">No downloaded files found on the server.</p>
                    <p className="text-xs text-neutral-600">Downloads will show up here once complete.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {files.map((file) => (
                      <div 
                        key={file.name}
                        className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl hover:border-neutral-700 transition-all group flex flex-col justify-between h-40"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            {file.type === 'video' ? (
                              <FileVideo className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                            ) : file.type === 'audio' ? (
                              <FileAudio className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            ) : (
                              <FileText className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                            )}
                            <span className="font-mono text-[10px] text-neutral-400 uppercase tracking-wider">
                              {file.type}
                            </span>
                          </div>

                          <h4 className="text-xs font-semibold text-neutral-200 line-clamp-2 break-all" title={file.name}>
                            {file.name}
                          </h4>
                        </div>

                        <div className="flex items-center justify-between border-t border-neutral-900 pt-3 mt-auto">
                          <span className="font-mono text-[10px] text-neutral-500">
                            {file.sizeFormatted}
                          </span>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setPlayingFile(file)}
                              className="text-cyan-400 hover:text-neutral-950 bg-cyan-950 hover:bg-cyan-400 p-2 rounded-lg transition-all border border-cyan-800/30"
                              title="Play / Stream"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                            <a
                              href={`/api/download-file/${encodeURIComponent(file.name)}`}
                              className="text-emerald-400 hover:text-neutral-950 bg-emerald-950 hover:bg-emerald-400 p-2 rounded-lg transition-all border border-emerald-800/30 flex items-center justify-center"
                              title="Save to Device"
                              download
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                            <button
                              onClick={() => handleDeleteFile(file.name)}
                              className="text-red-400 hover:text-white hover:bg-red-950/60 p-2 rounded-lg transition-all"
                              title="Delete from server"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB 3: ENGINE SETTINGS */}
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="max-w-3xl mx-auto"
            >
              {settings ? (
                <form onSubmit={handleSaveSettings} className="bg-neutral-900 border border-neutral-800 p-6 sm:p-8 rounded-3xl shadow-xl shadow-black/40 space-y-6">
                  <div>
                    <h2 className="font-display text-lg font-bold flex items-center gap-2">
                      <Settings className="w-5 h-5 text-cyan-400" />
                      Engine Configuration & Guard
                    </h2>
                    <p className="text-neutral-400 text-xs mt-1">
                      Customize yt-dlp parameters to bypass rate limits, blockages, or configure download threads.
                    </p>
                  </div>

                  {/* General Config */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-neutral-800 pt-4">
                    <div>
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
                        Default Download Quality
                      </label>
                      <select
                        value={settings.defaultQuality}
                        onChange={(e) => setSettings({ ...settings, defaultQuality: e.target.value })}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-300"
                      >
                        {Object.entries(QUALITY_OPTIONS).map(([key, opt]) => (
                          <option key={key} value={key}>{opt.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
                        Max Concurrent Downloads
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={settings.concurrentLimit}
                        onChange={(e) => setSettings({ ...settings, concurrentLimit: parseInt(e.target.value) || 2 })}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-300"
                      />
                    </div>
                  </div>

                  {/* Anti block / proxies */}
                  <div className="space-y-4 pt-4 border-t border-neutral-800">
                    <h3 className="font-display text-sm font-semibold flex items-center gap-2">
                      <Globe className="w-4 h-4 text-cyan-400" />
                      Ultra Anti-Block Protection
                    </h3>

                    {/* Active proxy input */}
                    <div>
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1.5">
                        Active Proxy URL (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="http://username:password@proxyhost:port"
                        value={settings.activeProxy || ''}
                        onChange={(e) => setSettings({ ...settings, activeProxy: e.target.value || null })}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-xs font-mono text-neutral-300 placeholder-neutral-700"
                      />
                      <p className="text-[10px] text-neutral-500 mt-1">
                        Applies proxy bypass for both metadata analysis and download requests.
                      </p>
                    </div>

                    {/* Rotate user agents */}
                    <div className="flex items-center justify-between p-3.5 bg-neutral-950 border border-neutral-800 rounded-xl">
                      <div className="space-y-0.5">
                        <label className="text-xs font-bold text-neutral-200">
                          Rotate User-Agent Headers
                        </label>
                        <p className="text-[10px] text-neutral-500">
                          Rotates browser user agents randomly for each request to simulate real device visits.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.rotateUserAgents}
                        onChange={(e) => setSettings({ ...settings, rotateUserAgents: e.target.checked })}
                        className="w-4 h-4 rounded text-cyan-500 bg-neutral-950 border-neutral-800 focus:ring-0 focus:ring-offset-0"
                      />
                    </div>
                  </div>

                  {/* Cookies Panel */}
                  <div className="space-y-3 pt-4 border-t border-neutral-800">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-sm font-semibold flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        Netscape cookiefile (.txt) bypass
                      </h3>
                      <input
                        type="checkbox"
                        checked={settings.useCookies}
                        onChange={(e) => setSettings({ ...settings, useCookies: e.target.checked })}
                        className="w-4 h-4 rounded text-cyan-500 bg-neutral-950 border-neutral-800 focus:ring-0"
                      />
                    </div>
                    <p className="text-neutral-400 text-xs">
                      Paste the text content of your Netscape format cookies file here. Required for age-restricted, paid, or private video extraction.
                    </p>
                    <textarea
                      placeholder="# Netscape HTTP Cookie File&#10;.youtube.com&#10;.tiktok.com"
                      value={cookiesText}
                      onChange={(e) => setCookiesText(e.target.value)}
                      rows={4}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs font-mono text-neutral-300 placeholder-neutral-700 focus:outline-none resize-none"
                    />
                  </div>

                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={isSavingSettings}
                      className="w-full bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold py-3 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/25"
                    >
                      {isSavingSettings ? (
                        <>
                          <Loader2 className="w-4.5 h-4.5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="w-4.5 h-4.5" />
                          Save Settings Configuration
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="text-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-cyan-400" />
                  <p className="text-xs text-neutral-500 mt-2">Loading engine settings...</p>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </main>
      
      {/* Footer footer information */}
      <footer className="mt-20 border-t border-neutral-900 bg-neutral-950/40 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:text-left flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-neutral-500">
          <p className="font-mono">
            © 2026 Termux Downloader Pro Web Edition. Designed with desktop precision.
          </p>
          <div className="flex items-center gap-4 font-mono">
            <span className="flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5" /> Engine: Standalone yt-dlp Linux64
            </span>
            <span className="flex items-center gap-1">
              <Volume2 className="w-3.5 h-3.5" /> Converter: FFmpeg Core 4.4.2
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}
