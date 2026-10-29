export const school = {
  name: process.env.SCHOOL_NAME || 'Jeffersons Preschool',
  phone: process.env.SCHOOL_PHONE || '0729 323301',
  email: process.env.SCHOOL_EMAIL || 'jeffersonspreschool@gmail.com',
  location: process.env.SCHOOL_LOCATION || 'Rongai, Kenya',
};
export const programmes = ['Daycare', 'Playgroup', 'PP1', 'PP2'] as const;
export const roles = ['parent', 'admin', 'teacher', 'bursar'] as const;
export type Role = (typeof roles)[number];
export const areas = [
  'Language',
  'Numeracy',
  'Creativity',
  'Physical development',
  'Social skills',
];
export const ratings = [
  'Exceeding expectations',
  'Meeting expectations',
  'Developing',
  'Needs support',
];
export const feeLabels = [
  'Tuition',
  'Meals',
  'Transport',
  'Admission fee',
  'Uniform',
  'Other',
];
export const agreementVersion = 'enrolment-v1';
export const agreementText =
  'I agree to enrol this child at Jeffersons Preschool in the requested programme and ask the school to review and approve this application. I understand that enrolment requires school approval and that any applicable fees will be shown on the school invoice.';
export const currency = (value: number) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value);
export const date = (value: Date | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('en-KE', {
        dateStyle: 'medium',
        timeZone: 'Africa/Nairobi',
      }).format(value)
    : 'Not recorded';
