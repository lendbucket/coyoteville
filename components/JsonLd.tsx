/**
 * Renders JSON-LD into the server rendered HTML so crawlers get it without
 * running any JavaScript. Angle brackets are escaped so a stray value can
 * never close the script tag early.
 */
export default function JsonLd({ schemas }: { schemas: Record<string, unknown>[] }) {
  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema).replace(/</g, '\\u003c'),
          }}
        />
      ))}
    </>
  );
}
