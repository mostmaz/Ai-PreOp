const intakeForm = document.getElementById("intake-form");
const resultsForm = document.getElementById("results-form");
const investigationOutput = document.getElementById("investigation-output");
const finalOutput = document.getElementById("final-output");
const backendStatus = document.getElementById("backend-status");
const pageLoader = document.getElementById("page-loader");
const htnMedCard = document.getElementById("htn-med-card");
const dmMedCard = document.getElementById("dm-med-card");
const asthmaMedCard = document.getElementById("asthma-med-card");
const patientList = document.getElementById("patient-list");
const activePatientTitle = document.getElementById("active-patient-title");
const activePatientSubtitle = document.getElementById("active-patient-subtitle");
const saveStatus = document.getElementById("save-status");
const newPatientBtn = document.getElementById("new-patient-btn");
const goToResultsBtn = document.getElementById("go-to-results-btn");
const stepButtons = Array.from(document.querySelectorAll(".stepper-item"));
const steps = Array.from(document.querySelectorAll(".step-content"));
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const backButtons = Array.from(document.querySelectorAll(".btn-back"));

const state = {
  activePatient: null,
  allPatients: [],
};

function getCheckedValuesByLegend(legendText) {
  const legend = Array.from(document.querySelectorAll("legend")).find(
    (item) => item.textContent === legendText
  );

  if (!legend) return [];

  return Array.from(
    legend.parentElement.querySelectorAll('input[type="checkbox"]:checked')
  ).map((input) => input.value);
}

function parseBP(bpText) {
  const match = /(\d{2,3})\s*\/\s*(\d{2,3})/.exec(bpText || "");
  if (!match) return null;
  return { systolic: Number(match[1]), diastolic: Number(match[2]) };
}

function collectIntake() {
  const conditions = getCheckedValuesByLegend("Comorbidities and relevant conditions");
  const highRiskMeds = getCheckedValuesByLegend("High-Risk Perioperative Medications");
  return {
    patientId: document.getElementById("patientId").value.trim(),
    age: Number(document.getElementById("age").value) || 0,
    sex: document.getElementById("sex").value,
    surgeryRisk: document.getElementById("surgeryRisk").value,
    functionalCapacity: document.getElementById("functionalCapacity").value,
    pr: Number(document.getElementById("pr").value) || null,
    bp: parseBP(document.getElementById("bp").value),
    spo2: Number(document.getElementById("spo2").value) || null,
    previousAnesthesia: document.getElementById("previousAnesthesia").value,
    drugHistory: document.getElementById("drugHistory").value.trim(),
    medicalNotes: document.getElementById("medicalNotes").value.trim(),
    conditions,
    highRiskMeds,
    exam: getCheckedValuesByLegend("Examination findings"),
    conditionTherapy: {
      htn: {
        medication: document.getElementById("htnMedication").value.trim(),
        status: document.getElementById("htnMedicationStatus").value,
      },
      dm: {
        medication: document.getElementById("dmMedication").value.trim(),
        status: document.getElementById("dmMedicationStatus").value,
      },
      asthma: {
        medication: document.getElementById("asthmaMedication").value.trim(),
        status: document.getElementById("asthmaMedicationStatus").value,
        symptoms: document.getElementById("asthmaSymptoms").value,
      },
    },
  };
}

function collectResults() {
  return {
    hb: Number(document.getElementById("hb").value) || null,
    wbc: Number(document.getElementById("wbc").value) || null,
    platelets: Number(document.getElementById("platelets").value) || null,
    creatinine: Number(document.getElementById("creatinine").value) || null,
    sodium: Number(document.getElementById("sodium").value) || null,
    potassium: Number(document.getElementById("potassium").value) || null,
    glucose: Number(document.getElementById("glucose").value) || null,
    hba1c: Number(document.getElementById("hba1c").value) || null,
    inr: Number(document.getElementById("inr").value) || null,
    tsh: Number(document.getElementById("tsh").value) || null,
    ecgResult: document.getElementById("ecgResult").value,
    cxrResult: document.getElementById("cxrResult").value,
    echoResult: document.getElementById("echoResult").value,
    resultNotes: document.getElementById("resultNotes").value.trim(),
  };
}

function renderLoading(target, message) {
  target.className = "result-card";
  target.innerHTML = `<p>${message}</p>`;
}

function setGlobalLoading(visible, title, copy) {
  if (visible) {
    const titleEl = pageLoader.querySelector(".loader-title");
    const descEl = pageLoader.querySelector(".loader-desc");
    if (titleEl) titleEl.textContent = title || "AI is working";
    if (descEl) descEl.textContent = copy || "Please wait...";
    pageLoader.classList.remove("hidden");
    return;
  }
  pageLoader.classList.add("hidden");
}

function setActiveStep(stepId) {
  steps.forEach((step) => step.classList.toggle("active", step.id === stepId));
  stepButtons.forEach((button) =>
    button.classList.toggle("active", button.dataset.stepTarget === stepId)
  );
  // Animate the stepper indicator to the active button
  const activeBtn = stepButtons.find(b => b.dataset.stepTarget === stepId);
  const indicator = document.getElementById('stepper-indicator');
  if (activeBtn && indicator) {
    const stepper = activeBtn.closest('.stepper-glow');
    const stepperRect = stepper.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    const offsetLeft = btnRect.left - stepperRect.left;
    indicator.style.transform = `translateX(${offsetLeft - 6}px)`;
    indicator.style.width = `${btnRect.width}px`;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function toggleSidebar() {
  if (!sidebarToggle) return;
  sidebar.classList.toggle("collapsed");
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function filterResultFields(investigations) {
  // Build a single lowercase string of all recommended investigation text
  const invText = (investigations || []).join(' ').toLowerCase();

  document.querySelectorAll('#results-form .input-group[data-inv]').forEach(el => {
    const keywords = el.dataset.inv.split(' ');
    // Use whole-word regex so 'ecg' won't match inside 'glucose' etc.
    const matched = keywords.some(kw => {
      try {
        return new RegExp(`\\b${kw}\\b`, 'i').test(invText);
      } catch (e) {
        return invText.includes(kw);
      }
    });
    el.style.display = matched ? '' : 'none';
  });
}

function renderInvestigationPlan(data, intake) {
  const riskBadgeClass =
    data.riskLevel === "higher"
      ? "pill danger"
      : data.riskLevel === "moderate"
        ? "pill warn"
        : "pill";

  investigationOutput.className = "result-card";
  investigationOutput.innerHTML = `
    <h3>Investigation Request Summary</h3>
    <p>${intake.patientId ? `<strong>${intake.patientId}</strong><br />` : ""}${data.summary}</p>
    <div class="pill-row">
      <span class="${riskBadgeClass}">${capitalize(data.riskLevel || "lower")} concern</span>
            <span class="pill">ASA ${data.baselineASA ?? "?"}</span>
      <span class="pill">${capitalize(data.surgeryGrade || "minor")} surgery</span>
      <span class="pill">${data.aiStatus === "live" ? "Gemini live" : "Rule fallback"}</span>
    </div>
    <h4>Recommended investigations</h4>
    <ul class="clean-list">
      ${(data.investigations || []).map((item) => `<li>${item}</li>`).join("")}
    </ul>
    <h4>Why these were selected</h4>
    <ul class="clean-list">
      ${(data.rationale || []).map((item) => `<li>${item}</li>`).join("")}
    </ul>
    <h4>Early optimization flags</h4>
    <ul class="clean-list">
      ${(data.optimizationFlags || []).map((item) => `<li>${item}</li>`).join("")}
    </ul>
    ${data.medicationSchedule && data.medicationSchedule.length > 0 ? `
    <div style="margin-top: 24px; padding: 20px; background: hsla(var(--h-gold), 70%, 54%, 0.05); border: 1px solid hsla(var(--h-gold), 70%, 54%, 0.3); border-radius: var(--radius-md);">
      <h4 style="margin-top: 0; color: var(--accent-gold);">Preoperative Medication Checklist</h4>
      <ul class="clean-list" style="margin-bottom: 0;">
        ${data.medicationSchedule.map(item => `<li style="border-left-color: var(--accent-gold);">${item}</li>`).join("")}
      </ul>
      <p style="margin-top: 12px; margin-bottom: 0; font-size: 0.8rem; color: var(--ink-muted);">Note: Rules-based medication guidance. Confirm with operating clinician and local policy.</p>
    </div>` : ""}
    <p style="margin-top: 24px;"><strong>AI status:</strong> ${data.aiMessage || "No status provided."}</p>
    <p><strong>Clinical note:</strong> ${data.disclaimer || "Decision support only."}</p>
  `;

  // Filter the results form to only show requested investigation fields
  filterResultFields(data.investigations);
}

function renderFinalAssessment(data) {
  if (!data) {
    finalOutput.className = "empty-state";
    finalOutput.textContent = "Save results to generate a stored optimization and ASA summary.";
    return;
  }

  finalOutput.className = "result-card";
  finalOutput.innerHTML = `
    <h3>Optimization and Provisional ASA</h3>
    <div class="pill-row">
      <span class="pill danger">ASA ${data.asa ?? "?"}</span>
            <span class="pill">${data.aiStatus === "live" ? "Gemini live" : "Rule fallback"}</span>
    </div>
    <p>${data.summary || ""}</p>
    <h4>Optimization actions</h4>
    <ul class="clean-list">
      ${(data.optimizationActions || []).map((item) => `<li>${item}</li>`).join("")}
    </ul>
    <h4>Escalation / postponement concerns</h4>
    <ul class="clean-list">
      ${(data.escalationConcerns || []).map((item) => `<li>${item}</li>`).join("")}
    </ul>
    <h4>ASA rationale</h4>
    <ul class="clean-list">
      ${(data.asaRationale || []).map((item) => `<li>${item}</li>`).join("")}
    </ul>
    <p><strong>AI status:</strong> ${data.aiMessage || "No status provided."}</p>
    <p><strong>Clinical note:</strong> ${data.disclaimer || "Decision support only."}</p>
  `;
}

function toggleMedicationCards() {
  const conditions = getCheckedValuesByLegend("Comorbidities and relevant conditions");
  htnMedCard.classList.toggle("hidden", !conditions.includes("htn"));
  dmMedCard.classList.toggle("hidden", !conditions.includes("dm"));
  asthmaMedCard.classList.toggle("hidden", !conditions.includes("asthma"));
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.error || `Request failed with ${response.status}`);
  }
  return data;
}

function updateHeader() {
  if (!state.activePatient) {
    activePatientTitle.textContent = "Create a new patient";
    activePatientSubtitle.textContent =
      "Start with first-visit intake, then save the case for follow-up.";
    saveStatus.textContent = "This case has not been saved yet.";
    return;
  }

  activePatientTitle.textContent = state.activePatient.patientLabel || "Saved patient";
  activePatientSubtitle.textContent = `Last updated ${formatDate(
    state.activePatient.updatedAt || state.activePatient.createdAt
  )} • ${state.activePatient.status || "draft"}`;
  saveStatus.textContent = `Saved case ID: ${state.activePatient.id}`;
}

function resetOutputs() {
  investigationOutput.className = "empty-state";
  investigationOutput.textContent =
    "Save the intake first to generate and store the investigation request.";
  renderFinalAssessment(null);
}

function populateIntakeForm(intake = {}) {
  document.getElementById("patientId").value = intake.patientId || "";
  document.getElementById("age").value = intake.age || "";
  document.getElementById("sex").value = intake.sex || "";
  document.getElementById("surgeryRisk").value = intake.surgeryRisk || "low";
  document.getElementById("functionalCapacity").value = intake.functionalCapacity || "unknown";
  document.getElementById("pr").value = intake.pr || "";
  document.getElementById("bp").value = intake.bp ? `${intake.bp.systolic}/${intake.bp.diastolic}` : "";
  document.getElementById("spo2").value = intake.spo2 || "";
  document.getElementById("previousAnesthesia").value = intake.previousAnesthesia || "none";
  document.getElementById("drugHistory").value = intake.drugHistory || "";
  document.getElementById("medicalNotes").value = intake.medicalNotes || "";

  document
    .querySelectorAll('fieldset input[type="checkbox"]')
    .forEach((input) => {
      input.checked =
        (intake.conditions || []).includes(input.value) || 
        (intake.exam || []).includes(input.value) ||
        (intake.highRiskMeds || []).includes(input.value);
    });

  document.getElementById("htnMedication").value = intake.conditionTherapy?.htn?.medication || "";
  document.getElementById("htnMedicationStatus").value = intake.conditionTherapy?.htn?.status || "unknown";
  document.getElementById("dmMedication").value = intake.conditionTherapy?.dm?.medication || "";
  document.getElementById("dmMedicationStatus").value = intake.conditionTherapy?.dm?.status || "unknown";
  document.getElementById("asthmaMedication").value = intake.conditionTherapy?.asthma?.medication || "";
  document.getElementById("asthmaMedicationStatus").value = intake.conditionTherapy?.asthma?.status || "unknown";
  document.getElementById("asthmaSymptoms").value = intake.conditionTherapy?.asthma?.symptoms || "none";

  toggleMedicationCards();
}

function populateResultsForm(results = {}) {
  document.getElementById("hb").value = results.hb || "";
  document.getElementById("wbc").value = results.wbc || "";
  document.getElementById("platelets").value = results.platelets || "";
  document.getElementById("creatinine").value = results.creatinine || "";
  document.getElementById("sodium").value = results.sodium || "";
  document.getElementById("potassium").value = results.potassium || "";
  document.getElementById("glucose").value = results.glucose || "";
  document.getElementById("hba1c").value = results.hba1c || "";
  document.getElementById("inr").value = results.inr || "";
  document.getElementById("tsh").value = results.tsh || "";
  document.getElementById("ecgResult").value = results.ecgResult || "";
  document.getElementById("cxrResult").value = results.cxrResult || "";
  document.getElementById("echoResult").value = results.echoResult || "";
  document.getElementById("resultNotes").value = results.resultNotes || "";
}

function renderPatientList(patients) {
  if (!patients.length) {
    patientList.innerHTML = `<div class="empty-state" style="padding:24px;font-size:0.9rem;">No patients saved yet.</div>`;
    return;
  }

  patientList.innerHTML = patients
    .map(
      (patient) => `
        <button class="patient-item ${
          state.activePatient?.id === patient.id ? "active" : ""
        }" type="button" data-patient-id="${patient.id}">
          <div class="patient-item-title">${patient.patientLabel}</div>
          <div class="patient-item-meta">
            <span>${patient.age || "?"}y ${patient.sex || ""}</span>
            <span>${capitalize(patient.surgeryGrade || "minor")}</span>
            <span>ASA ${patient.baselineASA || "?"}</span>
          </div>
          <div class="patient-item-foot">
            <span>${patient.status}</span>
            <span>${formatDate(patient.updatedAt)}</span>
          </div>
        </button>
      `
    )
    .join("");

  patientList.querySelectorAll("[data-patient-id]").forEach((button) => {
    button.addEventListener("click", () => loadPatient(button.dataset.patientId));
  });
}

async function refreshPatientList() {
  const data = await requestJson("/api/patients");
  state.allPatients = data.patients || [];
  renderPatientList(state.allPatients);
}

async function loadPatient(patientId) {
  const patient = await requestJson(`/api/patients/${encodeURIComponent(patientId)}`);
  state.activePatient = patient;
  populateIntakeForm(patient.intake);
  populateResultsForm(patient.results || {});
  if (patient.intakeAssessment) {
    renderInvestigationPlan(patient.intakeAssessment, patient.intake);
  } else {
    resetOutputs();
    filterResultFields([]); // show all fields when no AI plan yet
  }
  renderFinalAssessment(patient.finalAssessment);
  updateHeader();
  await refreshPatientList();
}

function newPatient() {
  state.activePatient = null;
  intakeForm.reset();
  resultsForm.reset();
  document.getElementById("functionalCapacity").value = "unknown";
  document.getElementById("surgeryRisk").value = "low";
  document.getElementById("previousAnesthesia").value = "none";
  document.getElementById("htnMedicationStatus").value = "unknown";
  document.getElementById("dmMedicationStatus").value = "unknown";
  document.getElementById("asthmaMedicationStatus").value = "unknown";
  document.getElementById("asthmaSymptoms").value = "none";
  resetOutputs();
  filterResultFields([]); // show all fields for new patient
  updateHeader();
  toggleMedicationCards();
  setActiveStep("intake-step");
  refreshPatientList().catch(() => {});
}

async function checkBackend() {
  try {
    const data = await requestJson("/api/health", { cache: "no-store" });
    backendStatus.className = "backend-indicator status-ok";
    backendStatus.innerHTML = `<span class="indicator-dot"></span>Backend connected: ${data.model}`;
  } catch {
    backendStatus.className = "backend-indicator status-error";
    backendStatus.innerHTML = `<span class="indicator-dot"></span>Backend not reachable — open from http://localhost:3000`;
  }
}

document
  .querySelectorAll('fieldset input[type="checkbox"]')
  .forEach((input) => input.addEventListener("change", toggleMedicationCards));

stepButtons.forEach((button) =>
  button.addEventListener("click", () => setActiveStep(button.dataset.stepTarget))
);

newPatientBtn.addEventListener("click", newPatient);
goToResultsBtn.addEventListener("click", () => setActiveStep("results-step"));

if (sidebarToggle) sidebarToggle.addEventListener("click", toggleSidebar);

const searchInput = document.getElementById("patient-search");
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = state.allPatients.filter(p => 
      (p.patientLabel || "").toLowerCase().includes(term) || 
      (p.id || "").toLowerCase().includes(term)
    );
    renderPatientList(filtered);
  });
}

backButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.goto;
    if (target) setActiveStep(target);
  });
});

intakeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const intake = collectIntake();
  if (!intake.patientId) {
    saveStatus.textContent = "Please enter a patient name or ID before saving.";
    return;
  }

  renderLoading(investigationOutput, "Generating AI investigation request and saving patient...");
  setGlobalLoading(
    true,
    "AI is generating the investigation request",
    "Reviewing intake findings and saving the first-visit case."
  );

  try {
    const assessment = await requestJson("/api/intake-assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(intake),
    });

    const savedPatient = await requestJson("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: state.activePatient?.id,
        intake,
        assessment,
      }),
    });

    state.activePatient = savedPatient;
    renderInvestigationPlan(savedPatient.intakeAssessment, savedPatient.intake);
    updateHeader();
    await refreshPatientList();
    setActiveStep("investigation-step");
  } catch (error) {
    investigationOutput.className = "result-card";
    investigationOutput.innerHTML = `<p>Unable to save intake and generate the investigation plan.</p><p>${error.message}</p>`;
  } finally {
    setGlobalLoading(false);
  }
});

resultsForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.activePatient?.id) {
    finalOutput.className = "empty-state";
    finalOutput.textContent = "Save the intake first so this patient can be revisited when results return.";
    return;
  }

  const results = collectResults();
  renderLoading(finalOutput, "Saving returned investigations and generating optimization plan...");
  setGlobalLoading(
    true,
    "AI is reassessing returned investigations",
    "Combining saved intake data with returned results to update optimization and ASA."
  );

  try {
    const finalAssessment = await requestJson("/api/result-assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intake: state.activePatient.intake,
        results,
      }),
    });

    const savedPatient = await requestJson(
      `/api/patients/${encodeURIComponent(state.activePatient.id)}/results`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results, finalAssessment }),
      }
    );

    state.activePatient = savedPatient;
    renderFinalAssessment(savedPatient.finalAssessment);
    updateHeader();
    await refreshPatientList();
    setActiveStep("final-step");
  } catch (error) {
    finalOutput.className = "result-card";
    finalOutput.innerHTML = `<p>Unable to save returned results and generate ASA output.</p><p>${error.message}</p>`;
  } finally {
    setGlobalLoading(false);
  }
});

checkBackend();
refreshPatientList().catch(() => {});
newPatient();
