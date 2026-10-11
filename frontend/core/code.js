const sidebar = document.getElementById('sidebar');
const toggleSidebar = document.getElementById('toggleSidebar');
const toast = document.getElementById('toast');
let toastTimer;

toggleSidebar.addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('collapsed');
    sidebar.classList.toggle('expanded', !collapsed);
    toggleSidebar.innerHTML = collapsed ? '<i class="fa-solid fa-bars"></i>' : '<i class="fa-solid fa-angles-left"></i>';
    toggleSidebar.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu');
});

document.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('[data-view]').forEach(item => {
            item.classList.toggle('active', item === button);
            if (item === button) item.setAttribute('aria-current', 'page');
            else item.removeAttribute('aria-current');
        });
        document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `view-${button.dataset.view}`));
    });
});

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

document.querySelectorAll('[data-demo-action]').forEach(button => {
    button.addEventListener('click', () => showToast('Esta ação será conectada ao backend nas próximas etapas.'));
});
document.getElementById('inviteButton').addEventListener('click', () => showToast('O convite será implementado com a API da equipe.'));
document.getElementById('membersButton').addEventListener('click', () => showToast('Aqui será exibida a lista real de integrantes.'));
document.getElementById('teamButton').addEventListener('click', () => showToast('Seletor de equipe — disponível quando o backend estiver integrado.'));