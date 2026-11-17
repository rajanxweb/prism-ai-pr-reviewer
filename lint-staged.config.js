export default {
  '*.{ts,tsx,js,jsx}': ['eslint --fix', 'prettier --write'],
  '*.{json,md,yml,yaml,html,css}': ['prettier --write'],
  '*.{ts,tsx}': () => 'npm run typecheck',
};
