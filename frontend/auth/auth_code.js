let toastTimeout = null;


function togglePassword(buttonEl) {
    const container = buttonEl.closest('.containe_password');
    const input = container.querySelector('.form-input');
    const icon = buttonEl.querySelector('i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function openForgotPassword(event) {
    event.preventDefault();
    // Exemplo usando o seu popup global já existente:
    document.getElementById('popupTitle').innerText = 'Recuperar Senha';
    document.getElementById('popupMessage').innerText = 'Digite seu e-mail cadastrado para receber as instruções de recuperação.';
    document.getElementById('popup-root').classList.add('active');
}

function switchTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabLoginBtn = document.getElementById('tabLoginBtn');
    const tabRegisterBtn = document.getElementById('tabRegisterBtn');
    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');

    if (tab === 'login') {
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
        tabLoginBtn.classList.add('active');
        tabRegisterBtn.classList.remove('active');
        authTitle.textContent = 'Acessar Sistema';
        authSubtitle.textContent = 'Entre com suas credenciais para continuar';
    } else {
        registerForm.classList.add('active');
        loginForm.classList.remove('active');
        tabRegisterBtn.classList.add('active');
        tabLoginBtn.classList.remove('active');
        authTitle.textContent = 'Criar Nova Conta';
        authSubtitle.textContent = 'Preencha os campos abaixo para se registrar';
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');

    toast.className = '';
    toast.classList.add(type);
    toastMessage.textContent = message;

    if (type === 'success') toastIcon.textContent = '✅';
    else if (type === 'error') toastIcon.textContent = '❌';
    else if (type === 'warning') toastIcon.textContent = '⚠️';
    else toastIcon.textContent = 'ℹ️';

    toast.classList.add('show');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        hideToast();
    }, 4000);
}

function hideToast() {
    const toast = document.getElementById('toast');
    toast.classList.remove('show');
}

function showPopup(title, message, btnText = 'Fechar', callback = null) {
    const popupRoot = document.getElementById('popup-root');
    const popupTitle = document.getElementById('popupTitle');
    const popupMessage = document.getElementById('popupMessage');
    const popupActions = document.getElementById('popupActions');

    popupTitle.textContent = title;
    popupMessage.textContent = message;

    popupActions.innerHTML = `<button class="btn-popup success" id="popupActionBtn">${btnText}</button>`;
    
    document.getElementById('popupActionBtn').onclick = () => {
        closePopup();
        if (callback) callback();
    };

    popupRoot.classList.add('active');
}

function closePopup() {
    document.getElementById('popup-root').classList.remove('active');
}

function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showToast('Preencha todos os campos de login.', 'warning');
        return;
    }

    // Simulação de login com sucesso
    showToast('Login efetuado com sucesso!', 'success');
    setTimeout(() => {
        showPopup('Bem-vindo!', `Usuário autenticado com sucesso (${email}). Redirecionando...`, 'Continuar');
    }, 600);
}

function handleRegister(event) {
    event.preventDefault();
    const user = document.getElementById('regUser').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;

    if (!user || !email || !password || !confirmPassword) {
        showToast('Preencha todos os campos do cadastro.', 'warning');
        return;
    }

    if (password.length < 6) {
        showToast('A senha deve ter pelo menos 6 caracteres.', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showToast('As senhas não coincidem.', 'error');
        return;
    }

    // Simulação de cadastro com sucesso
    showToast('Conta cadastrada com sucesso!', 'success');
    setTimeout(() => {
        showPopup('Cadastro Concluído', `Sua conta foi criada com sucesso, ${user}! Faça login para continuar.`, 'Ir para Login', () => {
            switchTab('login');
            document.getElementById('loginEmail').value = email;
        });
    }, 600);
}