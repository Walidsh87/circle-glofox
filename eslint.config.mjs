import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

const eslintConfig = [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**'] },
  ...coreWebVitals,
  ...typescript,
  {
    // React Compiler rules newly enabled by eslint-plugin-react-hooks v6 (bundled
    // with eslint-config-next 16). They were not part of this project's prior lint
    // contract (eslint 8), and `purity` false-positives on async Server Components
    // (e.g. `Date.now()` during render). Off to preserve the pre-upgrade ruleset.
    rules: {
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]

export default eslintConfig
