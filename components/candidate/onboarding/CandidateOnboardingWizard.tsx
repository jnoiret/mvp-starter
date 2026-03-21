"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import { clearOnboardingData, loadOnboardingData, saveOnboardingData } from "./storage";
import { parseCandidateProfileFromCv } from "./cvParser";
import type { CandidateOnboardingData, WorkMode } from "./types";

type StepId = "cv_upload" | "parsing" | "review_edit" | "confirm";

type AsyncStatus = "idle" | "loading" | "success" | "error";
type CvDetectedField =
  | "full_name"
  | "email"
  | "phone"
  | "location"
  | "current_title"
  | "target_role"
  | "years_experience"
  | "skills";

const TOTAL_STEPS = 4;

const stepOrder: StepId[] = ["cv_upload", "parsing", "review_edit", "confirm"];

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

function Progress({ currentStep }: { currentStep: StepId }) {
  const idx = stepOrder.indexOf(currentStep);
  const stepNumber = Math.min(Math.max(idx + 1, 1), TOTAL_STEPS);
  const pct = Math.round((stepNumber / TOTAL_STEPS) * 100);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-[#475569]">
        <span>Paso {stepNumber} de {TOTAL_STEPS}</span>
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

function Textarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={4}
      className="ds-input resize-none"
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="ds-input">
      <option value="" disabled>
        Selecciona una opción
      </option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function FieldLabel({
  children,
  detected,
}: {
  children: React.ReactNode;
  detected?: boolean;
}) {
  return (
    <div className="mb-1 flex items-center gap-2">
      <label className="block text-xs font-medium text-[#475569]">{children}</label>
      {detected ? (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
          Detectado del CV
        </span>
      ) : null}
    </div>
  );
}

function validateCvFile(data: CandidateOnboardingData) {
  if (!data.cv_file) return "Por favor, sube tu CV.";
  const fileName = data.cv_file.name.toLowerCase();
  const mime = data.cv_file.type;
  const isAccepted =
    mime === "application/pdf" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.endsWith(".pdf") ||
    fileName.endsWith(".docx");
  if (!isAccepted) return "Formato no compatible. Sube tu CV en PDF o DOCX.";
  const maxBytes = 5 * 1024 * 1024;
  if (data.cv_file.size > maxBytes) return "Tu archivo supera el tamaño máximo de 5 MB.";
  return null;
}

function validateProfile(data: CandidateOnboardingData) {
  if (!data.full_name.trim()) return "Escribe tu nombre completo.";
  if (!data.email.trim() || !isEmail(data.email)) return "Escribe un correo válido.";
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

function getPrefillSignalCount(data: Partial<CandidateOnboardingData>) {
  const scalarSignals = [
    data.full_name,
    data.email,
    data.phone,
    data.location,
    data.current_title,
    data.target_role,
    data.years_experience,
    data.summary,
  ].filter((value) => typeof value === "string" && value.trim().length > 0).length;

  const listSignals = [data.skills, data.tools, data.industries, data.languages, data.education]
    .filter((value) => typeof value === "string" && value.split(",").some((item) => item.trim()))
    .length;

  return scalarSignals + listSignals;
}

export function CandidateOnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<StepId>("cv_upload");
  const [data, setData] = useState<CandidateOnboardingData>(buildDefaultData);
  const [error, setError] = useState<string | null>(null);
  const [reviewNotice, setReviewNotice] = useState<{
    type: "success" | "fallback";
    title: string;
    body?: string;
    secondary?: string;
  } | null>(null);
  const [parseStatus, setParseStatus] = useState<AsyncStatus>("idle");
  const [detectedCvFields, setDetectedCvFields] = useState<Set<CvDetectedField>>(new Set());
  const [submitStatus, setSubmitStatus] = useState<
    { type: AsyncStatus; message?: string }
  >({ type: "idle" });
  const [uploadStatus, setUploadStatus] = useState<
    { type: AsyncStatus; message?: string }
  >({ type: "idle" });

  useEffect(() => {
    const loaded = loadOnboardingData();
    if (!loaded) return;
    setData((prev) => ({ ...prev, ...loaded, cv_file: null }));
  }, []);

  useEffect(() => {
    saveOnboardingData(data);
  }, [data]);

  const headerDescription = useMemo(() => {
    if (step === "cv_upload") return "Sube tu CV para completar tu perfil en menos tiempo.";
    if (step === "parsing") {
      const isPdfFile =
        data.cv_file?.type === "application/pdf" ||
        data.cv_file?.name.toLowerCase().endsWith(".pdf");
      return isPdfFile ? "Estamos leyendo tu CV escaneado..." : "Estamos analizando tu CV...";
    }
    if (step === "review_edit") return "Revisa y ajusta la información detectada.";
    return "Confirma tus datos antes de guardar tu perfil.";
  }, [step, data.cv_file]);

  async function handleStartParsing() {
    const cvError = validateCvFile(data);
    if (cvError) {
      setError(cvError);
      return;
    }

    setError(null);
    setReviewNotice(null);
    setDetectedCvFields(new Set());

    setParseStatus("loading");
    setStep("parsing");

    try {
      const result = await parseCandidateProfileFromCv(data.cv_file as File);
      const parsed = result.data;
      console.info("[onboarding] raw parse-cv response", result.raw_response);
      console.info("[onboarding] response.parsed_profile", result.parsed_profile);
      console.info("[onboarding] response.meta", result.meta);
      console.info("[onboarding] parsed data object", parsed);
      const nextDetectedFields = new Set<CvDetectedField>();
      if (parsed.full_name.trim()) nextDetectedFields.add("full_name");
      if (parsed.email.trim()) nextDetectedFields.add("email");
      if ((parsed.phone || parsed.whatsapp).trim()) nextDetectedFields.add("phone");
      if ((parsed.location || parsed.city).trim()) nextDetectedFields.add("location");
      if (parsed.current_title.trim()) nextDetectedFields.add("current_title");
      if (parsed.target_role.trim()) nextDetectedFields.add("target_role");
      if (parsed.years_experience.trim()) nextDetectedFields.add("years_experience");
      if (parsed.skills.trim()) nextDetectedFields.add("skills");
      setDetectedCvFields(nextDetectedFields);

      setData((prev) => {
        const next = {
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
          languages: prev.languages || parsed.languages,
          education: prev.education || parsed.education,
          summary: prev.summary || parsed.summary,
          expected_salary: prev.expected_salary || parsed.expected_salary,
          work_mode: (prev.work_mode || parsed.work_mode) as WorkMode | "",
        };
        console.info("[onboarding] form values before applying parsed data", prev);
        console.info("[onboarding] form values after applying parsed data", next);
        return next;
      });
      setParseStatus("success");
      const signalCount = getPrefillSignalCount(parsed);
      const mostlyEmpty = result.parsed_profile_empty || signalCount <= 2;
      if (mostlyEmpty) {
        setReviewNotice({
          type: "fallback",
          title:
            "No pudimos prellenar tu perfil automáticamente. Puedes completarlo manualmente o subir otro CV.",
        });
      } else {
        const hasMissingCoreFields = [
          parsed.full_name,
          parsed.email,
          parsed.phone || parsed.whatsapp,
          parsed.location || parsed.city,
          parsed.current_title,
          parsed.target_role,
          parsed.seniority,
          parsed.years_experience,
          parsed.skills,
        ].some((value) => !String(value ?? "").trim());

        setReviewNotice({
          type: "success",
          title: "Detectamos información en tu CV",
          body:
            "Prellenamos tu perfil automáticamente con base en tu CV. Revísalo y corrige lo que sea necesario antes de continuar.",
          secondary:
            hasMissingCoreFields || Boolean(result.warning)
              ? "Algunos campos no pudieron detectarse automáticamente. Puedes completarlos manualmente."
              : undefined,
        });
      }
      setStep("review_edit");
    } catch (err) {
      // Keep UX non-blocking: continue with empty fields on parse failure.
      setParseStatus("error");
      setDetectedCvFields(new Set());
      setReviewNotice({
        type: "fallback",
        title:
          "No pudimos prellenar tu perfil automáticamente. Puedes completarlo manualmente o subir otro CV.",
      });
      setStep("review_edit");
    }
  }

  function goToConfirm() {
    const profileError = validateProfile(data);
    if (profileError) {
      setError(profileError);
      return;
    }
    setError(null);
    setStep("confirm");
  }

  function goBack() {
    setError(null);
    if (step === "review_edit") {
      setStep("cv_upload");
      return;
    }
    if (step === "confirm") {
      setStep("review_edit");
    }
  }

  function restart() {
    clearOnboardingData();
    setData(buildDefaultData());
    setError(null);
    setParseStatus("idle");
    setReviewNotice(null);
    setDetectedCvFields(new Set());
    setSubmitStatus({ type: "idle" });
    setUploadStatus({ type: "idle" });
    setStep("cv_upload");
  }

  async function handleFinalSubmit() {
    const profileError = validateProfile(data);
    if (profileError) {
      setError(profileError);
      setStep("review_edit");
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

      console.log("[onboarding] calling /api/candidate/save-profile");
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
      console.log("[onboarding] save-profile response", {
        status: saveResponse.status,
        payload: savePayload,
      });

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
          <h2 className="ds-heading text-base font-semibold tracking-tight">1) Sube tu CV</h2>
          <p className="ds-muted mt-1 text-sm">
            Sube tu CV y prellenaremos tu perfil automáticamente.
          </p>

          <div className="mt-5 flex flex-col gap-3">
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) =>
                setData((prev) => ({
                  ...prev,
                  cv_file: e.target.files?.item(0) ?? null,
                }))
              }
              className="block w-full text-sm text-[#475569] file:mr-4 file:rounded-full file:border-0 file:bg-[#0F172A] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[#0B1220]"
            />

            {data.cv_file ? (
              <p className="text-xs text-[#475569]">
                Archivo:{" "}
                <span className="font-medium text-[#0F172A]">{data.cv_file.name}</span> (
                {Math.round(data.cv_file.size / 1024)} KB)
              </p>
            ) : (
              <>
                <p className="text-xs text-[#475569]">Formatos permitidos: PDF y DOCX</p>
                <p className="text-xs text-[#475569]">Tamaño máximo: 5 MB</p>
              </>
            )}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>

          <div className="mt-8 flex justify-end">
            <Button
              onClick={handleStartParsing}
              type="button"
              className="sm:min-w-[220px]"
              disabled={parseStatus === "loading"}
            >
              {parseStatus === "loading" ? "Estamos analizando tu CV..." : "Analizar CV"}
            </Button>
          </div>

          <div className="mt-8 flex justify-start">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setReviewNotice(null);
                setStep("review_edit");
              }}
              className="appearance-none border-0 bg-transparent px-0 py-1 text-sm text-[#64748B] shadow-none transition-colors hover:text-[#475569]"
            >
              Omitir y completar manualmente
            </button>
          </div>
        </section>
      ) : null}

      {step === "parsing" ? (
        <section className="ds-card p-6">
          {(() => {
            const isPdfFile =
              data.cv_file?.type === "application/pdf" ||
              data.cv_file?.name.toLowerCase().endsWith(".pdf");
            const parsingCopy = isPdfFile
              ? "Estamos leyendo tu CV escaneado..."
              : "Estamos analizando tu CV...";
            return (
              <>
          <h2 className="ds-heading text-base font-semibold tracking-tight">
            2) Analizando tu CV
          </h2>
          <p className="ds-muted mt-1 text-sm">
                {parsingCopy}
          </p>

          <div className="mt-6 flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#CBD5E1] border-t-[#4F46E5]" />
            <p className="text-sm text-[#475569]">
                  {parseStatus === "loading" ? parsingCopy : "Preparando información..."}
            </p>
          </div>
              </>
            );
          })()}
        </section>
      ) : null}

      {step === "review_edit" ? (
        <section className="ds-card p-6">
          <h2 className="ds-heading text-base font-semibold tracking-tight">
            3) Revisa y edita tu perfil
          </h2>
          <p className="ds-muted mt-1 text-sm">
            Prellenamos tu perfil con base en tu CV. Revísalo y corrige lo necesario antes de continuar.
          </p>

          {reviewNotice ? (
            <div
              className={`mt-3 rounded-xl px-4 py-3 ${
                reviewNotice.type === "fallback"
                  ? "border border-amber-200 bg-amber-50"
                  : "border border-blue-200 bg-blue-50"
              }`}
            >
              <p
                className={`text-sm font-medium ${
                  reviewNotice.type === "fallback" ? "text-amber-800" : "text-blue-800"
                }`}
              >
                {reviewNotice.title}
              </p>
              {reviewNotice.body ? (
                <p
                  className={`mt-1 text-sm ${
                    reviewNotice.type === "fallback" ? "text-amber-700" : "text-blue-700"
                  }`}
                >
                  {reviewNotice.body}
                </p>
              ) : null}
              {reviewNotice.secondary ? (
                <p
                  className={`mt-2 text-xs ${
                    reviewNotice.type === "fallback" ? "text-amber-700" : "text-blue-700"
                  }`}
                >
                  {reviewNotice.secondary}
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="mt-4 text-sm text-[#475569]">
            Todos los campos son editables. Tómate un minuto para dejar tu perfil listo.
          </p>

          <div className="mt-6 space-y-6">
            <section className="rounded-xl border border-zinc-100 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-[#0F172A]">Datos personales</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FieldLabel detected={detectedCvFields.has("full_name")}>
                    Nombre completo
                  </FieldLabel>
                  <Input
                    value={data.full_name}
                    onChange={(v) => setData((prev) => ({ ...prev, full_name: v }))}
                    placeholder="Ej. Ana Pérez"
                  />
                </div>
                <div>
                  <FieldLabel detected={detectedCvFields.has("email")}>
                    Correo electrónico
                  </FieldLabel>
                  <Input
                    value={data.email}
                    onChange={(v) => setData((prev) => ({ ...prev, email: v }))}
                    placeholder="Ej. ana@correo.com.mx"
                    type="email"
                  />
                </div>
                <div>
                  <FieldLabel detected={detectedCvFields.has("phone")}>Teléfono</FieldLabel>
                  <Input
                    value={data.phone}
                    onChange={(v) => setData((prev) => ({ ...prev, phone: v }))}
                    placeholder="Ej. +52 55 1234 5678"
                    inputMode="tel"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#475569]">
                    WhatsApp (opcional)
                  </label>
                  <Input
                    value={data.whatsapp}
                    onChange={(v) => setData((prev) => ({ ...prev, whatsapp: v }))}
                    placeholder="Ej. +52 55 1234 5678"
                    inputMode="tel"
                  />
                </div>
                <div>
                  <FieldLabel detected={detectedCvFields.has("location")}>Ubicación</FieldLabel>
                  <Input
                    value={data.location}
                    onChange={(v) => setData((prev) => ({ ...prev, location: v }))}
                    placeholder="Ej. Ciudad de México"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-zinc-100 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-[#0F172A]">Perfil profesional</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel detected={detectedCvFields.has("current_title")}>
                    Título actual
                  </FieldLabel>
                  <Input
                    value={data.current_title}
                    onChange={(v) => setData((prev) => ({ ...prev, current_title: v }))}
                    placeholder="Ej. Product Designer"
                  />
                </div>
                <div>
                  <FieldLabel detected={detectedCvFields.has("target_role")}>
                    Rol objetivo
                  </FieldLabel>
                  <Input
                    value={data.target_role}
                    onChange={(v) => setData((prev) => ({ ...prev, target_role: v }))}
                    placeholder="Ej. Diseñador/a de Producto"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#475569]">Seniority</label>
                  <Select
                    value={data.seniority}
                    onChange={(v) =>
                      setData((prev) => ({
                        ...prev,
                        seniority: v as CandidateOnboardingData["seniority"],
                      }))
                    }
                    options={[
                      { value: "junior", label: "Junior" },
                      { value: "mid", label: "Mid" },
                      { value: "senior", label: "Senior" },
                      { value: "lead", label: "Lead" },
                      { value: "director", label: "Director" },
                      { value: "executive", label: "Executive" },
                      { value: "unknown", label: "No definido" },
                    ]}
                  />
                </div>
                <div>
                  <FieldLabel detected={detectedCvFields.has("years_experience")}>
                    Años de experiencia
                  </FieldLabel>
                  <Input
                    value={data.years_experience}
                    onChange={(v) =>
                      setData((prev) => ({ ...prev, years_experience: onlyDigits(v) }))
                    }
                    placeholder="Ej. 3"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#475569]">
                    Salario esperado
                  </label>
                  <Input
                    value={data.expected_salary}
                    onChange={(v) =>
                      setData((prev) => ({ ...prev, expected_salary: normalizeMoney(v) }))
                    }
                    placeholder="Ej. 30000"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#475569]">Modalidad</label>
                  <Select
                    value={data.work_mode}
                    onChange={(v) => setData((prev) => ({ ...prev, work_mode: v as WorkMode }))}
                    options={[
                      { value: "remoto", label: "Remoto" },
                      { value: "hibrido", label: "Híbrido" },
                      { value: "presencial", label: "Presencial" },
                      { value: "indiferente", label: "Indiferente" },
                    ]}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-zinc-100 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-[#0F172A]">Habilidades</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FieldLabel detected={detectedCvFields.has("skills")}>Skills</FieldLabel>
                  <Textarea
                    value={data.skills}
                    onChange={(v) => setData((prev) => ({ ...prev, skills: v }))}
                    placeholder="Ej. React, TypeScript, SQL, Comunicación"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#475569]">Tools</label>
                  <Input
                    value={data.tools}
                    onChange={(v) => setData((prev) => ({ ...prev, tools: v }))}
                    placeholder="Ej. Figma, Notion, Jira"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#475569]">
                    Industrias
                  </label>
                  <Input
                    value={data.industries}
                    onChange={(v) => setData((prev) => ({ ...prev, industries: v }))}
                    placeholder="Ej. Fintech, SaaS"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#475569]">Idiomas</label>
                  <Input
                    value={data.languages}
                    onChange={(v) => setData((prev) => ({ ...prev, languages: v }))}
                    placeholder="Ej. Español, Inglés"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#475569]">Educación</label>
                  <Input
                    value={data.education}
                    onChange={(v) => setData((prev) => ({ ...prev, education: v }))}
                    placeholder="Ej. Licenciatura en Diseño"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-zinc-100 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-[#0F172A]">Resumen</h3>
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-[#475569]">
                  Resumen profesional
                </label>
                <Textarea
                  value={data.summary}
                  onChange={(v) => setData((prev) => ({ ...prev, summary: v }))}
                  placeholder="Ej. Diseñadora de producto con enfoque en UX..."
                />
              </div>
            </section>
          </div>

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="secondary"
              type="button"
              onClick={goBack}
              className="sm:min-w-[180px]"
            >
              Volver a subir CV
            </Button>
            <Button type="button" onClick={goToConfirm} className="sm:min-w-[180px]">
              Confirmar y continuar
            </Button>
          </div>
        </section>
      ) : null}

      {step === "confirm" ? (
        <section className="ds-card p-6">
          <h2 className="ds-heading text-base font-semibold tracking-tight">
            4) Confirmar y guardar
          </h2>
          <p className="ds-muted mt-1 text-sm">
            Revisa tu resumen final. Si lo necesitas, puedes volver a editar.
          </p>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-[#475569]">Nombre completo</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{data.full_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#475569]">Email</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{data.email || "—"}</dd>
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
            <div>
              <dt className="text-xs font-medium text-[#475569]">Salario esperado</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">
                {data.expected_salary || "—"}
              </dd>
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
              <Button
                variant="secondary"
                type="button"
                onClick={restart}
                className="sm:min-w-[140px]"
              >
                Reiniciar
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={goBack}
                className="sm:min-w-[140px]"
              >
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

