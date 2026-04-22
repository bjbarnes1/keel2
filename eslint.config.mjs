/**
 * ESLint flat config for Next.js 16 (core-web-vitals + TypeScript presets).
 *
 * @module eslint.config
 */

import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "generated/**",
      "node_modules/**",
      "coverage/**",
    ],
  },
];

export default eslintConfig;
