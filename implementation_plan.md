# Goal Description
Enhance the medication deletion flow on the Caller/Caretaker screen. When a caller taps the "delete" icon on a medicine, they will be presented with a premium custom alert prompting them to classify the reason for deletion. This ensures accurate medical history tracking.

The two options will be:
1. **Entered by mistake**: Performs a "hard delete," permanently removing the medication from the database so it never pollutes the patient's history.
2. **User has stopped using**: Performs a "soft delete" (the current behavior), which updates the medication status to 'stopped', preserving its historical record.

## User Review Required
> [!IMPORTANT]
> Please review the proposed flow. Does the wording "Entered by mistake" and "User has stopped using" look good for the caller UI? If approved, I'll build out the premium alert modal and the backend logic to handle the hard deletion.

## Proposed Changes

### Frontend
#### [MODIFY] admin-app/src/lib/api.js
- Update the `deleteMedication` API method to accept a `deleteType` parameter in its payload (e.g., `hard` or `soft`).

#### [MODIFY] admin-app/src/screens/details/ActiveCallScreen.js
- Intercept the medication deletion action.
- Implement a premium bottom-sheet/modal using the same high-quality aesthetic as our recent alerts.
- Present the two delete options visually, sending the appropriate `deleteType` based on the caller's selection.

### Backend
#### [MODIFY] backend/src/routes/patients.js (or wherever the specific medication endpoint lives)
- Update the `DELETE /api/caretaker/patients/:patientId/medications/:medId` route.
- If `req.body.deleteType === 'hard'`, use MongoDB `$pull` to completely remove the medication sub-document from the patient's record.
- If `deleteType === 'soft'` (or omitted for backwards compatibility), maintain the current logic of setting `isActive: false` or `status: 'stopped'`.

## Verification Plan
1. Test "Entered by mistake": Verify the medication is physically removed from the database and disappears from the UI entirely without leaving a "stopped" history log.
2. Test "User has stopped using": Verify the medication is marked as stopped, removed from the daily schedule, but remains in the patient's historical profile.
