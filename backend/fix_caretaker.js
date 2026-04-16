// Script to fix the corrupted meds endpoint in caretaker.js
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'routes', 'caretaker.js');
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find the boundaries
// Line 676 (index 675) is the blank line after "});"
// Line 767 (index 766) is the next clean "});"
// We need to replace lines 677-766 (indices 676-765)

const cleanMedsEndpoint = `// ═══════════════════════════════════════════════════════════════\r
// 5. GET /api/caretaker/patients/:id/meds — Patient medications\r
//    Optional ?shift=morning|afternoon|night to filter by time-of-day\r
// ═══════════════════════════════════════════════════════════════\r
router.get('/patients/:id/meds', async (req, res) => {\r
    try {\r
        const caretakerId = req.profile._id;\r
        const patientId = req.params.id;\r
\r
        if (!mongoose.Types.ObjectId.isValid(patientId)) {\r
            return res.status(400).json({ error: 'Invalid patient ID' });\r
        }\r
        if (!(await isPatientAssigned(caretakerId, patientId))) {\r
            return res.status(403).json({ error: 'Patient not assigned to you' });\r
        }\r
\r
        const filter = { patientId };\r
        if (req.query.status) filter.status = req.query.status;\r
        else filter.isActive = true;\r
\r
        let medications = await Medication.find(filter)\r
            .sort({ name: 1 })\r
            .lean();\r
\r
        // Shift-based filtering\r
        const shift = req.query.shift;\r
        if (shift) {\r
            medications = filterMedsByShift(medications, shift);\r
        }\r
\r
        // For each med, get the last confirmation from call logs\r
        const enriched = await Promise.all(medications.map(async (med) => {\r
            const lastConfirmation = await CallLog.findOne({\r
                patientId,\r
                caretakerId,\r
                status: 'completed',\r
                'medicationConfirmations.medicationId': med._id,\r
            })\r
                .sort({ scheduledTime: -1 })\r
                .select('scheduledTime medicationConfirmations')\r
                .lean();\r
\r
            const confirmation = lastConfirmation?.medicationConfirmations?.find(\r
                m => m.medicationId?.toString() === med._id.toString()\r
            );\r
\r
            return {\r
                ...med,\r
                lastConfirmed: confirmation?.confirmed ?? null,\r
                lastConfirmedAt: lastConfirmation?.scheduledTime || null,\r
                lastReason: confirmation?.reason || null,\r
            };\r
        }));\r
\r
        res.json({ medications: enriched });\r
    } catch (error) {\r
        console.error('Patient medications error:', error);\r
        res.status(500).json({ error: 'Failed to fetch patient medications' });\r
    }\r
});`;

// Replace lines 677-766 (indices 676-765)
const before = lines.slice(0, 676);
const after = lines.slice(766); // from line 767 onwards
const newLines = [...before, cleanMedsEndpoint, ...after];

fs.writeFileSync(filePath, newLines.join('\n'));
console.log('Fixed! Total lines:', newLines.join('\n').split('\n').length);
