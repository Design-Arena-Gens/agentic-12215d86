"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

type ScalePreset = "2x" | "3x" | "4x" | "720p" | "1080p" | "4k";

const CORE_VERSION = "0.12.6";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

export default function HomePage() {
  const [ffmpeg, setFfmpeg] = useState<FFmpeg | null>(null);
  const [loadingCore, setLoadingCore] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [inputUrl, setInputUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<string>("");
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [scale, setScale] = useState<ScalePreset>("2x");
  const [algo, setAlgo] = useState<string>("lanczos");
  const [crf, setCrf] = useState<number>(20);
  const [preset, setPreset] = useState<string>("medium");
  const [processing, setProcessing] = useState(false);

  const inputVideoRef = useRef<HTMLVideoElement>(null);
  const outputVideoRef = useRef<HTMLVideoElement>(null);

  // Initialize ffmpeg once on client
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (ffmpeg || loadingCore) return;
      try {
        setLoadingCore(true);
        const instance = new FFmpeg();
        instance.on("progress", ({ progress }) => {
          setProgress(Math.round(progress * 100));
        });
        instance.on("log", ({ message }) => {
          setStatus(message);
        });
        await instance.load({
          coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
          workerURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.worker.js`, "text/javascript"),
        });
        if (!cancelled) setFfmpeg(instance);
      } catch (e) {
        console.error(e);
        if (!cancelled) setStatus("Failed to load ffmpeg core");
      } finally {
        if (!cancelled) setLoadingCore(false);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [ffmpeg, loadingCore]);

  // Revoke URLs on unmount or change
  useEffect(() => {
    return () => {
      if (inputUrl) URL.revokeObjectURL(inputUrl);
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, [inputUrl, outputUrl]);

  const handleFile = (f: File | null) => {
    setOutputUrl(null);
    setProgress(0);
    setStatus("");
    setFile(f);
    if (inputUrl) URL.revokeObjectURL(inputUrl);
    if (f) setInputUrl(URL.createObjectURL(f));
    else setInputUrl(null);
  };

  const buildScaleFilter = (w: number, h: number): string => {
    const flags = `flags=${algo}`;
    switch (scale) {
      case "2x":
        return `scale=iw*2:ih*2:${flags}`;
      case "3x":
        return `scale=iw*3:ih*3:${flags}`;
      case "4x":
        return `scale=iw*4:ih*4:${flags}`;
      case "720p":
        return `scale='trunc(oh*a/2)*2':720:${flags}`;
      case "1080p":
        return `scale='trunc(oh*a/2)*2':1080:${flags}`;
      case "4k":
        return `scale=3840:2160:${flags}`;
      default:
        return `scale=iw*2:ih*2:${flags}`;
    }
  };

  const upscale = async () => {
    if (!ffmpeg || !file) return;
    setProcessing(true);
    setProgress(0);
    setStatus("Preparing...");

    try {
      // Size guard to avoid exhausting memory in browser
      const maxBytes = 300 * 1024 * 1024; // 300MB
      if (file.size > maxBytes) {
        throw new Error("File too large. Please use a file under 300MB.");
      }

      // Determine input dimensions if possible
      let inW = 0, inH = 0;
      if (inputVideoRef.current?.videoWidth) {
        inW = inputVideoRef.current.videoWidth;
        inH = inputVideoRef.current.videoHeight;
      }

      const scaleFilter = buildScaleFilter(inW, inH);

      await ffmpeg.writeFile("input", await fetchFile(file));

      const args = [
        "-i", "input",
        "-vf", scaleFilter,
        "-c:v", "libx264",
        "-preset", preset,
        "-crf", String(crf),
        "-c:a", "copy",
        "-movflags", "+faststart",
        "output.mp4",
      ];

      setStatus("Upscaling...");
      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile("output.mp4");
      const blob = new Blob([data as Uint8Array], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      setOutputUrl(url);
      setStatus("Done");
    } catch (err: any) {
      console.error(err);
      setStatus(err?.message || "Upscaling failed");
    } finally {
      setProcessing(false);
    }
  };

  const disabled = !ffmpeg || loadingCore || !file || processing;

  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)',
      color: '#e5e7eb'
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 20px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Video Upscaler</h1>
        <p style={{ opacity: 0.8, marginBottom: 24 }}>
          Upscale your videos directly in the browser using ffmpeg.wasm. No uploads required.
        </p>

        <section style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 20
        }}>
          <label htmlFor="file" style={{ display: 'block', marginBottom: 12, fontWeight: 600 }}>1) Choose a video</label>
          <input
            id="file"
            type="file"
            accept="video/*"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            style={{ display: 'block', marginBottom: 12 }}
          />
          {inputUrl && (
            <video ref={inputVideoRef} src={inputUrl} controls style={{ maxWidth: '100%', borderRadius: 8 }} />
          )}
        </section>

        <section style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 20
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Scale</label>
              <select value={scale} onChange={(e) => setScale(e.target.value as ScalePreset)} style={selectStyle}>
                <option value="2x">2x</option>
                <option value="3x">3x</option>
                <option value="4x">4x</option>
                <option value="720p">720p (HD)</option>
                <option value="1080p">1080p (Full HD)</option>
                <option value="4k">4K (2160p)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Algorithm</label>
              <select value={algo} onChange={(e) => setAlgo(e.target.value)} style={selectStyle}>
                <option value="lanczos">lanczos (sharpest)</option>
                <option value="bicubic">bicubic</option>
                <option value="bilinear">bilinear (fast)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Quality (CRF)</label>
              <input type="range" min={16} max={30} value={crf} onChange={(e) => setCrf(Number(e.target.value))} style={{ width: '100%' }} />
              <div style={{ fontSize: 12, opacity: 0.8 }}>CRF: {crf} (lower is better)</div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Speed preset</label>
              <select value={preset} onChange={(e) => setPreset(e.target.value)} style={selectStyle}>
                <option value="ultrafast">ultrafast</option>
                <option value="superfast">superfast</option>
                <option value="veryfast">veryfast</option>
                <option value="faster">faster</option>
                <option value="fast">fast</option>
                <option value="medium">medium</option>
                <option value="slow">slow</option>
                <option value="slower">slower</option>
                <option value="veryslow">veryslow</option>
              </select>
            </div>
          </div>
          <button onClick={upscale} disabled={disabled} style={buttonStyle(disabled)}>
            {processing ? 'Upscaling?' : 'Start Upscaling'}
          </button>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace', fontSize: 12, opacity: 0.9, wordBreak: 'break-word' }}>{status}</div>
            {(processing || progress > 0) && (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.12)', borderRadius: 999 }}>
                  <div style={{ width: `${progress}%`, height: 8, background: '#22c55e', borderRadius: 999, transition: 'width 0.2s ease' }} />
                </div>
                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>{progress}%</div>
              </div>
            )}
          </div>
        </section>

        {outputUrl && (
          <section style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: 20,
            marginBottom: 20
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 0 }}>Result</h2>
            <video ref={outputVideoRef} src={outputUrl} controls style={{ maxWidth: '100%', borderRadius: 8 }} />
            <div style={{ marginTop: 12 }}>
              <a href={outputUrl} download={`upscaled-${file?.name?.replace(/\.[^/.]+$/, '') || 'video'}.mp4`} style={linkButtonStyle}>Download Upscaled Video</a>
            </div>
          </section>
        )}

        <footer style={{ opacity: 0.6, fontSize: 12 }}>
          Processing happens locally in your browser. Large files may take time depending on your device.
        </footer>
      </div>
    </main>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  background: 'rgba(0,0,0,0.25)',
  color: '#e5e7eb',
  border: '1px solid rgba(255,255,255,0.12)'
};

const buttonStyle = (disabled: boolean): React.CSSProperties => ({
  marginTop: 16,
  display: 'inline-block',
  background: disabled ? 'rgba(255,255,255,0.12)' : 'linear-gradient(90deg,#22c55e,#16a34a)',
  color: '#0b1020',
  fontWeight: 800,
  border: 'none',
  padding: '12px 16px',
  borderRadius: 12,
  cursor: disabled ? 'not-allowed' : 'pointer'
});

const linkButtonStyle: React.CSSProperties = {
  display: 'inline-block',
  background: 'linear-gradient(90deg,#60a5fa,#3b82f6)',
  color: '#0b1020',
  fontWeight: 800,
  textDecoration: 'none',
  padding: '12px 16px',
  borderRadius: 12
};
