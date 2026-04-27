import React from 'react';

/**
 * Global Navigation Reference
 * 
 * Used to navigate from outside React components (e.g. inside Auth interceptors
 * or Notification listeners).
 */

export const navigationRef = React.createRef();

export function navigate(name, params) {
  if (navigationRef.current) {
    navigationRef.current.navigate(name, params);
  }
}

export function reset(state) {
  if (navigationRef.current) {
    navigationRef.current.reset(state);
  }
}
