import { Platform } from 'react-native';
import {
    getHealthConnect,
    getAppleHealthKit,
    checkPermissionStatus,
    OPTIONAL_PERMISSIONS,
    REQUIRED_PERMISSIONS
} from './healthIntegration';

class HealthRepository {
    /**
     * Fetch all normalized health metrics since the given timestamp.
     * Triggers adapters based on the platform.
     *
     * @param {Date} sinceTimestamp
     * @returns {Promise<{ vitals: Array, activity: object|null, body: object|null }>}
     */
    static async fetchAll(sinceTimestamp) {
        const since = sinceTimestamp || new Date(Date.now() - 24 * 60 * 60 * 1000);
        const source = Platform.OS === 'ios' ? 'healthkit' : 'health_connect';

        try {
            if (Platform.OS === 'android') {
                return await AndroidHealthAdapter.fetchAll(since);
            } else if (Platform.OS === 'ios') {
                return await IOSHealthAdapter.fetchAll(since);
            }
        } catch (err) {
            console.error('HealthRepository fetchAll error:', err);
        }

        return { vitals: [], activity: null, body: null };
    }

    /**
     * Generates a realistic mock sync payload for development testing.
     */
    static generateDevMockPayload(since, source) {
        const now = new Date();
        const mockVitals = [];

        for (let i = 0; i < 5; i++) {
            const readingTime = new Date(now.getTime() - i * 12 * 60 * 1000);
            mockVitals.push({
                timestamp: readingTime.toISOString(),
                heart_rate: Math.round(68 + Math.random() * 14),
                oxygen_saturation: Math.round(97 + Math.random() * 3),
                blood_pressure: {
                    systolic: Math.round(112 + Math.random() * 12),
                    diastolic: Math.round(72 + Math.random() * 10),
                },
                hydration: Math.round(50 + Math.random() * 20),
                temperature: Math.round((97.8 + Math.random() * 1.2) * 10) / 10,
                blood_glucose: Math.round(85 + Math.random() * 35),
                respiratory_rate: Math.round(12 + Math.random() * 6),
                metadata: {
                    device_name: 'Mock Wearable',
                    device_manufacturer: 'CareMyMed',
                    device_model: 'Simulated v1',
                    record_id: `mock-vital-${i}`,
                    last_modified: now.toISOString(),
                    timezone: 'Asia/Kolkata',
                    recorded_at: readingTime.toISOString(),
                },
            });
        }

        const mockActivity = {
            date: now.toISOString(),
            steps: Math.round(4500 + Math.random() * 3000),
            distance_meters: Math.round(3000 + Math.random() * 2000),
            active_calories: Math.round(180 + Math.random() * 120),
            total_calories: Math.round(1600 + Math.random() * 400),
            floors_climbed: Math.round(3 + Math.random() * 5),
            vo2_max: Math.round(40 + Math.random() * 5),
            exercises: [
                {
                    type: 'running',
                    start_time: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
                    end_time: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
                    duration_minutes: 30,
                    calories: 220,
                    distance_meters: 4200,
                    avg_heart_rate: 145,
                    source_id: 'mock-ex-1',
                },
            ],
            metadata: {
                device_name: 'Mock Wearable',
                device_manufacturer: 'CareMyMed',
                device_model: 'Simulated v1',
                record_id: 'mock-activity-1',
                last_modified: now.toISOString(),
                timezone: 'Asia/Kolkata',
                recorded_at: now.toISOString(),
            },
        };

        const mockBody = {
            date: now.toISOString(),
            weight_kg: Math.round((72.5 + Math.random() * 1.5) * 10) / 10,
            height_cm: 178,
            body_fat_pct: Math.round((18.2 + Math.random() * 1.1) * 10) / 10,
            metadata: {
                device_name: 'Mock Smart Scale',
                device_manufacturer: 'CareMyMed Scale',
                device_model: 'Composition Pro',
                record_id: 'mock-body-1',
                last_modified: now.toISOString(),
                timezone: 'Asia/Kolkata',
                recorded_at: now.toISOString(),
            },
        };

        return { vitals: mockVitals, activity: mockActivity, body: mockBody };
    }

    // ── History Methods ──
    static async fetchVitalsHistory(days = 30) {
        // Implementation can be hooked to local cache or DB sync queries as needed
        return [];
    }

    static async fetchActivityHistory(days = 30) {
        return [];
    }

    static async fetchBodyHistory(days = 90) {
        return [];
    }
}

class AndroidHealthAdapter {
    static async fetchAll(since) {
        const HealthConnect = getHealthConnect();
        if (!HealthConnect) return { vitals: [], activity: null, body: null };

        const endTime = new Date();
        const timeFilter = {
            timeRangeFilter: {
                operator: 'between',
                startTime: since.toISOString(),
                endTime: endTime.toISOString(),
            },
        };

        // 1. Fetch Vitals (granular, grouped by nearest timestamp)
        const vitals = await this._fetchVitals(HealthConnect, timeFilter);

        // 2. Fetch Activity (daily aggregate & workouts)
        const activity = await this._fetchActivity(HealthConnect, timeFilter, endTime);

        // 3. Fetch Body Composition
        const body = await this._fetchBody(HealthConnect, timeFilter, endTime);

        return { vitals, activity, body };
    }

    static async _fetchVitals(HealthConnect, timeFilter) {
        const readings = [];

        try {
            // Helper to safe-read records
            const safeRead = async (type) => {
                try {
                    return await HealthConnect.readRecords(type, timeFilter);
                } catch (e) {
                    return null;
                }
            };

            const [hrData, o2Data, bpData, hydData, tempData, bgData, rrData] = await Promise.all([
                safeRead('HeartRate'),
                safeRead('OxygenSaturation'),
                safeRead('BloodPressure'),
                safeRead('Hydration'),
                safeRead('BodyTemperature'),
                safeRead('BloodGlucose'),
                safeRead('RespiratoryRate'),
            ]);

            const mergeReading = (timestamp, key, value, metadata) => {
                const existing = readings.find(r => {
                    const diff = Math.abs(new Date(r.timestamp) - new Date(timestamp));
                    return diff < 5 * 60 * 1000; // 5 min window
                });

                if (existing) {
                    existing[key] = value;
                    if (metadata && !existing.metadata) {
                        existing.metadata = metadata;
                    }
                } else {
                    const newReading = {
                        timestamp,
                        heart_rate: null,
                        oxygen_saturation: null,
                        blood_pressure: null,
                        hydration: null,
                        temperature: null,
                        blood_glucose: null,
                        respiratory_rate: null,
                    };
                    newReading[key] = value;
                    if (metadata) {
                        newReading.metadata = metadata;
                    }
                    readings.push(newReading);
                }
            };

            const mapMeta = (rec) => {
                if (!rec || !rec.metadata) return undefined;
                return {
                    device_name: rec.metadata.device || undefined,
                    device_manufacturer: rec.metadata.manufacturer || undefined,
                    device_model: rec.metadata.model || undefined,
                    record_id: rec.metadata.id,
                    last_modified: rec.metadata.lastModifiedTime,
                    timezone: rec.metadata.timezoneOffset,
                    recorded_at: rec.startTime || rec.time,
                };
            };

            // Heart Rate
            if (hrData?.records) {
                hrData.records.forEach(r => {
                    if (r.samples) {
                        r.samples.forEach(s => {
                            mergeReading(s.time || r.startTime, 'heart_rate', s.beatsPerMinute, mapMeta(r));
                        });
                    }
                });
            }

            // Oxygen Saturation
            if (o2Data?.records) {
                o2Data.records.forEach(r => {
                    mergeReading(r.time || r.startTime, 'oxygen_saturation', r.percentage, mapMeta(r));
                });
            }

            // Blood Pressure
            if (bpData?.records) {
                bpData.records.forEach(r => {
                    mergeReading(r.time || r.startTime, 'blood_pressure', {
                        systolic: r.systolic?.inMillimetersOfMercury,
                        diastolic: r.diastolic?.inMillimetersOfMercury,
                    }, mapMeta(r));
                });
            }

            // Hydration
            if (hydData?.records) {
                hydData.records.forEach(r => {
                    const volPercent = Math.min(100, Math.round((r.volume?.inLiters / 2.0) * 100));
                    mergeReading(r.startTime, 'hydration', volPercent, mapMeta(r));
                });
            }

            // Temperature
            if (tempData?.records) {
                tempData.records.forEach(r => {
                    mergeReading(r.time || r.startTime, 'temperature', r.temperature?.inFahrenheit, mapMeta(r));
                });
            }

            // Blood Glucose
            if (bgData?.records) {
                bgData.records.forEach(r => {
                    mergeReading(r.time || r.startTime, 'blood_glucose', r.level?.inMilligramsPerDeciliter, mapMeta(r));
                });
            }

            // Respiratory Rate
            if (rrData?.records) {
                rrData.records.forEach(r => {
                    mergeReading(r.time || r.startTime, 'respiratory_rate', r.rate, mapMeta(r));
                });
            }

        } catch (e) {
            console.warn('AndroidHealthAdapter vitals fetch failed:', e);
        }

        // Return records that have at least one valid parsed vital sign
        return readings.filter(r =>
            r.heart_rate != null ||
            r.oxygen_saturation != null ||
            r.blood_pressure != null ||
            r.hydration != null ||
            r.temperature != null ||
            r.blood_glucose != null ||
            r.respiratory_rate != null
        );
    }

    static async _fetchActivity(HealthConnect, timeFilter, endTime) {
        try {
            const startOfToday = new Date(endTime);
            startOfToday.setHours(0, 0, 0, 0);
            const dailyTimeFilter = {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startOfToday.toISOString(),
                    endTime: endTime.toISOString(),
                },
            };

            const safeRead = async (type) => {
                try {
                    return await HealthConnect.readRecords(type, timeFilter);
                } catch (e) {
                    return null;
                }
            };

            const safeReadDaily = async (type) => {
                try {
                    return await HealthConnect.readRecords(type, dailyTimeFilter);
                } catch (e) {
                    return null;
                }
            };

            const [steps, dist, actCal, totCal, floors, vo2, exercises] = await Promise.all([
                safeReadDaily('Steps'),
                safeReadDaily('Distance'),
                safeReadDaily('ActiveCaloriesBurned'),
                safeReadDaily('TotalCaloriesBurned'),
                safeReadDaily('FloorsClimbed'),
                safeRead('Vo2Max'),
                safeRead('ExerciseSession'),
            ]);

            const activity = {
                date: endTime.toISOString(),
                steps: 0,
                distance_meters: 0,
                active_calories: 0,
                total_calories: 0,
                floors_climbed: 0,
                vo2_max: 0,
                exercises: [],
            };

            let primaryMeta = null;

            if (steps?.records) {
                activity.steps = steps.records.reduce((acc, curr) => acc + (curr.count || 0), 0);
                if (steps.records[0]?.metadata) primaryMeta = steps.records[0].metadata;
            }
            if (dist?.records) {
                activity.distance_meters = dist.records.reduce((acc, curr) => acc + (curr.distance?.inMeters || 0), 0);
            }
            if (actCal?.records) {
                activity.active_calories = Math.round(actCal.records.reduce((acc, curr) => acc + (curr.energy?.inKilocalories || 0), 0));
            }
            if (totCal?.records) {
                activity.total_calories = Math.round(totCal.records.reduce((acc, curr) => acc + (curr.energy?.inKilocalories || 0), 0));
            }
            if (floors?.records) {
                activity.floors_climbed = floors.records.reduce((acc, curr) => acc + (curr.floors || 0), 0);
            }
            if (vo2?.records && vo2.records.length > 0) {
                activity.vo2_max = Math.round(vo2.records[vo2.records.length - 1].vo2Rate || 0);
            }

            if (exercises?.records) {
                activity.exercises = exercises.records.map(e => ({
                    type: e.exerciseType || 'workout',
                    start_time: e.startTime,
                    end_time: e.endTime,
                    duration_minutes: Math.round((new Date(e.endTime) - new Date(e.startTime)) / 60000),
                    calories: 0, // Health Connect maps session separate from calorie burned records
                    distance_meters: 0,
                    avg_heart_rate: 0,
                    source_id: e.metadata?.id,
                }));
            }

            if (primaryMeta) {
                activity.metadata = {
                    device_name: primaryMeta.device || undefined,
                    device_manufacturer: primaryMeta.manufacturer || undefined,
                    device_model: primaryMeta.model || undefined,
                    record_id: primaryMeta.id,
                    last_modified: primaryMeta.lastModifiedTime,
                    timezone: primaryMeta.timezoneOffset,
                    recorded_at: endTime.toISOString(),
                };
            }

            const hasAnyData = activity.steps > 0 || activity.active_calories > 0 || activity.exercises.length > 0;
            return hasAnyData ? activity : null;
        } catch (e) {
            console.warn('AndroidHealthAdapter activity fetch failed:', e);
            return null;
        }
    }

    static async _fetchBody(HealthConnect, timeFilter, endTime) {
        try {
            const safeRead = async (type) => {
                try {
                    return await HealthConnect.readRecords(type, timeFilter);
                } catch (e) {
                    return null;
                }
            };

            const [weight, height, fat] = await Promise.all([
                safeRead('Weight'),
                safeRead('Height'),
                safeRead('BodyFat'),
            ]);

            const body = {
                date: endTime.toISOString(),
                weight_kg: null,
                height_cm: null,
                body_fat_pct: null,
            };

            let primaryMeta = null;

            if (weight?.records && weight.records.length > 0) {
                const latest = weight.records[weight.records.length - 1];
                body.weight_kg = latest.weight?.inKilograms || null;
                if (latest.metadata) primaryMeta = latest.metadata;
            }

            if (height?.records && height.records.length > 0) {
                const latest = height.records[height.records.length - 1];
                body.height_cm = latest.height?.inMeters ? latest.height.inMeters * 100 : null;
            }

            if (fat?.records && fat.records.length > 0) {
                const latest = fat.records[fat.records.length - 1];
                body.body_fat_pct = latest.percentage || null;
            }

            if (primaryMeta) {
                body.metadata = {
                    device_name: primaryMeta.device || undefined,
                    device_manufacturer: primaryMeta.manufacturer || undefined,
                    device_model: primaryMeta.model || undefined,
                    record_id: primaryMeta.id,
                    last_modified: primaryMeta.lastModifiedTime,
                    timezone: primaryMeta.timezoneOffset,
                    recorded_at: endTime.toISOString(),
                };
            }

            const hasAnyData = body.weight_kg != null || body.height_cm != null || body.body_fat_pct != null;
            return hasAnyData ? body : null;
        } catch (e) {
            console.warn('AndroidHealthAdapter body fetch failed:', e);
            return null;
        }
    }
}

class IOSHealthAdapter {
    static async fetchAll(since) {
        const AppleHealthKit = getAppleHealthKit();
        if (!AppleHealthKit) return { vitals: [], activity: null, body: null };

        const endTime = new Date();
        const options = {
            startDate: since.toISOString(),
            endDate: endTime.toISOString(),
            limit: 100,
            ascending: true,
        };

        const vitals = await this._fetchVitals(AppleHealthKit, options);
        const activity = await this._fetchActivity(AppleHealthKit, options, endTime);
        const body = await this._fetchBody(AppleHealthKit, options, endTime);

        return { vitals, activity, body };
    }

    static async _fetchVitals(AppleHealthKit, options) {
        const readings = [];

        try {
            const safeRead = (method) => {
                return new Promise((resolve) => {
                    AppleHealthKit[method](options, (err, results) => {
                        resolve(err ? [] : results);
                    });
                });
            };

            const [hr, o2, bp, temp, water, glucose, respiratory] = await Promise.all([
                safeRead('getHeartRateSamples'),
                safeRead('getOxygenSaturationSamples'),
                safeRead('getBloodPressureSamples'),
                safeRead('getBodyTemperatureSamples'),
                safeRead('getWater'),
                safeRead('getBloodGlucoseSamples'),
                safeRead('getRespiratoryRateSamples'),
            ]);

            const mergeReading = (timestamp, key, value, sourceMeta) => {
                const existing = readings.find(r => {
                    const diff = Math.abs(new Date(r.timestamp) - new Date(timestamp));
                    return diff < 5 * 60 * 1000;
                });

                const metadata = sourceMeta ? {
                    device_name: sourceMeta.name || undefined,
                    device_manufacturer: sourceMeta.manufacturer || undefined,
                    device_model: sourceMeta.model || undefined,
                    record_id: sourceMeta.id || undefined,
                    last_modified: undefined,
                    timezone: undefined,
                    recorded_at: timestamp,
                } : undefined;

                if (existing) {
                    existing[key] = value;
                    if (metadata && !existing.metadata) {
                        existing.metadata = metadata;
                    }
                } else {
                    const newReading = {
                        timestamp,
                        heart_rate: null,
                        oxygen_saturation: null,
                        blood_pressure: null,
                        hydration: null,
                        temperature: null,
                        blood_glucose: null,
                        respiratory_rate: null,
                    };
                    newReading[key] = value;
                    if (metadata) {
                        newReading.metadata = metadata;
                    }
                    readings.push(newReading);
                }
            };

            hr.forEach(s => mergeReading(s.startDate || s.endDate, 'heart_rate', Math.round(s.value), s.source));
            o2.forEach(s => mergeReading(s.startDate || s.endDate, 'oxygen_saturation', Math.round(s.value * 100), s.source));
            bp.forEach(s => mergeReading(s.startDate || s.endDate, 'blood_pressure', {
                systolic: s.bloodPressureSystolicValue,
                diastolic: s.bloodPressureDiastolicValue,
            }, s.source));
            temp.forEach(s => mergeReading(s.startDate || s.endDate, 'temperature', s.value, s.source));
            water.forEach(s => mergeReading(s.startDate || s.endDate, 'hydration', Math.min(100, Math.round((s.value / 2000) * 100)), s.source));
            glucose.forEach(s => mergeReading(s.startDate || s.endDate, 'blood_glucose', s.value, s.source));
            respiratory.forEach(s => mergeReading(s.startDate || s.endDate, 'respiratory_rate', s.value, s.source));

        } catch (e) {
            console.warn('iOS HealthKit vitals fetch failed:', e);
        }

        return readings.filter(r =>
            r.heart_rate != null ||
            r.oxygen_saturation != null ||
            r.blood_pressure != null ||
            r.hydration != null ||
            r.temperature != null ||
            r.blood_glucose != null ||
            r.respiratory_rate != null
        );
    }

    static async _fetchActivity(AppleHealthKit, options, endTime) {
        try {
            const startOfToday = new Date(endTime);
            startOfToday.setHours(0, 0, 0, 0);
            const dailyOptions = {
                startDate: startOfToday.toISOString(),
                endDate: endTime.toISOString(),
                limit: 1000,
            };

            const stepsPromise = new Promise(r => AppleHealthKit.getDailyStepCountSamples(dailyOptions, (err, res) => r(err ? [] : res)));
            const distPromise = new Promise(r => AppleHealthKit.getDistanceWalkingRunning(dailyOptions, (err, res) => r(err ? [] : res)));
            const activeEnergyPromise = new Promise(r => AppleHealthKit.getActiveEnergyBurned(dailyOptions, (err, res) => r(err ? [] : res)));
            const basalEnergyPromise = new Promise(r => AppleHealthKit.getBasalEnergyBurned(dailyOptions, (err, res) => r(err ? [] : res)));
            const flightsPromise = new Promise(r => AppleHealthKit.getFlightsClimbed(dailyOptions, (err, res) => r(err ? [] : res)));
            const vo2Promise = new Promise(r => AppleHealthKit.getVo2MaxSamples(options, (err, res) => r(err ? [] : res)));
            const workoutsPromise = new Promise(r => AppleHealthKit.getSamples({ type: 'Workout', ...options }, (err, res) => r(err ? [] : res)));

            const [steps, dist, actEnergy, basalEnergy, flights, vo2, workouts] = await Promise.all([
                stepsPromise,
                distPromise,
                activeEnergyPromise,
                basalEnergyPromise,
                flightsPromise,
                vo2Promise,
                workoutsPromise,
            ]);

            const activity = {
                date: endTime.toISOString(),
                steps: steps.reduce((acc, curr) => acc + (curr.value || 0), 0),
                distance_meters: dist.reduce((acc, curr) => acc + (curr.value || 0), 0),
                active_calories: Math.round(actEnergy.reduce((acc, curr) => acc + (curr.value || 0), 0)),
                total_calories: Math.round(
                    actEnergy.reduce((acc, curr) => acc + (curr.value || 0), 0) +
                    basalEnergy.reduce((acc, curr) => acc + (curr.value || 0), 0)
                ),
                floors_climbed: flights.reduce((acc, curr) => acc + (curr.value || 0), 0),
                vo2_max: vo2.length > 0 ? Math.round(vo2[vo2.length - 1].value) : 0,
                exercises: workouts.map(w => ({
                    type: w.activityName || 'workout',
                    start_time: w.startDate,
                    end_time: w.endDate,
                    duration_minutes: Math.round((new Date(w.endDate) - new Date(w.startDate)) / 60000),
                    calories: w.calories || 0,
                    distance_meters: w.distance || 0,
                    avg_heart_rate: 0,
                    source_id: w.id,
                })),
            };

            const firstSample = steps[0] || dist[0] || actEnergy[0];
            if (firstSample?.source) {
                activity.metadata = {
                    device_name: firstSample.source.name || undefined,
                    device_manufacturer: firstSample.source.manufacturer || undefined,
                    device_model: firstSample.source.model || undefined,
                    record_id: undefined,
                    last_modified: undefined,
                    timezone: undefined,
                    recorded_at: endTime.toISOString(),
                };
            }

            const hasAnyData = activity.steps > 0 || activity.active_calories > 0 || activity.exercises.length > 0;
            return hasAnyData ? activity : null;
        } catch (e) {
            console.warn('iOS HealthKit activity fetch failed:', e);
            return null;
        }
    }

    static async _fetchBody(AppleHealthKit, options, endTime) {
        try {
            const weightPromise = new Promise(r => AppleHealthKit.getWeightSamples(options, (err, res) => r(err ? [] : res)));
            const heightPromise = new Promise(r => AppleHealthKit.getHeightSamples(options, (err, res) => r(err ? [] : res)));
            const fatPromise = new Promise(r => AppleHealthKit.getBodyFatPercentageSamples(options, (err, res) => r(err ? [] : res)));

            const [weight, height, fat] = await Promise.all([
                weightPromise,
                heightPromise,
                fatPromise,
            ]);

            const body = {
                date: endTime.toISOString(),
                weight_kg: null,
                height_cm: null,
                body_fat_pct: null,
            };

            let primaryMeta = null;

            if (weight.length > 0) {
                const latest = weight[weight.length - 1];
                body.weight_kg = latest.value;
                if (latest.source) primaryMeta = latest.source;
            }

            if (height.length > 0) {
                body.height_cm = height[height.length - 1].value * 100; // if height is in meters, otherwise adapt
            }

            if (fat.length > 0) {
                body.body_fat_pct = fat[fat.length - 1].value * 100; // convert 0-1 to percent
            }

            if (primaryMeta) {
                body.metadata = {
                    device_name: primaryMeta.name || undefined,
                    device_manufacturer: primaryMeta.manufacturer || undefined,
                    device_model: primaryMeta.model || undefined,
                    record_id: undefined,
                    last_modified: undefined,
                    timezone: undefined,
                    recorded_at: endTime.toISOString(),
                };
            }

            const hasAnyData = body.weight_kg != null || body.height_cm != null || body.body_fat_pct != null;
            return hasAnyData ? body : null;
        } catch (e) {
            console.warn('iOS HealthKit body fetch failed:', e);
            return null;
        }
    }
}

export default HealthRepository;
