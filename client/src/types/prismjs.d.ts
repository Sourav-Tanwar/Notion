// Prism's per-component grammar files have no type declarations in @types/prismjs.
// They're loaded purely for their side effects (registering grammars on the
// Prism singleton), so a permissive ambient module is the right shape.
declare module 'prismjs/components/*';
