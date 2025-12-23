/**
 * Test fixture component that mimics MCP-generated output with size-full on root.
 * Used to verify that the preview wrapper correctly constrains the component.
 *
 * Expected behavior:
 * - Component has size-full (100% width/height) on root
 * - Preview wrapper should constrain it to exact Figma dimensions
 * - Screenshot should match wrapper dimensions exactly
 */
export function SizeFullTestComponent() {
  return (
    <div
      className="size-full bg-blue-500 flex items-center justify-center"
      data-testid="size-full-root"
    >
      <div className="text-white text-2xl font-bold">
        Test Component
      </div>
      {/* Add some content that would overflow if not clipped */}
      <div className="absolute -bottom-10 left-0 right-0 h-20 bg-red-500">
        This should be clipped by overflow:hidden
      </div>
    </div>
  );
}

export default SizeFullTestComponent;
