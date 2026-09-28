// public/app.js
// Consulta /api/me e alterna entre a tela de login e a tela de usuario logado.

async function loadSession() {
  const statusEl = document.getElementById('status');
  const loggedOutEl = document.getElementById('logged-out');
  const loggedInEl = document.getElementById('logged-in');

  try {
    const response = await fetch('/api/me');
    const data = await response.json();

    if (data.authenticated) {
      document.getElementById('user-issuer').textContent = data.issuer || '-';
      document.getElementById('user-name').textContent = data.displayName || '-';
      document.getElementById('user-email').textContent = data.email || '-';
      loggedInEl.hidden = false;
      loggedOutEl.hidden = true;
    } else {
      loggedOutEl.hidden = false;
      loggedInEl.hidden = true;
    }

    statusEl.hidden = true;
  } catch (error) {
    statusEl.textContent = 'Erro ao verificar a sessao. Tente recarregar a pagina.';
  }
}

loadSession();
