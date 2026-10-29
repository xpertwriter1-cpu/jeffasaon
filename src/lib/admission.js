const groups = [
  { title:'Child details', fields:[
    {name:'firstName',label:'First name',required:true}, {name:'middleName',label:'Middle name'}, {name:'lastName',label:'Last name',required:true},
    {name:'dateOfBirth',label:'Date of birth',type:'date',required:true}, {name:'gender',label:'Gender',options:['Female','Male','Prefer not to say']},
    {name:'nationality',label:'Nationality'}, {name:'birthCertificateNumber',label:'Birth certificate number'},
    {name:'homeLanguage',label:'Language spoken at home'}, {name:'homeAddress',label:'Home address / area',required:true,max:500},
    {name:'classLevel',label:'Programme',required:true,options:['Daycare','Playgroup','PP1','PP2']},
    {name:'requestedStartDate',label:'Requested admission date',type:'date'},
    {name:'previousSchool',label:'Previous school / daycare'}, {name:'previousClass',label:'Previous class'},
    {name:'previousSchoolNotes',label:'Previous school or learning information',type:'textarea',max:1500}
  ]},
  { title:'Parents and guardians', fields:[
    {name:'guardianName',label:'Primary parent / guardian full name',required:true},
    {name:'guardianRelationship',label:'Relationship to child',required:true,options:['Mother','Father','Guardian','Other']},
    {name:'parentPhone',label:'Primary phone',type:'tel',required:true},
    {name:'alternatePhone',label:'Alternative phone',type:'tel'},
    {name:'guardianOccupation',label:'Parent / guardian occupation'},
    {name:'secondGuardianName',label:'Second parent / guardian full name'},
    {name:'secondGuardianRelationship',label:'Second guardian relationship',options:['Mother','Father','Guardian','Other']},
    {name:'secondGuardianPhone',label:'Second guardian phone',type:'tel'},
    {name:'secondGuardianEmail',label:'Second guardian email',type:'email'}
  ]},
  { title:'Emergency and collection arrangements', fields:[
    {name:'emergencyName',label:'Emergency contact full name',required:true},
    {name:'emergencyRelationship',label:'Emergency contact relationship',required:true},
    {name:'emergencyPhone',label:'Emergency contact phone',type:'tel',required:true},
    {name:'pickupName',label:'Additional authorised collector full name'},
    {name:'pickupRelationship',label:'Collector relationship (optional)'},
    {name:'pickupPhone',label:'Collector phone (optional)',type:'tel'},
    {name:'collectionNotes',label:'Collection instructions or restrictions',type:'textarea',max:1500},
    {name:'transportRequired',label:'School transport required?',options:['No','Yes','Please contact me']},
    {name:'transportLocation',label:'Requested transport pickup / drop-off area'}
  ]},
  { title:'Health and support information', fields:[
    {name:'allergies',label:'Allergies and dietary requirements',type:'textarea',max:1500},
    {name:'medicalConditions',label:'Medical conditions',type:'textarea',max:1500},
    {name:'medications',label:'Regular medication / care instructions',type:'textarea',max:1500},
    {name:'supportNeeds',label:'Learning, developmental or accessibility support',type:'textarea',max:1500},
    {name:'doctorName',label:'Doctor / clinic name'}, {name:'doctorPhone',label:'Doctor / clinic phone (optional)',type:'tel'},
    {name:'immunisationNotes',label:'Immunisation information',type:'textarea',max:1500},
    {name:'medicalNotes',label:'Additional health or care notes',type:'textarea',max:3000}
  ]}
];
const documentTypes = [
  {name:'birthCertificate',label:'Birth certificate'}, {name:'clinicCard',label:'Clinic / immunisation card'},
  {name:'previousReport',label:'Previous school report'}, {name:'childPhoto',label:'Child photo',photo:true}
];
function today() { return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
function validateAdmission(body) {
  const values = {}, errors = [];
  for (const field of groups.flatMap(group=>group.fields)) {
    if (body[field.name] !== undefined && typeof body[field.name] !== 'string') { errors.push(field.label+' must be a single value.'); continue; }
    const value = String(body[field.name] || '').trim();
    values[field.name] = value;
    if (field.required && !value) errors.push(field.label+' is required.');
    if (value.length > (field.max || 200)) errors.push(field.label+' is too long.');
    if (value && field.options && !field.options.includes(value)) errors.push('Choose a valid '+field.label.toLowerCase()+'.');
    if (value && field.type==='date' && (!validDate(value) || value < '1900-01-01' || value > '2100-12-31')) errors.push(field.label+' must be a valid date between 1900 and 2100.');
    if (value && field.type==='tel' && !/^\+?[\d ()-]{7,30}$/.test(value)) errors.push(field.label+' must be a valid phone number.');
    if (value && field.type==='email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push(field.label+' must be a valid email address.');
  }
  if (values.dateOfBirth && values.dateOfBirth > today()) errors.push('Date of birth cannot be in the future.');
  if (values.requestedStartDate && values.dateOfBirth && values.requestedStartDate < values.dateOfBirth) errors.push('Admission date cannot be before the child was born.');
  if (values.secondGuardianName && (!values.secondGuardianPhone || !values.secondGuardianRelationship)) errors.push('Add the second guardian relationship and phone.');
  if (body.declaration !== 'yes') errors.push('Confirm the parent / guardian declaration.');
  return { values, errors };
}
function fileType(buffer) {
  if (buffer.subarray(0,5).toString()==='%PDF-') return { extension:'.pdf', mimeType:'application/pdf' };
  if (buffer.length>=8 && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return {extension:'.png',mimeType:'image/png'};
  if (buffer.length>=3 && buffer[0]===255 && buffer[1]===216 && buffer[2]===255) return {extension:'.jpg',mimeType:'image/jpeg'};
  return null;
}
module.exports = { groups, documentTypes, today, validateAdmission, fileType };
