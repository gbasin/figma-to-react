'use client';
import '../app/globals.css'; // Adjust path to your global CSS
import { ComponentType, Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function FigmaPreview() {
  const router = useRouter();
  const screenName = router.query.screen as string | undefined;
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [dim, setDim] = useState({ width: 400, height: 800 });
  const [screens, setScreens] = useState<string[]>([]);

  // Fetch available screens from API route
  useEffect(() => {
    fetch('/api/figma-screens')
      .then(r => r.json())
      .then(d => setScreens(d.screens || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!screenName) return;
    import(`@/components/figma/${screenName}`)
      .then(mod => {
        setComponent(() => mod.default || mod[screenName]);
        setDim(mod.figmaDimensions || { width: 400, height: 800 });
      })
      .catch(console.error);
  }, [screenName]);

  if (!screenName) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Figma Preview</h1>
        {screens.length === 0 ? (
          <p style={{ marginTop: '1rem', color: '#666' }}>
            No components yet. Run step 4 to generate components.
          </p>
        ) : (
          <ul style={{ marginTop: '1rem' }}>
            {screens.map(name => (
              <li key={name} style={{ marginBottom: '0.5rem' }}>
                <a href={`?screen=${name}`} style={{ color: '#2563eb' }}>{name}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (!Component) return <div>Loading {screenName}...</div>;

  return (
    <div
      data-figma-component={screenName}
      style={{ width: dim.width, height: dim.height, overflow: 'hidden' }}
    >
      <Suspense fallback={<div>Loading...</div>}>
        <Component />
      </Suspense>
    </div>
  );
}
