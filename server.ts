import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const isProd = process.env.NODE_ENV === "production";
const PORT = 3000;

// Lazy initialize Gemini client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY environment variable is not defined. Spooky mock responses active.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "MOCK_KEY",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();

  // Parse JSON payloads up to 10MB
  app.use(express.json({ limit: "10mb" }));

  // --- API ROUTE 1: EVP RECORDER & AUDIO ANALYSIS ---
  app.post("/api/analyze-evp", async (req, res) => {
    try {
      const { recordingDuration, audioFormat, mockWhisperSeed, deviceDetails } = req.body;

      const ai = getGeminiClient();
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        // Return a beautifully simulated paranormal analysis when NO api key is provided
        const simulatedWords = ["h...e...l...p", "i am here", "look behind", "cold", "leave", "lost"];
        const chosenWord = simulatedWords[Math.floor(Math.random() * simulatedWords.length)];
        const classification = Math.random() > 0.4 ? "Class B (Spooky Muffled Syllables)" : "Class C (Inaudible Static Fluctuations)";
        const hasAnomaly = Math.random() > 0.3;

        return res.json({
          anomalyDetected: hasAnomaly,
          spiritWhisper: hasAnomaly ? chosenWord : "",
          confidence: hasAnomaly ? Math.floor(Math.random() * 41) + 40 : 12,
          classClassification: hasAnomaly ? classification : "False Positive (High Ambient Noise)",
          frequencyPeak: parseFloat((40 + Math.random() * 80).toFixed(1)),
          spookyExplanation: hasAnomaly 
            ? `Ambient static analysis yielded sub-frequency oscillation matching human vocal cord resonance patterns. Signal peak indicates sudden temperature drop during measurement.`
            : `Spectral density match points to typical device coil hum + room reverb. No spirit signature extracted.`,
          spiritVibe: hasAnomaly ? "Mournful" : "None",
          suggestedWordLog: hasAnomaly ? [chosenWord, "under", "shadow"] : []
        });
      }

      // We have a real API key! Let's generate a highly realistic spooky paranormal appraisal.
      const prompt = `Analyze this simulated EVP (Electronic Voice Phenomena) recording session data and generate a highly creative, immersive, paranormal investigator report in JSON.
Recording Details:
- Duration: ${recordingDuration || "4.5"} seconds
- Format: ${audioFormat || "PCM/WAV"}
- Device context: ${JSON.stringify(deviceDetails || {})}
- Seed identifier: ${mockWhisperSeed || "raw-white-noise"}

Generate a detailed, spooky response with custom words that could be "decoded" from the white noise static of a ghost box.

You must follow this exact output structure:
{
  "anomalyDetected": boolean (whether a spirit whisper was isolated from static),
  "spiritWhisper": string (what the whisper says, keep it short, cryptic, and spooky, like 'I am cold' or 'Leave now', or empty if no anomaly),
  "confidence": number (between 0 and 100),
  "classClassification": string (e.g. 'Class A (Unmistakable)', 'Class B (Muffled but audible)', 'Class C (Faint whisper)', 'False Positive (Standard noise)'),
  "frequencyPeak": number (e.g. low sub-audible frequency between 30 and 200 Hz, or ultrasonic),
  "spookyExplanation": string (a cool pseudo-scientific or historic investigator style explanation of the anomaly, referencing ambient electromagnetic interference and EVP acoustics),
  "spiritVibe": string (e.g. 'Mournful', 'Angry', 'Protective', 'Confused', 'Ancient'),
  "suggestedWordLog": array of strings (the split words or associated words found in the static)
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              anomalyDetected: { type: Type.BOOLEAN },
              spiritWhisper: { type: Type.STRING },
              confidence: { type: Type.INTEGER },
              classClassification: { type: Type.STRING },
              frequencyPeak: { type: Type.NUMBER },
              spookyExplanation: { type: Type.STRING },
              spiritVibe: { type: Type.STRING },
              suggestedWordLog: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: [
              "anomalyDetected",
              "spiritWhisper",
              "confidence",
              "classClassification",
              "frequencyPeak",
              "spookyExplanation",
              "spiritVibe",
              "suggestedWordLog"
            ]
          }
        }
      });

      const parsedData = JSON.parse(response.text.trim());
      res.json(parsedData);
    } catch (error: any) {
      console.error("EVP Analysis Error:", error);
      res.status(500).json({ error: "Failed to process paranormal acoustic scans.", details: error.message });
    }
  });

  // --- API ROUTE 2: GHOST BOX CHAT / SPIRIT TRANSLATOR ---
  app.post("/api/ghost-box-translate", async (req, res) => {
    try {
      const { currentWords, locationDetails, spectralReading } = req.body;

      const ai = getGeminiClient();
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        // Return beautiful fallback translation
        const simulatedResponses = [
          "The shadow lingers because of historic occurrences here. It feels cold.",
          "An old presence watches. It communicates in frequencies of about 55 Hz.",
          "Beware the corner. No malice, just an echo of past events.",
          "Searching... a memory from 1926 is vibrating is the room.",
        ];
        return res.json({
          spiritName: "The Room Echo",
          translation: simulatedResponses[Math.floor(Math.random() * simulatedResponses.length)],
          chronologicalEra: "Interwar Period (circa 1920-1935)",
          dangerLevel: "LOW (Fading residue)",
          recommmendedAction: "Continue sweeping and check EMF meter for confirmation spikes."
        });
      }

      const prompt = `A paranormal investigator is sweeping a ghost box (spirit box) radio and received these fragmented phonemes/words: "${(currentWords || []).join(", ")}".
Spectral Context:
- EMF Microtesla fluctuation: ${spectralReading || "33.4"} uT
- Location metadata: ${JSON.stringify(locationDetails || {})}

Acts as an expert AI Spirit Translator. Formulate an interpretation of these words, assuming they are indeed fragments from a metaphysical presence. Output the result in JSON.

Output format:
{
  "spiritName": string (a descriptive placeholder name of the presence e.g., 'The Victorian Child', 'The Station Echo', 'The Heavy Air'),
  "translation": string (make a poetic, cohesive sentence of what the presence is attempting to warn or declare. Do NOT use silly clichés, keep it moody, eerie, and atmospheric),
  "chronologicalEra": string (simulate a likely historic era based on the vibe, e.g. 'Antebellum', 'Industrial Revolution', 'Late 20th Century'),
  "dangerLevel": string ('SAFE (Curious)', 'NEUTRAL (Residue)', 'CAUTION (Restless)', 'DANGER (Malevolent)'),
  "recommmendedAction": string (practical investigator instructions like 'Dampen lights, sit still' or 'Reposition camera')
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              spiritName: { type: Type.STRING },
              translation: { type: Type.STRING },
              chronologicalEra: { type: Type.STRING },
              dangerLevel: { type: Type.STRING },
              recommmendedAction: { type: Type.STRING }
            },
            required: ["spiritName", "translation", "chronologicalEra", "dangerLevel", "recommmendedAction"]
          }
        }
      });

      const parsedData = JSON.parse(response.text.trim());
      res.json(parsedData);
    } catch (error: any) {
      console.error("Ghost Box Translation Error:", error);
      res.status(500).json({ error: "Metaphysical decoding failed.", details: error.message });
    }
  });

  // --- API ROUTE 3: PARANORMAL RADAR SNAPSHOT ANALYZER ---
  // If the user snaps a photo, they can analyze it with Gemini
  app.post("/api/analyze-ghost-camera", async (req, res) => {
    try {
      const { imageBase64, currentEmfVal } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Missing camera capture payload" });
      }

      const ai = getGeminiClient();
      const apiKey = process.env.GEMINI_API_KEY;

      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      if (!apiKey) {
        // Fallback photo analysis
        const vibes = ["Cold Spot", "Ectoplasmic Mist Fragment", "Visual Orbs Cluster", "Shadow Silhouette Anomaly"];
        const chosenVibe = vibes[Math.floor(Math.random() * vibes.length)];
        const emfFactor = parseFloat((currentEmfVal || 45.2).toFixed(1));

        return res.json({
          ghostlyAnomalyDetected: Math.random() > 0.4,
          anomalyType: chosenVibe,
          relativePosition: { x: Math.floor(Math.random()*40) + 30, y: Math.floor(Math.random()*40) + 30 },
          severityScore: Math.floor(Math.random() * 50) + 30,
          scientificAppraisal: `Luminous density variance detected in the central quadrants. Cross-referenced with the EMF level of ${emfFactor} uT, it patterns closely as an thermal gradient disturbance. Avoid direct eye contact.`,
          spiritMessage: emfFactor > 60 ? "We see you." : "Do not leave."
        });
      }

      const prompt = `You are a professional paranormal visual analyst. Inspect this camera frame acquired during an active EVP/EMF ghost hunt session (EMF level is currently ${currentEmfVal || 40} microtesla). 
Find any "spooky anomalies" (e.g., lens flares mimicking orbs, thermal cold spots, outline traces resembling vapor/ectoplasm, shadow clusters, double exposure illusions). 
Be extremely creative, imaginative, spooky, and highly technical. Make up an authentic-sounding, atmospheric report.

Output a JSON array of findings with this exact structure:
{
  "ghostlyAnomalyDetected": boolean,
  "anomalyType": string (e.g., 'Ectoplasmic Fog', 'Orb Cloud Cluster', 'Vagrant Shadow Artifact', 'Thermal Pocket'),
  "relativePosition": {
    "x": number (approximate center X as a percentage 0-100 on the image),
    "y": number (approximate center Y as a percentage 0-100 on the image)
  },
  "severityScore": number (0 to 100),
  "scientificAppraisal": string (spooky narrative analyzing visual contrast, ambient distortion, and electromagnetic alignment),
  "spiritMessage": string (a short eerie message deciphered from the visual anomaly)
}`;

      const imagePart = {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Data,
        },
      };

      const textPart = {
        text: prompt,
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts: [imagePart, textPart] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ghostlyAnomalyDetected: { type: Type.BOOLEAN },
              anomalyType: { type: Type.STRING },
              relativePosition: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.INTEGER },
                  y: { type: Type.INTEGER }
                },
                required: ["x", "y"]
              },
              severityScore: { type: Type.INTEGER },
              scientificAppraisal: { type: Type.STRING },
              spiritMessage: { type: Type.STRING }
            },
            required: ["ghostlyAnomalyDetected", "anomalyType", "relativePosition", "severityScore", "scientificAppraisal", "spiritMessage"]
          }
        }
      });

      const parsedData = JSON.parse(response.text.trim());
      res.json(parsedData);
    } catch (error: any) {
      console.error("Camera frame analysis error:", error);
      res.status(500).json({ error: "Spectral visual scan processing failed.", details: error.message });
    }
  });


  // --- VITE MIDDLEWARE SETUP ---
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Paranormal Ghost Box Backend active on http://0.0.0.0:${PORT}`);
  });
}

startServer();
