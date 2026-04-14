const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  buildFallbackIntakeResponse,
  buildFallbackResultsResponse,
} = require("./clinical-engine");

loadEnvFile();

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(__dirname, "data");
const PATIENTS_FILE = path.join(DATA_DIR, "patients.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

ensureDataStore();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        geminiConfigured: Boolean(GEMINI_API_KEY),
        model: GEMINI_MODEL,
      });
    }

    if (req.method === "GET" && url.pathname === "/api/patients") {
      return sendJson(res, 200, { patients: listPatients() });
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/patients/")) {
      const patientId = decodeURIComponent(url.pathname.split("/").pop());
      const patient = getPatient(patientId);
      if (!patient) {
        return sendJson(res, 404, { error: "Patient not found" });
      }
      return sendJson(res, 200, patient);
    }

    if (req.method === "POST" && url.pathname === "/api/intake-assessment") {
      const body = await readJsonBody(req);
      return sendJson(res, 200, await assessIntake(body));
    }

    if (req.method === "POST" && url.pathname === "/api/result-assessment") {
      const body = await readJsonBody(req);
      return sendJson(res, 200, await assessResults(body));
    }

    if (req.method === "POST" && url.pathname === "/api/patients") {
      const body = await readJsonBody(req);
      return sendJson(res, 200, await savePatientIntake(body));
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/patients/") && url.pathname.endsWith("/results")) {
      const body = await readJsonBody(req);
      const parts = url.pathname.split("/");
      const patientId = decodeURIComponent(parts[3]);
      return sendJson(res, 200, await savePatientResults(patientId, body));
    }

    if (req.method !== "GET") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    return sendJson(res, 500, {
      error: "Internal server error",
      detail: error.message,
    });
  }
});

server.listen(PORT, () => {
  console.log(`Pre-op anesthesia app running at http://localhost:${PORT}`);
});

async function savePatientIntake(payload) {
  const intake = payload.intake || payload;
  const assessment = payload.assessment || (await assessIntake(intake));
  const now = new Date().toISOString();
  const patients = readPatients();
  const existing = payload.id ? patients.find((item) => item.id === payload.id) : null;

  const patient = existing || {
    id: createPatientId(),
    createdAt: now,
    results: null,
    finalAssessment: null,
  };

  patient.updatedAt = now;
  patient.patientLabel = intake.patientId || `Patient ${patient.id.slice(-6)}`;
  patient.intake = intake;
  patient.intakeAssessment = assessment;
  patient.status = patient.results ? "results-entered" : "investigations-requested";
  patient.lastAction = patient.results
    ? "Awaiting reassessment review"
    : "Investigation request generated";

  upsertPatient(patient);
  return patient;
}

async function savePatientResults(patientId, payload) {
  const patient = getPatient(patientId);
  if (!patient) {
    throw new Error("Patient not found");
  }

  const results = payload.results || payload;
  const finalAssessment =
    payload.finalAssessment || (await assessResults({ intake: patient.intake, results }));
  const now = new Date().toISOString();

  patient.results = results;
  patient.finalAssessment = finalAssessment;
  patient.updatedAt = now;
  patient.status = "results-entered";
  patient.lastAction = "Optimization and ASA updated";

  upsertPatient(patient);
  return patient;
}

async function assessIntake(intake) {
  const fallback = buildFallbackIntakeResponse(intake);

  if (!GEMINI_API_KEY) {
    return {
      ...fallback,
      aiStatus: "fallback",
      aiMessage: "Gemini key not configured. Using built-in clinical rules.",
    };
  }

  const prompt = `
You are assisting with pre-operative anesthesia assessment.
Return JSON only, with no markdown fences.

Task:
Review the patient first-visit data and recommend investigations plus early optimization.
Be concise, clinically structured, and avoid overclaiming.
Use a NICE NG45 style approach:
- Do not order routine blanket tests.
- Base tests on surgery severity, baseline ASA/comorbidity burden, medications, and specific triggers.
- MUST ALWAYS request 'CBC' and 'Virology' for every patient, regardless of health.
- ECG is not routine for healthy minor cases.
- Chest X-ray is not routine; use only for cardiopulmonary disease or new respiratory findings/symptoms.
- Coagulation tests are only for bleeding risk, liver disease, or anticoagulants.
- Echocardiography is not routine and should be targeted.

Required JSON schema:
{
  "summary": "string",
  "riskLevel": "lower|moderate|higher",
  "investigations": ["string"],
  "rationale": ["string"],
  "medicationSchedule": ["string"],
  "optimizationFlags": ["string"],
  "disclaimer": "string"
}

Provide specific stop/continue instructions in 'medicationSchedule' for any drugs listed in the intake 'highRiskMeds' array (e.g., SGLT2 inhibitors).

Use this deterministic baseline as guardrails:
${JSON.stringify(fallback, null, 2)}

Patient intake:
${JSON.stringify(intake, null, 2)}
`;

  try {
    const aiResponse = await callGemini(prompt);
    return {
      model: GEMINI_MODEL,
      riskScore: fallback.riskScore,
      baselineASA: fallback.baselineASA,
      surgeryGrade: fallback.surgeryGrade,
      ...aiResponse,
      aiStatus: "live",
      aiMessage: "Live Gemini reasoning used with rule-based guardrails.",
    };
  } catch (error) {
    return {
      ...fallback,
      aiStatus: "fallback",
      aiMessage: `Gemini request failed. Using built-in rules instead. ${error.message}`,
    };
  }
}

async function assessResults(payload) {
  const intake = payload.intake || {};
  const results = payload.results || {};
  const fallback = buildFallbackResultsResponse(intake, results);

  if (!GEMINI_API_KEY) {
    return {
      ...fallback,
      aiStatus: "fallback",
      aiMessage: "Gemini key not configured. Using built-in clinical rules.",
    };
  }

  const prompt = `
You are assisting with pre-operative anesthesia reassessment.
Return JSON only, with no markdown fences.

Task:
Review the patient baseline plus returned investigation results.
Suggest optimization actions, highlight escalation concerns, and provide a provisional ASA class.
Be conservative and explicit that the final decision remains clinician-led.
Keep the investigation philosophy NICE-style: avoid implying routine tests unless there is a specific trigger.

Required JSON schema:
{
  "summary": "string",
  "asa": 1,
  "asaRationale": ["string"],
  "optimizationActions": ["string"],
  "escalationConcerns": ["string"],
  "disclaimer": "string"
}

Use this deterministic baseline as guardrails:
${JSON.stringify(fallback, null, 2)}

Patient intake:
${JSON.stringify(intake, null, 2)}

Returned results:
${JSON.stringify(results, null, 2)}
`;

  try {
    const aiResponse = await callGemini(prompt);
    return {
      model: GEMINI_MODEL,
      baselineRiskScore: fallback.baselineRiskScore,
      ...aiResponse,
      aiStatus: "live",
      aiMessage: "Live Gemini reasoning used with rule-based guardrails.",
    };
  } catch (error) {
    return {
      ...fallback,
      aiStatus: "fallback",
      aiMessage: `Gemini request failed. Using built-in rules instead. ${error.message}`,
    };
  }
}

async function callGemini(prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response.");
  return JSON.parse(text);
}

function ensureDataStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(PATIENTS_FILE)) {
    fs.writeFileSync(PATIENTS_FILE, "[]", "utf8");
  }
}

function readPatients() {
  ensureDataStore();
  return JSON.parse(fs.readFileSync(PATIENTS_FILE, "utf8"));
}

function writePatients(patients) {
  fs.writeFileSync(PATIENTS_FILE, JSON.stringify(patients, null, 2), "utf8");
}

function listPatients() {
  return readPatients()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .map((patient) => ({
      id: patient.id,
      patientLabel: patient.patientLabel,
      age: patient.intake?.age || null,
      sex: patient.intake?.sex || "",
      status: patient.status || "draft",
      surgeryGrade: patient.intakeAssessment?.surgeryGrade || "",
      baselineASA: patient.intakeAssessment?.baselineASA || null,
      updatedAt: patient.updatedAt || patient.createdAt,
      hasResults: Boolean(patient.results),
      lastAction: patient.lastAction || "",
    }));
}

function getPatient(patientId) {
  return readPatients().find((patient) => patient.id === patientId) || null;
}

function upsertPatient(patient) {
  const patients = readPatients();
  const index = patients.findIndex((item) => item.id === patient.id);
  if (index >= 0) {
    patients[index] = patient;
  } else {
    patients.push(patient);
  }
  writePatients(patients);
}

function createPatientId() {
  return `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function serveStatic(requestPath, res) {
  const pathname = requestPath === "/" ? "/index.html" : requestPath;
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      if (error.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      return sendJson(res, 500, { error: "Failed to read file" });
    }

    res.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
    });
    res.end(data);
  });
}
