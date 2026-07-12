import React from 'react';
import { LayoutGroup, MotionConfig } from 'framer-motion';
import { SHARED_ELEMENT_TRANSITION } from './sharedElementRegistry';

export const SharedElementLayer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MotionConfig reducedMotion="user" transition={{ layout: SHARED_ELEMENT_TRANSITION }}>
    <LayoutGroup id="jzone-shared-elements">
      {children}
    </LayoutGroup>
  </MotionConfig>
);
