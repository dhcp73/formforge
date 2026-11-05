import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
/** Join class names; later Tailwind utilities override conflicting earlier ones (e.g. `w-full` → `w-auto`). */
export const cn = (...c: ClassValue[]) => twMerge(clsx(c));
