import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

// Auto-discover all components in the figma directory
const modules = import.meta.glob<{
  default?: React.ComponentType;
  figmaDimensions?: { width: number; height: number };
}>('../components/figma/*.tsx');

// Build component name → loader map
const loaders: Record<string, () => Promise<any>> = {};
for (const [path, loader] of Object.entries(modules)) {
  const name = path.match(/\/([^/]+)\.tsx$/)?.[1] || path;
  loaders[name] = loader;
}

export function FigmaPreview() {
  const [params] = useSearchParams();
  const screenName = params.get('screen');
  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [dim, setDim] = useState({ width: 400, height: 800 });

  useEffect(() => {
    if (!screenName || !loaders[screenName]) return;
    loaders[screenName]().then(mod => {
      setComponent(() => mod.default || mod[screenName]);
      setDim(mod.figmaDimensions || { width: 400, height: 800 });
    });
  }, [screenName]);

  if (!screenName) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1>Figma Preview</h1>
        {Object.keys(loaders).length === 0 ? (
          <p>No components yet. Run step 4 to generate components.</p>
        ) : (
          <ul>
            {Object.keys(loaders).map(name => (
              <li key={name}><a href={`?screen=${name}`}>{name}</a></li>
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

export default FigmaPreview;
