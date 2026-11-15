// CBC pre-primary (PP1/PP2) learning areas with suggested strands, and developmental
// areas for Daycare and Playgroup. Confirm strands against the current KICD curriculum
// designs each year; staff may also type their own strand.
export const cbcAreas: Record<string, string[]> = {
  'Language Activities': [
    'Listening and speaking',
    'Reading readiness',
    'Writing readiness',
  ],
  'Mathematical Activities': ['Classification', 'Numbers', 'Measurement', 'Geometry'],
  'Environmental Activities': [
    'Social environment',
    'Natural environment',
    'Health practices',
  ],
  'Psychomotor and Creative Activities': [
    'Gross motor skills',
    'Fine motor skills',
    'Art and craft',
    'Music and movement',
  ],
  'Religious Education Activities': [
    'Creation',
    'Values and relationships',
    'Worship and prayer',
  ],
};
export const earlyYearsAreas: Record<string, string[]> = {
  'Communication and language': ['Listening', 'Speaking', 'Early literacy'],
  'Physical development': ['Gross motor', 'Fine motor', 'Self-care'],
  'Personal, social and emotional': [
    'Relationships',
    'Emotional regulation',
    'Independence',
  ],
  'Thinking and exploring': ['Curiosity', 'Problem solving', 'Early number'],
  'Creative expression': ['Art', 'Music', 'Imaginative play'],
};
export const coreCompetencies = [
  'Communication and collaboration',
  'Critical thinking and problem solving',
  'Creativity and imagination',
  'Citizenship',
  'Digital literacy',
  'Learning to learn',
  'Self-efficacy',
];
export const cbcLevels = [
  { code: 'EE', label: 'Exceeding expectations' },
  { code: 'ME', label: 'Meeting expectations' },
  { code: 'AE', label: 'Approaching expectations' },
  { code: 'BE', label: 'Below expectations' },
] as const;
export const isCbcLevel = (classLevel: string) =>
  classLevel === 'PP1' || classLevel === 'PP2';
export const areasFor = (classLevel: string) =>
  isCbcLevel(classLevel) ? cbcAreas : earlyYearsAreas;
export const allAreas = [...Object.keys(cbcAreas), ...Object.keys(earlyYearsAreas)];
// Report card areas: CBC learning areas and rubric for PP1/PP2; the school's existing
// developmental areas and ratings for Daycare and Playgroup.
const earlyReportAreas = [
  'Language',
  'Numeracy',
  'Creativity',
  'Physical development',
  'Social skills',
];
const earlyReportRatings = [
  'Exceeding expectations',
  'Meeting expectations',
  'Developing',
  'Needs support',
];
export const reportAreasFor = (classLevel: string) =>
  isCbcLevel(classLevel) ? Object.keys(cbcAreas) : earlyReportAreas;
export const reportRatingsFor = (classLevel: string) =>
  isCbcLevel(classLevel) ? cbcLevels.map((level) => level.label) : earlyReportRatings;
