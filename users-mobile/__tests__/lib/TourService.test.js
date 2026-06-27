import AsyncStorage from '@react-native-async-storage/async-storage';
import { TourService } from '../../src/lib/TourService';

beforeEach(() => {
    jest.clearAllMocks();
});

describe('TourService', () => {
    describe('isTourSeen & markTourSeen', () => {
        it('returns false when registry does not exist', async () => {
            AsyncStorage.getItem.mockResolvedValue(null);
            const seen = await TourService.isTourSeen('companion');
            expect(seen).toBe(false);
        });

        it('returns true when registry has the tour marked as seen', async () => {
            AsyncStorage.getItem.mockResolvedValue(JSON.stringify({ companion: true }));
            const seen = await TourService.isTourSeen('companion');
            expect(seen).toBe(true);
        });

        it('marks tour as seen and saves to AsyncStorage', async () => {
            AsyncStorage.getItem.mockResolvedValue(JSON.stringify({}));
            await TourService.markTourSeen('companion');

            expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
            const savedRegistry = JSON.parse(AsyncStorage.setItem.mock.calls[0][1]);
            expect(savedRegistry.companion).toBe(true);
        });
    });

    describe('resetAllTours', () => {
        it('removes the tour registry from AsyncStorage', async () => {
            await TourService.resetAllTours();
            expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@user_guided_tours');
        });
    });

    describe('evaluateMigration', () => {
        it('runs heuristic and marks seen if heuristic is true', async () => {
            AsyncStorage.getItem.mockResolvedValue(JSON.stringify({}));
            const heuristic = jest.fn().mockResolvedValue(true);

            await TourService.evaluateMigration('companion', heuristic);

            expect(heuristic).toHaveBeenCalledTimes(1);
            expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
            const savedRegistry = JSON.parse(AsyncStorage.setItem.mock.calls[0][1]);
            expect(savedRegistry.companion).toBe(true);
            expect(savedRegistry._migrated_companion).toBe(true);
        });

        it('runs heuristic and does not mark seen if heuristic is false', async () => {
            AsyncStorage.getItem.mockResolvedValue(JSON.stringify({}));
            const heuristic = jest.fn().mockResolvedValue(false);

            await TourService.evaluateMigration('companion', heuristic);

            expect(heuristic).toHaveBeenCalledTimes(1);
            expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
            const savedRegistry = JSON.parse(AsyncStorage.setItem.mock.calls[0][1]);
            expect(savedRegistry.companion).toBeUndefined();
            expect(savedRegistry._migrated_companion).toBe(true);
        });

        it('does not run heuristic or write to storage if already migrated (idempotency)', async () => {
            AsyncStorage.getItem.mockResolvedValue(JSON.stringify({
                _migrated_companion: true,
                companion: false
            }));
            const heuristic = jest.fn().mockResolvedValue(true);

            await TourService.evaluateMigration('companion', heuristic);

            expect(heuristic).not.toHaveBeenCalled();
            expect(AsyncStorage.setItem).not.toHaveBeenCalled();
        });

        it('fails safe and allows retry if heuristicFn throws an error', async () => {
            AsyncStorage.getItem.mockResolvedValue(JSON.stringify({}));
            const heuristic = jest.fn().mockRejectedValue(new Error('API failure'));

            await TourService.evaluateMigration('companion', heuristic);

            expect(heuristic).toHaveBeenCalledTimes(1);
            // Verify that we did NOT write migrated: true to storage
            expect(AsyncStorage.setItem).not.toHaveBeenCalled();
        });
    });
});
