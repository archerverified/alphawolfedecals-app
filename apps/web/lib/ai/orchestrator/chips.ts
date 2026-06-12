// Iteration chips (Goal 7 D3 → consumed by the D5 gallery UI). Deliberately
// NOT server-only: the gallery renders the labels client-side and posts the
// instruction text back to the iteration action, which feeds compileIteration.

export interface IterationChip {
  /** Customer-voice button label. */
  label: string;
  /** Instruction text sent to compileIteration as the customer's request. */
  instruction: string;
}

export const ITERATION_CHIPS: readonly IterationChip[] = [
  {
    label: 'More aggressive',
    instruction:
      'Make the whole design more aggressive: sharper angles, stronger motion, higher-impact shapes — same colors and theme.',
  },
  {
    label: 'Less busy',
    instruction:
      'Simplify the whole design: fewer elements, more open space, calmer composition — keep the same colors and theme.',
  },
  {
    label: 'Brighter colors',
    instruction:
      'Make the colors brighter and more vivid across the whole design, keeping the same layout.',
  },
  {
    label: 'Darker look',
    instruction: 'Shift the whole design darker and moodier — deeper tones, same layout and theme.',
  },
  {
    label: 'Swap accent color',
    instruction:
      'Swap which color is used as the accent: make the current accent color the main color and the current main color the accent, keeping the same layout.',
  },
  {
    label: 'More contrast',
    instruction:
      'Increase the contrast between the design elements and the base color across the whole design, keeping the same layout.',
  },
] as const;
