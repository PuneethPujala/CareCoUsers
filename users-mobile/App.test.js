import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

describe('Basic Setup Test', () => {
  it('renders a react-native Text component', () => {
    const { getByText } = render(<Text>Hello Jest!</Text>);
    expect(getByText('Hello Jest!')).toBeTruthy();
  });
});
