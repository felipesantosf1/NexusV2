const supabaseClient = window.supabaseClient;

function obterDestinoCore() {
    const destino = new URL("../core/index.html", window.location.href);
    const tokenConvite = new URLSearchParams(window.location.search)
        .get("invite");

    if (tokenConvite) {
        destino.searchParams.set("invite", tokenConvite);
    }

    return destino.href;
}

let alertaTimeouts = {};

// MOSTRAR OU OCULTAR SENHA
function togglePassword(button) {
    const container = button.closest(".containe_password");
    const input = container.querySelector(".form-input");
    const icon = button.querySelector("i");

    input.type = input.type === "password" ? "text" : "password";
    icon.classList.toggle("fa-eye");
    icon.classList.toggle("fa-eye-slash");
}

// ALTERNAR ENTRE LOGIN, CADASTRO E REDEFINIÇÃO
function switchTab(tab) {
    const forms = {
        login: document.getElementById("loginForm"),
        register: document.getElementById("registerForm"),
        reset: document.getElementById("resetForm")
    };

    Object.entries(forms).forEach(([nome, form]) => {
        form.classList.toggle("active", nome === tab);
        limparAlerta(nome); // Limpa mensagens ao trocar de aba
    });

    document.getElementById("authTabs").hidden = tab === "reset";

    document.getElementById("tabLoginBtn").classList.toggle("active", tab === "login");
    document.getElementById("tabRegisterBtn").classList.toggle("active", tab === "register");

    const textos = {
        login: ["Acessar Nexus", "Entre com seu e-mail e senha."],
        register: ["Criar conta", "Cadastre-se para acessar o projeto."],
        reset: ["Redefinir senha", "Escolha uma nova senha para sua conta."]
    };

    document.getElementById("authTitle").textContent = textos[tab][0];
    document.getElementById("authSubtitle").textContent = textos[tab][1];
}

// GERENCIAMENTO DE ALERTAS EMBUTIDOS (Substitui o Toast/Popup)
function mostrarAlerta(formId, mensagem, tipo = "error", duracao = 0) {
    const alertBox = document.getElementById(`${formId}Alert`);
    const alertText = document.getElementById(`${formId}AlertText`);
    const alertIcon = document.getElementById(`${formId}AlertIcon`);

    if (!alertBox || !alertText || !alertIcon) return;

    alertText.textContent = mensagem;
    alertBox.className = `form-alert ${tipo}`;
    
    if (tipo === "success") {
        alertIcon.className = "fa-solid fa-circle-check";
    } else if (tipo === "warning") {
        alertIcon.className = "fa-solid fa-triangle-exclamation";
    } else {
        alertIcon.className = "fa-solid fa-circle-exclamation";
    }

    alertBox.style.display = "flex";

    // Limpa temporizador anterior se houver
    if (alertaTimeouts[formId]) {
        clearTimeout(alertaTimeouts[formId]);
    }

    // Se passou uma duração (em milissegundos), faz sumir sozinho
    if (duracao > 0) {
        alertaTimeouts[formId] = setTimeout(() => {
            limparAlerta(formId);
        }, duracao);
    }
}

function limparAlerta(formId) {
    const alertBox = document.getElementById(`${formId}Alert`);
    if (alertBox) {
        alertBox.style.display = "none";
    }
}

// MENSAGENS DE ERRO CLARAS
function mensagemErroAuth(error) {
    const mensagem = (error.message || "").toLowerCase();

    if (mensagem.includes("invalid login credentials")) {
        return "E-mail ou senha incorretos.";
    }
    if (mensagem.includes("email not confirmed")) {
        return "Confirme seu e-mail antes de entrar.";
    }
    if (mensagem.includes("user already registered")) {
        return "Este e-mail já está cadastrado.";
    }

    return error.message || "Não foi possível concluir a operação.";
}

// LOGIN REAL
async function handleLogin(event) {
    event.preventDefault();
    limparAlerta("login");

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const botao = event.submitter;

    botao.disabled = true;

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        if (!data.session) throw new Error("Não foi possível iniciar a sessão.");

        window.location.replace(obterDestinoCore());

    } catch (error) {
        mostrarAlerta("login", mensagemErroAuth(error), "error");
        botao.disabled = false;
    }
}

// CADASTRO REAL
async function handleRegister(event) {
    event.preventDefault();
    limparAlerta("register");

    const nome = document.getElementById("regUser").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value;
    const confirmacao = document.getElementById("regConfirmPassword").value;

    if (!nome) {
        mostrarAlerta("register", "Informe seu nome de usuário.", "warning", 5000);
        return;
    }

    if (password.length < 8) {
        mostrarAlerta("register", "Use uma senha com pelo menos 8 caracteres.", "warning", 5000);
        return;
    }

    if (password !== confirmacao) {
        mostrarAlerta("register", "As senhas não coincidem.", "error");
        return;
    }

    const botao = event.submitter;
    botao.disabled = true;

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: { username: nome },
                emailRedirectTo: (() => {
                    const destino = new URL("auth_index.html", window.location.href);
                    const tokenConvite = new URLSearchParams(window.location.search)
                        .get("invite");

                    if (tokenConvite) {
                        destino.searchParams.set("invite", tokenConvite);
                    }

                    return destino.href;
                })()
            }
        });

        if (error) throw error;

        if (data.session) {
            window.location.replace(obterDestinoCore());
            return;
        }

        mostrarAlerta(
            "register",
            "Cadastro realizado! Confira seu e-mail para confirmar a conta.",
            "success", 5000
        );

        document.getElementById("loginEmail").value = email;
        setTimeout(() => switchTab("login"), 3000);

    } catch (error) {
        mostrarAlerta("register", mensagemErroAuth(error), "error");
        botao.disabled = false;
    }
}

// RECUPERAÇÃO DE SENHA
async function openForgotPassword(event) {
    event.preventDefault();
    limparAlerta("login");

    const email = document.getElementById("loginEmail").value.trim();

    if (!email) {
        mostrarAlerta("login", "Informe seu e-mail no campo de login primeiro.", "warning", 5000);
        return;
    }

    const redirectTo = `${window.location.origin}${window.location.pathname}?redefinir=1`;

    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;

        mostrarAlerta(
            "login",
            "Instruções enviadas! Verifique sua caixa de entrada.",
            "success", 5000
        );

    } catch (error) {
        mostrarAlerta("login", mensagemErroAuth(error), "error");
    }
}

// SALVAR A NOVA SENHA
async function handleUpdatePassword(event) {
    event.preventDefault();
    limparAlerta("reset");

    const password = document.getElementById("newPassword").value;
    const confirmacao = document.getElementById("confirmNewPassword").value;

    if (password.length < 8) {
        mostrarAlerta("reset", "Use pelo menos 8 caracteres.", "warning" , 5000);
        return;
    }

    if (password !== confirmacao) {
        mostrarAlerta("reset", "As senhas não coincidem.", "error");
        return;
    }

    const botao = event.submitter;
    botao.disabled = true;

    try {
        const { data: sessionData } = await supabaseClient.auth.getSession();

        if (!sessionData.session) {
            throw new Error("O link expirou. Solicite uma nova recuperação de senha.");
        }

        const { error } = await supabaseClient.auth.updateUser({ password });
        if (error) throw error;

        await supabaseClient.auth.signOut();
        history.replaceState(null, "", window.location.pathname);
        document.getElementById("resetForm").reset();

        mostrarAlerta("login", "Senha alterada com sucesso. Entre novamente.", "success" , 5000);
        switchTab("login");

    } catch (error) {
        mostrarAlerta("reset", mensagemErroAuth(error), "error");
        botao.disabled = false;
    }
}

// VERIFICAR SESSÃO AO ABRIR A PÁGINA
async function iniciarAutenticacao() {
    const redefinindoSenha = new URLSearchParams(window.location.search).get("redefinir") === "1";

    if (redefinindoSenha) {
        switchTab("reset");
        return;
    }

    const { data, error } = await supabaseClient.auth.getSession();

    if (!error && data.session) {
        window.location.replace(obterDestinoCore());
    }
}

document.addEventListener("DOMContentLoaded", iniciarAutenticacao);



mostrarAlerta