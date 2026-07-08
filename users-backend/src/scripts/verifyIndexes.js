/**
 * verifyIndexes.js
 *
 * Quick sanity-check that every Mongoose model registers the compound indexes
 * we expect.  Run with:
 *     node src/scripts/verifyIndexes.js
 *
 * Exits 0 when all expected indexes are found, 1 otherwise.
 */

/* eslint-disable no-console */

const models = {
  Medication: require('../models/Medication'),
  Intervention: require('../models/Intervention'),
  TempMedication: require('../models/TempMedication'),
  AIChatSession: require('../models/AIChatSession'),
  Alert: require('../models/Alert'),
  // existing models worth spot-checking
  VitalLog: require('../models/VitalLog'),
  MedicineLog: require('../models/MedicineLog'),
  Notification: require('../models/Notification'),
  CallLog: require('../models/CallLog'),
};

/**
 * Checks whether `schemaIndexes` contains an index whose key object is a
 * superset of `expectedKeys`.
 */
function hasIndex(schemaIndexes, expectedKeys) {
  const expectedEntries = Object.entries(expectedKeys);
  return schemaIndexes.some((idx) => {
    const fields = idx[0]; // { field: 1, field2: -1, ... }
    return expectedEntries.every(
      ([key, dir]) => fields[key] !== undefined && fields[key] === dir
    );
  });
}

let failures = 0;

const expectations = [
  // Medication
  ['Medication', { patientId: 1, isActive: 1 }],
  ['Medication', { patientId: 1, name: 1 }],

  // Intervention
  ['Intervention', { patient_id: 1, type: 1, status: 1, created_at: -1 }],
  ['Intervention', { patient_id: 1, status: 1, priority_score: -1 }],

  // TempMedication
  ['TempMedication', { patientId: 1, isActive: 1, createdAt: -1 }],

  // AIChatSession
  ['AIChatSession', { patient_id: 1, is_active: 1, updated_at: -1 }],

  // Alert
  ['Alert', { caller_id: 1, created_at: -1 }],
  ['Alert', { patient_id: 1, created_at: -1 }],
  ['Alert', { patient_id: 1, status: 1, created_at: -1 }],

  // VitalLog (pre-existing)
  ['VitalLog', { patient_id: 1, date: 1 }],

  // MedicineLog (pre-existing)
  ['MedicineLog', { patient_id: 1, date: -1 }],

  // Notification (pre-existing)
  ['Notification', { patient_id: 1, is_read: 1, created_at: -1 }],

  // CallLog (pre-existing)
  ['CallLog', { patientId: 1, scheduledTime: -1 }],
];

console.log('=== Mongoose Compound Index Verification ===\n');

for (const [modelName, expectedKeys] of expectations) {
  const Model = models[modelName];
  if (!Model) {
    console.log(`  ✗ Model "${modelName}" not found`);
    failures++;
    continue;
  }

  const schemaIndexes = Model.schema.indexes();
  const label = `${modelName} ${JSON.stringify(expectedKeys)}`;

  if (hasIndex(schemaIndexes, expectedKeys)) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ MISSING ${label}`);
    failures++;
  }
}

console.log(
  `\n${failures === 0 ? 'All index checks passed ✓' : `${failures} index check(s) FAILED`}`
);
process.exit(failures === 0 ? 0 : 1);
