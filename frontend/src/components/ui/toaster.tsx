"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "rounded-card border border-border bg-card text-foreground shadow-card",
          success: "text-brand",
          error: "text-danger",
        },
      }}
    />
  );
}
