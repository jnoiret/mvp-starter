import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#3B4EFF] disabled:cursor-not-allowed disabled:opacity-70 disabled:saturate-75";

  const variants: Record<ButtonProps["variant"], string> = {
    primary:
      "ds-accent-gradient text-white shadow-sm hover:brightness-95 active:brightness-90",
    secondary:
      "border border-[#CBD5E1] bg-white text-[#0F172A] shadow-sm hover:border-[#94A3B8] hover:bg-[#F8FAFF]",
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], className)}
      {...props}
    />
  );
}

