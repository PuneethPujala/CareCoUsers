import usePatientStore from '../../src/store/usePatientStore';
import { apiService } from '../../src/lib/api';

jest.mock('../../src/lib/api', () => ({
    apiService: {
        medicines: {
            getAdherenceRecap: jest.fn(),
        },
    },
}));

describe('usePatientStore Adherence Caching', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset Zustand store state
        usePatientStore.setState({
            adherenceRecap: null,
            adherenceRecaps: { weekly: null, monthly: null, yearly: null },
        });
    });

    it('should fetch from API and cache data on first call', async () => {
        const mockData = { adherence_rate: 85, perfect_days: 5, total_doses_taken: 15 };
        apiService.medicines.getAdherenceRecap.mockResolvedValueOnce({ data: mockData });

        const result = await usePatientStore.getState().fetchAdherenceRecap('weekly');

        expect(apiService.medicines.getAdherenceRecap).toHaveBeenCalledTimes(1);
        expect(apiService.medicines.getAdherenceRecap).toHaveBeenCalledWith('weekly');
        expect(result).toEqual(mockData);
        expect(usePatientStore.getState().adherenceRecap).toEqual(mockData);
        expect(usePatientStore.getState().adherenceRecaps.weekly).toEqual(mockData);
    });

    it('should return cached data immediately without calling API on subsequent calls', async () => {
        const mockData = { adherence_rate: 85, perfect_days: 5, total_doses_taken: 15 };
        usePatientStore.setState({
            adherenceRecaps: {
                weekly: mockData,
                monthly: null,
                yearly: null,
            },
        });

        const result = await usePatientStore.getState().fetchAdherenceRecap('weekly');

        expect(apiService.medicines.getAdherenceRecap).not.toHaveBeenCalled();
        expect(result).toEqual(mockData);
        expect(usePatientStore.getState().adherenceRecap).toEqual(mockData);
    });

    it('should bypass cache and call API when forceRefresh is true', async () => {
        const initialMockData = { adherence_rate: 85, perfect_days: 5, total_doses_taken: 15 };
        const freshMockData = { adherence_rate: 90, perfect_days: 6, total_doses_taken: 18 };
        
        usePatientStore.setState({
            adherenceRecaps: {
                weekly: initialMockData,
                monthly: null,
                yearly: null,
            },
        });
        apiService.medicines.getAdherenceRecap.mockResolvedValueOnce({ data: freshMockData });

        const result = await usePatientStore.getState().fetchAdherenceRecap('weekly', true);

        expect(apiService.medicines.getAdherenceRecap).toHaveBeenCalledTimes(1);
        expect(result).toEqual(freshMockData);
        expect(usePatientStore.getState().adherenceRecap).toEqual(freshMockData);
        expect(usePatientStore.getState().adherenceRecaps.weekly).toEqual(freshMockData);
    });
});
