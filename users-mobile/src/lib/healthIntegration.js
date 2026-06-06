import { Platform, Alert } from 'react-native';

// --- Android Health Connect ---
// We use dynamic imports or try/catch requires because these are native modules
// that will crash the web/Expo Go bundler if imported directly without guarding.

let HealthConnect = null;
let AppleHealthKit = null;

export const isHealthSupported = () => {
    return Platform.OS !== 'web'; // Support Android & iOS natively
};

/**
 * Initialize health SDKs based on the platform.
 * Must be called before any permission requests.
 */
export const initializeHealthPlatform = async () => {
    if (Platform.OS === 'android') {
        try {
            HealthConnect = require('react-native-health-connect');
            const isInitialized = await HealthConnect.initialize();
            if (!isInitialized) {
                console.warn("Health Connect is not available on this device.");
                return false;
            }
            return true;
        } catch (e) {
            console.warn("Failed to initialize Android Health Connect:", e);
            return false;
        }
    } else if (Platform.OS === 'ios') {
        try {
            AppleHealthKit = require('react-native-health').default;
            return true;
        } catch (e) {
            console.warn("Failed to initialize Apple HealthKit:", e);
            return false;
        }
    }
    return false;
};

/**
 * Request user permission to read Heart Rate, Sleep, and Blood Pressure.
 */
export const requestHealthPermissions = async () => {
    if (Platform.OS === 'android' && HealthConnect) {
        try {
            const permissions = [
                { accessType: 'read', recordType: 'HeartRate' },
                { accessType: 'read', recordType: 'BloodPressure' },
                { accessType: 'read', recordType: 'SleepSession' },
                { accessType: 'read', recordType: 'OxygenSaturation' },
                { accessType: 'read', recordType: 'Hydration' },
                { accessType: 'read', recordType: 'BodyTemperature' }
            ];
            const granted = await HealthConnect.requestPermission(permissions);
            return granted && granted.length > 0;
        } catch (e) {
            console.warn('Android Health Permission Error:', e);
            return false;
        }
    } else if (Platform.OS === 'ios' && AppleHealthKit) {
        return new Promise((resolve) => {
            const permissions = {
                permissions: {
                    read: [
                        AppleHealthKit.Constants.Permissions.HeartRate,
                        AppleHealthKit.Constants.Permissions.BloodPressureSystolic,
                        AppleHealthKit.Constants.Permissions.BloodPressureDiastolic,
                        AppleHealthKit.Constants.Permissions.SleepAnalysis,
                        AppleHealthKit.Constants.Permissions.OxygenSaturation,
                        AppleHealthKit.Constants.Permissions.Water,
                        AppleHealthKit.Constants.Permissions.BodyTemperature,
                    ],
                },
            };
            AppleHealthKit.initHealthKit(permissions, (error) => {
                if (error) {
                    console.warn('iOS Health Permission Error:', error);
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }
    return false;
};

/**
 * Check current permission status without re-prompting the user.
 * @returns {Promise<'granted'|'denied'|'unavailable'>}
 */
export const checkPermissionStatus = async () => {
    if (Platform.OS === 'android') {
        try {
            if (!HealthConnect) {
                HealthConnect = require('react-native-health-connect');
            }
            const isInitialized = await HealthConnect.initialize();
            if (!isInitialized) return 'unavailable';

            // Check if HeartRate read permission is granted (primary metric)
            const grantedPermissions = await HealthConnect.getGrantedPermissions();
            const hasHR = grantedPermissions?.some(
                p => p.recordType === 'HeartRate' && p.accessType === 'read'
            );
            return hasHR ? 'granted' : 'denied';
        } catch (e) {
            console.warn('Permission check failed:', e);
            return 'unavailable';
        }
    } else if (Platform.OS === 'ios') {
        // iOS doesn't expose explicit permission status for HealthKit reads.
        // If HealthKit initialized successfully before, we consider it "granted".
        // The actual auth status is per-type and only queryable via callbacks.
        if (AppleHealthKit) return 'granted';
        try {
            AppleHealthKit = require('react-native-health').default;
            return 'denied'; // Loaded but not yet initialized
        } catch (e) {
            return 'unavailable';
        }
    }
    return 'unavailable';
};

/**
 * Fetches recent vitals (e.g. past 24 hours) from the device and averages them.
 * @returns { heart_rate, systolic, diastolic, oxygen_saturation } 
 */
export const fetchDailyVitalsSummary = async () => {
    // Determine the time-range for fetching (last 24 hours)
    let startTime = new Date();
    startTime.setHours(startTime.getHours() - 24);
    let endTime = new Date();

    let vitals = {
        heart_rate: null,
        oxygen_saturation: null,
        systolic: null,
        diastolic: null,
        hydration: null,
        temperature: null,
    };

    if (Platform.OS === 'android' && HealthConnect) {
        try {
            const hrRecords = await HealthConnect.readRecords('HeartRate', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                },
            });

            if (hrRecords && hrRecords.records.length > 0) {
                // Average the beats per minute from the array of records
                const total = hrRecords.records.reduce((acc, curr) => acc + curr.samples[0].beatsPerMinute, 0);
                vitals.heart_rate = Math.round(total / hrRecords.records.length);
            }

            const o2Records = await HealthConnect.readRecords('OxygenSaturation', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                },
            });

            if (o2Records && o2Records.records.length > 0) {
                const total = o2Records.records.reduce((acc, curr) => acc + curr.percentage, 0);
                vitals.oxygen_saturation = Math.round(total / o2Records.records.length);
            }

            const bpRecords = await HealthConnect.readRecords('BloodPressure', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                },
            });

            if (bpRecords && bpRecords.records.length > 0) {
                const systolicTotal = bpRecords.records.reduce((acc, curr) => acc + curr.systolic.inMillimetersOfMercury, 0);
                const diastolicTotal = bpRecords.records.reduce((acc, curr) => acc + curr.diastolic.inMillimetersOfMercury, 0);
                vitals.systolic = Math.round(systolicTotal / bpRecords.records.length);
                vitals.diastolic = Math.round(diastolicTotal / bpRecords.records.length);
            }

            const hydrationRecords = await HealthConnect.readRecords('Hydration', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                },
            });

            if (hydrationRecords && hydrationRecords.records.length > 0) {
                // Calculate hydration relative to 2.0L daily target
                const totalLiters = hydrationRecords.records.reduce((acc, curr) => acc + curr.volume.inLiters, 0);
                vitals.hydration = Math.min(100, Math.round((totalLiters / 2.0) * 100));
            }

            const tempRecords = await HealthConnect.readRecords('BodyTemperature', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                },
            });

            if (tempRecords && tempRecords.records.length > 0) {
                const totalTemp = tempRecords.records.reduce((acc, curr) => acc + curr.temperature.inFahrenheit, 0);
                vitals.temperature = Math.round((totalTemp / tempRecords.records.length) * 10) / 10;
            }
        } catch (e) {
            console.error('Failed to read Health Connect data', e);
        }
    } else if (Platform.OS === 'ios' && AppleHealthKit) {
        const options = {
            startDate: startTime.toISOString(),
            endDate: endTime.toISOString(),
            limit: 50,
        };
        
        try {
            const hr = await new Promise((resolve) => {
                AppleHealthKit.getHeartRateSamples(options, (err, results) => {
                    resolve(err ? [] : results);
                });
            });

            if (hr.length > 0) {
                const total = hr.reduce((acc, curr) => acc + curr.value, 0);
                vitals.heart_rate = Math.round(total / hr.length);
            }

            const bp = await new Promise((resolve) => {
                AppleHealthKit.getBloodPressureSamples(options, (err, results) => {
                    resolve(err ? [] : results);
                });
            });

            if (bp.length > 0) {
                const systolicTotal = bp.reduce((acc, curr) => acc + curr.bloodPressureSystolicValue, 0);
                const diastolicTotal = bp.reduce((acc, curr) => acc + curr.bloodPressureDiastolicValue, 0);
                vitals.systolic = Math.round(systolicTotal / bp.length);
                vitals.diastolic = Math.round(diastolicTotal / bp.length);
            }

            const water = await new Promise((resolve) => {
                AppleHealthKit.getWater(options, (err, results) => {
                    resolve(err ? [] : results);
                });
            });

            if (water.length > 0) {
                const totalMl = water.reduce((acc, curr) => acc + curr.value, 0);
                vitals.hydration = Math.min(100, Math.round((totalMl / 2000) * 100));
            }

            const temp = await new Promise((resolve) => {
                AppleHealthKit.getBodyTemperatureSamples(options, (err, results) => {
                    resolve(err ? [] : results);
                });
            });

            if (temp.length > 0) {
                const totalTemp = temp.reduce((acc, curr) => acc + curr.value, 0);
                vitals.temperature = Math.round((totalTemp / temp.length) * 10) / 10;
            }
        } catch (e) {
            console.error('Failed to read Apple HealthKit data', e);
        }
    }

    return vitals;
};

/**
 * Fetches granular (individual timestamped) vital readings since a given timestamp.
 * Unlike fetchDailyVitalsSummary which averages, this returns every raw data point
 * for high-resolution ingestion into the backend and AI analysis.
 * 
 * @param {Date} sinceTimestamp - Fetch readings newer than this time
 * @returns {Array<{timestamp, heart_rate, oxygen_saturation?, blood_pressure?}>}
 */
export const fetchGranularVitals = async (sinceTimestamp) => {
    const startTime = sinceTimestamp || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const endTime = new Date();
    const readings = [];

    if (Platform.OS === 'android' && HealthConnect) {
        try {
            const timeFilter = {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                },
            };

            // ── Heart Rate records ────────────────────────────────
            const hrRecords = await HealthConnect.readRecords('HeartRate', timeFilter);
            if (hrRecords?.records) {
                for (const record of hrRecords.records) {
                    for (const sample of (record.samples || [])) {
                        readings.push({
                            timestamp: sample.time || record.startTime,
                            heart_rate: sample.beatsPerMinute,
                        });
                    }
                }
            }

            // ── Oxygen Saturation records ─────────────────────────
            const o2Records = await HealthConnect.readRecords('OxygenSaturation', timeFilter);
            if (o2Records?.records) {
                for (const record of o2Records.records) {
                    // Try to merge with a heart rate reading at a close timestamp,
                    // or create a new entry
                    const timestamp = record.time || record.startTime;
                    const existing = readings.find(r => {
                        const diff = Math.abs(new Date(r.timestamp) - new Date(timestamp));
                        return diff < 5 * 60 * 1000; // within 5 minutes
                    });
                    if (existing) {
                        existing.oxygen_saturation = record.percentage;
                    } else {
                        readings.push({
                            timestamp,
                            heart_rate: null, // Will be filtered out if null during ingestion
                            oxygen_saturation: record.percentage,
                        });
                    }
                }
            }

            // ── Blood Pressure records ────────────────────────────
            const bpRecords = await HealthConnect.readRecords('BloodPressure', timeFilter);
            if (bpRecords?.records) {
                for (const record of bpRecords.records) {
                    const timestamp = record.time || record.startTime;
                    const existing = readings.find(r => {
                        const diff = Math.abs(new Date(r.timestamp) - new Date(timestamp));
                        return diff < 5 * 60 * 1000;
                    });
                    if (existing) {
                        existing.blood_pressure = {
                            systolic: record.systolic?.inMillimetersOfMercury,
                            diastolic: record.diastolic?.inMillimetersOfMercury,
                        };
                    } else {
                        readings.push({
                            timestamp,
                            heart_rate: null,
                            blood_pressure: {
                                systolic: record.systolic?.inMillimetersOfMercury,
                                diastolic: record.diastolic?.inMillimetersOfMercury,
                            },
                        });
                    }
                }
            }

            // ── Hydration records ─────────────────────────────────
            const hydrationRecords = await HealthConnect.readRecords('Hydration', timeFilter);
            if (hydrationRecords?.records) {
                for (const record of hydrationRecords.records) {
                    const timestamp = record.startTime || record.endTime;
                    const existing = readings.find(r => {
                        const diff = Math.abs(new Date(r.timestamp) - new Date(timestamp));
                        return diff < 5 * 60 * 1000;
                    });
                    const volPercent = Math.min(100, Math.round((record.volume?.inLiters / 2.0) * 100));
                    if (existing) {
                        existing.hydration = volPercent;
                    } else {
                        readings.push({
                            timestamp,
                            heart_rate: null,
                            hydration: volPercent,
                        });
                    }
                }
            }

            // ── Body Temperature records ──────────────────────────
            const tempRecords = await HealthConnect.readRecords('BodyTemperature', timeFilter);
            if (tempRecords?.records) {
                for (const record of tempRecords.records) {
                    const timestamp = record.time || record.startTime;
                    const existing = readings.find(r => {
                        const diff = Math.abs(new Date(r.timestamp) - new Date(timestamp));
                        return diff < 5 * 60 * 1000;
                    });
                    const tempF = record.temperature?.inFahrenheit;
                    if (existing) {
                        existing.temperature = tempF;
                    } else {
                        readings.push({
                            timestamp,
                            heart_rate: null,
                            temperature: tempF,
                        });
                    }
                }
            }
        } catch (e) {
            console.error('Failed to fetch granular Health Connect data:', e);
        }
    } else if (Platform.OS === 'ios' && AppleHealthKit) {
        try {
            const options = {
                startDate: startTime.toISOString(),
                endDate: endTime.toISOString(),
                ascending: true,
            };

            // ── Heart Rate ────────────────────────────────────────
            const hrSamples = await new Promise((resolve) => {
                AppleHealthKit.getHeartRateSamples(options, (err, results) => {
                    resolve(err ? [] : results);
                });
            });

            for (const sample of hrSamples) {
                readings.push({
                    timestamp: sample.startDate || sample.endDate,
                    heart_rate: Math.round(sample.value),
                });
            }

            // ── Oxygen Saturation ─────────────────────────────────
            const o2Samples = await new Promise((resolve) => {
                AppleHealthKit.getOxygenSaturationSamples(options, (err, results) => {
                    resolve(err ? [] : results);
                });
            });

            for (const sample of o2Samples) {
                const timestamp = sample.startDate || sample.endDate;
                const existing = readings.find(r => {
                    const diff = Math.abs(new Date(r.timestamp) - new Date(timestamp));
                    return diff < 5 * 60 * 1000;
                });
                if (existing) {
                    existing.oxygen_saturation = Math.round(sample.value * 100); // HealthKit returns 0-1
                } else {
                    readings.push({
                        timestamp,
                        heart_rate: null,
                        oxygen_saturation: Math.round(sample.value * 100),
                    });
                }
            }

            // ── Blood Pressure ────────────────────────────────────
            const bpSamples = await new Promise((resolve) => {
                AppleHealthKit.getBloodPressureSamples(options, (err, results) => {
                    resolve(err ? [] : results);
                });
            });

            for (const sample of bpSamples) {
                const timestamp = sample.startDate || sample.endDate;
                const existing = readings.find(r => {
                    const diff = Math.abs(new Date(r.timestamp) - new Date(timestamp));
                    return diff < 5 * 60 * 1000;
                });
                if (existing) {
                    existing.blood_pressure = {
                        systolic: sample.bloodPressureSystolicValue,
                        diastolic: sample.bloodPressureDiastolicValue,
                    };
                } else {
                    readings.push({
                        timestamp,
                        heart_rate: null,
                        blood_pressure: {
                            systolic: sample.bloodPressureSystolicValue,
                            diastolic: sample.bloodPressureDiastolicValue,
                        },
                    });
                }
            }

            // ── Hydration (Water) ─────────────────────────────────
            const waterSamples = await new Promise((resolve) => {
                AppleHealthKit.getWater(options, (err, results) => {
                    resolve(err ? [] : results);
                });
            });

            for (const sample of waterSamples) {
                const timestamp = sample.startDate || sample.endDate;
                const existing = readings.find(r => {
                    const diff = Math.abs(new Date(r.timestamp) - new Date(timestamp));
                    return diff < 5 * 60 * 1000;
                });
                const volPercent = Math.min(100, Math.round((sample.value / 2000) * 100)); // assume ml
                if (existing) {
                    existing.hydration = volPercent;
                } else {
                    readings.push({
                        timestamp,
                        heart_rate: null,
                        hydration: volPercent,
                    });
                }
            }

            // ── Body Temperature ──────────────────────────────────
            const tempSamples = await new Promise((resolve) => {
                AppleHealthKit.getBodyTemperatureSamples(options, (err, results) => {
                    resolve(err ? [] : results);
                });
            });

            for (const sample of tempSamples) {
                const timestamp = sample.startDate || sample.endDate;
                const existing = readings.find(r => {
                    const diff = Math.abs(new Date(r.timestamp) - new Date(timestamp));
                    return diff < 5 * 60 * 1000;
                });
                const tempF = sample.value;
                if (existing) {
                    existing.temperature = tempF;
                } else {
                    readings.push({
                        timestamp,
                        heart_rate: null,
                        temperature: tempF,
                    });
                }
            }
        } catch (e) {
            console.error('Failed to fetch granular HealthKit data:', e);
        }
    }

    // Filter out readings that don't have at least a heart_rate
    // (standalone O2/BP without HR are still valid, but HR is the primary metric)
    const filtered = readings.filter(r => r.heart_rate != null || r.oxygen_saturation != null);

    // Development Mock Fallback: STRICTLY wrapped under __DEV__ check to prevent fake data in production
    if (__DEV__ && filtered.length === 0) {
        console.log('🧪 Health sync: [DEV ONLY] Generating high-fidelity vital readings...');
        const now = Date.now();
        // Generate a few samples over the last hour (e.g., 5 readings spaced 12 minutes apart)
        for (let i = 0; i < 5; i++) {
            const readingTime = new Date(now - i * 12 * 60 * 1000);
            filtered.push({
                timestamp: readingTime.toISOString(),
                heart_rate: Math.round(70 + Math.random() * 12),
                oxygen_saturation: Math.round(96 + Math.random() * 4),
                blood_pressure: {
                    systolic: Math.round(115 + Math.random() * 10),
                    diastolic: Math.round(75 + Math.random() * 8),
                },
                hydration: Math.round(60 + Math.random() * 15),
            });
        }
    }

    return filtered;
};

/**
 * Fetches sleep session data from Health Connect or HealthKit.
 * Foundation for Stage 4 (Night Guardian Mode).
 * 
 * @param {Date} sinceTimestamp - Fetch sessions newer than this time
 * @returns {Array<{startTime, endTime, stages?}>}
 */
export const fetchSleepSessions = async (sinceTimestamp) => {
    const startTime = sinceTimestamp || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const endTime = new Date();
    const sessions = [];

    if (Platform.OS === 'android' && HealthConnect) {
        try {
            const records = await HealthConnect.readRecords('SleepSession', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                },
            });

            if (records?.records) {
                for (const record of records.records) {
                    sessions.push({
                        startTime: record.startTime,
                        endTime: record.endTime,
                        stages: record.stages?.map(s => ({
                            startTime: s.startTime,
                            endTime: s.endTime,
                            stage: s.stage, // e.g., 'awake', 'light', 'deep', 'rem'
                        })),
                    });
                }
            }
        } catch (e) {
            console.error('Failed to fetch sleep sessions from Health Connect:', e);
        }
    } else if (Platform.OS === 'ios' && AppleHealthKit) {
        try {
            const options = {
                startDate: startTime.toISOString(),
                endDate: endTime.toISOString(),
            };

            const samples = await new Promise((resolve) => {
                AppleHealthKit.getSleepSamples(options, (err, results) => {
                    resolve(err ? [] : results);
                });
            });

            for (const sample of samples) {
                sessions.push({
                    startTime: sample.startDate,
                    endTime: sample.endDate,
                    stages: [{ stage: sample.value }], // 'ASLEEP', 'INBED', 'AWAKE'
                });
            }
        } catch (e) {
            console.error('Failed to fetch sleep sessions from HealthKit:', e);
        }
    }

    return sessions;
};
