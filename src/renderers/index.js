export const renderers = new Map();

// A graphics mode only needs resize(width,height,dpr), render(game,view), dispose().
// The simulation and input never depend on a particular drawing technology.
export function registerRenderer(Renderer) {
  if (!Renderer.id || !Renderer.label)
    throw new Error("A renderer needs an id and label");
  renderers.set(Renderer.id, Renderer);
}

export function createRenderer(id, canvas) {
  const Renderer = renderers.get(id);
  if (!Renderer) throw new Error(`Unknown graphics mode: ${id}`);
  return new Renderer(canvas);
}
