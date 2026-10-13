type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, string>;
  on?: { [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.class) element.className = props.class;
  if (props.text !== undefined) element.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) element.setAttribute(name, value);
  for (const [type, handler] of Object.entries(props.on ?? {})) {
    element.addEventListener(type, handler as EventListener);
  }
  append(element, children);
  return element;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, String(value));
  append(element, children);
  return element;
}

function append(parent: Element, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

/** Writes text only when it changed, which avoids needless layout work at 3 updates per second. */
export function setText(element: Element, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

export function setAttr(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}
