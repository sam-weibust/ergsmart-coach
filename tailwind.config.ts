import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // --border / --input are literal complete color values (rgba(...)),
        // used bare — see src/styles/design-tokens.css and src/index.css.
        border: "var(--border)",
        input: "var(--input)",
        ring: "rgb(var(--ring) / <alpha-value>)",
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--muted) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        // shadcn's own "accent": the subtle hover/active/selected *surface*
        // that Select/DropdownMenu/Command paint on focus — not the brand
        // color (that's `primary`, above). Points straight at surface-3,
        // which the design system already defines for this purpose.
        accent: {
          DEFAULT: "rgb(var(--surface-3) / <alpha-value>)",
          foreground: "rgb(var(--foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "rgb(var(--popover) / <alpha-value>)",
          foreground: "rgb(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "rgb(var(--card) / <alpha-value>)",
          foreground: "rgb(var(--card-foreground) / <alpha-value>)",
        },
        success: {
          DEFAULT: "rgb(var(--success) / <alpha-value>)",
          foreground: "rgb(var(--success-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "rgb(var(--warning) / <alpha-value>)",
          foreground: "rgb(var(--warning-foreground) / <alpha-value>)",
        },
        sidebar: {
          DEFAULT: "rgb(var(--sidebar-background) / <alpha-value>)",
          foreground: "rgb(var(--sidebar-foreground) / <alpha-value>)",
          primary: "rgb(var(--sidebar-primary) / <alpha-value>)",
          "primary-foreground": "rgb(var(--sidebar-primary-foreground) / <alpha-value>)",
          accent: "rgb(var(--sidebar-accent) / <alpha-value>)",
          "accent-foreground": "rgb(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "var(--sidebar-border)",
          ring: "rgb(var(--sidebar-ring) / <alpha-value>)",
        },
        // Direct design-system tokens (src/styles/design-tokens.css), for the
        // redesigned screens: bg-surface-1/2/3, text-subtle, bg-danger-subtle.
        surface: {
          1: "rgb(var(--surface-1) / <alpha-value>)",
          2: "rgb(var(--surface-2) / <alpha-value>)",
          3: "rgb(var(--surface-3) / <alpha-value>)",
        },
        subtle: "rgb(var(--text-tertiary) / <alpha-value>)",
        "border-strong": "var(--border-strong)",
        "danger-subtle": "var(--danger-subtle)",
      },
      fontFamily: {
        sans: ["Space Grotesk", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      // Type scale from src/styles/design-tokens.css. Overrides xs–3xl only
      // (inside `extend`), so Tailwind's larger defaults (4xl, 5xl, ...) stay
      // available for src/pages/LandingPage.tsx's own hero type, which this
      // redesign does not touch.
      fontSize: {
        xs: ["11px", { lineHeight: "1.4", letterSpacing: "0.06em", fontWeight: "500" }],
        sm: ["13px", { lineHeight: "1.5", fontWeight: "400" }],
        base: ["15px", { lineHeight: "1.6", fontWeight: "400" }],
        lg: ["17px", { lineHeight: "1.5", fontWeight: "500" }],
        xl: ["20px", { lineHeight: "1.3", fontWeight: "600" }],
        "2xl": ["24px", { lineHeight: "1.2", fontWeight: "700" }],
        "3xl": ["32px", { lineHeight: "1.1", fontWeight: "700" }],
        display: ["48px", { lineHeight: "1", fontWeight: "700" }],
      },
      backgroundImage: {
        'gradient-primary': 'var(--gradient-primary)',
        'gradient-hero': 'var(--gradient-hero)',
      },
      boxShadow: {
        // Design system elevation tokens — see src/index.css.
        'raised': 'var(--shadow-raised)',
        'floating': 'var(--shadow-floating)',
        'overlay': 'var(--shadow-overlay)',
        'glow': 'var(--shadow-glow)',
      },
      transitionTimingFunction: {
        'smooth': 'var(--transition-smooth)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
      },
      // Explicit radius scale from design-tokens.css (4/6/8/12px). Set
      // directly rather than derived by calc() from a single --radius, since
      // the derived shadcn ladder (radius, radius-2px, radius-4px) doesn't
      // land on these exact steps.
      borderRadius: {
        DEFAULT: "var(--radius-md)",
        xl: "var(--radius-xl)",
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
      },
      // Spacing: not overridden. Tailwind's default rem-based scale already
      // lands on the design system's 4px-multiple steps (1=4px, 2=8px,
      // 3=12px, 4=16px, 6=24px, 8=32px, 12=48px, 16=64px at the default root
      // size) while still scaling with a user's font-size preference, which
      // fixed px values would not.
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
