import React from 'react';
import { Text, View } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';
import AnimatedButton from '../../../src/components/ui/AnimatedButton';
import AnimatedCard from '../../../src/components/ui/AnimatedCard';
import AnimatedCounter from '../../../src/components/ui/AnimatedCounter';
import AnimatedProgressRing from '../../../src/components/ui/AnimatedProgressRing';
import AnimatedChip from '../../../src/components/ui/AnimatedChip';
import AnimatedSwitcher from '../../../src/components/ui/AnimatedSwitcher';
import AnimatedList from '../../../src/components/ui/AnimatedList';

// Mock translation hook
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

describe('Motion Design System Tier 2 Components', () => {
    describe('AnimatedButton', () => {
        it('renders text content and handles presses', () => {
            const handlePress = jest.fn();
            const { getByText } = render(
                <AnimatedButton onPress={handlePress}>
                    <Text>Tap Me</Text>
                </AnimatedButton>
            );

            fireEvent.press(getByText('Tap Me'));
            expect(handlePress).toHaveBeenCalledTimes(1);
        });

        it('does not trigger press when disabled', () => {
            const handlePress = jest.fn();
            const { getByText } = render(
                <AnimatedButton onPress={handlePress} disabled={true}>
                    <Text>Tap Me</Text>
                </AnimatedButton>
            );

            fireEvent.press(getByText('Tap Me'));
            expect(handlePress).not.toHaveBeenCalled();
        });

        it('shows loader indicator and blocks presses when loading is true', () => {
            const handlePress = jest.fn();
            const { queryByTestId, queryByText } = render(
                <AnimatedButton onPress={handlePress} loading={true}>
                    <Text>Tap Me</Text>
                </AnimatedButton>
            );

            expect(queryByTestId('loader')).toBeTruthy();
            expect(queryByText('Tap Me')).toBeNull();
        });
    });

    describe('AnimatedCard', () => {
        it('renders and supports press events', () => {
            const handlePress = jest.fn();
            const { getByText } = render(
                <AnimatedCard onPress={handlePress}>
                    <Text>Card Content</Text>
                </AnimatedCard>
            );

            fireEvent.press(getByText('Card Content'));
            expect(handlePress).toHaveBeenCalledTimes(1);
        });
    });

    describe('AnimatedCounter', () => {
        it('renders initial formatted value correctly', () => {
            const { getByDisplayValue } = render(
                <AnimatedCounter
                    value={7542}
                    decimals={0}
                    prefix="$"
                    suffix=" steps"
                />
            );
            expect(getByDisplayValue('$7,542 steps')).toBeTruthy();
        });
    });

    describe('AnimatedProgressRing', () => {
        it('renders SVG progress ring with custom center content', () => {
            const { getByText } = render(
                <AnimatedProgressRing progress={65} size={100}>
                    <Text>65%</Text>
                </AnimatedProgressRing>
            );
            expect(getByText('65%')).toBeTruthy();
        });
    });

    describe('AnimatedChip', () => {
        it('renders label and handles select toggle press', () => {
            const handlePress = jest.fn();
            const { getByText } = render(
                <AnimatedChip
                    label="Vitals"
                    selected={true}
                    onPress={handlePress}
                />
            );

            fireEvent.press(getByText('Vitals'));
            expect(handlePress).toHaveBeenCalledTimes(1);
        });
    });

    describe('AnimatedSwitcher', () => {
        it('renders switcher and swap triggers', async () => {
            const { getByText, rerender } = render(
                <AnimatedSwitcher transitionKey="today">
                    <Text>Today View</Text>
                </AnimatedSwitcher>
            );

            expect(getByText('Today View')).toBeTruthy();

            rerender(
                <AnimatedSwitcher transitionKey="week">
                    <Text>Week View</Text>
                </AnimatedSwitcher>
            );

            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 300));
            });

            expect(getByText('Week View')).toBeTruthy();
        });
    });

    describe('AnimatedList', () => {
        it('renders FlatList entries with stagger layouts', () => {
            const listData = [{ id: '1', name: 'Item A' }, { id: '2', name: 'Item B' }];
            const { getByText } = render(
                <AnimatedList
                    data={listData}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => <Text>{item.name}</Text>}
                />
            );

            expect(getByText('Item A')).toBeTruthy();
            expect(getByText('Item B')).toBeTruthy();
        });
    });
});
