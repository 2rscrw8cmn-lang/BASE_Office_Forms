export interface DisciplineOption {
  readonly value: string;
  readonly label: string;
}

export const DISCIPLINE_OPTIONS: readonly DisciplineOption[];
export function isControlledDiscipline(value: unknown): value is string;
export function disciplineLabel(value: unknown): string;
