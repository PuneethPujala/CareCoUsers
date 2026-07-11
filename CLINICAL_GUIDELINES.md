# CareMyMed — Clinical, Privacy, and Accessibility Guidelines

This document establishes the core guidelines for developing, modifying, and reviewing code in the CareMyMed repository. It acts as a **first-pass filter** to catch architectural and design errors early in the development lifecycle.

> [!WARNING]
> **CRITICAL DISCLAIMER: NOT A SUBSTITUTE FOR EXPERT REVIEW**
> This playbook is a developer-level checklist and a linting guide for AI agents. It does **NOT** substitute for professional clinical safety audits, legal HIPAA compliance reviews, or physical accessibility consulting. All clinical copy, threshold values, and privacy policies must receive final sign-off from qualified human professionals before production deployment.

---

## 1. Clinical Safety & Copy Writing
To minimize legal liability and prevent patient anxiety, CareMyMed strictly avoids diagnostic or alarming language. The app behaves as a monitoring assistant, not a doctor.

### A. Non-Diagnostic Language Rules
* **No Diagnostic Labeling**: Never use code or copy that asserts a medical diagnosis (e.g., *tachycardia, hypertension, hypoglycemia*). Instead, describe the metric trend relative to the user's personal baseline.
* **No Automated Severity Claims**: Avoid labels like *"Dangerous"* or *"Abnormal"* without explicit physician-configured baselines. Use clinical descriptors like *"Elevated"* or *"Lower than baseline"*.
* **Prompt Human Care Interaction**: Every outlier vital alert or missed dose warning must end with an actionable suggestion to rest, log again, or contact the care team.

**Copy Examples:**
* ❌ *Incorrect*: "Your heart rate is 112 BPM. You may be experiencing tachycardia. Seek emergency help."
*  *Correct*: "Your heart rate is 112 BPM, which is elevated compared to your baseline. We recommend resting and taking another reading in a few minutes. Please contact your care team if you feel unwell."

### B. Baseline Guardrails
* **Clinical Normal Ranges**: All default baseline calculations must derive from standard demographic guidelines, but **must** allow clinical overrides by the patient's primary care manager.
* **Geriatric Precautions**: Elderly patients' normal ranges may differ meaningfully from general adult guidelines and must not be assumed — flag for clinical override rather than hardcoding a fixed elevated target.

### C. No Promising Unbuilt Capabilities
* **Backend Verification**: UI copy and onboarding guides must never promise a capability (such as sync disconnections, account/data deletions, or file exports) that does not have a corresponding, fully implemented and tested backend API endpoint. Always verify the endpoint exists and is operational before writing the user-facing claim.

### D. Alert Fatigue & Notification Throttling
* **Alert Throttling**: Repeated non-critical anomaly alerts for the same metric within a short window (e.g., 24 hours) must be suppressed or batched rather than sent individually, avoiding notification flood and protecting the caregiver's response threshold.

---

## 2. Geriatric Accessibility (UI/UX)
CareMyMed is designed to be accessible to elderly users who may experience visual, cognitive, or motor impairments.

### A. Touch Targets
* **Minimum Dimensions**: Every interactive component (buttons, chips, list items, checkboxes) must have a minimum touch target size of **48x48 dp** on Android and **44x44 pt** on iOS.
* **Padding over Margin**: Implement touch target expansions using internal component padding rather than external layout margins to keep the pressable hitboxes large and responsive.

### B. Typography & Scaling
* **Dynamic Type Support**: Never hardcode high font sizes without wrapping containers in flexible layouts. Ensure that when users scale up their device font sizes, text wraps gracefully without clipping or overlapping.
* **Font Contrast**: Standard text must maintain a minimum contrast ratio of **4.5:1** against the background surface. Bold display headers must maintain at least **3.0:1**.

---

## 3. HIPAA, Privacy & PHI Isolation
Protecting Protected Health Information (PHI) is a core system requirement.

### A. Log Sanitization
* **Log Scrubbing**: Never write patient names, email addresses, phone numbers, raw invite codes, or specific vital statistics into console logs, standard files, or third-party monitoring services (e.g., Sentry).
* **Identifier Anonymization**: Use MongoDB ObjectIDs (`patient_id`) for identifying logs, tracking performance metrics, or tracing errors.

### B. Security & Scope Enforcement
* **Access Filtering**: All backend database queries for patient data must pass through the `scopeFilter.js` middleware. Caregivers and companions must only retrieve records belonging to patients who have explicitly granted them access.

### C. Client-Side Data Security
* **Secure Token Storage**: Keep push tokens and session JWTs encrypted in `expo-secure-store` on the mobile device.
* **Screen Security**: Disable screenshot/screen capture capabilities on screens displaying sensitive health profiles if the patient profile flag `allow_screenshots` is set to false. Render a privacy overlay mask when the app transitions into the background.

---

## 4. Wearable Integration (Health Connect & HealthKit)
Syncing biometrics requires strict boundary checks to avoid duplicate records, battery drain, and timezone gaps.

### A. Prefilter Preference Verification
* **Disabled Sync respect**: Before invoking hardware sync routines, the client must query the user preference map (`@CareMyMed_sync_disabled_categories` in AsyncStorage).
* **Data Discarding**: If the patient has disabled a biometric category (e.g., Weight or Activity), the app must immediately filter out those logs right after reading from the hardware sensors. Do not write them to local cache or transmit them to the backend.

### B. Timezone and Deduplication
* **UTC Timezones**: All vitals logged from wearables must register timestamps converted to UTC on the client, with local timezone offsets stored separately for analytics rendering.
* **Idempotency keys**: Generate unique hashes using `(patientId_metricType_timestamp)` to prevent writing duplicate sensor logs if a patient performs consecutive sync triggers.
