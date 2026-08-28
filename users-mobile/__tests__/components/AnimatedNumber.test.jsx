import React from 'react';
import { render } from '@testing-library/react-native';
import AnimatedNumber from '../../src/components/ui/AnimatedNumber';

// Mock MotionProvider
jest.mock('../../src/theme/MotionProvider', () => ({
    useMotion: () => ({ reduceMotion: true }),
}));

describe('AnimatedNumber robustness tests', () => {
    it('handles standard positive number correctly', () => {
        const { getByText } = render(<AnimatedNumber value={85} suffix="%" />);
        expect(getByText('85%')).toBeTruthy();
    });

    it('safely handles null value without throwing toFixed error', () => {
        const { getByText } = render(<AnimatedNumber value={null} suffix="%" />);
        expect(getByText('0%')).toBeTruthy();
    });

    it('safely handles undefined value', () => {
        const { getByText } = render(<AnimatedNumber value={undefined} suffix="%" />);
        expect(getByText('0%')).toBeTruthy();
    });

    it('safely handles NaN value', () => {
        const { getByText } = render(<AnimatedNumber value={NaN} suffix="%" />);
        expect(getByText('0%')).toBeTruthy();
    });

    it('safely handles Infinity value', () => {
        const { getByText } = render(<AnimatedNumber value={Infinity} suffix="%" />);
        expect(getByText('0%')).toBeTruthy();
    });
});
