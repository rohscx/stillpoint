export class ErrorPanel {
  readonly element: HTMLElement;

  constructor(documentRoot: Document, onClose: () => void) {
    this.element = documentRoot.createElement('section');
    this.element.className = 'sp-error';
    this.element.setAttribute('role', 'status');

    const title = documentRoot.createElement('h2');
    title.className = 'sp-panel-title';
    title.textContent = 'Stillpoint could not start';
    const message = documentRoot.createElement('p');
    message.className = 'sp-panel-message';
    message.textContent = 'Close the reader and try again.';
    const close = documentRoot.createElement('button');
    close.type = 'button';
    close.className = 'sp-button';
    close.textContent = 'Close';
    close.addEventListener('click', onClose);
    this.element.append(title, message, close);
  }
}
