import { canonicalizeNigerianState } from './nigerian-state';

describe('canonicalizeNigerianState', () => {
  it('recognizes every Nigerian state and the FCT', () => {
    const states = [
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
    ];

    for (const state of states) {
      expect(canonicalizeNigerianState(state)).toBe(state);
    }
  });

  it.each([
    ['fct', 'Federal Capital Territory'],
    ['FCT Abuja', 'Federal Capital Territory'],
    ['Federal Capital Territory', 'Federal Capital Territory'],
    ['ABUJA', 'Federal Capital Territory'],
    ['  rivers  ', 'Rivers'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(canonicalizeNigerianState(input)).toBe(expected);
  });

  it.each(['Ibadan', 'Yola', 'Ogu', 'Wasinmi', ''])(
    'rejects non-state location value "%s"',
    (input) => {
      expect(canonicalizeNigerianState(input)).toBeUndefined();
    },
  );

  it('returns undefined for missing values', () => {
    expect(canonicalizeNigerianState(undefined)).toBeUndefined();
    expect(canonicalizeNigerianState(null)).toBeUndefined();
  });
});
