import { useSearchParams } from 'react-router-dom';
import { SizeFullTestComponent } from './components/SizeFullTestComponent';

// Component registry - maps screen names to components
const components: Record<string, React.ComponentType> = {
  SizeFullTestComponent,
};

// Dimensions registry - maps screen names to Figma frame dimensions
const dimensions: Record<string, { width: number; height: number }> = {
  SizeFullTestComponent: { width: 393, height: 852 }, // Match fixture dimensions
};

function App() {
  const [searchParams] = useSearchParams();
  const screen = searchParams.get('screen');

  if (screen) {
    const Component = components[screen];
    const dim = dimensions[screen];

    if (!Component) {
      return (
        <div data-figma-component={screen}>
          <p>Component "{screen}" not found. Run the figma-to-react skill first.</p>
        </div>
      );
    }

    // Render with proper wrapper: explicit dimensions + overflow hidden
    return (
      <div
        data-figma-component={screen}
        style={{
          width: dim?.width,
          height: dim?.height,
          overflow: 'hidden',
          position: 'relative', // For absolute positioned children
        }}
      >
        <Component />
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Figma to React Test Project</h1>
      <p className="mt-4 text-gray-600">
        This project is used for E2E testing of the figma-to-react skill.
      </p>
    </div>
  );
}

export default App;
