import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAud(amount: number) {
  const formatter = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return formatter.format(amount);
}

export function sentenceCaseFrequency(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
