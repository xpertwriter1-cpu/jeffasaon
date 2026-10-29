export interface AdmissionField {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  options?: string[];
  max?: number;
}
export interface AdmissionGroup {
  title: string;
  fields: AdmissionField[];
}
export const admissionGroups: AdmissionGroup[] = [
  {
    title: 'Child details',
    fields: [
      {
        name: 'firstName',
        label: 'First name',
        required: true,
      },
      {
        name: 'middleName',
        label: 'Middle name',
      },
      {
        name: 'lastName',
        label: 'Last name',
        required: true,
      },
      {
        name: 'dateOfBirth',
        label: 'Date of birth',
        type: 'date',
        required: true,
      },
      {
        name: 'gender',
        label: 'Gender',
        options: ['Female', 'Male', 'Prefer not to say'],
      },
      {
        name: 'nationality',
        label: 'Nationality',
      },
      {
        name: 'birthCertificateNumber',
        label: 'Birth certificate number',
      },
      {
        name: 'homeLanguage',
        label: 'Language spoken at home',
      },
      {
        name: 'homeAddress',
        label: 'Home address / area',
        required: true,
        max: 500,
      },
      {
        name: 'classLevel',
        label: 'Programme',
        required: true,
        options: ['Daycare', 'Playgroup', 'PP1', 'PP2'],
      },
      {
        name: 'requestedStartDate',
        label: 'Requested admission date',
        type: 'date',
      },
      {
        name: 'previousSchool',
        label: 'Previous school / daycare',
      },
      {
        name: 'previousClass',
        label: 'Previous class',
      },
      {
        name: 'previousSchoolNotes',
        label: 'Previous school or learning information',
        type: 'textarea',
        max: 1500,
      },
    ],
  },
  {
    title: 'Parents and guardians',
    fields: [
      {
        name: 'guardianName',
        label: 'Primary parent / guardian full name',
        required: true,
      },
      {
        name: 'guardianRelationship',
        label: 'Relationship to child',
        required: true,
        options: ['Mother', 'Father', 'Guardian', 'Other'],
      },
      {
        name: 'parentPhone',
        label: 'Primary phone',
        type: 'tel',
        required: true,
      },
      {
        name: 'alternatePhone',
        label: 'Alternative phone',
        type: 'tel',
      },
      {
        name: 'guardianOccupation',
        label: 'Parent / guardian occupation',
      },
      {
        name: 'secondGuardianName',
        label: 'Second parent / guardian full name',
      },
      {
        name: 'secondGuardianRelationship',
        label: 'Second guardian relationship',
        options: ['Mother', 'Father', 'Guardian', 'Other'],
      },
      {
        name: 'secondGuardianPhone',
        label: 'Second guardian phone',
        type: 'tel',
      },
      {
        name: 'secondGuardianEmail',
        label: 'Second guardian email',
        type: 'email',
      },
    ],
  },
  {
    title: 'Emergency and collection arrangements',
    fields: [
      {
        name: 'emergencyName',
        label: 'Emergency contact full name',
        required: true,
      },
      {
        name: 'emergencyRelationship',
        label: 'Emergency contact relationship',
        required: true,
      },
      {
        name: 'emergencyPhone',
        label: 'Emergency contact phone',
        type: 'tel',
        required: true,
      },
      {
        name: 'pickupName',
        label: 'Additional authorised collector full name',
      },
      {
        name: 'pickupRelationship',
        label: 'Collector relationship (optional)',
      },
      {
        name: 'pickupPhone',
        label: 'Collector phone (optional)',
        type: 'tel',
      },
      {
        name: 'collectionNotes',
        label: 'Collection instructions or restrictions',
        type: 'textarea',
        max: 1500,
      },
      {
        name: 'transportRequired',
        label: 'School transport required?',
        options: ['No', 'Yes', 'Please contact me'],
      },
      {
        name: 'transportLocation',
        label: 'Requested transport pickup / drop-off area',
      },
    ],
  },
  {
    title: 'Health and support information',
    fields: [
      {
        name: 'allergies',
        label: 'Allergies and dietary requirements',
        type: 'textarea',
        max: 1500,
      },
      {
        name: 'medicalConditions',
        label: 'Medical conditions',
        type: 'textarea',
        max: 1500,
      },
      {
        name: 'medications',
        label: 'Regular medication / care instructions',
        type: 'textarea',
        max: 1500,
      },
      {
        name: 'supportNeeds',
        label: 'Learning, developmental or accessibility support',
        type: 'textarea',
        max: 1500,
      },
      {
        name: 'doctorName',
        label: 'Doctor / clinic name',
      },
      {
        name: 'doctorPhone',
        label: 'Doctor / clinic phone (optional)',
        type: 'tel',
      },
      {
        name: 'immunisationNotes',
        label: 'Immunisation information',
        type: 'textarea',
        max: 1500,
      },
      {
        name: 'medicalNotes',
        label: 'Additional health or care notes',
        type: 'textarea',
        max: 3000,
      },
    ],
  },
];
export const documentTypes = [
  {
    name: 'birthCertificate',
    label: 'Birth certificate',
  },
  {
    name: 'clinicCard',
    label: 'Clinic / immunisation card',
  },
  {
    name: 'previousReport',
    label: 'Previous school report',
  },
  {
    name: 'childPhoto',
    label: 'Child photo',
    photo: true,
  },
] as const;
