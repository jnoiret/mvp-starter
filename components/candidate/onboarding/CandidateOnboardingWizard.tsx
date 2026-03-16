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

const TOTAL_STEPS = 4;

const stepOrder: StepId[] = ["cv_upload", "parsing", "review_edit", "confirm"];

const defaultData: CandidateOnboardingData = {
  full_name: "",
  email: "",
  whatsapp: "",
  city: "",
  target_role: "",
  years_experience: "",
  skills: "",
  expected_salary: "",
  work_mode: "",
  cv_file: null,
};

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

function validateCv(data: CandidateOnboardingData) {
  if (!data.cv_file) return "Por favor, sube tu CV.";
  const isPdf =
    data.cv_file.type === "application/pdf" ||
    data.cv_file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "Por ahora solo se soportan archivos PDF.";
  const maxBytes = 10 * 1024 * 1024;
  if (data.cv_file.size > maxBytes) return "Tu archivo supera 10MB.";
  return null;
}

function validateProfile(data: CandidateOnboardingData) {
  if (!data.full_name.trim()) return "Escribe tu nombre completo.";
  if (!data.email.trim() || !isEmail(data.email)) return "Escribe un correo válido.";
  const whatsappDigits = onlyDigits(data.whatsapp);
  if (!whatsappDigits || whatsappDigits.length < 8)
    return "Escribe un WhatsApp válido (mínimo 8 dígitos).";
  if (!data.city.trim()) return "Escribe tu ciudad.";
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

export function CandidateOnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<StepId>("cv_upload");
  const [data, setData] = useState<CandidateOnboardingData>(defaultData);
  const [error, setError] = useState<string | null>(null);
  const [parseWarning, setParseWarning] = useState<string | null>(null);
  const [parseStatus, setParseStatus] = useState<AsyncStatus>("idle");
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
    if (step === "parsing") return "Estamos procesando tu CV para prellenar tu perfil.";
    if (step === "review_edit") return "Revisa y ajusta la información detectada.";
    return "Confirma tus datos antes de guardar tu perfil.";
  }, [step]);

  async function handleStartParsing() {
    const cvError = validateCv(data);
    if (cvError) {
      setError(cvError);
      return;
    }

    setError(null);
    setParseWarning(null);
    setParseStatus("loading");
    setStep("parsing");

    try {
      const result = await parseCandidateProfileFromCv(data.cv_file as File);
      const parsed = result.data;
      setData((prev) => ({
        ...prev,
        ...parsed,
        full_name: prev.full_name || parsed.full_name,
        email: prev.email || parsed.email,
        whatsapp: prev.whatsapp || parsed.whatsapp,
        city: prev.city || parsed.city,
        target_role: prev.target_role || parsed.target_role,
        years_experience: prev.years_experience || parsed.years_experience,
        skills: prev.skills || parsed.skills,
        expected_salary: prev.expected_salary || parsed.expected_salary,
        work_mode: (prev.work_mode || parsed.work_mode) as WorkMode | "",
      }));
      setParseStatus("success");
      setParseWarning(
        result.warning
          ? `${result.warning}${result.reason ? ` Detalle técnico: ${result.reason}` : ""}`
          : null
      );
      setStep("review_edit");
    } catch (err) {
      // Keep UX non-blocking: continue with empty fields on parse failure.
      setParseStatus("error");
      setParseWarning(
        err instanceof Error
          ? `No pudimos extraer datos automáticamente. Puedes completar el perfil manualmente. Detalle técnico: ${err.message}`
          : "No pudimos extraer datos automáticamente. Puedes completar el perfil manualmente."
      );
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
    setData(defaultData);
    setError(null);
    setParseStatus("idle");
    setParseWarning(null);
    setSubmitStatus({ type: "idle" });
    setUploadStatus({ type: "idle" });
    setStep("cv_upload");
  }

  async function handleFinalSubmit() {
    const cvError = validateCv(data);
    if (cvError) {
      setError(cvError);
      setStep("cv_upload");
      return;
    }

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
      formData.append("cv", data.cv_file as File);
      formData.append("full_name", data.full_name.trim());
      formData.append("email", data.email.trim());
      formData.append("whatsapp", data.whatsapp.trim());
      formData.append("city", data.city.trim());
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
            : "Error inesperado al subir tu CV.",
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
            Primero sube tu CV. Después podrás revisar y ajustar tus datos.
          </p>

          <div className="mt-5 flex flex-col gap-3">
            <input
              type="file"
              accept=".pdf,application/pdf"
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
              <p className="text-xs text-[#475569]">
                Formato permitido: PDF. Tamaño máximo: 10MB.
              </p>
            )}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>

          <div className="mt-8 flex justify-end">
            <Button onClick={handleStartParsing} type="button" className="min-w-[180px]">
              Analizar CV
            </Button>
          </div>
        </section>
      ) : null}

      {step === "parsing" ? (
        <section className="ds-card p-6">
          <h2 className="ds-heading text-base font-semibold tracking-tight">
            2) Analizando tu CV
          </h2>
          <p className="ds-muted mt-1 text-sm">
            Estamos extrayendo información clave para prellenar tu perfil.
          </p>

          <div className="mt-6 flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#CBD5E1] border-t-[#4F46E5]" />
            <p className="text-sm text-[#475569]">
              {parseStatus === "loading"
                ? "Procesando archivo..."
                : "Preparando información..."}
            </p>
          </div>
        </section>
      ) : null}

      {step === "review_edit" ? (
        <section className="ds-card p-6">
          <h2 className="ds-heading text-base font-semibold tracking-tight">
            3) Revisa y edita tu perfil
          </h2>
          <p className="ds-muted mt-1 text-sm">
            Completa o ajusta tu información antes de continuar.
          </p>

          {parseWarning ? (
            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-sm font-medium text-blue-800">
                No pasa nada: puedes continuar completando tu perfil manualmente.
              </p>
              <p className="mt-1 text-sm text-blue-700">
                No se pudo extraer texto de este CV, pero puedes llenar los campos aquí y seguir con tu registro.
              </p>
              <p className="mt-2 text-xs text-blue-700">{parseWarning}</p>
            </div>
          ) : null}

          <p className="mt-4 text-sm text-[#475569]">
            Todos los campos son editables. Tómate un minuto para dejar tu perfil listo.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-[#475569]">Nombre completo</label>
              <Input
                value={data.full_name}
                onChange={(v) => setData((prev) => ({ ...prev, full_name: v }))}
                placeholder="Ej. Ana Pérez"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#475569]">
                Correo electrónico
              </label>
              <Input
                value={data.email}
                onChange={(v) => setData((prev) => ({ ...prev, email: v }))}
                placeholder="Ej. ana@correo.com.mx"
                type="email"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#475569]">
                Teléfono (WhatsApp)
              </label>
              <Input
                value={data.whatsapp}
                onChange={(v) => setData((prev) => ({ ...prev, whatsapp: v }))}
                placeholder="Ej. +52 55 1234 5678"
                inputMode="tel"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#475569]">Ciudad</label>
              <Input
                value={data.city}
                onChange={(v) => setData((prev) => ({ ...prev, city: v }))}
                placeholder="Ej. Ciudad de México"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#475569]">Rol objetivo</label>
              <Input
                value={data.target_role}
                onChange={(v) => setData((prev) => ({ ...prev, target_role: v }))}
                placeholder="Ej. Diseñador/a de Producto"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#475569]">
                Años de experiencia
              </label>
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
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-[#475569]">Skills</label>
              <Textarea
                value={data.skills}
                onChange={(v) => setData((prev) => ({ ...prev, skills: v }))}
                placeholder="Ej. React, TypeScript, SQL, Comunicación"
              />
            </div>
          </div>

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="secondary"
              type="button"
              onClick={goBack}
              className="sm:min-w-[140px]"
            >
              Atrás
            </Button>
            <Button type="button" onClick={goToConfirm} className="sm:min-w-[180px]">
              Continuar
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

