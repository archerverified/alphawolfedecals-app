// Display helpers for vehicle templates. Dimensions shown in mm and inches per
// PRD §4.2.

type TitleParts = {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  variant?: string | null;
};

export function vehicleTitle(v: TitleParts): string {
  const head = `${v.year} ${v.make} ${v.model}`;
  const tail = [v.trim, v.variant].filter(Boolean).join(' · ');
  return tail ? `${head} ${tail}` : head;
}

const inches = (mm: number): number => Math.round(mm / 25.4);

export function formatDimensions(v: {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}): string {
  return (
    `${v.lengthMm} × ${v.widthMm} × ${v.heightMm} mm` +
    `  ·  ${inches(v.lengthMm)} × ${inches(v.widthMm)} × ${inches(v.heightMm)} in`
  );
}

const BODY_TYPE_LABELS: Record<string, string> = {
  sedan: 'Sedan',
  suv: 'SUV',
  crossover: 'Crossover',
  pickup: 'Pickup',
  van: 'Van',
  box_truck: 'Box truck',
  sprinter: 'Sprinter',
  motorcycle: 'Motorcycle',
  rv: 'RV',
  trailer: 'Trailer',
  boat: 'Boat',
  equipment: 'Equipment',
};

export function bodyTypeLabel(bt: string): string {
  return BODY_TYPE_LABELS[bt] ?? bt;
}
