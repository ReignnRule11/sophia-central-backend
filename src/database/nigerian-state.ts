const NIGERIAN_STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'Federal Capital Territory',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
] as const;

function normalizeStateKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const STATE_BY_KEY = new Map<string, string>(
  NIGERIAN_STATES.map((state) => [normalizeStateKey(state), state]),
);

const STATE_ALIASES = new Map<string, string>([
  ['fct', 'Federal Capital Territory'],
  ['fct abuja', 'Federal Capital Territory'],
  ['abuja', 'Federal Capital Territory'],
  ['federal capital territory abuja', 'Federal Capital Territory'],
]);

/**
 * Return the canonical Nigerian state name for a recognized state value.
 * City names and other unrecognized values deliberately return undefined:
 * callers must resolve those through documented institution-specific data,
 * not guess a state from an arbitrary location string.
 */
export function canonicalizeNigerianState(
  value?: string | null,
): string | undefined {
  if (!value?.trim()) return undefined;

  const key = normalizeStateKey(value);
  return STATE_ALIASES.get(key) ?? STATE_BY_KEY.get(key);
}
