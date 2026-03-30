/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    'bg-brand-50', 'bg-brand-100', 'bg-brand-400',
    'bg-brand-600', 'bg-brand-800', 'bg-brand-900',
    'text-brand-600', 'text-brand-800',
    'border-brand-600', 'border-brand-100',
    'hover:bg-brand-50', 'hover:bg-brand-800',
    'bg-teal-50', 'bg-teal-600', 'bg-teal-800',
    'text-teal-800',
    'bg-success', 'bg-warning', 'bg-danger', 'bg-info',
    'text-success', 'text-warning', 'text-danger', 'text-info',
    'border-success', 'border-warning', 'border-danger', 'border-info',
    'border-l-success', 'border-l-warning',
    'border-l-danger', 'border-l-info',
    'bg-neutral-50', 'bg-neutral-100',
    'text-neutral-400', 'text-neutral-600', 'text-neutral-900',
    'border-neutral-100',
    'h-btn-mobile', 'h-btn-desktop',
    'h-input-mobile', 'h-input-desktop',
    'h-avatar-sm', 'h-avatar-md', 'h-avatar-lg',
    'w-avatar-sm', 'w-avatar-md', 'w-avatar-lg',
    'rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl',
    'shadow-sm', 'shadow-md', 'shadow-focus',
    'tracking-label', 'tracking-heading',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // ─── Brand colours (Sky Blue) ───────────────────────────
      colors: {
        brand: {
          50:  '#E6F3FB',
          100: '#B5D4F4',
          400: '#378ADD',
          600: '#0077CC',
          800: '#0C447C',
          900: '#042C53',
        },
        teal: {
          50:  '#E0F6F8',
          600: '#0099AA',
          800: '#006677',
        },
        neutral: {
          0:   '#FFFFFF',
          50:  '#F0F7FF',
          100: '#E2E8F0',
          400: '#94A3B8',
          600: '#475569',
          900: '#0F172A',
        },
        // Dark mode surface overrides (applied via CSS vars)
        surface: {
          light: '#F0F7FF',
          dark:  '#1A1A2E',
        },
        // Semantic
        success: '#1A7A4A',
        warning: '#B45309',
        danger:  '#B91C1C',
        info:    '#0077CC',
      },

      // ─── Typography ─────────────────────────────────────────
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
      },
      fontSize: {
        xs:   ['11px', { lineHeight: '1.4' }],
        sm:   ['13px', { lineHeight: '1.5' }],
        base: ['15px', { lineHeight: '1.6' }],
        lg:   ['17px', { lineHeight: '1.4' }],
        xl:   ['20px', { lineHeight: '1.3' }],
        '2xl':['24px', { lineHeight: '1.2' }],
        '3xl':['30px', { lineHeight: '1.1' }],
      },
      fontWeight: {
        regular:   '400',
        medium:    '500',
        semibold:  '600',
      },
      letterSpacing: {
        heading: '-0.3px',
        label:   '0.5px',
      },
      maxWidth: {
        prose: '65ch',
      },

      // ─── Spacing (base-4) ────────────────────────────────────
      spacing: {
        1:  '4px',
        2:  '8px',
        3:  '12px',
        4:  '16px',
        5:  '20px',
        6:  '24px',
        8:  '32px',
        12: '48px',
      },

      // ─── Border radius ───────────────────────────────────────
      borderRadius: {
        sm:   '6px',
        md:   '10px',
        lg:   '14px',
        xl:   '20px',
        full: '9999px',
      },

      // ─── Shadows ─────────────────────────────────────────────
      boxShadow: {
        none:  'none',
        sm:    '0 1px 3px rgba(0,0,0,0.08)',
        md:    '0 4px 12px rgba(0,0,0,0.10)',
        focus: '0 0 0 3px rgba(0,119,204,0.25)',
      },

      // ─── Animation ───────────────────────────────────────────
      transitionDuration: {
        fast:   '100ms',
        normal: '200ms',
        screen: '280ms',
        sheet:  '320ms',
        skeleton: '1400ms',
      },
      transitionTimingFunction: {
        'ease-spring': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },

      // ─── Component sizing ────────────────────────────────────
      height: {
        'btn-mobile':  '52px',
        'btn-desktop': '44px',
        'input-mobile':  '52px',
        'input-desktop': '44px',
        'touch-min': '44px',
        'avatar-sm': '28px',
        'avatar-md': '44px',
        'avatar-lg': '80px',
        'tab-bar':   '56px',
        'sheet-handle': '4px',
      },
      width: {
        'avatar-sm': '28px',
        'avatar-md': '44px',
        'avatar-lg': '80px',
        'sidebar':   '240px',
        'sidebar-collapsed': '64px',
        'sheet-handle': '32px',
      },
      minWidth: {
        'touch': '44px',
      },
      minHeight: {
        'touch': '44px',
      },
    },
  },
  plugins: [],
}

export default config
