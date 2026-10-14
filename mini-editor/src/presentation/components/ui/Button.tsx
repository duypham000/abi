import { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "social" | "icon";
  children?: ReactNode;
}

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  let variantClass = "";
  switch (variant) {
    case "primary":
      variantClass = "figma-btn-primary px-5";
      break;
    case "social":
      variantClass = "figma-btn-social px-5";
      break;
    case "icon":
      variantClass = "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 p-1 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded transition-colors";
      break;
  }

  return (
    <button className={`${variantClass} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
