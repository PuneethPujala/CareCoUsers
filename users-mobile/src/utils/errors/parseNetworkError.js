import { getRegistryEntry } from './errorRegistry';

export function parseNetworkError(error) {
    const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
    const code = isTimeout ? 'TIMEOUT' : 'OFFLINE';
    const registryEntry = getRegistryEntry(code);

    return {
        general: registryEntry.defaultMessage,
        fields: {},
        code,
        translationKey: registryEntry.translationKey,
        source: 'network',
        kind: 'network',
        severity: registryEntry.severity,
        retryable: registryEntry.retryable,
        status: isTimeout ? 408 : null,
        raw: error,
    };
}
