import { useEffect, useState } from 'react';

/**
 * Lazy Prism wrapper. The Prism core + language grammars are loaded only
 * when this component is first mounted, so they're not in the main bundle.
 * Languages are imported on-demand based on the `lang` prop.
 */

const langLoaders: Record<string, () => Promise<unknown>> = {
  javascript: () => import('prismjs/components/prism-javascript'),
  typescript: () => import('prismjs/components/prism-typescript'),
  jsx: () => import('prismjs/components/prism-jsx'),
  tsx: () => import('prismjs/components/prism-tsx'),
  json: () => import('prismjs/components/prism-json'),
  bash: () => import('prismjs/components/prism-bash'),
  css: () => import('prismjs/components/prism-css'),
  python: () => import('prismjs/components/prism-python'),
  sql: () => import('prismjs/components/prism-sql'),
};

interface Props {
  code: string;
  lang: string;
}

export function PrismHighlighter({ code, lang }: Props): JSX.Element {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const Prism = (await import('prismjs')).default;
      await import('prismjs/themes/prism-tomorrow.css' as string).catch(() => null);
      const loader = langLoaders[lang];
      if (loader) await loader();
      if (cancelled) return;
      const grammar = Prism.languages[lang] ?? Prism.languages.markup;
      setHtml(Prism.highlight(code, grammar, lang));
    })();
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  if (html === null) {
    return <pre className="m-0 whitespace-pre-wrap break-words">{code}</pre>;
  }
  return (
    <pre className="m-0 whitespace-pre-wrap break-words">
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}
