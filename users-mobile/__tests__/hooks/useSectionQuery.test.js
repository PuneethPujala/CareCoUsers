import { renderHook, act } from '@testing-library/react-native';
import { useSectionQuery } from '../../src/hooks/useSectionQuery';
import * as CacheService from '../../src/lib/CacheService';

jest.mock('../../src/lib/CacheService', () => ({
    getCache: jest.fn(),
    setCache: jest.fn(),
}));

describe('useSectionQuery', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('loads data from cache instantly and revalidates in background', async () => {
        const cachedData = { score: 85 };
        const freshData = { score: 90 };
        CacheService.getCache.mockResolvedValue({ data: cachedData, cachedAt: Date.now() - 1000 });
        const fetcher = jest.fn().mockResolvedValue(freshData);

        const { result } = renderHook(() =>
            useSectionQuery({ key: 'test_key', fetcher })
        );

        await act(async () => {
            await new Promise((res) => setTimeout(res, 50));
        });

        expect(CacheService.getCache).toHaveBeenCalledWith('test_key');
        expect(fetcher).toHaveBeenCalled();
        expect(result.current.data).toEqual(freshData);
        expect(CacheService.setCache).toHaveBeenCalledWith('test_key', freshData, null);
    });

    it('handles fetch error and sets isError to true when no cache exists', async () => {
        CacheService.getCache.mockResolvedValue(null);
        const fetcher = jest.fn().mockRejectedValue(new Error('Network error'));

        const { result } = renderHook(() =>
            useSectionQuery({ key: 'error_key', fetcher, maxRetries: 1 })
        );

        await act(async () => {
            await new Promise((res) => setTimeout(res, 50));
        });

        expect(result.current.isError).toBe(true);
        expect(result.current.error.message).toBe('Network error');
    });
});
