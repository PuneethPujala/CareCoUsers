import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { View, Text } from 'react-native';
import PremiumFormModal from '../PremiumFormModal';

// Mock vector icons properly without JSX to avoid babel hoisting issues
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    X: function XIcon() {
      return React.createElement(Text, { testID: 'close-icon' }, 'X');
    }
  };
});

describe('PremiumFormModal', () => {
  it('renders modal content correctly when visible', () => {
    const { getByText } = render(
      <PremiumFormModal visible={true} title="Patient Settings" onClose={() => {}}>
        <Text>Inner Contact Form</Text>
      </PremiumFormModal>
    );

    expect(getByText('Patient Settings')).toBeTruthy();
    expect(getByText('Inner Contact Form')).toBeTruthy();
  });

  it('triggers the onClose handler when the close button is pressed', async () => {
    const mockOnClose = jest.fn();
    const { getByTestId } = render(
      <PremiumFormModal visible={true} title="Patient Settings" onClose={mockOnClose}>
        <Text>Inner Contact Form</Text>
      </PremiumFormModal>
    );

    const closeBtn = getByTestId('close-icon');
    fireEvent.press(closeBtn);

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    }, { timeout: 1000 });
  });

  it('renders and triggers the Save button when onSave is provided', () => {
    const mockOnSave = jest.fn();
    const { getByText } = render(
      <PremiumFormModal
        visible={true}
        title="Settings"
        onClose={() => {}}
        onSave={mockOnSave}
        saveText="Confirm Update"
      >
        <Text>Content</Text>
      </PremiumFormModal>
    );

    const saveBtn = getByText('Confirm Update');
    expect(saveBtn).toBeTruthy();

    fireEvent.press(saveBtn);
    expect(mockOnSave).toHaveBeenCalled();
  });

  it('disables the save button while saving is true', () => {
    const mockOnSave = jest.fn();
    const { queryByText } = render(
      <PremiumFormModal
        visible={true}
        title="Settings"
        onClose={() => {}}
        onSave={mockOnSave}
        saveText="Confirm Update"
        saving={true}
      />
    );

    expect(queryByText('Confirm Update')).toBeNull();
  });
});
