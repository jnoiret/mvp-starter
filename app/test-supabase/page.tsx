"use client";

import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { Section } from "@/components/shared/Section";
import { Button } from "@/components/ui/Button";

type Status = { type: "idle" | "loading" | "success" | "error"; message?: string };

export default function TestSupabasePage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>({ type: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ type: "loading" });

    try {
      const supabase = getSupabaseBrowserClient();

      const { error } = await supabase.from("leads").insert({
        name,
        email,
        message,
      });

      if (error) {
        console.error("Supabase insert error:", error);
        setStatus({
          type: "error",
          message: error.message,
        });
        return;
      }

      setStatus({
        type: "success",
        message: "Thanks – your details have been saved.",
      });
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      console.error("Unexpected Supabase error:", err);
      setStatus({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Unexpected error while connecting to Supabase.",
      });
    }
  }

  return (
    <Section className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">
          Test Supabase
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Submit this form to create a new lead in your Supabase project.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div className="space-y-1">
          <label
            htmlFor="name"
            className="text-sm font-medium text-zinc-800 dark:text-zinc-100"
          >
            Name
          </label>
          <input
            id="name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-0 transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
            required
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="email"
            className="text-sm font-medium text-zinc-800 dark:text-zinc-100"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-0 transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
            required
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="message"
            className="text-sm font-medium text-zinc-800 dark:text-zinc-100"
          >
            Message
          </label>
          <textarea
            id="message"
            name="message"
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-0 transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
            required
          />
        </div>

        <div className="pt-2">
          <Button type="submit" disabled={status.type === "loading"}>
            {status.type === "loading" ? "Submitting..." : "Submit lead"}
          </Button>
        </div>

        {status.type === "success" && status.message ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            {status.message}
          </p>
        ) : null}

        {status.type === "error" && status.message ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {status.message}
          </p>
        ) : null}
      </form>
    </Section>
  );
}

