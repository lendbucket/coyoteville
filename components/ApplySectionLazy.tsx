'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type ApplySection from './ApplySection';

const Lazy = dynamic(() => import('./ApplySection'), { ssr: true });

export default function ApplySectionLazy(props: ComponentProps<typeof ApplySection>) {
  return <Lazy {...props} />;
}
