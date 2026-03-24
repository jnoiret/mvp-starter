"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import { CvParsingProgressCard } from "@/components/onboarding/CvParsingProgress";
import { AiFirstProfileReview, type AiReviewForm } from "@/components/onboarding/AiFirstProfileReview";
import { ManualEntryStep } from "@/components/onboarding/ManualEntryStep";
import { ParseRecoveryPanel } from "@/components/onboarding/ParseRecoveryPanel";
import { COPY_CV_PARTIAL } from "@/lib/cv/parseDiagnostics";
import { clearOnboardingData, loadOnboardingData, saveOnboardingData } from "./storage";
import {
  countMeaningfulParsedFields,
  parseCandidateProfileFromCv,
  parseCandidateProfileFromPastedText,
} from "./cvParser";
import type { CandidateOnboardingData, WorkMode } from "./types";

type StepId =
  | "cv_upload"
  | "paste"
  | "parsing"
  | "parse_recovery"
  | "manual_minimal"
  | "ai_review"
  | "confirm";

type AsyncStatus = "idle" | "loading" | "success" | "error";
type ParseRecoveryKind = "extraction_failed" | "weak";

const TOTAL_STEPS = 4;
const MIN_MEANINGFUL_FOR_SUCCESS = 3;
const MIN_MEANINGFUL_FOR_PARTIAL = 3;

function stepProgress(step: StepId): number {
  switch (step) {
    case "cv_upload":
    case "paste":
      return 1;
    case "parsing":
    case "parse_recovery":
    case "manual_minimal":
      return 2;
    case "ai_review":
      return 3;
    case "confirm":
      return 4;
    default:
      return 1;
  }
}

function buildDefaultData(): CandidateOnboardingData {
  return {
    full_name: "",
    email: "",
    phone: "",
    whatsapp: "",
    location: "",
    city: "",
    current_title: "",
    target_role: "",
    seniority: "",
    years_experience: "",
    skills: "",
    tools: "",
    industries: "",
    specializations: "",
    languages: "",
    education: "",
    summary: "",
    expected_salary: "",
    work_mode: "",
    cv_file: null,
  };
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function onlyDigits(value: string) {
  return value.replace(/[^\d]/g, "");
}

function normalizeMoney(value: string) {
  return value.replace(/[^\d]/g, "");
}

function reviewFormFromData(d: CandidateOnboardingData): AiReviewForm {
  const wm =
    d.work_mode === "remoto" ||
    d.work_mode === "hibrido" ||
    d.work_mode === "presencial" ||
    d.work_mode === "indiferente"
      ? d.work_mode
      : "";
  return {
    full_name: d.full_name,
    email: d.email,
    whatsapp: onlyDigits(d.whatsapp || d.phone),
    city: (d.city || d.location).trim(),
    target_role: d.target_role,
    years_experience: onlyDigits(d.years_experience),
    skills: d.skills,
    summary: d.summary,
    expected_salary: normalizeMoney(d.expected_salary) || "1",
    work_mode: wm,
  };
}

function mergeReviewToData(
  form: AiReviewForm,
  prev: CandidateOnboardingData,
): CandidateOnboardingData {
  return {
    ...prev,
    full_name: form.full_name,
    email: form.email.trim() || prev.email,
    whatsapp: form.whatsapp,
    phone: prev.phone || form.whatsapp,
    city: form.city,
    location: form.city,
    target_role: form.target_role,
    years_experience: form.years_experience,
    skills: form.skills,
    summary: form.summary,
    expected_salary: form.expected_salary,
    work_mode: (form.work_mode || prev.work_mode) as WorkMode | "",
  };
}

function buildWizardManualDefaults(prev: CandidateOnboardingData): AiReviewForm {
  return {
    full_name: prev.full_name.trim() || "Candidato",
    email: prev.email,
    whatsapp: onlyDigits(prev.whatsapp || prev.phone) || "0000000000",
    city: (prev.city || prev.location || "Por definir").trim(),
    target_role: prev.target_role.trim() || "Por definir",
    years_experience: onlyDigits(prev.years_experience) || "0",
    skills: prev.skills.trim() || "Por completar en tu perfil",
    summary: prev.summary.trim(),
    expected_salary: normalizeMoney(prev.expected_salary) || "1",
    work_mode: (prev.work_mode as WorkMode) || "indiferente",
  };
}

function parsedProfileToReviewForm(
  parsed: Awaited<ReturnType<typeof parseCandidateProfileFromCv>>["data"],
  prev: CandidateOnboardingData,
): AiReviewForm {
  const years = onlyDigits(parsed.years_experience) || "0";
  const salaryRaw = normalizeMoney(parsed.expected_salary) || "1";
  const wm =
    parsed.work_mode === "remoto" ||
    parsed.work_mode === "hibrido" ||
    parsed.work_mode === "presencial" ||
    parsed.work_mode === "indiferente"
      ? parsed.work_mode
      : "indiferente";

  const skillsCombined = [parsed.skills, parsed.tools]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(", ");

  const phoneDigits = onlyDigits(parsed.whatsapp || parsed.phone);

  return {
    full_name: parsed.full_name.trim() || prev.full_name || "Candidato",
    email: prev.email,
    whatsapp: phoneDigits.length >= 8 ? phoneDigits : phoneDigits || "0000000000",
    city: (parsed.city || parsed.location || prev.city || "Por definir").trim(),
    target_role: (parsed.target_role || parsed.current_title || "Por definir").trim(),
    years_experience: years,
    skills: skillsCombined || "Por completar en tu perfil",
    summary: (parsed.summary ?? "").trim(),
    expected_salary: salaryRaw && salaryRaw !== "0" ? salaryRaw : "1",
    work_mode: wm,
  };
}

function applyParsedToData(
  parsed: Awaited<ReturnType<typeof parseCandidateProfileFromCv>>["data"],
  prev: CandidateOnboardingData,
): CandidateOnboardingData {
  return {
    ...prev,
    ...parsed,
    full_name: prev.full_name || parsed.full_name,
    email: prev.email || parsed.email,
    phone: prev.phone || parsed.phone,
    whatsapp: prev.whatsapp || parsed.whatsapp,
    location: prev.location || parsed.location,
    city: prev.city || parsed.city,
    current_title: prev.current_title || parsed.current_title,
    target_role: prev.target_role || parsed.target_role,
    seniority: prev.seniority || parsed.seniority,
    years_experience: prev.years_experience || parsed.years_experience,
    skills: prev.skills || parsed.skills,
    tools: prev.tools || parsed.tools,
    industries: prev.industries || parsed.industries,
    specializations: prev.specializations || parsed.specializations,
    languages: prev.languages || parsed.languages,
    education: prev.education || parsed.education,
    summary: prev.summary || parsed.summary,
    expected_salary: prev.expected_salary || parsed.expected_salary,
    work_mode: (prev.work_mode || parsed.work_mode) as WorkMode | "",
    cv_file: prev.cv_file,
  };
}

function Progress({ currentStep }: { currentStep: StepId }) {
  const stepNumber = stepProgress(currentStep);
  const pct = Math.round((stepNumber / TOTAL_STEPS) * 100);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-[#475569]">
        <span>
          Paso {stepNumber} de {TOTAL_STEPS}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-[#E2E8F0]">
        <div
          className="ds-accent-gradient h-2 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function validateCvFileInstance(file: File | null) {
  if (!file) return "Por favor, sube tu CV.";
  const fileName = file.name.toLowerCase();
  const mime = file.type;
  const isAccepted =
    mime === "application/pdf" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.endsWith(".pdf") ||
    fileName.endsWith(".docx");
  if (!isAccepted) return "Formato no compatible. Sube tu CV en PDF o DOCX.";
  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) return "Tu archivo supera el tamaño máximo de 5 MB.";
  return null;
}

function validateProfileWithoutEmail(data: CandidateOnboardingData) {
  if (!data.full_name.trim()) return "Escribe tu nombre completo.";
  const whatsappDigits = onlyDigits(data.whatsapp || data.phone);
  if (!whatsappDigits || whatsappDigits.length < 8)
    return "Escribe un teléfono o WhatsApp válido (mínimo 8 dígitos).";
  if (!(data.city || data.location).trim()) return "Escribe tu ubicación.";
  if (!data.target_role.trim()) return "Escribe tu rol objetivo.";

  const years = Number(onlyDigits(data.years_experience));
  if (!Number.isFinite(years) || years < 0 || years > 60)
    return "Ingresa años de experiencia válidos.";

  if (!data.skills.trim()) return "Agrega al menos una habilidad.";

  const salary = Number(normalizeMoney(data.expected_salary));
  if (!Number.isFinite(salary) || salary <= 0) return "Ingresa un salario esperado válido.";

  if (!data.work_mode) return "Selecciona una modalidad de trabajo.";

  return null;
}

function validateProfile(data: CandidateOnboardingData) {
  if (!data.email.trim() || !isEmail(data.email)) return "Escribe un correo válido.";
  return validateProfileWithoutEmail(data);
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      inputMode={inputMode}
      className="ds-input"
    />
  );
}

export function CandidateOnboardingWizard() {
  const router = useRouter();
  const cvFileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<StepId>("cv_upload");
  const [data, setData] = useState<CandidateOnboardingData>(buildDefaultData);
  const [reviewForm, setReviewForm] = useState<AiReviewForm>(() => reviewFormFromData(buildDefaultData()));

  const [cvParseSucceeded, setCvParseSucceeded] = useState(false);
  const [skippedCv, setSkippedCv] = useState(false);
  const [cvUploaded, setCvUploaded] = useState(false);
  const [cvEntryMode, setCvEntryMode] = useState<"none" | "file" | "paste">("none");
  const [pasteDraft, setPasteDraft] = useState("");
  const [parseRecoveryKind, setParseRecoveryKind] = useState<ParseRecoveryKind | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [partialProfileNotice, setPartialProfileNotice] = useState<string | null>(null);
  const [parseStatus, setParseStatus] = useState<AsyncStatus>("idle");
  const [submitStatus, setSubmitStatus] = useState<{ type: AsyncStatus; message?: string }>({
    type: "idle",
  });
  const [uploadStatus, setUploadStatus] = useState<{ type: AsyncStatus; message?: string }>({
    type: "idle",
  });

  useEffect(() => {
    const loaded = loadOnboardingData();
    if (!loaded) return;
    setData((prev) => ({ ...prev, ...loaded, cv_file: null }));
    setReviewForm(reviewFormFromData({ ...buildDefaultData(), ...loaded, cv_file: null }));
  }, []);

  useEffect(() => {
    saveOnboardingData(data);
  }, [data]);

  useEffect(() => {
    console.log("[onboarding:wizard] step", step, {
      cvFileSelected: Boolean(data.cv_file),
      cvParseSucceeded,
      skippedCv,
    });
  }, [step, data.cv_file, cvParseSucceeded, skippedCv]);

  const headerDescription = useMemo(() => {
    if (step === "cv_upload") {
      return "Sube tu CV o pega el texto: generamos tu perfil con IA. La entrada manual es el último recurso.";
    }
    if (step === "paste") {
      return "Pega el contenido de tu CV; usamos el mismo análisis que con el archivo.";
    }
    if (step === "parsing") {
      return "Analizamos tu experiencia, habilidades y trayectoria para ahorrarte tiempo.";
    }
    if (step === "parse_recovery") {
      return "Elige cómo quieres continuar.";
    }
    if (step === "manual_minimal") {
      return "Solo lo esencial; después verás tu perfil por secciones con guías claras.";
    }
    if (step === "ai_review") {
      return cvParseSucceeded && !skippedCv
        ? "Revisa rol, resumen y habilidades; completamos lo que falte con indicaciones."
        : "Ajusta lo resaltado y confirma contacto y expectativas.";
    }
    return "Confirma tu correo y guarda tu perfil.";
  }, [step, cvParseSucceeded, skippedCv]);

  type ParseResult = Awaited<ReturnType<typeof parseCandidateProfileFromCv>>;

  const applyServerParseResult = useCallback(async (loadParse: () => Promise<ParseResult>) => {
    setError(null);
    setPartialProfileNotice(null);
    setParseRecoveryKind(null);
    setCvUploaded(true);
    setSkippedCv(false);
    setCvParseSucceeded(false);
    setParseStatus("loading");
    setStep("parsing");

    try {
      const result = await loadParse();
      const meaningful = countMeaningfulParsedFields(result.data);

      let mergedForReview: CandidateOnboardingData | undefined;
      setData((prev) => {
        mergedForReview = applyParsedToData(result.data, prev);
        return mergedForReview;
      });
      if (mergedForReview) {
        setReviewForm(parsedProfileToReviewForm(result.data, mergedForReview));
      }

      setParseStatus("success");

      const tier = result.parse_tier;
      const unusableInput = result.parse_feedback === "no_selectable_text";
      const weakProfile =
        result.parse_feedback === "weak_profile_data" || meaningful < MIN_MEANINGFUL_FOR_SUCCESS;

      if (unusableInput || tier === "extraction_failed") {
        setCvParseSucceeded(false);
        setPartialProfileNotice(null);
        setParseRecoveryKind("extraction_failed");
        setStep("parse_recovery");
        return;
      }

      if (weakProfile || tier === "weak") {
        setCvParseSucceeded(false);
        setPartialProfileNotice(null);
        setParseRecoveryKind("weak");
        setStep("parse_recovery");
        return;
      }

      setCvParseSucceeded(true);
      const showPartial =
        meaningful >= MIN_MEANINGFUL_FOR_PARTIAL &&
        (meaningful < 6 || Boolean(result.warning));
      setPartialProfileNotice(showPartial ? COPY_CV_PARTIAL : null);
      setStep("ai_review");
    } catch {
      setParseStatus("error");
      setCvParseSucceeded(false);
      setPartialProfileNotice(null);
      setParseRecoveryKind("weak");
      setCvEntryMode("none");
      setStep("parse_recovery");
    }
  }, []);

  const handleFileSelected = async (file: File | null) => {
    const cvError = validateCvFileInstance(file);
    if (cvError) {
      setError(cvError);
      return;
    }
    setData((prev) => ({ ...prev, cv_file: file }));
    setCvEntryMode("file");
    await applyServerParseResult(() => parseCandidateProfileFromCv(file as File));
  };

  const submitPastedCvText = async () => {
    const trimmed = pasteDraft.trim();
    if (trimmed.length < 40) {
      setError("Pega al menos unas líneas de tu CV (mínimo ~40 caracteres) para que podamos analizarlo.");
      return;
    }
    setError(null);
    setCvEntryMode("paste");
    await applyServerParseResult(() => parseCandidateProfileFromPastedText(trimmed));
  };

  const goManualEntry = () => {
    setParseRecoveryKind(null);
    setPartialProfileNotice(null);
    setError(null);
    setCvUploaded(false);
    setSkippedCv(true);
    setCvParseSucceeded(false);
    setCvEntryMode("none");
    setReviewForm(buildWizardManualDefaults(data));
    setStep("manual_minimal");
  };

  const continueFromManualMinimal = () => {
    setError(null);
    const merged = mergeReviewToData(reviewForm, data);
    const v = validateProfileWithoutEmail(merged);
    if (v) {
      setError(v);
      return;
    }
    setData(merged);
    setCvParseSucceeded(true);
    setPartialProfileNotice(null);
    setStep("ai_review");
  };

  const continueFromAiReview = () => {
    setError(null);
    const merged = mergeReviewToData(reviewForm, data);
    const v = validateProfileWithoutEmail(merged);
    if (v) {
      setError(v);
      return;
    }
    setData(merged);
    setStep("confirm");
  };

  const handleParseRecoveryRetry = () => {
    setParseRecoveryKind(null);
    setError(null);
    setStep("cv_upload");
  };

  const handleParseRecoveryPaste = () => {
    setParseRecoveryKind(null);
    setError(null);
    setStep("paste");
  };

  const handleBackFromAiReview = () => {
    setError(null);
    if (skippedCv && !cvUploaded && cvEntryMode === "none") {
      setStep("manual_minimal");
      return;
    }
    if (cvEntryMode === "paste") {
      setStep("paste");
      return;
    }
    setStep("cv_upload");
    setCvUploaded(false);
    setCvParseSucceeded(false);
    setSkippedCv(false);
    setPartialProfileNotice(null);
    setCvEntryMode("none");
  };

  function goBack() {
    setError(null);
    if (step === "paste") {
      setStep("cv_upload");
      return;
    }
    if (step === "parse_recovery") {
      setStep("cv_upload");
      setParseRecoveryKind(null);
      return;
    }
    if (step === "manual_minimal") {
      setStep("cv_upload");
      return;
    }
    if (step === "ai_review") {
      handleBackFromAiReview();
      return;
    }
    if (step === "confirm") {
      setStep("ai_review");
    }
  }

  function restart() {
    clearOnboardingData();
    setData(buildDefaultData());
    setReviewForm(reviewFormFromData(buildDefaultData()));
    setError(null);
    setParseStatus("idle");
    setPartialProfileNotice(null);
    setSubmitStatus({ type: "idle" });
    setUploadStatus({ type: "idle" });
    setCvParseSucceeded(false);
    setSkippedCv(false);
    setCvUploaded(false);
    setCvEntryMode("none");
    setPasteDraft("");
    setParseRecoveryKind(null);
    setStep("cv_upload");
  }

  async function handleFinalSubmit() {
    const profileError = validateProfile(data);
    if (profileError) {
      setError(profileError);
      setStep("ai_review");
      return;
    }

    setSubmitStatus({ type: "loading" });
    setUploadStatus({ type: "loading", message: "Guardando perfil..." });
    setError(null);

    try {
      const formData = new FormData();
      formData.append("full_name", data.full_name.trim());
      formData.append("email", data.email.trim());
      formData.append("whatsapp", (data.whatsapp || data.phone).trim());
      formData.append("city", (data.city || data.location).trim());
      formData.append("target_role", data.target_role.trim());
      formData.append("years_experience", String(Number(onlyDigits(data.years_experience))));
      formData.append("skills", data.skills.trim());
      formData.append("expected_salary", String(Number(normalizeMoney(data.expected_salary))));
      formData.append("work_mode", data.work_mode);
      formData.append("summary", data.summary.trim());
      formData.append("industries", data.industries.trim());

      const saveResponse = await fetch("/api/candidate/save-profile", {
        method: "POST",
        body: formData,
      });

      const savePayload = (await saveResponse.json()) as {
        success?: boolean;
        error?: string;
        reason?: string;
        data?: { id?: string | null };
      };

      if (!saveResponse.ok || !savePayload.success) {
        const message = savePayload.error ?? "No se pudo guardar el perfil.";
        const detail = savePayload.reason ? ` ${savePayload.reason}` : "";
        setUploadStatus({ type: "error", message: `${message}${detail}`.trim() });
        setSubmitStatus({ type: "error", message: `${message}${detail}`.trim() });
        return;
      }

      setUploadStatus({ type: "success", message: "Perfil guardado correctamente." });
      setSubmitStatus({
        type: "success",
        message: "Perfil guardado. Redirigiendo al dashboard…",
      });
      clearOnboardingData();
      router.push("/candidate/dashboard");
      router.refresh();
    } catch (err) {
      setSubmitStatus({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Error inesperado al guardar tu perfil.",
      });
      setUploadStatus({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Error inesperado al guardar tu perfil.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Onboarding" description={headerDescription} />

      <Progress currentStep={step} />

      {step === "cv_upload" ? (
        <section className="ds-card p-6">
          <h2 className="ds-heading text-base font-semibold tracking-tight">Crea tu perfil con IA</h2>
          <p className="ds-muted mt-1 text-sm leading-relaxed">
            Prioriza subir tu CV o pegar el texto; la entrada manual es el último recurso.
          </p>

          <input
            ref={cvFileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.item(0) ?? null;
              e.target.value = "";
              if (!picked) return;
              void handleFileSelected(picked);
            }}
          />

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              onClick={() => cvFileInputRef.current?.click()}
              className="sm:min-w-[180px]"
              disabled={parseStatus === "loading"}
            >
              Subir CV
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setError(null);
                setStep("paste");
              }}
              className="sm:min-w-[180px]"
            >
              Pegar texto de tu CV
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={goManualEntry}
              className="sm:min-w-[180px]"
            >
              Entrada manual
            </Button>
          </div>

          <p className="mt-4 text-xs text-[#64748B]">PDF o DOCX · máximo 5 MB</p>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </section>
      ) : null}

      {step === "paste" ? (
        <section className="ds-card p-6 space-y-4">
          <h2 className="ds-heading text-base font-semibold tracking-tight">Pega el texto de tu CV</h2>
          <textarea
            value={pasteDraft}
            onChange={(e) => {
              setPasteDraft(e.target.value);
              if (error) setError(null);
            }}
            rows={16}
            className="ds-input min-h-[220px] resize-y leading-relaxed"
            placeholder="Pega aquí el contenido completo de tu CV (texto plano)…"
            aria-label="Texto del CV"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" type="button" onClick={() => goBack()}>
              Atrás
            </Button>
            <Button type="button" onClick={() => void submitPastedCvText()}>
              Generar perfil desde texto
            </Button>
          </div>
        </section>
      ) : null}

      {step === "parsing" ? (
        <section className="ds-card p-6">
          <h2 className="ds-heading text-base font-semibold tracking-tight">
            Estamos generando tu perfil
          </h2>
          <p className="ds-muted mt-1 text-sm leading-relaxed">
            Analizamos tu experiencia, habilidades y trayectoria para ahorrarte tiempo.
          </p>
          <CvParsingProgressCard className="mt-6" />
        </section>
      ) : null}

      {step === "parse_recovery" && parseRecoveryKind ? (
        <section className="ds-card p-6 space-y-6">
          <h2 className="ds-heading text-base font-semibold tracking-tight">Siguiente paso</h2>
          <ParseRecoveryPanel
            kind={parseRecoveryKind}
            onRetryUpload={handleParseRecoveryRetry}
            onGoPaste={handleParseRecoveryPaste}
            onGoManual={goManualEntry}
          />
          <Button variant="secondary" type="button" onClick={() => goBack()}>
            Volver al inicio
          </Button>
        </section>
      ) : null}

      {step === "manual_minimal" ? (
        <section className="ds-card p-6">
          <h2 className="ds-heading text-base font-semibold tracking-tight mb-4">Entrada manual</h2>
          <ManualEntryStep
            form={reviewForm}
            setForm={setReviewForm}
            error={error}
            variant="authenticated"
            onBack={() => {
              setError(null);
              setStep("cv_upload");
            }}
            onContinue={continueFromManualMinimal}
          />
        </section>
      ) : null}

      {step === "ai_review" ? (
        <section className="ds-card p-6 space-y-4">
          {partialProfileNotice ? (
            <p className="rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-2.5 text-sm leading-relaxed text-slate-700">
              {partialProfileNotice}
            </p>
          ) : null}
          <AiFirstProfileReview
            form={reviewForm}
            setForm={setReviewForm}
            isPublic
            error={error}
            onContinue={continueFromAiReview}
            onBack={handleBackFromAiReview}
            cvEntryMode={
              skippedCv && !cvUploaded && cvEntryMode === "none"
                ? "none"
                : cvEntryMode === "paste"
                  ? "paste"
                  : "file"
            }
          />
        </section>
      ) : null}

      {step === "confirm" ? (
        <section className="ds-card p-6">
          <h2 className="ds-heading text-base font-semibold tracking-tight">
            Confirmar y guardar
          </h2>
          <p className="ds-muted mt-1 text-sm">
            Indica tu correo y revisa el resumen. Si lo necesitas, puedes volver a editar.
          </p>

          <div className="mt-6">
            <label className="mb-1 block text-xs font-medium text-[#475569]">
              Correo electrónico
            </label>
            <Input
              value={data.email}
              onChange={(v) => setData((prev) => ({ ...prev, email: v }))}
              placeholder="Ej. ana@correo.com.mx"
              type="email"
            />
            <p className="mt-1.5 text-xs text-[#64748B]">
              Lo usamos para tu cuenta y comunicación sobre tus postulaciones.
            </p>
          </div>

          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-[#475569]">Nombre completo</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{data.full_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#475569]">WhatsApp</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{data.whatsapp || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#475569]">Ciudad</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{data.city || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#475569]">Rol objetivo</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{data.target_role || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#475569]">Años de experiencia</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{data.years_experience || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#475569]">Skills</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{data.skills || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-[#475569]">Resumen</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{data.summary || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#475569]">Salario esperado</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{data.expected_salary || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#475569]">Modalidad</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{data.work_mode || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#475569]">CV</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">
                {data.cv_file ? data.cv_file.name : "No seleccionado"}
              </dd>
            </div>
          </dl>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button variant="secondary" type="button" onClick={restart} className="sm:min-w-[140px]">
                Reiniciar
              </Button>
              <Button variant="secondary" type="button" onClick={goBack} className="sm:min-w-[140px]">
                Editar
              </Button>
            </div>
            <Button
              type="button"
              onClick={handleFinalSubmit}
              disabled={submitStatus.type === "loading"}
              className="sm:min-w-[220px] shadow-md"
            >
              {submitStatus.type === "loading" ? "Guardando..." : "Guardar perfil"}
            </Button>
          </div>

          {uploadStatus.type === "loading" && uploadStatus.message ? (
            <p className="mt-4 text-sm text-[#475569]">{uploadStatus.message}</p>
          ) : null}
          {uploadStatus.type === "success" && uploadStatus.message ? (
            <p className="mt-4 text-sm text-emerald-600">{uploadStatus.message}</p>
          ) : null}
          {uploadStatus.type === "error" && uploadStatus.message ? (
            <p className="mt-4 text-sm text-red-600">{uploadStatus.message}</p>
          ) : null}

          {submitStatus.type === "success" && submitStatus.message ? (
            <p className="mt-4 text-sm text-emerald-600">{submitStatus.message}</p>
          ) : null}
          {submitStatus.type === "error" && submitStatus.message ? (
            <p className="mt-4 text-sm text-red-600">{submitStatus.message}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
