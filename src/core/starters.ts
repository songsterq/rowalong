import { Template, makeId } from './types';

/** Built-in starter templates so the app is usable before anything is saved. */
export function starterTemplates(): Template[] {
  return [
    {
      // 20:00 total — warm-up, three hard/all-out rounds, cool-down.
      id: 'starter-quick20',
      name: 'Quick 20',
      segments: [
        { id: makeId(), intensity: 'easy', durationSec: 120 },
        { id: makeId(), intensity: 'medium', durationSec: 60 },
        { id: makeId(), intensity: 'hard', durationSec: 90 },
        { id: makeId(), intensity: 'easy', durationSec: 60 },
        { id: makeId(), intensity: 'allout', durationSec: 30 },
        { id: makeId(), intensity: 'medium', durationSec: 60 },
        { id: makeId(), intensity: 'easy', durationSec: 60 },
        { id: makeId(), intensity: 'hard', durationSec: 90 },
        { id: makeId(), intensity: 'easy', durationSec: 60 },
        { id: makeId(), intensity: 'allout', durationSec: 30 },
        { id: makeId(), intensity: 'medium', durationSec: 60 },
        { id: makeId(), intensity: 'easy', durationSec: 60 },
        { id: makeId(), intensity: 'hard', durationSec: 90 },
        { id: makeId(), intensity: 'easy', durationSec: 60 },
        { id: makeId(), intensity: 'allout', durationSec: 30 },
        { id: makeId(), intensity: 'medium', durationSec: 60 },
        { id: makeId(), intensity: 'easy', durationSec: 180 },
      ],
    },
    {
      // 10:00 total — warm-up, four all-out sprints, cool-down.
      id: 'starter-sprints',
      name: 'Short sprints',
      segments: [
        { id: makeId(), intensity: 'easy', durationSec: 120 },
        { id: makeId(), intensity: 'allout', durationSec: 30 },
        { id: makeId(), intensity: 'easy', durationSec: 60 },
        { id: makeId(), intensity: 'allout', durationSec: 30 },
        { id: makeId(), intensity: 'easy', durationSec: 60 },
        { id: makeId(), intensity: 'allout', durationSec: 30 },
        { id: makeId(), intensity: 'easy', durationSec: 60 },
        { id: makeId(), intensity: 'allout', durationSec: 30 },
        { id: makeId(), intensity: 'easy', durationSec: 180 },
      ],
    },
  ];
}
