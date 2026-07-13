heremport express from "express";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { AppSettings, DownloadJob, DownloadedFile, QUALITY_OPTIONS } from "./src/types.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// In Render, we should use a persistent disk or /tmp for writing
const DOWNLOADS_DIR = process.env.RENDER_DISK_MOUNT_PATH 
  ? path.join(process.env.RENDER_DISK_MOUNT_PATH) 
  : path.join(process.cwd(), 'downloads');

// yt-dlp path: try to use /tmp if we can't write to the project root
const YTDLP_PATH = process.env.RENDER ? path.join('/tmp', 'yt-dlp') : path.join(process.cwd(), 'yt-dlp');
const CONFIG_PATH = path.join(DOWNLOADS_DIR, 'config.json');

// Ensure downloads directory exists
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// Default Configuration
const DEFAULT_SETTINGS: AppSettings = {
  proxies: [
    "http://127.0.0.1:8080",
  ],
  activeProxy: null,
  cookies: "",
  useCookies: false,
  userAgents: [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"
  ],
  rotateUserAgents: true,
  defaultQuality: "1",
  concurrentLimit: 2
};

// Settings Helper Functions
function getSettings(): AppSettings {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const loaded = JSON.parse(data);
      return { ...DEFAULT_SETTINGS, ...loaded };
    }
  } catch (e) {
    console.error("Error reading config:", e);
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: AppSettings) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (e) {
    console.error("Error saving config:", e);
  }
}

// Download Yt-Dlp if not exists
async function ensureYtDlp() {
  if (!fs.existsSync(YTDLP_PATH)) {
    console.log(`yt-dlp not found at ${YTDLP_PATH}. Downloading standalone binary...`);
    const url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
    try {
      const { execSync } = await import("child_process");
      execSync(`curl -L ${url} -o "${YTDLP_PATH}" && chmod +x "${YTDLP_PATH}"`);
      console.log("yt-dlp binary downloaded and made executable successfully!");
    } catch (err: any) {
      console.error("Critical error downloading yt-dlp standalone binary:", err.message);
    }
  } else {
    console.log("yt-dlp binary is already present.");
  }
}

// Start-up tasks
ensureYtDlp();

// Download State Managers
let downloadQueue: DownloadJob[] = [];
const activeProcesses = new Map<string, any>();
let activeDownloadsCount = 0;

// Format Bytes Helper
function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Queue Processor Scheduler
function processQueue() {
  const settings = getSettings();
  const limit = settings.concurrentLimit || 2;

  if (activeDownloadsCount >= limit) return;

  const nextJob = downloadQueue.find(job => job.status === 'pending');
  if (!nextJob) return;

  activeDownloadsCount++;
  runDownloadJob(nextJob);
}

// Process a Single Download Job
function runDownloadJob(job: DownloadJob) {
  job.status = 'downloading';
  job.progress = 0;
  job.speed = '0 B/s';
  job.eta = '--:--';

  const settings = getSettings();
  const option = QUALITY_OPTIONS[job.quality] || QUALITY_OPTIONS["1"];

  // Build command args
  const args: string[] = [
    "-f", option.format,
    "--no-warnings",
    "--newline",
    "-o", path.join(DOWNLOADS_DIR, `%(title)s.%(ext)s`),
  ];

  // Rotate user agent
  if (settings.rotateUserAgents && settings.userAgents.length > 0) {
    const randomUA = settings.userAgents[Math.floor(Math.random() * settings.userAgents.length)];
    args.push("--user-agent", randomUA);
  }

  // Set cookies
  if (settings.useCookies && settings.cookies) {
    const cookiesPath = path.join(process.cwd(), 'cookies.txt');
    fs.writeFileSync(cookiesPath, settings.cookies, 'utf-8');
    args.push("--cookiefile", cookiesPath);
  }

  // Set proxy
  if (settings.activeProxy) {
    args.push("--proxy", settings.activeProxy);
  }

  // Quality arguments (e.g., extract audio)
  if (option.args) {
    args.push(...option.args);
  }

  args.push(job.url);

  console.log(`[Queue] Running job ${job.id} for: ${job.url}`);
  
  const child = spawn(YTDLP_PATH, args);
  activeProcesses.set(job.id, child);

  let stdoutBuffer = "";

  child.stdout.on('data', (data) => {
    const text = data.toString();
    stdoutBuffer += text;

    const lines = text.split('\n');
    for (const line of lines) {
      const cleanLine = line.trim();

      if (cleanLine.startsWith('[download]') && cleanLine.includes('%')) {
        const percentMatch = cleanLine.match(/(\d+(?:\.\d+)?)%/);
        if (percentMatch) {
          job.progress = parseFloat(percentMatch[1]);
        }

        const speedMatch = cleanLine.match(/at\s+(\S+)/);
        if (speedMatch) {
          job.speed = speedMatch[1];
        }

        const etaMatch = cleanLine.match(/ETA\s+(\S+)/);
        if (etaMatch) {
          job.eta = etaMatch[1];
        }
      }

      // Capture resulting filename
      if (cleanLine.includes('Destination:') || cleanLine.includes('Merging formats into')) {
        let matchedFile = "";
        const destMatch = cleanLine.match(/Destination:\s*(.+)$/);
        const mergeMatch = cleanLine.match(/Merging formats into\s*"?([^"\n]+)"?/);

        if (destMatch) matchedFile = destMatch[1].trim();
        else if (mergeMatch) matchedFile = mergeMatch[1].trim();

        if (matchedFile) {
          const parsed = path.parse(matchedFile);
          job.filename = parsed.base;
          job.filePath = path.join(DOWNLOADS_DIR, parsed.base);
        }
      }
    }
  });

  child.stderr.on('data', (data) => {
    console.error(`[Job ${job.id} Error]`, data.toString());
  });

  child.on('close', (code) => {
    activeDownloadsCount = Math.max(0, activeDownloadsCount - 1);
    activeProcesses.delete(job.id);

    if (code === 0) {
      job.status = 'completed';
      job.progress = 100;
      job.speed = 'Completed';
      job.eta = '00:00';

      // Fallback: search file in folder if filename wasn't captured on stdout stream
      if (!job.filename) {
        try {
          const files = fs.readdirSync(DOWNLOADS_DIR);
          const ext = option.ext;
          const matched = files.find(f => f.endsWith(`.${ext}`) && (f.toLowerCase().includes(job.title.toLowerCase().substring(0, 10)) || f.toLowerCase().includes("video")));
          if (matched) {
            job.filename = matched;
            job.filePath = path.join(DOWNLOADS_DIR, matched);
          } else {
            // Find most recently modified file of that extension
            let newestFile = "";
            let newestMtime = 0;
            for (const file of files) {
              if (file.endsWith(`.${ext}`) && file !== 'config.json') {
                const stat = fs.statSync(path.join(DOWNLOADS_DIR, file));
                if (stat.mtimeMs > newestMtime) {
                  newestMtime = stat.mtimeMs;
                  newestFile = file;
                }
              }
            }
            if (newestFile) {
              job.filename = newestFile;
              job.filePath = path.join(DOWNLOADS_DIR, newestFile);
            }
          }
        } catch (e) {
          console.error("Error finding fallback file path:", e);
        }
      }
    } else {
      job.status = 'failed';
      const errors = stdoutBuffer.split('\n').filter(l => l.toLowerCase().includes('error'));
      job.error = errors.length > 0 ? errors[errors.length - 1].trim() : `Failed to download. Exit code ${code}`;
    }

    processQueue();
  });
}

// --------------------------------------------------------
// API ENDPOINTS
// --------------------------------------------------------

// Settings Get
app.get('/api/settings', (req, res) => {
  res.json(getSettings());
});

// Settings Update
app.post('/api/settings', (req, res) => {
  const updated = req.body;
  const current = getSettings();
  const merged = { ...current, ...updated };
  saveSettings(merged);
  res.json({ success: true, settings: merged });
});

// Analyze URL Meta
app.post('/api/analyze', (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  const settings = getSettings();
  const args = ["-J", "--no-playlist"];

  if (settings.useCookies && settings.cookies) {
    const cookiesPath = path.join(process.cwd(), 'cookies.txt');
    fs.writeFileSync(cookiesPath, settings.cookies, 'utf-8');
    args.push("--cookiefile", cookiesPath);
  }

  if (settings.activeProxy) {
    args.push("--proxy", settings.activeProxy);
  }

  args.push(url);

  console.log(`[Analysis] Running analyze on: ${url}`);
  const cp = spawn(YTDLP_PATH, args);

  let stdout = "";
  let stderr = "";

  cp.stdout.on('data', (d) => stdout += d.toString());
  cp.stderr.on('data', (d) => stderr += d.toString());

  cp.on('close', (code) => {
    if (code === 0) {
      try {
        const info = JSON.parse(stdout);
        res.json({
          title: info.title || "Unknown Title",
          uploader: info.uploader || "Unknown Uploader",
          thumbnail: info.thumbnail || info.thumbnails?.[0]?.url || "",
          duration: info.duration || 0,
          view_count: info.view_count || 0,
        });
      } catch (e: any) {
        res.status(500).json({ error: "Failed to parse metadata", details: e.message });
      }
    } else {
      console.error("[Analysis Error]", stderr);
      res.status(400).json({ error: "Could not fetch video information. Ensure the link is valid and try again.", details: stderr.trim() });
    }
  });
});

// Enqueue downloads
app.post('/api/download/enqueue', (req, res) => {
  const { url, quality, title, uploader } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  const id = Math.random().toString(36).substring(2, 11);
  const selectedQuality = quality || "1";
  const option = QUALITY_OPTIONS[selectedQuality] || QUALITY_OPTIONS["1"];

  const newJob: DownloadJob = {
    id,
    url,
    title: title || "Pending Details Fetch...",
    uploader: uploader || "Extracting uploader...",
    status: 'pending',
    progress: 0,
    speed: '0 B/s',
    eta: '--:--',
    quality: selectedQuality,
    qualityName: option.name,
    filename: "",
    fileSize: "Calculating size...",
    addedAt: Date.now()
  };

  downloadQueue.push(newJob);
  res.json({ success: true, job: newJob });

  processQueue();
});

// Get queue list
app.get('/api/queue', (req, res) => {
  res.json(downloadQueue);
});

// Delete item from queue (Cancel download)
app.delete('/api/queue/:id', (req, res) => {
  const { id } = req.params;
  const index = downloadQueue.findIndex(job => job.id === id);

  if (index !== -1) {
    const job = downloadQueue[index];
    const child = activeProcesses.get(id);

    if (child) {
      console.log(`[Queue] Terminating active download process for job: ${id}`);
      child.kill('SIGINT');
      activeProcesses.delete(id);
    }

    downloadQueue.splice(index, 1);
    res.json({ success: true });
    
    // Process next item
    processQueue();
  } else {
    res.status(404).json({ error: "Job not found in queue" });
  }
});

// Clear processed queue
app.post('/api/queue/clear', (req, res) => {
  downloadQueue = downloadQueue.filter(
    job => job.status === 'downloading' || job.status === 'pending'
  );
  res.json({ success: true, queue: downloadQueue });
});

// List Downloaded Files
app.get('/api/files', (req, res) => {
  try {
    if (!fs.existsSync(DOWNLOADS_DIR)) {
      return res.json([]);
    }

    const files = fs.readdirSync(DOWNLOADS_DIR);
    const fileList: DownloadedFile[] = files
      .filter(file => file !== 'config.json' && !file.startsWith('.'))
      .map(file => {
        const filePath = path.join(DOWNLOADS_DIR, file);
        const stat = fs.statSync(filePath);
        const ext = path.extname(file).toLowerCase();
        
        let type: 'video' | 'audio' | 'unknown' = 'unknown';
        if (['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.m4v'].includes(ext)) {
          type = 'video';
        } else if (['.mp3', '.m4a', '.wav', '.opus', '.aac', '.ogg', '.flac'].includes(ext)) {
          type = 'audio';
        }

        return {
          name: file,
          size: stat.size,
          sizeFormatted: formatBytes(stat.size),
          type,
          createdAt: stat.birthtimeMs || stat.mtimeMs,
          filePath
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    res.json(fileList);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to read downloaded files directory", details: e.message });
  }
});

// Delete specific file
app.delete('/api/files/:filename', (req, res) => {
  const { filename } = req.params;
  const targetPath = path.join(DOWNLOADS_DIR, filename);

  try {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      res.json({ success: true, message: `File deleted successfully` });
    } else {
      res.status(404).json({ error: "File not found on server" });
    }
  } catch (e: any) {
    res.status(500).json({ error: "Failed to delete file", details: e.message });
  }
});

// Stream Video/Audio (Supports Seek and Scrub)
app.get('/api/stream/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(DOWNLOADS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(filename).toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === '.mp4') contentType = 'video/mp4';
  else if (ext === '.webm') contentType = 'video/webm';
  else if (ext === '.mkv') contentType = 'video/x-matroska';
  else if (ext === '.mp3') contentType = 'audio/mpeg';
  else if (ext === '.m4a') contentType = 'audio/mp4';
  else if (ext === '.opus') contentType = 'audio/ogg';
  else if (ext === '.wav') contentType = 'audio/wav';

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
      return;
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// Trigger browser download for a completed file
app.get('/api/download-file/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(DOWNLOADS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  res.download(filePath, filename, (err) => {
    if (err) {
      console.error("Error delivering browser download download:", err);
    }
  });
});

// --------------------------------------------------------
// VITE CLIENT INTEGRATION
// --------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
