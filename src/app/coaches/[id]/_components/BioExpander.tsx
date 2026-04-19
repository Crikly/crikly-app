'use client'

import { useState } from 'react'

interface BioExpanderProps {
  bio: string
}

export function BioExpander({ bio }: BioExpanderProps) {
  const [expanded, setExpanded] = useState(false)
  const needsClamp = bio.length > 420

  return (
    <div>
      <p
        className={[
          'text-base leading-relaxed text-gray-700 whitespace-pre-line',
          needsClamp && !expanded ? 'line-clamp-5' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {bio}
      </p>
      {needsClamp && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-2.5 text-sm font-semibold text-neutral-900 underline underline-offset-2"
          data-testid="bio-expand-btn"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  )
}
