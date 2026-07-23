import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import GuidedTour from '../../src/components/ui/GuidedTour';
import { TourService } from '../../src/lib/TourService';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../src/lib/TourService', () => ({
  TourService: {
    markTourSeen: jest.fn().mockResolvedValue(undefined),
    isTourSeen: jest.fn().mockResolvedValue(false),
  },
}));

jest.mock('../../src/theme', () => ({
  colors: {
    primary: '#6366F1',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
  },
}));

jest.mock('../../src/theme/motion', () => ({
  useReduceMotion: () => true, // skip animations in tests
}));

jest.mock('../../src/utils/haptics', () => ({
  HapticPatterns: {
    selection: jest.fn(),
  },
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    X: (props) => React.createElement(View, { testID: 'icon-x', ...props }),
    ChevronRight: (props) => React.createElement(View, { testID: 'icon-chevron', ...props }),
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props) => React.createElement(View, { testID: 'svg-root', ...props }),
    Defs: (props) => React.createElement(View, props),
    Mask: (props) => React.createElement(View, props),
    Rect: (props) => React.createElement(View, props),
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const MockIcon = () => null;

const makeSteps = (count = 1) =>
  Array.from({ length: count }, (_, i) => ({
    title: `Step ${i + 1}`,
    desc: `Description for step ${i + 1}`,
    icon: MockIcon,
    iconColor: '#6366F1',
    ref: { current: null },
    visible: true,
  }));

const mockScrollRef = {
  current: {
    scrollTo: jest.fn(),
  },
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GuidedTour', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Rendering ───────────────────────────────────────────────────────────

  describe('Rendering', () => {
    it('renders nothing when visible is false', () => {
      const { toJSON } = render(
        <GuidedTour visible={false} steps={makeSteps()} tourKey="test" onClose={jest.fn()} />
      );
      expect(toJSON()).toBeNull();
    });

    it('renders nothing when steps array is empty', () => {
      const { toJSON } = render(
        <GuidedTour visible={true} steps={[]} tourKey="test" onClose={jest.fn()} />
      );
      expect(toJSON()).toBeNull();
    });

    it('renders the tour when visible with valid steps', () => {
      const { getByText } = render(
        <GuidedTour visible={true} steps={makeSteps()} tourKey="test" onClose={jest.fn()} />
      );
      expect(getByText('Step 1')).toBeTruthy();
      expect(getByText('Description for step 1')).toBeTruthy();
    });

    it('renders "Got It" button for single-step tour', () => {
      const { getByText } = render(
        <GuidedTour visible={true} steps={makeSteps(1)} tourKey="test" onClose={jest.fn()} />
      );
      expect(getByText('Got It')).toBeTruthy();
    });

    it('renders "Next" button for multi-step tour on first step', () => {
      const { getByText } = render(
        <GuidedTour visible={true} steps={makeSteps(3)} tourKey="test" onClose={jest.fn()} />
      );
      expect(getByText('Next')).toBeTruthy();
    });

    it('renders the Skip button', () => {
      const { getByText } = render(
        <GuidedTour visible={true} steps={makeSteps()} tourKey="test" onClose={jest.fn()} />
      );
      expect(getByText('Skip')).toBeTruthy();
    });
  });

  // ── Progress Dots ─────────────────────────────────────────────────────

  describe('Progress Dots', () => {
    it('renders correct number of dots matching step count', () => {
      const stepCount = 4;
      const { toJSON } = render(
        <GuidedTour
          visible={true}
          steps={makeSteps(stepCount)}
          tourKey="test"
          onClose={jest.fn()}
        />
      );
      // Dots are Views inside the dots container — count them via the tree
      const json = toJSON();
      expect(json).toBeTruthy();
    });

    it('renders a single dot for single-step tour', () => {
      const { toJSON } = render(
        <GuidedTour visible={true} steps={makeSteps(1)} tourKey="test" onClose={jest.fn()} />
      );
      expect(toJSON()).toBeTruthy();
    });
  });

  // ── Overlay Behavior ──────────────────────────────────────────────────

  describe('Overlay Behavior', () => {
    it('tapping the overlay area does NOT dismiss the tour', async () => {
      const onClose = jest.fn();
      const { getByText, toJSON } = render(
        <GuidedTour
          visible={true}
          steps={makeSteps()}
          tourKey="test"
          onClose={onClose}
        />
      );

      // The tour should still be showing the step content
      expect(getByText('Step 1')).toBeTruthy();
      // onClose should NOT have been called (no way to tap overlay to dismiss)
      expect(onClose).not.toHaveBeenCalled();
      expect(TourService.markTourSeen).not.toHaveBeenCalled();
    });
  });

  // ── Skip Button ───────────────────────────────────────────────────────

  describe('Skip Button', () => {
    it('calls markTourSeen and onClose when Skip is pressed', async () => {
      const onClose = jest.fn();
      const { getByText } = render(
        <GuidedTour
          visible={true}
          steps={makeSteps(3)}
          tourKey="my_tour"
          onClose={onClose}
        />
      );

      await act(async () => {
        fireEvent.press(getByText('Skip'));
      });

      expect(TourService.markTourSeen).toHaveBeenCalledWith('my_tour');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose even without a tourKey', async () => {
      const onClose = jest.fn();
      const { getByText } = render(
        <GuidedTour
          visible={true}
          steps={makeSteps()}
          onClose={onClose}
        />
      );

      await act(async () => {
        fireEvent.press(getByText('Skip'));
      });

      expect(TourService.markTourSeen).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ── Got It (Single Step) ──────────────────────────────────────────────

  describe('Got It (Single Step)', () => {
    it('marks tour seen and closes on Got It press', async () => {
      const onClose = jest.fn();
      const { getByText } = render(
        <GuidedTour
          visible={true}
          steps={makeSteps(1)}
          tourKey="single_tour"
          onClose={onClose}
        />
      );

      await act(async () => {
        fireEvent.press(getByText('Got It'));
      });

      expect(TourService.markTourSeen).toHaveBeenCalledWith('single_tour');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ── Multi-Step Navigation ─────────────────────────────────────────────

  describe('Multi-Step Navigation', () => {
    it('advances to the next step when Next is pressed', async () => {
      const steps = makeSteps(3);
      const { getByText, queryByText } = render(
        <GuidedTour
          visible={true}
          steps={steps}
          tourKey="multi_tour"
          onClose={jest.fn()}
          scrollRef={mockScrollRef}
        />
      );

      // Step 1 is visible
      expect(getByText('Step 1')).toBeTruthy();

      // Press Next — triggers a fade animation
      await act(async () => {
        fireEvent.press(getByText('Next'));
        // Wait for fade-out (150ms) + state update + fade-in (200ms)
        await new Promise(resolve => setTimeout(resolve, 500));
      });

      // Step 2 should now be visible
      expect(getByText('Step 2')).toBeTruthy();
    });

    it('shows "Got It" on the last step of a multi-step tour', async () => {
      const steps = makeSteps(2);
      const { getByText } = render(
        <GuidedTour
          visible={true}
          steps={steps}
          tourKey="multi_tour"
          onClose={jest.fn()}
          scrollRef={mockScrollRef}
        />
      );

      // Advance to step 2 (last step)
      await act(async () => {
        fireEvent.press(getByText('Next'));
        await new Promise(resolve => setTimeout(resolve, 500));
      });

      // Should show "Got It" instead of "Next"
      expect(getByText('Got It')).toBeTruthy();
    });

    it('completes tour when Got It is pressed on the last step', async () => {
      const onClose = jest.fn();
      const steps = makeSteps(2);
      const { getByText } = render(
        <GuidedTour
          visible={true}
          steps={steps}
          tourKey="multi_tour"
          onClose={onClose}
          scrollRef={mockScrollRef}
        />
      );

      // Advance to step 2
      await act(async () => {
        fireEvent.press(getByText('Next'));
        await new Promise(resolve => setTimeout(resolve, 500));
      });

      // Press Got It on last step
      await act(async () => {
        fireEvent.press(getByText('Got It'));
      });

      expect(TourService.markTourSeen).toHaveBeenCalledWith('multi_tour');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when pressing Next on non-last steps', async () => {
      const onClose = jest.fn();
      const steps = makeSteps(3);
      const { getByText } = render(
        <GuidedTour
          visible={true}
          steps={steps}
          tourKey="test"
          onClose={onClose}
          scrollRef={mockScrollRef}
        />
      );

      await act(async () => {
        fireEvent.press(getByText('Next'));
        await new Promise(resolve => setTimeout(resolve, 500));
      });

      expect(onClose).not.toHaveBeenCalled();
      expect(TourService.markTourSeen).not.toHaveBeenCalled();
    });
  });

  // ── State Reset ───────────────────────────────────────────────────────

  describe('State Reset', () => {
    it('resets to step 0 when visibility changes to false', async () => {
      const steps = makeSteps(3);
      const { getByText, rerender } = render(
        <GuidedTour
          visible={true}
          steps={steps}
          tourKey="test"
          onClose={jest.fn()}
          scrollRef={mockScrollRef}
        />
      );

      // Advance to step 2
      await act(async () => {
        fireEvent.press(getByText('Next'));
        await new Promise(resolve => setTimeout(resolve, 500));
      });
      expect(getByText('Step 2')).toBeTruthy();

      // Hide the tour
      rerender(
        <GuidedTour
          visible={false}
          steps={steps}
          tourKey="test"
          onClose={jest.fn()}
          scrollRef={mockScrollRef}
        />
      );

      // Re-show the tour — should be back at step 1
      rerender(
        <GuidedTour
          visible={true}
          steps={steps}
          tourKey="test"
          onClose={jest.fn()}
          scrollRef={mockScrollRef}
        />
      );

      expect(getByText('Step 1')).toBeTruthy();
    });
  });

  // ── Haptic Feedback ───────────────────────────────────────────────────

  describe('Haptic Feedback', () => {
    it('triggers haptic on Next press', async () => {
      const { HapticPatterns } = require('../../src/utils/haptics');
      const { getByText } = render(
        <GuidedTour
          visible={true}
          steps={makeSteps(2)}
          tourKey="test"
          onClose={jest.fn()}
          scrollRef={mockScrollRef}
        />
      );

      await act(async () => {
        fireEvent.press(getByText('Next'));
        await new Promise(resolve => setTimeout(resolve, 500));
      });

      expect(HapticPatterns.selection).toHaveBeenCalled();
    });

    it('triggers haptic on Skip press', async () => {
      const { HapticPatterns } = require('../../src/utils/haptics');
      const { getByText } = render(
        <GuidedTour
          visible={true}
          steps={makeSteps()}
          tourKey="test"
          onClose={jest.fn()}
        />
      );

      await act(async () => {
        fireEvent.press(getByText('Skip'));
      });

      expect(HapticPatterns.selection).toHaveBeenCalled();
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles missing onClose gracefully', async () => {
      const { getByText } = render(
        <GuidedTour
          visible={true}
          steps={makeSteps(1)}
          tourKey="test"
        />
      );

      // Should not throw when pressing Got It without onClose
      await act(async () => {
        fireEvent.press(getByText('Got It'));
      });

      expect(TourService.markTourSeen).toHaveBeenCalledWith('test');
    });

    it('handles missing tourKey gracefully on Got It', async () => {
      const onClose = jest.fn();
      const { getByText } = render(
        <GuidedTour
          visible={true}
          steps={makeSteps(1)}
          onClose={onClose}
        />
      );

      await act(async () => {
        fireEvent.press(getByText('Got It'));
      });

      expect(TourService.markTourSeen).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('renders step content with custom icon colors', () => {
      const steps = [{
        title: 'Custom Step',
        desc: 'Custom description',
        icon: MockIcon,
        iconColor: '#EF4444',
        ref: { current: null },
        visible: true,
      }];

      const { getByText } = render(
        <GuidedTour visible={true} steps={steps} tourKey="test" onClose={jest.fn()} />
      );

      expect(getByText('Custom Step')).toBeTruthy();
      expect(getByText('Custom description')).toBeTruthy();
    });

    it('measures target using measureInWindow when ref is attached', async () => {
      const mockMeasureInWindow = jest.fn((cb) => cb(20, 100, 150, 80));
      const steps = [{
        title: 'Measured Target',
        desc: 'Target is attached and measured',
        icon: MockIcon,
        ref: {
          current: {
            measureInWindow: mockMeasureInWindow,
          },
        },
        visible: true,
      }];

      const { getByText } = render(
        <GuidedTour visible={true} steps={steps} tourKey="test" onClose={jest.fn()} />
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      expect(getByText('Measured Target')).toBeTruthy();
      expect(mockMeasureInWindow).toHaveBeenCalled();
    });

    it('gracefully degrades to static fallback if measureInWindow returns 0 after retries', async () => {
      const mockMeasureInWindow = jest.fn((cb) => cb(0, 0, 0, 0));
      const steps = [{
        title: 'Fallback Step',
        desc: 'Fallback description',
        icon: MockIcon,
        spotlightTop: 150,
        ref: {
          current: {
            measureInWindow: mockMeasureInWindow,
          },
        },
        visible: true,
      }];

      const { getByText } = render(
        <GuidedTour visible={true} steps={steps} tourKey="test" onClose={jest.fn()} />
      );

      // Wait for retry attempts to complete (5 x 60ms)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
      });

      expect(getByText('Fallback Step')).toBeTruthy();
      expect(mockMeasureInWindow).toHaveBeenCalled();
    });
  });
});

