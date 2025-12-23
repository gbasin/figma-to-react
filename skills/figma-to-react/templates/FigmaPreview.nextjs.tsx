'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function FigmaPreview() {
  const params = useSearchParams();
  const screenName = params.get('screen');
  const [Component, setComponent] = useState<React.ComponentType | null>(null);
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
      <div className="p-8">
        <h1 className="text-2xl font-bold">Figma Preview</h1>
        {screens.length === 0 ? (
          <p className="mt-4 text-gray-600">No components yet. Run step 4 to generate components.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {screens.map(name => (
              <li key={name}>
                <a href={`?screen=${name}`} className="text-blue-600 hover:underline">{name}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (!Component) return <div>Loading {screenName}...</div>;

  return (
    <div data-figma-component={screenName}
         style={{ width: dim.width, height: dim.height, overflow: 'hidden' }}>
      <Suspense fallback={<div>Loading...</div>}>
        <Component />
      </Suspense>
    </div>
  );
}
