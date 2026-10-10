import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Mescla classes Tailwind sem conflito. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
