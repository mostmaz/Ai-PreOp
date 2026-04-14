function parseBP(bpText) {
  const match = /(\d{2,3})\s*\/\s*(\d{2,3})/.exec(bpText || "");
  if (!match) return null;
  return {
    systolic: Number(match[1]),
    diastolic: Number(match[2]),
  };
}

function estimateBaselineASA(intake) {
  let asa = 1;

  if (
    intake.conditions?.length ||
    intake.exam?.length ||
    intake.previousAnesthesia === "complicated"
  ) {
    asa = 2;
  }

  const majorCondition =
    intake.conditions?.includes("cns") ||
    intake.conditions?.includes("renal") ||
    intake.conditions?.includes("liver") ||
    intake.conditions?.includes("arrhythmia") ||
    intake.conditions?.includes("cath") ||
    intake.exam?.includes("basalCrackles") ||
    intake.exam?.includes("cardiacMurmur") ||
    (intake.spo2 && intake.spo2 < 94);

  if (majorCondition) {
    asa = 3;
  }

  if (
    intake.bp?.systolic >= 180 ||
    intake.bp?.diastolic >= 110 ||
    intake.spo2 < 90
  ) {
    asa = 4;
  }

  return asa;
}

function surgeryGradeFromRisk(surgeryRisk) {
  if (surgeryRisk === "high") return "major";
  if (surgeryRisk === "intermediate") return "intermediate";
  return "minor";
}

function scoreRisk(intake) {
  let score = 0;
  const reasons = [];
  const investigations = new Set();
  const optimization = [];
  const therapy = intake.conditionTherapy || {};
  const baselineASA = estimateBaselineASA(intake);
  const surgeryGrade = surgeryGradeFromRisk(intake.surgeryRisk);
  const hasCardiovascularComorbidity =
    intake.conditions.includes("htn") ||
    intake.conditions.includes("cath") ||
    intake.conditions.includes("arrhythmia");
  const hasRenalRisk =
    intake.conditions.includes("renal") ||
    intake.conditions.includes("dm") ||
    /ace|pril|arb|sartan|diuretic|furosemide|spironolactone|indapamide|hydrochlorothiazide/i.test(
      [intake.drugHistory, therapy.htn?.medication, therapy.dm?.medication].filter(Boolean).join(" ")
    );
  const hasRespiratoryTrigger =
    intake.conditions.includes("asthma") ||
    intake.conditions.includes("resp") ||
    intake.exam.includes("chestAbnormal") ||
    intake.exam.includes("basalCrackles") ||
    therapy.asthma?.symptoms === "mild" ||
    therapy.asthma?.symptoms === "significant" ||
    intake.spo2 < 94;
  const needsCoagAssessment =
    intake.conditions.includes("liver") ||
    intake.conditions.includes("blood") ||
    /anticoagulant|warfarin|apixaban|rivaroxaban|clopidogrel|dabigatran|heparin/i.test(
      intake.drugHistory
    );

  if (intake.age >= 65) {
    score += 1;
    reasons.push("Older age increases perioperative risk.");
  }

  if (["intermediate", "high"].includes(intake.surgeryRisk)) {
    score += intake.surgeryRisk === "high" ? 2 : 1;
    reasons.push(`Procedure is ${surgeryGrade} severity.`);
  }

  if (intake.conditions.includes("htn")) {
    score += 1;
    investigations.add("ECG");
    investigations.add("Renal function and electrolytes");
    reasons.push("Hypertension may need end-organ and control assessment.");

    if (therapy.htn?.medication || therapy.htn?.status !== "unknown") {
      reasons.push(
        therapy.htn?.status === "not-taking"
          ? "Hypertension history is present but the patient is not taking antihypertensive treatment."
          : `Hypertension treatment history recorded: ${therapy.htn?.medication || "medication status documented without a named drug"}.`
      );
    }

    if (therapy.htn?.status === "not-taking") {
      score += 2;
      optimization.push("Optimize hypertension before elective surgery because the patient is not taking medication.");
    }
  }

  if (intake.conditions.includes("dm")) {
    score += 1;
    investigations.add("Random glucose");
    investigations.add("HbA1c");
    investigations.add("Renal function and electrolytes");
    reasons.push("Diabetes requires glycemic assessment and complication screening.");

    if (therapy.dm?.medication || therapy.dm?.status !== "unknown") {
      reasons.push(
        therapy.dm?.status === "not-taking"
          ? "Diabetes history is present but the patient is not taking glucose-lowering treatment."
          : `Diabetes treatment history recorded: ${therapy.dm?.medication || "medication status documented without a named drug"}.`
      );
    }

    if (therapy.dm?.status === "not-taking") {
      score += 2;
      optimization.push("Optimize diabetes before elective surgery because the patient is not taking medication.");
    }
  }

  if (intake.conditions.includes("cns")) {
    score += 2;
    reasons.push("Previous CNS event increases perioperative neurologic risk.");
  }

  if (intake.conditions.includes("asthma") || intake.conditions.includes("resp")) {
    score += 1;
    reasons.push("Respiratory disease may require pulmonary optimization.");

    if (intake.conditions.includes("asthma")) {
      if (therapy.asthma?.medication || therapy.asthma?.status !== "unknown") {
        reasons.push(
          therapy.asthma?.status === "not-taking"
            ? "Asthma history is present but the patient is not taking inhaled or asthma medication."
            : `Asthma treatment history recorded: ${therapy.asthma?.medication || "medication status documented without a named drug"}.`
        );
      }

      if (therapy.asthma?.status === "not-taking" && therapy.asthma?.symptoms !== "significant") {
        score += 2;
        optimization.push("Optimize asthma treatment before elective surgery because the patient is not taking medication.");
      }

      if (therapy.asthma?.symptoms === "mild" || therapy.asthma?.symptoms === "significant") {
        reasons.push("Active respiratory symptoms increase the need for pulmonary reassessment.");
        optimization.push("Assess and treat active respiratory symptoms before proceeding.");
      }
    }
  }

  if (intake.exam.includes("chestAbnormal") || intake.exam.includes("basalCrackles")) {
    score += 2;
    reasons.push("Chest findings suggest active cardiopulmonary review is needed.");
  }

  if (intake.conditions.includes("blood")) {
    score += 1;
    reasons.push("Blood disease may affect transfusion or coagulation planning.");
  }

  if (intake.conditions.includes("cath") || intake.conditions.includes("arrhythmia")) {
    score += 2;
    reasons.push("Cardiac history warrants rhythm and function assessment.");
  }

  if (intake.exam.includes("cardiacMurmur")) {
    score += 2;
    reasons.push("Abnormal cardiac auscultation may represent structural disease.");
  }

  if (intake.conditions.includes("thyroid")) {
    score += 1;
    reasons.push("Thyroid dysfunction should be controlled preoperatively.");
  }

  if (intake.conditions.includes("smoking")) {
    score += 1;
    reasons.push("Smoking increases pulmonary complication risk.");
  }

  if (intake.conditions.includes("renal")) {
    score += 2;
    reasons.push("Renal impairment affects fluid, drug, and electrolyte planning.");
  }

  if (intake.conditions.includes("liver")) {
    score += 2;
    reasons.push("Liver disease may affect metabolism and coagulation.");
  }

  if (intake.previousAnesthesia === "complicated") {
    score += 2;
    reasons.push("Previous anesthesia complications require targeted planning.");
    optimization.push("Review previous anesthesia record before final clearance.");
  }

  if (intake.exam.includes("airwayConcern")) {
    score += 2;
    reasons.push("Airway concern requires advanced airway strategy.");
    optimization.push("Prepare difficult airway plan and backup devices.");
  }

  if (intake.pr && (intake.pr < 50 || intake.pr > 110)) {
    score += 1;
    reasons.push("Abnormal pulse rate may reflect conduction or hemodynamic issues.");
  }

  if (intake.bp?.systolic >= 180 || intake.bp?.diastolic >= 110) {
    score += 2;
    reasons.push("Marked hypertension should be optimized before elective surgery.");
    optimization.push("Control blood pressure before proceeding with elective case.");
  } else if (intake.bp?.systolic >= 140 || intake.bp?.diastolic >= 90) {
    score += 1;
    reasons.push("Elevated blood pressure deserves review and medication confirmation.");
  }

  if (intake.spo2 && intake.spo2 < 94) {
    score += 2;
    optimization.push("Clarify cause of desaturation and optimize oxygenation first.");
    reasons.push("Low baseline SpO2 suggests active respiratory or cardiac compromise.");
  }

  if (needsCoagAssessment) {
    reasons.push("Antithrombotic therapy may require perioperative interruption planning.");
  }

  // Always require CBC and Virology based on updated protocol
  investigations.add("CBC");
  investigations.add("Virology");
  reasons.push("CBC and Virology are requested as mandatory routine tests per local protocol.");

  if (surgeryGrade === "major" && (baselineASA >= 2 || hasRenalRisk)) {
    investigations.add("Renal function and electrolytes");
    reasons.push("Renal function testing is appropriate for major surgery or renal-risk medication/comorbidity.");
  } else if (surgeryGrade === "intermediate" && hasRenalRisk) {
    investigations.add("Renal function and electrolytes");
    reasons.push("Kidney function testing is indicated because of renal disease, diabetes, or renal-risk medication.");
  } else if (surgeryGrade === "minor" && baselineASA >= 3 && hasRenalRisk) {
    investigations.add("Renal function and electrolytes");
    reasons.push("Minor surgery generally avoids testing, but kidney function may be justified in higher-ASA patients with renal risk.");
  }

  if (
    (surgeryGrade === "major" && baselineASA >= 2) ||
    (surgeryGrade === "intermediate" && (baselineASA >= 3 || hasCardiovascularComorbidity || intake.conditions.includes("dm") || intake.conditions.includes("renal"))) ||
    (surgeryGrade === "minor" && baselineASA >= 3 && hasCardiovascularComorbidity)
  ) {
    investigations.add("ECG");
    reasons.push("ECG is indicated by surgery grade and cardiovascular, renal, or diabetes risk.");
  }

  if (intake.conditions.includes("dm")) {
    investigations.add("HbA1c");
    reasons.push("Known diabetes should have recent HbA1c available; test if not done within the last 3 months.");
  }

  if (needsCoagAssessment) {
    investigations.add("Coagulation profile");
    reasons.push("Coagulation testing is reserved for bleeding risk, liver disease, or anticoagulant exposure.");
  }

  if (intake.conditions.includes("liver")) {
    investigations.add("Liver function");
    reasons.push("Liver disease justifies targeted liver biochemistry.");
  }

  if (hasRespiratoryTrigger) {
    if (
      intake.conditions.includes("resp") ||
      therapy.asthma?.symptoms === "significant" ||
      intake.exam.includes("basalCrackles") ||
      intake.spo2 < 94
    ) {
      investigations.add("Chest X-ray");
      reasons.push("Chest X-ray is not routine, but active cardiopulmonary signs or symptoms make it reasonable.");
    }

    if (baselineASA >= 3 && surgeryGrade !== "minor") {
      investigations.add("Senior anesthetist review for respiratory disease");
      reasons.push("NICE-style practice favors senior anesthetist input rather than routine lung function testing in higher-risk respiratory disease.");
    }
  }

  if (intake.exam.includes("cardiacMurmur")) {
    investigations.add("ECG");
    reasons.push("ECG should be reviewed before deciding on any echocardiography request.");

    if (intake.exam.includes("basalCrackles") || intake.conditions.includes("cath")) {
      investigations.add("Echocardiography");
      reasons.push("Echocardiography should be targeted to murmur with cardiac symptoms or signs of heart failure, not ordered routinely.");
    }
  }

  if (surgeryGrade === "minor" && baselineASA <= 2 && investigations.size === 0) {
    reasons.push("No routine preoperative investigations are indicated for minor surgery in ASA 1-2 patients.");
  }

  return {
    score,
    baselineASA,
    surgeryGrade,
    reasons,
    investigations: Array.from(investigations),
    optimizationHints: optimization,
  };
}

function estimateASA(intake, results) {
  let asa = 1;
  const notes = [];

  if (
    intake.conditions.length ||
    intake.exam.length ||
    intake.previousAnesthesia === "complicated"
  ) {
    asa = 2;
  }

  const majorCondition =
    intake.conditions.includes("cns") ||
    intake.conditions.includes("renal") ||
    intake.conditions.includes("liver") ||
    intake.conditions.includes("arrhythmia") ||
    intake.conditions.includes("cath") ||
    intake.exam.includes("basalCrackles") ||
    intake.exam.includes("cardiacMurmur") ||
    intake.spo2 < 94;

  if (majorCondition) {
    asa = Math.max(asa, 3);
    notes.push("Systemic disease with functional or organ impact is present.");
  }

  const severeFinding =
    intake.bp?.systolic >= 180 ||
    intake.bp?.diastolic >= 110 ||
    results.ecgResult === "major" ||
    results.echoResult === "significant" ||
    results.cxrResult === "major" ||
    (results.creatinine && results.creatinine >= 2) ||
    (results.glucose && results.glucose >= 300) ||
    (results.hb && results.hb < 8) ||
    (results.inr && results.inr >= 1.8) ||
    (results.sodium && (results.sodium < 130 || results.sodium > 150)) ||
    (results.potassium && (results.potassium < 3 || results.potassium > 5.8));

  if (severeFinding) {
    asa = Math.max(asa, 4);
    notes.push("One or more findings suggest a severe systemic disease state.");
  }

  if (intake.surgeryRisk === "high" && asa < 3 && intake.conditions.length >= 2) {
    asa = 3;
    notes.push("Multiple comorbidities with major surgery increase baseline risk.");
  }

  return {
    asa,
    notes,
  };
}

function generateOptimization(intake, results) {
  const actions = [];
  const warnings = [];
  const therapy = intake.conditionTherapy || {};

  if (intake.conditions.includes("htn") && therapy.htn?.status === "not-taking") {
    actions.push("Start or re-establish antihypertensive optimization before elective surgery.");
  }

  if (intake.conditions.includes("dm") && therapy.dm?.status === "not-taking") {
    actions.push("Start or re-establish diabetes treatment and glycemic optimization before elective surgery.");
  }

  if (
    intake.conditions.includes("asthma") &&
    therapy.asthma?.status === "not-taking" &&
    therapy.asthma?.symptoms !== "significant"
  ) {
    actions.push("Optimize asthma therapy before elective surgery because the patient is not taking medication.");
  }

  if (
    intake.conditions.includes("asthma") &&
    (therapy.asthma?.symptoms === "mild" || therapy.asthma?.symptoms === "significant")
  ) {
    warnings.push("Asthma with active respiratory symptoms requires pulmonary optimization before anesthesia.");
  }

  if (results.hb && results.hb < 10) {
    actions.push("Investigate and optimize anemia before elective surgery.");
  }
  if (results.hb && results.hb < 8) {
    warnings.push("Severe anemia may justify postponement for further management.");
  }

  if (results.glucose && results.glucose > 200) {
    actions.push("Improve glycemic control and coordinate perioperative insulin plan.");
  }
  if (results.hba1c && results.hba1c > 8.5) {
    warnings.push("Poor chronic glycemic control increases wound and infection risk.");
  }

  if (results.creatinine && results.creatinine > 1.5) {
    actions.push("Adjust fluid strategy and drug dosing for renal impairment.");
  }

  if (results.potassium && (results.potassium < 3.2 || results.potassium > 5.5)) {
    warnings.push("Potassium abnormality should be corrected before anesthesia if elective.");
  }

  if (results.sodium && (results.sodium < 130 || results.sodium > 150)) {
    warnings.push("Important sodium disturbance requires clarification and correction.");
  }

  if (results.inr && results.inr > 1.5) {
    actions.push("Clarify anticoagulant exposure and correct coagulopathy before neuraxial or major surgery.");
  }

  if (results.ecgResult === "major") {
    warnings.push("Major ECG abnormality suggests cardiology input before proceeding.");
  }

  if (results.echoResult === "significant") {
    warnings.push("Significant echo abnormality indicates substantial cardiac risk.");
  }

  if (results.cxrResult === "major") {
    actions.push("Optimize cardiopulmonary status and investigate active chest pathology.");
  }

  if (intake.conditions.includes("smoking")) {
    actions.push("Encourage smoking cessation and pulmonary prehabilitation if time allows.");
  }

  if (
    (intake.conditions.includes("asthma") || intake.conditions.includes("resp")) &&
    (intake.spo2 < 94 || results.cxrResult === "major")
  ) {
    actions.push("Consider bronchodilator optimization and respiratory review.");
  }

  if (intake.exam.includes("airwayConcern")) {
    actions.push("Document airway plan, equipment, and senior support early.");
  }

  if (!actions.length) {
    actions.push("No major optimization trigger detected from entered results.");
  }

  return { actions, warnings };
}

function buildFallbackIntakeResponse(intake) {
  const assessment = scoreRisk(intake);
  const riskLevel =
    assessment.score <= 2
      ? "lower"
      : assessment.score <= 5
        ? "moderate"
        : "higher";

  return {
    model: "rules-fallback",
    summary: `Baseline review suggests a ${riskLevel} perioperative concern profile for the entered data.`,
    riskLevel,
    riskScore: assessment.score,
    baselineASA: assessment.baselineASA,
    surgeryGrade: assessment.surgeryGrade,
    investigations: assessment.investigations,
    rationale: assessment.reasons,
    optimizationFlags: assessment.optimizationHints.length
      ? assessment.optimizationHints
      : ["No immediate optimization flag from baseline data."],
    disclaimer:
      "Decision support only. Final investigation selection should follow anesthesiology judgment and local protocol.",
  };
}

function buildFallbackResultsResponse(intake, results) {
  const assessment = scoreRisk(intake);
  const optimization = generateOptimization(intake, results);
  const asa = estimateASA(intake, results);

  return {
    model: "rules-fallback",
    summary: `Returned results support a provisional ASA ${asa.asa} classification.`,
    asa: asa.asa,
    asaRationale: asa.notes.length
      ? asa.notes
      : ["Mild or well-controlled systemic disease profile based on current entries."],
    optimizationActions: optimization.actions,
    escalationConcerns: optimization.warnings.length
      ? optimization.warnings
      : ["No strong postponement trigger was detected from current entries."],
    baselineRiskScore: assessment.score,
    disclaimer:
      "Decision support only. Final ASA assignment and case clearance must remain clinician-led.",
  };
}

module.exports = {
  parseBP,
  estimateBaselineASA,
  surgeryGradeFromRisk,
  scoreRisk,
  estimateASA,
  generateOptimization,
  buildFallbackIntakeResponse,
  buildFallbackResultsResponse,
};
