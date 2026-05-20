export interface EvpRecord {
  id: string;
  timestamp: string;
  duration: number;
  anomalyDetected: boolean;
  spiritWhisper: string;
  confidence: number;
  classClassification: string;
  frequencyPeak: number;
  spookyExplanation: string;
  spiritVibe: string;
  suggestedWordLog: string[];
}

export interface GhostBoxResult {
  spiritName: string;
  translation: string;
  chronologicalEra: string;
  dangerLevel: "SAFE (Curious)" | "NEUTRAL (Residue)" | "CAUTION (Restless)" | "DANGER (Malevolent)" | string;
  recommmendedAction: string;
}

export interface CameraAnalysisResult {
  ghostlyAnomalyDetected: boolean;
  anomalyType: string;
  relativePosition: {
    x: number;
    y: number;
  };
  severityScore: number;
  scientificAppraisal: string;
  spiritMessage: string;
}

export type DetectorMode = "EVP" | "EMF" | "GHOST_BOX" | "SPECTRAL_CAM";
