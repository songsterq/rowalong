import { Template, makeId } from './types';

/** Built-in starter templates so the app is usable before anything is saved. */
export function starterTemplates(): Template[] {
  return [
    {
      id: 'starter-quick20',
      name: 'Quick 20',
      segments: [
        { id: makeId(), intensity: 'easy', durationSec: 180 },
        { id: makeId(), intensity: 'hard', durationSec: 60 },
        { id: makeId(), intensity: 'medium', durationSec: 40 },
        { id: makeId(), intensity: 'hard', durationSec: 60 },
        { id: makeId(), intensity: 'medium', durationSec: 40 },
        { id: makeId(), intensity: 'allout', durationSec: 30 },
        { id: makeId(), intensity: 'easy', durationSec: 60 },
        { id: makeId(), intensity: 'hard', durationSec: 60 },
        { id: makeId(), intensity: 'medium', durationSec: 40 },
        { id: makeId(), intensity: 'allout', durationSec: 30 },
        { id: makeId(), intensity: 'easy', durationSec: 200 },
      ],
    },
    {
      id: 'starter-sprints',
      name: 'Short sprints',
      segments: [
        { id: makeId(), intensity: 'easy', durationSec: 180 },
        { id: makeId(), intensity: 'allout', durationSec: 30 },
        { id: makeId(), intensity: 'easy', durationSec: 30 },
        { id: makeId(), intensity: 'allout', durationSec: 30 },
        { id: makeId(), intensity: 'easy', durationSec: 30 },
        { id: makeId(), intensity: 'allout', durationSec: 30 },
        { id: makeId(), intensity: 'easy', durationSec: 150 },
      ],
    },
  ];
}
