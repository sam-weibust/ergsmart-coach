const FIELD_LIMITS: Record<string, number> = {
  name: 100,
  description: 500,
  notes: 2000,
  message: 5000,
  default: 1000,
};

export function sanitizeInput(value: string, fieldType: keyof typeof FIELD_LIMITS = "default"): string {
  const limit = FIELD_LIMITS[fieldType] ?? FIELD_LIMITS.default;
  return value
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .trim()
    .slice(0, limit);
}
