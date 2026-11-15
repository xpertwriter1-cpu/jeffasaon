export const careKinds = [
  'Meal',
  'Drink / bottle',
  'Nap',
  'Diaper change',
  'Toilet',
  'Mood',
  'Activity',
  'Note',
] as const;
export const mealNames = [
  'Breakfast',
  'Mid-morning snack',
  'Lunch',
  'Afternoon snack',
] as const;
export const eatenAmounts = ['All', 'Most', 'Some', 'None'];
export const incidentKinds = [
  'Injury',
  'Illness',
  'Allergic reaction',
  'Behaviour',
  'Safeguarding concern',
  'Near miss',
  'Other',
] as const;
// Kenya Expanded Programme on Immunization (KEPI) – suggestions only; staff may type others.
export const vaccines = [
  'BCG',
  'OPV (polio)',
  'Pentavalent (DPT-HepB-Hib)',
  'PCV10 (pneumococcal)',
  'Rotavirus',
  'IPV (polio)',
  'Measles-Rubella (MR)',
  'Yellow fever',
  'Malaria (RTS,S)',
  'Vitamin A',
  'Deworming',
];
export const consentKinds = [
  'Processing of my child’s personal data (Data Protection Act, 2019)',
  'Emergency medical treatment if I cannot be reached',
  'Photos for internal school records',
  'Photos in school newsletters, website or social media',
  'School outings and trips',
  'Administering medication I have provided in writing',
] as const;
export const licenceKinds = [
  'Kajiado County childcare facility licence',
  'Single business permit (Kajiado County)',
  'Public health certificate',
  'Fire safety certificate',
  'Ministry of Education registration (ECDE)',
  'Food handlers’ medical certificates',
  'Other',
];
export const announcementAudiences = [
  'All parents',
  'Class level',
  'All staff',
  'Everyone',
] as const;
