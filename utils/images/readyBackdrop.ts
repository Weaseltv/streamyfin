export type BackdropState = {
  visible: string | null;
  pending: string | null;
  failed: string[];
};

export function nextBackdrop(
  state: BackdropState,
  images: readonly string[],
): BackdropState {
  if (state.pending) return state;
  const start = Math.max(0, images.indexOf(state.visible ?? "") + 1);
  for (let offset = 0; offset < images.length; offset++) {
    const uri = images[(start + offset) % images.length];
    if (uri && uri !== state.visible && !state.failed.includes(uri))
      return { ...state, pending: uri };
  }
  return state;
}

export function finishBackdrop(
  state: BackdropState,
  uri: string,
  loaded: boolean,
): BackdropState {
  if (state.pending !== uri) return state;
  return loaded
    ? { ...state, visible: uri, pending: null }
    : { ...state, pending: null, failed: [...state.failed, uri] };
}
