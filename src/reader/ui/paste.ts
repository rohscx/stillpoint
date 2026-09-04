export interface PastePanelMessage {
  title: string;
  body: string;
}

export class PastePanel {
  readonly element: HTMLFormElement;
  readonly textarea: HTMLTextAreaElement;
  readonly #title: HTMLHeadingElement;
  readonly #message: HTMLParagraphElement;

  constructor(
    documentRoot: Document,
    onSubmit: (text: string) => void,
    onClose: () => void,
    message?: PastePanelMessage,
  ) {
    this.element = documentRoot.createElement('form');
    this.element.className = 'sp-paste';

    this.#title = documentRoot.createElement('h2');
    this.#title.className = 'sp-panel-title';
    this.#title.hidden = true;
    this.#message = documentRoot.createElement('p');
    this.#message.className = 'sp-panel-message';
    this.#message.hidden = true;
    if (message !== undefined) this.setMessage(message);

    const warning = documentRoot.createElement('p');
    warning.className = 'sp-panel-message sp-paste-warning';
    warning.textContent = 'This page can read text pasted here. Do not paste sensitive information on a page you do not trust.';
    warning.id = 'sp-paste-warning';
    this.textarea = documentRoot.createElement('textarea');
    this.textarea.className = 'sp-paste-textarea';
    this.textarea.setAttribute('aria-describedby', warning.id);
    this.textarea.rows = 10;
    this.textarea.required = true;
    this.textarea.placeholder = 'Paste text to read';
    this.textarea.setAttribute('aria-label', 'Text to read');
    const actions = documentRoot.createElement('div');
    actions.className = 'sp-paste-actions';
    const submit = documentRoot.createElement('button');
    submit.className = 'sp-button';
    submit.type = 'submit';
    submit.textContent = 'Start reading';
    const close = documentRoot.createElement('button');
    close.className = 'sp-button';
    close.type = 'button';
    close.textContent = 'Close';
    close.addEventListener('click', onClose);
    actions.append(submit, close);
    this.element.append(this.#title, this.#message, warning, this.textarea, actions);

    this.element.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = this.textarea.value.trim();
      if (text !== '') onSubmit(text);
    });
  }

  setMessage(message: PastePanelMessage): void {
    this.#title.textContent = message.title;
    this.#message.textContent = message.body;
    this.#title.hidden = false;
    this.#message.hidden = false;
  }
}
