import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface NarrativeRevealProps {
  children: React.ReactNode;
  className?: string;
  ['data-testid']?: string;
}

export const NarrativeReveal: React.FC<NarrativeRevealProps> = ({ children, className, 'data-testid': testId }) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.section
      initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.24, ease: 'easeOut' }}
      className={className}
      data-testid={testId}
    >
      {children}
    </motion.section>
  );
};
