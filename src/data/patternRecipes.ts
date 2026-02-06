import type { MaterialType, Operation } from '@/app/page'

export type PatternRecipe = {
  id: string
  name: string
  description: string
  steels: [MaterialType, MaterialType]
  pairs: number
  ops: Operation[]
}

export const PATTERN_RECIPES: PatternRecipe[] = [
  {
    id: 'ladder',
    name: 'Ladder Pattern',
    description: 'Classic ladder grooves ground into layered billet.',
    steels: ['1084', '15N20'],
    pairs: 5,
    ops: [
      { kind: 'fold', times: 2 },
      { kind: 'stretch', factor: 1.4 },
      { kind: 'ladder', spacing: 0.1, depth: 0.5 },
    ],
  },

  {
    id: 'twist',
    name: 'Twist Pattern',
    description: 'Traditional twisted billet pattern.',
    steels: ['1084', '15N20'],
    pairs: 5,
    ops: [
      { kind: 'fold', times: 2 },
      { kind: 'twist', turns: 3 },
      { kind: 'stretch', factor: 1.2 },
    ],
  },

  {
    id: 'raindrop',
    name: 'Raindrop Pattern',
    description: 'Punch divots into layered billet.',
    steels: ['1084', '15N20'],
    pairs: 6,
    ops: [
      { kind: 'fold', times: 3 },
      { kind: 'raindrops', radius: 0.06, spacing: 0.14 },
    ],
  },

  {
    id: 'wpattern',
    name: 'W Pattern',
    description: 'Accordion folded W structure.',
    steels: ['1084', '15N20'],
    pairs: 7,
    ops: [
      { kind: 'wfolds', folds: 6 },
      { kind: 'fold', times: 1 },
    ],
  },

  {
    id: 'fishbone',
    name: 'Fishbone (Stylized)',
    description: 'Simulated fishbone via twist + ladder combo.',
    steels: ['1084', '15N20'],
    pairs: 6,
    ops: [
      { kind: 'fold', times: 2 },
      { kind: 'twist', turns: 2 },
      { kind: 'ladder', spacing: 0.12, depth: 0.6 },
    ],
  },
]
