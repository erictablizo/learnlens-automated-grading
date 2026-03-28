"use client";
import React from "react";
 
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "icon" | "danger-icon";
  loading?: boolean;
  children: React.ReactNode;
}
 
export default function Button({ variant = "primary", loading, children, disabled, ...rest }: ButtonProps) {
  const cls =
    variant === "secondary" ? "btn-secondary"
    : variant === "icon" ? "btn-icon"
    : variant === "danger-icon" ? "btn-icon danger"
    : "btn-primary";
 
  return (
    <button className={cls} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {loading && variant === "primary" && (
        <span className="spinner" aria-hidden="true" style={{ marginRight: "0.35rem" }} />
      )}
      {children}
    </button>
  );
}