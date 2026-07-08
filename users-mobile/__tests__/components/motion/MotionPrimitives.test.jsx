import React from 'react';
import { Text, View } from 'react-native';
import { render, act } from '@testing-library/react-native';
import FadeThrough from '../../../src/components/ui/FadeThrough';
import StaggeredContainer from '../../../src/components/ui/StaggeredContainer';
import ScaleFade from '../../../src/components/ui/ScaleFade';
import SlideFade from '../../../src/components/ui/SlideFade';

describe('Motion Design System Primitives', () => {
    describe('FadeThrough', () => {
        it('renders initial children', () => {
            const { getByText } = render(
                <FadeThrough>
                    <Text>Initial Child</Text>
                </FadeThrough>
            );
            expect(getByText('Initial Child')).toBeTruthy();
        });

        it('handles children content swaps smoothly', async () => {
            const { getByText, rerender } = render(
                <FadeThrough>
                    <Text>Initial Child</Text>
                </FadeThrough>
            );

            expect(getByText('Initial Child')).toBeTruthy();

            // Swap child
            rerender(
                <FadeThrough>
                    <Text>New Child</Text>
                </FadeThrough>
            );

            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 300));
            });

            expect(getByText('New Child')).toBeTruthy();
        });
    });

    describe('StaggeredContainer', () => {
        it('renders children list correctly', () => {
            const { getByText } = render(
                <StaggeredContainer>
                    <Text>Child A</Text>
                    <Text>Child B</Text>
                    <Text>Child C</Text>
                </StaggeredContainer>
            );

            expect(getByText('Child A')).toBeTruthy();
            expect(getByText('Child B')).toBeTruthy();
            expect(getByText('Child C')).toBeTruthy();
        });
    });

    describe('ScaleFade', () => {
        it('renders children when visible is true', () => {
            const { getByText } = render(
                <ScaleFade visible={true}>
                    <Text>Scale Fade Item</Text>
                </ScaleFade>
            );
            expect(getByText('Scale Fade Item')).toBeTruthy();
        });
    });

    describe('SlideFade', () => {
        it('renders children with customizable transition configurations', () => {
            const { getByText } = render(
                <SlideFade visible={true} direction="down" slideDistance={20}>
                    <Text>Slide Fade Item</Text>
                </SlideFade>
            );
            expect(getByText('Slide Fade Item')).toBeTruthy();
        });
    });
});
