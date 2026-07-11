export function showConfirm(message: string, title: string = 'Konfirmasi'): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(false);
      return;
    }

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      backgroundColor: 'rgba(15, 23, 42, 0.4)',
      backdropFilter: 'blur(4px)',
      zIndex: '100000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: '0',
      transition: 'opacity 0.2s ease',
    });

    const modal = document.createElement('div');
    Object.assign(modal.style, {
      backgroundColor: '#fff',
      borderRadius: '16px',
      padding: '24px',
      width: '90%',
      maxWidth: '400px',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      transform: 'scale(0.95)',
      transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      fontFamily: "'Outfit', sans-serif",
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '8px',
    });

    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.textContent = 'warning';
    Object.assign(icon.style, {
      color: '#ef4444',
      fontSize: '24px',
      fontVariationSettings: "'FILL' 1",
    });

    const titleEl = document.createElement('h3');
    titleEl.textContent = title;
    Object.assign(titleEl.style, {
      margin: '0',
      fontSize: '18px',
      fontWeight: '600',
      color: '#0f172a',
    });

    header.appendChild(icon);
    header.appendChild(titleEl);

    const messageEl = document.createElement('p');
    messageEl.textContent = message;
    Object.assign(messageEl.style, {
      margin: '0 0 24px 0',
      fontSize: '14px',
      color: '#475569',
      lineHeight: '1.5',
    });

    const btnContainer = document.createElement('div');
    Object.assign(btnContainer.style, {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '12px',
    });

    const createBtn = (text: string, isPrimary: boolean) => {
      const btn = document.createElement('button');
      btn.textContent = text;
      Object.assign(btn.style, {
        padding: '10px 18px',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        border: 'none',
        transition: 'all 0.2s',
        backgroundColor: isPrimary ? '#ef4444' : '#f1f5f9',
        color: isPrimary ? '#fff' : '#475569',
      });
      btn.onmouseenter = () => {
        btn.style.backgroundColor = isPrimary ? '#dc2626' : '#e2e8f0';
      };
      btn.onmouseleave = () => {
        btn.style.backgroundColor = isPrimary ? '#ef4444' : '#f1f5f9';
      };
      return btn;
    };

    const cancelBtn = createBtn('Batal', false);
    const confirmBtn = createBtn('Ya, Lanjutkan', true);

    const cleanup = (result: boolean) => {
      overlay.style.opacity = '0';
      modal.style.transform = 'scale(0.95)';
      setTimeout(() => {
        overlay.remove();
        resolve(result);
      }, 200);
    };

    cancelBtn.onclick = () => cleanup(false);
    confirmBtn.onclick = () => cleanup(true);

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(confirmBtn);

    modal.appendChild(header);
    modal.appendChild(messageEl);
    modal.appendChild(btnContainer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Trigger animations
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      modal.style.transform = 'scale(1)';
    });
  });
}
