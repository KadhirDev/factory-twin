// Without this file, PostCSS never runs Tailwind over index.css.
// The @tailwind directives are silently dropped — no styles emitted.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}