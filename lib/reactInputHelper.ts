// Setting el.value directly on a React-controlled input, then dispatching a plain "input"
// event, often silently fails — React intercepts its own value setter, so the visible text
// reverts on the next render. This calls the native prototype setter first, which properly
// notifies React's change tracking, so components like VoiceInput/AiPolishButton/
// AnalyzePhotoButton can inject text into a field that auto-save now controls.
export function setReactControlledValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = Object.getPrototypeOf(element);
  const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (nativeSetter) {
    nativeSetter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
}
