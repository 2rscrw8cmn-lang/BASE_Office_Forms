const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatProjectDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMAT.format(date);
}

export function projectLocation(project: {
  address?: { city?: string | null; region?: string | null };
}): string {
  const parts = [project.address?.city, project.address?.region].filter(
    (value): value is string => Boolean(value),
  );
  return parts.join(", ") || "No location";
}
