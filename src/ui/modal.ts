export interface ModalActions {
  label: string;
  variant?: "primary" | "ghost" | "danger";
  run: () => void | Promise<void>;
}

export interface ModalOpts {
  title: string;
  body: HTMLElement | string;
  actions?: ModalActions[];
  width?: number;
  onClose?: () => void;
}

export const showModal = (opts: ModalOpts): { close: () => void } => {
  const root = document.getElementById("modal-root")!;
  root.hidden = false;
  root.replaceChildren();

  const backdrop = document.createElement("div");
  backdrop.className = "modal-root__backdrop";
  root.appendChild(backdrop);

  const modal = document.createElement("div");
  modal.className = "modal";
  if (opts.width) modal.style.width = `${opts.width}px`;

  const header = document.createElement("div");
  header.className = "modal__header";
  const title = document.createElement("div");
  title.className = "modal__title";
  title.textContent = opts.title;
  const closeBtn = document.createElement("button");
  closeBtn.className = "modal__close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.innerHTML =
    '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  header.append(title, closeBtn);

  const body = document.createElement("div");
  body.className = "modal__body";
  if (typeof opts.body === "string") body.innerHTML = opts.body;
  else body.appendChild(opts.body);

  modal.append(header, body);

  if (opts.actions?.length) {
    const footer = document.createElement("div");
    footer.className = "modal__footer";
    for (const a of opts.actions) {
      const btn = document.createElement("button");
      btn.className =
        a.variant === "ghost" || a.variant === "danger"
          ? "ghost-btn"
          : "primary-btn";
      btn.textContent = a.label;
      btn.addEventListener("click", async () => {
        try {
          await a.run();
        } finally {
          close();
        }
      });
      footer.appendChild(btn);
    }
    modal.appendChild(footer);
  }

  root.appendChild(modal);

  const close = (): void => {
    root.hidden = true;
    root.replaceChildren();
    window.removeEventListener("keydown", onKey);
    opts.onClose?.();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };
  window.addEventListener("keydown", onKey);
  backdrop.addEventListener("click", close);
  closeBtn.addEventListener("click", close);

  return { close };
};

export const prompt = async (
  title: string,
  label: string,
  defaultValue = "",
  placeholder?: string,
): Promise<string | null> => {
  return new Promise<string | null>((resolve) => {
    const wrapper = document.createElement("div");
    const field = document.createElement("div");
    field.className = "modal__field";
    const lbl = document.createElement("label");
    lbl.className = "modal__label";
    lbl.textContent = label;
    const input = document.createElement("input");
    input.className = "modal__input";
    input.value = defaultValue;
    if (placeholder) input.placeholder = placeholder;
    field.append(lbl, input);
    wrapper.appendChild(field);

    let resolved = false;
    const submit = (val: string | null): void => {
      if (resolved) return;
      resolved = true;
      m.close();
      resolve(val);
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit(input.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        submit(null);
      }
    });

    const m = showModal({
      title,
      body: wrapper,
      actions: [
        { label: "Cancel", variant: "ghost", run: () => submit(null) },
        { label: "OK", variant: "primary", run: () => submit(input.value) },
      ],
      onClose: () => {
        if (!resolved) resolve(null);
      },
    });

    setTimeout(() => {
      input.focus();
      input.select();
    }, 30);
  });
};
