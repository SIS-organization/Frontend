import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "danger";
};

const styles = {
  primary: "bg-primary text-white hover:opacity-90",
  outline: "border border-primary bg-white text-primary hover:bg-bg",
  danger: "border border-red-600 bg-white text-red-600 hover:bg-red-50",
};

export default function Button({ variant = "primary", className = "", ...props }: Props) {
  return (
    <button
      type="button"
      className={`h-11 rounded-lg px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 md:h-10 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
