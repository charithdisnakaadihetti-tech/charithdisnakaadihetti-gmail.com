import React, { useState, useEffect, useRef } from "react";
import {
  Radio,
  FileAudio,
  Activity,
  Camera,
  Layers,
  Sparkles,
  RefreshCw,
  Power,
  Volume2,
  VolumeX,
  Play,
  Square,
  Zap,
  Trash2,
  AlertTriangle,
  Info,
  ChevronRight,
  ShieldAlert,
  HelpCircle,
  Video,
  Lightbulb,
  Cpu
} from "lucide-react";
import { DetectorMode, EvpRecord, GhostBoxResult, CameraAnalysisResult } from "./types";

// Standard simulated words used by Ghost Radio sweep
const SWEEP_WORDS = [
  "COLD", "DARK", "WHO", "STATION", "TIME", "SEVEN", "WATER", "LOST",
  "BEHIND", "SHADOW", "ECHO", "REST", "RUN", "FIRE", "CLOCK", "STONE",
  "UNDER", "WATCH", "VOICE", "SPIRIT", "HERE", "LEAVE", "HELP", "MINE"
];

export default function App() {
  // Device Core States
  const [devicePower, setDevicePower] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<DetectorMode>("EMF");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  
  // Custom Settings
  const [baselineEmf, setBaselineEmf] = useState<number>(31.4);
  const [calibrationOffset, setCalibrationOffset] = useState<number>(0);
  const [radarSweepSpeed, setRadarSweepSpeed] = useState<number>(1); // Dynamic indicator
  
  // EMF Metrics Source State
  const [currentEmf, setCurrentEmf] = useState<number>(31.4);
  const [peakEmf, setPeakEmf] = useState<number>(31.4);
  const [emfHistory, setEmfHistory] = useState<number[]>(Array(50).fill(31.4));
  const [emfSurgeMode, setEmfSurgeMode] = useState<"CALM" | "FLUTTER" | "HIGH_SURGE">("FLUTTER");
  
  // EVP Recording States
  const [isRecordingEvp, setIsRecordingEvp] = useState<boolean>(false);
  const [evpTimer, setEvpTimer] = useState<number>(0);
  const [lastSavedEvp, setLastSavedEvp] = useState<EvpRecord | null>(null);
  const [evpHistory, setEvpHistory] = useState<EvpRecord[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  
  // Ghost Box Sweep States
  const [isSweepingRadio, setIsSweepingRadio] = useState<boolean>(false);
  const [sweepRateHz, setSweepRateHz] = useState<number>(12); // steps/sec
  const [currentRadioFrequency, setCurrentRadioFrequency] = useState<number>(87.5);
  const [spottedSweepWords, setSpottedSweepWords] = useState<string[]>([]);
  const [spiritBoxTranslation, setSpiritBoxTranslation] = useState<GhostBoxResult | null>(null);
  const [translationLoading, setTranslationLoading] = useState<boolean>(false);
  const [scanHistoryLog, setScanHistoryLog] = useState<GhostBoxResult[]>([]);

  // Camera States
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraFilter, setCameraFilter] = useState<"THERMAL" | "NIGHT_VISION" | "SPECTRAL_IR">("NIGHT_VISION");
  const [cameraOverlayOn, setCameraOverlayOn] = useState<boolean>(true);
  const [flashlightSimulated, setFlashlightSimulated] = useState<boolean>(false);
  const [flashlightRealActive, setFlashlightRealActive] = useState<boolean>(false);
  const [cameraPicProcessing, setCameraPicProcessing] = useState<boolean>(false);
  const [lastCameraAnalysis, setLastCameraAnalysis] = useState<CameraAnalysisResult | null>(null);
  const [cameraPermissionError, setCameraPermissionError] = useState<boolean>(false);

  // Help Overlay Dialog
  const [showConfigHelp, setShowConfigHelp] = useState<boolean>(false);

  // References
  const canvasEmfRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRecordingRef = useRef<HTMLCanvasElement | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const photoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Web Audio Synth References
  const audioContextRef = useRef<AudioContext | null>(null);
  const roomThrumOscRef = useRef<OscillatorNode | null>(null);
  const radarHumRef = useRef<OscillatorNode | null>(null);
  const noiseNodeRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);
  const staticGainRef = useRef<GainNode | null>(null);
  const clicksGainRef = useRef<GainNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const animateRef = useRef<number | null>(null);

  // Load records from localStorage on initial mount
  useEffect(() => {
    try {
      const savedEvps = localStorage.getItem("paranormal_evp_history");
      if (savedEvps) {
        setEvpHistory(JSON.parse(savedEvps));
      }
      const savedBox = localStorage.getItem("paranormal_box_history");
      if (savedBox) {
        setScanHistoryLog(JSON.parse(savedBox));
      }
    } catch (e) {
      console.error("Failed to restore history", e);
    }
  }, []);

  // Save changes helper
  const saveEvpHistoryToLocal = (updated: EvpRecord[]) => {
    localStorage.setItem("paranormal_evp_history", JSON.stringify(updated));
    setEvpHistory(updated);
  };

  const saveBoxHistoryToLocal = (updated: GhostBoxResult[]) => {
    localStorage.setItem("paranormal_box_history", JSON.stringify(updated));
    setScanHistoryLog(updated);
  };

  // 1. Initialize & Manage Audio Synthesizer (Web Audio API)
  const initAudioEngine = () => {
    if (audioContextRef.current) return;
    
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      // Master thrum (low 33Hz spooky thrum)
      const osc = ctx.createOscillator();
      const thrumGain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(33.0, ctx.currentTime);
      thrumGain.gain.setValueAtTime(0.04, ctx.currentTime);
      osc.connect(thrumGain);
      thrumGain.connect(ctx.destination);
      osc.start();
      roomThrumOscRef.current = osc;

      // Scanner hum (modulates frequency based on EMF)
      const radarOsc = ctx.createOscillator();
      const radarGain = ctx.createGain();
      radarOsc.type = "triangle";
      radarOsc.frequency.setValueAtTime(110.0, ctx.currentTime);
      radarGain.gain.setValueAtTime(0.12, ctx.currentTime); // dynamically altered
      radarOsc.connect(radarGain);
      radarGain.connect(ctx.destination);
      radarOsc.start();
      radarHumRef.current = radarOsc;

      // White noise static generator (for ghost radio sweeping)
      const bufferSize = 2 * ctx.sampleRate;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;
      
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1200, ctx.currentTime);
      filter.Q.setValueAtTime(1.5, ctx.currentTime);

      const staticGain = ctx.createGain();
      staticGain.gain.setValueAtTime(0.0, ctx.currentTime); // start silent

      whiteNoise.connect(filter);
      filter.connect(staticGain);
      staticGain.connect(ctx.destination);
      whiteNoise.start();
      staticGainRef.current = staticGain;

      // Geiger meter click node
      const clicksGain = ctx.createGain();
      clicksGain.gain.setValueAtTime(0.0, ctx.currentTime);
      clicksGain.connect(ctx.destination);
      clicksGainRef.current = clicksGain;
      
      // Update gain levels based on user sound toggle
      updateAudioMuteStates(soundEnabled);
    } catch (err) {
      console.warn("Could not start Web Audio API context:", err);
    }
  };

  const updateAudioMuteStates = (active: boolean) => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    
    // Low spooky thrum is always subtly playing when device is on and audio enabled
    if (active && devicePower) {
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      // Audio on
      if (radarHumRef.current) {
        // Adjust hum frequency
        radarHumRef.current.frequency.setValueAtTime(80 + (currentEmf * 1.5), ctx.currentTime);
      }
      if (staticGainRef.current) {
        staticGainRef.current.gain.setValueAtTime(isSweepingRadio ? 0.22 : 0.01, ctx.currentTime);
      }
    } else {
      // Mute everything
      if (staticGainRef.current) {
        staticGainRef.current.gain.setValueAtTime(0, ctx.currentTime);
      }
    }
  };

  // Retrigger when states change
  useEffect(() => {
    updateAudioMuteStates(soundEnabled);
  }, [soundEnabled, devicePower, isSweepingRadio]);

  // Handle EMF sound clicks in an active heartbeat sweep
  useEffect(() => {
    if (!soundEnabled || !devicePower || !audioContextRef.current) return;
    
    // Play electronic clicking sound mapped directly to EMF strength
    const intervalTime = Math.max(100, 2000 - (currentEmf * 15)); // faster as EMF goes up
    
    const playClick = () => {
      if (!audioContextRef.current || !soundEnabled || !devicePower) return;
      try {
        const ctx = audioContextRef.current;
        const clickOsc = ctx.createOscillator();
        const clickGain = ctx.createGain();
        clickOsc.type = "sine";
        clickOsc.frequency.setValueAtTime(currentEmf > 80 ? 1500 : 800, ctx.currentTime);
        
        clickGain.gain.setValueAtTime(0.02, ctx.currentTime);
        clickGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        
        clickOsc.connect(clickGain);
        clickGain.connect(ctx.destination);
        clickOsc.start();
        clickOsc.stop(ctx.currentTime + 0.06);
      } catch (e) {
        // Safe play fail
      }
    };
    
    const clickTimer = setInterval(playClick, intervalTime);
    return () => clearInterval(clickTimer);
  }, [currentEmf, soundEnabled, devicePower]);

  // 2. Continuous EMF Sensor Emulation & History tracking
  useEffect(() => {
    if (!devicePower) return;

    const interval = setInterval(() => {
      setCurrentEmf((prev) => {
        let base = prev;
        // Adjust variance based on selected surge condition
        let delta = 0;
        if (emfSurgeMode === "CALM") {
          delta = (Math.random() - 0.5) * 1.2;
          // Slowly migrate to normal baseline
          base = base * 0.95 + baselineEmf * 0.05;
        } else if (emfSurgeMode === "FLUTTER") {
          delta = (Math.random() - 0.45) * 4.8;
        } else {
          // Surge high paranormal sweep
          delta = (Math.random() - 0.3) * 14.5;
        }

        let nextValue = Math.max(1.2, Math.min(199.9, base + delta + calibrationOffset));
        
        setEmfHistory((h) => {
          const nextArr = [...h.slice(1), nextValue];
          return nextArr;
        });

        setPeakEmf((p) => Math.max(p, nextValue));
        return parseFloat(nextValue.toFixed(1));
      });
    }, 120);

    return () => clearInterval(interval);
  }, [devicePower, emfSurgeMode, baselineEmf, calibrationOffset]);

  // 3. Render Simulated EMF History onto visual Canvas
  useEffect(() => {
    const canvas = canvasEmfRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = "rgba(16, 185, 129, 0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (!devicePower) {
      // Draw screen offline text
      ctx.fillStyle = "rgba(239, 68, 68, 0.4)";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.fillText("SENSOR INTERFACE OFFLINE", width / 2, height / 2);
      return;
    }

    // Line drawing
    ctx.beginPath();
    ctx.lineWidth = 2.5;
    
    // Setup gradient
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, "rgba(16, 185, 129, 0.25)");
    gradient.addColorStop(0.5, "rgba(245, 158, 11, 0.5)");
    gradient.addColorStop(1, "rgba(239, 68, 68, 0.85)");
    ctx.strokeStyle = gradient;

    const dx = width / (emfHistory.length - 1);
    emfHistory.forEach((emf, index) => {
      // Map 0 - 200uT to height levels
      const relativeVal = Math.min(199.9, emf);
      const y = height - (relativeVal / 200) * height * 0.85 - 10;
      const x = index * dx;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill underneath
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.fillStyle = "rgba(16, 185, 129, 0.04)";
    ctx.fill();

    // Trace active glow dot on tip
    if (emfHistory.length > 0) {
      const lastEmf = emfHistory[emfHistory.length - 1];
      const y = height - (Math.min(199.9, lastEmf) / 200) * height * 0.85 - 10;
      ctx.beginPath();
      ctx.arc(width - 2, y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = lastEmf > 100 ? "#ef4444" : lastEmf > 60 ? "#f59e0b" : "#10b981";
      ctx.shadowBlur = 10;
      ctx.shadowColor = ctx.fillStyle as string;
      ctx.fill();
      ctx.shadowBlur = 0; // reset
    }

  }, [emfHistory, devicePower]);

  // 4. Ghost Box FM/AM Sweep simulation
  useEffect(() => {
    if (!devicePower || !isSweepingRadio) return;

    const intervalMs = Math.floor(1000 / sweepRateHz);
    const sweepInterval = setInterval(() => {
      // Sweep frequency randomly jump or step incremental
      setCurrentRadioFrequency((prev) => {
        let next = prev + 0.1;
        if (next > 108.0) next = 87.5;
        return parseFloat(next.toFixed(1));
      });

      // Randomly spit a cryptic spoken word/fragment onto visual log screen
      if (Math.random() < 0.16) {
        const word = SWEEP_WORDS[Math.floor(Math.random() * SWEEP_WORDS.length)];
        setSpottedSweepWords((prev) => {
          const list = [word, ...prev.slice(0, 5)];
          return list;
        });

        // Click static signal
        if (audioContextRef.current && soundEnabled) {
          try {
            const ctx = audioContextRef.current;
            const burst = ctx.createOscillator();
            const burstGain = ctx.createGain();
            burst.type = "sawtooth";
            burst.frequency.setValueAtTime(90 + Math.random() * 210, ctx.currentTime);
            burstGain.gain.setValueAtTime(0.04, ctx.currentTime);
            burstGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            burst.connect(burstGain);
            burstGain.connect(ctx.destination);
            burst.start();
            burst.stop(ctx.currentTime + 0.27);
          } catch (e) {}
        }
      }
    }, intervalMs);

    return () => clearInterval(sweepInterval);
  }, [devicePower, isSweepingRadio, sweepRateHz, soundEnabled]);

  // EVP Timer ticker
  useEffect(() => {
    if (!isRecordingEvp) {
      setEvpTimer(0);
      return;
    }
    const ticker = setInterval(() => {
      setEvpTimer((t) => t + 1);
    }, 1000);
    return () => clearInterval(ticker);
  }, [isRecordingEvp]);

  // Handle EVP Web Audio Visualizer drawing (Real mic or mock)
  useEffect(() => {
    const canvas = canvasRecordingRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const width = canvas.width;
    const height = canvas.height;
    
    // Simulate real visual feedback on canvas
    const draw = () => {
      animId = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, width, height);

      // Grid line divider split horizontally
      ctx.strokeStyle = "rgba(239, 68, 68, 0.1)";
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      if (!isRecordingEvp) {
        // Draw resting faint waveform
        ctx.strokeStyle = "rgba(239, 68, 68, 0.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x < width; x++) {
          const angle = (x / width) * Math.PI * 4;
          const y = height / 2 + Math.sin(angle) * 1.5;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        return;
      }

      // If active visual animation
      ctx.strokeStyle = "rgba(239, 68, 68, 0.85)";
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      
      const timeFactor = Date.now() * 0.05;
      for (let x = 0; x < width; x++) {
        // Combine sine waves with raw randomized spikes to simulate supernatural frequency disruptions
        const baseSine = Math.sin((x / 14) + timeFactor) * 8;
        const subHar = Math.sin((x / 5) - timeFactor * 1.2) * 5;
        const randomStatic = (Math.random() - 0.5) * (currentEmf > 100 ? 25 : 8);
        const y = height / 2 + (baseSine + subHar + randomStatic) * 1.1;

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    draw();
    return () => cancelAnimationFrame(animId);
  }, [isRecordingEvp, currentEmf]);

  // Request & Release user audio constraints
  const startEvpMicrophone = async () => {
    setIsRecordingEvp(true);
    initAudioEngine();
    
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        setMicStream(stream);
        
        if (audioContextRef.current) {
          const source = audioContextRef.current.createMediaStreamSource(stream);
          const analyser = audioContextRef.current.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          micAnalyserRef.current = analyser;
        }
      }
    } catch (e) {
      console.warn("Could not access microphone directly. Fallback paranormal synthesizer active.", e);
    }
  };

  const stopEvaluatingEvp = async () => {
    setIsRecordingEvp(false);
    
    // Stop stream tracks
    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
      setMicStream(null);
    }

    // Trigger AI static voice processing automatically
    setAnalysisLoading(true);
    try {
      const response = await fetch("/api/analyze-evp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordingDuration: evpTimer,
          audioFormat: "EVP-PCM/AM-WAV",
          mockWhisperSeed: "spirit-evp-" + Date.now(),
          deviceDetails: {
            appEnvironment: "AI Studio Android Sandbox",
            currentEmfValue: currentEmf,
            peakEmfValue: peakEmf
          }
        })
      });

      if (!response.ok) {
        throw new Error("Decoding server errored.");
      }

      const report: EvpRecord = await response.json();
      // Generate ID and timestamp
      report.id = "evp-" + Date.now();
      report.timestamp = new Date().toLocaleTimeString();
      
      setLastSavedEvp(report);
      // Append to the list and limit
      const updatedLog = [report, ...evpHistory].slice(0, 20);
      saveEvpHistoryToLocal(updatedLog);
    } catch (err) {
      console.error("EVP server failed:", err);
    } finally {
      setAnalysisLoading(false);
    }
  };

  // Convert currently swept words into a coherent AI Spirit Translation
  const translateSpookySweepWords = async () => {
    if (spottedSweepWords.length === 0) return;
    setTranslationLoading(true);
    try {
      const resp = await fetch("/api/ghost-box-translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentWords: spottedSweepWords,
          locationDetails: {
            environmentHum: "Static-60Hz",
            investigatorLocalTime: new Date().toISOString()
          },
          spectralReading: currentEmf
        })
      });

      if (!resp.ok) {
        throw new Error("Metaphysical response bad status");
      }

      const data: GhostBoxResult = await resp.json();
      setSpiritBoxTranslation(data);

      const nextScanHistory = [data, ...scanHistoryLog].slice(0, 15);
      saveBoxHistoryToLocal(nextScanHistory);
    } catch (e) {
      console.error("Spirit box communication problem:", e);
    } finally {
      setTranslationLoading(false);
    }
  };

  // Start Camera feed
  const startCameraStream = async () => {
    setCameraPermissionError(false);
    setCameraActive(true);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false
        });
        if (videoElementRef.current) {
          videoElementRef.current.srcObject = stream;
        }
      } else {
        throw new Error("Camera APIs not supported");
      }
    } catch (err) {
      console.warn("Camera hardware scan failed. Simulating premium night-vision viewport...", err);
      setCameraPermissionError(true);
    }
  };

  const stopCameraStream = () => {
    setCameraActive(false);
    if (videoElementRef.current && videoElementRef.current.srcObject) {
      const stream = videoElementRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoElementRef.current.srcObject = null;
    }
  };

  // Handle active flash toggle
  const toggleFlashlightDevices = async () => {
    const nextState = !flashlightRealActive;
    setFlashlightRealActive(nextState);
    setFlashlightSimulated(nextState);

    // Attempt to toggle physical phone flash via mediaStream tracks if available
    try {
      if (videoElementRef.current && videoElementRef.current.srcObject) {
         const stream = videoElementRef.current.srcObject as MediaStream;
         const track = stream.getVideoTracks()[0];
         if (track) {
           const capabilities = track.getCapabilities() as any;
           if (capabilities.torch) {
             await track.applyConstraints({
               advanced: [{ torch: nextState }]
             } as any);
           }
         }
      }
    } catch (e) {
      console.warn("Standard Android hardware torch failed to initiate inside container context.");
    }
  };

  // Capture static visual snapshot, send snapshot image base64 to server
  const takeSpectralSnapshot = async () => {
    setCameraPicProcessing(true);
    try {
      let imageBase64String = "";

      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 300;
      const ctx = canvas.getContext("2d");
      
      if (ctx) {
        // Draw real video frame or fallback background pattern
        if (videoElementRef.current && cameraActive && !cameraPermissionError) {
          ctx.drawImage(videoElementRef.current, 0, 0, 400, 300);
        } else {
          // Draw nice spooky static placeholder
          ctx.fillStyle = "#111827";
          ctx.fillRect(0, 0, 400, 300);
          ctx.strokeStyle = "#10b981";
          ctx.beginPath();
          ctx.arc(200, 150, 45, 0, Math.PI * 2);
          ctx.stroke();

          // Visual mist lines
          ctx.fillStyle = "rgba(16, 185, 129, 0.15)";
          ctx.fillRect(50, 80, 300, 140);
        }

        // Apply visual static or high-contrast grain filter matching active state
        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        for (let i = 0; i < 400; i += 6) {
          for (let j = 0; j < 300; j += 6) {
            if (Math.random() > 0.55) {
              ctx.fillRect(i, j, 4, 4);
            }
          }
        }

        imageBase64String = canvas.toDataURL("image/jpeg");
      }

      // API Post
      const res = await fetch("/api/analyze-ghost-camera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: imageBase64String || "MOCK_FRAME",
          currentEmfVal: currentEmf
        })
      });

      if (!res.ok) {
        throw new Error("Camera analyzer returned status code: " + res.status);
      }

      const report: CameraAnalysisResult = await res.json();
      setLastCameraAnalysis(report);
    } catch (e) {
      console.error("Camera analysis failed:", e);
    } finally {
      setCameraPicProcessing(false);
    }
  };

  // Sound system initiator helper
  const enableSoundDriver = () => {
    setSoundEnabled(true);
    initAudioEngine();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start p-2 sm:p-5 font-sans relative overflow-x-hidden selection:bg-emerald-500 selection:text-black">
      
      {/* Dynamic Background Fog & Mist Gradients */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-emerald-950/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-red-950/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header Panel */}
      <header className="w-full max-w-4xl flex items-center justify-between py-3 px-4 mb-3 border-b border-emerald-900/40 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-950 flex items-center justify-center border border-emerald-500/30">
            <Radio className="w-5 h-5 text-emerald-400 animate-pulse animate-duration-[2500ms]" id="app-logo-icon" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-wider text-emerald-400 font-mono flex items-center gap-1.5 uppercase">
              REAPER-X5 <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-500/20 text-emerald-400">V1.54</span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Paranormal Electro-Magnetic EVP Suite</p>
          </div>
        </div>

        {/* Global Control Status */}
        <div className="flex items-center gap-2">
          {/* Sounds Toggle */}
          <button
            onClick={() => {
              if (!soundEnabled) {
                enableSoundDriver();
              } else {
                setSoundEnabled(false);
              }
            }}
            className={`p-2 rounded-lg border transition-all duration-200 cursor-pointer flex items-center gap-1 ${
              soundEnabled
                ? "bg-emerald-900/30 border-emerald-500 text-emerald-400"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
            }`}
            title={soundEnabled ? "Mute Synthesizer" : "Enable Paranormal Audio"}
            id="audio-synth-toggle-btn"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="text-[10px] font-mono hidden sm:inline">{soundEnabled ? "AUD:ON" : "AUD:OFF"}</span>
          </button>

          {/* Help button */}
          <button
            onClick={() => setShowConfigHelp(true)}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 cursor-pointer"
            id="config-guide-btn"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Power Controller */}
          <button
            onClick={() => setDevicePower(!devicePower)}
            className={`p-2 rounded-lg border flex items-center gap-1 transition-all cursor-pointer ${
              devicePower
                ? "bg-red-950/30 border-red-500 text-red-500 animate-pulse"
                : "bg-slate-900 border-slate-800 text-slate-500"
            }`}
            id="device-killswitch-btn"
          >
            <Power className="w-4 h-4" />
            <span className="text-[10px] font-mono font-bold hidden sm:inline">{devicePower ? "PWR" : "STDBY"}</span>
          </button>
        </div>
      </header>

      {/* Main Framework Container */}
      <main className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        
        {/* LEFT COLUMN: Hardware Interfacing Chassis Controls */}
        <section className="bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-slate-800 rounded-2xl md:col-span-8 p-3 sm:p-5 shadow-2xl relative overflow-hidden flex flex-col gap-4">
          
          {/* Top Chassis Panel - Telemetry & Mode Buttons */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 gap-2">
            <span className="text-[10px] text-slate-400 tracking-widest font-mono uppercase flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${devicePower ? "bg-emerald-500 animate-ping" : "bg-red-500"}`} />
              SENSORS STAT: {devicePower ? "INTERACTION ONLINE" : "HARDWARE MUTED"}
            </span>
            
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-900/60 font-bold">
                {currentEmf > 100 ? "⚠️ ANOMALY DENSE" : "SECURE WAVE"}
              </span>
            </div>
          </div>

          {/* SENSORY TELEMETRY DIAL & DIGITAL SCREEN */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center bg-slate-950/90 border border-slate-900 rounded-xl p-3 shadow-inner relative">
            
            {/* Left dial widget (EMF Dial representation) */}
            <div className="sm:col-span-5 flex flex-col items-center justify-center p-3 border-r border-slate-900/65">
              <div className="relative w-36 h-36 rounded-full border border-slate-800 flex items-center justify-center bg-radial from-slate-950 to-slate-900">
                {/* Dial divisions */}
                <div className="absolute inset-2 rounded-full border border-slate-800/40 border-dashed" />
                
                {/* Sector Colors (Arc indicator) */}
                <svg className="w-full h-full transform -rotate-90 absolute" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="transparent" stroke="#10b981" strokeWidth="2" strokeDasharray="125 250" strokeLinecap="round" className="opacity-30" />
                  <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f59e0b" strokeWidth="2" strokeDasharray="62 250" strokeDashoffset="-125" strokeLinecap="round" className="opacity-40" />
                  <circle cx="50" cy="50" r="40" fill="transparent" stroke="#ef4444" strokeWidth="2" strokeDasharray="63 250" strokeDashoffset="-187" strokeLinecap="round" className="opacity-50" />
                </svg>

                {/* Rotating needle */}
                <div
                  className="absolute bottom-1/2 left-1/2 w-1.5 h-16 origin-bottom transform bg-emerald-500 rounded-t-lg transition-transform duration-100 shadow-md"
                  style={{ transform: `translate(-50%, 0) rotate(${((currentEmf / 200) * 180) - 90}deg)` }}
                />

                {/* Needle Hub */}
                <div className="absolute w-5 h-5 rounded-full bg-slate-900 border-2 border-emerald-500 shadow-lg flex items-center justify-center z-10" />

                {/* Dial Indicator */}
                <div className="absolute bottom-2 text-[10px] font-mono font-black text-slate-500">
                  EMF METERS
                </div>
              </div>
            </div>

            {/* Right microtesla digital counter */}
            <div className="sm:col-span-7 flex flex-col justify-between h-full py-1">
              <div>
                <div className="text-[10px] font-mono text-slate-400 font-bold flex items-center justify-between">
                  <span>METRIC INDUCTION</span>
                  <span className="text-emerald-500 font-black">uT (Microtesla)</span>
                </div>
                
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-4xl text-emerald-400 font-mono font-black tracking-normal flex items-baseline">
                    {devicePower ? currentEmf.toFixed(1) : "00.0"}
                    <span className="text-xs text-slate-400 ml-1">uT</span>
                  </span>
                  
                  <span className="text-xs font-mono font-semibold bg-red-950/20 text-red-400 px-2 py-0.5 rounded border border-red-900/35">
                    PEAK: {devicePower ? peakEmf.toFixed(1) : "0.0"}
                  </span>
                </div>
              </div>

              {/* Status metrics grid */}
              <div className="grid grid-cols-2 gap-2 mt-3 text-[10px] font-mono">
                <div className="bg-slate-900/60 p-1.5 rounded border border-slate-900">
                  <span className="text-slate-500 block">MILLIGAUSS</span>
                  <span className="text-slate-200 font-bold">{(currentEmf * 10).toFixed(0)} mG</span>
                </div>
                <div className="bg-slate-900/60 p-1.5 rounded border border-slate-900">
                  <span className="text-slate-500 block">DANGER CLASSIF</span>
                  <span className={`font-semibold ${currentEmf > 120 ? "text-red-400" : currentEmf > 50 ? "text-amber-400" : "text-slate-400"}`}>
                    {currentEmf > 120 ? "DANGER (MAL)" : currentEmf > 50 ? "WARM RESIDUE" : "NATURAL BASE"}
                  </span>
                </div>
              </div>

              {/* Environmental Simulator Switcher */}
              <div className="mt-4 flex items-center gap-1">
                <span className="text-[9px] font-mono text-slate-500 mr-1 font-bold">EMF WAVE MODULATOR:</span>
                <button
                  onClick={() => setEmfSurgeMode("CALM")}
                  className={`px-2 py-1 rounded text-[10px] font-mono cursor-pointer transition ${
                    emfSurgeMode === "CALM" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : "bg-slate-900 text-slate-400"
                  }`}
                  id="emf-modulator-calm"
                >
                  CALM
                </button>
                <button
                  onClick={() => setEmfSurgeMode("FLUTTER")}
                  className={`px-2 py-1 rounded text-[10px] font-mono cursor-pointer transition ${
                    emfSurgeMode === "FLUTTER" ? "bg-orange-500/10 text-orange-400 border border-orange-500/30" : "bg-slate-900 text-slate-400"
                  }`}
                  id="emf-modulator-flutter"
                >
                  FLUTTER
                </button>
                <button
                  onClick={() => setEmfSurgeMode("HIGH_SURGE")}
                  className={`px-2 py-1 rounded text-[10px] font-mono cursor-pointer transition ${
                    emfSurgeMode === "HIGH_SURGE" ? "bg-red-500/10 text-red-400 border border-red-500/30 font-bold" : "bg-slate-900 text-slate-400"
                  }`}
                  id="emf-modulator-surge"
                >
                  SPIKE +
                </button>
              </div>

            </div>
          </div>

          {/* SENSOR DISPLAY SELECTOR (TABS) */}
          <div className="grid grid-cols-4 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-900">
            <button
              onClick={() => {
                setActiveTab("EMF");
                if (cameraActive) stopCameraStream();
              }}
              className={`py-2 px-1 rounded-lg text-xs font-mono font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer transition-all ${
                activeTab === "EMF"
                  ? "bg-emerald-950 text-emerald-400 border border-emerald-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              id="tab-emf-selector"
            >
              <Activity className="w-4 h-4" />
              <span>EMF RADAR</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("EVP");
                if (cameraActive) stopCameraStream();
              }}
              className={`py-2 px-1 rounded-lg text-xs font-mono font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer transition-all ${
                activeTab === "EVP"
                  ? "bg-red-950 text-red-400 border border-red-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              id="tab-evp-selector"
            >
              <FileAudio className="w-4 h-4" />
              <span>EVP AUDIO</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("GHOST_BOX");
                if (cameraActive) stopCameraStream();
              }}
              className={`py-2 px-1 rounded-lg text-xs font-mono font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer transition-all ${
                activeTab === "GHOST_BOX"
                  ? "bg-orange-950 text-orange-400 border border-orange-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              id="tab-ghostbox-selector"
            >
              <Radio className="w-4 h-4" />
              <span>GHOST BOX</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("SPECTRAL_CAM");
                startCameraStream();
              }}
              className={`py-2 px-1 rounded-lg text-xs font-mono font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer transition-all ${
                activeTab === "SPECTRAL_CAM"
                  ? "bg-indigo-950 text-indigo-400 border border-indigo-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              id="tab-camera-selector"
            >
              <Camera className="w-4 h-4" />
              <span>SPECTRAL CAM</span>
            </button>
          </div>

          {/* DYNAMIC SCREEN VIEWPORTS FOR EACH MODE */}
          
          {/* TAB 1: EMF RADAR SCREEN */}
          {activeTab === "EMF" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold text-slate-400">ELECTROMAGNETIC WAVE ANALYSIS RANGE</span>
                <span className="text-[10px] font-mono text-emerald-500 animate-pulse">● LIVE GRID CAPTURE</span>
              </div>
              
              <div className="h-44 bg-slate-950 rounded-lg relative overflow-hidden border border-slate-900">
                <canvas ref={canvasEmfRef} width={600} height={176} className="w-full h-full block" />
              </div>

              {/* Baseline offset configuration / Fine tuning calibration */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-slate-400 block mb-1">SENSOR SYSTEM BASELINE OFFSET:</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="10"
                      max="120"
                      value={baselineEmf}
                      onChange={(e) => setBaselineEmf(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer h-1 bg-slate-800 rounded-lg appearance-none"
                    />
                    <span className="text-xs font-mono text-emerald-400 w-10 text-right">{baselineEmf}</span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-slate-400 block mb-1">INTERFERENCE SYSTEM OFFSET COMPENSATION:</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCalibrationOffset((prev) => prev - 5)}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 font-bold rounded text-xs text-slate-300 font-mono cursor-pointer"
                    >
                      -5
                    </button>
                    <span className="text-xs font-mono text-slate-300 w-16 text-center">{calibrationOffset > 0 ? `+${calibrationOffset}` : calibrationOffset}</span>
                    <button
                      onClick={() => setCalibrationOffset((prev) => prev + 5)}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 font-bold rounded text-xs text-slate-300 font-mono cursor-pointer"
                    >
                      +5
                    </button>
                    <button
                      onClick={() => setCalibrationOffset(0)}
                      className="px-1.5 py-0.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded text-[9px] text-slate-400 font-mono cursor-pointer"
                    >
                      RESET
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EVP AUDIO RECORDER SCREEN */}
          {activeTab === "EVP" && (
            <div className="flex flex-col gap-4">
              
              <div className="bg-slate-950 p-4 border border-slate-900 rounded-xl relative overflow-hidden flex flex-col gap-3">
                
                {/* Visual Reels Overlay (vintage visual element) */}
                <div className="flex items-center justify-between border-b border-red-950 pb-2">
                  <div className="flex items-center gap-2">
                    <FileAudio className={`w-5 h-5 text-red-500 ${isRecordingEvp ? "animate-bounce" : ""}`} />
                    <span className="text-xs font-mono text-slate-300 font-bold">ELECTRONIC VOICE RECORDING INTERFACING</span>
                  </div>
                  {isRecordingEvp && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
                      <span className="text-[10px] font-mono text-red-400 font-black">REC • {evpTimer}s</span>
                    </div>
                  )}
                </div>

                {/* Oscilloscope Viewport */}
                <div className="h-28 bg-slate-950 border border-slate-900/80 rounded-lg relative flex items-center justify-center">
                  <canvas ref={canvasRecordingRef} width={600} height={112} className="w-full h-full block" />
                  
                  {isRecordingEvp && (
                    <div className="absolute top-2 right-2 text-[9px] font-mono bg-red-950/45 px-1.5 py-0.5 rounded text-red-400 border border-red-900/30">
                      MIC SAMPLING INPUT ACTIVE
                    </div>
                  )}
                </div>

                {/* Control Toggles */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    {!isRecordingEvp ? (
                      <button
                        onClick={startEvpMicrophone}
                        className="py-2.5 px-5 rounded-lg bg-red-600 hover:bg-red-500 font-bold text-xs text-white flex items-center gap-2 cursor-pointer transition shadow-lg shadow-red-950/40"
                        id="evp-rec-start"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        START SCANNING EVP
                      </button>
                    ) : (
                      <button
                        onClick={stopEvaluatingEvp}
                        className="py-2.5 px-5 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-xs text-slate-950 flex items-center gap-2 cursor-pointer transition"
                        id="evp-rec-stop"
                      >
                        <Square className="w-3.5 h-3.5 fill-current text-slate-950" />
                        STOP & ANALYZE STATIC
                      </button>
                    )}
                  </div>

                  <span className="text-[10px] font-mono text-slate-500">
                    *Tip: Make spooky questions: "Are any entities here?" before stopping.
                  </span>
                </div>
              </div>

              {/* POST RECORD RESULTS (AI GENERATED APRAISAL) */}
              {analysisLoading && (
                <div className="bg-slate-950 border border-red-900/30 rounded-xl p-5 flex flex-col items-center justify-center gap-4 text-center">
                  <RefreshCw className="w-8 h-8 text-red-500 animate-spin" />
                  <div>
                    <h4 className="text-sm font-bold text-red-400 font-mono uppercase">Scanning EVP Frequency Peaks...</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">Isolating micro-dB white noise oscillations. Sending raw paranormal wave signatures to Gemini API decoder...</p>
                  </div>
                </div>
              )}

              {lastSavedEvp && !analysisLoading && (
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border-2 border-red-900/40 rounded-xl p-4 flex flex-col gap-3 shadow-lg shadow-red-950/10">
                  <div className="flex items-center justify-between border-b border-red-950 pb-2">
                    <span className="text-xs font-mono font-bold text-red-500 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      DECODED SPIRIT WAVE REPORT
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">{lastSavedEvp.timestamp}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
                    {/* Spirit message big */}
                    <div className="sm:col-span-8 flex flex-col gap-2">
                      <span className="text-[10px] text-slate-500 font-mono block">EXTRACTED SPIRIT VOCALIZATION:</span>
                      <div className="bg-black/45 border border-slate-900 p-3 rounded-lg flex items-center justify-center">
                        <p className="text-2xl text-red-400 font-black italic tracking-widest font-mono text-center">
                          "{lastSavedEvp.spiritWhisper || "INAUDIBLE STATIC"}"
                        </p>
                      </div>

                      <div className="mt-1 text-xs text-slate-300">
                        <span className="font-bold text-slate-400">Paranormal Appraisal:</span> {lastSavedEvp.spookyExplanation}
                      </div>
                    </div>

                    {/* Numeric stats sidebar */}
                    <div className="sm:col-span-4 bg-black/35 rounded-lg border border-red-900/20 p-3 flex flex-col gap-2 text-[11px] font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-500">SIGNATURE STRENGTH:</span>
                        <span className="text-red-400 font-bold">{lastSavedEvp.confidence}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">CLASSIF TYPE:</span>
                        <span className="text-red-400 font-medium">{lastSavedEvp.classClassification}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">FREQ OSCIL peak:</span>
                        <span className="text-emerald-400 font-bold">{lastSavedEvp.frequencyPeak} Hz</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">ENTITY VIBE:</span>
                        <span className="text-indigo-400 font-bold">{lastSavedEvp.spiritVibe}</span>
                      </div>
                    </div>
                  </div>

                  {/* Associated phonemes discovered list */}
                  {lastSavedEvp.suggestedWordLog && lastSavedEvp.suggestedWordLog.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 mt-1 border-t border-slate-900">
                      <span className="text-[10px] font-mono text-slate-500 mr-2">SPECTRAL FRAGMENTS:</span>
                      {lastSavedEvp.suggestedWordLog.map((w, idx) => (
                        <span key={idx} className="bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded uppercase">
                          {w}
                        </span>
                      ))}
                    </div>
                  )}

                </div>
              )}

            </div>
          )}

          {/* TAB 3: GHOST BOX (SPIRIT BOX SWEEPER) SCREEN */}
          {activeTab === "GHOST_BOX" && (
            <div className="flex flex-col gap-4">
              <div className="bg-slate-950 p-4 border border-slate-900 rounded-xl flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-orange-950 pb-2">
                  <div className="flex items-center gap-2 text-orange-400">
                    <Radio className="w-5 h-5" id="ghostbox-radio-icon" />
                    <span className="text-xs font-mono font-bold uppercase">Analog Spirit Box Signal Sweeper</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">SWEEP REGULATION MODEL SH-93</span>
                </div>

                {/* Sweeping Frequency & Indicators */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center bg-black/60 rounded-lg p-4 border border-slate-900">
                  
                  {/* Digital sweep display */}
                  <div className="sm:col-span-6 flex flex-col justify-center items-center py-2 border-r border-slate-900/60">
                    <span className="text-[10px] font-mono text-slate-500">SWEEPING VHF AM/FM RAD:</span>
                    <span className="text-3xl font-mono font-black text-orange-400 tracking-wider">
                      {isSweepingRadio ? `${currentRadioFrequency.toFixed(1)} MHz` : "BOX INACTIVE"}
                    </span>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${isSweepingRadio ? "bg-orange-500 animate-ping" : "bg-slate-700"}`} />
                      <span className="text-[9px] font-mono text-slate-400">MUTED AMBIENT BANDSWEEP</span>
                    </div>
                  </div>

                  {/* Sweep words buffer */}
                  <div className="sm:col-span-6 flex flex-col gap-1.5">
                    <span className="text-[10px] font-mono text-slate-500">ISOLATED PHONETIC INTERCEPT BUFFER:</span>
                    <div className="bg-black/80 rounded-lg p-2 min-h-[50px] border border-slate-900 flex flex-wrap items-center gap-1.5 select-all">
                      {spottedSweepWords.length === 0 ? (
                        <span className="text-[10px] font-mono text-slate-600 italic">Sweep radio to capture spirit frequency fragments...</span>
                      ) : (
                        spottedSweepWords.map((word, i) => (
                          <span
                            key={i}
                            className={`px-2 py-0.5 text-xs font-mono rounded font-bold uppercase select-all ${
                              i === 0
                                ? "bg-orange-500/25 border border-orange-500 text-orange-400 animate-pulse text-sm"
                                : "bg-slate-900 border border-slate-800 text-slate-400"
                            }`}
                          >
                            {word}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                </div>

                {/* Sweep Control sliders */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        enableSoundDriver();
                        setIsSweepingRadio(!isSweepingRadio);
                      }}
                      className={`py-2 px-4 rounded-lg font-bold text-xs cursor-pointer flex items-center gap-2 transition ${
                        isSweepingRadio ? "bg-orange-600 hover:bg-orange-500 text-white" : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                      }`}
                      id="ghostbox-sweep-toggle"
                    >
                      {isSweepingRadio ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      {isSweepingRadio ? "STOP RADIO SWEEP" : "INITIATE FREQUENCY SWEEP"}
                    </button>

                    <button
                      onClick={() => setSpottedSweepWords([])}
                      className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 cursor-pointer text-slate-400 hover:text-slate-300"
                      title="Clear Words List"
                      id="clear-sweep-words-btn"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-mono text-slate-400">SWEEP SPEED (Hz):</label>
                    <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
                      <button
                        onClick={() => setSweepRateHz((s) => Math.max(2, s - 2))}
                        className="text-slate-400 hover:text-slate-200 text-xs font-black px-1"
                      >
                        -
                      </button>
                      <span className="text-xs font-mono font-bold text-slate-200 w-8 text-center">{sweepRateHz} Hz</span>
                      <button
                        onClick={() => setSweepRateHz((s) => Math.min(30, s + 2))}
                        className="text-slate-400 hover:text-slate-200 text-xs font-black px-1"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* TRANSLATE BTN */}
                {spottedSweepWords.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-900/75 flex flex-col justify-center items-center">
                    <button
                      onClick={translateSpookySweepWords}
                      disabled={translationLoading}
                      className="w-full py-2.5 rounded-lg bg-orange-500 text-slate-950 font-black text-xs hover:bg-orange-400 cursor-pointer disabled:opacity-50 transition flex items-center justify-center gap-2"
                      id="translate-spirits-btn"
                    >
                      <Sparkles className="w-4 h-4 fill-slate-950 text-slate-950 animate-bounce" />
                      {translationLoading ? "DECODING SPECTRAL FRAGMENTS..." : "ASK GEMINI AI TO TRANSLATE THE PHONEMES NOW"}
                    </button>
                  </div>
                )}
              </div>

              {/* TRANSLATION RESPONSE */}
              {spiritBoxTranslation && !translationLoading && (
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border-2 border-orange-500/30 rounded-xl p-4 flex flex-col gap-3 shadow-lg shadow-orange-950/10">
                  <div className="flex items-center justify-between border-b border-orange-900/30 pb-2">
                    <span className="text-xs font-mono font-bold text-orange-400 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      SPIRIT BOX TRANSLATION REPORT
                    </span>
                    <span className="text-[9px] font-mono text-slate-500 uppercase px-1.5 py-0.5 rounded bg-orange-950/20 text-orange-400">
                      RESTLESS ENTITY DETECTED
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                    <div className="sm:col-span-8 flex flex-col gap-1.5">
                      <span className="text-[10px] text-slate-500 font-mono">DEDUCED VOCALIZATION THREAD:</span>
                      <p className="text-lg text-orange-300 font-bold font-mono py-2 px-3 bg-black/60 rounded-lg border border-slate-900 leading-relaxed italic">
                        "{spiritBoxTranslation.translation}"
                      </p>
                      
                      <div className="text-xs text-slate-400 mt-2">
                        <span className="font-bold text-orange-500">RECOMMENDED INVESTIGATOR ACTION:</span> {spiritBoxTranslation.recommmendedAction}
                      </div>
                    </div>

                    <div className="sm:col-span-4 bg-black/40 rounded-lg border border-orange-900/20 p-3 text-[11px] font-mono flex flex-col gap-2.5">
                      <div>
                        <span className="text-slate-500 block">PROBABLE ENTITY STYLE:</span>
                        <span className="text-slate-200 font-bold">{spiritBoxTranslation.spiritName}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">CHRONOLOGICAL HISTORIC DATE:</span>
                        <span className="text-orange-400 font-bold">{spiritBoxTranslation.chronologicalEra}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">DANGER RISK RATIO:</span>
                        <span className="text-red-400 font-bold font-black">{spiritBoxTranslation.dangerLevel}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 4: SPECTRAL GHOST CAMERA VIEWPORT */}
          {activeTab === "SPECTRAL_CAM" && (
            <div className="flex flex-col gap-4">
              
              <div className="bg-slate-950 border border-slate-900 rounded-xl p-3 flex flex-col gap-3">
                
                {/* Header configuration */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900 pb-2">
                  <div className="flex items-center gap-2 text-indigo-400">
                    <Video className="w-5 h-5" />
                    <span className="text-xs font-mono font-bold">SPECTRAL VISUAL LENS FEED ({cameraFilter} MODE)</span>
                  </div>
                  
                  {/* Filter chooser radio knobs */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCameraFilter("NIGHT_VISION")}
                      className={`px-2 py-1 text-[10px] font-mono font-bold rounded cursor-pointer transition ${
                        cameraFilter === "NIGHT_VISION" ? "bg-emerald-500 text-black" : "bg-slate-950 border border-slate-800 text-slate-400"
                      }`}
                      id="cam-filter-night"
                    >
                      P-GREEN
                    </button>
                    <button
                      onClick={() => setCameraFilter("THERMAL")}
                      className={`px-2 py-1 text-[10px] font-mono font-bold rounded cursor-pointer transition ${
                        cameraFilter === "THERMAL" ? "bg-orange-500 text-black" : "bg-slate-950 border border-slate-800 text-slate-400"
                      }`}
                      id="cam-filter-thermal"
                    >
                      THERM
                    </button>
                    <button
                      onClick={() => setCameraFilter("SPECTRAL_IR")}
                      className={`px-2 py-1 text-[10px] font-mono font-bold rounded cursor-pointer transition ${
                        cameraFilter === "SPECTRAL_IR" ? "bg-indigo-400 text-black" : "bg-slate-950 border border-slate-800 text-slate-400"
                      }`}
                      id="cam-filter-ir"
                    >
                      SPEC-IR
                    </button>
                  </div>
                </div>

                {/* Viewport Display box */}
                <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden border border-slate-900 flex items-center justify-center">
                  
                  {/* Interactive Camera Device Render Filter overlays */}
                  <video
                    ref={videoElementRef}
                    autoPlay
                    playsInline
                    muted
                    className={`absolute inset-0 w-full h-full object-cover transition-all ${
                      cameraFilter === "NIGHT_VISION"
                        ? "brightness-[1.10] contrast-[1.40] saturate-[0] filter sepia(100%) hue-rotate-[75deg]"
                        : cameraFilter === "THERMAL"
                        ? "brightness-[0.9] contrast-[1.8] filter saturate-(200) hue-rotate-18 do-thermal-gradients"
                        : "brightness-[1.0] grayscale contrast-[1.5]"
                    }`}
                    style={
                      cameraFilter === "THERMAL"
                        ? { filter: "hue-rotate(190deg) saturate(3) contrast(1.7) invert(0.1)" }
                        : {}
                    }
                  />

                  {/* Fallback pattern when permission is missing or failing */}
                  {cameraPermissionError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-center p-5 font-mono z-10 border border-slate-900 border-dashed">
                      <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
                      <span className="text-xs text-slate-300 font-bold uppercase">Simulating Night-Vision Cam (No Camera Permission)</span>
                      <p className="text-[10px] text-slate-500 max-w-xs mt-1">Accept camera prompt or select camera filter on browser settings menu to activate hardware stream.</p>
                      
                      {/* Interactive mock glowing vapor blob representing a visual anomaly! */}
                      <div className="relative mt-8 w-24 h-24 border border-dashed border-indigo-500/30 rounded-full flex items-center justify-center bg-indigo-500/5 animate-pulse animate-duration-[4000ms]">
                        <div className="absolute w-12 h-10 bg-indigo-400/20 blur-xl rounded-full" />
                        <span className="text-[8px] text-indigo-400 font-black tracking-widest uppercase">Vapor Anomaly</span>
                      </div>
                    </div>
                  )}

                  {/* Dynamic Tactical Overlay (scanlines / grids) */}
                  {cameraOverlayOn && (
                    <div className="absolute inset-0 pointer-events-none border-2 border-slate-900/40 select-none flex flex-col justify-between p-3 z-10">
                      
                      {/* Top bar info */}
                      <div className="flex items-center justify-between pointer-events-none text-[10px] font-mono">
                        <span className={`text-[#10b981] ${cameraFilter === "NIGHT_VISION" ? "text-emerald-400" : cameraFilter === "THERMAL" ? "text-orange-500" : "text-indigo-400"}`}>
                          ISO: 3200 • EXP: -2.3EV
                        </span>
                        <span className="text-red-500 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
                          STDBY REC
                        </span>
                      </div>

                      {/* Radar sweep crosshair centered */}
                      <div className="self-center flex items-center justify-center relative select-none w-20 h-20 opacity-40">
                        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[1px] bg-white" />
                        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1px] bg-white" />
                        <div className="absolute w-12 h-12 rounded-full border border-white" />
                        <div className="absolute w-16 h-16 rounded-full border border-white border-dashed animate-spin animate-duration-[10000ms]" />
                      </div>

                      {/* Bottom stats overlay (time / EMF) */}
                      <div className="flex items-center justify-between pointer-events-none text-[9px] font-mono text-slate-400 uppercase">
                        <span>Reaper-CAM v4.1</span>
                        <span>EMF INTENSITY: {currentEmf} uT</span>
                      </div>
                    </div>
                  )}

                  {/* Scanline stripe pattern overlay */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,6px_100%] pointer-events-none z-10 opacity-70" />

                  {/* Flashlight simulator bright overlay */}
                  {flashlightSimulated && (
                    <div className="absolute inset-0 bg-white/10 pointer-events-none z-20 pointer-events-none mix-blend-screen" />
                  )}
                </div>

                {/* Camera Trigger panel & Flash controller */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={takeSpectralSnapshot}
                      disabled={cameraPicProcessing}
                      className="py-2.5 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer disabled:opacity-50 transition flex items-center gap-2 shadow-lg shadow-indigo-950/40"
                      id="camera-take-snapshot"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      {cameraPicProcessing ? "PROCESSING VECTOR PIXELS..." : "CAPTURE STATIC ANOMALY SNAP"}
                    </button>

                    {/* Hardware Flash Toggle */}
                    <button
                      onClick={toggleFlashlightDevices}
                      className={`p-2.5 rounded-lg border cursor-pointer transition flex items-center gap-2 ${
                        flashlightRealActive
                          ? "bg-amber-500/20 border-amber-500 text-amber-400 font-bold"
                          : "bg-slate-900 border-slate-800 text-slate-400"
                      }`}
                      title="Activate Hardware LED Torch / Flash"
                      id="hardware-torch-toggle"
                    >
                      <Lightbulb className="w-4 h-4" />
                      <span className="text-[10px] font-mono hidden sm:inline">{flashlightRealActive ? "TORCH:ON" : "TORCH:OFF"}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCameraOverlayOn(!cameraOverlayOn)}
                      className={`px-3 py-1.5 rounded text-[10px] font-mono cursor-pointer transition ${
                        cameraOverlayOn ? "bg-slate-900 text-slate-200 border border-slate-800" : "bg-slate-950 text-slate-500"
                      }`}
                      id="toggle-camera-grid-btn"
                    >
                      {cameraOverlayOn ? "GRID: ON" : "GRID: OFF"}
                    </button>
                  </div>
                </div>

              </div>

              {/* CAMERA APPRASAL RESPONSE */}
              {cameraPicProcessing && (
                <div className="bg-slate-950 border border-indigo-900/30 rounded-xl p-5 flex flex-col items-center justify-center gap-4 text-center">
                  <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                  <div>
                    <h4 className="text-sm font-bold text-indigo-400 font-mono uppercase">Analyzing Capture File...</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">Sending visual base64 spectral frame telemetry to Gemini for thermal & anomaly pattern evaluation...</p>
                  </div>
                </div>
              )}

              {lastCameraAnalysis && !cameraPicProcessing && (
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border-2 border-indigo-900/40 rounded-xl p-4 flex flex-col gap-3 shadow-lg shadow-indigo-950/10">
                  <div className="flex items-center justify-between border-b border-indigo-900/30 pb-2">
                    <span className="text-xs font-mono font-bold text-indigo-400 flex items-center gap-1.5 animate-pulse">
                      <Sparkles className="w-4 h-4-glow" />
                      SPECTRAL GHOST CAMERA ANALYSIS
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-black uppercase ${
                      lastCameraAnalysis.ghostlyAnomalyDetected ? "bg-red-950 border border-red-500 text-red-400 animate-pulse" : "bg-slate-950 text-slate-500"
                    }`}>
                      {lastCameraAnalysis.ghostlyAnomalyDetected ? "⚠ SPIRIT IDENTIFIED" : "NO SOLID TARGET"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                    {/* Visual location mapping representation */}
                    <div className="sm:col-span-4 flex flex-col items-center justify-center bg-black/60 rounded-lg p-2 border border-slate-900">
                      <div className="relative w-full aspect-square max-w-[120px] border border-slate-800 rounded-md overflow-hidden bg-radial from-slate-900 to-black">
                        {/* Grid */}
                        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.04)_1px,transparent_1px)] bg-[size:10px_10px]" />
                        
                        {/* Radar dial line sweeping */}
                        <div className="absolute inset-0 bg-conic from-emerald-500/20 via-transparent to-transparent animate-spin animate-duration-[4000ms]" />

                        {/* Spirit point coordinate */}
                        {lastCameraAnalysis.ghostlyAnomalyDetected && (
                          <div
                            className="absolute w-3 h-3 bg-indigo-500 rounded-full animate-ping border border-white"
                            style={{
                              left: `${lastCameraAnalysis.relativePosition?.x || 50}%`,
                              top: `${lastCameraAnalysis.relativePosition?.y || 50}%`,
                              transform: "translate(-50%, -50%)"
                            }}
                          />
                        )}

                        <span className="absolute bottom-1 right-1 text-[8px] font-mono text-slate-500">RADAR LOCK</span>
                      </div>
                      <span className="text-[9px] font-mono text-slate-400 mt-1">AXIS LOCALIZATION</span>
                    </div>

                    <div className="sm:col-span-8 flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                        <div className="bg-black/35 p-2 rounded border border-slate-900">
                          <span className="text-slate-500 text-[10px]">ANOMALY SIG CLASS:</span>
                          <span className="text-slate-200 block font-bold mt-0.5">{lastCameraAnalysis.anomalyType}</span>
                        </div>
                        <div className="bg-black/35 p-2 rounded border border-slate-900">
                          <span className="text-slate-500 text-[10px]">VERACITY RATIO score:</span>
                          <span className="text-indigo-400 block font-black mt-0.5">{lastCameraAnalysis.severityScore}/100</span>
                        </div>
                      </div>

                      <div className="text-xs text-slate-350 p-2.5 bg-slate-900/50 rounded-lg border border-slate-900 mt-1">
                        <span className="font-bold text-slate-400">Scientific Appraisal:</span> {lastCameraAnalysis.scientificAppraisal}
                      </div>

                      {lastCameraAnalysis.spiritMessage && (
                        <div className="mt-1 flex items-center gap-2 bg-indigo-950/20 border border-indigo-900/30 px-3 py-1.5 rounded-lg text-xs">
                          <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase">Decoded Whisper:</span>
                          <span className="font-mono text-indigo-300 font-black tracking-wider">"{lastCameraAnalysis.spiritMessage}"</span>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}

            </div>
          )}

        </section>

        {/* RIGHT COLUMN: Investigator Inventory, Saved Records Logs */}
        <aside className="md:col-span-4 flex flex-col gap-4">
          
          {/* EVP Logs Registry */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
                <FileAudio className="w-4 h-4 text-red-500" />
                EVP AUDIO ARCHIVE ({evpHistory.length})
              </span>
              {evpHistory.length > 0 && (
                <button
                  onClick={() => saveEvpHistoryToLocal([])}
                  className="text-[10px] font-mono text-slate-500 hover:text-red-400 cursor-pointer"
                  id="clear-evp-archive-btn"
                >
                  CLEAR
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
              {evpHistory.length === 0 ? (
                <div className="text-center py-6 text-[11px] text-slate-500 font-mono">
                  No EVP logs registered. Initialize recorder to analyze ambient static peaks.
                </div>
              ) : (
                evpHistory.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setLastSavedEvp(item)}
                    className="p-2 bg-slate-950/80 hover:bg-slate-950 border border-slate-900 hover:border-red-950/40 rounded-lg cursor-pointer transition text-left flex items-start gap-2 group"
                    id={`evp-archive-item-${item.id}`}
                  >
                    <div className="p-1 rounded bg-red-950/30 border border-red-900/30 text-red-400 mt-0.5 group-hover:bg-red-950/50 transition">
                      <Volume2 className="w-3 h-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-slate-400 font-medium">{item.timestamp}</span>
                        <span className="text-[9px] font-mono text-slate-500">{item.confidence}% STR</span>
                      </div>
                      <span className="text-xs font-bold text-slate-200 block truncate mt-0.5 italic group-hover:text-red-400 transition">
                        "{item.spiritWhisper || "Inaudible Resonance"}"
                      </span>
                      <span className="text-[9px] font-mono text-slate-500 block truncate uppercase">
                        {item.classClassification}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Ghost Box Sweep translation Registry */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-orange-400" />
                GHOST BOX HIST ({scanHistoryLog.length})
              </span>
              {scanHistoryLog.length > 0 && (
                <button
                  onClick={() => saveBoxHistoryToLocal([])}
                  className="text-[10px] font-mono text-slate-500 hover:text-red-400 cursor-pointer"
                  id="clear-ghostbox-history-btn"
                >
                  CLEAR
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
              {scanHistoryLog.length === 0 ? (
                <div className="text-center py-6 text-[11px] text-slate-500 font-mono">
                  No previous phonetic radio sweeps translated. Click "Translate" in Ghost Box view.
                </div>
              ) : (
                scanHistoryLog.map((box, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSpiritBoxTranslation(box)}
                    className="p-2 bg-slate-950/80 hover:bg-slate-950 border border-slate-900 rounded-lg cursor-pointer transition text-left group"
                    id={`box-archive-item-${idx}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono text-[10px] text-orange-400 font-bold">{box.spiritName}</span>
                      <span className="text-[9px] font-mono text-slate-500 uppercase">{box.chronologicalEra}</span>
                    </div>
                    <p className="text-xs text-slate-300 font-medium tracking-wide leading-tight line-clamp-2 mt-1 italic group-hover:text-amber-400 transition">
                      "{box.translation}"
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Device Telemetry Specs */}
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-slate-800 rounded-2xl p-4 flex flex-col gap-2.5 shadow-xl">
            <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase border-b border-slate-850 pb-1.5 block">
              CORES INTERFACE TELEMETRY
            </span>

            <div className="flex flex-col gap-1.5 text-[11px] font-mono">
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-500">API CHANNELS:</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  ONLINE
                </span>
              </div>

              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-500">MOCK FEEDBACK SECURE:</span>
                <span className="text-slate-300">{process.env.GEMINI_API_KEY ? "DIRECT GEMINI" : "SPOOKY ACTIVE EMULATION"}</span>
              </div>

              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-500">MIC CAPABILITY:</span>
                <span className="text-emerald-400 font-semibold">{micStream ? "STREAM ACTIVE" : "SYNTH SOUND"}</span>
              </div>

              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-500">CAMERA SOURCE:</span>
                <span className={cameraActive && !cameraPermissionError ? "text-indigo-400 font-semibold" : "text-slate-500"}>
                  {cameraActive && !cameraPermissionError ? "EXTERNAL FEED" : "EMULATION MIST"}
                </span>
              </div>
            </div>
          </div>

        </aside>

      </main>

      {/* FOOTER OVERVIEW */}
      <footer className="w-full max-w-4xl text-center py-6 mt-6 border-t border-slate-900 text-[10px] font-mono text-slate-600">
        Reaper-X5 apk hardware interface emulation • Created with Google AI Studio • All spirits and electromagnetic anomalies simulated via advanced client-side oscillators and live Gemini models.
      </footer>

      {/* CONFIG REQUISITES HELP MODAL */}
      {showConfigHelp && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-slate-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl relative overflow-hidden flex flex-col gap-4">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-sm font-bold font-mono text-emerald-400 flex items-center gap-1.5 uppercase">
                <Info className="w-5 h-5 text-emerald-400" />
                PARANORMAL TRANSCIEVER USER MANUAL
              </span>
              <button
                onClick={() => setShowConfigHelp(false)}
                className="text-slate-500 hover:text-slate-300 text-xs font-mono border border-slate-800 hover:border-slate-700 rounded px-1.5 py-0.5 cursor-pointer"
                id="close-manual-btn"
              >
                ESC
              </button>
            </div>

            <div className="flex flex-col gap-3 font-sans text-xs text-slate-300 leading-relaxed">
              <p>
                Welcome, Investigator. The **REAPER-X5** is a complete, cutting-edge paranormal sweep platform that replicates an Android APK device interface directly inside your web explorer.
              </p>

              <div>
                <span className="font-bold text-slate-100 font-mono block">1. EMF SCANNING & MODULATION INDICATOR</span>
                <p className="text-slate-400 mt-0.5">
                  Tracks electromagnetic fields. Toggle **EMF Sound** to hear standard electronic Geiger counter sound. Click **SPIKE +** to simulate moving your phone past wires, screens, or spiritual disturbances.
                </p>
              </div>

              <div>
                <span className="font-bold text-slate-100 font-mono block">2. EVP RECORD & AUDIO TRANSLATION</span>
                <p className="text-slate-400 mt-0.5">
                  Permits testing real-time voice captures! Click **START SCANNING** and ask standard investigator inquiries (e.g. "Who is here?"). When finished, Gemini parses the sound wave for cryptic phonetic warnings.
                </p>
              </div>

              <div>
                <span className="font-bold text-slate-100 font-mono block">3. INTERACTIVE GHOST BOX Sweeper</span>
                <p className="text-slate-400 mt-0.5">
                  Simulates rapid radio sweeps. When phonetic words materialize in the frequency noise, click **ASK GEMINI AI TO TRANSLATE** to piece together the warning.
                </p>
              </div>

              <div>
                <span className="font-bold text-slate-100 font-mono block">4. NIGHT VISION CAMERA & SPECTRAL FILTERS</span>
                <p className="text-slate-400 mt-0.5">
                  Utilizes actual webcam stream to lay over custom Phosphor-Green, Thermal and Spectral IR filters. Capture snapshots to identify coordinate visual anomalies via visual analysis!
                </p>
              </div>

              <div className="bg-slate-950/70 border-l-2 border-emerald-500 p-2 text-[11px] text-emerald-400 font-mono">
                Note: Standard API keys are automatically managed behind the scenes. If you want real, fully personalized supernatural intelligence, configure your `GEMINI_API_KEY` in the Secrets menu of AI Studio.
              </div>
            </div>

            <button
              onClick={() => setShowConfigHelp(false)}
              className="mt-2 py-2 w-full font-bold text-xs font-mono bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg cursor-pointer transition"
              id="start-hunting-btn"
            >
              START INVESTIGATION
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

