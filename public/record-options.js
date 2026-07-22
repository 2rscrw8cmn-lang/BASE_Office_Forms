export const DISCIPLINE_OPTIONS = Object.freeze([
  { value: "general", label: "General" },
  { value: "civil", label: "Civil" },
  { value: "landscape", label: "Landscape" },
  { value: "structural", label: "Structural" },
  { value: "architectural", label: "Architectural" },
  { value: "interiors", label: "Interiors" },
  { value: "fire_protection", label: "Fire Protection" },
  { value: "plumbing", label: "Plumbing" },
  { value: "mechanical", label: "Mechanical" },
  { value: "electrical", label: "Electrical" },
  { value: "technology_low_voltage", label: "Technology / Low Voltage" },
  { value: "equipment", label: "Equipment" },
  { value: "survey", label: "Survey" },
  { value: "contractor", label: "Contractor" },
  { value: "owner", label: "Owner" },
  { value: "other", label: "Other" },
]);

const DISCIPLINE_LABELS = new Map(
  DISCIPLINE_OPTIONS.map(({ value, label }) => [value, label]),
);

export function isControlledDiscipline(value) {
  return typeof value === "string" && DISCIPLINE_LABELS.has(value);
}

export function disciplineLabel(value) {
  if (value == null || value === "") return "—";
  return DISCIPLINE_LABELS.get(value) || String(value);
}
