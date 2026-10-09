// Setting el.value directly on a React-controlled input, then dispatching a plain "input"
// event, often silently fails — React intercepts its own value setter, so the visible text
// reverts on the next render. This calls the native prototype setter first, which properly
// notifies React's change tracking, so components like VoiceInput/AiPolishButton/
// AnalyzePhotoButton can inject text into a field that auto-save now controls.
//
// The Comments field is a contentEditable rich-text area, not an <input>/<textarea> - it has no
// .value at all. These AI tools only ever write plain text (a full rewrite, a transcript, an
// analysis result), never formatting, so writing it in replaces whatever formatting was there
// with plain text - the same way it would if the person had retyped the field by hand - and
// .textContent is used rather than .innerHTML so the written text can never be interpreted as
// markup, whatever characters it contains.
export function setReactControlledValue(element: HTMLElement, value: string) {
  if (element.isContentEditable) {
    element.textContent = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  const input = element as HTMLInputElement | HTMLTextAreaElement;
  const prototype = Object.getPrototypeOf(input);
  const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (nativeSetter) {
    nativeSetter.call(input, value);
  } else {
    input.value = value;
  }

  input.dispatchEvent(new Event("input", { bubbles: true }));
}

// The read-side counterpart: a contentEditable field has no .value, and AI tools that read the
// field's current text (to send as context, or to append to) want its plain text regardless of
// any bold/italic/bullet formatting applied - the same text a person would see if they selected
// it all and copied it out.
export function getFieldValue(element: HTMLElement): string {
  if (element.isContentEditable) return element.textContent || "";
  return (element as HTMLInputElement | HTMLTextAreaElement).value;
}
